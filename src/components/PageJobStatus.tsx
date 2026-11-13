import { useEffect, useState } from 'react';
import { IconLoader2, IconAlertTriangle, IconRefresh, IconX } from '@tabler/icons-react';
import { dismissPageJob, type PageJobRecord } from '@/lib/pageJobs';
import { t } from '@/i18n';

/**
 * PageJobStatus — the state of a page next to the page, in the lists.
 *
 *   <JobStateBadge job={job} />          running/failed edit or delete of an
 *                                         existing page, rendered inside its row
 *   <JobStateRow job={job} onRetry … />  a create job: the page does not exist
 *                                         yet, so it gets a row of its own
 *
 * The state comes from /claude/build/pages (usePageJobs). A failed job stays
 * until the owner retries (the dialog reopens with the same prompt) or
 * dismisses it — nothing fails silently any more.
 */

function useElapsed(since: number, active: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  const s = Math.max(0, Math.round(now / 1000 - since));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function runningLabel(op: PageJobRecord['op']): string {
  return t(op === 'delete' ? 'pj_state_running_delete' : op === 'edit' ? 'pj_state_running_edit' : 'pj_state_running_create');
}

export function JobStateBadge({ job }: { job: PageJobRecord }) {
  const elapsed = useElapsed(job.started_at, job.status === 'running');
  if (job.status === 'running') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground" role="status">
        <IconLoader2 size={12} stroke={1.5} className="animate-spin" />
        {runningLabel(job.op)} · <span className="tabular-nums">{elapsed}</span>
      </span>
    );
  }
  if (job.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive" role="status" title={job.error ?? undefined}>
        <IconAlertTriangle size={12} stroke={1.5} />
        {t('pj_state_failed')}
      </span>
    );
  }
  return null;
}

export interface JobStateRowProps {
  job: PageJobRecord;
  onRetry: (job: PageJobRecord) => void;
  onDismissed: () => void;
}

export function JobStateRow({ job, onRetry, onDismissed }: JobStateRowProps) {
  const elapsed = useElapsed(job.started_at, job.status === 'running');
  const [busy, setBusy] = useState(false);
  if (job.status === 'done') return null;
  const dismiss = async () => {
    setBusy(true);
    try {
      await dismissPageJob(job.id);
      onDismissed();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-4 px-6 py-4 min-w-0" role="status">
      {job.status === 'running' ? (
        <IconLoader2 size={20} stroke={1.5} className="shrink-0 animate-spin text-primary" />
      ) : (
        <IconAlertTriangle size={20} stroke={1.5} className="shrink-0 text-destructive" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate font-medium">{job.prompt || runningLabel(job.op)}</span>
          {job.status === 'running' ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{runningLabel(job.op)} · {elapsed}</span>
          ) : (
            <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">{t('pj_state_failed')}</span>
          )}
        </div>
        {job.status === 'failed' && job.error ? (
          <div className="truncate text-xs text-destructive/80" title={job.error}>{job.error}</div>
        ) : null}
      </div>
      {job.status === 'failed' ? (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            title={t('pj_retry')}
            aria-label={t('pj_retry')}
            onClick={() => onRetry(job)}
            className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <IconRefresh size={18} stroke={1.5} />
          </button>
          <button
            type="button"
            title={t('pj_dismiss')}
            aria-label={t('pj_dismiss')}
            disabled={busy}
            onClick={() => void dismiss()}
            className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <IconX size={18} stroke={1.5} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
