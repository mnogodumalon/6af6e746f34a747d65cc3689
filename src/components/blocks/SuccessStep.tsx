import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { IconCheck, IconCircleCheck, IconCopy, IconPrinter } from '@tabler/icons-react';
import { t } from '@/i18n';
import { entityLabel } from '@/lib/journey/rules';
import type { StepForm, SummaryItem } from '@/lib/journey/useStepForm';
import type { JourneyResult, JourneySubmit } from '@/lib/journey/useJourneySubmit';
import { useWizard } from './IntentWizardShell';
import { resolveFlowHref } from '@/lib/journey/flowLinks';
import { withRecordNames } from '@/lib/journey/recordLabels';
import { INTENTS } from '@/config/intents';
import { nounOne } from '@/config/plan';

/**
 * SuccessStep — the end of a journey that keeps working.
 *
 *   {submit.result && (
 *     <SuccessStep result={submit.result} forms={[buchung]}
 *       next={[{ label: 'Nächste Buchung anlegen', onClick: restart }, { label: 'Zur Belegungsübersicht', href: '#/' }]}
 *       whatHappensNext="Der Gast bekommt die Bestätigung per E-Mail." />
 *   )}
 *
 * Renders ONLY from a `JourneyResult` — the runner sets it after every write
 * succeeded, so this screen can never appear over a half-written journey or
 * be derived from a refetched list. Shows the facts of what was created, the
 * next logical actions (first = primary), and lets the user copy or print the
 * confirmation. The technical reference (`B-42D81A`, `makeReference` in
 * lib/journey/reference.ts) is deliberately NOT shown: nothing in the
 * dashboard accepts it yet, and entities with a business number carry that
 * number in their facts. Bring it back when a search takes it.
 */
export interface SuccessAction {
  label: string;
  /** `#/…` or `#/intents/<slug>` — never a platform record list. */
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

export interface SuccessStepProps {
  result: JourneyResult;
  /** Folgeaktionen — the first is rendered as the primary button. */
  next?: SuccessAction[];
  /** Default: "<Entity> angelegt". */
  title?: string;
  /** Facts are derived from these forms (filled fields only) … */
  forms?: StepForm[];
  /** … or passed explicitly. */
  facts?: Array<Pick<SummaryItem, 'label' | 'value'>>;
  whatHappensNext?: ReactNode;
  /** Reserved: prefix for a shown reference. Currently unused — the success
   *  screen shows no technical reference (see docblock). */
  referencePrefix?: string;
  /** The heading's verb. Default: from `result.created` ("angelegt" / "aktualisiert"). */
  verb?: 'created' | 'updated';
  /** With the runner given, the first action is "Noch einmal": resets the plan, the forms and
   *  jumps to step 1 — the five-line `restart` every page used to write. */
  submit?: JourneySubmit;
  restartLabel?: string;
  /** Copy and print are offered by default — an internal status flip may want neither. */
  actions?: { copy?: boolean; print?: boolean };
  printLabel?: string;
  /** The counter-action of the changed record (PV-15) — `undo={flow.undo}`:
   *  one button, the record goes back, the page says so. */
  undo?: { label?: string; run: () => Promise<unknown> };
  children?: ReactNode;
}

export function SuccessStep({
  result,
  next = [],
  title,
  forms = [],
  facts,
  whatHappensNext,
  verb,
  submit,
  restartLabel,
  actions,
  printLabel,
  undo,
  children,
}: SuccessStepProps) {
  const showCopy = actions?.copy ?? true;
  const [undone, setUndone] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const runUndo = async () => {
    if (!undo || undone === 'busy' || undone === 'done') return;
    setUndone('busy');
    try { await undo.run(); setUndone('done'); } catch { setUndone('error'); }
  };
  const showPrint = actions?.print ?? true;
  const created = verb ? verb === 'created' : result.created !== false;
  const [copied, setCopied] = useState(false);
  const wizard = useWizard();

  // The journey is complete: the shell drops the draft and stops saving —
  // regardless of whether the page wired a draftKey into the runner.
  useEffect(() => {
    wizard?.markCompleted();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The result heading ("Buchung angelegt") replaces the shell's step heading.
  const suppressHeading = wizard?.suppressHeading;
  useEffect(() => suppressHeading?.(), [suppressHeading]);

  const heading = title ?? (result.entity && result.primary.id
    ? t(created ? 'sx_default_title' : 'sx_default_title_updated', { entity: nounOne(result.entity, entityLabel(result.entity)) })
    : t('sx_saved'));
  // Facts: explicit `facts`, else the forms' filled rows, else what the review
  // step showed — an update-only journey keeps its answers in page state, so
  // without this the success screen was a heading over nothing (live: ticket
  // assignment). The review remembers its rows on confirm; the result carries them.
  const listRows = (submit?.plan ?? []).flatMap(s => s.review?.() ?? []);
  const formRows = [...forms.flatMap(f => f.summary()), ...listRows].filter(r => r.value !== '—');
  const rows = (facts ?? (formRows.length > 0 ? formRows : (result.summary ?? []).filter(r => r.value !== '—'))).slice(0, 10);

  const copy = async () => {
    const lines = [heading, ...rows.map(r => `${r.label}: ${withRecordNames(r.value, t('v_record_unnamed'))}`)];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the facts are still on screen */
    }
  };

  const go = (action: SuccessAction) => {
    if (action.onClick) action.onClick();
    else if (action.href) window.location.href = action.href;
  };

  // A follow-up link to a flow this bundle does not have (a lane guessed its
  // neighbour's slug) goes to the one registered flow that fits, else nowhere —
  // never to "Diese Seite gibt es nicht" (live).
  const flowPaths = INTENTS.map(i => i.path);
  const restart: SuccessAction[] = submit ? [{
    label: restartLabel ?? t('sx_restart'),
    onClick: () => { submit.reset(); forms.forEach(f => f.reset()); wizard?.goTo(1); },
  }] : [];
  // One button per label: a page that passes the same wording as `restartLabel`
  // AND as a `next` action (live: "Weitere Anfrage stellen" twice) gets one.
  const seenLabels = new Set<string>();
  const followUps = [...restart, ...next].flatMap((action): SuccessAction[] => {
    const key = action.label.trim().toLowerCase();
    if (seenLabels.has(key)) return [];
    seenLabels.add(key);
    if (!action.href) return [action];
    const href = resolveFlowHref(action.href, flowPaths);
    if (href === null) {
      console.warn(`SuccessStep: no flow at '${action.href}' — registered: ${flowPaths.join(', ') || 'none'}; action '${action.label}' dropped`);
      return [];
    }
    return [{ ...action, href }];
  });

  return (
    <div className="journey-print space-y-6" data-journey-success="">
      <style>{`@media print { body * { visibility: hidden; } .journey-print, .journey-print * { visibility: visible; } .journey-print { position: absolute; left: 0; top: 0; width: 100%; } .journey-print [data-no-print] { display: none !important; } }`}</style>

      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <IconCircleCheck size={26} stroke={1.75} className="text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
        </div>
      </div>

      {/* `@container` like SummaryStep: columns follow the card, not the viewport. */}
      {rows.length > 0 && (
        <dl className="rounded-2xl border border-border bg-card divide-y divide-border @container">
          {rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="grid grid-cols-1 @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] gap-x-4 px-5 py-2.5 items-baseline">
              <dt className="text-sm text-muted-foreground">{r.label}</dt>
              <dd className="text-sm font-medium break-words min-w-0">{withRecordNames(r.value, t('v_record_unnamed'))}</dd>
            </div>
          ))}
        </dl>
      )}

      {children}

      {whatHappensNext && (
        // Screen-only: a "what happens next" hint is guidance for the person at
        // the screen, not part of the printed confirmation.
        <div className="rounded-2xl bg-muted/40 px-5 py-4" data-no-print="">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{t('sx_next_title')}</h3>
          <p className="text-sm">{whatHappensNext}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2" data-no-print="">
        {followUps.map((action, i) => (
          <Button key={`${action.label}-${i}`} type="button" variant={i === 0 ? 'default' : 'outline'} onClick={() => go(action)} className="gap-1.5">
            {action.icon}
            {action.label}
          </Button>
        ))}
        <span className="flex-1" />
        {undo && undone !== 'done' && (
          <Button type="button" variant="outline" onClick={() => void runUndo()} disabled={undone === 'busy'} className="gap-1.5" data-journey-undo="">
            {undo.label || t('sx_undo')}
          </Button>
        )}
        {undo && undone === 'done' && <span className="text-sm text-muted-foreground" role="status">{t('sx_undone')}</span>}
        {undo && undone === 'error' && <span className="text-sm text-destructive" role="alert">{t('sx_undo_failed')}</span>}
        {showCopy && (
          <Button type="button" variant="ghost" size="sm" onClick={() => void copy()} className="gap-1.5">
            {copied ? <IconCheck size={16} aria-hidden="true" /> : <IconCopy size={16} aria-hidden="true" />}
            {copied ? t('sx_copied') : t('sx_copy')}
          </Button>
        )}
        {showPrint && (
          <Button type="button" variant="ghost" size="sm" onClick={() => window.print()} className="gap-1.5">
            <IconPrinter size={16} aria-hidden="true" />
            {printLabel ?? t('sx_print')}
          </Button>
        )}
      </div>
    </div>
  );
}
