/**
 * KanbanWidget — pre-generated status-board widget set (Archetype B).
 *
 * The "records move through stages" board: one column per status/stage, one
 * card per record, drag a card into another column to change its status.
 * Applications: Bewerbungen-Pipeline, Auftrags-/Ticket-Status, Reparaturen,
 * Deal-Phasen. This is the sister widget to CalendarWidget/ResourceTimeline —
 * a calendar orders ONE time axis, an occupancy board orders resource × time,
 * a kanban orders a CATEGORY axis with no time at all. Compose; never
 * reimplement.
 *
 * @version 1.7.0
 * @since 2026-07-27  (1.7.0: `KanbanColumn.label` is a STRING now, not
 *                     ReactNode. Columns come from the schema's lookup values
 *                     (key/label string pairs), and every consumer that read
 *                     the label back out — undo toasts, aria strings,
 *                     LookupValue writes — needed a cast under ReactNode. Two
 *                     independent models tripped over it: the API contradicted
 *                     the family idiom, so the API moved. Rich column headers
 *                     stay possible via `renderColumnHeader`; card `title`
 *                     stays ReactNode.)
 * @since 2026-06-11  (1.6.0: DRAG PROXY — a mini card rides with the pointer
 *                     (see primitives 1.6.0, Bryntum DragHelper pattern).
 *                     1.5.0: PHONE BOARD = SEPARATE COLUMN CARDS — on the
 *                     phone layout the board is no longer one white sheet:
 *                     each column is its own rounded card with gaps (like the
 *                     KPI row), the first column aligns with the page content
 *                     (scroller padding compensation) and the clipped next
 *                     card runs UNDER the physical screen edge. Column width
 *                     ≈86% of the root's content width (reliable RO measure).
 *                     1.4.2: FULL-BLEED phone scroller — a clipped column runs
 *                     UNDER the physical screen edge (Trello affordance).
 *                     1.4.1: 13px card type on the phone layout.
 *                     1.4.0: PHONE LAYOUT, built-in (Trello pattern) — below
 *                     480px CONTAINER width one expanded column fills ~86% of
 *                     the scrollport and the board pages column-by-column via
 *                     CSS scroll-snap (paused while a drag runs so the edge
 *                     auto-scroll glides). Touch long-press now ticks
 *                     (vibrate) when the card lifts. Nothing to configure.
 *                     1.3.0: `columnClassName(column)` — a CSS-class tint for
 *                     a column's surface (e.g. warn-tint a near-capacity
 *                     column via closure BEFORE the onCardMove rule blocks).
 *                     Class only, never content; collapsed strips get it too.
 *                     1.2.0: REJECTION CHANNEL — onCardMove may RETURN a
 *                     string ("blocked — show this reason"): the card snaps
 *                     back AND the widget shows the built-in rejection notice.
 *                     Capacity/transition rules stay in YOUR handler — check
 *                     first, return the message instead of patching.
 *                     1.1.1: SCROLL HINT — when columns continue past the
 *                     visible edge, a fade gradient marks that edge (live-
 *                     measured: only while scrollable in that direction,
 *                     disappears at the end). No API change.
 *                     1.1.0: COLLAPSIBLE COLUMNS — every column header carries
 *                     a collapse toggle; a collapsed column becomes a narrow
 *                     vertical strip (label + count, still a drop target).
 *                     `defaultCollapsed` lets the consumer start terminal
 *                     stages (Abgelehnt, Archiv, …) collapsed, so a 6-column
 *                     pipeline fits a dashboard WITHOUT hiding any state.
 *                     NEVER solve horizontal space by dropping a declared
 *                     column — collapse it.
 *                     1.0.0: first release, built on the shared drag core:
 *                     window FSM, touch long-press, Escape cancel, edge
 *                     auto-scroll — the horizontally scrolling board profits
 *                     directly.)
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. A clicked card MUST open a <RecordOverlay> (from RecordView) — the board
 *     owns NO detail layer. Wire `onCardClick`; never render your own modal.
 *  2. Never edit this file (nor ./primitives.ts — the family's shared
 *     mechanics); never import from CalendarWidget/ResourceTimeline. If a slot
 *     is missing: unblock via children/render-prop + // TODO(widget-gap).
 *     Never fork, never leave the build red.
 *  3. Data-agnostic: `card.column` and `KanbanColumn.key` are OPAQUE strings —
 *     never a Living-Apps field name. The consumer maps the status field
 *     (`lookupKey(record.fields.<x>)`) → `card.column` and builds `columns`
 *     from the schema's lookup values (LOOKUP_OPTIONS). No `statusField` prop,
 *     no field knowledge here.
 *  4. NOTHING disappears silently: a card whose `column` matches no declared
 *     column renders in an automatic "Ohne Status" fallback column (drag OUT
 *     of it assigns a real status; dragging INTO it is not possible). Prefer
 *     declaring an explicit backlog column over relying on the fallback.
 *  5. There is NO drag-reorder WITHIN a column. Living Apps has no order
 *     field, and an order that snaps back after the next fetch is worse than
 *     none. Order = the array order of `cards` — sort in the consumer (e.g.
 *     by date). If the app HAS a number field meant as ordering, wire it like
 *     a sort key in the consumer — not via the widget.
 *
 * ─── API at a glance (exact prop names — NEVER guess) ──────────────────
 *
 *  <KanbanWidget
 *     cards                 KanbanCard[]    — { id: string, column: string, title: ReactNode, subtitle?: ReactNode, tone? }
 *     columns               KanbanColumn[]  — ordered columns { key, label: string, tone? }; lowercase `columns`.
 *                                             `label` is a plain STRING (schema lookup label) — reusable in toasts,
 *                                             aria texts and LookupValue writes; rich headers via renderColumnHeader.
 *                                             Build them from the schema's lookup values, INSIDE the
 *                                             component body — never as a module-scope const:
 *                                             (LOOKUP_OPTIONS['<app>']?.['<statusfeld>'] ?? []).map(o => ({ key: o.key, label: o.label }))
 *                                             `o.label` is a locale-aware GETTER; hoisted to module
 *                                             scope it evaluates once at import and freezes that one
 *                                             language (check-dashboard gate 22 rejects the hoisted form).
 *                                             Declare EVERY lookup value — never drop one to save width (see
 *                                             defaultCollapsed; an undeclared value sends its cards to the fallback).
 *     defaultCollapsed?     string[]        — column keys that START collapsed (uncontrolled seed). A collapsed
 *                                             column is a narrow vertical strip with label + count: still visible,
 *                                             still a drop target, one click expands it. Use it for terminal/archive
 *                                             stages so wide pipelines fit without hiding any state. Every header
 *                                             also carries a collapse toggle for the user.
 *     onCardClick?          (card: KanbanCard) => void      — open a <RecordOverlay>
 *     onCardMove?           (cardId, newColumn) => void | string | Promise<void | string>  — drag into ANOTHER column = status change.
 *                                                             REJECTION CHANNEL: return a STRING to block the move — the card
 *                                                             snaps back and the widget shows the reason in its built-in notice.
 *                                                             DRAG IS OFF until you pass this. Write the key back to the
 *                                                             lookup field via update<Entity>Entry(id, { <statusfeld>: newColumn })
 *                                                             — Create<Entity> accepts the plain key string for lookup fields.
 *                                                             Business rules ("max N in Bearbeitung") are ENFORCED here
 *                                                             (block + message), not just displayed.
 *     onAddCard?            (column: string) => void         — the built-in "+ Karte" button at each column's end fires
 *                                                             with that column's key: open the generated <Entity>Dialog
 *                                                             prefilled with the status. No prop = no button — but WIRE IT
 *                                                             BY DEFAULT: users expect to create from the board; omit only
 *                                                             when records can't sensibly be created here.
 *     renderCard?           (card: KanbanCard) => ReactNode  — full control of one card (replaces the default card)
 *     renderColumnHeader?   (column: KanbanColumn) => ReactNode — replaces the default header (tone dot + label + count).
 *     columnClassName?      (column: KanbanColumn) => string  — a CSS CLASS only for the column surface (e.g. warn-tint
 *                                                             at capacity, via closure over YOUR counts); NOT content.
 *                                                             NO card access: per-column aggregates come from the
 *                                                             consumer's own data via CLOSURE — see the example.
 *     className?            string                           — appended to the shell
 *     children?             ReactNode                        — filter/legend slot above the board
 *  >
 *  // + <KanbanSkeleton /> / <KanbanError error onRetry? />  (State-Trias)
 *
 *  tone (cards + columns, default 'default'): 'default' | 'primary' | 'success' | 'warning' | 'destructive'
 *    Exported as `KANBAN_TONES` (const array) and `KanbanTone` (union type) — reference, don't transcribe.
 *
 *  The column header shows the card COUNT by default; the "+ Karte" button is
 *  built in (gated on `onAddCard`) — you compose no toolbar and no add button.
 *  The board scrolls horizontally past ~4 columns; dragging a card to the edge
 *  auto-scrolls (shared drag core), and a fade edge signals off-screen columns
 *  (built in — don't compose your own scroll indicator).
 *
 * ─── ❌ COMMON MISTAKES (family-proven traps) ───────────────────────────
 *  • Inventing callback names from other libraries: there is NO `onTaskDrop`,
 *    `onDragEnd` or `columnField` — the move callback is `onCardMove(cardId,
 *    newColumn)`, membership lives on `card.column`.
 *  • `tone: 'danger'` — does NOT exist; the closest is `'destructive'`. Use the
 *    exported `KANBAN_TONES` array.
 *  • `parseId(card.id)` — there is NO `parseId` helper. Build the id with a
 *    template literal (`` `auftrag:${r.record_id}` ``) and read it back with
 *    `id.split(':')` — exactly as the example.tsx does.
 *  • Expecting drag to REORDER inside a column — it does not (HARD RULE 5).
 *    A drop in the card's own column is a no-op snap-back, not a callback.
 *  • Acknowledging a stated capacity rule but not enforcing it: "max N im
 *    Status X" belongs INSIDE `onCardMove` (check first, RETURN the message
 *    instead of patching) AND the create dialog — a column that just looks
 *    full enforces nothing, and a silent snap-back without the returned
 *    reason is a UX bug. Don't ALSO build an own banner — double notice.
 *  • OMITTING a declared lookup value as a column to save horizontal space —
 *    its cards don't disappear, they pile up in the "Ohne Status" fallback
 *    column (HARD RULE 4). The right tool for wide boards is
 *    `defaultCollapsed={['abgelehnt', …]}` — collapsed, not gone.
 *
 * ─── When to use ──────────────────────────────────────────────────────
 *
 * Any time records carry a STATUS/STAGE (static lookup or applookup) and the
 * user's workflow is moving records through phases. There is NO routed kanban
 * page — YOU embed <KanbanWidget> directly in the dashboard: build `columns`
 * from the lookup values, map records → KanbanCard[] (the status field name
 * lives in YOUR mapping), pass onCardMove that optimistically patches +
 * re-fetches on error, open a <RecordOverlay> on click. Plain date data with
 * no status → CalendarWidget; resource × time → ResourceTimeline.
 *
 * Kanban exports NO geometry primitives — a status board has no geometry to
 * share. The escape hatch is `renderCard`/`renderColumnHeader`/`children`;
 * mark any remaining gap `// TODO(widget-gap)`.
 *
 * Full compiling example: ./KanbanWidget.example.tsx
 */
import { type ReactNode, type ComponentType, type PointerEvent as ReactPointerEvent, useMemo, useRef, useCallback, useState, useEffect } from 'react';
import { IconPlus, IconAlertCircle, IconRefresh, IconChevronsLeft, IconChevronsRight, IconX } from '@tabler/icons-react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
// Shared widget MECHANICS (M4) — tone class-maps, drag-FSM core.
// Sister widgets never import each other; ALL import './primitives'.
import { TONE_DOT, TONE_ACCENT, usePointerDrag, useRejectNotice, useNarrowContainer, type DragGesture, type WriteResult } from './primitives';
import { coreLocale as i18nLocale, type CoreLocale as Locale } from '@/i18n';

// The widget's OWN chrome strings — indexed at RENDER time (`KB[i18nLocale]`),
// never hoisted into a module constant.
const KB: Record<Locale, {
  noStatus: string; dismiss: string; card: string; errorTitle: string; retry: string;
  expandColumn: (label: string, n: number) => string;
  collapseColumn: (label: string) => string;
  newCard: (label: string) => string;
}> = {
  de: {
    noStatus: 'Ohne Status', dismiss: 'Meldung schließen', card: 'Karte',
    errorTitle: 'Board konnte nicht geladen werden', retry: 'Erneut versuchen',
    expandColumn: (label, n) => `Spalte ${label} ausklappen (${n})`,
    collapseColumn: (label) => `Spalte ${label} einklappen`,
    newCard: (label) => `Neue Karte — ${label}`,
  },
  en: {
    noStatus: 'No status', dismiss: 'Dismiss message', card: 'Card',
    errorTitle: 'Board failed to load', retry: 'Try again',
    expandColumn: (label, n) => `Expand column ${label} (${n})`,
    collapseColumn: (label) => `Collapse column ${label}`,
    newCard: (label) => `New card — ${label}`,
  },
};

// Closed enums — exported as const arrays so consumers reference instead of
// transcribe (a mistyped 'danger' was a real build failure in this family).
export const KANBAN_TONES = ['default', 'primary', 'success', 'warning', 'destructive'] as const;
export type KanbanTone = (typeof KANBAN_TONES)[number];

export type KanbanCard = {
  id: string;
  /** OPAQUE column key — matched against KanbanColumn.key. Never a field name. */
  column: string;
  title: ReactNode;
  /** Optional secondary line under the title (e.g. "Fr. Okafor · seit 3 Tagen"). */
  subtitle?: ReactNode;
  tone?: KanbanTone;
};

export type KanbanColumn = { key: string; label: string; tone?: KanbanTone };

/** Cards whose `column` matches no declared column land here (HARD RULE 4). */
const FALLBACK_KEY = '__ohne_status__';

/** A column's label for aria texts; falls back to the key on an empty label. */
function columnAriaLabel(c: KanbanColumn): string {
  return c.label || c.key;
}

// ── Drag&Drop — board geometry + commit over the shared FSM core ────────
// The gesture lifecycle (window listeners, threshold, touch long-press,
// Escape, edge auto-scroll) lives in `usePointerDrag` (./primitives). THIS
// widget supplies the parts only it knows: the column hit-test (live column
// rects — x AND y, so releasing below the board is a clean snap-back) and the
// commit semantics (same column = no-op; the fallback column accepts no drops).

type Geometry = {
  /** Resolve the column key under the client point from the live column rects. */
  columnAt: (clientX: number, clientY: number) => string | null;
};

type DragPreview = { id: string; column: string };

function useCardDrag(onCardMove?: (cardId: string, newColumn: string) => void) {
  return usePointerDrag<KanbanCard, Geometry, DragPreview>({
    moveEnabled: !!onCardMove,
    resizeEnabled: false,
    grabDayAt: () => null,   // no day axis on a status board
    // Hovering the card's OWN column resolves to null: there is no reorder
    // (HARD RULE 5), so the only honest feedback is "this drop changes
    // nothing" — no ring, no ghost, clean snap-back.
    resolve: (g: DragGesture<KanbanCard, Geometry>, clientX: number, clientY: number) => {
      const column = g.geom.columnAt(clientX, clientY);
      if (!column || column === g.ev.column) return null;
      return { id: g.ev.id, column };
    },
    targetKey: p => p.column,
    commit: (g, p) => {
      if (!p || !onCardMove) return;
      onCardMove(g.ev.id, p.column);
    },
  });
}

type CardDrag = ReturnType<typeof useCardDrag>;

// Only a pointerdown wires per-element — move/up/cancel are on window.
function cardDragProps(card: KanbanCard, dnd: CardDrag, geom: () => Geometry) {
  if (!dnd.active) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => { e.stopPropagation(); dnd.begin(card, e, geom()); },
    // 'manipulation' (not 'none'): a quick touch swipe on a card stays a native
    // SCROLL; the shared drag core arms the drag via long-press and then blocks
    // panning itself. Mouse drags are unaffected.
    style: { touchAction: 'manipulation' as const, cursor: 'grab' as const },
  };
}

// ── Shell ────────────────────────────────────────────────────────────────

type KanbanWidgetProps = {
  cards: KanbanCard[];
  columns: KanbanColumn[];
  /** Column keys that START collapsed (uncontrolled seed) — for terminal stages. */
  defaultCollapsed?: string[];
  onCardClick?: (card: KanbanCard) => void;
  onCardMove?: (cardId: string, newColumn: string) => WriteResult;
  onAddCard?: (column: string) => void;
  renderCard?: (card: KanbanCard) => ReactNode;
  renderColumnHeader?: (column: KanbanColumn) => ReactNode;
  /** CSS class for a column's surface — tint only, never content. */
  columnClassName?: (column: KanbanColumn) => string;
  className?: string;
  children?: ReactNode;
};

const COL_MIN_PX = 260;        // min expanded column width (board scrolls horizontally past this)
const COL_COLLAPSED_PX = 44;   // collapsed column strip width

export function KanbanWidget(props: KanbanWidgetProps) {
  const { cards, columns, defaultCollapsed, onCardClick, onCardMove, onAddCard, renderCard, renderColumnHeader, columnClassName, className, children } = props;

  // Rejection channel: a STRING returned from onCardMove blocks the move and
  // feeds the built-in notice; the drag hook sees a void-returning wrapper.
  const reject = useRejectNotice();
  const guardedMove = onCardMove
    ? (cardId: string, newColumn: string) => reject.capture(onCardMove(cardId, newColumn))
    : undefined;
  const dnd = useCardDrag(guardedMove);

  // Collapse is self-managed (like the calendar's built-in navigation):
  // `defaultCollapsed` seeds it, the header toggle flips it. A collapsed
  // column is never GONE — narrow strip, count visible, still a drop target.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(() => new Set(defaultCollapsed ?? []));
  const toggleCollapsed = useCallback((key: string) => {
    setCollapsedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Scroll hint: a fade edge marks the side where columns continue off-screen.
  // Live-measured (scroll + resize + layout changes) — shown only while the
  // board can actually scroll in that direction, gone at the end.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollHint, setScrollHint] = useState({ left: false, right: false });
  const measureScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setScrollHint(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  // Phone layout (Trello pattern): below 480px CONTAINER width one expanded
  // column fills ~86% of the scrollport and the board pages column-by-column
  // (CSS scroll-snap). Snap pauses during a drag so the edge auto-scroll can
  // glide instead of fighting the rast.
  const { ref: narrowRef, narrow, edge, width: rootW } = useNarrowContainer();
  // Column width off the ROOT's content width (reliable RO measurement) —
  // ~86% of it, so the next column card visibly peeks under the screen edge.
  const pagedColPx = narrow && rootW > 0 ? Math.max(200, Math.round(rootW * 0.86)) : null;


  // Cards bucketed per declared column (array order preserved — the consumer
  // sorts); unmatched cards collect in the automatic fallback column so no
  // record ever silently disappears (HARD RULE 4).
  const { effColumns, byColumn } = useMemo(() => {
    const known = new Set(columns.map(c => c.key));
    const buckets = new Map<string, KanbanCard[]>(columns.map(c => [c.key, []]));
    const orphans: KanbanCard[] = [];
    for (const card of cards) {
      if (known.has(card.column)) buckets.get(card.column)!.push(card);
      else orphans.push(card);
    }
    const eff: KanbanColumn[] = orphans.length
      ? [...columns, { key: FALLBACK_KEY, label: KB[i18nLocale].noStatus, tone: 'warning' }]
      : columns;
    if (orphans.length) buckets.set(FALLBACK_KEY, orphans);
    return { effColumns: eff, byColumn: buckets };
  }, [cards, columns]);

  // Re-measure the fade hint whenever layout-relevant inputs change, and on
  // container resizes (sidebar toggle, window).
  useEffect(() => { measureScroll(); }, [measureScroll, effColumns, collapsedKeys]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureScroll]);

  // Geometry: every DROPPABLE column registers its live rect (the fallback
  // column does not — dragging INTO "Ohne Status" would write a nonsense key).
  const colRefs = useRef<Map<string, HTMLElement>>(new Map());
  const geom = useCallback((): Geometry => ({
    columnAt: (clientX, clientY) => {
      for (const [key, el] of Array.from(colRefs.current.entries())) {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom) return key;
      }
      return null;
    },
  }), []);

  const draggedCard = dnd.draggingId ? cards.find(c => c.id === dnd.draggingId) ?? null : null;

  // Drag PROXY (family pattern, see primitives 1.6.0): a mini card rides with
  // the pointer; the source card stays dimmed, the column ghost keeps marking
  // the drop slot.
  const dragGhost = dnd.draggingMode === 'move' && draggedCard
    ? createPortal(
        <div ref={dnd.ghostRef} className="pointer-events-none fixed left-0 top-0 z-[var(--z-drag)] will-change-transform" aria-hidden>
          <div className={`max-w-[240px] rounded-md border-l-4 bg-card px-2 py-1.5 shadow-xl ring-1 ring-black/10 ${TONE_ACCENT[draggedCard.tone ?? 'default']}`}>
            <span className="block truncate text-xs font-semibold text-foreground">{draggedCard.title}</span>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div ref={narrowRef} className={`flex flex-col gap-4${className ? ` ${className}` : ''}`}>
      {dragGhost}
      {children}
      {/* Phone layout (Trello pattern, like the KPI row): the board is NOT one
          white sheet — each column is its OWN card with gaps between them. The
          container goes transparent and full-bleed; the scroller compensates
          with padding, so the FIRST column aligns with the page content while
          a clipped next column runs UNDER the physical screen edge. */}
      <div
        className={narrow ? '' : 'rounded-[27px] bg-card shadow-lg overflow-hidden'}
        style={narrow && (edge.left > 0 || edge.right > 0) ? { marginLeft: -edge.left, marginRight: -edge.right } : undefined}
      >
        {reject.notice && (
          <div
            role="status"
            aria-live="polite"
            className={`flex items-center gap-2 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive ${narrow ? 'mb-3 rounded-xl border border-destructive/30' : 'border-b border-destructive/30'}`}
            style={narrow ? { marginLeft: edge.left, marginRight: edge.right } : undefined}
          >
            <IconAlertCircle size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">{reject.notice}</span>
            <button type="button" onClick={reject.dismiss} aria-label={KB[i18nLocale].dismiss} className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/10">
              <IconX size={14} />
            </button>
          </div>
        )}
        <div className="relative">
          {!narrow && scrollHint.left && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-card to-transparent" aria-hidden />}
          {!narrow && scrollHint.right && <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card to-transparent" aria-hidden />}
          <div
            ref={scrollerRef}
            onScroll={measureScroll}
            className={`overflow-x-auto ${pagedColPx != null && !dnd.draggingId ? 'snap-x snap-mandatory' : ''}`}
            style={narrow ? { paddingLeft: edge.left, paddingRight: edge.right, scrollPaddingLeft: edge.left } : undefined}
          >
          <div
            className="grid select-none"
            style={{
              gridTemplateColumns: effColumns.map(c => collapsedKeys.has(c.key) ? `${COL_COLLAPSED_PX}px` : (pagedColPx != null ? `${pagedColPx}px` : `minmax(${COL_MIN_PX}px, 1fr)`)).join(' ') || '1fr',
              minWidth: effColumns.reduce((sum, c) => sum + (collapsedKeys.has(c.key) ? COL_COLLAPSED_PX : (pagedColPx ?? COL_MIN_PX)), 0) + (narrow ? Math.max(0, effColumns.length - 1) * 12 : 0),
              columnGap: narrow ? 12 : 0,
            }}
          >
            {effColumns.map(col => {
              const colCards = byColumn.get(col.key) ?? [];
              const isFallback = col.key === FALLBACK_KEY;
              const isTarget = dnd.dropTarget === col.key;
              const isCollapsed = collapsedKeys.has(col.key);
              const showGhost = isTarget && draggedCard != null && !isCollapsed;

              // Collapsed: a narrow vertical strip — label, count and tone stay
              // visible, the strip stays a DROP TARGET (drag highlights it),
              // one click expands. The state is collapsed, never gone.
              if (isCollapsed) {
                return (
                  <button
                    key={col.key}
                    type="button"
                    ref={(el) => {
                      if (isFallback) return;   // not a drop target
                      if (el) colRefs.current.set(col.key, el); else colRefs.current.delete(col.key);
                    }}
                    onClick={() => { if (dnd.consumeClick()) return; toggleCollapsed(col.key); }}
                    aria-expanded={false}
                    aria-label={KB[i18nLocale].expandColumn(columnAriaLabel(col), colCards.length)}
                    className={`flex min-h-[200px] snap-start flex-col items-center gap-2 py-2 transition-colors hover:bg-secondary ${narrow ? 'rounded-2xl border border-border bg-secondary/50 shadow-sm' : 'border-l border-border bg-secondary/50 first:border-l-0'} ${isTarget ? 'ring-2 ring-inset ring-primary/60' : ''} ${columnClassName?.(col) ?? ''}`}
                  >
                    <IconChevronsRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{colCards.length}</span>
                    <span className="min-h-0 flex-1 truncate text-xs font-semibold uppercase tracking-wider text-secondary-foreground [writing-mode:vertical-rl]">{col.label}</span>
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[col.tone ?? 'default']}`} />
                  </button>
                );
              }

              return (
                <div
                  key={col.key}
                  ref={(el) => {
                    if (isFallback) return;   // not a drop target
                    if (el) colRefs.current.set(col.key, el); else colRefs.current.delete(col.key);
                  }}
                  className={`flex min-h-[200px] max-sm:min-h-[7rem] snap-start flex-col ${narrow ? 'overflow-hidden rounded-2xl border border-border bg-card shadow-sm' : 'border-l border-border first:border-l-0'} ${isTarget ? 'ring-2 ring-inset ring-primary/60' : ''} ${columnClassName?.(col) ?? ''}`}
                >
                  {/* Column header: collapse toggle + (tone dot + label + count
                      badge). The toggle belongs to the WIDGET and stays even
                      with renderColumnHeader — the slot replaces only the
                      header CONTENT, never the collapse affordance. */}
                  <div className="flex items-center gap-1 border-b border-input bg-secondary px-2 py-2">
                    <button
                      type="button"
                      onClick={() => { if (dnd.consumeClick()) return; toggleCollapsed(col.key); }}
                      aria-expanded={true}
                      aria-label={KB[i18nLocale].collapseColumn(columnAriaLabel(col))}
                      className="shrink-0 rounded p-0.5 max-sm:p-2 text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
                    >
                      <IconChevronsLeft className="h-3.5 w-3.5 max-sm:h-5 max-sm:w-5" />
                    </button>
                    <div className="min-w-0 flex-1">
                      {renderColumnHeader && !isFallback ? renderColumnHeader(col) : (
                        <span className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[col.tone ?? 'default']}`} />
                          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{col.label}</span>
                          <span className="ml-auto shrink-0 rounded-full bg-card px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{colCards.length}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Card stack — empty columns keep their surface IN PLACE. */}
                  <div className="flex flex-1 flex-col gap-1.5 p-1.5">
                    {colCards.map(card => (
                      <CardView key={card.id} card={card} dnd={dnd} geom={geom} onCardClick={onCardClick} renderCard={renderCard} narrow={narrow} />
                    ))}
                    {/* Live preview: a translucent dashed stand-in of the dragged
                        card at the destination column's end. */}
                    {showGhost && (
                      <div className={`pointer-events-none rounded-md border-2 border-dashed border-primary border-l-4 px-2 py-1.5 ${TONE_ACCENT[draggedCard!.tone ?? 'default']}`} aria-hidden>
                        <span className="block truncate text-xs font-semibold text-foreground">{draggedCard!.title}</span>
                      </div>
                    )}
                    {onAddCard && !isFallback && (
                      <button
                        type="button"
                        onClick={() => { if (dnd.consumeClick()) return; onAddCard(col.key); }}
                        aria-label={KB[i18nLocale].newCard(columnAriaLabel(col))}
                        className="mt-auto flex items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 max-sm:py-3 max-sm:min-h-11 text-[11px] max-sm:text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                      >
                        <IconPlus className="h-3.5 w-3.5 max-sm:h-4 max-sm:w-4" />{KB[i18nLocale].card}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Default card — the family's board-card anatomy (WeekBoard cards): tone
// accent bar + title + optional subtitle. `renderCard` replaces it entirely.
function CardView({ card, dnd, geom, onCardClick, renderCard, narrow = false }: {
  card: KanbanCard; dnd: CardDrag; geom: () => Geometry;
  onCardClick?: (card: KanbanCard) => void; renderCard?: (card: KanbanCard) => ReactNode;
  narrow?: boolean;
}) {
  if (renderCard) {
    return (
      <div onClick={(e) => { e.stopPropagation(); if (dnd.consumeClick()) return; onCardClick?.(card); }} {...cardDragProps(card, dnd, geom)}>
        {renderCard(card)}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (dnd.consumeClick()) return; onCardClick?.(card); }}
      {...cardDragProps(card, dnd, geom)}
      className={`flex flex-col border-l-4 text-left min-w-0 ${narrow ? 'gap-1 rounded-xl px-3 py-3 min-h-[56px] justify-center' : 'gap-0.5 rounded-md px-2 py-1.5'} ${TONE_ACCENT[card.tone ?? 'default']} ${dnd.draggingId === card.id ? 'opacity-40' : ''} hover:shadow-sm transition-shadow`}
    >
      <span className={`truncate font-semibold text-foreground ${narrow ? 'text-[15px]' : 'text-xs'}`}>{card.title}</span>
      {card.subtitle != null && card.subtitle !== '' && <span className={`truncate text-muted-foreground ${narrow ? 'text-[13px]' : 'text-[11px]'}`}>{card.subtitle}</span>}
    </button>
  );
}

// ── State wrappers (Skeleton / Error — empty is the in-place column grid) ─

export function KanbanSkeleton() {
  return (
    <div className="rounded-[27px] bg-card shadow-lg overflow-hidden animate-pulse" aria-busy="true">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {Array.from({ length: 4 }).map((_, c) => (
          <div key={c} className="border-l border-border first:border-l-0">
            <div className="border-b border-input bg-secondary px-3 py-2"><div className="h-3 w-20 rounded bg-muted" /></div>
            <div className="flex flex-col gap-1.5 p-1.5">
              {Array.from({ length: 3 - (c % 2) }).map((_, r) => <div key={r} className="h-12 rounded-md bg-muted" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type KanbanErrorProps = {
  error: Error | string;
  title?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ComponentType<{ size?: number | string; stroke?: number | string }>;
  className?: string;
};

export function KanbanError({ error, title = KB[i18nLocale].errorTitle, onRetry, retryLabel = KB[i18nLocale].retry, icon: Icon = IconAlertCircle, className }: KanbanErrorProps) {
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div className={`flex flex-col items-center justify-center gap-4 rounded-[27px] bg-card shadow-lg py-24 text-center${className ? ` ${className}` : ''}`}>
      <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive"><Icon size={22} /></div>
      <div className="flex flex-col gap-1 max-w-md px-6">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground break-words">{message}</p>
      </div>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}><IconRefresh className="h-4 w-4 mr-1.5" />{retryLabel}</Button>}
    </div>
  );
}
