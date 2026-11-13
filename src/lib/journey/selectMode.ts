/** Which form a "pick a record" step takes — decided by the COUNT, never by
 *  the agent's guess. One source for block, hook and the Python summary
 *  (LARGE_ENTITY_FROM in app/services/sandbox.py must equal SERVER_SEARCH_FROM). */
export type SelectMode = 'auto' | 'pills' | 'cards' | 'combobox';
export type ResolvedSelectMode = Exclude<SelectMode, 'auto'>;

/** Up to here a step is COMPACT: roomy cards, no search box (searching three
 *  rooms is noise). Pills exist only as an explicit `mode="pills"` — they drop
 *  subtitle and facts, which a small set has every right to show large. */
export const COMPACT_MAX = 5;
export const CARDS_MAX = 50;
export const SERVER_SEARCH_FROM = 200;
export const SEARCH_PAGE_SIZE = 50;
export const SEARCH_MIN_CHARS = 2;
export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_QUERY_MAX = 60;

/** `total` is the number of records the step could offer (server count when
 *  known, else the loaded items). 0 → cards (renders the empty state + create). */
export function resolveSelectMode(total: number, requested: SelectMode = 'auto'): ResolvedSelectMode {
  if (requested !== 'auto') return requested;
  const n = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  if (n === 0) return 'cards';
  if (n <= CARDS_MAX) return 'cards';   // ≤ COMPACT_MAX: the cards render roomy and without a search box
  return 'combobox';
}
