import type { ReactNode } from 'react';
import { ENTRANCE, entranceDelay } from '@/lib/polish';

/**
 * DashboardGrid — the page skeleton every dashboard composes into.
 *
 * It owns the page PHYSICS so they cannot vary between builds:
 *   · mobile order: hero → kpis → aside (work lists first) → primary
 *   · staggered motion-safe entrance: hero 0ms → kpis 120ms → aside 240ms → primary 360ms
 *   · consistent gaps (gap-6 / space-y-6)
 *
 * You pick the VARIANT — a semantic decision, like picking the widget:
 *
 *   · 'split' (default) — KPIs on top; primary 2/3 left (3/4 on xl),
 *     aside rail right. The workhorse: calendar/map/detail + a work list.
 *   · 'wide' — KPIs on top; primary takes the FULL width; aside surfaces
 *     follow as ONE band of equal columns below. For surfaces that need
 *     room: a kanban board, a resource timeline, a wide data table, a
 *     7-day week. Pair with the slim `<StatStrip>` so the surface starts
 *     high on the page.
 *   · 'rail' — DEPRECATED, never choose it for new dashboards (kept only so
 *     existing ones keep compiling): the side column grows with the SUM of
 *     its surfaces and outruns the board. Use 'wide' + `<StatStrip>`.
 *
 * It owns NOTHING content-related — every slot takes arbitrary nodes:
 *
 *   <DashboardGrid
 *     variant="wide"                                       // optional — default 'split'
 *     hero={überfällig.length > 0 && <HeroBanner …>}      // optional — only when urgent
 *     kpis={<StatStrip>…</StatStrip>}                      // optional — or <StatCardRow>
 *     aside={<><WorkList … /><WorkList … /></>}            // optional — 1–2 surfaces, OWN axis
 *     primary={<KanbanWidget … />}                         // the weight: board/calendar/timeline/table
 *   />
 *
 * The page header (h1 greeting + context line + primary action button) stays
 * ABOVE this component — it is not a slot.
 *
 * Opting out: building the page layout by hand is allowed ONLY for a genuinely
 * different page shape (full-screen map, gallery-first) and costs a written
 * justification comment: `// layout-opt-out: <reason>`.
 */
export type DashboardGridVariant = 'split' | 'wide' | 'rail';

interface DashboardGridProps {
  /** The page shape — see the variant guide above. Default: 'split'. */
  variant?: DashboardGridVariant;
  /** Alert banner (HeroBanner) — the ONE urgent signal. Render it conditionally;
   *  pass nothing when nothing is urgent (falsy values are fine). */
  hero?: ReactNode;
  /** The KPI line — a <StatCardRow> (cards) or <StatStrip> (slim bar). */
  kpis?: ReactNode;
  /** Secondary surfaces (WorkList, second-entity list, breakdown). They slice a
   *  DIFFERENT axis than `primary` — never the same records re-listed. */
  aside?: ReactNode;
  /** The primary work surface — widget, table↔cards, gallery. */
  primary: ReactNode;
  className?: string;
}

export function DashboardGrid({ variant = 'split', hero, kpis, aside, primary, className }: DashboardGridProps) {
  const heroBlock = hero ? <div className={ENTRANCE}>{hero}</div> : null;

  if (variant === 'wide') {
    return (
      <div className={`space-y-6 ${className ?? ''}`}>
        {heroBlock}
        {kpis ? (
          <div className={ENTRANCE} style={entranceDelay(120)}>{kpis}</div>
        ) : null}
        <div className="flex flex-col gap-6">
          <div className={`order-2 lg:order-1 min-w-0 ${ENTRANCE}`} style={entranceDelay(360)}>
            {primary}
          </div>
          {aside ? (
            <div
              className={`order-1 lg:order-2 min-w-0 grid gap-6 lg:grid-flow-col lg:auto-cols-fr [&>*]:min-w-0 ${ENTRANCE}`}
              style={entranceDelay(240)}
            >
              {aside}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (variant === 'rail') {
    const hasRail = Boolean(kpis) || Boolean(aside);
    return (
      <div className={`space-y-6 ${className ?? ''}`}>
        {heroBlock}
        {hasRail ? (
          <div className="lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:gap-6 flex flex-col gap-6 lg:flex-none">
            <div className="order-1 lg:order-2 min-w-0 space-y-6">
              {kpis ? (
                <div className={ENTRANCE} style={entranceDelay(120)}>{kpis}</div>
              ) : null}
              {aside ? (
                <div className={`space-y-6 ${ENTRANCE}`} style={entranceDelay(240)}>{aside}</div>
              ) : null}
            </div>
            <div className={`order-2 lg:order-1 min-w-0 lg:col-span-2 xl:col-span-3 ${ENTRANCE}`} style={entranceDelay(360)}>
              {primary}
            </div>
          </div>
        ) : (
          <div className={`min-w-0 ${ENTRANCE}`} style={entranceDelay(240)}>{primary}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${className ?? ''}`}>
      {heroBlock}
      {kpis ? (
        <div className={ENTRANCE} style={entranceDelay(120)}>{kpis}</div>
      ) : null}
      {aside ? (
        <div className="lg:grid lg:grid-cols-3 xl:grid-cols-4 lg:gap-6 flex flex-col gap-6 lg:flex-none">
          <div className={`order-1 lg:order-2 min-w-0 space-y-6 ${ENTRANCE}`} style={entranceDelay(240)}>
            {aside}
          </div>
          <div className={`order-2 lg:order-1 min-w-0 lg:col-span-2 xl:col-span-3 ${ENTRANCE}`} style={entranceDelay(360)}>
            {primary}
          </div>
        </div>
      ) : (
        <div className={`min-w-0 ${ENTRANCE}`} style={entranceDelay(240)}>{primary}</div>
      )}
    </div>
  );
}
