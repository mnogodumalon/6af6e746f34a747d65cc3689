import { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { toast } from 'sonner';
import { IconRefresh, IconHistory, IconLoader, IconChevronDown, IconCheck, IconClock, IconArrowBackUp, IconSparkles, IconMessageCircle, IconGitBranch, IconArrowLeft, IconFlask } from '@tabler/icons-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { t, localeTag } from '@/i18n';

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
const UPDATE_ENDPOINT = '/claude/build/update';
const DEPLOYMENTS_ENDPOINT = `/claude/build/deployments/${APPGROUP_ID}`;
const ROLLBACK_ENDPOINT = '/claude/build/rollback';
const VERSION_ENDPOINT = '/claude/version';
const AGENT_STATE_ENDPOINT = `/claude/build/agent-state/${APPGROUP_ID}`;

// Fremd-Build-Beobachtung (Editor-Save, Weiche, coalescte Nachbauten):
// eng pollen solange ein Build läuft, sonst selten — der Endpoint ist billig,
// aber ein stilles Dashboard braucht keine Frequenz.
const BUILD_ACTIVE_POLL_MS = 5000;
const BUILD_IDLE_POLL_MS = 45000;
const BUILD_ERROR_POLL_MS = 60000;

// Poll cadence after a deploy receipt: wait for S3 version.json to reflect
// the expected codebase SHA before reloading. 30 s ceiling to avoid hanging
// the UI indefinitely on CDN propagation glitches.
const VERIFY_POLL_INTERVAL_MS = 1500;
const VERIFY_POLL_TIMEOUT_MS = 30000;

function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function formatTimestamp(ts: string): string {
  // "20260411_070729" → "11.04.2026, 07:07"
  if (ts.length < 15) return ts;
  const y = ts.slice(0, 4), m = ts.slice(4, 6), d = ts.slice(6, 8);
  const h = ts.slice(9, 11), min = ts.slice(11, 13);
  return `${d}.${m}.${y}, ${h}:${min}`;
}

function formatDeployedAt(iso: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(localeTag(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso.slice(0, 16); }
}

interface Deployment {
  sha: string;       // git SHA (empty string for some legacy attic entries)
  branch: string;    // git branch name ("main" or "branch-{TS}")
  source: string;    // initial | update | agent
  version: string;   // service version at deploy time (e.g. "0.0.102")
  deployed_at: string;  // ISO datetime
  is_live: boolean;
  timestamp?: string;  // legacy attic timestamp (only present for attic-source deployments)
}

interface DeployedVersion {
  schema?: number;
  version?: string;
  commit?: string;
  codebase?: string;
  deployed_at?: string;
  source?: string;
  metadata_fingerprint?: string;
}

type Status = 'idle' | 'loading' | 'updating' | 'verifying' | 'rolling_back' | 'busy' | 'error';

function rollbackId(d: Deployment): string {
  // Prefer sha; fall back to legacy timestamp for attic-only deployments
  return d.sha || d.timestamp || '';
}

function deploymentMeta(source: string | undefined): { icon: typeof IconArrowBackUp; colorClass: string; bgClass: string; label: string } {
  switch (source) {
    case 'initial':
      return { icon: IconSparkles, colorClass: 'text-blue-500', bgClass: 'bg-blue-500/5', label: t('vc_label_initial') };
    case 'update':
      return { icon: IconRefresh, colorClass: 'text-emerald-500', bgClass: 'bg-emerald-500/5', label: t('vc_label_update') };
    case 'agent':
      return { icon: IconMessageCircle, colorClass: 'text-violet-500', bgClass: 'bg-violet-500/5', label: t('vc_label_agent') };
    default:
      return { icon: IconArrowBackUp, colorClass: 'text-muted-foreground', bgClass: '', label: '' };
  }
}

async function fetchDeployedVersion(): Promise<DeployedVersion | null> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Poll version.json until the deployed codebase SHA matches the expected one,
// or a full match on version is seen (rollback case, where we have no receipt
// SHA in advance but a target version). Returns the observed version on success.
async function waitForVersion(
  predicate: (v: DeployedVersion) => boolean,
): Promise<DeployedVersion | null> {
  const deadline = Date.now() + VERIFY_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const v = await fetchDeployedVersion();
    if (v && predicate(v)) return v;
    await new Promise(r => setTimeout(r, VERIFY_POLL_INTERVAL_MS));
  }
  return null;
}

interface ConfirmProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
}

function ConfirmPrompt({ open, title, description, confirmLabel, onCancel, onConfirm, destructive }: ConfirmProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Dev/beta flags — shared with the assistant (<la-klar-assistant>): both read
// the same sources (localStorage 'developer-mode', 'channel' cookie). After
// each toggle, assistant:flags-changed tells the element to re-read the
// sources, so the switch applies without a reload.
function readChannelCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some(c => c === 'channel=beta');
}

function useAssistantFlags() {
  const [devMode, setDevModeState] = useState(() => {
    try { return localStorage.getItem('developer-mode') === 'true'; } catch { return false; }
  });
  const [betaMode, setBetaModeState] = useState(() => {
    try { return readChannelCookie(); } catch { return false; }
  });
  const setDevMode = useCallback((v: boolean) => {
    setDevModeState(v);
    try { localStorage.setItem('developer-mode', String(v)); } catch { /* private mode */ }
    window.dispatchEvent(new Event('assistant:flags-changed'));
  }, []);
  const setBetaMode = useCallback((v: boolean) => {
    setBetaModeState(v);
    const value = v ? 'beta' : 'stable';
    document.cookie = `channel=${value}; path=/; max-age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event('assistant:flags-changed'));
  }, []);
  return { devMode, setDevMode, betaMode, setBetaMode };
}

export function VersionCheck() {
  // Entwickler/Beta-Toggles leben im aufklappbaren Versions-Panel statt in
  // der Nav — normale Nutzer brauchen sie nie, Entwickler suchen sie hier.
  const { devMode, setDevMode, betaMode, setBetaMode } = useAssistantFlags();
  const [status, setStatus] = useState<Status>('loading');
  const [deployedVersion, setDeployedVersion] = useState('');
  const [deployedCommit, setDeployedCommit] = useState('');
  const [deployedAt, setDeployedAt] = useState('');
  const [latestVersion, setLatestVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loadingDeployments, setLoadingDeployments] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [rollbackDialog, setRollbackDialog] = useState<Deployment | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  // Belegtes Schreib-Lease: der Update-Wunsch wurde serverseitig vorgemerkt
  // ([BUSY]-Event mit queued=true) und läuft automatisch nach dem Build.
  const [busyAgeMin, setBusyAgeMin] = useState(1);
  // Fremd-Build sichtbar machen: null = kein Build aktiv. Solange ein Build
  // läuft, ERSETZT die Build-Karte den Update-Button — ein Klick würde
  // ohnehin nur im Ein-Platz-Slot vorgemerkt.
  const [buildPct, setBuildPct] = useState<number | null>(null);
  const [buildKind, setBuildKind] = useState<string | null>(null);
  // Fehlerzustand nur für Builds, die WIR laufen sahen — ein uralter
  // failed-Stand in agent_states darf beim Seitenladen keine rote Karte
  // erzeugen. Verschwindet, sobald der nächste Build startet.
  const [buildFailed, setBuildFailed] = useState(false);

  // Karten-Text nach Auslöser des Builds: "Deine Änderungen …" stimmt nur
  // bei structure/prompt. Initial-Nachphasen und Versions-Updates bekommen
  // eigene Texte; unbekannt/fehlend (älterer Server) fällt auf den
  // NEUTRALEN Text zurück — der ist immer wahr, der persönliche nicht.
  const buildPillText =
    buildKind === 'structure' || buildKind === 'prompt' ? t('vc_build_pill')
    : buildKind === 'initial' ? t('vc_build_initial')
    : t('vc_build_update');

  const sawBuilding = useRef(false);
  const baselineRef = useRef<DeployedVersion | null>(null);
  const freshNotified = useRef(false);

  const applyDeployed = useCallback((d: DeployedVersion, latest: string) => {
    setDeployedVersion(d.version || '');
    setDeployedCommit(d.commit || '');
    setDeployedAt(d.deployed_at || '');
    const current = d.version || '';
    setUpdateAvailable(!!(current && latest && compareSemver(latest, current) > 0));
  }, []);

  const refreshDeployments = useCallback(async () => {
    try {
      const res = await fetch(DEPLOYMENTS_ENDPOINT, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setDeployments(data.deployments || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [deployedRes, serviceRes] = await Promise.all([
          fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' }),
          fetch(VERSION_ENDPOINT, { credentials: 'include' }),
        ]);
        if (cancelled) return;
        if (!deployedRes.ok || !serviceRes.ok) { setStatus('idle'); return; }
        const deployed: DeployedVersion = await deployedRes.json();
        const service = await serviceRes.json();
        setLatestVersion(service.version || '');
        applyDeployed(deployed, service.version || '');
        // Baseline für die Frisch-Deploy-Erkennung: der Stand, mit dem DIESE
        // Seite geladen wurde.
        baselineRef.current = deployed;
        setStatus('idle');
      } catch { setStatus('idle'); }
    })();
    return () => { cancelled = true; };
  }, [applyDeployed]);

  // Fremd-Builds beobachten (Editor-Save, Weiche, vorgemerkte Nachbauten):
  // Build-Karte solange agent-state build_status=building meldet, danach —
  // wenn version.json einen NEUEN codebase trägt — persistenter Toast mit
  // „Neu laden". Auto-Reload NUR bei unsichtbarem Tab ohne offenen Dialog:
  // niemandem wird die Seite unterm Formular weggezogen. Fail-silent: jeder
  // Fetch-Fehler blendet die Karte aus und pollt langsamer.
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let timer: number | undefined;

    function notifyFresh(structureChanged: boolean) {
      const dialogOpen = !!document.querySelector('[role="dialog"]');
      if (document.hidden && !dialogOpen) {
        window.location.reload();
        return;
      }
      // toast.custom statt toast(): der Standard-Sonner-Look passt nicht zum
      // Dashboard — die Karte hier nutzt dieselben Tokens wie der Rest.
      toast.custom((toastId) => (
        <div className="w-[356px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-card text-card-foreground shadow-lg p-4 flex items-start gap-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            <IconCheck size={18} stroke={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold leading-snug">{t('vc_updated_toast')}</p>
            {structureChanged && (
              <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{t('vc_updated_toast_desc')}</p>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={() => window.location.reload()}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t('vc_updated_reload')}
              </button>
              <button
                onClick={() => toast.dismiss(toastId)}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary transition-colors"
              >
                {t('vc_updated_later')}
              </button>
            </div>
          </div>
        </div>
      ), { duration: Infinity });
    }

    async function tick() {
      if (cancelled || running) return;
      running = true;
      let next = BUILD_IDLE_POLL_MS;
      try {
        const res = await fetch(AGENT_STATE_ENDPOINT, { credentials: 'include', cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const state: { build_status?: string | null; build_pct?: number | null; build_kind?: string | null } = await res.json();
        if (state.build_status === 'building') {
          sawBuilding.current = true;
          setBuildKind(state.build_kind ?? null);
          setBuildFailed(false);
          setBuildPct(typeof state.build_pct === 'number' ? state.build_pct : 0);
          next = BUILD_ACTIVE_POLL_MS;
        } else {
          setBuildPct(null);
          setBuildFailed(state.build_status === 'failed' && sawBuilding.current);
          if (!freshNotified.current && baselineRef.current?.codebase) {
            const now = await fetchDeployedVersion();
            if (now?.codebase && now.codebase !== baselineRef.current.codebase) {
              freshNotified.current = true;
              // Struktur-Hinweis nur bei ECHTEM Fingerprint-Wechsel: Alt-
              // Dashboards (legacy-backfill) tragen noch keinen Fingerprint —
              // undefined !== "…" wäre eine falsche Warnung.
              notifyFresh(
                !!baselineRef.current.metadata_fingerprint &&
                !!now.metadata_fingerprint &&
                now.metadata_fingerprint !== baselineRef.current.metadata_fingerprint,
              );
            }
          }
        }
      } catch {
        setBuildPct(null);
        next = BUILD_ERROR_POLL_MS;
      }
      running = false;
      if (!cancelled) timer = window.setTimeout(tick, next);
    }

    tick();
    // Beim Zurückkehren in den Tab sofort prüfen statt aufs Intervall zu warten.
    const onVisibility = () => {
      if (!document.hidden && !running) {
        window.clearTimeout(timer);
        void tick();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const loadDeployments = useCallback(async () => {
    if (deployments.length > 0) return;
    setLoadingDeployments(true);
    await refreshDeployments();
    setLoadingDeployments(false);
  }, [deployments.length, refreshDeployments]);

  const performUpdate = useCallback(async () => {
    setUpdateDialogOpen(false);
    setShowPanel(false);
    setStatus('updating');
    setStatusMessage('');
    try {
      const resp = await fetch(UPDATE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, fix_errors: true }),
      });
      if (!resp.ok || !resp.body) { setStatus('error'); return; }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receipt: { version?: string; codebase?: string } | null = null;
      let done = false;

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[UPDATED] ')) {
            try { receipt = JSON.parse(content.slice(10)); } catch { /* ignore */ }
          } else if (content.startsWith('[BUSY] ')) {
            // Ein Build läuft bereits — der Server hat das Update in den
            // Ein-Platz-Slot übernommen. Positiver Zustand, kein Fehler.
            let ageMin = 1;
            try {
              const info = JSON.parse(content.slice(7));
              ageMin = Math.max(1, Math.floor((info.age_seconds || 0) / 60));
            } catch { /* ignore */ }
            setBusyAgeMin(ageMin);
            setStatus('busy');
            try { reader.cancel(); } catch { /* ignore */ }
            return;
          } else if (content.startsWith('[DONE]')) {
            done = true;
            break;
          } else if (content.startsWith('[ERROR]')) {
            setStatus('error');
            return;
          }
        }
      }

      if (!receipt || !receipt.codebase || !receipt.version) {
        // No receipt → server didn't confirm a successful deploy; don't reload.
        setStatus('error');
        return;
      }

      // Verify: poll version.json until the expected codebase lands.
      setStatus('verifying');
      const expectedCodebase = receipt.codebase;
      const verified = await waitForVersion(v => v.codebase === expectedCodebase);
      if (!verified) {
        setStatusMessage(t('update_verify_timeout'));
        setStatus('error');
        return;
      }

      // Verified — hard reload so the browser actually loads the new bundle.
      // Updating React state alone keeps the old UI running in memory.
      window.location.reload();
    } catch { setStatus('error'); }
  }, []);

  const performRollback = useCallback(async (deployment: Deployment) => {
    setRollbackDialog(null);
    const rid = rollbackId(deployment);
    setRollbackTarget(rid);
    setStatus('rolling_back');
    setStatusMessage('');
    try {
      const body: Record<string, string> = { appgroup_id: APPGROUP_ID };
      if (deployment.sha) body.sha = deployment.sha;
      else if (deployment.timestamp) body.timestamp = deployment.timestamp;
      else { setStatus('error'); setRollbackTarget(null); return; }

      // Snapshot deployed_at BEFORE the rollback so we can detect that
      // version.json actually rotated (guards against legacy attic entries
      // that share the same VERSION as the current deployment).
      const beforeSnapshot = await fetchDeployedVersion();
      const beforeDeployedAt = beforeSnapshot?.deployed_at || '';

      const resp = await fetch(ROLLBACK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (resp.status === 409) {
        // Schreib-Lease belegt — Rollback ist ein harter Busy-Stopp (anders
        // als das Update, das serverseitig vorgemerkt wird).
        setStatusMessage(t('busy_build_running'));
        setStatus('error');
        setRollbackTarget(null);
        return;
      }
      if (!resp.ok) { setStatus('error'); setRollbackTarget(null); return; }

      // Verify in two dimensions:
      //   - deployed_at must have rotated (S3 actually got the new file)
      //   - sha must match (or for legacy attic: version must match)
      setStatus('verifying');
      const targetSha = deployment.sha || '';
      const targetVersion = deployment.version || '';
      const verified = await waitForVersion(v => {
        if ((v.deployed_at || '') === beforeDeployedAt) return false;
        if (targetSha) return v.codebase === targetSha;
        if (targetVersion) return v.version === targetVersion;
        return false;
      });

      if (!verified) {
        setStatusMessage(t('update_verify_timeout'));
        setStatus('error');
        setRollbackTarget(null);
        return;
      }

      // Verified — hard reload so the browser actually loads the rolled-back bundle.
      window.location.reload();
    } catch { setStatus('error'); setRollbackTarget(null); }
  }, []);

  if (status === 'loading') return null;

  if (status === 'updating' || status === 'verifying' || status === 'rolling_back') {
    const label = status === 'updating'
      ? t('updating')
      : status === 'verifying'
        ? t('update_verifying')
        : t('rolling_back');
    const Icon = status === 'rolling_back' ? IconHistory : IconRefresh;
    return (
      <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
        <Icon size={14} className="shrink-0 animate-spin [animation-direction:reverse]" />
        <span>{label}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Version button — toggles panel */}
      <button
        onClick={() => {
          const next = !showPanel;
          setShowPanel(next);
          if (next) loadDeployments();
        }}
        className="flex items-center justify-between gap-2 w-full px-2 py-2 text-left text-xs text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-sidebar-accent/30"
      >
        <span className="flex items-center gap-1.5">
          <IconClock size={13} className="shrink-0" />
          {deployedVersion ? `v${deployedVersion}` : '—'}
          {deployedCommit && <span className="text-muted-foreground/50">({deployedCommit})</span>}
        </span>
        <IconChevronDown size={13} className={`shrink-0 transition-transform ${showPanel ? 'rotate-180' : ''}`} />
      </button>

      {/* Build-Karte: ein Fremd-Build läuft — ersetzt den Update-Button,
          denn ein Update-Klick würde jetzt ohnehin nur vorgemerkt. */}
      {buildPct !== null && !showPanel && (
        <div className="mx-3 mt-1 px-3 py-2 w-[calc(100%-1.5rem)] rounded-lg text-xs font-medium text-[#2563eb] bg-secondary border border-[#bfdbfe]">
          <div className="flex items-center gap-2">
            <IconRefresh size={13} className="shrink-0 animate-spin [animation-direction:reverse] motion-reduce:animate-none" />
            <span className="flex-1 min-w-0">{buildPillText}</span>
          </div>
        </div>
      )}

      {/* Fehlerzustand: ein beobachteter Build ist gescheitert — die
          Änderung ist NICHT im Dashboard. Verschwindet mit dem nächsten
          Build-Start. */}
      {buildFailed && buildPct === null && !showPanel && (
        <div className="mx-3 mt-1 px-3 py-1.5 w-[calc(100%-1.5rem)] rounded-lg text-xs text-destructive bg-destructive/10">
          {t('vc_build_failed')}
        </div>
      )}

      {/* Update banner */}
      {updateAvailable && !showPanel && buildPct === null && (
        <button
          onClick={() => setUpdateDialogOpen(true)}
          className="flex items-center gap-2 mx-3 mt-1 px-3 py-1.5 w-[calc(100%-1.5rem)] rounded-lg text-xs font-medium text-[#2563eb] bg-secondary border border-[#bfdbfe] hover:bg-[#dbeafe] transition-colors"
        >
          <IconRefresh size={13} className="shrink-0" />
          <span>{t('update_available')} v{latestVersion}</span>
        </button>
      )}

      {/* Versions panel */}
      {showPanel && (() => {
        // Group deployments by branch
        const grouped = new Map<string, Deployment[]>();
        for (const d of deployments) {
          const key = d.branch || 'main';
          if (!grouped.has(key)) grouped.set(key, []);
          grouped.get(key)!.push(d);
        }
        const liveDep = deployments.find(d => d.is_live);
        const liveBranch = liveDep?.branch || 'main';
        const mainDeps = grouped.get('main') || [];
        const altKeys = [...grouped.keys()].filter(k => k !== 'main')
          .sort((a, b) => {
            const at = grouped.get(a)![0]?.deployed_at || '';
            const bt = grouped.get(b)![0]?.deployed_at || '';
            return bt.localeCompare(at);
          });
        const branchEntries = selectedBranch ? (grouped.get(selectedBranch) || []) : [];

        return (
        <div className="mx-3 mt-1 mb-2 rounded-xl border border-sidebar-border bg-sidebar overflow-hidden">
          {/* Build-Karte im Panel: läuft ein Build, ist sie das oberste
              Element und der Update-Button bleibt unterdrückt. */}
          {buildPct !== null && !selectedBranch && (
            <div className="w-full px-3 py-2 text-xs font-medium text-[#2563eb] bg-secondary/50 border-b border-sidebar-border">
              <div className="flex items-center gap-2">
                <IconRefresh size={13} className="shrink-0 animate-spin [animation-direction:reverse] motion-reduce:animate-none" />
                <span className="flex-1 min-w-0">{buildPillText}</span>
              </div>
            </div>
          )}

          {/* Update button at top */}
          {updateAvailable && !selectedBranch && buildPct === null && (
            <button
              onClick={() => setUpdateDialogOpen(true)}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[#2563eb] bg-secondary/50 hover:bg-secondary border-b border-sidebar-border transition-colors"
            >
              <IconRefresh size={13} className="shrink-0" />
              <span>{t('update_available')} v{latestVersion}</span>
            </button>
          )}

          {loadingDeployments ? (
            <div className="flex items-center justify-center gap-2 px-3 py-3 text-xs text-muted-foreground">
              <IconLoader size={13} className="animate-spin" />
              <span>{t('vc_loading_versions')}</span>
            </div>
          ) : deployments.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground text-center">
              {t('vc_no_previous_versions')}
            </div>

          /* ── Ebene 2: Version list for selected branch ── */
          ) : selectedBranch ? (
            <div className="max-h-72 overflow-y-auto">
              {/* Back button */}
              <button
                onClick={() => setSelectedBranch(null)}
                className="flex items-center gap-1.5 w-full px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border-b border-sidebar-border transition-colors"
              >
                <IconArrowLeft size={13} className="shrink-0" />
                {selectedBranch === 'main' ? t('vc_label_main_branch') : t('vc_label_alternate_direction')}
              </button>

              {/* Version entries */}
              {branchEntries.map((dep) => {
                const meta = deploymentMeta(dep.source);
                const Icon = meta.icon;
                const rid = rollbackId(dep);
                const displayTime = dep.deployed_at
                  ? formatDeployedAt(dep.deployed_at)
                  : (dep.timestamp ? formatTimestamp(dep.timestamp) : '');
                return (
                  <button
                    key={rid || dep.deployed_at}
                    onClick={() => setRollbackDialog(dep)}
                    disabled={dep.is_live || rollbackTarget === rid}
                    className={`group flex items-center gap-2 w-full text-left text-xs transition-colors border-b border-sidebar-border last:border-b-0 ${
                      dep.is_live
                        ? 'bg-primary/5 border-l-[3px] border-l-primary pl-2.5 pr-3 py-2.5 cursor-default'
                        : 'px-3 py-2 hover:bg-sidebar-accent/30 disabled:opacity-50'
                    }`}
                  >
                    {dep.is_live ? (
                      <IconCheck size={14} className="shrink-0 text-primary" />
                    ) : (
                      <>
                        <Icon size={14} className={`shrink-0 ${meta.colorClass} group-hover:hidden`} />
                        <IconArrowBackUp size={14} className="shrink-0 text-muted-foreground hidden group-hover:block" />
                      </>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={dep.is_live ? 'text-foreground font-semibold' : 'text-foreground font-medium'}>{displayTime}</span>
                        {dep.version && <span className="text-muted-foreground/60">v{dep.version}</span>}
                        {dep.is_live && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">live</span>
                        )}
                      </div>
                      {meta.label && (
                        <div className={`text-[10px] mt-0.5 ${dep.is_live ? 'text-primary/70' : meta.colorClass}`}>{meta.label}</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

          /* ── Ebene 1: Branch graph overview ── */
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {/* Main branch card (only if main has deployments) */}
              {mainDeps.length > 0 && <button
                onClick={() => setSelectedBranch('main')}
                className="w-full px-3 py-3 text-left hover:bg-sidebar-accent/20 transition-colors border-b border-sidebar-border"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-foreground">{t('vc_label_main_branch')}</span>
                  <div className="flex items-center gap-1.5">
                    {liveBranch === 'main' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold uppercase tracking-wider">live</span>
                    )}
                    <IconChevronDown size={12} className="-rotate-90 text-muted-foreground" />
                  </div>
                </div>
                {/* Dot-line */}
                <div className="flex items-center gap-0 mb-1">
                  {Array.from({ length: Math.min(mainDeps.length, 8) }).map((_, i) => (
                    <Fragment key={i}>
                      <div className={`w-2 h-2 rounded-full shrink-0 ${liveBranch === 'main' ? 'bg-primary' : 'bg-muted-foreground'}`} />
                      {i < Math.min(mainDeps.length, 8) - 1 && (
                        <div className={`w-3 h-0.5 ${liveBranch === 'main' ? 'bg-primary/40' : 'bg-border'}`} />
                      )}
                    </Fragment>
                  ))}
                  {mainDeps.length > 8 && <span className="text-[9px] text-muted-foreground ml-1">+{mainDeps.length - 8}</span>}
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {mainDeps.length} {mainDeps.length === 1 ? t('vc_version_singular') : t('vc_version_plural')}
                </span>
              </button>}

              {/* Alternative branches — indented with connector only when main exists */}
              {altKeys.length > 0 && (
                <div className={mainDeps.length > 0 ? 'ml-4 border-l-2 border-violet-300/50' : ''}>
                  {altKeys.map((branchKey, idx) => {
                    const deps = grouped.get(branchKey)!;
                    const hasLive = branchKey === liveBranch;
                    return (
                      <button
                        key={branchKey}
                        onClick={() => setSelectedBranch(branchKey)}
                        className={`w-full pl-3 pr-3 py-3 text-left hover:bg-sidebar-accent/20 transition-colors ${idx < altKeys.length - 1 ? 'border-b border-sidebar-border' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-foreground">
                            {t('vc_label_alternate_direction')}{altKeys.length > 1 ? ` ${idx + 1}` : ''}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {hasLive && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-500 font-semibold uppercase tracking-wider">live</span>
                            )}
                            <IconChevronDown size={12} className="-rotate-90 text-muted-foreground" />
                          </div>
                        </div>
                        {/* Dot-line */}
                        <div className="flex items-center gap-0 mb-1">
                          {Array.from({ length: Math.min(deps.length, 8) }).map((_, i) => (
                            <Fragment key={i}>
                              <div className={`w-2 h-2 rounded-full shrink-0 ${hasLive ? 'bg-violet-500' : 'bg-violet-400'}`} />
                              {i < Math.min(deps.length, 8) - 1 && (
                                <div className={`w-3 h-0.5 ${hasLive ? 'bg-violet-300' : 'bg-violet-200'}`} />
                              )}
                            </Fragment>
                          ))}
                          {deps.length > 8 && <span className="text-[9px] text-muted-foreground ml-1">+{deps.length - 8}</span>}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {deps.length} {deps.length === 1 ? t('vc_version_singular') : t('vc_version_plural')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Entwickler-Optionen — nur auf der Übersichtsebene des Panels */}
          {!selectedBranch && (
            <div className="border-t border-sidebar-border px-3 py-2 space-y-2">
              <a
                href="/claude/static/lab.html"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <IconFlask size={14} className="shrink-0" />
                <span>{t('edit_dashboard')}</span>
              </a>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={devMode}
                  onChange={e => setDevMode(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs text-foreground">{t('developer')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={betaMode}
                  onChange={e => setBetaMode(e.target.checked)}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-xs text-foreground">{t('beta_features')}</span>
              </label>
            </div>
          )}
        </div>
        );
      })()}

      {status === 'error' && (
        <div className="mx-3 mt-1 px-3 py-1.5 text-xs text-destructive bg-destructive/10 rounded-lg">
          {statusMessage || t('vc_error_text')}
        </div>
      )}

      {status === 'busy' && (
        <div className="mx-3 mt-1 px-3 py-1.5 text-xs text-[#2563eb] bg-secondary border border-[#bfdbfe] rounded-lg">
          {t('update_busy_queued', { min: busyAgeMin })}
        </div>
      )}

      <ConfirmPrompt
        open={updateDialogOpen}
        title={t('update_confirm_title')}
        description={t('update_confirm_desc')}
        confirmLabel={t('update_confirm_action')}
        onCancel={() => setUpdateDialogOpen(false)}
        onConfirm={performUpdate}
      />

      <ConfirmPrompt
        open={rollbackDialog !== null}
        title={t('rollback_confirm_title')}
        description={t('rollback_confirm_desc')}
        confirmLabel={t('rollback_confirm_action')}
        destructive
        onCancel={() => setRollbackDialog(null)}
        onConfirm={() => rollbackDialog && performRollback(rollbackDialog)}
      />
    </div>
  );
}
