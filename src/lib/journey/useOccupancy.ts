/**
 * useOccupancy — the taken nights of an entity, read through the page's door.
 *
 *   const belegung = useOccupancy(servicePort, 'buchungen', { resource: f.get('zimmer') as string });   // with a flow hook: flow.port
 *   <AvailabilityRangePicker {...f.range('anreise', 'abreise', { blocked: belegung.blocked })} />
 *   const zimmer = useRecordSearch(servicePort, 'zimmer', { where: belegung.freeIn(anreise, abreise), … });
 *
 * Before, every booking flow pulled ALL bookings through `useDashboardData`
 * only to hand them to `occupancyFor` — the one import that also opened the
 * door to hand-rolled picks (six live pages, four with that import). Here the
 * hook loads the entity's stay fields through the port (projection: from, to,
 * resource, status) and applies the agent's rule from `src/config/journey.ts`.
 * No rule → nothing blocked, `isFree` is always true, and the page shows no
 * availability claim (same as `occupancyFor`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { rangeIsFree } from '@/components/blocks/AvailabilityRangePicker';
import type { JourneyPort, JourneyRecord } from './port';
import { occupancyFor, occupancyRuleOf, type OccupancyRange } from './occupancy';
import type { EntityKey } from './rules';
import { t } from '@/i18n';

export interface Occupancy {
  /** The nights taken — for `opts.resource` when given, else across every resource. */
  blocked: OccupancyRange[];
  /** Is the stay [from, to) free for this resource? Departure day exclusive; an incomplete pair is not free. */
  isFree(from: string | null | undefined, to: string | null | undefined, resource?: string | null): boolean;
  /** `where` for the resource's pick step: only resources free in the picked stay (no stay yet → all). */
  freeIn(from: string | null | undefined, to: string | null | undefined): (resource: JourneyRecord) => boolean;
  /** Whether the entity has an occupancy rule at all. */
  ruled: boolean;
  loading: boolean;
  error: string | null;
  reload(): Promise<void>;
}

export function useOccupancy(
  port: JourneyPort,
  entity: EntityKey,
  opts: { resource?: string | null } = {},
): Occupancy {
  const rule = occupancyRuleOf(entity);
  const [records, setRecords] = useState<JourneyRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(rule));
  const [error, setError] = useState<string | null>(null);
  const fieldsKey = rule ? [rule.from, rule.to, rule.resource, rule.statusField].filter(Boolean).join('|') : '';

  const load = useCallback(async () => {
    if (!rule) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fields = [rule.from, rule.to, rule.resource, rule.statusField].filter((f): f is string => Boolean(f));
      setRecords(await port.list(entity, { fields }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sel_search_failed'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the rule is module data; fieldsKey stands in for it
  }, [port, entity, fieldsKey]);

  useEffect(() => { void load(); }, [load]);

  const resource = opts.resource ?? null;
  const blocked = useMemo(() => occupancyFor(entity, records, { resource }), [entity, records, resource]);

  const isFree = useCallback((from: string | null | undefined, to: string | null | undefined, res?: string | null): boolean => {
    if (!from || !to) return false;
    if (!rule) return true;
    return rangeIsFree(from, to, occupancyFor(entity, records, { resource: res ?? null }));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the rule is module data
  }, [entity, records]);

  const freeIn = useCallback((from: string | null | undefined, to: string | null | undefined) =>
    (r: JourneyRecord): boolean => (!from || !to ? true : isFree(from, to, r.id)), [isFree]);

  return { blocked, isFree, freeIn, ruled: Boolean(rule), loading, error, reload: load };
}
