/**
 * Occupancy — the ONE derivation of "which nights are taken", driven by the
 * agent's decision in `src/config/journey.ts` (`OCCUPANCY`).
 *
 *   const blocked = occupancyFor('buchungen', buchungen, { resource: zimmerId });
 *   <AvailabilityRangePicker {...f.range('anreise', 'abreise', { blocked })} />
 *
 * Both doors call this: the internal flow with the records from
 * useDashboardData, the public form with the records its grant lists. The
 * RULE (which two fields form the stay, which field names the booked
 * resource — an applookup or a single lookup —, which status keys mean the booking occupies nothing) is decided
 * once by the build agent — nothing here guesses from field names. Rules:
 *
 *   1. only records of the selected resource count (a room, a vehicle) —
 *      pass the picked id; without one, or for an entity whose rule names no
 *      resource, every record counts
 *   2. records in a "free" status never block
 *   3. the departure day is exclusive (AvailabilityRangePicker's convention)
 *
 * No rule for the entity → no occupancy (empty), and callers show no
 * availability claim. A flow that filtered by hand and a public form that
 * blocked every record once showed DIFFERENT calendars for the same rooms.
 */
import { OCCUPANCY, TAKEN_BY, type OccupancyRule, type TakenRule } from '@/config/journey';
import type { EntityKey } from './rules';

export type { OccupancyRule, TakenRule };

/** Who takes a record of this entity (a booking takes a slot), or undefined. */
export function takenRuleOf(entity: EntityKey | string): TakenRule | undefined {
  return (TAKEN_BY as Record<string, TakenRule | undefined>)[entity];
}

export interface OccupancyRange {
  start: string;
  end?: string | null;
}

export interface OccupancyOptions {
  /** The picked resource: a record id (room, vehicle) or a lookup key (place number) — when the rule names a resource. */
  resource?: string | null;
  /** Count cancelled/free records as occupied too (default false). */
  includeFree?: boolean;
}

type RecordLike = { fields: Record<string, unknown> };

/** The agent's occupancy rule for an entity, or undefined = no availability semantics. */
export function occupancyRuleOf(entity: EntityKey | string): OccupancyRule | undefined {
  return (OCCUPANCY as Record<string, OccupancyRule | undefined>)[entity];
}

function keyOf(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'object' && 'key' in (v as object)) return String((v as { key: unknown }).key);
  return String(v);
}

/** A stored reference (REST URL, grant ref, bare id) points at `id`? */
function refMatches(value: unknown, id: string): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.some(v => refMatches(v, id));
  const s = keyOf(value) ?? '';
  return s === id || s.endsWith(`/${id}`);
}

export function occupancyFor(
  entity: EntityKey | string,
  records: readonly RecordLike[],
  opts: OccupancyOptions = {},
): OccupancyRange[] {
  const rule = occupancyRuleOf(entity);
  if (!rule) return [];
  const freeKeys = new Set(rule.freeKeys ?? []);
  const resourceId = opts.resource ? String(opts.resource) : null;
  return records
    .filter(r => {
      if (rule.resource && resourceId && !refMatches(r.fields[rule.resource], resourceId)) return false;
      if (!opts.includeFree && rule.statusField && freeKeys.size > 0) {
        const k = keyOf(r.fields[rule.statusField]);
        if (k && freeKeys.has(k)) return false;
      }
      return true;
    })
    .map(r => ({
      start: String(r.fields[rule.from] ?? '').slice(0, 10),
      end: r.fields[rule.to] ? String(r.fields[rule.to]).slice(0, 10) : null,
    }))
    .filter(b => b.start);
}


/** The ids of the records the taking records point at (REST URL, grant ref or bare id). */
export function takenIdsFrom(rule: TakenRule, records: { fields: Record<string, unknown> }[]): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(add); return; }
    const s = keyOf(v);
    if (!s) return;
    const id = s.replace(/\/+$/, '').split('/').pop();
    if (id) out.add(id);
  };
  for (const r of records) add(r.fields[rule.field]);
  return out;
}
