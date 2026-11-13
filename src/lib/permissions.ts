/**
 * What the signed-in user may do per list — the platform's own rights
 * (05.10.2026). The dashboard adapts to them: a list the user may not write
 * offers no create, edit, „+“ or flow; a list they may not read stays out of
 * the overview (useDashboardData.forbidden).
 *
 * UX, NOT SECURITY: the platform enforces every right on every request. This
 * only stops the page from offering what would be refused. When the rights
 * cannot be read, everything stays offered — the owner never loses a button
 * because a request failed.
 */
import { useEffect, useState } from 'react';
import { REST_URL, restFetch } from '@/lib/origin';
import { ENTITIES, type EntityKey } from '@/lib/journey/rules';

const APPGROUP_ID = '6af6e746f34a747d65cc3689';

export interface ListRights {
  read: boolean;
  write: boolean;
}

type Rights = Partial<Record<EntityKey, ListRights>>;

interface AppPermissions {
  app_data_view?: boolean;
  app_data_edit?: boolean;
  app_mydata_view?: boolean;
  app_mydata_edit?: boolean;
}

let cached: Promise<Rights | null> | null = null;

/** The rights once per page load (the platform answers `with=apps/permissions`). */
export function loadRights(): Promise<Rights | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const res = await restFetch(`${REST_URL}/appgroups/${APPGROUP_ID}?with=apps/permissions`, {
          credentials: 'include', headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { apps?: Record<string, { permissions?: AppPermissions }> };
        const out: Rights = {};
        for (const [entity, info] of Object.entries(ENTITIES) as [EntityKey, { appId: string }][]) {
          const p = body.apps?.[info.appId]?.permissions;
          if (!p) continue;
          out[entity] = {
            read: Boolean(p.app_data_view || p.app_data_edit || p.app_mydata_view || p.app_mydata_edit),
            // own records count: „Standard“ may create and change its own entries
            write: Boolean(p.app_data_edit || p.app_mydata_edit),
          };
        }
        return out;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}

export interface Permissions {
  /** true once the rights are known (false while loading or when unknown). */
  known: boolean;
  canRead: (entity: EntityKey | string) => boolean;
  canWrite: (entity: EntityKey | string) => boolean;
}

/** The rights as a hook — unknown means allowed. */
export function usePermissions(): Permissions {
  const [rights, setRights] = useState<Rights | null>(null);
  useEffect(() => {
    let alive = true;
    void loadRights().then(r => { if (alive) setRights(r); });
    return () => { alive = false; };
  }, []);
  return {
    known: rights !== null,
    canRead: entity => (rights as Record<string, ListRights | undefined> | null)?.[entity]?.read ?? true,
    canWrite: entity => (rights as Record<string, ListRights | undefined> | null)?.[entity]?.write ?? true,
  };
}
