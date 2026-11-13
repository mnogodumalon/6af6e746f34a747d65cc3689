/**
 * Text search over records — the vSQL half (internal door) and its client-side
 * twin (public door, where grants allow no `filter` at all).
 *
 * The query is SANITIZED rather than escaped: everything outside letters,
 * digits, whitespace and a handful of address/e-mail characters is dropped, so
 * what reaches the vSQL string literal cannot contain a quote or a backslash
 * and cannot break out of it. Escaping would be the other option and the
 * riskier one — one missed case is an injection, one dropped character is a
 * slightly wider search.
 */
import { SEARCH_QUERY_MAX } from './selectMode';

const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Letters, digits, whitespace and a few address/e-mail characters. Everything else is DROPPED
 *  (no quotes, no backslashes, no parentheses) — so the query can never break out of the vSQL
 *  string literal and needs no escaping. */
const ALLOWED = /[^\p{L}\p{N}\s@._+\-/]/gu;

export function sanitizeSearchQuery(raw: string): string {
  return raw.normalize('NFC').replace(ALLOWED, ' ').replace(/\s+/g, ' ').trim().slice(0, SEARCH_QUERY_MAX).toLowerCase();
}

/** vSQL: every token must occur in at least one of the fields (AND over tokens, OR over fields).
 *  Returns null for an empty query. Throws on a malformed field name (a bug, not user input).
 *
 *  `str(r.v_x).lower()` is used rather than `r.v_x.lower()` so an empty or null
 *  field is a non-match instead of an error — verified live 2026-09-02 (200 with
 *  correct hits across 263 records incl. empty fields). */
export function buildSearchFilter(query: string, fields: string[]): string | null {
  for (const f of fields) if (!FIELD_RE.test(f)) throw new Error(`buildSearchFilter: invalid field '${f}'`);
  const tokens = sanitizeSearchQuery(query).split(' ').filter(Boolean);
  if (tokens.length === 0 || fields.length === 0) return null;
  return tokens
    .map(tok => '(' + fields.map(f => `'${tok}' in str(r.v_${f}).lower()`).join(' or ') + ')')
    .join(' and ');
}

/** `(a) and (b)` over the non-empty parts — a step's standing restriction
 *  (`filter`) and the typed search share one vSQL request and one count. */
const RECORD_ID_RE = /^[a-f0-9]{24}$/i;

/** vSQL for ONE record: `r.id == '<id>'`. The record's id is `r.id` in vSQL —
 *  `r.record_id` (the REST field name) is an unknown name there (live 400,
 *  VSQLUnknownNameError). The id is validated, not escaped: a 24-hex id
 *  cannot leave the string literal. */
export function byIdFilter(id: string): string {
  if (!RECORD_ID_RE.test(id)) throw new Error(`byIdFilter: '${id}' is not a record id`);
  return `r.id == '${id.toLowerCase()}'`;
}

/** vSQL for "the record(s) linked to <id>" through an applookup OR a
 *  multipleapplookup field: `'<id>' in str(r.v_<field>)`. One shape for both
 *  arities (probed live: `r.v_kunde.id == '…'` works for a single ref only,
 *  list comprehensions and indexing are invalid vSQL). Field and id are
 *  validated, not escaped. */
export function refFilter(field: string, id: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(field)) throw new Error(`refFilter: '${field}' is not a field key`);
  if (!RECORD_ID_RE.test(id)) throw new Error(`refFilter: '${id}' is not a record id`);
  return `'${id.toLowerCase()}' in str(r.v_${field})`;
}

export function combineFilters(...parts: Array<string | null | undefined>): string | undefined {
  const live = parts.map(p => (p ?? '').trim()).filter(Boolean);
  if (live.length === 0) return undefined;
  if (live.length === 1) return live[0];
  return live.map(p => `(${p})`).join(' and ');
}

/** Client-side twin of buildSearchFilter for doors that cannot filter server-side (public grants). */
export function matchesSearch(fields: Record<string, unknown>, query: string, searchFields: string[]): boolean {
  const tokens = sanitizeSearchQuery(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  const hay = searchFields.map(f => String(fields[f] ?? '').toLowerCase());
  return tokens.every(tok => hay.some(h => h.includes(tok)));
}
