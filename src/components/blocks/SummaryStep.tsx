import { useEffect, type ReactNode, useState } from 'react';
import { getAppMapCached, markSeen } from '@/lib/appMap';
import { Button } from '@/components/ui/button';
import { IconAlertCircle, IconCheck, IconCircleDashed, IconLoader2, IconX } from '@tabler/icons-react';
import { t } from '@/i18n';
import { planProvidedKeys } from '@/lib/journey/port';
import { EMPTY_VALUE } from '@/lib/journey/format';
import { withRecordNames } from '@/lib/journey/recordLabels';
import { mergeSummaryRows } from '@/lib/journey/summary';
import { useFailingLists } from '@/lib/journey/useLiveList';
import { entityLabel, isUnfilled } from '@/lib/journey/rules';
import type { StepForm, SummaryItem } from '@/lib/journey/useStepForm';
import { stepVerb, type JourneySubmit, type PlanStep } from '@/lib/journey/useJourneySubmit';
import { useWizard } from './IntentWizardShell';

/**
 * SummaryStep — "Check your answers" before anything is written.
 *
 *   <SummaryStep forms={[buchung]} submit={submit} whatHappensNext="Die Buchung erscheint sofort im Belegungsplan." />
 *
 * Every answer, grouped by the step that asked it, with a "Change" link that
 * jumps back to that step AND puts focus into the field; Continue there
 * returns here. Missing required fields are listed as links and disable
 * Confirm — the page never computes that itself. While the plan runs, every
 * write shows its own status; a failure keeps the entries, names what is
 * already saved and offers a retry that only repeats what failed.
 *
 * `forms` and `submit` are required by type: a summary cannot be rendered
 * without the data it summarizes or the runner it confirms.
 */
export interface SummaryStepProps {
  forms: StepForm[];
  submit: JourneySubmit;
  title?: string;
  /** One or two sentences: what happens after Confirm. */
  whatHappensNext?: ReactNode;
  confirmLabel?: string;
  /** The ways the flow may END (PV-14): one button each, the first is the
   *  default — from the plan via `variants={flow.actions}`. Without it: one confirm. */
  variants?: Array<{ id: string; label: string; confirm: () => Promise<unknown> }>;
  /** Extra rows the forms do not know about (a computed total, a picked option). */
  items?: SummaryItem[];
  /** Override the jump: default uses the shell (goTo step + focus field + return here). */
  onEdit?: (step: number, fieldId?: string) => void;
  /** Rendered between the answers and the confirm area. */
  children?: ReactNode;
}

function stepLabelOf(step: PlanStep): string {
  if (step.label) return step.label;
  if (step.entity) return entityLabel(step.entity);
  return step.key;
}

export function SummaryStep({
  forms,
  submit,
  title,
  whatHappensNext,
  confirmLabel,
  variants,
  items = [],
  onEdit,
  children,
}: SummaryStepProps) {
  const wizard = useWizard();

  // The rows below ARE the answers — the shell's chips above would double them.
  const suppressChips = wizard?.suppressChips;
  useEffect(() => suppressChips?.(), [suppressChips]);
  // "Alles richtig?" is this step's heading — the shell's would double it.
  const suppressHeading = wizard?.suppressHeading;
  useEffect(() => suppressHeading?.(), [suppressHeading]);

  // A required field the PLAN fills at submit (a `link` to an earlier step's
  // record, a `values` entry) is nobody's answer: it would show as "Patient —"
  // here (live) although nothing is missing. The success page already hides it.
  const answered = (f: StepForm): SummaryItem[] => {
    const provided = planProvidedKeys(submit.plan.find(s => s.form === f));
    return f.summary().filter(r => !(r.value === EMPTY_VALUE && (r.keys ?? []).length > 0 && (r.keys ?? []).every(k => provided.has(k))));
  };
  // The record an update step CHANGES comes first — it is the answer to
  // "which one?", and no form carries it (the target is a pick, not a field).
  const targetRows: SummaryItem[] = submit.plan.flatMap(s => {
    const row = s.target?.();
    return row ? [row] : [];
  });
  // Page `items` refine, never double: an item covering a form field's keys
  // (or its label in the same step) replaces that form row.
  // entries of a list (several records of one entity): their rows come from the plan step, not from a form
  const listRows: SummaryItem[] = submit.plan.flatMap(s => s.review?.() ?? []);
  const rows: SummaryItem[] = mergeSummaryRows([...targetRows, ...forms.flatMap(answered), ...listRows], items);
  const groups = new Map<number | undefined, SummaryItem[]>();
  for (const row of rows) {
    const list = groups.get(row.step) ?? [];
    list.push(row);
    groups.set(row.step, list);
  }
  const groupKeys = [...groups.keys()].sort((a, b) => (a ?? Infinity) - (b ?? Infinity));
  // What the flow sets itself (a status, a type) — after the answers, with
  // the link to „Nach dem Bau“ where the owner changes it. Not an answer, so
  // never merged with the form rows and never "missing".
  const settingRows: SummaryItem[] = submit.plan.flatMap(s => s.settings?.() ?? []);
  // The planner's assumptions that first act here, shown ONCE: the plan
  // remembers `seen` / `answered`, read from the map (cached per page load).
  const notices = submit.plan.flatMap(s => s.notices?.() ?? []);
  const [noticeState, setNoticeState] = useState<Record<string, { seen: boolean; answered: boolean }> | null>(null);
  useEffect(() => {
    if (notices.length === 0) return;
    let alive = true;
    getAppMapCached().then(st => {
      if (!alive) return;
      if (!st.canChange) { setNoticeState({}); return; }   // an assumption is the owner's to settle, not the staff's
      const out: Record<string, { seen: boolean; answered: boolean }> = {};
      for (const n of notices) {
        const line = st.map?.lines.find(l => l.id === `question:${n.id}`);
        out[n.id] = { seen: !!line?.seen, answered: !!line?.answered };
      }
      setNoticeState(out);
    }).catch(() => setNoticeState({}));
    return () => { alive = false; };
  }, [notices.length]);  // eslint-disable-line react-hooks/exhaustive-deps
  const openNotices = noticeState ? notices.filter(n => noticeState[n.id] && !noticeState[n.id].seen && !noticeState[n.id].answered) : [];
  const seenNotice = (id: string) => {
    setNoticeState(prev => prev ? { ...prev, [id]: { ...prev[id], seen: true } } : prev);
    markSeen(`question:${id}`).catch(() => undefined);
  };

  // Missing = required, empty, ASKED FOR by the form (bound) and not supplied
  // by its plan step (values, link). A required field the flow never asks for
  // is nobody's input here: "Buchung anlegen" set status via plan values,
  // "Einchecken" updates a record whose room is already there — both blocked
  // the confirm with a link to nowhere (live-seen).
  // EF-13: a list this page reads failed before it ever loaded — what it shows is no value
  const failingLists = useFailingLists();
  const missing = forms.flatMap(f => {
    const provided = planProvidedKeys(submit.plan.find(s => s.form === f));
    return f.keys
      .filter(k => f.bound(k) && f.required(k) && isUnfilled(f.entity, k, f.values[k]) && !provided.has(k))
      .map(k => ({ label: f.titleOf(k), fieldId: f.fieldId(k), step: f.stepOf(k) }));
  });

  const edit = (step: number | undefined, fieldId?: string) => {
    if (step === undefined) return;
    if (onEdit) onEdit(step, fieldId);
    else wizard?.goTo(step, { focus: fieldId, returnTo: wizard.step });
  };

  // "Ändern" only where the jump leads somewhere else: a field the page
  // declared on the review step itself (live: anmeldedatum/status/bezahlt in
  // `steps: { …: 3 }` with no input on step 3) would jump to the page the
  // user is already on — a button that does nothing.
  const canEdit = (step: number | undefined) =>
    step !== undefined && step !== wizard?.step && (Boolean(onEdit) || Boolean(wizard));
  const showPlan = submit.plan.length > 1 && (submit.submitting || submit.error !== null || submit.doneCount > 0);
  const savedLabels = submit.plan.filter(s => submit.status[s.key] === 'done').map(stepLabelOf);

  return (
    <div className="space-y-6" data-journey-summary="">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{title ?? t('ss_title')}</h2>
      </div>

      {groupKeys.map(step => {
        const groupRows = groups.get(step) ?? [];
        // Rows that all derive from the SAME source (a picked record's facts,
        // `keys: ['_recordId']`) are one choice, not many fields: one "Auswahl
        // ändern" on the group instead of a per-row "Ändern" that can only lead
        // back to the picker (live-seen: Anreisedatum → Ändern → record list).
        const oneSource = groupRows.length > 1 && groupRows.every(r => (r.keys ?? []).join('|') === (groupRows[0].keys ?? []).join('|'));
        const groupEdit = oneSource && canEdit(step) ? groupRows[0] : null;
        return (
        <section key={step ?? 'none'} className="rounded-2xl border border-border bg-card overflow-hidden">
          {step !== undefined && (
            <h3 className="flex items-center justify-between gap-3 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40 border-b border-border">
              <span>{wizard?.steps[step - 1]?.label ?? t('ss_step_of', { n: step })}</span>
              {groupEdit && (
                <button
                  type="button"
                  onClick={() => edit(step, groupEdit.fieldId)}
                  className="normal-case tracking-normal text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                >
                  {t('ss_change_selection')}
                </button>
              )}
            </h3>
          )}
          {/* `@container`: the two-column row follows the CARD's width, not the
              viewport's. Next to the sidebar a 965px window leaves the card
              ~360px; the viewport `sm:` grid then squeezed the value track to
              a few pixels and "Abgeschlossen" fell apart letter by letter
              (inclou, 24.09.2026). Below 28rem the value takes its own line. */}
          <dl className="divide-y divide-border @container">
            {groupRows.map(row => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-3 items-baseline">
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-medium break-words min-w-0 col-span-2 @md:col-span-1 order-3 @md:order-none">{withRecordNames(row.value, t('v_record_unnamed'))}</dd>
                <div className="justify-self-end">
                  {!groupEdit && canEdit(row.step) && (
                    <button
                      type="button"
                      onClick={() => edit(row.step, row.fieldId)}
                      className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
                      aria-label={`${t('ss_change')}: ${row.label}`}
                    >
                      {t('ss_change')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </dl>
        </section>
      );
      })}

      {settingRows.length > 0 && (
        <section className="rounded-[27px] bg-card shadow-lg overflow-hidden" aria-label={t('ss_set_by_flow')} data-journey-settings="">
          <h3 className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-secondary border-b border-input">
            {t('ss_set_by_flow')}
          </h3>
          <dl className="divide-y divide-border @container">
            {settingRows.map(row => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-5 py-3 items-baseline">
                <dt className="text-sm text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-medium break-words min-w-0 col-span-2 @md:col-span-1 order-3 @md:order-none">{withRecordNames(row.value, t('v_record_unnamed'))}</dd>
                <div className="justify-self-end">
                  {row.href && (
                    <a href={row.href} className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded" aria-label={`${t('ss_change')}: ${row.label}`}>
                      {t('ss_change')}
                    </a>
                  )}
                </div>
              </div>
            ))}
          </dl>
        </section>
      )}

      {openNotices.length > 0 && (
        <div className="space-y-2" data-journey-notices="">
          {openNotices.map(n => (
            <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">{n.question} {t('ss_notice_assumed', { value: n.assumed })} <span className="text-muted-foreground">{t('ss_notice_once')}</span></span>
              <span className="flex gap-1">
                <button type="button" onClick={() => seenNotice(n.id)} className="rounded-lg border border-border px-3 py-1 font-semibold hover:bg-secondary">{t('ss_notice_ok')}</button>
                <a href={`#/verwaltung/anwendung?line=question:${n.id}`} className="rounded-lg px-3 py-1 font-semibold text-primary hover:underline">{t('ss_change')}</a>
              </span>
            </div>
          ))}
        </div>
      )}

      {children}

      {missing.length > 0 && (
        <p role="alert" className="text-sm text-destructive flex flex-wrap items-center gap-x-1.5">
          <IconAlertCircle size={16} aria-hidden="true" />
          <span>{t('ss_missing')}</span>
          {missing.map((m, i) => (
            <span key={m.fieldId}>
              {canEdit(m.step) ? (
                <button type="button" onClick={() => edit(m.step, m.fieldId)} className="underline underline-offset-2 hover:no-underline">
                  {m.label}
                </button>
              ) : (
                m.label
              )}
              {i < missing.length - 1 ? ',' : ''}
            </span>
          ))}
        </p>
      )}

      {showPlan && (
        <ol className="rounded-2xl border border-border bg-card divide-y divide-border" aria-live="polite">
          {submit.plan.map(step => {
            const s = submit.status[step.key] ?? 'idle';
            return (
              <li key={step.key} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                {s === 'done' && <IconCheck size={16} className="text-primary shrink-0" aria-hidden="true" />}
                {s === 'failed' && <IconX size={16} className="text-destructive shrink-0" aria-hidden="true" />}
                {s === 'running' && <IconLoader2 size={16} className="animate-spin text-muted-foreground shrink-0" aria-hidden="true" />}
                {s === 'idle' && <IconCircleDashed size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />}
                <span className="font-medium">{stepLabelOf(step)}</span>
                <span className="text-muted-foreground">
                  {s === 'done'
                    ? (stepVerb(step) === 'update' ? t('ss_step_done_updated') : t('ss_step_done'))
                    : s === 'failed' ? t('ss_step_failed')
                      : s === 'running' ? (stepVerb(step) === 'update' ? t('ss_step_running_updated') : t('ss_step_running'))
                        : t('ss_step_idle')}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {submit.error && (
        <div role="alert" className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 space-y-2">
          <p className="font-semibold text-destructive">{submit.offline ? t('ss_offline_title') : submit.limited ? t('ss_limited_title') : t('ss_error_title')}</p>
          <p className="text-sm text-muted-foreground break-words" data-journey-offline={submit.offline ? '' : undefined} data-journey-limited={submit.limited ? '' : undefined}>
            {submit.offline ? t('ss_offline_text') : submit.limited ? t('ss_limited_text') : submit.error.message}
          </p>
          {savedLabels.length > 0 && (
            <p className="text-sm">{t('ss_partial', { done: savedLabels.join(', ') })}</p>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void submit.retry()} disabled={submit.submitting}>
            {t('ss_retry')}
          </Button>
        </div>
      )}

      {failingLists.length > 0 && (
        <div role="alert" data-journey-read-failed="" className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {t('ss_read_failed', { what: [...new Set(failingLists)].map(e => entityLabel(e as never)).join(', ') })}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-t border-border pt-4">
        {whatHappensNext && <p className="text-sm text-muted-foreground flex-1">{whatHappensNext}</p>}
        {variants && variants.length > 0 ? (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            {variants.map((v, i) => (
              <Button
                key={v.id}
                type="button"
                variant={i === 0 ? 'default' : 'outline'}
                onClick={() => { submit.remember(rows); void v.confirm(); }}
                disabled={submit.submitting || missing.length > 0 || failingLists.length > 0}
                className="gap-2"
                data-journey-variant={v.id}
                {...(i === 0 ? { 'data-journey-confirm': '' } : {})}
              >
                {i === 0 && submit.submitting && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
                {i === 0 && submit.submitting ? t('ss_submitting') : v.label}
              </Button>
            ))}
          </div>
        ) : (
        <Button
          type="button"
          onClick={() => { submit.remember(rows); void submit.run(); }}
          disabled={submit.submitting || missing.length > 0 || failingLists.length > 0}
          className="gap-2 sm:ml-auto"
          data-journey-confirm=""
        >
          {submit.submitting && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
          {submit.submitting ? t('ss_submitting') : (confirmLabel ?? t('ss_confirm'))}
        </Button>
        )}
      </div>
    </div>
  );
}
