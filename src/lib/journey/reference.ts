/**
 * Human reference for a created record — deterministic, no counter, no
 * server state: an entity prefix plus the last six characters of the record
 * id (`B-42D81A`). The same record always yields the same reference, and an
 * owner can find the record by its id tail.
 */
import { ENTITIES, type EntityKey } from './rules';

export function makeReference(entity: EntityKey | string, recordId: string, prefix?: string): string {
  const info = (ENTITIES as Record<string, { pascal: string } | undefined>)[entity];
  const p = (prefix ?? info?.pascal?.charAt(0) ?? 'R').toUpperCase();
  const tail = recordId.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  return `${p}-${tail || '000000'}`;
}
