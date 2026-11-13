/**
 * Typed readers for `JourneyRecord.fields` (a `Record<string, unknown>`).
 *
 * A `toItem` mapper used to spell the casts by hand —
 * `(g.fields.status as { key: string }).key`, `String(g.fields.email ?? '')` —
 * and a live page cost a repair round on three `TS2339 'label' on '{}'`. These
 * helpers know the wire shapes the API delivers (lookup = `{ key, label }`,
 * applookup = record URL or id, numbers as number or numeric string) and
 * always return something renderable.
 */
import type { JourneyPort, JourneyRecord } from './port';
import type { EntityKey, RecordFieldKey } from './rules';
import { formatDate, formatDateTime } from '@/lib/formatters';

export interface LookupValue {
  key: string;
  label: string;
}

const HEX_ID_RE = /([0-9a-f]{24})\/?$/;

function raw(r: JourneyRecord, key: string): unknown {
  return r.fields ? r.fields[key] : undefined;
}

function lookupValue(v: unknown): LookupValue | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'string') return { key: v, label: v };
  if (typeof v === 'object') {
    const o = v as { key?: unknown; label?: unknown };
    const k = o.key === undefined || o.key === null ? '' : String(o.key);
    if (!k) return null;
    const l = o.label === undefined || o.label === null || o.label === '' ? k : String(o.label);
    return { key: k, label: l };
  }
  return null;
}

/** A lookup value as `{ key, label }`, or null. Accepts the API object and a
 *  bare key string (label = key), never throws. */
export function fieldLookup(r: JourneyRecord, key: string): LookupValue | null {
  return lookupValue(raw(r, key));
}

/** A multi-value lookup (`multiplelookup`) as `{ key, label }[]` — each element
 *  normalised like fieldLookup, a single value becomes a one-element list,
 *  empty → []. Both doors deliver objects (the public port hydrates the grant's
 *  bare keys); a live landing page cast `ausstattung as string[]` and handed
 *  React the objects as children — React #31 for every visitor, green through
 *  tsc. Compare `.key`, show `.label`. */
export function fieldLookups(r: JourneyRecord, key: string): LookupValue[] {
  const v = raw(r, key);
  const list: unknown[] = Array.isArray(v) ? v : v === null || v === undefined || v === '' ? [] : [v];
  return list.map(lookupValue).filter((x): x is LookupValue => x !== null);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?)?$/;

/** The field as text for a card: strings as they are (an ISO date/datetime in
 *  the user's date format — a card said "2026-08-29T18:00:00", live), numbers
 *  formatted by the browser locale, a lookup by its LABEL, null/undefined as ''. */
export function fieldText(r: JourneyRecord, key: string): string {
  const v = raw(r, key);
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') {
    if (ISO_DATE_RE.test(v)) { return v.length > 10 ? formatDateTime(v) : formatDate(v); }
    return v;
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v.toLocaleString() : '';
  if (typeof v === 'boolean') return v ? '✓' : '';
  if (Array.isArray(v)) return v.map(x => (typeof x === 'object' && x !== null && 'label' in x ? String((x as { label: unknown }).label) : String(x))).filter(Boolean).join(', ');
  if (typeof v === 'object') {
    const lk = fieldLookup(r, key);
    return lk ? lk.label : '';
  }
  return String(v);
}

/** A number field (number or numeric string) as number, else null. */
export function fieldNumber(r: JourneyRecord, key: string): number | null {
  const v = raw(r, key);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** A date/datetime field as the ISO string the API stored, else null. */
export function fieldDate(r: JourneyRecord, key: string): string | null {
  const v = raw(r, key);
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v : null;
}

/** The record id an applookup points at (from its URL or a bare id), else null. */
export function fieldRef(r: JourneyRecord, key: string): string | null {
  const v = raw(r, key);
  if (typeof v !== 'string' || !v) return null;
  const m = HEX_ID_RE.exec(v.trim());
  return m ? m[1] : null;
}

/**
 * The record a pointer of ANOTHER record names RIGHT NOW — read fresh, never the
 * value the page loaded minutes ago (EF-14, A11: a feedback went to an interaction
 * that was no longer active, the grant cannot refuse it and the guard tool ran late).
 *
 *   const now = await freshRef(port, 'veranstaltungen', eventId, 'aktive_interaktion');
 *   if (now !== shownInteractionId) { tell the visitor it changed, reload, do not send }
 */
export async function freshRef<E extends EntityKey>(port: JourneyPort, entity: E, id: string, field: RecordFieldKey<E>): Promise<string | null> {
  // a REFERENCE field only (typed): on a yes/no it can never return an id and every send was refused
  // (EF-31, Bau 19: freshRef(port, 'interaktionen', id, 'ist_aktiv') — use freshFlag for that)
  const rec = await port.get(entity, id);
  return rec ? fieldRef(rec, field) : null;
}

/** A yes/no read fresh — `await freshFlag(port, 'interaktionen', shownId, 'aktiv') === true` (the
 *  „genau eine aktiv“ model, EXCLUSIVE_FLAGS). null when the record is gone. */
export async function freshFlag(port: JourneyPort, entity: EntityKey, id: string, field: string): Promise<boolean | null> {
  const rec = await port.get(entity, id);
  if (!rec) return null;
  const v = (rec.fields as Record<string, unknown>)[field];
  return v === true || v === 'true' || v === 1;
}
