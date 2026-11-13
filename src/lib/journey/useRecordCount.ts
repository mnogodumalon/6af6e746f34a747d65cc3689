/**
 * useRecordCount — ONE number over many records, through the page's door.
 *
 *   const belegt = useRecordCount(servicePort, 'anmeldungen', {
 *     filter: kursId ? combineFilters(refFilter('kurs', kursId), "r.v_status in ['neu', 'bestaetigt']") : undefined,
 *     where: a => fieldLookup(a, 'status')?.key !== 'abgemeldet',
 *     enabled: Boolean(kursId),
 *   });
 *   const voll = belegt.count !== null && belegt.count >= maxPlaetze;
 *
 * Capacity, "how many are open", "already booked twice": a flow needs the
 * count, never the records. Internal door: one aggregate request, no records
 * travel. Public door (grants cannot count or filter): the hook loads what
 * the grant hands out and counts with `where` — so give both twins, exactly
 * as for useRecordSearch's `filter`/`where`. `enabled: false` while the
 * condition is not known yet (no course picked) → `count` stays null and
 * nothing is requested.
 *
 * Live (07.09.2026): a course-enrolment flow built its capacity check as a
 * SECOND useRecordSearch with a dummy filter (`r.id == "none"`) and read the
 * cards as records — a type error, two requests and a repair agent for one
 * number.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JourneyPort, JourneyRecord } from './port';
import type { EntityKey } from './rules';
import { t } from '@/i18n';

export interface RecordCount {
  /** null while loading, while `enabled` is false, or after an error. */
  count: number | null;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
}

export interface RecordCountOptions {
  /** vSQL restriction (internal door). */
  filter?: string;
  /** Its TypeScript twin — the only restriction the public door can apply. */
  where?: (record: JourneyRecord) => boolean;
  /** false = the condition is not complete yet; nothing is requested. Default true. */
  enabled?: boolean;
}

export function useRecordCount(port: JourneyPort, entity: EntityKey, opts: RecordCountOptions = {}): RecordCount {
  const { filter, enabled = true } = opts;
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  // Never re-fetch because an inline predicate changed identity.
  const whereRef = useRef(opts.where);
  whereRef.current = opts.where;

  const load = useCallback(async () => {
    if (!enabled) {
      setCount(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // `where` without a `filter` twin has nothing the server could apply:
      // count over the loaded rows then, like the public door does.
      let n = filter ? await port.count(entity, { filter }) : null;
      if (n === null) {
        const rows = await port.list(entity, filter ? { filter } : undefined);
        const where = whereRef.current;
        n = (where ? rows.filter(where) : rows).length;
      }
      setCount(n);
    } catch (e) {
      setCount(null);
      setError(e instanceof Error ? e.message : t('sel_search_failed'));
    } finally {
      setLoading(false);
    }
  }, [port, entity, filter, enabled]);

  useEffect(() => { void load(); }, [load]);

  return { count, loading, error, reload: load };
}
