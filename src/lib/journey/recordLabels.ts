/**
 * recordLabels — every display name the page has learned for a record, in one
 * place. `useRecordSearch` writes here whenever it maps a record to a card
 * (`toItem(...).title`); `formatFieldValue` reads here when a form value is a
 * record id (or a record URL) the form itself has no label for.
 *
 * Why: a review row showed "Zusatzleistungen 6a9ae0fdd32995434b7edfb2" (live)
 * because a page stored a pick with `f.set(key, ids)` and no name. The gate
 * now rejects that shape — this registry is the safety net for what the gate
 * cannot see (a draft restored on another day, a label learned by a second
 * hook on the page). Module state: one page, one registry, no React.
 */
const registry = new Map<string, string>();

/** The 24-hex record id inside a value — bare id or record URL (…/records/<id>). */
export function recordIdOf(value: unknown): string | null {
  const m = /([a-f0-9]{24})\s*$/i.exec(String(value ?? ''));
  return m ? m[1].toLowerCase() : null;
}

export function rememberRecordLabel(id: string, label: string | undefined): void {
  const key = recordIdOf(id);
  if (key && label && label.trim()) registry.set(key, label);
}

export function recordLabelOf(value: unknown): string | undefined {
  const key = recordIdOf(value);
  return key ? registry.get(key) : undefined;
}

/** Every 24-hex record id inside a TEXT a page put together (a review row,
 *  a success fact, an answer chip) replaced by the name the page learned,
 *  else by „Eintrag“ — a raw id is never shown to a person (J-9, acceptance 4:
 *  „Enthaltene Beiträge: 1. 6aeaf129cf…“ came from a row the page built). */
export function withRecordNames(text: string, unnamed = '…'): string {
  if (!text || !/[a-f0-9]{24}/i.test(text)) return text;
  return text.replace(/(?:https?:\/\/\S*?\/records\/)?\b([a-f0-9]{24})\b/gi, (_m, id: string) => registry.get(id.toLowerCase()) ?? unnamed);
}

