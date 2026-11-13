/**
 * Display formatting for journey values — one place, both doors.
 * Summary rows, success facts and answer chips all read through here so a
 * date, a currency or a lookup looks the same everywhere.
 */
import { differenceInCalendarDays, format as formatDf, parseISO } from 'date-fns';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/formatters';
import { dateFnsLocale, localeTag, t, tp } from '@/i18n';
import { isEmptyValue, optionsOf, ruleOf, type EntityKey } from './rules';
import { recordIdOf, recordLabelOf } from './recordLabels';
import { uploadDisplayName } from './upload';

export const EMPTY_VALUE = '—';

function lookupKeyOf(v: unknown): string {
  return typeof v === 'object' && v !== null && 'key' in v ? String((v as { key: string }).key) : String(v);
}

/** `labels` carries display names the page learned while the user picked
 *  records (`form.set(key, id, label)`), keyed by field key or by record id. */
export function formatFieldValue(
  entity: EntityKey,
  key: string,
  value: unknown,
  labels: Record<string, string> = {},
): string {
  if (isEmptyValue(value)) return EMPTY_VALUE;
  const rule = ruleOf(entity, key);
  switch (rule?.kind) {
    case 'bool':
      return value ? t('v_yes') : t('v_no');
    // never the data URL (megabytes) — the file's name
    case 'file':
      return uploadDisplayName(value);
    case 'date':
      return formatDate(String(value));
    case 'datetime':
      return formatDateTime(String(value));
    case 'number': {
      const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
      if (!Number.isFinite(n)) return String(value);
      return rule.format === 'currency' ? formatCurrency(n) : new Intl.NumberFormat(localeTag()).format(n);
    }
    case 'lookup': {
      const k = lookupKeyOf(value);
      return optionsOf(entity, key).find(o => o.key === k)?.label ?? k;
    }
    case 'multilookup': {
      const opts = optionsOf(entity, key);
      const keys = Array.isArray(value) ? value.map(lookupKeyOf) : [lookupKeyOf(value)];
      return keys.map(k => opts.find(o => o.key === k)?.label ?? k).join(', ');
    }
    // A record shows its NAME: the form's label, else what any hook on the
    // page learned about that id, else a readable placeholder. Never the 24-hex
    // id or the record URL (live: "Zusatzleistungen 6a9ae0fdd32995434b7edfb2").
    case 'record': {
      const id = String(value);
      return labels[key] ?? labels[id] ?? recordLabelOf(id) ?? (recordIdOf(id) ? t('v_record_unnamed') : id);
    }
    case 'multirecord': {
      const ids = Array.isArray(value) ? value.map(String) : [String(value)];
      const named = ids.map(id => labels[id] ?? recordLabelOf(id) ?? (recordIdOf(id) ? null : id));
      const unnamed = named.filter(n => n === null).length;
      const parts = named.filter((n): n is string => n !== null);
      if (unnamed > 0) parts.push(tp('v_records_unnamed', unnamed, { n: unnamed }));
      return parts.join(', ');
    }
    default:
      return String(value);
  }
}

/** "12.–15. März 2026 · 3 Nächte" / "12–15 Mar 2026 · 3 nights". Departure day is exclusive. */
/** How a from/to pair counts: hotel nights (departure exclusive), calendar
 *  days (both ends inclusive) or no count at all. The block never assumes a
 *  stay — a course, a loan or a project period says 'days'. */
export type RangeUnit = 'nights' | 'days' | 'none';

export function formatRange(fromIso: string | null | undefined, toIso: string | null | undefined, unit: RangeUnit = 'nights'): string {
  if (!fromIso && !toIso) return EMPTY_VALUE;
  if (!fromIso || !toIso) return formatDate(fromIso ?? toIso ?? undefined);
  const from = parseISO(fromIso);
  const to = parseISO(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return `${fromIso} – ${toIso}`;
  const locale = dateFnsLocale();
  const german = localeTag().startsWith('de');
  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  const dayFmt = german ? 'd.' : 'd';
  const fullFmt = german ? 'd. MMM yyyy' : 'd MMM yyyy';
  const shortFmt = german ? 'd. MMM' : 'd MMM';
  const span = sameMonth
    ? `${formatDf(from, dayFmt, { locale })}–${formatDf(to, fullFmt, { locale })}`
    : `${formatDf(from, shortFmt, { locale })} – ${formatDf(to, fullFmt, { locale })}`;
  const nights = differenceInCalendarDays(to, from);
  if (unit === 'none' || nights < 0) return span;
  if (unit === 'days') {
    const days = nights + 1;
    return `${span} · ${tp('v_days', days, { n: days })}`;
  }
  return nights > 0 ? `${span} · ${tp('v_nights', nights, { n: nights })}` : span;
}

/** Today as `yyyy-MM-dd` in the user's local calendar — the value an `initial`
 *  date field wants. Never `toISOString().slice(0, 10)`: that is UTC and
 *  yesterday after 22:00 in Berlin. */
export function todayIso(): string {
  return formatDf(new Date(), 'yyyy-MM-dd');
}

/** Now as `yyyy-MM-dd'T'HH:mm` in the user's local time — the value an
 *  `initial` gives a datetime field (`erfasst_am: nowIso()`). Lanes grepped the
 *  tree for this name and, not finding it, built it by hand (live). */
export function nowIso(): string {
  return formatDf(new Date(), "yyyy-MM-dd'T'HH:mm");
}
