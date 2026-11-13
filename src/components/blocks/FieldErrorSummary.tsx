import { IconAlertCircle } from '@tabler/icons-react';
import { tp } from '@/i18n';
import type { StepForm } from '@/lib/journey/useStepForm';

/**
 * FieldErrorSummary — the GOV.UK error summary: one box listing every open
 * error of the current step as a link that puts focus into the field. The
 * shell renders it automatically above the step content when it received
 * `forms`; a page only places it by hand when it runs without the shell.
 * Focus stays where `form.validate()` put it (the first invalid field); this
 * box announces via role="alert" and offers the way to every other error.
 */
export interface FieldErrorSummaryProps {
  forms: StepForm[];
  /** Only errors of fields that belong to this wizard step (fields without a step always show). */
  step?: number;
  className?: string;
}

function focusField(fieldId: string) {
  const el = document.getElementById(fieldId);
  if (!el) return;
  (el as HTMLElement).focus();
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

export function FieldErrorSummary({ forms, step, className = '' }: FieldErrorSummaryProps) {
  const errors = forms.flatMap(f =>
    f.errors.filter(e => step === undefined || f.stepOf(e.key) === undefined || f.stepOf(e.key) === step),
  );
  if (errors.length === 0) return null;
  return (
    <div
      role="alert"
      className={`rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-5 ${className}`}
      data-journey-error-summary=""
    >
      <div className="flex items-start gap-3">
        <IconAlertCircle size={20} className="text-destructive shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="font-semibold text-destructive">{tp('es_title', errors.length, { n: errors.length })}</h3>
          <ul className="mt-2 space-y-1">
            {errors.map(e => (
              <li key={e.fieldId}>
                <a
                  href={`#${e.fieldId}`}
                  onClick={ev => {
                    ev.preventDefault();
                    focusField(e.fieldId);
                  }}
                  className="text-sm text-destructive underline underline-offset-2 hover:no-underline"
                >
                  {e.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
