import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconArrowRight, IconLoader2 } from '@tabler/icons-react';
import { t } from '@/i18n';
import { useWizard } from './IntentWizardShell';

/**
 * StepNav — Back / Continue for a wizard step, with a label that says WHERE
 * the button leads ("Weiter: Zimmer wählen") instead of a bare "Weiter".
 *
 *   <StepNav onNext={() => f.validate(['gast'])} nextStepLabel="Zimmer wählen" />
 *
 * `onNext` may return false (or a Promise of false) to stay on the step — the
 * usual case is a `form.validate(...)` call, which marks and focuses the field.
 * A returned STRING also stays and is shown as the reason next to the buttons.
 * A bare `false` shows a generic "complete this step" line: a live page checked
 * its pick by hand (`if (ids.length === 0) return false`) and "Weiter" did
 * nothing at all — a button that swallows a click is never right, so the
 * block says something even when the page did not. Navigation itself comes
 * from the shell context: after "Change" in the summary, Continue returns
 * straight to the summary instead of walking every remaining step.
 */
export interface StepNavProps {
  onBack?: () => void;
  /** false → stay (generic hint); a string → stay and show it as the reason; true/void → continue. */
  onNext?: () => boolean | string | void | Promise<boolean | string | void>;
  /** Full label override. */
  nextLabel?: string;
  /** The next step's name → "Continue: <name>". Defaults to the shell's next step label. */
  nextStepLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  hideBack?: boolean;
  busy?: boolean;
  /** Rendered between the two buttons (a hint, a counter, a secondary action). */
  children?: ReactNode;
  className?: string;
}

export function StepNav({
  onBack,
  onNext,
  nextLabel,
  nextStepLabel,
  backLabel,
  nextDisabled,
  hideBack,
  busy,
  children,
  className = '',
}: StepNavProps) {
  const wizard = useWizard();
  // Tell the shell this step has a Weiter: a single pick on the same step
  // then leaves moving on to the button instead of doing it itself.
  const registerNav = wizard?.registerNav;
  useEffect(() => registerNav?.(), [registerNav]);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // The reason stays only until the user acts again — a line that survives the
  // correction it asked for reads as a second error (live 03.09.2026).
  useEffect(() => {
    if (!message) return;
    const clear = () => setMessage(null);
    const opts = { once: true, capture: true } as const;
    document.addEventListener('pointerdown', clear, opts);
    document.addEventListener('input', clear, opts);
    return () => {
      document.removeEventListener('pointerdown', clear, opts);
      document.removeEventListener('input', clear, opts);
    };
  }, [message]);

  const handleNext = async () => {
    if (pending) return;
    setPending(true);
    setMessage(null);
    try {
      const result = onNext ? await onNext() : true;
      if (result === false) {
        setMessage(t('sn_blocked'));
        return;
      }
      if (typeof result === 'string') {
        setMessage(result);
        return;
      }
      wizard?.next();
    } finally {
      setPending(false);
    }
  };

  const handleBack = () => {
    if (onBack) onBack();
    else wizard?.prev();
  };

  const showBack = !hideBack && (onBack || (wizard ? wizard.position > 1 : false));
  const label =
    nextLabel ??
    (wizard?.returnTo != null && wizard.returnTo !== wizard.step
      ? t('sn_to_summary')
      : nextStepLabel
        ? t('sn_next_to', { step: nextStepLabel })
        : wizard?.nextLabel
          ? t('sn_next_to', { step: wizard.nextLabel })
          : t('sn_next'));
  const working = busy || pending;
  // On the last enabled step `wizard.next()` goes nowhere — a "Weiter" there
  // is a button that does nothing (live-seen on a check-out page whose
  // review was gated behind submit.done). The last step confirms through
  // SummaryStep; StepNav only offers the way back.
  const atEnd = wizard !== null && wizard.position >= wizard.total;

  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-border pt-4 mt-6 ${className}`}>
      {showBack ? (
        <Button type="button" variant="ghost" onClick={handleBack} className="gap-1.5" data-journey-back="">
          <IconArrowLeft size={16} aria-hidden="true" />
          {backLabel ?? t('sn_back')}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex-1 min-w-0 text-sm text-muted-foreground">
        {children}
        {message && <p role="alert" className="text-destructive">{message}</p>}
      </div>
      {!atEnd && (
        <Button type="button" onClick={handleNext} disabled={nextDisabled || working} className="gap-1.5" data-journey-next="">
          {working ? <IconLoader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
          {label}
          {!working && <IconArrowRight size={16} aria-hidden="true" />}
        </Button>
      )}
    </div>
  );
}
