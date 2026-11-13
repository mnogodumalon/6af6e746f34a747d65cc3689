/**
 * src/components/ToolButton.tsx — start a MANUAL tool of the plan at a record (generated, never edit).
 *
 *   <ToolButton tool="auswertung-mit-ki" recordId={a.record_id} label={tx('Auswertung mit KI')} />
 *
 * S-21 (Abnahme 6, 04.11.2026): the manual AI tool was reachable only through
 * „Alle Aktionen“ — the moderator never found it. A manual tool of the plan that
 * works on ONE record belongs on that record's card or overlay. The button finds
 * the live tool by its plan marker `[klar:<id>]` (the actions agent names tools
 * itself), runs it through `/actions-agent/execute` with
 * `inputs.record_id = recordId`, shows how long it has been running, says the
 * tool's first output line when it is done and tells the page to re-read.
 * Renders nothing while the tool does not exist (not built yet, removed).
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { tx } from '@/i18n';

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
type LiveTool = { app_id: string; identifier: string };
let listing: Promise<Record<string, LiveTool>> | null = null;

/** plan id → the live tool carrying its marker, read once per page load. */
function liveTools(): Promise<Record<string, LiveTool>> {
  listing ??= fetch(`/actions-agent/actions?appgroup_id=${encodeURIComponent(APPGROUP_ID)}`, { credentials: 'include' })
    .then(r => (r.ok ? r.json() : { apps: [] }))
    .then((data: { apps?: { app_id?: string; actions?: { identifier?: string; action_identifier?: string; description?: string; metadata?: { description?: string } }[] }[] }) => {
      const out: Record<string, LiveTool> = {};
      for (const app of data.apps ?? []) {
        for (const a of app.actions ?? []) {
          const ident = a.identifier ?? a.action_identifier ?? '';
          for (const m of (a.metadata?.description ?? a.description ?? '').matchAll(/\[klar:([a-z0-9][a-z0-9-]*)\]/g)) {
            if (app.app_id && ident) out[m[1]] ??= { app_id: app.app_id, identifier: ident };
          }
        }
      }
      return out;
    })
    .catch(() => ({}));
  return listing;
}

export interface ToolButtonProps {
  /** The plan's tool id (the `[klar:<id>]` marker). */
  tool: string;
  /** The record the tool works on — sent as `inputs.record_id`. */
  recordId?: string | null;
  label: string;
  variant?: 'default' | 'outline' | 'secondary' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function ToolButton({ tool, recordId, label, variant = 'outline', size = 'sm', className }: ToolButtonProps) {
  const [live, setLive] = useState<LiveTool | null | undefined>(undefined);
  const [started, setStarted] = useState<number | null>(null);
  // the outcome stays next to the button (S-25, Abnahme 7: a toast after an 80-s run went unseen)
  const [outcome, setOutcome] = useState<{ ok: boolean; text: string } | null>(null);
  const [, tick] = useState(0);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    let alive = true;
    void liveTools().then(map => { if (alive) setLive(map[tool] ?? null); });
    return () => { alive = false; };
  }, [tool]);
  useEffect(() => () => { if (timer.current !== null) window.clearInterval(timer.current); }, []);
  if (!live) return null;

  const run = async () => {
    if (started !== null) return;
    setOutcome(null);
    setStarted(Date.now());
    timer.current = window.setInterval(() => tick(n => n + 1), 1000);
    try {
      const form = new FormData();
      form.append('app_id', live.app_id);
      form.append('action_identifier', live.identifier);
      form.append('inputs', JSON.stringify(recordId ? { record_id: recordId } : {}));
      const res = await fetch('/actions-agent/execute', { method: 'POST', body: form, credentials: 'include' });
      const body = (await res.json().catch(() => ({}))) as { stdout?: string; error?: string | null };
      if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`);
      const said = (body.stdout ?? '').split('\n').map(s => s.trim()).find(Boolean);
      const done = said || tx('Fertig: {label}', { label });
      toast.success(done);
      setOutcome({ ok: true, text: done });
      window.dispatchEvent(new CustomEvent('assistant:data-changed'));
    } catch (err) {
      const failed = tx('„{label}“ hat nicht geklappt: {reason}', { label, reason: err instanceof Error ? err.message : String(err) });
      toast.error(failed);
      setOutcome({ ok: false, text: failed });
    } finally {
      if (timer.current !== null) window.clearInterval(timer.current);
      timer.current = null;
      setStarted(null);
    }
  };

  const seconds = started !== null ? Math.round((Date.now() - started) / 1000) : 0;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant={variant} size={size} className={className} onClick={() => { void run(); }} disabled={started !== null} data-tool={tool}>
        {started !== null ? tx('{label} läuft … {s} s', { label, s: seconds }) : label}
      </Button>
      {outcome ? (
        <span role="status" data-tool-outcome={outcome.ok ? 'ok' : 'failed'} className={`text-xs ${outcome.ok ? 'text-muted-foreground' : 'text-destructive'}`}>{outcome.text}</span>
      ) : null}
    </span>
  );
}

export default ToolButton;
