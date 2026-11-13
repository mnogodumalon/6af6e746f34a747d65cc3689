/**
 * lib/journey/suggestions.ts — a list of suggestions in ONE text, as single lines (generated).
 *
 * An AI result „1. Wie … ? 2. Was … ?“ or a bullet list is one field on the
 * platform; a flow that takes ONE suggestion into a field (J-10, Abnahme 6:
 * „Als Fragestellung übernehmen“ took the whole block) offers each line with
 * one click — <SuggestionPicker {...flow.suggest('<field>')} />.
 */

const MARKER = /^\s*(?:\d{1,3}[.)]|[-–•*·])\s+/;

/** The suggestions of a text: list lines without their marker. When some lines
 *  carry a list marker, only those count (a heading „Vorschläge:“ is no suggestion). */
export function suggestionLines(text: unknown): string[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const marked = lines.filter(l => MARKER.test(l));
  const pool = marked.length > 0 ? marked : lines;
  return [...new Set(pool.map(l => l.replace(MARKER, '').replace(/^\*\*(.+)\*\*$/, '$1').trim()).filter(l => l.length > 1))];
}
