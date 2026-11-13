/**
 * widgets/primitives.ts — shared widget MECHANICS (Tier 3 / M4).
 *
 * @version 1.8.0
 * @since 2026-07-06  (1.8.0: QUANTITY-AXIS SHARED MECHANICS — `TONE_TEXT`
 *                     (text-color classes so an SVG mark inherits its tone via
 *                     currentColor; the closed palette stays the ONE source of
 *                     chart color) and `labelOf`/`scalarOf` LIFTED from
 *                     TableWidget verbatim (one raw-value normalizer for the
 *                     family — TableWidget sort/search and ChartWidget
 *                     aggregation read the SAME scalar; behavior unchanged).
 * @since 2026-06-25  (1.7.0: family callback `OnMapPointClick` — the geo
 *                     analog of OnAddCard/OnEmptyClick for MapWidget's optional
 *                     "tap an empty point → create" affordance. An OBJECT
 *                     `{ lat, long }`, never two positional numbers (both are
 *                     numbers → silently swappable), and `long` not `lng` (the
 *                     GeoLocation field name). Documentary anchor only; the
 *                     widget spells the signature inline, like the time widgets
 *                     do for onEmptyClick. No mechanics — MapWidget copies the
 *                     Leaflet load pattern from GeoMapPicker (sister widgets
 *                     never import each other) and owns its own map geometry.)
 * @since 2026-06-11  (1.6.0: DRAG PROXY (Bryntum DragHelper pattern) — a
 *                     compact stand-in of the grabbed item follows the
 *                     pointer (mouse: trailing the cursor; touch: floating
 *                     above the finger), positioned imperatively at 60fps.
 *                     The hook owns position + lifecycle (`ghostRef`,
 *                     `draggingMode`); each widget renders the proxy MARKUP.
 *                     Source stays dimmed, snapped target preview stays —
 *                     proxy answers "what am I holding", preview answers
 *                     "where will it land".
 *                     1.5.0: MOBILE MECHANICS — `useNarrowContainer(480)` (the
 *                     family's phone breakpoint, CONTAINER width via
 *                     ResizeObserver, never viewport), `useCoarsePointer()`
 *                     (finger → wider resize edge-zones), and a vibrate(15)
 *                     lift-tick when a touch long-press arms the drag.
 *                     1.4.0: the REJECTION CHANNEL — write-gesture callbacks
 *                     (onEventDrop/onEventResize/onCardMove) may RETURN a
 *                     string: "blocked — show this reason". `WriteResult` is
 *                     the family return type; `useRejectNotice` carries the
 *                     notice state + auto-dismiss the widgets render. Rules
 *                     STAY in the consumer's handlers — the widget only
 *                     displays the returned message.
 *                     1.3.0: shared `useNow` hook — the 1-minute tick behind
 *                     the family's current-time indicators (calendar hour
 *                     grid, resource time axis). The red-line PRESENTATION
 *                     stays per widget — shared is mechanics, never layout.
 *                     1.2.0: the drag core is no longer time-coupled — the
 *                     event constraint relaxes to `{ id: string }` and the
 *                     gesture no longer pre-computes a day span (the time
 *                     widgets derive it in their own `resolve`). This is what
 *                     lets a non-time widget (Kanban) reuse the same FSM.
 *                     New family callback type: `OnAddCard`.
 *                     1.1.0: family DragMode gains 'create' — drag on an EMPTY
 *                     surface paints a range; gated by `createEnabled` and
 *                     committed via the family callback `OnRangeCreate(start,
 *                     end, group?)`. The widget begins the gesture with a
 *                     phantom event carrying the anchor.
 *                     1.0.0: extracted from CalendarWidget + ResourceTimeline:
 *                     date helpers, tone class-maps and the pointer-drag FSM
 *                     core were byte-duplicated in both time widgets. The drag
 *                     core also gained edge AUTO-SCROLL and a touch LONG-PRESS,
 *                     so dragging works at scrolled edges and touch can still
 *                     scroll the page over event chips.)
 *
 * ─── HARD RULES ─────────────────────────────────────────────────────────
 *  1. Never edit this file. It is pre-generated, exactly like the widgets.
 *  2. This is NOT a consumer API. Compose the widgets and import their
 *     exports (CalendarWidget / ResourceTimeline re-export everything an
 *     agent needs, e.g. `TimeSpan`, `pack*`, the tone arrays). Import from
 *     './primitives' only inside the widget family itself.
 *  3. Shared is MECHANICS, never layout: sister widgets still never import
 *     each other — separate grids stay separate. Only the date math, the
 *     tone class-maps and the drag FSM live here, once.
 *
 * The drag core follows the engine/feature split proven by commercial
 * scheduling suites: this file owns "grab, threshold, track, validate, drop"
 * (window-level FSM, touch long-press, Escape cancel, auto-scroll at the
 * edges of any scrollable ancestor); each widget owns its GEOMETRY (what a
 * day/row/minute is) and its COMMIT semantics (no-op guards, ISO formatting).
 */
import { type PointerEvent as ReactPointerEvent, useState, useRef, useCallback, useEffect } from 'react';
import { parseISO, startOfDay, isSameDay } from 'date-fns';

// ── Family callback conventions (M7) ────────────────────────────────────
// ONE name + ONE signature for the same concept-callback across the whole
// widget family. Every future widget (Kanban, Map, …) imports these instead of
// inventing its own variant; the two time widgets spell the identical
// signature inline in their props (asserted by snapshot tests).

/** "Empty surface clicked": `group` is the second-axis key where one exists
 *  (ResourceTimeline's resource row/column); widgets without a second axis
 *  always pass `undefined`. */
export type OnEmptyClick = (date: Date, group?: string) => void;

/** "Empty surface dragged open" (drag-to-create): the painted range as DATES —
 *  exactly as the widget's own event would store it (timed: clock times;
 *  day-granular: midnights, end day INCLUSIVE). NOT ISO strings (unlike
 *  onEventDrop) — the consumer formats onto its field type. `group` as above. */
export type OnRangeCreate = (start: Date, end: Date, group?: string) => void;

/** "Add affordance in a category column clicked" (Kanban's `+ Karte`): the
 *  opaque column key, so the consumer opens a prefilled create dialog. The
 *  family's onEmptyClick starts with a Date — boards without a time axis use
 *  THIS type instead of faking a date. */
export type OnAddCard = (column: string) => void;

/** "Empty point on the map tapped" (MapWidget's optional create affordance):
 *  the geographic coordinate, so the consumer opens a prefilled create dialog.
 *  An OBJECT, never two positional numbers — `(lat, long)` is silently
 *  swappable (both are numbers); `{ lat, long }` makes a transposed mapping a
 *  compile error. `long`, never `lng` (the Living-Apps GeoLocation field name).
 *  MapWidget spells the signature inline in its props (like the time widgets do
 *  for onEmptyClick); this is the shared documentary anchor. */
export type OnMapPointClick = (point: { lat: number; long: number }) => void;

/** Return type of every WRITE-GESTURE callback (drop / resize / card move):
 *  return nothing = accepted; return a STRING (sync or via Promise) = the
 *  gesture is REJECTED and the widget shows the string in its built-in
 *  rejection notice (the snap-back already happened — this gives it a voice).
 *  Rule logic and message text live in the CONSUMER; the widget only displays. */
export type WriteResult = void | string | Promise<void | string>;

// ── raw-value normalization ──────────────────────────────────────────────
// The ONE scalar behind a Living-Apps raw value. ChartWidget aggregation (and
// every family consumer) reads it — one normalizer, one truth. Total and
// defensive: never throws, never yields "[object Object]".

export function labelOf(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object' && 'label' in (v as Record<string, unknown>)) {
    return String((v as { label?: unknown }).label ?? '');
  }
  if (typeof v === 'object') return '';   // unknown object (malformed lookup) → never "[object Object]"
  return String(v);
}

/** The comparable/searchable scalar behind a raw value: numbers stay numbers,
 *  lookups unwrap to their label, arrays join their labels. */
export function scalarOf(value: unknown): string | number {
  if (value == null) return '';
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(labelOf).join(', ');
  if (typeof value === 'object' && 'label' in (value as Record<string, unknown>)) return labelOf(value);
  return '';   // unknown shape → not "[object Object]"
}

// ── TimeSpan + date helpers (timezone-safe — always local, never UTC) ───

/** Minimal time-shape every helper + pack* primitive needs. Every widget's
 *  event type extends it. */
export type TimeSpan = { start: string; end?: string; allDay?: boolean };

export function isAllDay(ev: TimeSpan): boolean {
  return ev.allDay ?? !ev.start.includes('T');
}
export function eventStart(ev: TimeSpan): Date {
  try { return parseISO(ev.start); } catch { return new Date(NaN); }
}
export function eventEnd(ev: TimeSpan): Date {
  try { return ev.end ? parseISO(ev.end) : parseISO(ev.start); } catch { return eventStart(ev); }
}
export function isMultiDay(ev: TimeSpan): boolean {
  const s = eventStart(ev), e = eventEnd(ev);
  return !isNaN(s.getTime()) && !isNaN(e.getTime()) && !isSameDay(s, e);
}
/** Does the event occur on `day` (local day-bucketing)? */
export function occursOn(ev: TimeSpan, day: Date): boolean {
  const s = startOfDay(eventStart(ev));
  const e = startOfDay(eventEnd(ev));
  const d = startOfDay(day);
  return d >= s && d <= e;
}
/** Sort key: all-day first, then by start time. */
export function eventOrder(a: TimeSpan, b: TimeSpan): number {
  const aAll = isAllDay(a) ? 0 : 1;
  const bAll = isAllDay(b) ? 0 : 1;
  if (aAll !== bAll) return aAll - bAll;
  return eventStart(a).getTime() - eventStart(b).getTime();
}

// ── Rejection notice (the voice of a blocked write gesture) ─────────────

/** Notice state + auto-dismiss behind the widgets' built-in rejection bar.
 *  `capture(result)` inspects a write-callback's WriteResult: a string (sync
 *  or resolved) shows the notice; anything else is ignored. */
export function useRejectNotice(autoDismissMs = 6000) {
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const dismiss = useCallback(() => {
    if (timerRef.current != null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    setNotice(null);
  }, []);
  const show = useCallback((message: string) => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setNotice(message);
    timerRef.current = window.setTimeout(() => { timerRef.current = null; setNotice(null); }, autoDismissMs);
  }, [autoDismissMs]);
  const capture = useCallback((result: WriteResult) => {
    if (typeof result === 'string') { show(result); return; }
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      void (result as Promise<void | string>).then(r => { if (typeof r === 'string') show(r); });
    }
  }, [show]);
  useEffect(() => () => { if (timerRef.current != null) window.clearTimeout(timerRef.current); }, []);
  return { notice, capture, dismiss };
}

// ── Responsive mechanics (container width + pointer kind) ───────────────

/** True below `threshold` px of CONTAINER width (not viewport — widgets live
 *  in dashboard columns too). The widgets switch to their phone layout on it:
 *  calendar week → 3-day window, kanban → column paging, RT → narrow labels.
 *  Ref goes on the widget's root; width 0 (pre-mount) counts as not-narrow.
 *
 *  `edge` = the root's measured distance to the LEFT/RIGHT viewport edge.
 *  On the phone layout the widget card pulls itself FULL-BLEED by exactly
 *  these margins — a clipped column/card then runs under the physical screen
 *  edge (the real scroll affordance), not into an invisible padding line.
 *  Measured on the ROOT (which never moves); the negative margins are applied
 *  to an inner element, so the measurement can't feed back into itself. */
export function useNarrowContainer(threshold = 480) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [width, setWidth] = useState(0);
  const [edge, setEdge] = useState({ left: 0, right: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const w = Math.round(r.width);
      setNarrow(w > 0 && w < threshold);
      setWidth(w);
      const left = Math.max(0, Math.round(r.left));
      const right = Math.max(0, Math.round(window.innerWidth - r.right));
      setEdge(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [threshold]);
  // `width` = the root's CONTENT width — the reliable base for column sizing
  // (a scroller's clientWidth is a moving target while bleed/padding mount).
  return { ref, narrow, edge, width };
}

/** Coarse pointer (finger) — resize edge-zones grow from ~6px to ~16px on it;
 *  a 6px strip is not a touch target (44pt/48dp guidelines). Evaluated once:
 *  the primary pointer kind does not change mid-session. */
export function useCoarsePointer(): boolean {
  const [coarse] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches
      : false,
  );
  return coarse;
}

// ── Time tick (current-time indicators) ─────────────────────────────────

/** Self-updating "now" (1-minute tick; mounted only while the consuming view
 *  renders). The widgets draw their own now-line from it. */
export function useNow(): Date {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

// ── Tone mechanics (closed palette — every widget references these maps) ─
// The PUBLIC tone contract stays per widget (CALENDAR_TONES / RESOURCE_TONES
// const arrays + derived unions, so each widget file is self-describing); the
// Tailwind class-maps behind them live here, once.

export type WidgetTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive';

export const TONE_DOT: Record<WidgetTone, string> = {
  default: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  destructive: 'bg-destructive',
};
export const TONE_BAR: Record<WidgetTone, string> = {
  default: 'bg-muted text-foreground',
  primary: 'bg-primary/15 text-primary',
  success: 'bg-emerald-500/15 text-emerald-700',
  warning: 'bg-amber-500/15 text-amber-700',
  destructive: 'bg-destructive/15 text-destructive',
};
/** Card accent (board cards): a coloured left status bar + faint tint. */
export const TONE_ACCENT: Record<WidgetTone, string> = {
  default: 'border-l-muted-foreground bg-muted/40',
  primary: 'border-l-primary bg-primary/5',
  success: 'border-l-emerald-500 bg-emerald-500/5',
  warning: 'border-l-amber-500 bg-amber-500/5',
  destructive: 'border-l-destructive bg-destructive/5',
};
/** Text-color per tone — an SVG mark painted with `currentColor` inherits its
 *  tone from this class on a wrapper. Chart marks, sparkline strokes: color is
 *  defined ONCE here, theme-aware, palette-closed (never a free hex). */
export const TONE_TEXT: Record<WidgetTone, string> = {
  default: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-emerald-600',
  warning: 'text-amber-600',
  destructive: 'text-destructive',
};

// ── Drag&Drop core (Pointer Events — no library; window FSM) ────────────
// The hard lessons baked in (each was a real widget bug once):
//
//  • WINDOW listeners, not per-element. The gesture's pointermove/up/cancel and
//    an Escape keydown live on `window` for the gesture's lifetime (mounted in
//    one effect, torn down in its cleanup). So the END of a gesture ALWAYS
//    fires — no matter what is under the cursor on release. There is exactly
//    ONE teardown path (`reset`), reached on pointerup, pointercancel, Escape
//    AND unmount → the ghost can never get stuck.
//  • GEOMETRY stays in the widget. The core never reads elementFromPoint and
//    never interprets coordinates itself — at gesture start the widget hands it
//    a geometry snapshot, and `resolve` (widget code) turns (x, y) into a
//    preview. The core only runs the FSM around it.
//  • TOUCH long-press (300 ms). A finger that starts moving immediately is a
//    SCROLL — the browser keeps it (chips use `touch-action: manipulation`)
//    and the gesture aborts. Holding still arms the drag; from then on a
//    non-passive touchmove listener prevents native panning so the drag owns
//    the pointer. Mouse/pen arm via the move threshold, as before.
//  • AUTO-SCROLL at the edges. While a drag is armed, a rAF loop nudges the
//    innermost scrollable ancestor (or the window) when the pointer sits near
//    its edge, then re-resolves the preview — so a booking can be dragged to a
//    row/day that is currently scrolled out of view. Geometry reads live cell
//    rects, so the re-resolve is always correct after scrolling.

export type DragMode = 'move' | 'resize-start' | 'resize-end' | 'create';

const DRAG_THRESHOLD = 5;        // px (mouse/pen): movement that arms the drag
const TOUCH_HOLD_MS = 300;       // touch: hold this long to arm the drag
const TOUCH_TOLERANCE_PX = 10;   // touch: moving further before the hold = scroll intent
const SCROLL_EDGE_PX = 32;       // auto-scroll: edge proximity that starts scrolling
const SCROLL_MAX_PX = 18;        // auto-scroll: max px per frame (scales with proximity)

/** One live gesture. `resolve`/`commit` (widget code) read the event, the
 *  captured geometry and the grab context from here. */
export type DragGesture<E extends { id: string }, G> = {
  ev: E;
  /** the day grabbed at gesture start — a move shifts by (dropDay − grabDay) so a
   *  multi-day bar grabbed in the middle moves AS A WHOLE instead of snapping its
   *  start under the cursor. */
  grabDay: Date | null;
  mode: DragMode;
  /** the active view's layout snapshot, captured by the widget at gesture start. */
  geom: G;
  startX: number;
  startY: number;
  active: boolean;
  /** 'touch' arms via long-press; mouse/pen arm via the move threshold. */
  pointerType: string;
  /** scrollable ancestors of the grabbed element (innermost first) — auto-scroll targets. */
  scrollables: HTMLElement[];
};

export type PointerDragOptions<E extends { id: string }, G, P> = {
  /** move gesture wired? (the consumer passed onEventDrop) */
  moveEnabled: boolean;
  /** resize gesture wired? (the consumer passed onEventResize) */
  resizeEnabled: boolean;
  /** drag-to-create wired? (the consumer passed onRangeCreate). The widget
   *  begins a 'create' gesture with a PHANTOM event carrying the grab anchor
   *  (its `start` = anchor day/time); resolve turns anchor+cursor into the
   *  painted range. Optional — widgets without a create surface omit it. */
  createEnabled?: boolean;
  /** Snapshot the grabbed day at gesture start (time widgets; boards without a day axis return null). */
  grabDayAt: (geom: G, clientX: number, clientY: number) => Date | null;
  /** Pure geometry + date math → the live preview at the cursor (null off-grid).
   *  Runs on every move; must set no app state. */
  resolve: (g: DragGesture<E, G>, clientX: number, clientY: number) => P | null;
  /** Highlight key of a preview's destination cell (what `dropTarget` exposes). */
  targetKey: (p: P) => string;
  /** Fire the consumer callback for a real, valid change. Called ONLY after a
   *  real drag (threshold/long-press passed); `p` is null when the drop landed
   *  off-grid — guard and snap back (the core already tore the gesture down). */
  commit: (g: DragGesture<E, G>, p: P | null) => void;
};

/** Scrollable ancestors of the grabbed element, innermost first. Captured once
 *  at gesture start — the auto-scroll loop nudges the first one that can move. */
function scrollableAncestors(el: Element | null): HTMLElement[] {
  const out: HTMLElement[] = [];
  let n: HTMLElement | null = el instanceof HTMLElement ? el : null;
  while (n && n !== document.body) {
    const s = getComputedStyle(n);
    const scrollsY = (s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight;
    const scrollsX = (s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth;
    if (scrollsY || scrollsX) out.push(n);
    n = n.parentElement;
  }
  return out;
}

/** One auto-scroll frame: nudge the innermost scrollable whose edge the pointer
 *  is near (speed scales with proximity), falling back to the window. Returns
 *  true when something scrolled — the caller then re-resolves the preview. */
function autoScrollStep(scrollables: HTMLElement[], x: number, y: number): boolean {
  const speed = (overshoot: number) => Math.ceil(Math.min(1, overshoot / SCROLL_EDGE_PX) * SCROLL_MAX_PX);
  for (const el of scrollables) {
    const r = el.getBoundingClientRect();
    const left = Math.max(r.left, 0), right = Math.min(r.right, window.innerWidth);
    const top = Math.max(r.top, 0), bottom = Math.min(r.bottom, window.innerHeight);
    let dx = 0, dy = 0;
    if (el.scrollWidth > el.clientWidth) {
      if (x < left + SCROLL_EDGE_PX && el.scrollLeft > 0) dx = -speed(left + SCROLL_EDGE_PX - x);
      else if (x > right - SCROLL_EDGE_PX && el.scrollLeft + el.clientWidth < el.scrollWidth - 1) dx = speed(x - (right - SCROLL_EDGE_PX));
    }
    if (el.scrollHeight > el.clientHeight) {
      if (y < top + SCROLL_EDGE_PX && el.scrollTop > 0) dy = -speed(top + SCROLL_EDGE_PX - y);
      else if (y > bottom - SCROLL_EDGE_PX && el.scrollTop + el.clientHeight < el.scrollHeight - 1) dy = speed(y - (bottom - SCROLL_EDGE_PX));
    }
    if (dx || dy) {
      el.scrollLeft += dx;
      el.scrollTop += dy;
      return true;
    }
  }
  const doc = document.scrollingElement;
  if (doc) {
    let dx = 0, dy = 0;
    if (x < SCROLL_EDGE_PX && doc.scrollLeft > 0) dx = -speed(SCROLL_EDGE_PX - x);
    else if (x > window.innerWidth - SCROLL_EDGE_PX && doc.scrollLeft + window.innerWidth < doc.scrollWidth - 1) dx = speed(x - (window.innerWidth - SCROLL_EDGE_PX));
    if (y < SCROLL_EDGE_PX && doc.scrollTop > 0) dy = -speed(SCROLL_EDGE_PX - y);
    else if (y > window.innerHeight - SCROLL_EDGE_PX && doc.scrollTop + window.innerHeight < doc.scrollHeight - 1) dy = speed(y - (window.innerHeight - SCROLL_EDGE_PX));
    if (dx || dy) {
      doc.scrollLeft += dx;
      doc.scrollTop += dy;
      return true;
    }
  }
  return false;
}

/** The shared pointer-drag FSM. The widget supplies geometry semantics
 *  (`grabDayAt`/`resolve`/`targetKey`) and commit semantics; the core owns the
 *  gesture lifecycle. The returned shape is what the views consume:
 *  `begin` on pointerdown, `consumeClick` to swallow the post-drag click,
 *  `draggingId`/`dropTarget`/`preview` to paint, `active`/`resizable` to gate. */
export function usePointerDrag<E extends { id: string }, G, P>(opts: PointerDragOptions<E, G, P>) {
  // Latest options in a ref: resolve/commit close over fresh consumer props
  // without remounting the window listeners mid-gesture.
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const gesture = useRef<DragGesture<E, G> | null>(null);
  const justDraggedRef = useRef(false);
  // Latest pointer position — the window listeners write it; commit and the
  // auto-scroll loop read it (an Escape/cancel exit carries no coords).
  const lastPointRef = useRef({ x: 0, y: 0 });
  const holdTimerRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingMode, setDraggingMode] = useState<DragMode | null>(null);

  // ── Drag PROXY (Bryntum DragHelper pattern) ─────────────────────────────
  // A compact stand-in of the grabbed item follows the pointer, so the hand
  // always SEES what it holds; the source stays dimmed in place and the
  // snapped target preview keeps showing where it will land. Positioned
  // imperatively (no React render per pointermove — 60fps like a DOM proxy).
  // The widget renders the proxy's MARKUP (layout stays per widget) into a
  // fixed wrapper and registers it via `ghostRef`; mouse trails the cursor,
  // touch floats centered ABOVE the finger (the finger must not cover it).
  const ghostElRef = useRef<HTMLElement | null>(null);
  const ghostOffsetRef = useRef({ x: 14, y: 16 });
  const positionGhost = useCallback((x: number, y: number) => {
    const el = ghostElRef.current;
    if (!el) return;
    const o = ghostOffsetRef.current;
    el.style.transform = `translate3d(${Math.round(x + o.x)}px, ${Math.round(y + o.y)}px, 0)`;
  }, []);
  const ghostRef = useCallback((el: HTMLElement | null) => {
    ghostElRef.current = el;
    if (el) {
      const touch = gesture.current?.pointerType === 'touch';
      ghostOffsetRef.current = touch
        ? { x: -Math.round(el.offsetWidth / 2), y: -(el.offsetHeight + 24) }
        : { x: 14, y: 16 };
      positionGhost(lastPointRef.current.x, lastPointRef.current.y);
    }
  }, [positionGhost]);
  const [preview, setPreview] = useState<P | null>(null);
  // True for the lifetime of a gesture (set in begin, cleared in reset). The
  // window-listener effect keys off it: listeners mount when a gesture starts and
  // the effect cleanup tears them ALL down the instant it ends — no idle leak.
  const [gestureLive, setGestureLive] = useState(false);

  // The ONE teardown path. Reached from pointerup, pointercancel, Escape and the
  // effect cleanup on unmount → nothing can outlive a gesture (no stuck ghost).
  // Clearing gestureLive also unmounts the window listeners (effect cleanup).
  const reset = useCallback(() => {
    if (holdTimerRef.current != null) { window.clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    gesture.current = null;
    setGestureLive(false);
    setDraggingId(null);
    setDraggingMode(null);
    setDropTarget(null);
    setPreview(null);
  }, []);

  // Resolve + paint the live preview/highlight for the gesture at (x, y).
  const paint = useCallback((g: DragGesture<E, G>, x: number, y: number) => {
    const next = optsRef.current.resolve(g, x, y);
    setPreview(next);
    setDropTarget(next ? optsRef.current.targetKey(next) : null);
  }, []);

  // Begin a gesture (pointerdown on a chip/bar/handle). `geom` is the active
  // view's layout snapshot. Touch starts a long-press timer instead of arming.
  const begin = useCallback((ev: E, e: ReactPointerEvent, geom: G, mode: DragMode = 'move') => {
    const o = optsRef.current;
    const enabled = mode === 'move' ? o.moveEnabled : mode === 'create' ? !!o.createEnabled : o.resizeEnabled;
    if (!enabled) return;
    gesture.current = {
      ev,
      grabDay: optsRef.current.grabDayAt(geom, e.clientX, e.clientY),
      mode, geom,
      startX: e.clientX, startY: e.clientY, active: false,
      pointerType: e.pointerType,
      scrollables: scrollableAncestors(e.target as Element | null),
    };
    lastPointRef.current = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'touch') {
      // Long-press arms the drag; the chip dims and the preview appears under
      // the still finger. Early movement (scroll intent) aborts in onMove.
      holdTimerRef.current = window.setTimeout(() => {
        holdTimerRef.current = null;
        const g = gesture.current;
        if (!g || g.active) return;
        g.active = true;
        setDraggingId(g.ev.id);
        setDraggingMode(g.mode);
        // Lift feedback: a short tick tells the thumb "you have the card"
        // (Android; iOS Safari has no vibrate — the dim + preview carry it).
        try { navigator.vibrate?.(15); } catch { /* not available */ }
        paint(g, lastPointRef.current.x, lastPointRef.current.y);
      }, TOUCH_HOLD_MS);
    }
    setGestureLive(true);   // → effect mounts the window listeners
  }, [paint]);

  const onMove = useCallback((clientX: number, clientY: number) => {
    const g = gesture.current;
    if (!g) return;
    if (!g.active) {
      const dist = Math.abs(clientX - g.startX) + Math.abs(clientY - g.startY);
      if (g.pointerType === 'touch') {
        // Before the long-press arms: real movement = a scroll, not a drag.
        if (dist >= TOUCH_TOLERANCE_PX) reset();
        return;
      }
      if (dist < DRAG_THRESHOLD) return;
      g.active = true;
      setDraggingId(g.ev.id);
      setDraggingMode(g.mode);
    }
    paint(g, clientX, clientY);
    // The proxy trails every pointer move — only for MOVE gestures (a resize
    // drags an edge, a create paints a range; a floating clone would lie).
    if (g.mode === 'move') positionGhost(clientX, clientY);
  }, [paint, reset, positionGhost]);

  // Commit. Read the gesture + its last resolved preview, tear down, then hand
  // both to the widget's commit (no-op guards + callback firing live there).
  const commit = useCallback(() => {
    const g = gesture.current;
    const wasActive = !!g && g.active;
    const p = g && g.active ? optsRef.current.resolve(g, lastPointRef.current.x, lastPointRef.current.y) : null;
    reset();
    if (!wasActive || !g) return;
    justDraggedRef.current = true;     // swallow the click that fires right after
    optsRef.current.commit(g, p);
  }, [reset]);

  // Window-level FSM. Mounted ONLY while a gesture is live (gestureLive). Every
  // exit — pointerup, pointercancel, Escape, unmount — routes through reset, so a
  // release over ANY element (or none) always ends the gesture cleanly: no stuck
  // ghost, ever. This is the whole point of putting the listeners on `window`.
  useEffect(() => {
    if (!gestureLive) return;
    const onPointerMove = (e: PointerEvent) => {
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      onMove(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      lastPointRef.current = { x: e.clientX, y: e.clientY };
      commit();
    };
    const onPointerCancel = () => { justDraggedRef.current = !!gesture.current?.active; reset(); };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { justDraggedRef.current = !!gesture.current?.active; reset(); }
    };
    // Once the drag is ARMED, kill native panning (non-passive!) so the touch
    // gesture owns the pointer; before that the browser may scroll freely.
    const onTouchMove = (e: TouchEvent) => {
      if (gesture.current?.active && e.cancelable) e.preventDefault();
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    // Auto-scroll loop: while the drag is armed, a pointer near a scrollable
    // edge keeps scrolling (even when held still) and the preview re-resolves
    // against the moved cell rects.
    let raf = window.requestAnimationFrame(function tick() {
      const g = gesture.current;
      if (g && g.active && autoScrollStep(g.scrollables, lastPointRef.current.x, lastPointRef.current.y)) {
        onMove(lastPointRef.current.x, lastPointRef.current.y);
      }
      raf = window.requestAnimationFrame(tick);
    });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('touchmove', onTouchMove);
      window.cancelAnimationFrame(raf);
    };
  }, [gestureLive, onMove, commit, reset]);

  // Returns true once if a real drag just ended → the caller skips its onClick.
  const consumeClick = useCallback(() => {
    if (justDraggedRef.current) { justDraggedRef.current = false; return true; }
    return false;
  }, []);

  return {
    begin, consumeClick,
    draggingId, draggingMode, dropTarget, preview, ghostRef,
    active: opts.moveEnabled, resizable: opts.resizeEnabled, creatable: !!opts.createEnabled,
  };
}
