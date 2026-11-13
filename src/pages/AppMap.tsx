import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconAlertCircle, IconCheck, IconChevronDown, IconChevronRight, IconClock, IconPaperclip, IconPlus, IconSearch, IconUpload, IconX } from '@tabler/icons-react';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { t, localeTag } from '@/i18n';
import { setPublished } from '@/lib/publicPagesAdmin';
import {
  acceptProposal, answerLine, answerLineWithFile, confirmLine, dismissJob, getAppMap, jobFor, openJobs, proposeChange, rejectProposal, sendOwnerReport, undoChange,
  type AppMapState, type ChangeAbout, type FilterCondition, type FilterValue, type LineJob, type MapGroup, type MapLine,
  type PlanChange, type Proposal,
} from '@/lib/appMap';

/**
 * AppMap — „Deine Anwendung“, v6 (Stufe 0, 29.09.2026).
 *
 * ONE page, sentences grouped by occasion in the map's order (map v2,
 * GET /orchestrate/{ag}/view): what is still to set up (at most three cards,
 * gone after „Stimmt so“ / an answer), „Wenn du etwas anlegst“ with one card
 * per list, „Wenn du etwas änderst“, the schedules, „Auf Knopfdruck“, roles,
 * limits, and what Living Apps can do anyway (collapsed).
 *
 * Every sentence is an assertion about the owner's business. Where it has a
 * setting, the value stands IN the sentence (`{value}`) and „ändern“ turns it
 * into the control. The control tells the speed: instant lines save at once
 * („Geändert · Rückgängig“), minute lines ask first („Umbauen lassen · ca. 3
 * Min.“) and become a job line at the top. Anything else about a flow or an
 * automation goes through the sentence field bound to it (proposal with
 * before/after, „So machen“, „Doch nicht“).
 *
 * No intro, no global field, no chips, no counters, no tabs. `?view=history`
 * is the list of changes, `?line=<id>` a deep link (group opens, the line is
 * marked, its editor opens; `intent:<slug>` opens the flow's sentence field).
 * The developer switch (only with the assistant's developer mode) shows the
 * hidden lines, ids, sections and plan fragments.
 */

const MAP_PATH = '/verwaltung/anwendung';
const AGENT_MINUTES = 3;
const DEV_KEY = 'developer-mode';

// `phase`, not `status`: check-lookup-keys scans src/pages for `<lookup field>: '<literal>'`
// and an app with a lookup field named `status` (inclou's Berater) went red on this
// local UI state — a repair agent then rewrote a generator-owned file (01.10.2026).
type SaveState = { phase: 'idle' } | { phase: 'saving' } | { phase: 'error'; message: string };
type Toast = { id: number; text: string; bad?: boolean; actions?: { label: string; clock?: boolean; fn: () => void }[] };
const IDLE: SaveState = { phase: 'idle' };

const SCHEDULE_PRESETS: { value: string; label: () => string }[] = [
  { value: '0 6 * * *', label: () => t('am_daily_at', { time: '6:00' }) },
  { value: '0 8 * * *', label: () => t('am_daily_at', { time: '8:00' }) },
  { value: '0 2 * * *', label: () => t('am_daily_at', { time: '2:00' }) },
  { value: '0 22 * * *', label: () => t('am_daily_at', { time: '22:00' }) },
  { value: '0 8 * * 1', label: () => t('am_weekly') },
  { value: '0 8 1 * *', label: () => t('am_monthly') },
];
const OPS: FilterCondition['op'][] = ['eq', 'ne', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte', 'empty', 'not_empty'];

/* ── helpers ──────────────────────────────────────────────────────────── */

function speedOf(line: MapLine): 'instant' | 'minutes' {
  if (line.speed) return line.speed;
  const ch = line.editable?.channel;
  return ch === 'tool' || ch === 'page' ? 'minutes' : 'instant';
}
function keyOf(about: ChangeAbout | null | undefined): string {
  return about ? `${about.kind}:${about.id}` : 'free';
}
/** `**x**` is emphasis — the stars never reach the owner. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((p, i) =>
    p.length > 4 && p.startsWith('**') && p.endsWith('**') ? <b key={i} className="font-semibold">{p.slice(2, -2)}</b> : <span key={i}>{p.replace(/\*\*/g, '')}</span>);
}
function valueLabel(line: MapLine): string {
  const e = line.editable;
  if (!e) return line.assumed ?? '';   // a note: the assumption nothing acts on
  if (e.value_label) return e.value_label;
  if (e.kind === 'option' && e.options) return e.options.find(o => o.value === String(e.value))?.label ?? '';
  if (e.kind === 'text' && typeof e.value === 'string') return e.value;
  return '';
}
function plainText(line: MapLine): string {
  return line.text.replace('{value}', valueLabel(line)).replace(/\*\*/g, '');
}
function cronTime(cron: string): { h: number; m: number; rest: string } | null {
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5 || !/^\d{1,2}$/.test(p[0]) || !/^\d{1,2}$/.test(p[1])) return null;
  return { m: Number(p[0]), h: Number(p[1]), rest: p.slice(2).join(' ') };
}
function pad(n: number): string { return String(n).padStart(2, '0'); }
function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  if (d.toDateString() === today.toDateString()) return `${t('am_today')}, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `${t('am_yesterday')}, ${time}`;
  const sameYear = d.getFullYear() === today.getFullYear();
  return `${d.toLocaleDateString(undefined, sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' })}, ${time}`;
}
function remainingMinutes(job: LineJob): number {
  const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 60000;
  return Math.max(1, Math.ceil(AGENT_MINUTES - elapsed));
}
function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')}${t('am_join_and')}${items[items.length - 1]}`;
}
function readDevFlag(): boolean {
  try { return window.localStorage.getItem(DEV_KEY) === 'true'; } catch { return false; }
}

/* ── page state shared by the rows ────────────────────────────────────── */

interface PageCtx {
  jobs: Record<string, LineJob>;
  states: Record<string, SaveState>;
  dev: boolean;
  focus: string | null;
  editing: string | null;
  setEditing: (id: string | null) => void;
  save: (l: MapLine, v: unknown) => void;
  upload: (l: MapLine, f: File) => void;
  confirm: (l: MapLine) => void;
  wishKey: string | null;
  openWish: (key: string | null) => void;
  proposal: Proposal | null;
  proposalKey: string | null;
  onChanged: (next: Partial<AppMapState>) => void;
  reload: () => void;
  toast: (text: string) => void;
  navigate: (to: string) => void;
  /** admin rights: without them every control is hidden, the sentences stay */
  canChange: boolean;
}
const Ctx = createContext<PageCtx | null>(null);
function usePage(): PageCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('AppMap context missing');
  return c;
}

/* ── the page ─────────────────────────────────────────────────────────── */

export default function AppMap() {
  const [st, setSt] = useState<AppMapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, SaveState>>({});
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [wishOpen, setWishOpen] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const [devAllowed] = useState(readDevFlag);
  const [dev, setDev] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const view = params.get('view') === 'history' ? 'history' : 'main';
  const focus = params.get('line');
  const lastJobs = useRef<Record<string, LineJob['status']>>({});
  const focused = useRef<string | null>(null);

  const toast = (text: string, actions?: Toast['actions'], bad = false, ms = 9000) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, text, bad, actions }]);
    window.setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), ms);
  };
  const dropToast = (id: number) => setToasts(prev => prev.filter(x => x.id !== id));

  const reload = () => getAppMap().then(s => { setSt(s); setLoading(false); }).catch(e => { setError(e instanceof Error ? e.message : String(e)); setLoading(false); });
  useEffect(() => { reload(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // jobs: poll while one runs; a job that flips to done / failed gets its toast
  const running = useMemo(() => Object.values(st?.jobs ?? {}).some(j => j.status === 'running'), [st?.jobs]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(reload, 8000);
    return () => window.clearInterval(id);
  }, [running]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!st) return;
    for (const j of Object.values(st.jobs)) {
      const before = lastJobs.current[j.id];
      if (before === 'running' && j.status === 'done') {
        toast(t('am_job_done', { text: j.text }), [{ label: t('am_view'), fn: () => openJobTarget(j) }]);
      } else if (before === 'running' && j.status === 'failed') {
        toast(t('am_job_failed', { text: j.text }), [{ label: t('am_retry', { n: AGENT_MINUTES }), clock: true, fn: () => retry(j) }, { label: t('am_leave'), fn: () => leave(j) }], true, 15000);
      }
      lastJobs.current[j.id] = j.status;
    }
  }, [st?.jobs]);   // eslint-disable-line react-hooks/exhaustive-deps

  const goView = (v: 'main' | 'history', line?: string) => {
    const p = new URLSearchParams();
    if (v === 'history') p.set('view', 'history');
    if (line) p.set('line', line);
    navigate(`${MAP_PATH}${p.toString() ? `?${p}` : ''}`);
  };
  const openJobTarget = (j: LineJob) => {
    if (j.kind === 'page' && j.about) navigate(`/intents/${j.about}`);
    else { focused.current = null; goView('main', j.line_id); }
  };

  const map = st?.map ?? null;
  const lines = useMemo(() => map?.lines ?? [], [map]);
  const groups = useMemo(() => map?.groups ?? [], [map]);

  // ?line=<id>: open the group, mark the line, open its editor — or, for a
  // flow (`intent:<slug>` without a line of that id), its sentence field.
  useEffect(() => {
    if (!map || !focus || focused.current === focus) return;
    focused.current = focus;
    const exact = lines.find(l => l.id === focus) ?? lines.find(l => l.id.startsWith(`${focus}:`));
    const slug = focus.startsWith('intent:') ? focus.split(':')[1] : null;
    const flowGroup = slug ? groups.find(g => g.kind === 'create' && g.intent === slug) : undefined;
    const groupId = exact?.group ?? flowGroup?.id ?? lines.find(l => l.about.id === slug)?.group;
    // a flow's own line (`intent:<slug>`, hidden) stands for the whole group:
    // open its sentence field, never the developer view
    const flowHead = !!slug && focus === `intent:${slug}` && (!!flowGroup || !exact);
    if (groupId) setOpenGroups(o => ({ ...o, [groupId]: true }));
    if (exact?.hidden && !flowHead) setDev(devAllowed);
    const lineShown = !!exact && exact.id === focus && (!exact.hidden || (!flowHead && devAllowed));
    if (lineShown && exact?.editable?.ready) setEditing(exact.id);
    if (flowHead) setWishOpen(`intent:${slug}`);
    const target = lineShown && exact ? `line-${exact.id}` : groupId ? `group-${groupId}` : null;
    if (target) window.setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
  }, [map, focus]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setState = (id: string, s: SaveState) => setStates(prev => ({ ...prev, [id]: s }));
  const run = async (line: MapLine, call: () => ReturnType<typeof answerLine>, kept = false) => {
    setState(line.id, { phase: 'saving' });
    try {
      const res = await call();
      setSt(prev => prev ? { ...prev, map: res.map, planVersion: res.plan_version ?? prev.planVersion, changes: res.changes ?? prev.changes } : prev);
      setState(line.id, IDLE);
      const ch = res.action.channel;
      if (ch === 'tool' || ch === 'page') { reload(); return; }
      const change = res.changes?.[0];
      const actions = change?.undo ? [{ label: t('am_undo'), fn: () => undo(change) }] : undefined;
      toast(kept ? t('am_kept') : t('am_changed'), actions, false, 10000);
    } catch (e) {
      setState(line.id, { phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };
  const save = (line: MapLine, value: unknown) => run(line, () => answerLine(line.id, value));
  const upload = (line: MapLine, file: File) => run(line, () => answerLineWithFile(line.id, file));
  const confirm = (line: MapLine) => run(line, () => confirmLine(line.id), true);
  const undo = async (c: PlanChange) => {
    try {
      const r = await undoChange(c.version);
      setSt(prev => prev ? { ...prev, map: r.map ?? prev.map, planVersion: r.plan_version, changes: r.changes } : prev);
      if (c.rebuild && !c.undo && !c.exact) reload();
    } catch (e) { toast(e instanceof Error ? e.message : String(e), undefined, true); }
  };
  const leave = (j: LineJob) => { dismissJob(j.id); setDismissed(d => ({ ...d, [j.id]: true })); };
  const retry = (j: LineJob) => {
    const line = lines.find(l => l.id === j.line_id);
    if (line && j.value !== undefined) save(line, j.value);
    leave(j);
  };

  // the sentence field that shows the proposal: the one it was written in
  const anchors = useMemo(() => {
    const out = new Set<string>();
    for (const g of groups) if (g.kind === 'create' && g.intent) out.add(`intent:${g.intent}`);
    for (const l of lines) if (l.about.kind === 'tool') out.add(`tool:${l.about.id}`);
    return out;
  }, [groups, lines]);
  const proposal = st?.proposal ?? null;
  const proposalKey = proposal ? (anchors.has(keyOf(proposal.about)) ? keyOf(proposal.about) : 'free') : null;
  const wishKey = proposalKey ?? wishOpen;

  const ctx: PageCtx = {
    jobs: st?.jobs ?? {}, states, dev, focus, editing, setEditing, save, upload, confirm,
    wishKey, openWish: setWishOpen, proposal, proposalKey,
    onChanged: next => setSt(prev => prev ? { ...prev, ...next } : prev), reload, toast: text => toast(text), navigate,
    canChange: st?.canChange ?? false,
  };

  // the map's own subtitle („Kunden, Projekte … und Rechnungen.“), else the lists of the create groups
  const subtitle = useMemo(() => {
    if (map?.subtitle) return map.subtitle;
    const many = listOf(groups.filter(g => g.kind === 'create' && g.many).map(g => g.many as string));
    return many ? `${many}.` : '';
  }, [map, groups]);

  return (
    <PageShell title={t('am_title')} subtitle={view === 'main' ? subtitle : ''} badge={<span className="inline-flex items-center rounded-full bg-[#fff4ed] px-2 py-0.5 text-xs font-medium leading-none text-[#d24601]">{t('am_beta')}</span>}>
      {loading && <p className="text-sm text-muted-foreground">{t('am_loading')}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!loading && !error && !map && <p className="text-sm text-muted-foreground">{t('am_none')}</p>}
      {map && st?.stale && (
        <p role="status" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {t(/rollback/i.test(st.stale.reason ?? '') ? 'am_stale_rollback' : 'am_stale', { date: new Date(st.stale.at).toLocaleDateString(localeTag()) })}
        </p>
      )}
      {map && st?.planningFailed && (
        <p role="alert" data-planning-failed className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
          {t(st.planningFailed.adopted ? 'am_planning_failed_adopted' : 'am_planning_failed', { date: new Date(st.planningFailed.at).toLocaleDateString(localeTag()) })}
        </p>
      )}
      {map && st && !st.canChange && (
        <p role="status" className="mb-4 rounded-2xl border border-border bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">{t('am_readonly')}</p>
      )}
      {map && st && (
        <Ctx.Provider value={ctx}>
          {view === 'history'
            ? <HistoryView changes={st.changes} onUndo={undo} onBack={() => goView('main')} dev={dev} />
            : <MainView st={st} groups={groups} lines={lines} q={q} setQ={setQ} openGroups={openGroups} setOpenGroups={setOpenGroups}
                dismissed={dismissed} onRetry={retry} onLeave={leave} onUndo={undo} goHistory={() => goView('history')} />}
          {devAllowed && (
            <div className="mt-8 space-y-2 border-t border-dashed border-border pt-3 text-xs text-muted-foreground">
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-0">
                <input type="checkbox" checked={dev} onChange={ev => setDev(ev.target.checked)} className="accent-primary" />{t('am_dev_toggle')}
              </label>
              {dev && map.summary && <p className="font-mono">{map.summary}</p>}
              {dev && <p className="font-mono">map v{map.version} · plan v{st.planVersion} · {st.status ?? '—'}</p>}
            </div>
          )}
        </Ctx.Provider>
      )}
      <div className="fixed bottom-5 left-1/2 z-40 flex w-[min(600px,92vw)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map(x => (
          <div key={x.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg ${x.bad ? 'bg-destructive text-destructive-foreground' : 'bg-foreground text-background'}`}>
            <span>{x.text}</span>
            <span className="flex gap-3">{(x.actions ?? []).map(a => (
              <button key={a.label} type="button" onClick={() => { dropToast(x.id); a.fn(); }} className="inline-flex min-h-11 items-center gap-1 underline sm:min-h-0">
                {a.clock && <IconClock size={14} aria-hidden="true" />}{a.label}
              </button>
            ))}</span>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

/* ── main view ────────────────────────────────────────────────────────── */

function MainView({ st, groups, lines, q, setQ, openGroups, setOpenGroups, dismissed, onRetry, onLeave, onUndo, goHistory }: {
  st: AppMapState; groups: MapGroup[]; lines: MapLine[]; q: string; setQ: (v: string) => void;
  openGroups: Record<string, boolean>; setOpenGroups: (fn: (o: Record<string, boolean>) => Record<string, boolean>) => void;
  dismissed: Record<string, boolean>; onRetry: (j: LineJob) => void; onLeave: (j: LineJob) => void; onUndo: (c: PlanChange) => void; goHistory: () => void;
}) {
  const c = usePage();
  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => lines.filter(l => c.dev || !l.hidden), [lines, c.dev]);
  const byGroup = useMemo(() => {
    const out = new Map<string, MapLine[]>();
    for (const l of visible) out.set(l.group, [...(out.get(l.group) ?? []), l]);
    return out;
  }, [visible]);
  const hits = (g: MapGroup): MapLine[] => {
    const ls = byGroup.get(g.id) ?? [];
    if (!needle) return ls;
    const head = `${g.title} ${g.intent_label ?? ''}`.toLowerCase();
    if (head.includes(needle)) return ls;
    return ls.filter(l => `${plainText(l)} ${l.status?.text ?? ''} ${l.note ?? ''} ${l.about.label ?? ''}`.toLowerCase().includes(needle));
  };
  const setup = groups.find(g => g.kind === 'setup');
  const rest = groups.filter(g => g.kind !== 'setup');
  const shown = rest.map(g => [g, hits(g)] as const).filter(([, ls]) => ls.length > 0);
  const firstCreate = shown.find(([g]) => g.kind === 'create')?.[0].id;
  const jobs = openJobs(st.jobs).filter(j => !dismissed[j.id]);
  const last = st.changes[0];
  const setupLines = setup ? byGroup.get(setup.id) ?? [] : [];

  return (
    <div className="space-y-8">
      {jobs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card px-5 py-3" aria-live="polite">
          {jobs.map(j => (
            <div key={j.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm last:border-b-0">
              <span className="min-w-0 flex-1">
                {j.status === 'failed' ? t('am_job_failed', { text: j.text }) : j.text}
                {j.status === 'running' && <span className="block text-xs text-muted-foreground">{t('am_meanwhile')}</span>}
                {j.status === 'failed' && c.dev && j.error && <span className="block font-mono text-xs text-muted-foreground">{j.error}</span>}
              </span>
              {j.status === 'running' || !c.canChange
                ? (j.status === 'running' ? <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground"><span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />{t('am_remaining', { n: remainingMinutes(j) })}</span> : null)
                : <span className="flex flex-wrap gap-1">
                    {j.value !== undefined && <Button type="button" size="sm" variant="outline" onClick={() => onRetry(j)} className="min-h-11 gap-1 sm:min-h-8"><IconClock size={14} aria-hidden="true" />{t('am_retry', { n: AGENT_MINUTES })}</Button>}
                    <Button type="button" size="sm" variant="ghost" onClick={() => onLeave(j)} className="min-h-11 sm:min-h-8">{t('am_leave')}</Button>
                  </span>}
            </div>
          ))}
        </div>
      )}

      {setup && setupLines.length > 0 && (
        <section id={`group-${setup.id}`} className="space-y-3">
          <h2 className="text-base font-semibold">{setup.title}</h2>
          {setupLines.map(l => <LineRow key={l.id} line={l} card />)}
        </section>
      )}

      <div className="space-y-3">
        <div className="relative">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={ev => setQ(ev.target.value)} placeholder={t('am_find_placeholder')} aria-label={t('am_find')} className="min-h-11 pl-9" />
        </div>
        {needle && shown.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('am_nothing')}{' '}
            {c.canChange && <button type="button" onClick={() => c.openWish('free')} className="font-semibold text-primary hover:underline">{t('am_as_wish')}</button>}
          </p>
        )}
        {c.canChange && c.wishKey === 'free' && <ChangeBox about={null} />}
      </div>

      {shown.map(([g, ls]) => {
        if (g.kind === 'create') return (
          <div key={g.id} className="space-y-3">
            {g.id === firstCreate && <h2 className="text-base font-semibold">{t('am_create_heading')}</h2>}
            <CreateCard group={g} lines={ls} />
          </div>
        );
        const collapsible = g.kind === 'platform';
        const open = !collapsible || !!needle || !!openGroups[g.id];
        return (
          <section key={g.id} id={`group-${g.id}`} className="space-y-2">
            {collapsible
              ? <button type="button" onClick={() => setOpenGroups(o => ({ ...o, [g.id]: !open }))} aria-expanded={open}
                  className="inline-flex min-h-11 items-center gap-1 text-base font-semibold sm:min-h-0">
                  {open ? <IconChevronDown size={16} aria-hidden="true" /> : <IconChevronRight size={16} aria-hidden="true" />}{g.title}
                </button>
              : <h2 className="text-base font-semibold">{g.title}</h2>}
            {open && (
              <div className="divide-y divide-border rounded-2xl border border-border bg-card">
                {ls.map((l, i) => {
                  const firstOfTool = l.about.kind === 'tool' && ls.findIndex(o => o.about.kind === 'tool' && o.about.id === l.about.id) === i;
                  return <LineRow key={l.id} line={l} more={firstOfTool && g.kind !== 'roles' && g.kind !== 'limits' && g.kind !== 'platform' && g.kind !== 'gaps' && g.kind !== 'understanding'} flowLink />;
                })}
              </div>
            )}
          </section>
        );
      })}

      <footer className="border-t border-border pt-3 text-sm text-muted-foreground">
        {last && (
          <p>
            {t('am_last')}: {last.text} · {fmtWhen(last.at)}
            {last.undone ? ` · ${t('am_undone')}`
              : !c.canChange ? null
              : (last.undo || (last.rebuild && last.exact)) ? <> · <button type="button" onClick={() => onUndo(last)} className="font-semibold text-primary hover:underline">{t('am_undo')}</button></>
              : last.rebuild ? <> · <button type="button" onClick={() => onUndo(last)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><IconClock size={14} aria-hidden="true" />{t('am_rebuild', { n: AGENT_MINUTES })}</button></>
              : null}
          </p>
        )}
        <p className="mt-1">
          <button type="button" onClick={goHistory} className="inline-flex min-h-11 items-center gap-0.5 font-semibold text-primary hover:underline sm:min-h-0">{t('am_history_link')}<IconChevronRight size={14} aria-hidden="true" /></button>
        </p>
      </footer>
      <ReportBox />
    </div>
  );
}

/* ── a create group: „Ein Projekt · Projekt anlegen ›“ ─────────────────── */

function CreateCard({ group, lines }: { group: MapGroup; lines: MapLine[] }) {
  const c = usePage();
  const about: ChangeAbout | null = group.intent ? { kind: 'intent', id: group.intent, label: group.intent_label ?? group.title } : null;
  const key = keyOf(about);
  const open = !!about && c.wishKey === key;
  return (
    <section id={`group-${group.id}`} className="rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4">
        <h3 className="font-semibold">{group.title}</h3>
        {group.intent && (
          <button type="button" onClick={() => c.navigate(`/intents/${group.intent}`)} className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-primary hover:underline sm:min-h-0">
            {group.intent_label ?? group.intent}<IconChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="divide-y divide-border">
        {lines.map(l => <LineRow key={l.id} line={l} />)}
      </div>
      {about && (
        <div className="border-t border-border px-5 py-3">
          {open
            ? <ChangeBox about={about} />
            : <button type="button" onClick={() => c.openWish(key)} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline sm:min-h-0">{t('am_other_about', { label: about.label ?? about.id })}</button>}
        </div>
      )}
    </section>
  );
}

/* ── one sentence ─────────────────────────────────────────────────────── */

function LineRow({ line, card, more, flowLink }: { line: MapLine; card?: boolean; more?: boolean; flowLink?: boolean }) {
  const c = usePage();
  const e = line.editable;
  const [pending, setPending] = useState<unknown>(undefined);
  const [file, setFile] = useState<File | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [json, setJson] = useState(false);
  useEffect(() => { setPending(undefined); setFile(null); }, [line.id, e?.value]);
  const state = c.states[line.id] ?? IDLE;
  const job = jobFor(c.jobs, line.id);
  const blocked = job?.status === 'running';
  const busy = state.phase === 'saving' || blocked;
  const editing = c.editing === line.id && !!e?.ready;
  const slow = speedOf(line) === 'minutes';
  const canEdit = c.canChange && !!e?.ready && !editing;
  const assumed = line.tag === 'assumed' && !line.answered;
  const inferred = line.tag === 'inferred';
  const aboutTool: ChangeAbout | null = more ? { kind: 'tool', id: line.about.id, label: line.about.label ?? line.about.id } : null;
  const wishHere = !!aboutTool && c.wishKey === keyOf(aboutTool);
  const marked = !!c.focus && c.focus === line.id;
  const armed = pending !== undefined || file !== null;

  const choose = (v: unknown) => { if (slow) setPending(v); else { c.save(line, v); c.setEditing(null); } };
  const pick = (f: File) => { if (slow || card) setFile(f); else { c.upload(line, f); c.setEditing(null); } };
  const go = () => {
    if (file) c.upload(line, file); else if (pending !== undefined) c.save(line, pending);
    setPending(undefined); setFile(null); c.setEditing(null);
  };
  const cancel = () => { setPending(undefined); setFile(null); c.setEditing(null); };

  const inline = editing && !!e && ((e.kind === 'option' && !!e.options && !e.file) || e.kind === 'schedule' || e.kind === 'text');
  const parts = line.text.split('{value}');
  const slot = parts.length > 1;
  const pendingLabel = pending !== undefined && e?.options ? e.options.find(o => o.value === String(pending))?.label : undefined;
  const label = pendingLabel ?? valueLabel(line);
  const control = inline && e ? <InlineControl line={line} busy={busy} pending={pending} onChoose={choose} /> : null;
  const chip = label ? <span className={`mx-0.5 rounded-md px-1.5 py-0.5 font-semibold ${assumed ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-100' : 'bg-secondary text-secondary-foreground'}`}>{label}</span> : null;
  const confirmAction = line.actions?.find(a => a.id === 'confirm');
  const fileAction = line.actions?.find(a => a.id === 'file');
  // „Einrichten“ under „Fehlt noch“: the gap's sentence goes through the change door as the owner's wish
  const requestAction = c.canChange ? line.actions?.find(a => a.id === 'request') : undefined;
  // „Veröffentlichen“ on a built page (PV-11): one click, the page goes live, the map reloads
  const publishAction = c.canChange ? line.actions?.find(a => a.id === 'publish') : undefined;
  const [publishing, setPublishing] = useState(false);
  const publish = async () => {
    if (!publishAction?.slug) return;
    setPublishing(true);
    try { await setPublished(publishAction.slug, true); c.toast(t('am_published')); c.reload(); }
    catch (err) { c.toast(err instanceof Error ? err.message : String(err)); }
    setPublishing(false);
  };
  const [requesting, setRequesting] = useState(false);
  const request = async () => {
    setRequesting(true);
    try {
      const proposal = await proposeChange(requestAction?.text ?? line.text, null, requestAction?.gap ?? line.about.id);
      c.onChanged({ proposal });
      c.openWish(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { c.toast(err instanceof Error ? err.message : String(err)); }
    setRequesting(false);
  };

  return (
    <div id={`line-${line.id}`} className={`${card ? 'rounded-2xl border border-border bg-card px-5 py-4 shadow-sm' : 'px-5 py-3'} ${marked ? 'ring-2 ring-primary/40' : ''} ${line.hidden ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className={card ? 'text-base' : 'text-sm'}>
            {rich(parts[0])}{slot && (control ?? chip)}{slot && rich(parts.slice(1).join(''))}
            {assumed && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[11px] font-semibold text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">{t('am_assumed_tag')}</span>}
            {inferred && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 align-middle text-[11px] font-semibold text-secondary-foreground" title={t('am_inferred_hint')}>{t('am_inferred_tag')}</span>}
            {flowLink && line.about.kind === 'intent' && (
              <> <button type="button" onClick={() => c.navigate(`/intents/${line.about.id}`)} className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">{line.about.label ?? line.about.id}<IconChevronRight size={14} aria-hidden="true" /></button></>
            )}
          </p>
          {line.status?.text && <p className={`mt-0.5 text-xs ${line.status.ok === false ? 'text-destructive' : 'text-muted-foreground'}`}>{line.status.text}</p>}
          {line.note && !more && <p className="mt-0.5 text-xs text-muted-foreground"><b className="font-semibold">{t('am_good_to_know')}</b> {line.note}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!card && requestAction && <Button type="button" size="sm" variant="ghost" disabled={requesting} onClick={request} className="min-h-11 gap-0.5 text-primary sm:min-h-8">{requestAction.label}<IconChevronRight size={14} aria-hidden="true" /></Button>}
          {publishAction && <Button type="button" size="sm" disabled={publishing} onClick={publish} className="min-h-11 gap-1 sm:min-h-8"><IconCheck size={14} aria-hidden="true" />{publishAction.label}</Button>}
          {!card && c.canChange && assumed && !editing && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => c.confirm(line)} className="min-h-11 sm:min-h-8">{t('am_fits')}</Button>}
          {!card && canEdit && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => c.setEditing(line.id)} className="min-h-11 text-primary sm:min-h-8">{t('am_change')}</Button>}
          {editing && !armed && <Button type="button" size="sm" variant="ghost" onClick={cancel} className="min-h-11 sm:min-h-8">{t('am_confirm_cancel')}</Button>}
          {more && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(v => !v)} aria-expanded={expanded} className="min-h-11 gap-0.5 sm:min-h-8">
              {expanded ? t('am_less') : t('am_more')}{expanded ? <IconChevronDown size={14} aria-hidden="true" /> : <IconChevronRight size={14} aria-hidden="true" />}
            </Button>
          )}
          {c.dev && line.fragment && <button type="button" onClick={() => setJson(v => !v)} aria-expanded={json} className="rounded px-1.5 font-mono text-xs text-muted-foreground hover:text-foreground">{'{ }'}</button>}
        </div>
      </div>

      {card && !editing && c.canChange && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {fileAction && !file && (
            <label className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground sm:min-h-9 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
              <IconUpload size={16} aria-hidden="true" />{fileAction.label}
              <input type="file" className="sr-only" disabled={busy} onChange={ev => { const f = ev.target.files?.[0]; if (f) pick(f); ev.target.value = ''; }} />
            </label>
          )}
          {confirmAction && !armed && <Button type="button" size="sm" variant={fileAction ? 'outline' : 'default'} disabled={busy} onClick={() => c.confirm(line)} className="min-h-11 gap-1 sm:min-h-9"><IconCheck size={14} aria-hidden="true" />{confirmAction.label}</Button>}
          {canEdit && !armed && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => c.setEditing(line.id)} className="min-h-11 text-primary sm:min-h-9">{t('am_change')}</Button>}
        </div>
      )}

      {editing && e && !inline && (
        <div className="mt-3">
          <BlockEditor line={line} busy={busy} pending={pending} picked={file} onChoose={choose} onPick={pick} />
        </div>
      )}
      {!slot && inline && <div className="mt-2">{control}</div>}
      {editing && !slow && !armed && <p className="mt-1 text-xs text-muted-foreground">{t('am_instant_hint')}</p>}

      {armed && (
        <div className="mt-3 space-y-2">
          {file && <p className="inline-flex items-center gap-2 text-sm"><IconPaperclip size={14} aria-hidden="true" />{file.name}</p>}
          <p className="text-xs text-muted-foreground">{t(line.editable?.channel === 'page' ? 'am_confirm_page' : 'am_confirm_tool', { name: line.about.label ?? line.about.id })}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={go} className="min-h-11 gap-1 sm:min-h-9"><IconClock size={14} aria-hidden="true" />{t('am_confirm_go', { n: AGENT_MINUTES })}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={cancel} className="min-h-11 sm:min-h-9">{t('am_confirm_cancel')}</Button>
          </div>
        </div>
      )}
      {blocked && <p className="mt-1 text-xs text-muted-foreground">{t('am_job_blocked')}</p>}
      <JobBadge job={job} />
      <StateLine state={state} />

      {more && expanded && (
        <div className="mt-3 space-y-2 border-l-2 border-border pl-3">
          {line.note && <p className="text-sm text-muted-foreground"><b className="font-semibold text-foreground">{t('am_good_to_know')}</b> {line.note}</p>}
          {aboutTool && !wishHere && c.canChange && <button type="button" onClick={() => c.openWish(keyOf(aboutTool))} className="inline-flex min-h-11 items-center text-sm text-primary hover:underline sm:min-h-0">{t('am_other_about', { label: aboutTool.label ?? aboutTool.id })}</button>}
        </div>
      )}
      {aboutTool && wishHere && c.canChange && <div className="mt-3"><ChangeBox about={aboutTool} /></div>}

      {c.dev && (
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">{line.id} · {line.section} · {line.group}{line.speed ? ` · ${line.speed}` : ''}{line.status ? ` · ok=${String(line.status.ok)}` : ''}</p>
      )}
      {c.dev && json && line.fragment && <pre className="mt-1 overflow-x-auto rounded-lg border border-border bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed">{line.fragment}</pre>}
    </div>
  );
}

/* ── the sentence field bound to a flow or an automation ──────────────── */

/** „Was stimmt nicht?“ — not a wish and not a job: the sentence goes to us as a
 *  finding (the owner never triggers a rebuild of their own dashboard, C10). */
function ReportBox() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { await sendOwnerReport(text.trim()); setSent(true); setText(''); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  return (
    <section aria-labelledby="owner-report" className="mt-6 space-y-2 rounded-2xl border border-border bg-card p-4">
      <label id="owner-report" htmlFor="owner-report-text" className="block text-sm font-semibold">{t('am_report_title')}</label>
      {sent
        ? <p role="status" className="text-sm text-muted-foreground">{t('am_report_thanks')}</p>
        : (
          <>
            <textarea id="owner-report-text" value={text} onChange={ev => setText(ev.target.value.slice(0, 500))} rows={2} disabled={busy}
              placeholder={t('am_report_placeholder')} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" disabled={busy || !text.trim()} onClick={send} className="min-h-11 sm:min-h-9">{t('am_report_send')}</Button>
            </div>
          </>
        )}
      {err && <p role="alert" className="text-sm text-destructive">{t('am_report_failed')}</p>}
    </section>
  );
}

function ChangeBox({ about }: { about: ChangeAbout | null }) {
  const c = usePage();
  const proposal = c.proposalKey === keyOf(about) ? c.proposal : null;
  const [text, setText] = useState(proposal?.wish ?? '');   // the sentence under examination stays visible (a gap's „Einrichten“ wrote it)
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const area = useRef<HTMLTextAreaElement | null>(null);
  const { reload, onChanged, toast } = c;
  const id = `wish-${keyOf(about).replace(/[^a-z0-9-]/gi, '-')}`;

  useEffect(() => { if (!proposal) window.setTimeout(() => area.current?.focus(), 0); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (proposal?.status !== 'planning') return;
    const started = new Date(proposal.created_at).getTime();
    const h = window.setInterval(() => { setElapsed(Math.max(0, Math.round((Date.now() - started) / 1000))); reload(); }, 3000);
    return () => window.clearInterval(h);
  }, [proposal?.status, proposal?.created_at, reload]);

  const look = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { onChanged({ proposal: await proposeChange(text.trim(), about) }); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  // „Nur der Plan …“ is the backend's sentence for a proposal that builds nothing
  const instant = !!proposal?.effect && proposal.effect.startsWith('Nur der Plan');
  const accept = async () => {
    if (!proposal) return;
    setBusy(true); setErr(null);
    try {
      const r = await acceptProposal(proposal.id);
      onChanged({ map: r.map, planVersion: r.plan_version, changes: r.changes, proposal: null });
      toast(r.started.length ? t('am_accepted_work') : t('am_accepted_now'));
      setText('');
      c.openWish(null);
      reload();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  };
  const notThis = async () => {
    if (proposal) {
      const wish = proposal.wish;
      try { await rejectProposal(proposal.id); } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
      onChanged({ proposal: null });
      setText(wish);
      c.openWish(keyOf(about));
      window.setTimeout(() => { area.current?.focus(); area.current?.setSelectionRange(wish.length, wish.length); }, 0);
    } else {
      setText('');
      c.openWish(null);
    }
  };
  const planning = proposal?.status === 'planning';
  const title = about ? t('am_wish_title', { label: about.label ?? about.id }) : t('am_wish_title_free');
  const limits = about ? t(about.kind === 'tool' ? 'am_wish_limits_tool' : 'am_wish_limits_intent') : null;
  const itemLabel: Record<string, string> = { add: t('am_new'), change: t('am_after'), remove: t('am_gone'), keep: t('am_stays') };

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold">{title}</label>
      {proposal?.status !== 'ready' && (
        <>
          <textarea ref={area} id={id} value={text} onChange={ev => setText(ev.target.value)} rows={2} disabled={busy || planning}
            placeholder={t('am_wish_placeholder')} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm" />
          {limits && <p className="text-xs text-muted-foreground">{limits}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" disabled={busy || !text.trim() || planning} onClick={look} className="min-h-11 sm:min-h-9">{t('am_wish_look')}</Button>
            {!planning && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={notThis} className="min-h-11 sm:min-h-9">{t('am_not')}</Button>}
            {planning && <span className="inline-flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite"><span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />{t('am_wish_reading', { s: elapsed })}</span>}
          </div>
        </>
      )}
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {proposal?.status === 'failed' && <p role="alert" className="text-sm text-destructive">{t('am_wish_failed', { error: proposal.error ?? '' })}</p>}
      {proposal?.status === 'ready' && (
        <div className="rounded-2xl border border-border bg-background px-4 py-3">
          <p className="text-sm text-muted-foreground">„{proposal.wish}“</p>
          <p className="mt-1 text-sm font-semibold">{t('am_wish_shape')}</p>
          {proposal.summary && <p className="text-sm">{proposal.summary}</p>}
          <ul className="mt-2 divide-y divide-border">
            {(proposal.items ?? []).map((it, i) => (
              <li key={i} className="py-2 text-sm">
                {it.before && it.tag === 'change' && <span className="block text-muted-foreground"><b className="font-semibold">{t('am_before')}:</b> {it.before}</span>}
                <span className="block"><b className="font-semibold">{itemLabel[it.tag] ?? t('am_after')}:</b> {it.text}</span>
                {it.why && <span className="block text-xs text-muted-foreground">{it.why}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">{instant ? t('am_after_now') : t('am_after_minutes')}</p>
          {c.dev && proposal.effect && <p className="mt-1 font-mono text-[11px] text-muted-foreground">{proposal.effect}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={accept} className="min-h-11 gap-1 sm:min-h-9">
              {instant ? <IconCheck size={14} aria-hidden="true" /> : <IconClock size={14} aria-hidden="true" />}{instant ? t('am_do_it') : t('am_do_it_minutes', { n: AGENT_MINUTES })}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={notThis} className="min-h-11 sm:min-h-9">{t('am_not')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── history ──────────────────────────────────────────────────────────── */

function HistoryView({ changes, onUndo, onBack, dev }: { changes: PlanChange[]; onUndo: (c: PlanChange) => void; onBack: () => void; dev: boolean }) {
  const { canChange } = usePage();
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center text-sm text-muted-foreground hover:underline sm:min-h-0">‹ {t('am_title')}</button>
      <h2 className="text-lg font-semibold">{t('am_history_link')}</h2>
      <ol className="divide-y divide-border rounded-2xl border border-border bg-card">
        {changes.map(c => (
          <li key={c.version} className="grid grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-0.5 px-5 py-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto]">
            <span className="text-xs text-muted-foreground">{fmtWhen(c.at)}</span>
            <span className={`text-sm ${c.undone ? 'text-muted-foreground line-through' : ''}`}>{c.text}{dev && c.how && <span className="block font-mono text-[11px] text-muted-foreground">v{c.version} · {c.kind} · {c.how}</span>}</span>
            <span className="justify-self-start sm:justify-self-end">
              {c.undone ? <span className="text-xs text-muted-foreground">{t('am_undone')}</span>
                : !canChange ? null
                : (c.undo || (c.rebuild && c.exact)) ? <Button type="button" size="sm" variant="ghost" onClick={() => onUndo(c)} className="min-h-11 text-primary sm:min-h-8">{t('am_undo')}</Button>
                : c.rebuild ? <Button type="button" size="sm" variant="outline" onClick={() => onUndo(c)} className="min-h-11 gap-1 sm:min-h-8"><IconClock size={14} aria-hidden="true" />{t('am_rebuild', { n: AGENT_MINUTES })}</Button>
                : null}
            </span>
          </li>
        ))}
        {changes.length === 0 && <li className="px-5 py-3 text-sm text-muted-foreground">{t('am_nothing')}</li>}
      </ol>
    </div>
  );
}

/* ── shared pieces ────────────────────────────────────────────────────── */

function StateLine({ state }: { state: SaveState }) {
  if (state.phase === 'saving') return <p className="mt-1 text-xs text-muted-foreground">{t('am_saving')}</p>;
  if (state.phase === 'error') return <p role="alert" className="mt-1 flex items-center gap-1 text-xs text-destructive"><IconAlertCircle size={14} aria-hidden="true" />{state.message}</p>;
  return null;
}

function JobBadge({ job }: { job: LineJob | undefined }) {
  const c = usePage();
  if (!job || job.status === 'done') return null;
  const running = job.status === 'running';
  return (
    <p className="mt-2 text-xs" aria-live="polite">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${running ? 'bg-secondary text-secondary-foreground' : 'bg-destructive/10 text-destructive'}`}>
        {running && <span className="h-2 w-2 animate-pulse rounded-full bg-current" aria-hidden="true" />}{running ? t('am_remaining', { n: remainingMinutes(job) }) : t('am_job_failed_short')}
      </span>
      {!running && c.dev && job.error && <span className="ml-1 font-mono text-muted-foreground">{String(job.error).slice(0, 160)}</span>}
    </p>
  );
}

/** The control that takes the place of `{value}` in the sentence: a choice, a time, a short text. */
function InlineControl({ line, busy, pending, onChoose }: { line: MapLine; busy: boolean; pending: unknown; onChoose: (v: unknown) => void }) {
  const e = line.editable!;
  if (e.kind === 'option' && e.options) {
    const current = pending !== undefined ? String(pending) : String(e.value ?? '');
    return (
      <select value={current} disabled={busy} onChange={ev => onChoose(ev.target.value)} aria-label={plainText(line)} autoFocus
        className="mx-0.5 min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold">
        {!e.options.some(o => o.value === current) && <option value={current}>{valueLabel(line) || '—'}</option>}
        {e.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (e.kind === 'schedule') return <TimeControl line={line} busy={busy} onChoose={onChoose} />;
  return <InlineText line={line} busy={busy} onChoose={onChoose} />;
}

function InlineText({ line, busy, onChoose }: { line: MapLine; busy: boolean; onChoose: (v: unknown) => void }) {
  const initial = String(line.editable?.value ?? '');
  const [value, setValue] = useState(initial);
  const changed = value.trim() !== initial.trim() && value.trim() !== '';
  return (
    <form className="mx-0.5 inline-flex flex-wrap items-center gap-1 align-middle" onSubmit={ev => { ev.preventDefault(); if (changed) onChoose(value.trim()); }}>
      <Input value={value} onChange={ev => setValue(ev.target.value)} disabled={busy} autoFocus aria-label={plainText(line)} className="h-9 w-56" />
      <Button type="submit" size="sm" variant="outline" disabled={!changed || busy} className="min-h-9">{t('am_take')}</Button>
    </form>
  );
}

/** A schedule as the owner thinks of it — a time of day; the rest of the schedule stays as it is. */
function TimeControl({ line, busy, onChoose }: { line: MapLine; busy: boolean; onChoose: (v: unknown) => void }) {
  const cron = String(line.editable?.value ?? '');
  const parsed = cronTime(cron);
  const initial = parsed ? `${pad(parsed.h)}:${pad(parsed.m)}` : '';
  const [value, setValue] = useState(initial);
  if (!parsed) {
    const known = SCHEDULE_PRESETS.some(p => p.value === cron);
    return (
      <select value={known ? cron : ''} disabled={busy} onChange={ev => { if (ev.target.value) onChoose(ev.target.value); }} aria-label={plainText(line)}
        className="mx-0.5 min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm font-semibold">
        {!known && <option value="">{valueLabel(line) || '—'}</option>}
        {SCHEDULE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label()}</option>)}
      </select>
    );
  }
  const changed = value !== initial && /^\d{2}:\d{2}$/.test(value);
  const submit = () => { const [h, m] = value.split(':').map(Number); onChoose(`${m} ${h} ${parsed.rest}`); };
  return (
    <form className="mx-0.5 inline-flex flex-wrap items-center gap-1 align-middle" onSubmit={ev => { ev.preventDefault(); if (changed) submit(); }}>
      <input type="time" value={value} onChange={ev => setValue(ev.target.value)} disabled={busy} autoFocus aria-label={plainText(line)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold" />
      <Button type="submit" size="sm" variant="outline" disabled={!changed || busy} className="min-h-9">{t('am_take')}</Button>
    </form>
  );
}

/** The editors that need room under the sentence: conditions, a rule, a file, a choice with a file. */
function BlockEditor({ line, busy, pending, picked, onChoose, onPick }: { line: MapLine; busy: boolean; pending: unknown; picked: File | null; onChoose: (v: unknown) => void; onPick: (f: File) => void }) {
  const e = line.editable!;
  if (e.kind === 'filter') return <FilterEditor line={line} busy={busy} onSave={onChoose} />;
  if (e.kind === 'file') return <UploadControl busy={busy} picked={picked} onPick={onPick} />;
  if (e.kind === 'option' && e.options) {
    const current = pending !== undefined ? String(pending) : String(e.value ?? '');
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={plainText(line)}>
          {e.options.map(o => {
            const active = current === o.value;
            return (
              <label key={o.value} className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm sm:min-h-9 ${active ? 'border-primary bg-primary/10' : 'border-border'}`}>
                <input type="radio" name={line.id} value={o.value} checked={active} disabled={busy} onChange={() => onChoose(o.value)} className="accent-primary" />{o.label}
              </label>
            );
          })}
        </div>
        {e.file && <UploadControl busy={busy} picked={picked} onPick={onPick} />}
      </div>
    );
  }
  return <TextEditor id={line.id} initial={String(e.value ?? '')} busy={busy} onSave={onChoose} />;
}

function UploadControl({ busy, picked, onPick }: { busy: boolean; picked: File | null; onPick: (f: File) => void }) {
  if (picked) return <span className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm"><IconPaperclip size={14} aria-hidden="true" />{picked.name}</span>;
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm text-muted-foreground sm:min-h-9">
      <IconUpload size={16} aria-hidden="true" />{t('am_upload')}
      <input type="file" className="sr-only" disabled={busy} onChange={ev => { const f = ev.target.files?.[0]; if (f) onPick(f); ev.target.value = ''; }} />
    </label>
  );
}

function TextEditor({ id, initial, busy, onSave }: { id: string; initial: string; busy: boolean; onSave: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  useEffect(() => { setValue(initial); }, [initial]);
  const changed = value.trim() !== initial.trim();
  return (
    <form className="flex flex-wrap items-start gap-2" onSubmit={ev => { ev.preventDefault(); if (changed) onSave(value.trim()); }}>
      <textarea id={`${id}-input`} value={value} onChange={ev => setValue(ev.target.value)} rows={3} disabled={busy} className="min-w-[16rem] flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm" />
      <Button type="submit" size="sm" variant="outline" disabled={!changed || busy} className="min-h-11 sm:min-h-9">{t('am_take')}</Button>
    </form>
  );
}

function FilterEditor({ line, busy, onSave }: { line: MapLine; busy: boolean; onSave: (v: FilterValue) => void }) {
  const e = line.editable!;
  const fields = e.fields ?? [];
  const initial = (e.value as FilterValue | null) ?? { mode: 'all', conditions: [] };
  const [mode, setMode] = useState<'all' | 'any'>(initial.mode === 'any' ? 'any' : 'all');
  const [conds, setConds] = useState<FilterCondition[]>(initial.conditions ?? []);
  useEffect(() => { setMode(initial.mode === 'any' ? 'any' : 'all'); setConds(initial.conditions ?? []); }, [e.value]);  // eslint-disable-line react-hooks/exhaustive-deps
  const fieldOf = (key: string) => fields.find(f => f.key === key);
  const update = (i: number, patch: Partial<FilterCondition>) => setConds(cs => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => setConds(cs => cs.filter((_, k) => k !== i));
  const add = () => setConds(cs => [...cs, { field: fields[0]?.key ?? '', op: 'eq', value: fields[0]?.options?.[0]?.value ?? '' }]);
  const dirty = JSON.stringify({ mode, conditions: conds }) !== JSON.stringify({ mode: initial.mode ?? 'all', conditions: initial.conditions ?? [] });
  return (
    <div className="space-y-2">
      {conds.length > 1 && (
        <select value={mode} disabled={busy} onChange={ev => setMode(ev.target.value as 'all' | 'any')} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm">
          <option value="all">{t('am_mode_all')}</option><option value="any">{t('am_mode_any')}</option>
        </select>
      )}
      {conds.map((c, i) => {
        const f = fieldOf(c.field);
        const needsValue = c.op !== 'empty' && c.op !== 'not_empty';
        return (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select value={c.field} disabled={busy} onChange={ev => update(i, { field: ev.target.value, value: fieldOf(ev.target.value)?.options?.[0]?.value ?? '' })} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm">
              {fields.map(fl => <option key={fl.key} value={fl.key}>{fl.label}</option>)}
            </select>
            <select value={c.op} disabled={busy} onChange={ev => update(i, { op: ev.target.value as FilterCondition['op'] })} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm">
              {OPS.map(op => <option key={op} value={op}>{t(`am_op_${op}`)}</option>)}
            </select>
            {needsValue && f?.options ? (
              <select value={String(c.value ?? '')} disabled={busy} onChange={ev => update(i, { value: ev.target.value })} className="min-h-9 rounded-md border border-input bg-background px-2 py-1 text-sm">
                {f.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : needsValue ? <Input value={String(c.value ?? '')} disabled={busy} onChange={ev => update(i, { value: f?.type === 'number' ? Number(ev.target.value) : ev.target.value })} className="w-40" /> : null}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => remove(i)} aria-label={t('am_remove')} className="min-h-11 sm:min-h-8"><IconX size={14} aria-hidden="true" /></Button>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy || fields.length === 0} onClick={add} className="min-h-11 gap-1 sm:min-h-8"><IconPlus size={14} aria-hidden="true" />{t('am_add_condition')}</Button>
        {conds.length > 0 && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setConds([])} className="min-h-11 sm:min-h-8">{t('am_all')}</Button>}
        <Button type="button" size="sm" variant="outline" disabled={!dirty || busy} onClick={() => onSave({ mode, conditions: conds })} className="min-h-11 sm:min-h-8">{t('am_take')}</Button>
      </div>
    </div>
  );
}
