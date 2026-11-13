import { useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { t, tp, dateFnsLocale } from '@/i18n';

// AvailabilityRangePicker — an availability-aware date-range calendar for
// booking flows (the Airbnb pattern): occupied nights are visible AND
// unselectable, and a range can never span one. The consumer maps its
// occupancy records into `blocked` and binds `value`/`onChange`; everything
// else (month grid, selection rules, legend, hints) lives here.
//
// Availability arrives as a PROP — this block never fetches. Public pages
// map listPublicRecords results, intent pages map useDashboardData arrays.
//
// Hotel convention: a blocked range's `end` (departure day) is EXCLUSIVE —
// the flat frees up that morning, so a new arrival on an existing departure
// day is fine, and an existing arrival day is a valid new departure
// ("checkout-only day"). The picker encodes this; do not re-derive it.

const DATE_FMT = 'yyyy-MM-dd';

export interface AvailabilityRange {
  /** Arrival date, ISO `yyyy-MM-dd`. */
  start: string;
  /** Departure date, EXCLUSIVE. Missing/null blocks only the start night. */
  end?: string | null;
}

export interface DateRangeValue {
  from: string | null;
  to: string | null;
}

/** Whether the NIGHT starting on `dayIso` is occupied (start <= day < end). */
export function isNightBlocked(dayIso: string, blocked: AvailabilityRange[]): boolean {
  return blocked.some(r => {
    if (!r.start) return false;
    const end = r.end ?? format(addDays(parseISO(r.start), 1), DATE_FMT);
    return r.start <= dayIso && dayIso < end;
  });
}

/** Every night of [fromIso, toIso) is free. Use this as the submit-time
 *  revalidation of what the picker already prevents interactively — the
 *  listed availability can go stale between page load and submit. */
export function rangeIsFree(fromIso: string, toIso: string, blocked: AvailabilityRange[]): boolean {
  if (!(fromIso < toIso)) return false;
  for (let d = parseISO(fromIso); format(d, DATE_FMT) < toIso; d = addDays(d, 1)) {
    if (isNightBlocked(format(d, DATE_FMT), blocked)) return false;
  }
  return true;
}

interface AvailabilityRangePickerProps {
  blocked: AvailabilityRange[];
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  /** Shortest allowed stay in nights (default 1). */
  minNights?: number;
  /** Months rendered side by side on wide containers (default 2). */
  months?: number;
  /** Days before today are inert (default true). */
  disablePast?: boolean;
  /** Colour key under the grid (default true). A string keeps the key and
   *  adds that sentence as a caption — `legend={tx('Belegte Nächte sind
   *  ausgegraut.')}` is a valid call, not a type error. */
  legend?: boolean | string;
  /** What the pair means. 'nights' (default): a stay — "Anreise/Abreise", n Nächte.
   *  'days': a period — "Beginn/Ende", n Tage (both ends inclusive in the count). */
  unit?: 'nights' | 'days';
  /** Any of the picker's own words, when the unit defaults do not fit. */
  texts?: Partial<{ pickStart: string; pickEnd: string; minHint: string }>;
}

export function AvailabilityRangePicker({
  blocked,
  value,
  onChange,
  minNights = 1,
  months = 2,
  disablePast = true,
  legend = true,
  unit = 'nights',
  texts,
}: AvailabilityRangePickerProps) {
  const words = {
    pickStart: texts?.pickStart ?? (unit === 'days' ? t('arp_pick_start') : t('arp_pick_arrival')),
    pickEnd: texts?.pickEnd ?? (unit === 'days' ? t('arp_pick_end') : t('arp_pick_departure')),
    minHint: texts?.minHint ?? (unit === 'days' ? t('arp_hint_min_days', { n: minNights + 1 }) : t('arp_hint_min_nights', { n: minNights })),
  };
  const locale = dateFnsLocale();
  const todayIso = format(new Date(), DATE_FMT);
  const [cursor, setCursor] = useState(() =>
    startOfMonth(value.from ? parseISO(value.from) : new Date()),
  );
  const [hint, setHint] = useState<string | null>(null);

  const selectingDeparture = Boolean(value.from && !value.to);
  const nights = value.from && value.to
    ? differenceInCalendarDays(parseISO(value.to), parseISO(value.from))
    : 0;

  const clickDay = (iso: string) => {
    if (disablePast && iso < todayIso) return;
    // Second click: try to complete the range.
    if (selectingDeparture && value.from && iso > value.from) {
      if (rangeIsFree(value.from, iso, blocked)) {
        const n = differenceInCalendarDays(parseISO(iso), parseISO(value.from));
        if (n < minNights) {
          setHint(words.minHint);
          return;
        }
        setHint(null);
        onChange({ from: value.from, to: iso });
        return;
      }
      // The span crosses an occupied night — fall through: the click
      // restarts the selection (free day) or explains itself (blocked day).
    }
    if (isNightBlocked(iso, blocked)) {
      setHint(t('arp_hint_blocked'));
      return;
    }
    setHint(null);
    onChange({ from: iso, to: null });
  };

  const prevDisabled = disablePast && format(cursor, DATE_FMT) <= format(startOfMonth(new Date()), DATE_FMT);
  const monthStarts = Array.from({ length: Math.max(1, months) }, (_, i) => addMonths(cursor, i));

  return (
    // `@container`: the month count follows the CONTAINER, not the viewport.
    // Two 7×40px months need ~610px; inside the public page's 640px card the
    // second month was clipped by the card's overflow (live: "one month").
    // Below @2xl (672px) one month renders and the arrows page through.
    <div className="@container space-y-3" data-journey-range="">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {value.from && value.to
            ? (unit === 'days' ? tp('arp_days', nights + 1) : tp('arp_nights', nights))
            : selectingDeparture
              ? words.pickEnd
              : words.pickStart}
        </p>
        <div className="flex items-center gap-1">
          {value.from ? (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 mr-2"
              onClick={() => { setHint(null); onChange({ from: null, to: null }); }}
            >
              {t('arp_clear')}
            </button>
          ) : null}
          <button
            type="button"
            aria-label={t('arp_prev_month')}
            disabled={prevDisabled}
            className="h-8 w-8 flex items-center justify-center rounded-md border bg-card hover:bg-accent disabled:opacity-40 disabled:pointer-events-none transition-colors"
            onClick={() => setCursor(c => addMonths(c, -1))}
          >
            <IconChevronLeft size={16} />
          </button>
          <button
            type="button"
            aria-label={t('arp_next_month')}
            className="h-8 w-8 flex items-center justify-center rounded-md border bg-card hover:bg-accent transition-colors"
            onClick={() => setCursor(c => addMonths(c, 1))}
          >
            <IconChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Each month is an intrinsically sized 7×40px grid — so the space
          BETWEEN months stays visibly larger than the space between day
          columns, and a divider separates them on wide screens. */}
      <div className="grid grid-cols-1 @2xl:grid-cols-2 @2xl:divide-x @2xl:divide-border">
        {monthStarts.slice(0, 2).map((monthStart, index) => {
          const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
          const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 });
          const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
          const monthIso = format(monthStart, 'yyyy-MM');
          return (
            <div key={monthIso} className={`flex-col items-center @2xl:first:pr-6 @2xl:last:pl-6 ${index === 0 ? 'flex' : 'hidden @2xl:flex'}`}>
              <p className="text-sm font-semibold text-center mb-3 capitalize">
                {format(monthStart, 'LLLL yyyy', { locale })}
              </p>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {days.slice(0, 7).map(d => (
                  <span key={`h-${format(d, 'i')}`} className="w-10 text-xs font-medium text-muted-foreground pb-2 mb-1 border-b border-border">
                    {format(d, 'EEEEEE', { locale })}
                  </span>
                ))}
                {days.map(d => {
                  const iso = format(d, DATE_FMT);
                  if (!iso.startsWith(monthIso)) {
                    return <span key={iso} aria-hidden="true" />;
                  }
                  const past = disablePast && iso < todayIso;
                  const nightBlocked = isNightBlocked(iso, blocked);
                  const isFrom = value.from === iso;
                  const isTo = value.to === iso;
                  const inRange = Boolean(
                    value.from && value.to && value.from < iso && iso < value.to,
                  );
                  // A blocked day still accepts a click while a departure is
                  // being picked — it may be a valid checkout-only day; the
                  // handler decides. Only past days are truly inert.
                  const cls = past
                    ? 'text-muted-foreground/40'
                    : isFrom || isTo
                      ? 'bg-primary text-primary-foreground font-medium'
                      : inRange
                        ? 'bg-primary/10'
                        : nightBlocked
                          ? 'text-muted-foreground/60 line-through bg-muted/60'
                          : 'hover:bg-accent';
                  // A completed range reads as one band: only its ends are rounded.
                  const shape = isFrom && value.to
                    ? 'rounded-l-md'
                    : isTo
                      ? 'rounded-r-md'
                      : inRange
                        ? 'rounded-none'
                        : 'rounded-md';
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={past}
                      data-day={iso}
                      aria-label={format(d, 'PPP', { locale })}
                      aria-pressed={isFrom || isTo}
                      className={`h-10 w-10 text-sm flex items-center justify-center transition-colors ${shape} ${cls}`}
                      onClick={() => clickDay(iso)}
                    >
                      {format(d, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {hint ? (
        <p className="text-sm text-destructive" role="status">{hint}</p>
      ) : null}

      {legend ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm border bg-card" aria-hidden="true" />
            {t('arp_legend_free')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-muted line-through" aria-hidden="true" />
            {t('arp_legend_blocked')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-primary" aria-hidden="true" />
            {t('arp_legend_selected')}
          </span>
          {typeof legend === 'string' && legend.trim() !== '' ? (
            <span className="basis-full sm:basis-auto sm:ml-auto">{legend}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
