/**
 * StatCard / StatStrip — the two KPI surfaces of the overview.
 *
 * ─── API at a glance (exact prop names — NEVER guess) ──────────────────
 *
 *  <StatCard      title value description? icon? tone? onClick? active?
 *                 footer? className?>
 *      The full card: big value, optional description line, optional footer
 *      slot. Use it for the board's headline numbers.
 *  <StatStrip     className? children>
 *      The slim KPI bar: it takes <StatStripItem>s as children and nothing
 *      else. Pass it to <DashboardGrid kpis={…}> when the numbers are
 *      context, not the headline.
 *  <StatStripItem title value icon? tone? onClick? active?>
 *      One segment. `value` is string | number (already formatted).
 *
 *  tone (both, default 'default'):
 *      'default' | 'primary' | 'success' | 'warning' | 'destructive'
 *      Exported as `StatCardTone`. It follows the VALUE'S STATE, never the
 *      category — see the palette note below.
 *
 *  A clickable card/segment FILTERS the surface below it: pair `onClick`
 *  with `active` and toggle the filter off on the second click.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Closed state palette — the SAME five tones as the widget family
 *  (CalendarWidget/ResourceTimeline). The tone follows the VALUE's STATE, never
 *  the category: an "Überfällig: 0" card stays 'default', not 'destructive'. */
export type StatCardTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  /** Rendered JSX, e.g. icon={<IconBook size={18} className="text-muted-foreground" />} */
  icon?: ReactNode;
  /** State tint + value colour from the family palette. Compute it from the
   *  data (thresholds live in the consumer), don't hardcode per category. */
  tone?: StatCardTone;
  /** Makes the card a real button (hover/focus affordances included). The
   *  idiom: a clickable KPI FILTERS the surface below it — pair with `active`
   *  and toggle off on the second click. No separate filter-chip row needed. */
  onClick?: () => void;
  /** Pressed look while this card's filter is applied (shows a ✕ hint). */
  active?: boolean;
  /** Free footer slot the consumer composes from its own data: a delta
   *  ("▲ +12 % vs. Mai"), a small sparkline, a progress bar against a target,
   *  or the next deadline. Optional — omit when the data has no real context. */
  footer?: ReactNode;
  className?: string;
}

const TONE_CARD: Record<StatCardTone, string> = {
  default: '',
  primary: 'border-primary/30',
  success: 'border-emerald-200',
  warning: 'border-amber-200 bg-gradient-to-b from-amber-50/70 to-card',
  destructive: 'border-red-200 bg-gradient-to-b from-red-50/70 to-card',
};
const TONE_VALUE: Record<StatCardTone, string> = {
  default: 'text-foreground',
  primary: 'text-primary',
  success: 'text-emerald-600',
  warning: 'text-amber-700',
  destructive: 'text-destructive',
};

export function StatCard({ title, value, description, icon, tone = 'default', onClick, active = false, footer, className }: StatCardProps) {
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
        {active ? (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-background"
            aria-hidden
          >
            ✕
          </span>
        ) : icon}
      </div>
      <p className={`text-2xl sm:text-3xl font-bold mt-1 sm:mt-2 truncate ${TONE_VALUE[tone]}`}>{value}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1 truncate">{description}</p>
      )}
      {footer && <div className="mt-2 sm:mt-3 min-w-0">{footer}</div>}
    </>
  );

  // Compact on phones (p-4): a 2×2 KPI grid must never push the primary work
  // surface below the first viewport. Roomy from sm upwards.
  const shell = `rounded-xl border bg-card p-4 sm:p-6 shadow-sm overflow-hidden ${TONE_CARD[tone]}${active ? ' ring-2 ring-inset ring-foreground/70' : ''}${className ? ` ${className}` : ''}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`block w-full text-left transition-all hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${shell}`}
      >
        {content}
      </button>
    );
  }
  return <div className={shell}>{content}</div>;
}

/** One KPI segment inside a <StatStrip>. Same idioms as StatCard: `tone`
 *  follows the VALUE's state, a clickable segment FILTERS the surface below
 *  (pair with `active`, toggle off on the second click). */
interface StatStripItemProps {
  title: string;
  value: string | number;
  /** Rendered JSX, e.g. icon={<IconUsers size={18} />} */
  icon?: ReactNode;
  tone?: StatCardTone;
  onClick?: () => void;
  active?: boolean;
}

export function StatStripItem({ title, value, icon, tone = 'default', onClick, active = false }: StatStripItemProps) {
  const content = (
    <>
      {active ? (
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold leading-none text-background"
          aria-hidden
        >
          ✕
        </span>
      ) : icon ? (
        <span className="shrink-0 text-muted-foreground">{icon}</span>
      ) : null}
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-muted-foreground">{title}</span>
        <span className={`block whitespace-nowrap text-xl font-bold leading-tight tabular-nums ${TONE_VALUE[tone]}`}>{value}</span>
      </span>
    </>
  );
  const base = 'flex min-w-0 items-center gap-3 bg-card px-4 py-3';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        className={`${base} text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring${active ? ' bg-muted/70' : ''}`}
      >
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}

/** The slim KPI bar — ONE flat card, one segment per KPI, hairline dividers.
 *  A fraction of the cards row's height (~72px vs ~200px), and VALUES never
 *  truncate: the title gives way first, and segments wrap to a second strip
 *  row when space runs out instead of squeezing. Built for pages where the
 *  primary surface needs the screen (a full-width board/timeline/table via
 *  `variant="wide"`). 2–4 segments — a strip is not a place to pad; drop
 *  filler counts. Mobile: 2-per-row grid inside the same card. Pass
 *  <StatStripItem>s as children:
 *
 *    <StatStrip>
 *      <StatStripItem title="Neue Bewerbungen" value={6} tone="warning" icon={…} onClick={…} active={…} />
 *      <StatStripItem title="Im Prozess" value={12} icon={…} />
 *    </StatStrip>
 *
 *  Use <StatCardRow> instead when the numbers deserve card prominence
 *  (description, footer delta/sparkline/progress). */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border bg-border/60 shadow-sm ${className ?? ''}`}>
      <div className="grid grid-cols-2 gap-px md:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">{children}</div>
    </section>
  );
}

/** The KPI row. Mobile: ONE swipeable line — each card takes ~46% width and
 *  the row runs FULL-BLEED to the physical screen edges (measured, padding-
 *  agnostic), so the clipped next card visibly runs UNDER the glass edge —
 *  the same scroll affordance as the kanban column paging. The first card
 *  still aligns with the page content (padding compensation); scroll-snap per
 *  card. From md up it becomes a regular equal-width grid row. Pass the
 *  <StatCard>s as children:
 *
 *    <StatCardRow>
 *      <StatCard title="Überfällig" … />
 *      <StatCard title="Diese Woche" … />
 *      <StatCard title="Offen" … />
 *    </StatCardRow>
 *
 *  `layout="grid"` (LEGACY — kept for existing dashboards): a compact
 *  2-column grid for narrow containers, paired with the deprecated
 *  `variant="rail"`. For new dashboards use `<StatStrip>` when the cards row
 *  is too heavy. Never hand-roll an own grid around StatCards — a single-
 *  column stack of huge cards on a phone pushes the work surface out of the
 *  first viewport. */
export function StatCardRow({ children, layout = 'row', className }: { children: ReactNode; layout?: 'row' | 'grid'; className?: string }) {
  // Self-measured edge bleed (StatCard stays standalone — no widget imports).
  // The OUTER div is the stable measuring anchor; margins go on the inner
  // scroller, so the measurement can't feed back into itself. Inline styles
  // would beat the md: classes, so the bleed is gated by matchMedia instead.
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ left: 0, right: 0 });
  useEffect(() => {
    if (layout === 'grid') return;
    const el = anchorRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      if (!mobile) { setEdge(prev => (prev.left === 0 && prev.right === 0 ? prev : { left: 0, right: 0 })); return; }
      const r = el.getBoundingClientRect();
      const left = Math.max(0, Math.round(r.left));
      const right = Math.max(0, Math.round(window.innerWidth - r.right));
      setEdge(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [layout]);
  const bleed = edge.left > 0 || edge.right > 0;
  if (layout === 'grid') {
    return (
      <div className={className}>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0">{children}</div>
      </div>
    );
  }
  return (
    <div ref={anchorRef} className={className}>
      <div
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [&>*]:w-[46%] [&>*]:shrink-0 [&>*]:snap-start md:grid md:auto-cols-fr md:grid-flow-col md:gap-4 md:overflow-visible md:pb-0 md:[&>*]:w-auto"
        style={bleed ? {
          marginLeft: -edge.left, marginRight: -edge.right,
          paddingLeft: edge.left, paddingRight: edge.right,
          scrollPaddingLeft: edge.left,
        } : undefined}
      >
        {children}
      </div>
    </div>
  );
}
