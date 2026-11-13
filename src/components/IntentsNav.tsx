import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconSettings, IconMap } from '@tabler/icons-react';
import { INTENTS, INTENTS_PENDING, INTENTS_PENDING_SINCE, PENDING_MAX_MINUTES } from '@/config/intents';
import { t, locale } from '@/i18n';
import { usePageJobs } from '@/hooks/usePageJobs';
import { NavRows, type NavRow } from '@/components/NavRows';
import { getAppMapCached } from '@/lib/appMap';
import { usePermissions } from '@/lib/permissions';
import { FLOW_ENTITIES } from '@/config/plan';

/**
 * IntentsNav — the sidebar list of the dashboard's flows ("Abläufe").
 *
 * Same shape as the platform's own lists (the UL4 template's sidebar): the
 * section label comes from the surrounding la-nav-section in Layout, one row
 * per flow from the `src/config/intents.ts` registry (its icon, its label in
 * the active locale), and — exactly like „Seiten verwalten" in the public
 * pages widget — a last gear row „Abläufe verwalten" leading to the admin page
 * where flows are created, changed and removed. No separate create row: the
 * admin page is the one place for that, as on the platform.
 *
 * A flow that is still being built shows as a pulsing row: during the Phase-1
 * window (INTENTS_PENDING, at most PENDING_MAX_MINUTES after the Phase-1
 * deploy — a red Phase 2 never redeploys, so the row expires here) and while
 * a page job creates one from the dashboard (usePageJobs).
 */

/** True while the Phase-1 window is plausibly still open. No stamp (a legacy
 *  bundle) keeps the old behaviour: pending until the next update. */
export function isPendingWindowOpen(pending: boolean, since: string | null, maxMinutes: number, now: number = Date.now()): boolean {
  if (!pending) return false;
  if (!since) return true;
  const started = Date.parse(since);
  if (Number.isNaN(started)) return true;
  return now - started < maxMinutes * 60_000;
}

const MANAGE_PATH = '/verwaltung/ablaeufe';
// The application map — what the built application does and what the owner
// may change on the running application; a second gear row below "manage".
const MAP_PATH = '/verwaltung/anwendung';

function labelOf(label: string | { de?: string; en?: string; cs?: string }): string {
  // Multilingual labels pick the active locale; legacy plain strings render
  // as-is (pre-i18n dashboards).
  if (typeof label === 'string') return label;
  return (label as Record<string, string | undefined>)[locale] ?? label.de ?? label.en ?? label.cs ?? '';
}

export function IntentsNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const pending = isPendingWindowOpen(INTENTS_PENDING, INTENTS_PENDING_SINCE, PENDING_MAX_MINUTES);
  const { jobs } = usePageJobs('flow', { idleMs: 60000 });
  const building = jobs.some(j => j.status === 'running' && !j.target);

  const [hasMap, setHasMap] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    getAppMapCached().then(s => { if (on) setHasMap(!!s.map); }).catch(() => { if (on) setHasMap(false); });
    return () => { on = false; };
  }, []);

  // a flow writes its lists: without the right to write one of them it is not offered
  const perms = usePermissions();
  const rows = useMemo<NavRow[]>(() => {
    const allowed = INTENTS.filter(intent => {
      const ents = FLOW_ENTITIES[intent.path.replace(/\/+$/, '').split('/').pop() ?? ''];
      return !ents || ents.every(e => perms.canWrite(e));
    });
    const items: NavRow[] = allowed.map(intent => {
      const Icon = intent.icon;
      return {
        key: intent.path,
        title: labelOf(intent.label),
        url: `#${intent.path}`,
        icon: Icon ? <Icon size={16} stroke={1.5} /> : undefined,
        here: location.pathname === intent.path,
      };
    });
    if (pending || building) {
      items.push({ key: 'pending', title: t('intents_pending'), pending: true });
    }
    items.push({
      key: 'manage',
      title: t('ia_manage'),
      url: `#${MANAGE_PATH}`,
      icon: <IconSettings size={16} />,
      here: location.pathname === MANAGE_PATH,
    });
    // „Deine Anwendung“ only when there is a map: a dashboard that was never
    // orchestrated (legacy, or the update flow added the page) has nothing to show there
    if (hasMap !== false) {
      items.push({
        key: 'map',
        title: t('am_nav'),
        url: `#${MAP_PATH}`,
        icon: <IconMap size={16} />,
        badge: t('am_beta'),
        here: location.pathname === MAP_PATH,
      });
    }
    return items;
  }, [location.pathname, pending, building, hasMap, perms]);

  const onSelect = (row: NavRow, e: MouseEvent<HTMLAnchorElement>) => {
    // Plain left click → SPA navigation; modifier clicks keep the href.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !row.url) return;
    e.preventDefault();
    if (row.here) return;
    navigate(row.url.slice(1));
    // Mobile: the drawer is a fullscreen overlay — close it after choosing.
    if (window.matchMedia('(max-width: 767.98px)').matches) {
      e.currentTarget.closest('la-drawer')?.setAttribute('collapsed', '');
    }
  };

  return <NavRows rows={rows} ariaLabel={t('intents_heading')} onSelect={onSelect} />;
}
