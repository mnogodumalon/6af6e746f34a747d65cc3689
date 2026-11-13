/**
 * blocks/LoadProblem.tsx — „could not load“ with a way to try again (generated, presentational).
 *
 *   if (!live.loaded && live.error) return <LoadProblem onRetry={live.reload} />;
 *
 * P-17 (Abnahme 8): a page that could not load its records (429, 503, no
 * network) said „Dieser Link passt zu keiner Veranstaltung“ — a loading
 * problem is not an unknown link, and the visitor needs a button, not a QR code.
 * The list hooks retry by themselves until the first load succeeds; this block
 * says what is happening and lets the visitor push.
 */
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

export interface LoadProblemProps {
  onRetry: () => void | Promise<void>;
  /** Override for the sentence above the button. */
  text?: string;
}

export function LoadProblem({ onRetry, text }: LoadProblemProps) {
  return (
    <div role="alert" data-load-problem className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm">{text ?? t('lp_text')}</p>
      <Button type="button" variant="outline" onClick={() => { void onRetry(); }}>{t('lp_retry')}</Button>
    </div>
  );
}

export default LoadProblem;
