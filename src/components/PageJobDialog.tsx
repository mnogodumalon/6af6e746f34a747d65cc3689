import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconSparkles } from '@tabler/icons-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { startPageJob, notifyPageJobsChanged, type PageKind, type PageOp, type PageJobOutcome } from '@/lib/pageJobs';
import { t } from '@/i18n';

/**
 * PageJobDialog — the one place in the dashboard where a page is created,
 * changed or removed by the agent. The owner types a wish and submits; the
 * dialog CLOSES at once and the build runs in the background. The dashboard
 * stays usable meanwhile: a toast confirms the start, the sidebar shows
 * "Werden erstellt …" (IntentsNav) and the admin list shows the running row
 * with its stages (PageJobStatus) — both refresh immediately through
 * PAGE_JOBS_EVENT. When the job ends, a toast offers "Neu laden"; on failure
 * the toast names the error and the admin list keeps the failed row with
 * "Erneut versuchen". Delete asks for confirmation and runs without a prompt.
 *
 * Nothing about the running job lives in this dialog after submit — the job
 * runs server-side, and reopening the dialog starts a fresh wish.
 */
export interface PageJobTarget {
  slug: string;
  title: string;
}

export interface PageJobDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PageKind;
  op: PageOp;
  target?: PageJobTarget;
  /** Called after a successful job (the caller may refresh its list). */
  onDone?: () => void;
  /** Called when a job was started (running) — lists start polling faster. */
  onStarted?: () => void;
  /** Prefill — a retry of a failed job reopens with its prompt. */
  initialPrompt?: string;
}

type Phase = 'idle' | 'starting' | 'busy' | 'error';

function titleKey(kind: PageKind, op: PageOp): string {
  return `pj_title_${op}_${kind}`;
}

export function PageJobDialog({ open, onOpenChange, kind, op, target, onDone, onStarted, initialPrompt }: PageJobDialogProps) {
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) {
      // A fresh dialog per wish; a running job keeps running server-side.
      setPrompt('');
      setPhase('idle');
      setMessage('');
    } else if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [open, initialPrompt]);

  const needsPrompt = op !== 'delete';
  const canStart = phase === 'idle' || phase === 'error' || phase === 'busy';
  const startDisabled = !canStart || (needsPrompt && prompt.trim().length < 3);
  const title = t(titleKey(kind, op));
  const errorHint = t(kind === 'flow' ? 'pj_toast_error_hint_flow' : 'pj_toast_error_hint_public');

  const run = async () => {
    setPhase('starting');
    setMessage('');
    const jobTitle = target ? `${title}: ${target.title}` : title;
    onStarted?.();
    notifyPageJobsChanged();
    // Close now — the build is a background job, the dashboard stays usable.
    onOpenChange(false);
    toast(jobTitle, { description: t('pj_toast_started'), duration: 6000 });

    let outcome: PageJobOutcome;
    try {
      outcome = await startPageJob({ kind, op, target: target?.slug, prompt: needsPrompt ? prompt.trim() : undefined });
    } catch {
      notifyPageJobsChanged();
      toast.error(jobTitle, { description: t('pj_error_network'), duration: 12000 });
      return;
    }
    notifyPageJobsChanged();
    if (outcome.status === 'done') {
      onDone?.();
      toast.success(jobTitle, {
        description: t(op === 'delete' ? 'pj_done_delete' : 'pj_done'),
        duration: 20000,
        action: { label: t('pj_reload'), onClick: () => window.location.reload() },
      });
    } else if (outcome.status === 'busy') {
      toast.warning(jobTitle, {
        description: t('pj_busy', { minutes: Math.max(1, Math.floor(outcome.ageSeconds / 60)) }),
        duration: 12000,
      });
    } else {
      toast.error(`${t('pj_failed')}: ${outcome.message}`, { description: errorHint, duration: 20000 });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {target ? <DialogDescription>{target.title}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-3">
          {needsPrompt ? (
            <>
              <label htmlFor="pj-prompt" className="text-sm font-medium">{t('pj_prompt_label')}</label>
              <Textarea
                id="pj-prompt"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={4}
                autoFocus
                placeholder={op === 'edit' ? t('pj_prompt_edit_placeholder') : t(kind === 'flow' ? 'pj_prompt_placeholder_flow' : 'pj_prompt_placeholder_public')}
              />
              <p className="text-xs text-muted-foreground">{t('pj_prompt_hint')}</p>
            </>
          ) : (
            <p className="text-sm">{t(kind === 'flow' ? 'pj_delete_flow_text' : 'pj_delete_public_text')}</p>
          )}
          {phase === 'error' ? (
            <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              <IconAlertTriangle size={16} stroke={1.5} className="mt-0.5 shrink-0" />
              <span><span className="font-medium">{t('pj_failed')}:</span> {message}</span>
            </div>
          ) : null}
          {phase === 'busy' ? (
            <p className="text-sm text-muted-foreground" role="status">{message}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('pj_cancel')}</Button>
          <Button variant={op === 'delete' ? 'destructive' : 'default'} disabled={startDisabled} onClick={run}>
            {op !== 'delete' ? <IconSparkles size={16} stroke={1.5} className="mr-1" /> : null}
            {t(op === 'delete' ? 'pj_start_delete' : op === 'edit' ? 'pj_start_edit' : 'pj_start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
