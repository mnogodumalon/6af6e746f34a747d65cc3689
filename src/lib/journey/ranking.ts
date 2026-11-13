/**
 * lib/journey/ranking.ts — exactly ONE winner (generated).
 *
 * „Beliebtester Termin“ was marked on two dates at a tie (EF-44, Doodle KB 6:
 * every count compared with Math.max). A rank is a total order: the first
 * score decides, a tie goes to the next score, the last tie to the earliest
 * `earliest` value (an ISO date or any string that sorts), the very last to
 * the first in the list. Nothing wins with a first score of zero.
 *
 *   const top = topOne(termine, [t => counts[t.id]?.ja ?? 0, t => counts[t.id]?.vielleicht ?? 0], t => fieldDate(t, 'beginn'));
 *   … className={t.id === top?.id ? 'bg-emerald-50' : ''}
 */

/** The one item with the highest scores (in order), ties broken by the earliest `earliest`, then by
 *  list order; null for an empty list or when the best first score is not above zero. */
export function topOne<T>(items: readonly T[], scores: ReadonlyArray<(item: T) => number | null | undefined>,
                          earliest?: (item: T) => string | null | undefined): T | null {
  let best: T | null = null;
  let bestScores: number[] = [];
  let bestEarly = '';
  for (const item of items) {
    const s = scores.map(fn => Number(fn(item) ?? 0) || 0);
    const early = earliest ? String(earliest(item) ?? '') : '';
    if (best === null) { best = item; bestScores = s; bestEarly = early; continue; }
    let cmp = 0;
    for (let i = 0; i < s.length && cmp === 0; i++) cmp = s[i] - bestScores[i];
    if (cmp === 0 && earliest) cmp = early && bestEarly ? (early < bestEarly ? 1 : early > bestEarly ? -1 : 0) : (early ? 1 : 0);
    if (cmp > 0) { best = item; bestScores = s; bestEarly = early; }
  }
  return best !== null && (bestScores[0] ?? 0) > 0 ? best : null;
}
