/**
 * exclusive — „genau eine pro Elternteil“, synchron (EF-25, Bau 15).
 *
 * A yes/no on a child that a public page reads where it is set (the ACTIVE interaction of
 * an event) holds for ONE child per parent. Setting it on one clears it on the siblings
 * in the same click — never left to a tool that may run late or not at all (EF-14, EF-18).
 * The internal door only; the plan's guard tool stays the second line.
 *
 *   await clearSiblings(servicePort, 'interaktionen', 'aktiv', 'veranstaltung', id);
 */
import type { JourneyPort } from './port';
import { fieldRef } from './fields';
import type { EntityKey } from './rules';

interface Updating { update(entity: EntityKey, id: string, values: Record<string, unknown>): Promise<unknown> }

/** Clears `field` on every OTHER record of `entity` that shares `id`'s parent (`ref`). */
export async function clearSiblings(port: JourneyPort & Updating, entity: EntityKey, field: string, ref: string, id: string): Promise<number> {
  const rec = await port.get(entity, id);
  const parent = rec ? fieldRef(rec, ref) : null;
  if (!parent) return 0;
  const rows = await port.list(entity, { filter: `r.v_${field} == True and '${parent}' in str(r.v_${ref})` });
  let n = 0;
  for (const r of rows) {
    if (r.id === id) continue;
    await port.update(entity, r.id, { [field]: false });
    n++;
  }
  return n;
}
