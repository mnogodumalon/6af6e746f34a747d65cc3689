// Client for the page job (Klar service, POST /claude/build/pages): ONE flow or
// public page created, changed or removed from a prompt typed in the dashboard.
//
// Same-origin like publicPagesAdmin.ts: `credentials: 'include'` carries the LA
// session; Klar resolves it to the owner's API key. The response is the build's
// SSE stream — this module reads it and turns the lines into callbacks, the
// dialog renders them. A closed tab does not stop the job: it runs in Klar's
// sandbox, and VersionCheck notices the new deploy on its own.

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
const ENDPOINT = '/claude/build/pages';

export type PageKind = 'flow' | 'public';
export type PageOp = 'create' | 'edit' | 'delete';

export interface PageJobRequest {
  kind: PageKind;
  op: PageOp;
  /** slug — required for edit and delete */
  target?: string;
  /** required for create and edit */
  prompt?: string;
}

export interface PageJobStage {
  id: string;
  label?: string;
  detail?: string;
  pct?: number;
}

export interface PageJobHandlers {
  onStage?: (stage: PageJobStage) => void;
  onStatus?: (line: string) => void;
  onWarning?: (line: string) => void;
}

/** One job as the lists show it (GET /claude/build/pages/{appgroup}). */
export interface PageJobRecord {
  id: string;
  kind: PageKind;
  op: PageOp;
  /** slug of the page an edit/delete targets; null for a create */
  target: string | null;
  prompt: string;
  status: 'running' | 'done' | 'failed';
  error: string | null;
  /** the page's slug once known (create: after the lane reported) */
  slug: string | null;
  /** unix seconds */
  started_at: number;
  finished_at: number | null;
}

export async function listPageJobs(): Promise<PageJobRecord[]> {
  const resp = await fetch(`${ENDPOINT}/${APPGROUP_ID}`, { credentials: 'include' });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const body = (await resp.json()) as { jobs?: PageJobRecord[] };
  return body.jobs ?? [];
}

export async function dismissPageJob(jobId: string): Promise<void> {
  const resp = await fetch(`${ENDPOINT}/${APPGROUP_ID}/${encodeURIComponent(jobId)}`, { method: 'DELETE', credentials: 'include' });
  if (!resp.ok && resp.status !== 404) throw new Error(`HTTP ${resp.status}`);
}

export type PageJobOutcome =
  | { status: 'done'; codebase?: string }
  | { status: 'busy'; ageSeconds: number; kindLabel?: string }
  | { status: 'error'; message: string };

/** Runs the job and resolves when the stream ends. Never throws for a
 *  server-side failure — that is an `error` outcome with the message the
 *  build printed; only a broken connection rejects. */
export async function startPageJob(req: PageJobRequest, handlers: PageJobHandlers = {}): Promise<PageJobOutcome> {
  const resp = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ appgroup_id: APPGROUP_ID, ...req }),
  });
  if (!resp.ok || !resp.body) {
    let detail = `HTTP ${resp.status}`;
    try {
      const body = await resp.json();
      detail = typeof body?.detail === 'string' ? body.detail : JSON.stringify(body?.detail ?? body);
    } catch { /* keep the status */ }
    return { status: 'error', message: detail };
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outcome: PageJobOutcome | null = null;
  let codebase: string | undefined;

  while (outcome === null) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data: ')) continue;
      const content = line.slice(6);
      if (content.startsWith('[STAGE] ')) {
        try { handlers.onStage?.(JSON.parse(content.slice(8)) as PageJobStage); } catch { /* ignore */ }
      } else if (content.startsWith('[UPDATED] ')) {
        try { codebase = (JSON.parse(content.slice(10)) as { codebase?: string }).codebase; } catch { /* ignore */ }
      } else if (content.startsWith('[BUSY] ')) {
        let info: { age_seconds?: number; kind_label?: string } = {};
        try { info = JSON.parse(content.slice(7)); } catch { /* ignore */ }
        outcome = { status: 'busy', ageSeconds: info.age_seconds ?? 0, kindLabel: info.kind_label };
        try { reader.cancel(); } catch { /* ignore */ }
        break;
      } else if (content.startsWith('[ERROR] ')) {
        outcome = { status: 'error', message: content.slice(8).trim() };
      } else if (content.startsWith('[DONE]')) {
        outcome = outcome ?? { status: 'done', codebase };
        break;
      } else if (content.startsWith('[WARNING] ')) {
        handlers.onWarning?.(content.slice(10).trim());
      } else if (content.startsWith('[STATUS] ')) {
        handlers.onStatus?.(content.slice(9).trim());
      }
    }
  }
  return outcome ?? { status: 'error', message: 'stream ended without a result' };
}

/**
 * Fired on `window` whenever this tab starts or finishes a page job, so every
 * `usePageJobs` instance (sidebar, admin lists) refreshes at once instead of
 * waiting for its idle poll. Other tabs still rely on polling.
 */
export const PAGE_JOBS_EVENT = 'klar:page-jobs';

export function notifyPageJobsChanged(): void {
  window.dispatchEvent(new Event(PAGE_JOBS_EVENT));
}
