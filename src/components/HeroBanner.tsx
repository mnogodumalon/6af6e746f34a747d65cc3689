import type { ReactNode } from 'react';

/**
 * HeroBanner — the ONE urgent signal, with its resolving action.
 *
 * One message per dashboard: when the data carries an urgent state (overdue,
 * unstaffed, over capacity), this banner is the hero — and NOTHING else repeats
 * it (no tinted KPI for the same number, no second red list). When nothing is
 * urgent, render no banner at all — the primary widget is the hero.
 *
 * `action` is REQUIRED by design: a banner that only states a fact is a dead
 * end. The button RESOLVES the signal with a write (advance/confirm/send —
 * optimistic + undoToast), reusing the SAME helper as the work-list quick-
 * actions and the overlay footer. Only when no write can resolve the signal
 * does the action fall back to focusing the records (filter/scroll).
 *
 *   {überfällig.length > 0 && (
 *     <HeroBanner
 *       icon={<IconAlertTriangle size={18} />}
 *       action={{ label: 'Kunde informieren', onClick: () => advance(überfällig[0]) }}
 *     >
 *       <b>{namen(überfällig.map(r => r.kundeName ?? ''))}</b> überfällig — fällig war {formatDate(überfällig[0].fields.faellig)}.
 *     </HeroBanner>
 *   )}
 */
export type HeroBannerTone = 'destructive' | 'warning' | 'primary';

interface HeroBannerProps {
  /** The concrete facts with NAMES — not a generic "Es gibt Probleme". */
  children: ReactNode;
  /** The resolving action — required. */
  action: { label: ReactNode; onClick: () => void };
  icon?: ReactNode;
  tone?: HeroBannerTone;
  className?: string;
}

const TONE_SHELL: Record<HeroBannerTone, string> = {
  destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
  warning: 'border-amber-200 bg-amber-500/10 text-amber-700',
  primary: 'border-primary/20 bg-primary/10 text-primary',
};
const TONE_BUTTON: Record<HeroBannerTone, string> = {
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
  warning: 'bg-amber-600 text-white hover:bg-amber-600/90',
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
};

export function HeroBanner({ children, action, icon, tone = 'destructive', className }: HeroBannerProps) {
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border p-4 ${TONE_SHELL[tone]} ${className ?? ''}`}>
      {icon ? <span className="shrink-0">{icon}</span> : null}
      <div className="min-w-0 flex-1 text-sm [&_b]:font-semibold">{children}</div>
      <button
        type="button"
        onClick={action.onClick}
        className={`shrink-0 inline-flex items-center justify-center min-h-9 max-sm:min-h-11 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors max-sm:w-full ${TONE_BUTTON[tone]}`}
      >
        {action.label}
      </button>
    </div>
  );
}
