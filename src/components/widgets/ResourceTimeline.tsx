/**
 * ResourceTimeline — pre-generated synoptic resource-occupancy widget (Archetype B).
 *
 * The "who is booked when" board (rooms, stations, machines, vehicles, staff).
 * Two layouts, one widget: `axis="day"` is the classic OCCUPANCY PLAN —
 * resources are ROWS, the visible week is day COLUMNS, and each booking is one
 * continuous bar across its days (lane-packed on overlap). `axis="time"` is the
 * intraday hour grid — one COLUMN per resource over a shared hour axis. This is
 * the sister widget to CalendarWidget — a calendar shows ONE axis for everyone;
 * a resource timeline splits it per resource so a resource's overlaps are
 * visible. Compose it; never reimplement.
 *
 * @version 2.10.4
 * @since 2026-06-12  (2.10.4: PHONE COLUMNS = "three days must fit" — on the
 *                     phone layout the day columns size from the measured
 *                     container (clamped 72–112px) so a real 390px phone
 *                     shows THREE full days, not 2.3; the sticky bar labels
 *                     (2.10.3) carry the names at any cell width. Month
 *                     keeps its compact overview columns.
 *                     2.10.3: STICKY BAR LABELS (day axis) — when a span
 *                     bar's start scrolls past the left edge, its title rides
 *                     along inside the visible part (sticky, clamped within
 *                     the bar): an occupied row never reads anonymous on the
 *                     phone's 3-day window. renderEvent slots that replace
 *                     the default content should mirror the mechanic.
 *                     2.10.2: DAY-AXIS FIT-TO-WIDTH — the column minimum
 *                     yields to the measured container width so the WHOLE
 *                     range (week/2weeks/month) is visible without
 *                     horizontal scrolling, clamped at per-range readability
 *                     floors (88/56/40px); span bars carry their titles, so
 *                     narrower cells lose nothing. Below the floor the grid
 *                     scrolls and today's column auto-focuses (2.10.1).
 *                     2.10.1: DAY-AXIS AUTO-FOCUS — when today's column lies
 *                     beyond the visible scroll area, the grid scrolls it
 *                     into view on mount (sister mechanic to the calendar's
 *                     hour-grid focus); never snaps back while navigating
 *                     other weeks.
 *                     2.10.0: DRAG PROXY — the grabbed bar rides with the
 *                     pointer (see CalendarWidget 2.9.0 / primitives 1.6.0).
 *                     2.9.3: the phone card KEEPS its side margins (family
 *                     principle, see CalendarWidget 2.8.3).
 *                     2.9.2: TIDY phone toolbar (see CalendarWidget 2.8.2) —
 *                     joined ‹|Heute|› nav group + equal-height range segment.
 *                     2.9.1: FULL-BLEED phone card (see CalendarWidget 2.8.1).
 *                     2.9.0: PHONE POLISH — compact mobile toolbar (short
 *                     title, full-width range-segment grid) and 13px bar
 *                     type / 11px day heads on narrow.
 *                     2.8.0: PHONE LAYOUT, built-in — below 480px CONTAINER
 *                     width the resource-label column shrinks to ~88px
 *                     (sticky, truncated) so ~3 day columns stay visible at
 *                     390px (was 1.5), and the horizontal scroll SNAPS per
 *                     day / resource column (paused while a drag runs). The
 *                     time-axis hour gutter is now sticky like the day-axis
 *                     labels; resize edge-zones grow to touch size on a
 *                     coarse pointer; touch long-press ticks on lift.
 *                     Nothing to configure.
 *                     2.7.0: `cellClassName(date, group)` — a CSS-class tint
 *                     for the (resource × day) cell surface, the dayClassName
 *                     analog of the family: season pricing, weekends, blocked
 *                     days per resource. Class only, never content. Applies to
 *                     day-axis cells AND time-axis columns (date = the
 *                     column's day there).
 *                     2.6.0: REJECTION CHANNEL — onEventDrop/onEventResize may
 *                     RETURN a string ("blocked — show this reason"): the
 *                     widget snaps back AND shows the built-in rejection
 *                     notice. Overlap/capacity rules stay in YOUR handlers —
 *                     check first, return the message instead of patching.
 *                     2.5.0: family-staple parity with CalendarWidget 2.5.x.
 *                     (1) DRAG-TO-CREATE: drag across empty day cells in a
 *                     resource ROW (day axis) or vertically in a resource
 *                     COLUMN (time axis) paints a range; `onRangeCreate(start,
 *                     end, group)` fires on release — and HERE `group` is the
 *                     REAL resource key (the calendar always passes undefined).
 *                     OFF until passed; the plain onEmptyClick tap is
 *                     unchanged. (2) NOW LINE on the time axis (self-updating).
 *                     (3) `weekDays: 5 | 7` — the day axis' WEEK range can
 *                     hide Sat+Sun (working week; 2weeks/month show all days).
 *                     (4) SCROLL HINT: live-measured fade edges signal
 *                     off-screen columns. Plus: time-axis chips now always
 *                     carry their title (dead isStart branch removed).)
 * @since 2026-06-10  (2.4.0: shared mechanics extracted to ./primitives (M4) —
 *                     date helpers, tone class-maps and the pointer-drag FSM
 *                     core now live there ONCE for the widget family. The drag
 *                     core gained edge AUTO-SCROLL (dragging a booking towards
 *                     the edge of the scrolled board scrolls it and re-targets)
 *                     and a touch LONG-PRESS (300 ms): a quick swipe on a bar
 *                     scrolls, holding still arms the drag. Public API
 *                     unchanged.)
 * @since 2026-06-03  (2.1.0: `onEmptyClick` now ALSO fires on the time axis —
 *                     the Date carries the clicked CLOCK TIME; new
 *                     `dragSnapMinutes` snaps click and drag times. Family
 *                     parity with CalendarWidget's hour grid.
 *                     2.2.0: `renderEmptySlot` — the time axis can render a
 *                     VISIBLE slot raster with a bookable affordance in every
 *                     free dragSnapMinutes cell. Never hand-roll a slot grid.
 *                     2.3.0: time-axis chips CLIP to their true duration and
 *                     clamp to the visible hour window; rows auto-scale with
 *                     renderEmptySlot (`hourHeight` overrides); new
 *                     `onCursorChange` keeps the built-in toolbar functional
 *                     with a controlled `referenceDate`.
 *                     2.3.1: the time-axis EventChip now FILLS its slot height
 *                     (`flex h-full`) instead of hugging its text — a single
 *                     booking no longer underfills a renderEmptySlot-scaled cell.)
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. Never edit this file (nor ./primitives.ts — the family's shared
 *     mechanics); never import from CalendarWidget (separate grids stay
 *     separate — shared is MECHANICS via ./primitives, never layout). If a
 *     slot is missing: unblock via children/render-prop +
 *     // TODO(widget-gap). Never fork, never leave the build red.
 *  2. A clicked event MUST open a <RecordOverlay> (from RecordView) — this widget
 *     owns NO detail layer. Wire `onEventClick`; never render your own modal.
 *  3. Data-agnostic: `group` is an OPAQUE string key — it is NEVER a Living-Apps
 *     field name and the widget never knows "room"/"resource"/"capacity". The
 *     consumer maps an app lookup field → `ev.group` and builds `groups` before
 *     passing them. No field knowledge here.
 *  4. Empty collection renders the empty column grid IN-PLACE (the lanes stay),
 *     never a centered "not found" box. That idiom is RecordView's.
 *  5. `start`/`end` are ISO strings: 'YYYY-MM-DD' (all-day) or 'YYYY-MM-DDTHH:MM'
 *     (timed, NO seconds). Parsing is timezone-safe (parseISO, local) — never
 *     `new Date(str)`.
 *  6. Overlap MUST stay visible: two bookings in the same resource/time are
 *     lane-packed — stacked into separate lanes ('day': bars; 'time': columns),
 *     each carrying its OWN title — never collapsed into one nameless block.
 *     (This *visualizes* capacity conflicts; *validation* stays consumer.)
 *
 * ─── API at a glance (exact prop names + full enums — NEVER guess) ──────
 *
 *  <ResourceTimeline
 *     events                 ResourceEvent[]  — { id, start, end?, allDay?, title, subtitle?, tone?, group }
 *     groups                 ResourceGroup[]  — on 'time' = ordered columns; on 'day' = ordered ROWS ({ key, label, tone? })
 *                                               lowercase `groups` — `GROUPS` is not a prop.
 *     axis?                  'day' | 'time'   — occupancy plan (resources = rows, days = columns) | intraday hour grid (default 'time')
 *     referenceDate?         Date  (controlled cursor; else self-managed)
 *     defaultDate?           Date  (uncontrolled seed; default = today)
 *     defaultRange?          'week' | '2weeks' | 'month'  ('day' axis; default 'week' — the toolbar's range segment)
 *     dayStartHour?          number  (time axis; default 7)
 *     dayEndHour?            number  (time axis; default 21)
 *     dragSnapMinutes?       number  (time axis: snap for empty-click + drag times AND the renderEmptySlot raster; default 15.
 *                                     ONE scalar — no dragConfig. Slot-raster domains set it to the slot length, e.g. 20.)
 *     hourHeight?            number  (time axis: px per hour row. Default 48; with renderEmptySlot it AUTO-SCALES so one
 *                                     slot cell is ≥40px — a 4-h slot inventory reads like a hand-built day plan, not a
 *                                     squeezed ribbon. Set it only to override.)
 *     onCursorChange?        (date: Date) => void  — the BUILT-IN toolbar reports where it wants to navigate. With a
 *                                     controlled `referenceDate` this is REQUIRED to keep ‹/Heute/› alive: update your
 *                                     state here (clamp/skip, e.g. weekends). NEVER render a second prev/next bar.
 *     weekStartsOn?          0 | 1   (default 1 = Monday)
 *     weekDays?              5 | 7   (day axis, WEEK range only: 5 = working week, Sat+Sun hidden.
 *                                     2weeks/month always show all days. Default 7)
 *     locale?                date-fns Locale  (pass dateFnsLocale() from '@/i18n' — never
 *                            pin a fixed locale like `de`; dates must follow the language switch)
 *     onEventClick?          (event: ResourceEvent) => void              — open a <RecordOverlay>
 *     onEmptyClick?          (date: Date, group?: string) => void        — click EMPTY space: open a PREFILLED create dialog.
 *                                                                    `group` is the resource's opaque key — this widget ALWAYS
 *                                                                    passes both. On 'day' the Date is the clicked day (midnight);
 *                                                                    on 'time' it carries the clicked CLOCK TIME (Y → minute,
 *                                                                    snapped to dragSnapMinutes). A click right after a drag is
 *                                                                    swallowed. No prop = cells inert.
 *     onEventDrop?           (id, newStart, newEnd?, newGroup?) => void | string | Promise<void | string>  — reschedule / cross-resource move.
 *                                                                    REJECTION CHANNEL: return a STRING to block (snap-back + built-in
 *                                                                    notice) — the overlap check lives HERE, the display in the widget.
 *                                                                    DRAG IS OFF until you pass this. `newEnd` is set ONLY when
 *                                                                    the event HAS an `end` (undefined for point bookings — never
 *                                                                    fabricate one). `newGroup` set only when the drop lands in a
 *                                                                    different resource (row on 'day', column on 'time').
 *     onEventResize?         (id, newStart, newEnd) => void | string | Promise<void | string>  — drag a bar's edge to lengthen/shorten.
 *                                                                    'day' axis only; day-granular. RESIZE IS OFF until you pass this.
 *     onRangeCreate?         (start: Date, end: Date, group?: string) => void  — DRAG-TO-CREATE on empty space; OFF until
 *                                                                    you pass this. Day axis: drag across cells in a ROW → day range
 *                                                                    (midnights, end day INCLUSIVE) for THAT resource. Time axis: drag
 *                                                                    vertically in a COLUMN → clock times, snapped to dragSnapMinutes.
 *                                                                    `group` is ALWAYS the resource key here — take it (family signature;
 *                                                                    only the calendar passes undefined). Fires DATES like onEmptyClick,
 *                                                                    NOT ISO strings like onEventDrop — format onto your field type.
 *     renderEvent?           (event: ResourceEvent, meta: ResourceSegmentMeta) => ReactNode  — full control of one chip / span bar
 *     renderGroupHeader?     (group: ResourceGroup) => ReactNode         — the resource header (column head on 'time', row label
 *                                                                    on 'day'). NO event access: it receives only the group.
 *                                                                    Per-row aggregates (occupancy %, counts) come from the
 *                                                                    consumer's own data via CLOSURE — see the example.
 *     cellClassName?         (date: Date, group: string) => string       — a CSS CLASS only for the (resource × day)
 *                                                                    cell surface (tint weekends, season ranges, blocked days);
 *                                                                    NOT content. On the time axis the whole resource column gets
 *                                                                    it (date = the visible day).
 *     renderEmptySlot?       (date: Date, group: string) => ReactNode    — TIME AXIS ONLY. Turns the hour canvas into a VISIBLE
 *                                                                    slot raster: the column divides into dragSnapMinutes
 *                                                                    cells, sub-hour slot lines are drawn, and your node
 *                                                                    renders in every FREE cell (size it w-full h-full).
 *                                                                    A tap fires onEmptyClick with the slot's EXACT start.
 *                                                                    Without it, empty space is a plain (invisible) target.
 *                                                                    NEVER hand-roll a slot grid — that loses drag&drop.
 *     className?             string                                      — appended to the shell
 *     children?              ReactNode                                   — filter/legend slot ABOVE the toolbar (the prev/today/next
 *                                                                    + Woche/2-Wochen/Monat toolbar is BUILT IN — you wire nothing for it)
 *  >
 *  // + <ResourceTimelineSkeleton /> / <ResourceTimelineError error onRetry? />  (State-Trias)
 *
 *  tone enum (events + groups):  'default' | 'primary' | 'success' | 'warning' | 'destructive'
 *  axis enum:                    'day' | 'time'           range enum:  'week' | '2weeks' | 'month'
 *  Exported as const arrays for reference: RESOURCE_TONES, RESOURCE_AXES, RESOURCE_RANGES.
 *
 *  NAVIGATION + RANGE ARE BUILT IN. The widget renders its own toolbar (‹ / Heute
 *  / › and, on the 'day' axis, a Woche / 2 Wochen / Monat segment) and manages the
 *  cursor itself — the consumer passes no navigation props and writes no toolbar.
 *  Need to STEER navigation (skip weekends, clamp a range)? Pass a controlled
 *  `referenceDate` AND `onCursorChange` — the built-in toolbar then drives YOUR
 *  state. Never compose a second prev/next bar above the widget.
 *
 *  `renderEvent(ev, meta)` — `meta: { isStart, isEnd, isContinuation }`: on the
 *  'day' axis the bar is clipped to the visible week, so isStart/isEnd are false
 *  when the booking continues past the edge (render the title once, on isStart).
 *  Single-segment events resolve to {true,true,false}.
 *
 * ─── ❌ COMMON MISTAKES (real, build-breaking) ─────────────────────────
 *  • `GROUPS` instead of `groups` — the prop is lowercase (TS2304 if you read a
 *    `GROUPS` constant that doesn't exist).
 *  • onEmptyClick with a 1-arg lambda: `onEmptyClick={(date) => …}`. This COMPILES
 *    (an extra param is type-compatible) but `group` is then SILENTLY ignored — the
 *    resource prefill stays empty. THE most important warning: always take BOTH —
 *    `onEmptyClick={(date, group) => openCreate({ day: date, room: group })}`.
 *  • Inventing `tone: 'danger'` — the only tones are the five above (TS2322).
 *  • Assuming a `parseId` helper exists — it does NOT. Parse ids inline the way you
 *    built them: `id.split(':')` (e.g. `id` = `` `buchung:${rid}` `` → `id.split(':')[1]`).
 *  • Raw `new Date(str)` — timezone-unsafe. The widget parses with `parseISO`; the
 *    consumer should pass clean ISO ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM').
 *  • a SILENT snap-back: enforcing overlap/capacity in onEventDrop without
 *    returning the reason — and the inverse, returning the string AND building
 *    an own banner (double notice). Return the string; the widget displays it.
 *  • Treating `onRangeCreate`'s args like onEventDrop's — they are DATES, not
 *    ISO strings. Format them yourself before writing; and take the THIRD arg:
 *    `group` carries the resource the range was drawn in.
 *  • Writing a cross-resource `newGroup` back as a bare string on a lookup field
 *    (TS2345) — write a `LookupValue {key,label}` (static lookup) or a record URL
 *    via `createRecordUrl` (applookup). See the example.
 *
 *  Full compiling example: ./ResourceTimeline.example.tsx
 */
import { type ReactNode, type ComponentType, type PointerEvent as ReactPointerEvent, useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { Locale } from 'date-fns';
import {
  format, parseISO, startOfDay, startOfWeek, eachDayOfInterval,
  startOfMonth, endOfMonth, addMonths, addWeeks,
  isSameDay, isToday, addDays, addMinutes, differenceInCalendarDays, differenceInMinutes,
  getHours, getMinutes, setHours, setMinutes, isValid,
  max as maxDate, min as minDate,
} from 'date-fns';
import { IconAlertCircle, IconRefresh, IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
// Shared widget MECHANICS (M4) — date math, tone class-maps, drag-FSM core.
// Sister widgets never import each other; BOTH import './primitives'.
import {
  TONE_DOT, TONE_BAR,
  isAllDay, eventStart, eventEnd, occursOn, eventOrder,
  usePointerDrag, useNow, useRejectNotice, useNarrowContainer, useCoarsePointer,
  type DragGesture, type DragMode, type WriteResult,
} from './primitives';
// `Locale` above is date-fns' (the consumer's date-format locale) — the UI
// language is a separate axis and comes from the runtime layer.
import { coreLocale as i18nLocale, type CoreLocale as UiLocale } from '@/i18n';

/** The closed tone palette as a referenceable array (don't transcribe the union).
 *  ResourceTone is derived from it, so the array and the type can never drift. */
export const RESOURCE_TONES = ['default', 'primary', 'success', 'warning', 'destructive'] as const;
export type ResourceTone = (typeof RESOURCE_TONES)[number];
/** The two layouts. */
export const RESOURCE_AXES = ['day', 'time'] as const;

export type ResourceEvent = {
  id: string;
  /** ISO 'YYYY-MM-DD' (all-day) or 'YYYY-MM-DDTHH:MM' (timed). */
  start: string;
  /** ISO end. Set → multi-day / time-span. */
  end?: string;
  allDay?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: ResourceTone;
  /** OPAQUE column key — matched against ResourceGroup.key. Never a field name. */
  group: string;
};

export type ResourceGroup = { key: string; label: ReactNode; tone?: ResourceTone };

/** Passed to renderEvent so a multi-day chip can round only its real edges. */
export type ResourceSegmentMeta = { isStart: boolean; isEnd: boolean; isContinuation: boolean };

const FULL_META: ResourceSegmentMeta = { isStart: true, isEnd: true, isContinuation: false };

// Closed tone palette — the widget owns every value's look. The class-maps
// (TONE_DOT/TONE_BAR) are shared family MECHANICS from './primitives' (M4);
// the public RESOURCE_TONES contract above stays per widget.

const MIN_COL_PX = 160;   // min resource-column width (overflow-x past this)
const HOUR_PX = 48;       // time-axis hour height
const RES_COL_PX = 160;   // day-axis sticky resource-label column width
const LANE_PX = 48;       // day-axis bar height + gap per lane (fits title + status)
const ROW_PAD_PX = 8;     // day-axis vertical padding inside a resource row

// ── Date helpers — shared family MECHANICS from './primitives' (M4) ─────
// isAllDay/eventStart/eventEnd/occursOn/eventOrder are imported above; only
// the widget-specific helper below stays here.

/** A group's label as a plain string for an aria-label. `label` is a ReactNode
 *  (usually a string from the consumer's groups); anything non-string falls back
 *  to the opaque key so the label is never "[object Object]". */
function groupAriaLabel(g: ResourceGroup): string {
  return typeof g.label === 'string' ? g.label : g.key;
}

// ── Column-internal packing (overlap → side-by-side, à la calendar) ─────

/** Tier-2 layout primitive (exported). SEMANTIC, not pixels: `minuteOffset` is the
 *  event's minutes from the column's start hour, `durationMinutes` its length in
 *  minutes; `col`/`cols` are the side-by-side overlap indices. The renderer turns
 *  minutes into pixels (× HOUR_PX / 60) — pixels never leak into this contract. */
export type PackedEvent<T = ResourceEvent> = { ev: T; minuteOffset: number; durationMinutes: number; col: number; cols: number };

/** Greedy interval-partitioning inside ONE resource column on the time axis.
 *  Generic over any event with start/end/allDay — exported as a Tier-2 primitive. */
export function packColumn<T extends { start: string; end?: string; allDay?: boolean }>(
  timed: T[], day: Date, dayStartHour: number,
): PackedEvent<T>[] {
  const dayStart = setMinutes(setHours(startOfDay(day), dayStartHour), 0);
  const offsetOf = (ev: T) => {
    const s = parseISO(ev.start);
    return isSameDay(s, day) ? differenceInMinutes(s, dayStart) : 0;
  };
  const durationOf = (ev: T) => {
    const s = isSameDay(parseISO(ev.start), day) ? parseISO(ev.start) : dayStart;
    const e = ev.end && isSameDay(parseISO(ev.end), day)
      ? parseISO(ev.end)
      : setMinutes(setHours(startOfDay(day), dayStartHour + 1), 0);
    return Math.max(0, differenceInMinutes(e, s));
  };
  const out: PackedEvent<T>[] = [];
  let cluster: T[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const colEnds: number[] = [];
    const assigned = cluster.map(ev => {
      const minuteOffset = offsetOf(ev);
      const durationMinutes = durationOf(ev);
      let col = colEnds.findIndex(end => end <= minuteOffset);
      if (col === -1) { col = colEnds.length; colEnds.push(minuteOffset + durationMinutes); }
      else colEnds[col] = minuteOffset + durationMinutes;
      return { ev, minuteOffset, durationMinutes, col };
    });
    const cols = colEnds.length || 1;
    assigned.forEach(a => out.push({ ...a, cols }));
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const ev of timed) {
    const minuteOffset = offsetOf(ev);
    if (cluster.length && minuteOffset >= clusterEnd) flush();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, minuteOffset + durationOf(ev));
  }
  if (cluster.length) flush();
  return out;
}

// ── Span lane-packing (occupancy plan: bars across day columns in a row) ─
// Greedy lane assignment for the multi-day bars inside ONE resource row, clipped
// to the visible week. Same idiom as the calendar's MonthWeekRow, transposed:
// here the lanes stack within a resource row instead of within a calendar week.

/** Tier-2 layout primitive (exported). Already SEMANTIC, no pixels: `lane` is the
 *  stack index within the row, `colStart`/`span` are day-column indices (0-based,
 *  clipped to the visible window); the renderer maps them to % widths. */
export type LaidOutBar<T = ResourceEvent> = { ev: T; lane: number; colStart: number; span: number; isStart: boolean; isEnd: boolean };

/** Greedy lane-packing for the multi-day bars inside ONE resource row, clipped to
 *  the visible window. Generic over any event with start/end/allDay — exported as a
 *  Tier-2 primitive. Self-contained (no ResourceEvent helpers) so the export holds. */
export function packLanes<T extends { start: string; end?: string; allDay?: boolean }>(
  events: T[], weekStart: Date, weekEnd: Date,
): { bars: LaidOutBar<T>[]; lanes: number } {
  const s = (ev: T) => startOfDay(parseISO(ev.start));
  const e = (ev: T) => startOfDay(ev.end ? parseISO(ev.end) : parseISO(ev.start));
  const isAll = (ev: T) => ev.allDay ?? !ev.start.includes('T');
  const order = (a: T, b: T) => {
    const aAll = isAll(a) ? 0 : 1, bAll = isAll(b) ? 0 : 1;
    if (aAll !== bAll) return aAll - bAll;
    return parseISO(a.start).getTime() - parseISO(b.start).getTime();
  };
  const spanning = events
    .filter(ev => e(ev) >= weekStart && s(ev) <= weekEnd)
    .sort(order);
  const laneEnds: number[] = []; // lane → last occupied column index
  const bars: LaidOutBar<T>[] = [];
  for (const ev of spanning) {
    const segStart = maxDate([s(ev), weekStart]);
    const segEnd = minDate([e(ev), weekEnd]);
    const colStart = differenceInCalendarDays(segStart, weekStart);
    const span = differenceInCalendarDays(segEnd, segStart) + 1;
    let lane = laneEnds.findIndex(end => end < colStart);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(colStart + span - 1); }
    else laneEnds[lane] = colStart + span - 1;
    bars.push({
      ev, lane, colStart, span,
      isStart: isSameDay(s(ev), segStart),
      isEnd: isSameDay(e(ev), segEnd),
    });
  }
  return { bars, lanes: laneEnds.length };
}

// ── Drag&Drop — widget geometry + commit over the shared FSM core (M4) ──
// The gesture LIFECYCLE (window listeners with one teardown path, the move
// threshold, touch long-press, Escape cancel, edge auto-scroll) lives in
// `usePointerDrag` (./primitives), once for the family. THIS widget supplies
// the parts only it knows:
//
//  • GEOMETRY hit-test, not elementFromPoint. At gesture start the active grid
//    hands the core a `Geometry` snapshot of its layout. On move, `resolve`
//    turns the cursor into the target row/column + day (and, on the time axis,
//    the snapped clock minute) with pure math — the absolutely-positioned bars
//    can never swallow the hit-test.
//  • LIVE PREVIEW. `resolve` snaps a preview {group,start,end,…} to the target
//    cell; resize grows/shrinks the dragged edge by whole days in real time.
//    The grid reads `dnd.preview` to paint a translucent ghost bar at the
//    destination and (for resize) a size label — the user sees WHERE/HOW BIG
//    before releasing.
//  • COMMIT semantics. The no-op guards, the ISO formatting and the exact
//    callback contract (`newEnd` only when the event HAS an `end`; `newGroup`
//    only on a cross-resource drop) live here, next to the API they implement.

// Layout snapshot captured by the active grid at gesture start. `dayAt`/`groupAt`
// translate an absolute client x/y into a target column day + row/column group;
// `minuteAt` is set on the time axis only (Y → clock minute of the cursor day).
type Geometry = {
  /** Resolve the day under client X (day axis: week columns; time axis: the cursor day). */
  dayAt: (clientX: number) => Date | null;
  /** Resolve the group (row on day axis, column on time axis) under the client point. */
  groupAt: (clientX: number, clientY: number) => string | null;
  /** Time axis only: clock minute-of-day under client Y; null on the day axis. */
  minuteAt: ((clientY: number) => number) | null;
};

// What move() resolves and the grid renders as a live preview. `start`/`end` are
// the snapped destination dates; `group` the destination row/column; `mode` lets
// the grid pick the right overlay (a moved bar vs. a stretched edge).
type DragPreview = {
  id: string;
  group: string;
  start: Date;
  end: Date;
  allDay: boolean;
  mode: DragMode;
};

const ISO_T = "yyyy-MM-dd'T'HH:mm";

// The phantom-event id of a drag-to-create gesture (the anchor day/time and
// the anchor ROW live on the phantom; no real event carries this id).
const CREATE_ID = '__create__';

function useResourceDrag(
  onEventDrop?: (id: string, newStart: string, newEnd?: string, newGroup?: string) => void,
  onEventResize?: (id: string, newStart: string, newEnd: string) => void,
  onRangeCreate?: (start: Date, end: Date, group?: string) => void,
  dragSnapMinutes = 15,
) {
  // Resolve the live preview from the cursor. Pure geometry + date math; sets no
  // app state — only the local preview/highlight the grid paints. Returns the
  // snapped {group,start,end} or null when the cursor is off any column/row.
  // (Plain function, not useCallback: the core reads fresh options via optsRef.)
  const resolve = (g: DragGesture<ResourceEvent, Geometry>, clientX: number, clientY: number): DragPreview | null => {
    const day = g.geom.dayAt(clientX);
    const group = g.geom.groupAt(clientX, clientY);
    if (!day || group == null) return null;
    const ev = g.ev;
    const allDay = isAllDay(ev);

    if (g.mode === 'create') {
      // Drag-to-create: the phantom's `start` is the ANCHOR, its `group` the
      // resource ROW/COLUMN the gesture began in — a range is always drawn
      // FOR that resource (dragging into another row doesn't re-home it).
      const anchor = eventStart(ev);
      const minute = g.geom.minuteAt ? g.geom.minuteAt(clientY) : null;
      if (minute != null) {
        const cur = setMinutes(setHours(startOfDay(day), Math.floor(minute / 60)), Math.round(minute % 60));
        const lo = minDate([anchor, cur]);
        let hi = maxDate([anchor, cur]);
        const snap = Math.max(1, dragSnapMinutes);
        if (differenceInMinutes(hi, lo) < snap) hi = addMinutes(lo, snap);
        return { id: CREATE_ID, group: ev.group, start: lo, end: hi, allDay: false, mode: g.mode };
      }
      const a = startOfDay(anchor), d = startOfDay(day);
      return { id: CREATE_ID, group: ev.group, start: minDate([a, d]), end: maxDate([a, d]), allDay: true, mode: g.mode };
    }

    if (g.mode !== 'move') {
      // Resize: move only the dragged edge to the target DAY, keep the opposite
      // edge (group is irrelevant — a resize never changes the row).
      const curStart = startOfDay(eventStart(ev)), curEnd = startOfDay(eventEnd(ev));
      let ns = curStart, ne = curEnd;
      if (g.mode === 'resize-end') ne = maxDate([startOfDay(day), curStart]);
      else ns = minDate([startOfDay(day), curEnd]);
      return { id: ev.id, group: ev.group, start: ns, end: ne, allDay, mode: g.mode };
    }

    // Move: shift the whole booking by the grab-relative day delta (dropDay −
    // grabDay), NOT by snapping the start to the cursor day — otherwise a
    // multi-day bar grabbed in the middle jumps so it *starts* under the cursor.
    // The time axis (minute != null) is a single day, so the delta is 0 there and
    // the start follows the cursor minute (pre-snapped to dragSnapMinutes by the
    // grid's Geometry.minuteAt). group can change (cross-row).
    const minute = g.geom.minuteAt ? g.geom.minuteAt(clientY) : null;
    const deltaDays = g.grabDay ? differenceInCalendarDays(startOfDay(day), startOfDay(g.grabDay)) : 0;
    // Whole-day span length, preserved on a move — derived here since the
    // shared drag core (1.2.0) is no longer time-coupled.
    const days = Math.max(0, differenceInCalendarDays(eventEnd(ev), eventStart(ev)));
    const movedStart = addDays(eventStart(ev), deltaDays);
    const start = minute != null
      ? setMinutes(setHours(startOfDay(day), Math.floor(minute / 60)), Math.round(minute % 60))
      : allDay
        ? startOfDay(movedStart)
        : movedStart;   // day axis, timed: shift the day, keep the original clock time
    let end = start;
    if (ev.end) {
      end = minute != null
        ? addMinutes(start, differenceInMinutes(eventEnd(ev), eventStart(ev)))
        : allDay
          ? addDays(start, days)
          : setMinutes(setHours(addDays(start, days), getHours(eventEnd(ev))), getMinutes(eventEnd(ev)));
    }
    return { id: ev.id, group, start, end, allDay, mode: g.mode };
  };

  return usePointerDrag<ResourceEvent, Geometry, DragPreview>({
    moveEnabled: !!onEventDrop,
    resizeEnabled: !!onEventResize,
    createEnabled: !!onRangeCreate,
    grabDayAt: (geom, clientX) => geom.dayAt(clientX),
    resolve,
    targetKey: p => `${p.group}|${format(p.start, 'yyyy-MM-dd')}`,   // "{group}|{iso}" cell to highlight
    // Fire the callback iff the drop is valid AND a real change. No target / no
    // change → clean snap-back (the core already tore the gesture down).
    commit: (g, p) => {
      if (!p) return;
      const ev = g.ev;

      if (g.mode === 'create') {
        // DATES (like onEmptyClick) + the REAL resource key — the consumer
        // formats onto its field types and opens a prefilled create dialog.
        onRangeCreate?.(p.start, p.end, p.group);
        return;
      }

      if (g.mode !== 'move') {
        if (!onEventResize) return;
        // Carry the original clock time on each edge for a timed span (day-granular
        // resize never moves the time-of-day); plain date for an all-day span.
        const fmtEdge = (date: Date, ref: Date) => p.allDay
          ? format(date, 'yyyy-MM-dd')
          : format(setMinutes(setHours(date, getHours(ref)), getMinutes(ref)), ISO_T);
        const ns = fmtEdge(p.start, eventStart(ev));
        const ne = fmtEdge(p.end, eventEnd(ev));
        // No-op guard: edges unchanged.
        const curS = p.allDay ? format(startOfDay(eventStart(ev)), 'yyyy-MM-dd') : format(eventStart(ev), ISO_T);
        const curE = p.allDay ? format(startOfDay(eventEnd(ev)), 'yyyy-MM-dd') : format(eventEnd(ev), ISO_T);
        if (ns === curS && ne === curE) return;
        onEventResize(ev.id, ns, ne);
        return;
      }

      if (!onEventDrop) return;
      const sameGroup = p.group === ev.group;
      const startStr = p.allDay ? format(p.start, 'yyyy-MM-dd') : format(p.start, ISO_T);
      const curStartStr = p.allDay ? format(startOfDay(eventStart(ev)), 'yyyy-MM-dd') : format(eventStart(ev), ISO_T);
      if (sameGroup && startStr === curStartStr) return;   // no-op
      const endStr = ev.end ? (p.allDay ? format(p.end, 'yyyy-MM-dd') : format(p.end, ISO_T)) : undefined;
      onEventDrop(ev.id, startStr, endStr, sameGroup ? undefined : p.group);
    },
  });
}

type ResourceDrag = ReturnType<typeof useResourceDrag>;

// Only a pointerdown wires per-element now — move/up/cancel are on window. The
// grid supplies the Geometry snapshot so begin() can resolve targets by math.
function barDragProps(ev: ResourceEvent, dnd: ResourceDrag, geom: () => Geometry) {
  if (!dnd.active) return {};
  return {
    onPointerDown: (e: ReactPointerEvent) => { e.stopPropagation(); dnd.begin(ev, e, geom()); },
    // 'manipulation' (not 'none'): a quick touch swipe on a bar stays a native
    // SCROLL; the shared drag core arms the drag via long-press and then blocks
    // panning itself (non-passive touchmove). Mouse drags are unaffected.
    style: { touchAction: 'manipulation' as const, cursor: 'grab' as const },
  };
}

// ── Navigation + range (built-in toolbar; uncontrolled cursor) ──────────
// The day-axis occupancy plan navigates itself: prev/today/next step the cursor
// and a closed Range enum ('week' | '2weeks' | 'month') sets how many day columns
// are shown. This is an INTERNAL segment, NOT an open config object — the consumer
// passes nothing for it. (The time axis navigates ±1 day with no range switch.)

export type ResourceRange = 'week' | '2weeks' | 'month';
/** The day-axis range segment as a referenceable array (the toolbar order). */
export const RESOURCE_RANGES = ['week', '2weeks', 'month'] as const;

// How a prev/next step shifts the cursor and how the visible window is built,
// per range. Kept beside DayAxisGrid's `days` derivation so the two never drift.
function rangeDays(range: ResourceRange, cursor: Date, weekStartsOn: 0 | 1, weekDays: 5 | 7): Date[] {
  if (range === 'month') {
    return eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });
  }
  const start = startOfWeek(cursor, { weekStartsOn });
  const span = range === '2weeks' ? 14 : 7;
  const all = eachDayOfInterval({ start, end: addDays(start, span - 1) });
  // weekDays=5 applies to the WEEK range only: Mo–Fr stay CONTIGUOUS, so the
  // span/lane math keeps working on a plain 5-day window. 2weeks/month would
  // leave gaps (Fri→Mon) that break day-index arithmetic — they show all days.
  return weekDays === 5 && range === 'week' ? all.filter(d => d.getDay() !== 0 && d.getDay() !== 6) : all;
}
function stepCursor(range: ResourceRange, cursor: Date, dir: 1 | -1): Date {
  if (range === 'month') return addMonths(cursor, dir);
  if (range === '2weeks') return addWeeks(cursor, 2 * dir);
  return addWeeks(cursor, dir);
}
// Uniform column min-width per range — narrower as the window widens so a month
// still fits without horizontal scrolling on a normal screen. The columns stay
// UNIFORM (every column minmax(colMinPx, 1fr)) so the drag geometry (one rect's
// width / days.length) keeps resolving the right column in every range.
function rangeColMinPx(range: ResourceRange): number {
  if (range === 'month') return 48;
  if (range === '2weeks') return 110;
  return 160;
}

/** Readability floor per range — FIT-TO-WIDTH never squeezes below this.
 *  Span bars carry their titles across days, so day cells can go narrower
 *  than the classic minimums without losing information. */
function rangeColFloorPx(range: ResourceRange): number {
  if (range === 'month') return 40;
  if (range === '2weeks') return 56;
  return 88;
}

const RANGE_LABELS: Record<UiLocale, Record<ResourceRange, string>> = {
  de: { week: 'Woche', '2weeks': '2 Wochen', month: 'Monat' },
  en: { week: 'Week', '2weeks': '2 weeks', month: 'Month' },
};

// The widget's OWN chrome strings. Indexed at RENDER time (`RT_TEXTS[i18nLocale]`)
// — never hoisted into a module constant, or a language switch would not reach it.
const RT_TEXTS: Record<UiLocale, { prev: string; next: string; today: string; dismiss: string }> = {
  de: { prev: 'Zurück', next: 'Weiter', today: 'Heute', dismiss: 'Meldung schließen' },
  en: { prev: 'Back', next: 'Forward', today: 'Today', dismiss: 'Dismiss message' },
};

// Nights are a COUNTED noun: German has two forms, Czech three (1 noc,
// 2–4 noci, 5+ nocí) — so the plural rule lives in a function, not in a dict.
function nightsLabel(n: number, l: UiLocale): string {
  if (l === 'en') return `${n} ${n === 1 ? 'night' : 'nights'}`;
  return `${n} ${n === 1 ? 'Nacht' : 'Nächte'}`;
}

// The day-axis range label: a date span for week/2weeks, the month name otherwise.
function dayRangeTitle(range: ResourceRange, days: Date[], locale?: Locale, narrow = false): string {
  if (range === 'month') return format(days[0], 'MMMM yyyy', { locale });
  const first = days[0];
  const last = days[days.length - 1];
  // Compact on the phone toolbar: "8.–14. Juni" (no year, single month name).
  if (narrow) return `${format(first, 'd.', { locale })}–${format(last, 'd. MMM', { locale })}`;
  return `${format(first, 'd. MMM', { locale })} – ${format(last, 'd. MMM yyyy', { locale })}`;
}

type ResourceToolbarProps = {
  axis: 'time' | 'day';
  range: ResourceRange;
  onRangeChange: (r: ResourceRange) => void;
  title: string;
  onPrev: () => void;
  onToday: () => void;
  onNext: () => void;
  /** Phone toolbar: compact title row + full-width segment grid. */
  narrow?: boolean;
};

function ResourceToolbar({ axis, range, onRangeChange, title, onPrev, onToday, onNext, narrow = false }: ResourceToolbarProps) {
  const rt = RT_TEXTS[i18nLocale];
  const rangeLabels = RANGE_LABELS[i18nLocale];
  // Phone layout: nav row (title takes the free space, truncated) + the range
  // switch as a FULL-WIDTH segment grid — left-hugging pills next to dead
  // space read as unfinished on a phone.
  if (narrow) {
    // Same calm two-row phone toolbar as the calendar: joined nav segment
    // group (‹ | Heute | ›) + title, then the range switch at the SAME height.
    return (
      <div className="space-y-2 border-b border-input bg-secondary px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex h-8 shrink-0 items-stretch divide-x divide-input overflow-hidden rounded-full border border-input bg-card shadow-sm">
            <button type="button" onClick={onPrev} aria-label={rt.prev} className="flex w-9 items-center justify-center text-foreground active:bg-muted">
              <IconChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={onToday} className="px-3 text-[13px] font-medium text-foreground active:bg-muted">{rt.today}</button>
            <button type="button" onClick={onNext} aria-label={rt.next} className="flex w-9 items-center justify-center text-foreground active:bg-muted">
              <IconChevronRight className="h-4 w-4" />
            </button>
          </div>
          <h2 className="min-w-0 truncate text-sm font-semibold capitalize text-foreground">{title}</h2>
        </div>
        {axis === 'day' && (
          <div className="grid h-8 grid-cols-3 gap-0.5 rounded-full bg-muted p-0.5">
            {(['week', '2weeks', 'month'] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => onRangeChange(r)}
                className={`truncate rounded-full px-1 text-center text-[13px] font-medium transition-colors ${range === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {rangeLabels[r]}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-input bg-secondary px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrev} aria-label={rt.prev}>
          <IconChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={onToday}>{rt.today}</Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNext} aria-label={rt.next}>
          <IconChevronRight className="h-4 w-4" />
        </Button>
        <h2 className="ml-1 text-base font-semibold capitalize text-foreground">{title}</h2>
      </div>
      {axis === 'day' && (
        <div className="flex items-center gap-1 rounded-full bg-muted p-1">
          {(['week', '2weeks', 'month'] as const).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => onRangeChange(r)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${range === r ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {rangeLabels[r]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────

type ResourceTimelineProps = {
  events: ResourceEvent[];
  groups: ResourceGroup[];
  axis?: 'time' | 'day';
  referenceDate?: Date;
  defaultDate?: Date;
  dayStartHour?: number;
  dayEndHour?: number;
  /** Time axis: minute snap for empty-click and drag times (default 15).
   *  ONE scalar — slot-raster domains set it to the slot length (e.g. 20). */
  dragSnapMinutes?: number;
  /** Time axis: pixel height of one hour row. Default 48 — EXCEPT with
   *  renderEmptySlot, where it auto-scales so one slot cell is ≥40px tall
   *  (a 4-hour slot inventory must read like a hand-built day plan, not a
   *  squeezed hour grid). Set explicitly only to override that. */
  hourHeight?: number;
  locale?: Locale;
  weekStartsOn?: 0 | 1;
  /** Day axis, WEEK range only: 5 = working week (Sat+Sun hidden). Default 7. */
  weekDays?: 5 | 7;
  /** Default visible range on the day axis. Toggled in the built-in toolbar. */
  defaultRange?: ResourceRange;
  /** Fires when the BUILT-IN toolbar navigates (‹ / Heute / ›) with the date it
   *  wants to go to. Uncontrolled: informational. With controlled
   *  `referenceDate` this is the ONLY way the toolbar stays functional — update
   *  your state here (clamp/skip as you like, e.g. weekends). NEVER render a
   *  second prev/next bar around the widget. */
  onCursorChange?: (date: Date) => void;
  onEventClick?: (event: ResourceEvent) => void;
  /** Click EMPTY space → (date, opaque group key). Use to open a prefilled
   *  create dialog. `group` is optional in the type (family-wide signature,
   *  shared with CalendarWidget) but the resource timeline ALWAYS passes it —
   *  take both args. On 'day' the Date is the clicked day; on 'time' it carries
   *  the clicked CLOCK TIME (snapped to dragSnapMinutes). A click immediately
   *  after a drag is swallowed. */
  onEmptyClick?: (date: Date, group?: string) => void;
  onEventDrop?: (id: string, newStart: string, newEnd?: string, newGroup?: string) => WriteResult;
  onEventResize?: (id: string, newStart: string, newEnd: string) => WriteResult;
  onRangeCreate?: (start: Date, end: Date, group?: string) => void;
  renderEvent?: (event: ResourceEvent, meta: ResourceSegmentMeta) => ReactNode;
  renderGroupHeader?: (group: ResourceGroup) => ReactNode;
  /** TIME AXIS ONLY: render a node into every FREE dragSnapMinutes slot (free =
   *  no event of that column overlaps it). Turns the continuous hour canvas into
   *  a visible, bookable slot raster: sub-hour slot lines are drawn and a tap on
   *  the cell fires onEmptyClick with the slot's EXACT start time. The node gets
   *  the slot's full box — size it with w-full h-full. Ignored on the day axis. */
  renderEmptySlot?: (date: Date, group: string) => ReactNode;
  /** CSS class for the (resource × day) cell surface — tint only, never content. */
  cellClassName?: (date: Date, group: string) => string;
  className?: string;
  children?: ReactNode;
};

export function ResourceTimeline(props: ResourceTimelineProps) {
  const {
    events, groups, axis = 'time', dayStartHour = 7, dayEndHour = 21, dragSnapMinutes = 15, hourHeight, locale, weekStartsOn = 1, weekDays = 7,
    onCursorChange, onEventClick, onEmptyClick, onEventDrop, onEventResize, onRangeCreate, renderEvent, renderGroupHeader, renderEmptySlot, cellClassName, className, children,
  } = props;

  // Built-in navigation: the cursor is self-managed unless `referenceDate` is
  // passed (controlled). Uncontrolled is the norm here — the toolbar's
  // prev/today/next call setInternalCursor; when controlled, they no-op (the
  // owner drives the cursor). `range` is always internal (a closed segment).
  const [internalCursor, setInternalCursor] = useState<Date>(() => props.defaultDate ?? new Date());
  const cursor = props.referenceDate ?? internalCursor;
  const controlled = props.referenceDate != null;
  const [range, setRange] = useState<ResourceRange>(props.defaultRange ?? 'week');

  // The built-in toolbar computes the target date and reports it via
  // onCursorChange. Uncontrolled: it also moves the internal cursor itself.
  // Controlled (`referenceDate` passed): the OWNER moves the cursor — without
  // an onCursorChange handler the toolbar buttons would be dead.
  const navStep = useCallback((dir: 1 | -1) => {
    const next = axis === 'time' ? addDays(cursor, dir) : stepCursor(range, cursor, dir);
    onCursorChange?.(next);
    if (!controlled) setInternalCursor(next);
  }, [controlled, axis, range, cursor, onCursorChange]);
  const goToday = useCallback(() => {
    const next = new Date();
    onCursorChange?.(next);
    if (!controlled) setInternalCursor(next);
  }, [controlled, onCursorChange]);

  // Phone layout: below 480px CONTAINER width the resource-label column
  // shrinks, the horizontal scroll snaps per column, and the toolbar gets its
  // compact variant. Declared here because the toolbar title depends on it.
  const { ref: narrowRef, narrow, width: rootW } = useNarrowContainer();
  const coarse = useCoarsePointer();

  // The visible day columns drive the toolbar's range label (day axis only).
  const days = useMemo(() => rangeDays(range, cursor, weekStartsOn, weekDays), [range, cursor, weekStartsOn, weekDays]);

  // AUTO-FOCUS (day axis): when TODAY is inside the window but its column
  // sits beyond the visible scroll area (narrow screens, late weekdays), the
  // grid scrolls it into view on mount / window change — the sister mechanic
  // to the calendar's hour-grid focus. Navigating to other weeks (today not
  // in `days`) never snaps back.
  const daysKey = `${axis}|${range}|${days.length ? format(days[0], 'yyyy-MM-dd') : ''}`;
  useEffect(() => {
    if (axis !== 'day') return;
    const el = scrollerRef.current;
    if (!el || el.scrollWidth <= el.clientWidth + 1) return;
    const idx = days.findIndex(d => isToday(d));
    if (idx < 0) return;
    const resColPx = narrow ? 88 : RES_COL_PX;
    const colW = (el.scrollWidth - resColPx) / days.length;
    const colLeft = resColPx + idx * colW;
    if (colLeft + colW > el.scrollLeft + el.clientWidth || colLeft < el.scrollLeft + resColPx) {
      el.scrollLeft = Math.max(0, idx * colW);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, narrow]);
  const toolbarTitle = axis === 'time'
    ? format(cursor, narrow ? 'EEE, d. MMM' : 'EEEE, d. MMMM yyyy', { locale })
    : dayRangeTitle(range, days, locale, narrow);

  const safeEvents = useMemo(() => events.filter(e => !!e.start && isValid(parseISO(e.start)) && !!e.group), [events]);

  // Scroll hint: a fade edge marks the side where columns continue off-screen
  // (month range, many resources). Live-measured — gone at the end.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollHint, setScrollHint] = useState({ left: false, right: false });
  const measureScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 1;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setScrollHint(prev => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  useEffect(() => { measureScroll(); }, [measureScroll, axis, range, groups, cursor, weekDays]);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measureScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureScroll]);
  // Resize is day-granular (drag a bar's edge to another day) → wired on the
  // occupancy plan only; the time axis stays drag-to-reschedule. The time-axis
  // minute resolution now lives in the grid's Geometry.minuteAt, not the hook.
  // Rejection channel: a STRING returned from drop/resize blocks the gesture
  // and feeds the built-in notice; the drag hook sees void-returning wrappers.
  const reject = useRejectNotice();
  const guardedDrop = onEventDrop
    ? (id: string, newStart: string, newEnd?: string, newGroup?: string) => reject.capture(onEventDrop(id, newStart, newEnd, newGroup))
    : undefined;
  const guardedResize = onEventResize
    ? (id: string, newStart: string, newEnd: string) => reject.capture(onEventResize(id, newStart, newEnd))
    : undefined;
  const dnd = useResourceDrag(guardedDrop, axis === 'day' ? guardedResize : undefined, onRangeCreate, dragSnapMinutes);

  const ctx: GridContext = {
    events: safeEvents, groups, cursor, range, dayStartHour, dayEndHour, dragSnapMinutes, hourHeight, locale, weekStartsOn, weekDays,
    narrow, coarse, width: rootW,
    onEventClick, onEmptyClick, renderEvent, renderGroupHeader, renderEmptySlot, cellClassName, dnd,
  };

  return (
    <div ref={narrowRef} className={`flex flex-col gap-4${className ? ` ${className}` : ''}`}>
      {children}
      {/* Drag PROXY (family pattern, see primitives 1.6.0): the grabbed bar
          rides with the pointer; source stays dimmed, target preview stays. */}
      {dnd.draggingMode === 'move' && dnd.draggingId && (() => {
        const ev = safeEvents.find(e => e.id === dnd.draggingId);
        if (!ev) return null;
        return createPortal(
          <div ref={dnd.ghostRef} className="pointer-events-none fixed left-0 top-0 z-[var(--z-drag)] will-change-transform" aria-hidden>
            <div className={`flex max-w-[240px] items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold shadow-xl ring-1 ring-black/10 ${TONE_BAR[ev.tone ?? 'default']}`}>
              <span className="truncate">{ev.title}</span>
            </div>
          </div>,
          document.body,
        );
      })()}
      {/* FAMILY PRINCIPLE (mobile): the resource×time matrix is ONE surface —
          bars run across day columns, so the card keeps its side margins and
          rounding. Full-bleed + separate cards is the CONTAINER pattern
          (KanbanWidget, StatCardRow) only. */}
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
        <ResourceToolbar
          axis={axis}
          range={range}
          onRangeChange={setRange}
          title={toolbarTitle}
          onPrev={() => navStep(-1)}
          onToday={goToday}
          onNext={() => navStep(1)}
          narrow={narrow}
        />
        {reject.notice && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            <IconAlertCircle size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">{reject.notice}</span>
            <button type="button" onClick={reject.dismiss} aria-label={RT_TEXTS[i18nLocale].dismiss} className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/10">
              <IconX size={14} />
            </button>
          </div>
        )}
        <div className="relative">
          {scrollHint.left && <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-card to-transparent" aria-hidden />}
          {scrollHint.right && <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-card to-transparent" aria-hidden />}
          <div ref={scrollerRef} onScroll={measureScroll} className={`overflow-x-auto ${narrow && !dnd.draggingId ? 'snap-x snap-mandatory' : ''}`}>
            {axis === 'time' ? <TimeAxisGrid {...ctx} /> : <DayAxisGrid {...ctx} />}
          </div>
        </div>
      </div>
    </div>
  );
}

type GridContext = {
  events: ResourceEvent[];
  groups: ResourceGroup[];
  cursor: Date;
  range: ResourceRange;
  dayStartHour: number;
  dayEndHour: number;
  dragSnapMinutes: number;
  hourHeight?: number;
  locale?: Locale;
  weekStartsOn: 0 | 1;
  weekDays: 5 | 7;
  /** Container below 480px → phone layout (narrow labels, snap paging). */
  narrow: boolean;
  /** The root's measured content width — drives the day-axis column fit. */
  width: number;
  /** Coarse pointer (finger) → resize edge-zones grow to touch-target size. */
  coarse: boolean;
  onEventClick?: (event: ResourceEvent) => void;
  onEmptyClick?: (date: Date, group?: string) => void;
  renderEvent?: (event: ResourceEvent, meta: ResourceSegmentMeta) => ReactNode;
  renderGroupHeader?: (group: ResourceGroup) => ReactNode;
  renderEmptySlot?: (date: Date, group: string) => ReactNode;
  cellClassName?: (date: Date, group: string) => string;
  dnd: ReturnType<typeof useResourceDrag>;
};

function GroupHeaderCell({ group, ctx }: { group: ResourceGroup; ctx: GridContext }) {
  // snap-start + scroll-margin (time axis): a snapped resource column lands
  // next to the sticky hour gutter, never underneath it.
  if (ctx.renderGroupHeader) return <div style={{ scrollMarginLeft: '4rem' }} className="snap-start px-3 py-2 border-l border-border first:border-l-0">{ctx.renderGroupHeader(group)}</div>;
  const tone = group.tone ?? 'default';
  return (
    <div style={{ scrollMarginLeft: '4rem' }} className="snap-start flex items-center gap-2 px-3 py-2 border-l border-border first:border-l-0">
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[tone]}`} />
      <span className="truncate text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{group.label}</span>
    </div>
  );
}

function EventChip({ ev, meta, ctx, geom }: { ev: ResourceEvent; meta: ResourceSegmentMeta; ctx: GridContext; geom: () => Geometry }) {
  const tone = ev.tone ?? 'default';
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (ctx.dnd.consumeClick()) return; ctx.onEventClick?.(ev); }}
      {...barDragProps(ev, ctx.dnd, geom)}
      className={`flex h-full w-full flex-col justify-center overflow-hidden rounded-md px-1.5 py-0.5 text-left ${ctx.narrow ? 'text-[13px]' : 'text-xs'} ${TONE_BAR[tone]} ${ctx.dnd.draggingId === ev.id ? 'opacity-50' : ''} ${meta.isStart ? 'rounded-l-md' : 'rounded-l-none'} ${meta.isEnd ? 'rounded-r-md' : 'rounded-r-none'}`}
    >
      {ctx.renderEvent ? ctx.renderEvent(ev, meta) : (
        <>
          <span className="block truncate font-medium">{ev.title}</span>
          {ev.subtitle != null && ev.subtitle !== '' && meta.isStart && <span className="block truncate opacity-80">{ev.subtitle}</span>}
        </>
      )}
    </button>
  );
}

// One continuous occupancy bar spanning its day columns within a resource row.
// Title + subtitle render ONCE (truncated), tone-coloured; the clipped edges drop
// their radius so a continuation reads as one band. Resize edge-zones (~6px) are
// rendered only when onEventResize is wired — the "OFF until passed" idiom. The
// body dims to ~30% while THIS bar drags — the live PreviewBar stands in for it
// at the destination, so the move reads as one bar, not a double-image.
function SpanBar({ ev, meta, ctx, geom }: { ev: ResourceEvent; meta: ResourceSegmentMeta; ctx: GridContext; geom: () => Geometry }) {
  const tone = ev.tone ?? 'default';
  const dnd = ctx.dnd;
  return (
    <div className={`relative h-full w-full ${dnd.draggingId === ev.id ? 'opacity-30' : ''}`}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (dnd.consumeClick()) return; ctx.onEventClick?.(ev); }}
        {...barDragProps(ev, dnd, geom)}
        className={`flex h-full w-full items-center px-2 text-left ${ctx.narrow ? 'text-[13px]' : 'text-xs'} ${TONE_BAR[tone]} ${meta.isStart ? 'rounded-l-md' : 'rounded-l-none'} ${meta.isEnd ? 'rounded-r-md' : 'rounded-r-none'}`}
      >
        {ctx.renderEvent ? ctx.renderEvent(ev, meta) : (
          /* STICKY label (Google mechanic): when the bar's start scrolls past
             the left edge, the title rides along inside the visible part —
             an occupied row must never read anonymous. sticky clamps within
             the bar, so it stops at the bar's end; `left` clears the sticky
             resource-label column. (No overflow-hidden on the button — it
             would trap the sticky; truncate + max-w-full do the clipping.) */
          <span
            className="sticky flex min-w-0 max-w-full flex-col leading-tight"
            style={{ left: (ctx.narrow ? 88 : RES_COL_PX) + 8 }}
          >
            <span className="truncate font-medium">{ev.title}</span>
            {ev.subtitle != null && ev.subtitle !== '' && <span className="truncate text-[11px] opacity-80">{ev.subtitle}</span>}
          </span>
        )}
      </button>
      {dnd.resizable && (
        <>
          {meta.isStart && (
            <span
              onPointerDown={(e) => { e.stopPropagation(); dnd.begin(ev, e, geom(), 'resize-start'); }}
              className={`absolute inset-y-0 left-0 ${ctx.coarse ? 'w-4' : 'w-2'} cursor-ew-resize`} style={{ touchAction: 'manipulation' }} aria-hidden
            />
          )}
          {meta.isEnd && (
            <span
              onPointerDown={(e) => { e.stopPropagation(); dnd.begin(ev, e, geom(), 'resize-end'); }}
              className={`absolute inset-y-0 right-0 ${ctx.coarse ? 'w-4' : 'w-2'} cursor-ew-resize`} style={{ touchAction: 'manipulation' }} aria-hidden
            />
          )}
        </>
      )}
    </div>
  );
}

// A ResourceEvent placed at the preview's destination, so the target row can
// lane-pack it WITH its other bookings and the preview lands in its true lane
// (incl. a cross-resource move into another row). Carries the source title/tone.
function previewToEvent(p: DragPreview, events: ResourceEvent[]): ResourceEvent {
  const src = events.find(e => e.id === p.id);
  return {
    id: p.id,
    title: src?.title ?? '',
    tone: src?.tone,
    group: p.group,
    allDay: p.allDay,
    start: format(p.start, p.allDay ? 'yyyy-MM-dd' : ISO_T),
    end: format(p.end, p.allDay ? 'yyyy-MM-dd' : ISO_T),
  };
}

// Translucent stand-in bar painted at the live destination during a day-axis
// gesture. For a move it shows WHERE the booking lands; for a resize it shows the
// new extent + a size label ("N Nächte" / date range) so the change reads at a
// glance. Lives inside a resource row's span area, so it speaks the same %-grid.
function PreviewBar({ p, days, tone, lane }: { p: DragPreview; days: Date[]; tone: ResourceTone; lane: number }) {
  const weekStart = startOfDay(days[0]);
  const weekEnd = startOfDay(days[days.length - 1]);
  const segStart = maxDate([startOfDay(p.start), weekStart]);
  const segEnd = minDate([startOfDay(p.end), weekEnd]);
  const colStart = differenceInCalendarDays(segStart, weekStart);
  const span = Math.max(1, differenceInCalendarDays(segEnd, segStart) + 1);
  const nights = Math.max(1, differenceInCalendarDays(startOfDay(p.end), startOfDay(p.start)));
  const label = p.allDay
    ? nightsLabel(nights, i18nLocale)
    : `${format(p.start, 'd. MMM')} – ${format(p.end, 'd. MMM')}`;
  return (
    <div
      className="pointer-events-none absolute z-30"
      style={{
        top: ROW_PAD_PX / 2 + lane * LANE_PX,
        height: LANE_PX - 4,
        left: `calc(${(colStart / days.length) * 100}% + 2px)`,
        width: `calc(${(span / days.length) * 100}% - 4px)`,
      }}
    >
      <div className={`flex h-full w-full items-center gap-1.5 overflow-hidden rounded-md border-2 border-dashed border-primary px-2 text-xs font-semibold ${TONE_BAR[tone]}`}>
        <span className="shrink-0 rounded bg-primary px-1 py-0.5 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">{label}</span>
      </div>
    </div>
  );
}

// ── Time axis: hour grid, one column per group ──────────────────────────

// The classic red current-time line across the time-axis body. Pure
// presentation over the shared useNow tick; hidden outside the hour window.
function RtNowLine({ now, dayStartHour, hoursCount, hourPx }: { now: Date; dayStartHour: number; hoursCount: number; hourPx: number }) {
  const minutes = (getHours(now) - dayStartHour) * 60 + getMinutes(now);
  if (minutes < 0 || minutes > hoursCount * 60) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (minutes / 60) * hourPx }} aria-hidden>
      <div className="relative h-px bg-destructive">
        <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-destructive" />
      </div>
    </div>
  );
}

function TimeAxisGrid(ctx: GridContext) {
  const { events, groups, cursor, dayStartHour, dayEndHour, dragSnapMinutes, hourHeight, locale, renderEmptySlot } = ctx;
  const now = useNow();
  const hours = useMemo(() => Array.from({ length: Math.max(1, dayEndHour - dayStartHour) }, (_, i) => dayStartHour + i), [dayStartHour, dayEndHour]);
  const windowMin = hours.length * 60;
  const iso = format(cursor, 'yyyy-MM-dd');
  const gridCols = `4rem repeat(${groups.length}, minmax(${MIN_COL_PX}px, 1fr))`;

  // Slot raster (renderEmptySlot only). ONE scalar drives click-snap, drag-snap
  // AND the visible raster: the column divides into dragSnapMinutes cells
  // (floored at 5 min so a tiny snap can't explode the DOM). Offsets are minutes
  // from the column's start hour — the same semantic space as PackedEvent.
  const hasSlotRaster = !!renderEmptySlot;
  const slotMinutes = Math.max(5, dragSnapMinutes);

  // Row density. Default 48px/h — but a slot inventory (renderEmptySlot) auto-
  // scales so ONE SLOT CELL is ≥40px tall: a 4-hour booking window must read
  // like a hand-built day plan (comfortable click targets, two-line chips), not
  // a squeezed ribbon where a 20-min cell is 14px. `hourHeight` overrides both.
  const hourPx = hourHeight ?? (hasSlotRaster ? Math.max(HOUR_PX, Math.ceil((40 * 60) / slotMinutes)) : HOUR_PX);
  const slotOffsets = useMemo(
    () => hasSlotRaster
      ? Array.from({ length: Math.floor(((dayEndHour - dayStartHour) * 60) / slotMinutes) }, (_, i) => i * slotMinutes)
      : [],
    [hasSlotRaster, dayStartHour, dayEndHour, slotMinutes],
  );
  const slotBase = setMinutes(setHours(startOfDay(cursor), dayStartHour), 0);

  // Live layout refs: the hour-grid body (for Y → minute) and one node per group
  // column (for X → group). Read at gesture start, so geometry is always fresh.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Geometry snapshot for the time axis: the day is fixed (the cursor day); the
  // group comes from whichever column rect holds X; the minute from Y inside the
  // hour body, snapped to dragSnapMinutes. No elementFromPoint.
  const geom = useCallback((): Geometry => ({
    dayAt: () => startOfDay(cursor),
    groupAt: (clientX) => {
      for (const [key, el] of Array.from(colRefs.current.entries())) {
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX < r.right) return key;
      }
      return null;
    },
    minuteAt: (clientY) => {
      const top = bodyRef.current?.getBoundingClientRect().top ?? 0;
      const raw = (Math.max(0, clientY - top) / hourPx) * 60;
      const snap = Math.max(1, dragSnapMinutes);
      return Math.round(raw / snap) * snap + dayStartHour * 60;
    },
  }), [cursor, dayStartHour, dragSnapMinutes, hourPx]);

  const preview = ctx.dnd.preview;

  return (
    <div className="select-none" style={{ minWidth: 4 * 16 + groups.length * MIN_COL_PX }}>
      {/* Day label + group headers */}
      <div className="grid border-b border-input bg-secondary" style={{ gridTemplateColumns: gridCols }}>
        <div className="sticky left-0 z-20 bg-secondary px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{format(cursor, 'EEE d.', { locale })}</div>
        {groups.map(g => <GroupHeaderCell key={g.key} group={g} ctx={ctx} />)}
      </div>
      {/* Hour grid */}
      <div ref={bodyRef} className="relative grid" style={{ gridTemplateColumns: gridCols }}>
        {isToday(cursor) && <RtNowLine now={now} dayStartHour={dayStartHour} hoursCount={hours.length} hourPx={hourPx} />}
        {/* Hour labels — sticky like the day-axis resource labels, so the time
            gutter survives horizontal scrolling through the resource columns. */}
        <div className="sticky left-0 z-10 flex flex-col bg-card">
          {hours.map(h => <div key={h} className="pr-2 text-right text-[11px] tabular-nums text-muted-foreground" style={{ height: hourPx }}>{String(h).padStart(2, '0')}:00</div>)}
        </div>
        {groups.map(g => {
          const cellId = `${g.key}|${iso}`;
          const isTarget = ctx.dnd.dropTarget === cellId;
          const timed = events.filter(ev => ev.group === g.key && !isAllDay(ev) && occursOn(ev, cursor)).sort(eventOrder);
          const packed = packColumn(timed, cursor, dayStartHour);
          // Live move preview: a translucent chip at the snapped time in this column.
          const showPreview = preview && preview.group === g.key;
          const previewTop = preview ? (differenceInMinutes(preview.start, setMinutes(setHours(startOfDay(cursor), dayStartHour), 0)) / 60) * hourPx : 0;
          const previewHeight = preview ? Math.max(18, (differenceInMinutes(preview.end, preview.start) / 60) * hourPx) : 18;
          return (
            <div
              key={g.key}
              ref={(el) => { if (el) colRefs.current.set(g.key, el); else colRefs.current.delete(g.key); }}
              data-rt-cell={cellId}
              // Drag-to-create: pointerdown on EMPTY column space starts a
              // 'create' gesture anchored at the snapped clock time in THIS
              // resource column (chips/slot nodes don't stopPropagation their
              // pointerdown on purpose — drawing across the raster works).
              onPointerDown={ctx.dnd.creatable ? (e) => {
                const minute = geom().minuteAt!(e.clientY);
                const anchor = setMinutes(setHours(startOfDay(cursor), Math.floor(minute / 60)), minute % 60);
                ctx.dnd.begin({ id: '__create__', group: g.key, start: format(anchor, ISO_T), title: '' }, e, geom(), 'create');
              } : undefined}
              className={`relative border-l border-border ${isTarget ? 'ring-2 ring-inset ring-primary/60' : ''} ${ctx.onEmptyClick ? 'cursor-pointer' : ''} ${ctx.cellClassName?.(startOfDay(cursor), g.key) ?? ''}`}
              style={{ height: hours.length * hourPx }}
              // Empty-slot click carries the clicked CLOCK TIME (family parity with
              // the calendar's hour grid): Y → minute via the same snapped geometry
              // the drag uses, so click and drop can never disagree on the raster.
              // Chip clicks stopPropagation; a click right after a drag is swallowed.
              onClick={ctx.onEmptyClick ? (e) => {
                if (ctx.dnd.consumeClick()) return;
                const minute = geom().minuteAt!(e.clientY);
                ctx.onEmptyClick!(setMinutes(setHours(startOfDay(cursor), Math.floor(minute / 60)), minute % 60), g.key);
              } : undefined}
            >
              {hours.map(h => <div key={h} className="border-b border-border/60" style={{ height: hourPx }} aria-hidden />)}
              {/* Slot raster (renderEmptySlot): hairlines on every sub-hour slot
                  boundary, then the consumer's node in every FREE slot (free =
                  no event of THIS column overlaps it). The cell's own click
                  fires onEmptyClick with the slot's EXACT start — bypassing the
                  column's rounded Y handler, which could round a lower-half
                  click into the NEXT slot. Chips render later in the DOM, so
                  occupied areas stay on top. */}
              {hasSlotRaster && slotOffsets.map(off => (off % 60 !== 0 &&
                <div key={`line-${off}`} className="pointer-events-none absolute inset-x-0 border-t border-border/40" style={{ top: (off / 60) * hourPx }} aria-hidden />
              ))}
              {hasSlotRaster && slotOffsets.map(off => {
                const occupied = packed.some(p => p.minuteOffset < off + slotMinutes && p.minuteOffset + p.durationMinutes > off);
                if (occupied) return null;
                const slotDate = addMinutes(slotBase, off);
                return (
                  <div
                    key={`slot-${off}`}
                    className="absolute inset-x-1 flex"
                    style={{ top: (off / 60) * hourPx + 1, height: (slotMinutes / 60) * hourPx - 2 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (ctx.dnd.consumeClick()) return;
                      ctx.onEmptyClick?.(slotDate, g.key);
                    }}
                  >
                    {renderEmptySlot!(slotDate, g.key)}
                  </div>
                );
              })}
              {packed.map(p => {
                // Clamp to the visible window: an event before dayStartHour /
                // after dayEndHour must not paint at a negative offset (under
                // the header) or below the grid. Fully outside → not rendered.
                // The wrapper CLIPS (overflow-hidden): a 20-min chip is exactly
                // 20 minutes tall — overflowing text never covers later slots.
                const visStart = Math.max(0, p.minuteOffset);
                const visEnd = Math.min(windowMin, p.minuteOffset + p.durationMinutes);
                if (visEnd <= visStart) return null;
                return (
                  <div
                    key={p.ev.id}
                    className="absolute overflow-hidden"
                    // minutes → pixels lives in the renderer (the primitive stays semantic).
                    style={{ top: (visStart / 60) * hourPx, height: Math.max(18, ((visEnd - visStart) / 60) * hourPx), left: `calc(${(p.col / p.cols) * 100}% + 2px)`, width: `calc(${(1 / p.cols) * 100}% - 4px)` }}
                  >
                    <EventChip ev={p.ev} meta={FULL_META} ctx={ctx} geom={geom} />
                  </div>
                );
              })}
              {showPreview && (
                <div
                  className="pointer-events-none absolute inset-x-1 z-30 flex items-start overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/15 px-1.5 py-0.5"
                  style={{ top: Math.max(0, previewTop), height: previewHeight }}
                >
                  <span className="rounded bg-primary px-1 py-0.5 text-[10px] font-bold leading-none text-primary-foreground tabular-nums">{preview!.mode === 'create' ? `${format(preview!.start, 'HH:mm')}–${format(preview!.end, 'HH:mm')}` : format(preview!.start, 'HH:mm')}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Day axis: the occupancy plan (resources = rows, days = columns) ──────
// The classic "Belegungsplan": one row per resource, the visible week as day
// columns, and each booking as ONE continuous bar across its day span (clipped
// to the week, lane-packed when bookings in the same row overlap). This is the
// calendar's MonthWeekRow transposed — a row is a resource, not a week.

function DayAxisGrid(ctx: GridContext) {
  const { events, groups, cursor, range, locale, weekStartsOn } = ctx;
  // The visible day columns follow the toolbar's range (week = 7, 2weeks = 14,
  // month = the calendar month). Built by the shared `rangeDays` so the toolbar
  // label and this grid can never disagree. Columns stay UNIFORM width so the
  // drag geometry (one row rect ÷ days.length) keeps resolving the right column.
  const days = useMemo(() => rangeDays(range, cursor, weekStartsOn, ctx.weekDays), [range, cursor, weekStartsOn, ctx.weekDays]);
  const weekStart = days[0];
  const weekEnd = days[days.length - 1];
  const isMonth = range === 'month';
  const colMinPx = rangeColMinPx(range);
  // Phone layout: the label column shrinks to ~88px (sticky) and the day
  // columns size to "THREE days must fit" — measured from the container
  // width, clamped 72–112px (the sticky bar labels carry the names, so
  // narrow cells lose nothing). Month keeps its compact overview columns.
  // Desktop: FIT-TO-WIDTH — the whole range should be visible WITHOUT
  // horizontal scrolling. The column minimum yields to the measured container
  // width (sister mechanic to the calendar's fit-to-viewport), clamped at a
  // per-range readability floor; only below the floor does the grid scroll
  // (and today's column auto-focuses).
  const resColPx = ctx.narrow ? 88 : RES_COL_PX;
  const fitColPx = ctx.width > 0 ? Math.floor((ctx.width - resColPx) / Math.max(1, days.length)) : colMinPx;
  const threeDayPx = Math.max(72, Math.min(112, Math.floor(((ctx.width || 360) - resColPx) / 3)));
  const effColMinPx = ctx.narrow
    ? (isMonth ? Math.min(colMinPx, 112) : threeDayPx)
    : Math.max(rangeColFloorPx(range), Math.min(colMinPx, fitColPx));
  const gridCols = `${resColPx}px repeat(${days.length}, minmax(${effColMinPx}px, 1fr))`;
  const minWidth = resColPx + days.length * effColMinPx;

  // Live layout refs: one span-area node per resource row, read at gesture start.
  // dayAt() maps X → day column (the columns are uniform, so a single rect's
  // left/width drives the math); groupAt() maps Y → the row whose rect holds it.
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const geom = useCallback((): Geometry => {
    const rows = Array.from(rowRefs.current.entries());
    return {
      dayAt: (clientX) => {
        const first = rows[0]?.[1];
        if (!first) return null;
        const r = first.getBoundingClientRect();
        if (r.width <= 0) return null;
        const col = Math.floor(((clientX - r.left) / r.width) * days.length);
        return addDays(weekStart, Math.min(days.length - 1, Math.max(0, col)));
      },
      groupAt: (_clientX, clientY) => {
        for (const [key, el] of rows) {
          const r = el.getBoundingClientRect();
          if (clientY >= r.top && clientY < r.bottom) return key;
        }
        return null;
      },
      minuteAt: null,
    };
  }, [days.length, weekStart]);

  const preview = ctx.dnd.preview;
  // Tone of the dragged event (for the preview bar) — found across ALL rows so a
  // cross-resource move keeps its colour even when it lands in another row.
  const previewTone = preview ? (events.find(e => e.id === preview.id)?.tone ?? 'primary') : 'primary';

  return (
    <div className="select-none" style={{ minWidth }}>
      {/* Header: sticky corner + day columns */}
      <div className="grid border-b border-input bg-secondary" style={{ gridTemplateColumns: gridCols }}>
        <div className="sticky left-0 z-20 bg-secondary px-3 py-2 text-xs font-semibold uppercase tracking-wider text-secondary-foreground">&nbsp;</div>
        {days.map(day => (
          // snap-start + scroll-margin: a snapped day lands NEXT TO the sticky
          // label column, never underneath it.
          <div key={format(day, 'yyyy-MM-dd')} style={{ scrollMarginLeft: resColPx }} className={`snap-start border-l border-border text-center ${isMonth ? 'px-0.5 py-1' : 'px-2 py-2'} ${isToday(day) ? 'bg-primary/10' : ''}`}>
            <div className={`uppercase tracking-wider text-muted-foreground ${isMonth ? 'text-[9px] leading-none' : (ctx.narrow ? 'text-[11px]' : 'text-[10px]')}`}>{format(day, isMonth ? 'EEEEE' : 'EEE', { locale })}</div>
            <div className={`font-semibold ${isMonth ? 'text-xs' : 'text-sm'} ${isToday(day) ? 'text-primary' : 'text-foreground'}`}>{format(day, 'd', { locale })}</div>
          </div>
        ))}
      </div>
      {/* One row per resource */}
      {groups.map(g => {
        const groupEvents = events.filter(ev => ev.group === g.key);
        const { bars, lanes } = packLanes(groupEvents, weekStart, weekEnd);
        // If this row is the gesture target, lane-pack it WITH the preview (the
        // dragged event substituted at its destination) → the preview lands in its
        // real lane (not always lane 0) and the row grows if it needs one more.
        const isPreviewRow = !!preview && preview.group === g.key;
        const previewPack = isPreviewRow
          ? packLanes([...groupEvents.filter(e => e.id !== preview.id), previewToEvent(preview, events)], weekStart, weekEnd)
          : null;
        const previewLane = previewPack ? (previewPack.bars.find(b => b.ev.id === preview!.id)?.lane ?? 0) : 0;
        const effLanes = previewPack ? Math.max(lanes, previewPack.lanes) : lanes;
        const rowHeight = Math.max(LANE_PX, effLanes * LANE_PX) + ROW_PAD_PX;
        return (
          <div key={g.key} className="grid border-b border-border last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
            {/* Sticky resource label (compact on the phone layout — smaller
                type + tighter gap so "Zimmer 101" still fits 88px). */}
            <div className={`sticky left-0 z-10 flex items-center bg-card py-2 border-r border-border ${ctx.narrow ? 'gap-1 px-1.5' : 'gap-2 px-3'}`}>
              {ctx.renderGroupHeader ? ctx.renderGroupHeader(g) : (
                <>
                  <span className={`shrink-0 rounded-full ${ctx.narrow ? 'h-1.5 w-1.5' : 'h-2.5 w-2.5'} ${TONE_DOT[g.tone ?? 'default']}`} />
                  <span className={`truncate font-medium text-foreground ${ctx.narrow ? 'text-[11px]' : 'text-sm'}`}>{g.label}</span>
                </>
              )}
            </div>
            {/* Span area: day-cell backdrop (highlight only) + lane-packed bars.
                The span-area node is the geometry anchor (rowRefs) — the drag
                FSM resolves day+row from its rect, not from elementFromPoint, so
                the absolutely-stacked bars never swallow the hit-test. Bars carry
                their own ROW_PAD_PX/2 top offset (container padding can't move
                absolutely-positioned children). */}
            <div
              ref={(el) => { if (el) rowRefs.current.set(g.key, el); else rowRefs.current.delete(g.key); }}
              className="relative"
              style={{ gridColumn: '2 / -1', height: rowHeight }}
            >
              {/* Day cells: the visible column dividers + drop-target highlight.
                  When onEmptyClick is wired the empty cell becomes a button (new
                  booking at this resource+day); the bars sit ABOVE it (z-order),
                  so a click on a bar is onEventClick and a click on empty space is
                  onEmptyClick. A click fired right after a drag is swallowed. */}
              <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
                {days.map(day => {
                  const cellId = `${g.key}|${format(day, 'yyyy-MM-dd')}`;
                  const isTarget = ctx.dnd.dropTarget === cellId;
                  const clickable = !!ctx.onEmptyClick;
                  return (
                    <div
                      key={cellId}
                      onClick={clickable ? () => { if (ctx.dnd.consumeClick()) return; ctx.onEmptyClick!(day, g.key); } : undefined}
                      // Drag-to-create: drag across day cells IN THIS ROW →
                      // a day range for this resource (bars stopPropagation,
                      // so they never reach the backdrop cell).
                      onPointerDown={ctx.dnd.creatable ? (e) => {
                        ctx.dnd.begin({ id: '__create__', group: g.key, start: format(day, 'yyyy-MM-dd'), allDay: true, title: '' }, e, geom(), 'create');
                      } : undefined}
                      role={clickable ? 'button' : undefined}
                      aria-label={clickable ? `Neuer Eintrag — ${groupAriaLabel(g)}, ${format(day, 'd. MMMM yyyy', { locale })}` : undefined}
                      aria-hidden={clickable ? undefined : true}
                      className={`border-l border-border first:border-l-0 ${isToday(day) ? 'bg-primary/5' : ''} ${isTarget ? 'bg-primary/15 ring-2 ring-inset ring-primary/60' : ''} ${clickable ? 'cursor-pointer hover:bg-primary/5' : ''} ${ctx.cellClassName?.(day, g.key) ?? ''}`}
                    />
                  );
                })}
              </div>
              {/* Continuous bars, lane-packed, clipped to the visible week */}
              {bars.map((b, i) => (
                <div
                  key={`${b.ev.id}-${i}`}
                  className="absolute"
                  style={{
                    top: ROW_PAD_PX / 2 + b.lane * LANE_PX,
                    height: LANE_PX - 4,
                    left: `calc(${(b.colStart / days.length) * 100}% + 2px)`,
                    width: `calc(${(b.span / days.length) * 100}% - 4px)`,
                  }}
                >
                  <SpanBar ev={b.ev} meta={{ isStart: b.isStart, isEnd: b.isEnd, isContinuation: !b.isStart }} ctx={ctx} geom={geom} />
                </div>
              ))}
              {/* Live preview: the translucent destination bar (move) or stretched
                  edge (resize) + size label, painted in the target row only. */}
              {isPreviewRow && preview && (
                <PreviewBar p={preview} days={days} tone={previewTone} lane={previewLane} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── State wrappers (Skeleton / Error — empty is the in-place grid) ──────

export function ResourceTimelineSkeleton() {
  return (
    <div className="rounded-[27px] bg-card shadow-lg overflow-hidden animate-pulse" aria-busy="true">
      <div className="grid border-b border-input bg-secondary" style={{ gridTemplateColumns: '4rem repeat(4, minmax(0, 1fr))' }}>
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="px-3 py-2"><div className="h-3 w-16 rounded bg-muted" /></div>)}
      </div>
      <div className="grid" style={{ gridTemplateColumns: '4rem repeat(4, minmax(0, 1fr))' }}>
        {Array.from({ length: 5 }).map((_, c) => (
          <div key={c} className="flex flex-col gap-2 border-l border-border p-2 first:border-l-0">
            {Array.from({ length: 6 }).map((_, r) => <div key={r} className={`h-6 rounded bg-muted ${(c + r) % 3 === 0 ? 'opacity-100' : 'opacity-40'}`} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

type ResourceTimelineErrorProps = {
  error: Error | string;
  title?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ComponentType<{ size?: number | string; stroke?: number | string }>;
  className?: string;
};

export function ResourceTimelineError({ error, title = 'Belegung konnte nicht geladen werden', onRetry, retryLabel = 'Erneut versuchen', icon: Icon = IconAlertCircle, className }: ResourceTimelineErrorProps) {
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
