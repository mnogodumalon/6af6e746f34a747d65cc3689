import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconRoute, IconExternalLink, IconPencil, IconTrash, IconPlus, IconAdjustments } from '@tabler/icons-react';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { PageJobDialog, type PageJobTarget } from '@/components/PageJobDialog';
import { JobStateBadge, JobStateRow } from '@/components/PageJobStatus';
import { usePageJobs } from '@/hooks/usePageJobs';
import type { PageJobRecord } from '@/lib/pageJobs';
import { INTENTS, type IntentLink } from '@/config/intents';
import { loadIntentPolicies, intentPolicyCount, type IntentPoliciesArtifact } from '@/lib/journey/intentPolicy';
import { t, locale } from '@/i18n';
import type { PageOp } from '@/lib/pageJobs';

/**
 * IntentsAdmin — the owner's management page for the guided flows
 * ("Abläufe"): what exists, one prompt to create a new one, one prompt to
 * change an existing one, one click (with confirmation) to remove one. Every
 * action is a page job (POST /claude/build/pages) — the agent builds, the
 * integration band checks, the dashboard reloads. The list is the compiled
 * registry (src/config/intents.ts), so it is exactly what the sidebar shows.
 */
function labelOf(intent: IntentLink): string {
  return typeof intent.label === 'string'
    ? intent.label
    : (intent.label as Record<string, string | undefined>)[locale] ?? intent.label.de ?? intent.label.en ?? intent.label.cs ?? '';
}

function descriptionOf(intent: IntentLink): string {
  const d = intent.description;
  if (!d) return '';
  return typeof d === 'string' ? d : (d as Record<string, string | undefined>)[locale] ?? d.de ?? d.en ?? d.cs ?? '';
}

function slugOf(intent: IntentLink): string {
  return intent.path.replace(/\/+$/, '').split('/').pop() ?? intent.path;
}

export default function IntentsAdmin() {
  const [job, setJob] = useState<{ op: PageOp; target?: PageJobTarget; initialPrompt?: string } | null>(null);
  const navigate = useNavigate();
  // The owner's field policies (intent-policies.json) — only the badge needs them here.
  const [policies, setPolicies] = useState<IntentPoliciesArtifact | null>(null);
  useEffect(() => { void loadIntentPolicies(true).then(setPolicies); }, []);
  const { jobs, refresh } = usePageJobs('flow');
  // A create job has no row of its own yet; edit/delete jobs decorate their page's row.
  const createJobs = jobs.filter(j => !j.target && j.status !== 'done');
  const jobFor = (slug: string) => jobs.find(j => j.target === slug && j.status !== 'done');
  const retry = (j: PageJobRecord) => {
    const target = j.target ? { slug: j.target, title: j.target } : undefined;
    setJob({ op: j.op, target, initialPrompt: j.prompt });
    void dismissAndRefresh(j.id);
  };
  const dismissAndRefresh = async (id: string) => {
    const { dismissPageJob } = await import('@/lib/pageJobs');
    try { await dismissPageJob(id); } catch { /* the badge stays until the next poll */ }
    void refresh();
  };

  return (
    <PageShell
      title={t('ia_title')}
      subtitle={t('ia_subtitle')}
      action={(
        <Button onClick={() => setJob({ op: 'create' })}>
          <IconPlus size={16} stroke={1.5} className="mr-1" />
          {t('ia_new')}
        </Button>
      )}
    >

      {INTENTS.length === 0 && createJobs.length === 0 ? (
        <div className="rounded-[27px] bg-card shadow-lg p-8 text-center text-muted-foreground">
          {t('ia_empty')}
        </div>
      ) : (
        <div className="rounded-[27px] bg-card shadow-lg overflow-hidden divide-y divide-border">
          {createJobs.map(j => (
            <JobStateRow key={j.id} job={j} onRetry={retry} onDismissed={() => void refresh()} />
          ))}
          {INTENTS.map(intent => {
            const slug = slugOf(intent);
            const title = labelOf(intent);
            const description = descriptionOf(intent);
            const rowJob = jobFor(slug);
            return (
              <div key={intent.path} className="flex items-center gap-4 px-6 py-4 min-w-0">
                <IconRoute size={20} stroke={1.5} className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate font-medium">{title}</span>
                    {intentPolicyCount(policies, slug) > 0 ? (
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                        {t('ppa_policy_changed', { n: intentPolicyCount(policies, slug) })}
                      </span>
                    ) : null}
                    {rowJob ? <JobStateBadge job={rowJob} /> : null}
                    {rowJob?.status === 'failed' ? (
                      <button type="button" onClick={() => retry(rowJob)} className="shrink-0 text-xs text-primary underline underline-offset-2">{t('pj_retry')}</button>
                    ) : null}
                  </div>
                  {rowJob?.status === 'failed' && rowJob.error ? <div className="truncate text-xs text-destructive/80" title={rowJob.error}>{rowJob.error}</div> : null}
                  {description ? <div className="truncate text-xs text-muted-foreground">{description}</div> : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    to={intent.path}
                    title={t('ia_open')}
                    aria-label={t('ia_open')}
                    className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <IconExternalLink size={18} stroke={1.5} />
                  </Link>
                  <button
                    type="button"
                    title={t('ppa_policy_title')}
                    aria-label={t('ppa_policy_title')}
                    onClick={() => navigate(`/verwaltung/ablaeufe/${encodeURIComponent(slug)}/felder`)}
                    className={`p-2 rounded-xl transition-colors ${intentPolicyCount(policies, slug) > 0 ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
                  >
                    <IconAdjustments size={18} stroke={1.5} />
                  </button>
                  <button
                    type="button"
                    title={t('ia_edit')}
                    aria-label={t('ia_edit')}
                    onClick={() => setJob({ op: 'edit', target: { slug, title } })}
                    className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <IconPencil size={18} stroke={1.5} />
                  </button>
                  <button
                    type="button"
                    title={t('ia_delete')}
                    aria-label={t('ia_delete')}
                    onClick={() => setJob({ op: 'delete', target: { slug, title } })}
                    className="p-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <IconTrash size={18} stroke={1.5} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PageJobDialog
        open={job !== null}
        onOpenChange={v => !v && setJob(null)}
        kind="flow"
        op={job?.op ?? 'create'}
        target={job?.target}
        initialPrompt={job?.initialPrompt}
        onStarted={() => void refresh()}
        onDone={() => void refresh()}
      />
    </PageShell>
  );
}
