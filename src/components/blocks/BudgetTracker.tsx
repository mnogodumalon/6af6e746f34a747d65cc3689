import { formatCurrency } from '@/lib/formatters';
import { t } from '@/i18n';

/**
 * BudgetTracker — one meter for "used of available": a budget in money, the
 * seats of a course, the hours of a contingent. The MECHANICS are fixed here
 * (percent, bar, colour steps at 80 % and over, remaining line, screen-reader
 * text); the MEANING comes from the props. `format` says what the numbers
 * are, `unit` names them, `texts` overrides any word.
 *
 *   <BudgetTracker budget={5000} booked={3200} label={tx('Materialkosten')} />
 *   <BudgetTracker format="count" unit={tx('Plätze')} budget={12} booked={1} label={tx('Kursauslastung')} />
 *
 * Why: the block used to format every number as currency. A course page had
 * nothing else for "1 of 12 seats" and shipped "Gebucht 1,00 € von 12,00 €"
 * (live 03.09.2026). `format` defaults to 'currency' so old pages render as
 * before; check-intents 3q asks for an explicit format where the budget
 * expression reads like a capacity.
 */
export type BudgetFormat = 'currency' | 'count';

export interface BudgetTrackerTexts {
  /** "Gebucht" / "Belegt" */
  booked: string;
  /** "von" */
  of: string;
  /** "Verbleibend" / "frei" */
  remaining: string;
  /** "Budget überschritten!" / "Kapazität überschritten" */
  over: string;
  /** Shown when budget <= 0: "Kein Budget definiert" / "Keine Kapazität festgelegt" */
  none: string;
}

export interface BudgetTrackerProps {
  budget: number;
  booked: number;
  label?: string;
  showRemaining?: boolean;
  /** What the numbers are: money (default, formatted as currency) or a plain count with `unit`. */
  format?: BudgetFormat;
  /** Count mode: the word after the number — "Plätze", "Stunden", "Stück". */
  unit?: string;
  /** Any word of the meter, when the defaults of the format do not fit. */
  texts?: Partial<BudgetTrackerTexts>;
}

function defaultTexts(format: BudgetFormat): BudgetTrackerTexts {
  return format === 'count'
    ? { booked: t('cap_booked'), of: t('cap_of'), remaining: t('cap_remaining'), over: t('cap_over'), none: t('cap_none') }
    : { booked: t('budget_booked'), of: t('budget_of'), remaining: t('budget_remaining'), over: t('budget_over'), none: t('budget_none') };
}

export function BudgetTracker({
  budget,
  booked,
  label,
  showRemaining = true,
  format = 'currency',
  unit,
  texts,
}: BudgetTrackerProps) {
  const words = { ...defaultTexts(format), ...(texts ?? {}) };
  const title = label ?? (format === 'count' ? t('cap_label') : t('budget_label'));
  const fmt = (n: number): string => {
    if (format === 'currency') return formatCurrency(n);
    const num = Number.isInteger(n) ? String(n) : n.toLocaleString();
    return unit ? `${num} ${unit}` : num;
  };
  const percent = budget > 0 ? Math.min((booked / budget) * 100, 100) : 0;
  const remaining = budget - booked;
  const over = booked > budget;
  const full = format === 'count' && !over && budget > 0 && booked >= budget;
  const barColor = over ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-primary';

  if (budget <= 0) {
    return (
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between text-sm mb-1">
          <span className="font-medium text-muted-foreground">{title}</span>
          <span className="font-semibold">{fmt(booked)}</span>
        </div>
        <p className="text-xs text-muted-foreground">{words.none}</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border bg-card p-4 space-y-2"
      role="meter"
      aria-label={title}
      aria-valuemin={0}
      aria-valuemax={budget}
      aria-valuenow={Math.min(booked, budget)}
      aria-valuetext={`${fmt(booked)} ${words.of} ${fmt(budget)}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground">{title}</span>
        <span className={`font-semibold ${over ? 'text-red-600' : ''}`}>
          {Math.round(percent)}%
        </span>
      </div>

      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {words.booked}: <span className="font-semibold text-foreground">{fmt(booked)}</span>
        </span>
        <span>{words.of} {fmt(budget)}</span>
      </div>

      {showRemaining && (
        <div className="flex items-center justify-between text-xs pt-1 border-t">
          <span className="text-muted-foreground">{words.remaining}</span>
          <span className={`font-semibold ${over ? 'text-red-600' : full ? 'text-amber-600' : 'text-green-600'}`}>
            {fmt(Math.max(remaining, 0))}
          </span>
        </div>
      )}

      {over && <p className="text-xs text-red-600 font-medium">{words.over}</p>}
      {full && <p className="text-xs text-amber-600 font-medium">{t('cap_full')}</p>}
    </div>
  );
}
