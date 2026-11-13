/**
 * readFailures — the reads of this page that failed and have nothing to show (EF-13, EF-18).
 *
 * A failed read is no zero: the merge step showed „Feedbacks 0“ (an invalid orderby,
 * then a 502 on the picked record) and „Bestätigen“ would have written the empty frame.
 * useLiveList, useRecordSearch and a flow hook's linked record report here;
 * SummaryStep refuses to confirm while anything is listed.
 */
import { useSyncExternalStore } from 'react';

const failing = new Map<string, string>();
const listeners = new Set<() => void>();
let snapshot: string[] = [];

/** `entity` = the read failed with nothing to show; null = it is fine (again) or gone. */
export function reportReadFailure(id: string, entity: string | null): void {
  if ((failing.get(id) ?? null) === entity) return;
  if (entity) failing.set(id, entity); else failing.delete(id);
  snapshot = [...failing.values()];
  for (const l of listeners) l();
}

/** The entities whose read on this page failed with nothing to show. */
export function useFailingLists(): string[] {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
    () => snapshot,
    () => snapshot,
  );
}
