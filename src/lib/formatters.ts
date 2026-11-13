import { format, parseISO } from 'date-fns';
import { CURRENCY, dateFnsLocale, dateFormat, dateTimeFormat, localeTag } from '@/i18n';

// Pattern, month/weekday names and number grouping all follow the ACTIVE
// locale — read inside the functions, never hoisted, so a language switch
// takes effect without a rebuild. The currency itself is a property of the
// data and stays fixed at the build-time choice (CURRENCY).
export function formatDate(s: string | undefined) {
  if (!s) return '—';
  try { return format(parseISO(s), dateFormat(), { locale: dateFnsLocale() }); } catch { return s; }
}

export function formatDateTime(s: string | undefined) {
  if (!s) return '—';
  // a day without a time (stored date-only, or midnight) reads as the day — „6. Nov. 2026“, never „… 00:00“
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) || /T00:00(:00)?(\.0+)?Z?$/.test(s)) return formatDate(s.slice(0, 10));
  try { return format(parseISO(s), dateTimeFormat(), { locale: dateFnsLocale() }); } catch { return s; }
}

export function formatCurrency(v: number | undefined) {
  if (v == null) return '—';
  return new Intl.NumberFormat(localeTag(), { style: 'currency', currency: CURRENCY }).format(v);
}

/** Extract display label from lookup/select or lookup/radio API response */
export function displayLookup(val: unknown, options?: {key: string, label: string}[]): string {
  if (val == null) return '—';
  if (typeof val === 'object' && val !== null && 'label' in val) return String((val as Record<string, unknown>).label);
  if (options && typeof val === 'string') { const m = options.find(o => o.key === val); if (m) return m.label; }
  return String(val);
}

/** Extract labels from multiplelookup/checkbox API response */
export function displayMultiLookup(val: unknown, options?: {key: string, label: string}[]): string {
  if (val == null) return '—';
  if (Array.isArray(val)) return val.map(v => {
    if (typeof v === 'object' && v !== null && 'label' in v) return String((v as Record<string, unknown>).label);
    if (options && typeof v === 'string') { const m = options.find(o => o.key === v); if (m) return m.label; }
    return String(v);
  }).join(', ') || '—';
  return displayLookup(val, options);
}

/** Extract key from lookup value (handles both {key,label} objects and plain strings) */
export function lookupKey(val: unknown): string | undefined {
  if (val == null) return undefined;
  if (typeof val === 'object' && val !== null && 'key' in val) return String((val as Record<string, unknown>).key);
  if (typeof val === 'string') return val;
  return undefined;
}

/** Extract keys from multiplelookup value */
export function lookupKeys(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map(v => typeof v === 'object' && v !== null && 'key' in v ? String((v as Record<string, unknown>).key) : String(v));
}