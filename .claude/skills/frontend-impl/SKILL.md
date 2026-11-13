---
name: frontend-impl
description: |
  Activate this skill when:
  - Building DashboardOverview.tsx
  - Writing React/TypeScript code
  - Integrating with Living Apps API
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Frontend Implementation Skill

Build a **production-ready, domain-specific dashboard** as the app's primary workspace.

---

## Step 1: Analyze and Decide (MANDATORY — before any code)

Read `.scaffold_context` (plus the `.scaffold_files_p*` parts it lists — one Read each) and `app_metadata.json`. Then write 1-2 sentences describing:

1. **What is the best UI paradigm for the user's core workflow?**
2. **Why is this the most natural way to interact with THIS data?**

Use this table to guide your choice:

| Data Nature | Best UI Paradigm |
|-------------|-----------------|
| Time-based / scheduled entries | Calendar, week planner, timeline |
| Status-based / workflow stages | Kanban board, progress pipeline |
| Quantitative / goal-tracking | Progress rings, gauges, trend charts |
| Hierarchical / categorized | Grouped sections, nested views |
| Sequential / step-by-step | Stepper, checklist, flow view |
| Relational / many linked items | Master-detail, linked cards |

**Layout: compose `<DashboardGrid>` — never hand-roll the page skeleton.**
```tsx
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';

// tx = mark your German text once; the pipeline translates it (never write makeT tables)
<DashboardGrid
  hero={überfällig.length > 0 && (
    <HeroBanner icon={<IconAlertTriangle size={18} />} action={{ label: tx('Fertig melden'), onClick: () => advance(überfällig[0]) }}>
      <b>{namen(überfällig.map(r => r.kundeName ?? ''))}</b> — {tx('Überfällig')}: {formatDate(überfällig[0].fields.faellig)}.
    </HeroBanner>
  )}
  kpis={<StatCardRow>…2–4 StatCards…</StatCardRow>}
  aside={<WorkList title={tx('Heute fällig')} items={…} onItemClick={id => overlay.replace({ id })} empty={{ text: …, action: … }} />}
  primary={<KanbanWidget … />}
/>
```
Grid ratios, mobile order (work list before the board) and the staggered entrance come WITH the component — do not re-add `order-`/`animate-` classes around the slots. The page header (greeting + context line + primary action) stays above the grid. The aside surface needs its OWN slice — never the widget's records re-rendered beside it; no secondary slice in the data? Omit `aside` and give the widget more height. Full prop docs: the "Component API cheatsheet" section in `.scaffold_context` (the file headers, inlined) — do not Read these component files.

**For the time-based row — do NOT hand-roll a calendar/week grid.** Compose the pre-generated **`CalendarWidget`** (read `src/components/widgets/CalendarWidget.tsx` once, then **copy the wiring from `CalendarWidget.example.tsx` — the example is the only code guaranteed to compile, including the correct named imports**). It owns the date maths, multi-day bars, overflow and ghost-drag; `view="week"` auto-adapts (all-day data → day-column planner board; timed data → hour grid). **Appointment/practice domains default to `view="week"` (+ `weekDays={5}` for office hours)** — the week hour grid IS the work surface; a month grid hides the time structure and shows mostly empty cells.

**Wire it RICHLY — a bare composition feels worse than a hand-rolled grid, so do ALL of these:**
- **Navigation is BUILT IN** (like `ResourceTimeline`): the widget renders its own prev/next/today + view-switch toolbar and self-manages cursor/view — do nothing to get it. Hide it with `toolbar={false}`. Only for CONTROLLED nav (driving the cursor from outside) wire `useCalendar` and pass `view`/`referenceDate`/`onViewChange`/`onCursorChange`; never compose a second `<CalendarToolbar>` (you'd get two).
- `onEventClick` → open a `<RecordOverlay>` (detail). Always.
- `onEmptyClick(date, group?)` → open the create dialog pre-filled for that day (`group` is always `undefined` in `CalendarWidget`). Only the **week board** then shows a visible **"+ Hinzufügen"** affordance per day; in month / hour-grid / year / agenda there is NO visible add element — just the (invisible) `onEmptyClick` handler on empty space. (`+N mehr` in a month cell is an overflow indicator, not an add affordance.)
- `onEventDrop` → reschedule. **Drag is OFF until you pass this** — the optimistic-update + `update<Entity>Entry()` + re-fetch-on-error recipe is in the widget's file header (`Read` it once). Skipping it is the #1 reason a calendar feels unfinished.
- Dates the widgets hand you are LOCAL `Date`s. Format a day with date-fns `format(date, 'yyyy-MM-dd')` — NEVER `date.toISOString().slice(0, 10)`: toISOString is UTC, so east of UTC the day shifts near midnight (wrong "today" KPIs, wrong `onEmptyClick` pre-fill day).
- Give each event a domain-rich card: **`title` is the record's PERSON/NAME field when one exists** (the guest, the patient, the customer — never the entity name: a bar reading `Buchung` on an occupancy board answers nothing); set **`subtitle`** on the `CalendarEvent` (e.g. `Frühschicht · Kasse 1`), or pass `renderEvent` for full control (status colour, badges). A lone `title` looks thin.
- A per-day **background BEHIND the events** (e.g. a utilization/occupancy bar) is a first-class slot: pass **`renderDayBackground(date)`** — additive and non-interactive (the widget keeps owning the cell + its events); works in month + week-board. Compute the value from your data.
- Filters / legend / KPI cards go in the `children` slot and around the widget.

**Embed it IN the dashboard** — there is no separate `/calendar` page or route. You map the entity's records → `CalendarEvent[]` and render `<CalendarWidget>` as (part of) the dashboard's primary surface. Only hand-roll if the layout is genuinely not a calendar (e.g. an employee×day matrix with locked rows → see `ResourceTimeline`).

**Business rules in the user instructions (time windows, weekdays, slot rasters, capacity limits) are VALIDATION duties, not just display config.** The pre-generated dialogs and the API know nothing about them. **Prefilled/clamped click paths are NOT validation** — every dialog field stays editable after the prefill. Every write flows through exactly TWO functions you own: the submit handler and `onEventDrop`. Validate THERE: on violation skip the write and tell the user (inline message), never silently save. Use ONE shared helper so the visible window and the validation can never disagree. Wrong: window-checking `onEmptyClick` and rendering "+" only on free slots — the dialog still books 14:00 and a full slot accepts one more, because the user edits the prefill. Right: a `ruleViolation(fields): string | null` helper (window, raster, capacity) called by BOTH the submit and the drop handler. **In the drag handlers, RETURN the violation string** — every widget shows it in its built-in rejection notice (snap-back + reason); a silent snap-back is a UX bug, and an own banner NEXT to the returned string is a double notice. Rule taxonomy → which handler: capacity ("max N gleichzeitig") → `onCardMove` + submit; overlap ("nie doppelt belegt") → `onEventDrop` + `onEventResize` + submit; time window/raster ("nur Mo–Fr", "nur volle Slots") → `onEventDrop` + submit (and the `onRangeCreate` dialog validates on submit); stage transitions ("erst X, dann Y") → `onCardMove`. **Never compare datetime fields with raw `===`** — the API may return seconds while the picker emits `YYYY-MM-DDTHH:mm`, so `t.fields.termin === newTermin` silently NEVER matches and the capacity check is dead code. Normalize BOTH sides: `(t.fields.termin ?? '').slice(0, 16) === newTermin.slice(0, 16)`.

Then implement immediately. No design_brief.md, no task lists, no planning documents.

---

## Step 2: Build DashboardOverview.tsx

**Mandatory sequence:**
1. **Read** `src/pages/DashboardOverview.tsx` using the Read tool
2. **Write** `src/pages/DashboardOverview.tsx` ONCE with the complete content

**NEVER use Bash (cat/echo/heredoc) for file operations.** If Read or Write fails, retry with the same tool.

**EVERY hook above the early returns — count them all.** `tsc` does NOT check the Rules of Hooks; ONE `useMemo`/`useState`/`useCallback` placed below `if (loading) return …` compiles green and then CRASHES the deployed app with React #310 the moment loading flips (skeleton renders N hooks, content renders N+1). Before writing the file, scan your component: the LAST hook call must sit above the FIRST `return`. Wrong: `if (loading) return <Skeleton/>; const defaults = useMemo(…)`. Right: all hooks first — derive plain (non-hook) values after the returns. (A skeleton that takes `data` as a prop has NO early returns — do not add any; every hook is unconditional by construction.)

## Step 3: Build

```bash
node scripts/heal-tsc.mjs && node scripts/i18n-tx.mjs wrap && npm run build
```

heal-tsc runs tsc and mechanically repairs the record-shape error classes
(missing `.fields.` prefix; `record:` typed raw while an Enriched* field is
read; `?? null` in a write payload that wants `undefined`) — fix only what
it prints below its JSON report. `i18n-tx.mjs wrap` tx-marks any UI literal
you left unmarked (idempotent; it edits your pages — if a later Edit misses
its old string, re-Read the file). Still write tx() yourself: the wrapper
cannot judge single words or grammar.
Deployment is automatic — do NOT deploy manually. After build succeeds, STOP.

---

## What Is Pre-Generated (DO NOT touch!)

Dialogs, routing, sidebar, shared components, and the design system are pre-generated.

**DO NOT touch:** index.css, dialogs, EntityCrud.tsx, App.tsx, PageShell.tsx, StatCard.tsx, DashboardGrid.tsx, WorkList.tsx, HeroBanner.tsx, ConfirmDialog.tsx, ChatWidget.tsx, useDashboardData.ts, enriched.ts, enrich.ts, formatters.ts, polish.ts, ai.ts, scripts/check-dashboard.mjs.

**EDITABLE:** `src/config/ai-features.ts` — toggle `AI_PHOTO_SCAN['EntityName'] = true` to enable the "Foto scannen" button in that entity's create/edit dialog. Useful for entities where users may photograph documents, receipts, or business cards to auto-fill form fields.

`index.css` contains the shared design system (Plus Jakarta Sans, indigo palette, dark sidebar). All semantic tokens (`bg-primary`, `text-muted-foreground`, `bg-sidebar`, etc.) are ready to use. Do NOT edit index.css — use existing tokens in your components.

**Already available in DashboardOverview.tsx:**
- the loaded data — `useDashboardData()` in the skeleton, or the `data` prop when `src/pages/DashboardReady.tsx` exists (it runs the hook and the loading/error surfaces for you)
- `enrichX()` — applookup fields resolved to display name strings
- `formatDate()`, `formatCurrency()` — locale-aware formatting
- `DashboardSkeleton`/`DashboardError` (imported from `@/components/DashboardStates`, self-repair flow inside) — keep them exactly as the skeleton has them: import + two early-returns, or NEITHER in a `data`-prop skeleton; NEVER re-implement them locally (check-dashboard gate 20)

**Lookup fields are `{ key, label }` objects** — `LivingAppsService` enriches them automatically. Access `.label` directly (e.g. `record.fields.kursart?.label`). No special formatters needed. A static lookup field's type is `LookupValue | undefined` — ALWAYS an object (or undefined), NEVER a bare string. Read `.key`/`.label` directly; never guard it with `typeof x === 'object' ? x.key : x` — the string branch can't occur (TS2367) and the cleanup is a serial fix loop. That string-or-object habit belongs to APPLOOKUP fields only (the value is a record-URL string, read with `extractRecordId`) — don't carry it over to static lookups. Wrong: `const k = typeof r.fields.kursart === 'object' ? r.fields.kursart?.key : r.fields.kursart`. Right: `const k = r.fields.kursart?.key`.

**AI utilities available in `src/lib/ai.ts`:**
- `chatCompletion()` — core LLM call
- `classify()` — auto-categorize text
- `extract()` — structured data from text
- `summarize()` — condense text
- `translate()` — translate text
- `analyzeImage()`, `extractFromPhoto()` — image analysis
- `analyzeDocument()` — PDF/document analysis
- `fileToDataUri()` — encode File for AI calls
- `safeJsonCompletion()`, `withRetry()` — error handling

---

## Dashboard = Primary Workspace, NOT Info Page

**The #1 mistake is building the dashboard as a passive info screen** (KPI cards + chart + recent activity). Users want to WORK with their data, not just look at it.

### The Core Interactive Component

Every dashboard needs ONE interactive component — the **reason users open the app**. This component:

- Takes up significant screen space (hero, not sidebar widget)
- Supports create, edit, delete directly (click empty slot → create dialog, click entry → edit)
- Shows data in its most natural form (the paradigm you chose in Step 1)
- Provides immediate visual feedback

Users should do 90% of their work without leaving the dashboard.

**Create/edit dialogs come from `useEntityCrud`** — the pre-generated `{Entity}Dialog`s are already mounted inside `{crud.surfaces}` (all field types, photo scan, validation, applookup selects, attachments in edit-mode). Open them via `crud.<entity>.openCreate(defaults)` / `crud.<entity>.openEdit(record)` — never import or render a dialog yourself, never build custom dialog forms from scratch.

### Record-Detail Surfaces — HARD RULE

When your UI shows the details of ONE record (image preview, kanban card click, calendar event tap, custom workflow page, profile view), the pre-generated plumbing owns the surface — never roll your own modal/sheet/drawer.

- ✅ **EVERY clickable record MUST open the record overlay — no exceptions.** A table row, gallery tile, card, list item, calendar event or kanban card that represents a record MUST, on click, call `crud.<entity>.openDetail(record)` (the EntityCrud host renders the overlay with the complete `<{Entity}Details>` body). A record click that does nothing, only selects, navigates away, or opens an ad-hoc inline panel is a BUG. Wire the click every time.
- ✅ **One click target per record tile.** Put the record's open-handler on the tile itself. Do NOT lay an `absolute inset-0` hover overlay with `pointer-events-auto` over a clickable tile — it swallows the click and the record won't open. Action buttons (edit/delete) go in a corner with `e.stopPropagation()`, they do not cover the whole tile.
- ✅ **Exception — master-detail is allowed.** A selection list with a DETAIL PANE visible next to it (a moderation queue: contributions left, the picked one right, from `md:` up) may show the picked record in that pane — render the pre-generated `<{Entity}Details record={…}>` block there, never a hand-built field list — and the row click then SELECTS instead of opening the overlay. Below `md:` (no room for a pane) the same click opens the overlay. Wrong: a list whose click opens a modal although a detail pane sits right beside it. Right: `onClick={() => isWide ? setSelected(r) : crud.beitraege.openDetail(r)}` with `<BeitraegeDetails record={selected} />` in the pane.
- ❌ Do NOT build a custom `<div className="fixed inset-0 …">` overlay for record details.
- ❌ Do NOT repurpose shadcn `<Dialog>` for record-view (Dialog stays for forms/confirmations).
- ❌ Do NOT invent domain-named one-off components (`ImagePreview`, `BookingCard`, `OrderDetails`).
- ✅ One surface, one composition: the **overlay** (`RecordOverlay`, rendered by the EntityCrud host). Customization happens via slots, never by replacing the shell.

```tsx
import {
  RecordView, RecordOverlay,
  RecordHeader, RecordKeyFacts, RecordSection, RecordField, RecordRelation, RecordTimeline,
  RecordAttachments,
  RecordViewSkeleton, RecordViewEmpty, RecordViewError,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
```

**Build a visual hierarchy — don't render every field with equal weight.** Pick the 1–3 fields that describe the record at a glance (a total, a status, a due date) and surface them prominently: `<RecordHeader>` badges/`meta`, a `<RecordKeyFacts items={[…]} />` strip right under the header, and/or `emphasis` on a key `<RecordField>`. The rest go in the normal `<RecordSection>` grid. **Pass `hideEmpty` on optional fields** so a sparse record doesn't render a wall of "—" — and only render a `<RecordSection>` if it has at least one non-empty field.

**Calculated values (totals, sums) — reuse the form's formulas, don't re-derive them by hand.** The same `computed` formulas the forms use live in `src/config/form-enhancements/{Entity}.ts`. Evaluate them read-only against a record with the exported `evalComputed` and surface the result (ideal as a `RecordKeyFacts` tile or an `emphasis` field) — that keeps the detail view's numbers identical to the form's.

```tsx
import { evalComputed } from '@/config/form-enhancements/types';
import { formEnhancements } from '@/config/form-enhancements/Auftraege';
import { formatCurrency } from '@/lib/formatters';

const brutto = evalComputed(formEnhancements.computed.bruttobetrag, r.fields, { lookupLists: {} });
//                                                            ^ pass { lookupLists: { feldKey: liste } } only if the formula pulls from an applookup
<RecordKeyFacts items={[
  { label: tx('Brutto'), value: brutto != null ? formatCurrency(brutto) : '—' },
]} />
```

If `formEnhancements.computed` is empty for the entity, there's nothing to compute — skip it.

**Full API, all 5 ready-to-paste recipes (Person, Ticket, Media, Booking, Article), and the overlay-stack pattern are in the RecordView docblock — already inlined in the "Component API cheatsheet" section of `.scaffold_context`.** Do NOT `Read('src/components/widgets/RecordView.tsx')` — the cheatsheet IS that docblock. Every slot, every prop, every format, every recipe — it's all there.

**Calendar:** when a build has date fields, the `CalendarWidget` component (month/week/day/agenda + year, multi-day bars, time-snap drag&drop, resize) is pre-generated. There is **no `CalendarPage` and no `/calendar` route** — YOU decide whether a time view fits and **embed `<CalendarWidget>` directly in the dashboard**, mapping the entity's records → `CalendarEvent[]` and wiring `onEventDrop`/`onEventResize` yourself (optimistic `set<Entity>` first, PATCH in the background, `fetchAll()` only on error). The full API + a copy-paste wiring recipe live in the header of `src/components/widgets/CalendarWidget.tsx` — `Read` it once before composing. A clicked calendar event opens the record overlay via `crud.<entity>.openDetail(record)` (same rule as every record click — the calendar owns no detail layer).

**Resource timeline (occupancy board):** when a build has an entity that pairs a date with a categorical/applookup field, the `ResourceTimeline` component is pre-generated — a synoptic "who/what is booked when" board with one row/column per resource over a shared axis (overlaps lane-packed; drag, incl. cross-resource move; resize; built-in nav + Woche/2-Wochen/Monat range). There is **no `ResourceTimelinePage` and no `/belegung` route**. When the app is an occupancy board, YOU **embed `<ResourceTimeline>` directly in the dashboard** and wire it: build `groups` (the resource axis) and map records → `ResourceEvent[]`. **Pick the `axis` by SPAN, not by field type:** records that span DAYS (stays, rentals, bookings — check_in/check_out, von/bis, anreise/abreise) → `axis="day"` (the occupancy plan: resources as rows, days as columns, one continuous bar per booking); hour-granular SAME-DAY slots (appointments, machine slots) → `axis="time"` (intraday hour grid, ONE day). `datetimeminute` fields do NOT imply the time axis — a hotel stay is day-spanning even though its values carry clock times; on `axis="time"` a multi-day booking degenerates into fragments on an hour grid. When in doubt on a booking/stay domain: `axis="day"`. **Field-wiring (TS-critical, the build's `tsc` will catch mistakes):** the `group` of a STATIC lookup is read with `lookupKey(record.fields.X)` and written back as a `LookupValue {key,label}` — a bare string is **TS2345**; an **applookup** resource is read with `extractRecordId(record.fields.X)` and written as `createRecordUrl(APP_IDS.<TARGET>, id)`. It is a SEPARATE widget from `CalendarWidget` — pick by need. Full API + recipe in the header of `src/components/widgets/ResourceTimeline.tsx` — `Read` it once. A clicked event opens the record overlay (`crud.<entity>.openDetail`). **Navigation + the range switch are BUILT IN** (there is no toolbar to compose). To let users add a record, pass **`onEmptyClick(date, group)`** → `crud.<entity>.openCreate({ … })` prefilled with that resource + date. **Use BOTH args:** a 1-arg `(date) => …` lambda silently drops `group` (type-compatible, no TS error) and the resource pre-fill stays empty. Drag-to-create is built in: `onRangeCreate={(start, end, group) => …}` fires when the user draws a range in a row/column — DATES (format yourself) + the REAL resource key; wire it to the prefilled create dialog like onEmptyClick. On `axis="time"` the Date carries the clicked CLOCK TIME, snapped to **`dragSnapMinutes`** (default 15) — slot-raster domains ("every 20 minutes") set it to the slot length so click AND drag land on the raster. For a bookable SLOT INVENTORY (fixed raster with VISIBLE free slots) do NOT hand-roll a slot grid: pass **`renderEmptySlot={(date, group) => <button className="w-full h-full …"><IconPlus size={12}/></button>}`** — the widget draws the slot lines, renders your node in every free cell and fires `onEmptyClick(date, group)` with the slot's exact start on tap. A hand-rolled grid loses drag&drop and lane-packing. **Mobile family principle — don't "unify" it away:** continuous-axis surfaces (CalendarWidget, ResourceTimeline) render as ONE rounded card WITH side margins (a shared time axis must never be cut apart); independent-container surfaces (KanbanWidget columns, StatCardRow) render as SEPARATE cards whose clipped neighbor peeks under the screen edge. Both are deliberate — never restyle one to match the other. **`renderGroupHeader` must survive the phone label column (~88px):** keep slot content to ONE short truncatable line (`truncate text-[11px]`) — long names + extra icons degrade to meaningless "Wohn…" stubs; the default header already self-compacts, custom slots must too. To STEER the built-in navigation (skip weekends, clamp a range) pass a controlled `referenceDate` AND **`onCursorChange`** — the toolbar then drives YOUR state; NEVER render a second prev/next bar above the widget (two nav bars, one dead). Row height auto-scales with `renderEmptySlot` — don't compensate with wrappers or a custom grid. **Same trap on `onEventDrop` — it has FOUR params** `(id, newStart, newEnd?, newGroup?)`: a 3-arg handler compiles, but a cross-resource drag then silently drops `newGroup` and the bar snaps back to its old row after re-fetch. Take all four and write the group field back. Wrong: `onEventDrop={(id, s, e) => patch(id, { check_in: s })}`. Right: `onEventDrop={(id, s, e, g) => patch(id, { check_in: s, ...(g ? { zimmer: zimmerOpts.find(o => o.key === g) } : {}) })}`. On the `'day'` axis `newStart`/`newEnd` are day-granular (`YYYY-MM-DD`) — when the field is `datetimeminute`, preserve the record's ORIGINAL time-of-day (swap only the date part); never hardcode a time like `T14:00`. Do NOT hand-roll a column grid — pass more `groups`.

**Kanban (status board):** when a build has an entity with a categorical lookup/applookup field, the `KanbanWidget` component is pre-generated — one column per status/stage, drag a card into another column = status change (built-in count badge, "+ Karte" button, automatic "Ohne Status" fallback column so no record disappears). There is **no kanban page** — when the app is a PIPELINE (Bewerbungen, Aufträge, Tickets, Deals: records move through phases), YOU **embed `<KanbanWidget>` directly in the dashboard**: `columns` come from the SCHEMA — `(LOOKUP_OPTIONS['<app>']?.['<statusfeld>'] ?? []).map(o => ({ key: o.key, label: o.label }))` — never invent stage names; **derive that INSIDE the component body, never as a module-scope const**: `o.label` is a locale-aware getter, so a hoisted const freezes one language at import and `check-dashboard` gate 22 rejects it; map records → `KanbanCard[]` with `column: lookupKey(record.fields.<statusfeld>) ?? '<erste-spalte>'`. **Write-back is the plain key, applied OPTIMISTICALLY** (`Create<Entity>` accepts the key string for lookup fields): the `set<Entity>` setters from `useDashboardData` ARE the optimistic API — setter FIRST (the card lands instantly), PATCH in the background, `fetchAll()` only in the catch. Never await the PATCH before updating state and never refetch after success — both make every drag freeze for the full round-trip. Wrong: `onCardMove={async (id, col) => { await update<Entity>Entry(id, { status: col }); fetchAll(); }}`. Right: `onCardMove={(id, col) => { set<Entity>(prev => prev.map(r => r.record_id === id ? { ...r, fields: { ...r.fields, status: lookupOption('<app>', 'status', col) } } : r)); update<Entity>Entry(id, { status: col }).catch(() => fetchAll()); }}` — `lookupOption` comes from `@/types/app`. **The PATCH takes the bare key, the optimistic state takes the whole `LookupValue`**: `fields.<statusfeld>` is `{ key, label }`, so `status: col` does not type-check, `label: col` prints the raw key (`in_bearbeitung`), and a re-typed label (`label: 'In Bearbeitung'`) freezes one language — `lookupOption` is the only synthesis path. **Stated stage/capacity rules are ENFORCED inside `onCardMove`** (check first, block + inline message, no patch) — a column that only LOOKS full enforces nothing. A clicked card opens the record overlay (`crud.<entity>.openDetail`) — and that overlay doubles as the TAP alternative to drag (the status field edited there IS the move; phones need a one-handed write path, long-press drag alone is not one). **Wire `onAddCard` by DEFAULT** — it renders the built-in "+ Karte" button per column; wire it to `crud.<entity>.openCreate({ <statusfeld>: columnKey })`; users expect to create from the board. Omit it only when creating from the board genuinely makes no sense (records arrive from an external source); a board without an add path feels read-only. There is **NO drag-reorder within a column** (Living Apps has no order field) — sort `cards` in your mapping (e.g. by date) and don't fake an order UI. **Wide pipelines (5+ stages): NEVER drop a declared lookup value to save width** — its cards pile up in the "Ohne Status" fallback. Collapse terminal stages instead: `defaultCollapsed={['abgelehnt', 'archiv']}` — a collapsed column is a narrow strip with count, still a drop target, one click expands. Pick by need: time on one axis → `CalendarWidget`; resource × time → `ResourceTimeline`; phases without time → `KanbanWidget`. Full API + recipe in the header of `src/components/widgets/KanbanWidget.tsx` — `Read` it once.

**Widget missing a slot for what you need? Unblock yourself.** Compose via the `children` slot or a render-prop (use the layout primitives the WIDGET exports for geometry — `packWeekBars`/`packDayEvents`/`yToTime` from CalendarWidget, `packLanes`/`packColumn` from ResourceTimeline; `src/components/widgets/primitives.ts` is internal — NEVER import it), and mark the gap with `// TODO(widget-gap)`. NEVER edit the widget file, NEVER fork it, NEVER leave the build red. Each widget also ships a READ-ONLY `<Widget>.example.tsx` next to it — the compiled reference wiring: read it, copy from it, never edit it.

```tsx
// ❌ WRONG — edit/fork the widget for a missing affordance (touching CalendarWidget.tsx) → forbidden, breaks determinism
// ✅ RIGHT — compose the gap from the public API, flag it (an in-cell bar BEHIND the events is NOT a gap — that's the renderDayBackground slot)
<CalendarWidget events={events} renderEvent={(ev) => <MyChip ev={ev} /> /* TODO(widget-gap): drag-select empty cells to create a range */} />
```

**Zoom belongs on a DETAIL surface — the overlay's `media` slot — not on list tiles.** On a record's detail view use `MediaThumbnail` (click-to-zoom images, PDF preview, file download); a raw `<img>` there is a dead end the user can't enlarge. But a clickable list/gallery **tile is ONE click target → it opens the `<RecordOverlay>`**; its image is a **passive `<img className="object-cover">`**. Never nest a `MediaThumbnail` inside a clickable tile — it steals the click to open its own lightbox and fights the tile-open.

```tsx
import { MediaThumbnail, MediaLightbox, useMediaViewer } from '@/components/widgets/MediaViewer';

// Gallery TILE — passive preview; the tile's click opens the overlay:
<div onClick={() => overlay.replace(r)} className="cursor-pointer …">
  <img src={r.fields.bilddatei} alt={r.fields.titel} className="aspect-square w-full object-cover rounded-xl" />
</div>

// INSIDE the overlay (media slot) — here it's zoomable:
<RecordOverlay open … media={<MediaThumbnail src={r.fields.bilddatei} alt={r.fields.titel} className="w-full h-64 object-cover rounded-xl" />}>
```

Read the docblock at the top of `src/components/widgets/MediaViewer.tsx` for the gallery (prev/next) pattern.

### Anti-Slop Checklist (if ANY true, redesign!)

- Dashboard is a passive info page — only KPI cards and charts
- No domain-specific UI — uses generic list/table for core data
- All KPI cards look identical
- Layout is a boring 2x2 or 3x3 grid
- No clear hero element
- Colors are generic blue/green/red (use the pre-configured palette tokens instead)
- Dashboard could be for ANY app
- **Custom `<div className="fixed inset-0…">` modal/overlay for record details instead of `RecordOverlay`**
- **Hand-rolled `ImagePreview` / `BookingCard` / `OrderDetails` component that re-renders fields instead of composing `RecordOverlay`/`RecordView`**
- **Raw `<img>` on a DETAIL surface (overlay media slot / RecordHeader) instead of `MediaThumbnail` — there the user must be able to enlarge it. (On a clickable list/gallery tile a plain `<img>` is CORRECT — zoom lives inside the overlay, not on the tile.)**
- **A `MediaThumbnail` nested inside a clickable tile — its lightbox fights the tile's open-overlay click; the tile image must be a plain `<img>`**
- **A record (row/tile/card/event) whose click does nothing, only selects, or opens a hand-rolled panel instead of a `<RecordOverlay>`**
- **A hover overlay (`absolute inset-0` + `pointer-events-auto`) laid over a clickable tile — it eats the click; the record never opens**
- **Detail view is a flat wall of equal-weight fields, or rows of "—" for empty fields — use `RecordKeyFacts` + `emphasis` for hierarchy and `hideEmpty` to drop empties**
- **Writes mutate silently — no toast, no Undo on status/drag writes**
- **No greeting/context line, or one that recites counts instead of naming today's people/things**
- **"Today" computed once at render — no ticking clock state**
- **Everything appears at once — no staggered motion-safe entrance**

---

## Polish Layer (the finished-dashboard marks)

The four marks named in CLAUDE.md are PRE-GENERATED in **`src/lib/polish.ts`** — import, don't re-derive:

```tsx
import { useClock, gruss, namen, ENTRANCE, entranceDelay, undoToast } from '@/lib/polish';
```

**1. Ticking clock — "today" never freezes:**
```tsx
const jetzt = useClock();                      // minute tick; hook ABOVE the early returns
const tagKey = format(jetzt, 'yyyy-MM-dd');    // derive EVERY today/overdue check from jetzt/tagKey
// ❌ const heute = new Date() at module level — frozen; tomorrow it still says today
// ❌ jetzt.toISOString().slice(0, 10) — toISOString is UTC; the day flips at the wrong hour
```

**2. Greeting + context line (directly under the page title):**
```tsx
<h1 className="text-xl font-semibold">{gruss(jetzt)}</h1>
<p className="mt-1 text-base text-foreground">Heute kommen {namen(anreisen)} — {namen(abreisen)} reist ab.</p>
// EVERY branch of the sentence names people/things — also the quiet ones:
// ❌ "2 bereit zur Abholung"   ✅ "Fr. Brandt & Hr. Schiller warten auf Abholung."
```

**3. Undo toast — ONE feedback channel for every write** (the global Toaster is already mounted):
```tsx
// after each optimistic write — snapshot the OLD value first, undo = revert state + counter-PATCH:
const prev = { ...r, fields: { ...r.fields } };
setAuftraege(p => p.map(x => x.record_id === r.record_id ? { ...x, fields: { ...x.fields, status: next } } : x));
LivingAppsService.updateAuftraegeEntry(r.record_id, { status: next }).catch(() => fetchAll());
undoToast('Nach „Fertig" verschoben', () => {
  setAuftraege(p => p.map(x => x.record_id === r.record_id ? prev : x));
  LivingAppsService.updateAuftraegeEntry(r.record_id, { status: lookupKey(prev.fields.status) ?? '' }).catch(() => fetchAll());
});
```

**4. Staggered entrance:** `<DashboardGrid>` staggers its slots for you — do NOT re-add animation classes around them. `ENTRANCE` + `entranceDelay(ms)` are only for surfaces OUTSIDE the grid (e.g. the page header).

**5. The aside action list is `<WorkList>`** — row anatomy (overlay click, quick-action wiring, "+N weitere", empty state) is built in; you supply the slices:
```tsx
<WorkList
  title={tx('Fällig heute')}
  items={faellige.map(r => ({
    id: r.record_id,
    title: r.kundeName ?? r.fields.kennzeichen,                                 // the person/thing
    secondLine: <><span className="font-medium text-destructive">{tx('Überfällig')}</span><span className="text-muted-foreground"> · {formatDate(r.fields.faellig)}</span></>,
    action: { label: tx`✓ Weiter`, onClick: () => advance(r) },          // the SAME shared helper
  }))}
  onItemClick={id => overlay.replace({ id })}
  empty={{ text: tx('Alles im Plan'), action: { label: tx('Neuer Auftrag'), onClick: openCreate } }}
/>
// ❌ rows whose action is "Bearbeiten" — the quick-action ADVANCES the workflow
```

**The shared `advance` helper, in full** — the board quick-action, the `<HeroBanner>` action and the overlay footer all call THIS one function, so write it once:
```tsx
const STAGES = (LOOKUP_OPTIONS['<app>']?.['<statusfeld>'] ?? []);              // schema order
const nextOf  = (key?: string) => STAGES[STAGES.findIndex(o => o.key === key) + 1]?.key ?? null;

const advance = useCallback((r: <Entity>) => {
  const from = lookupKey(r.fields.<statusfeld>);
  const to = nextOf(from);
  if (!to) return;                                                            // terminal stage
  set<Entity>(prev => prev.map(x => x.record_id === r.record_id
    ? { ...x, fields: { ...x.fields, <statusfeld>: lookupOption('<app>', '<statusfeld>', to) } } : x));
  update<Entity>Entry(r.record_id, { <statusfeld>: to }).catch(() => fetchAll());
}, [set<Entity>, fetchAll]);
```
**EVERY optimistic LookupValue write — in ANY handler, for ANY entity — synthesizes its value with `lookupOption(app, field, key)` from `@/types/app`**, never with a re-typed literal: `{ key: 'offen', label: 'Offen' }` freezes one language (the label getter is gone) and the i18n wrap then forces an extra rebuild. Hard-coding the stage keys (`['offen', 'in_bearbeitung', …]`) instead of reading `LOOKUP_OPTIONS` re-introduces the invented-stage-name bug — the order is already in the schema.

**A status a flow owns is not advanced here.** When the page skeleton lists `<app>.<statusfeld>` under CHANGES A FLOW OWNS, that transition belongs to its flow (it records reviewer, date, decision). `advance` then opens the flow for the record — `const go = flowActionFor('<app>', '<statusfeld>', r.record_id, to); go?.()` — and the action is rendered only when `go` exists (check-dashboard gate 25).

**6. The overlay's footer carries the workflow's next step** — when the domain has an obvious advancing action (Fertig melden, Abholung bestätigen, Check-out), pass it via the `footer` option of `useEntityCrud(data, { footer: (top) => … })` (sticky bottom bar) and reuse the SAME write helper as the board/list quick-action. An overlay whose only action is "Bearbeiten" wastes the moment the user is looking at exactly this record.

**Multi-entity drill stays in ONE overlay** — the EntityCrud host already drills relations (`onOpenX` inside the Details blocks pushes onto `crud.overlay`, Back appears automatically from depth 2). From your own surfaces, `crud.<entity>.openDetail(record)` opens; you never build a second shell or stack.

---

## Multi-Entity Topologies

Read the schema's applookup graph before composing. The shape decides the layout.

### Hub-and-spoke (many entities → one central entity)
Symptom: 3+ entities each carry an applookup pointing at the SAME entity (Baustelle ← Mängel/Berichte/Fotos/Genehmigungen/Kontakte). The central entity is the hub; the rest are its satellites.

The schema already names the hub and its satellites for you: **`HUB_TOPOLOGY` in `@/types/app`** maps each hub key to `[{ field, entity }]` for every satellite. Read it first — don't infer the graph by hand. The build gate `check-hub.mjs` fails if you skip a satellite.

- **Primary surface = the hub** as cockpit cards. Each card carries its SATELLITE DENSITY so the relationship is visible before the click: `{maengelVon(b.id).length} Mängel`, an expiring-permit chip, `{berichteVon(b.id).length} Ber.`. A typed `useState` per satellite + a `xVon = (id) => x.filter(r => parentId(r) === id)` helper each.
- **The hub overlay shows ALL satellites automatically.** The EntityCrud host renders the generated `<{Hub}Details>` block for the hub's overlay branch — one `<SatelliteSection>` per entry in `HUB_TOPOLOGY[hubKey]`, each with the guaranteed mechanics: row click drills into the satellite's own detail (never the edit form), the contextual "+" opens that satellite's create dialog with the hub pre-set, header-count + relation-list + dashed-add layout consistent. `check-hub.mjs` verifies it and `useEntityCrud()` satisfies it by construction — YOU wire nothing per satellite; your job is opening the hub: `crud.<hub>.openDetail(record)` from the cockpit cards.
- **Cross-entity signal → hero.** Compute the urgent state ACROSS satellites (a permit expiring in ≤7 days, a critical Mangel) and raise it as the `<HeroBanner>` with a resolving action. The hub's own status is rarely the hero.
- HARD: never leave satellites as isolated record lists. A hub detail showing only its own fields is the failure this pattern exists to prevent.

### Chain/pipeline (each entity → its predecessor)
Symptom: entities point at the PREVIOUS one in a sequence (Anfrage→Angebot→Auftrag→Rechnung). Don't render N kanbans — track ONE Vorgang through the stages.
- Build the chain per root: `const auftrag = auftragVon(angebot?.id)` … derive `stand` = furthest stage reached.
- Primary = Vorgang list, each row a mini-stepper (filled dots up to `stand`) + value, not four tables.
- The defining action is CONVERT: advancing a stage CREATES + links the next record (`nimmAngebotAn` sets status + pushes a new Auftrag with `angebotId`). Optimistic + undo.
- Stalls are the signal: finished-but-unbilled = money on the street → hero. KPIs count value per stage.
- Vorgang overlay = the chain as `<RecordTimeline>` (only reached stages), next conversion as the footer button.

### Pair (two entities, one applookup) — see the Kunden&Aufträge idiom above: enrichment shows the parent on every child; overlay-stack drills child→parent→back.

### Flat/independent — no strong links; compose per the single-entity rules, don't force a drill.

---

## Design Principles

### Theme

Font (Plus Jakarta Sans) and color palette (indigo accent, warm off-white base, dark sidebar) are pre-configured in `index.css`. Use existing semantic tokens — do NOT add custom CSS variables unless the dashboard requires truly app-specific values (e.g. `--calendar-slot-height`).

Create typography hierarchy through weight differences (font-300 vs font-700) and size jumps (text-2xl vs text-sm).

### Layout: Visual Interest Required

Every layout needs variation — size, weight, spacing, format, typography. If everything is the same size in identical cards, it's AI slop.

**Mobile:** Vertical flow, thumb-friendly, hero dominates first viewport.
**Desktop:** Use horizontal space, multi-column where appropriate. Action buttons (edit, delete, close) must always be visible — never hide them behind hover.

---

## Pre-Generated Component APIs (exact props — do NOT Read to check, do NOT guess)

**`useEntityCrud` / `{crud.surfaces}`** — the CRUD/overlay plumbing; full contract in the cheatsheet. The `{Entity}Dialog`s are mounted inside `crud.surfaces` with everything wired (list props, recordId/attachments in edit-mode, AI flags, optimistic submit + Undo):
```tsx
const data = useDashboardData();
const crud = useEntityCrud(data, { footer: (top) => /* next workflow step per type */ undefined });
crud.kurse.openCreate({ status: 'geplant' });   // create, prefilled
crud.kurse.openEdit(record);                    // edit (attachments incl.)
crud.kurse.openDetail(record);                  // record overlay (raw record is fine)
// … {crud.surfaces} as the LAST child of the page JSX.
```

**`openCreate(defaults)` is SHAPE-TOLERANT — pass the simple form, the dialog normalizes:**
```tsx
crud.buchungen.openCreate({ status: 'eingegangen' })   // ✅ bare lookup key
crud.buchungen.openCreate({ kurs: selectedKursId })    // ✅ bare record id
```
The parameter IS the dialog's `{Entity}DialogDefaults` type — build the defaults object inline at the call site; no prefill state, no type imports.

**`StatCard`** — `icon` must be rendered JSX, NOT a component reference:
```tsx
// ✅ CORRECT
<StatCard title={appLabel('kurse')} value="42" description={tc('gesamt')} icon={<IconBook size={18} className="text-muted-foreground" />} />
// ❌ WRONG — causes runtime error
<StatCard icon={IconBook} />
```

**`ConfirmDialog`** — uses `onClose` (not `onCancel`):
```tsx
<ConfirmDialog
  open={!!deleteTarget}
  title={tx('Auftrag löschen?')}
  description={tx('Dieser Eintrag wird endgültig entfernt.')}
  onConfirm={handleDelete}
  onClose={() => setDeleteTarget(null)}
/>
```

## QR codes — the public page's link as a symbol (QrCode, S-7)

A public page lives behind a link of ~110 characters (`#/public/<slug>?veranstaltung=<24-hex>`); nobody types that from a poster. `@/components/widgets/QrCode` encodes it dependency-free as SVG — the admin's link dialogs already show it, YOUR overview shows it wherever a public link is offered („Mitmachen“ card, a beamer view, the success screen of a flow that created the record people join):

```tsx
import { QrCode, qrSvgString } from '@/components/widgets/QrCode';
const link = `${window.location.origin}${window.location.pathname}#/public/beitrag-abgeben?veranstaltung=${id}`;
<QrCode value={link} size={220} title={tx('QR-Code zum Mitmachen')} />        // card: pixels
<QrCode value={link} size="34vh" title={tx('QR-Code zum Mitmachen')} />      // beamer: height share
```

Rules: encode the ABSOLUTE link; keep `margin` at 4 (scanners at 5 m); print the link next to the symbol („Oder öffne: …“) for phones that cannot scan; `qrSvgString(link)` into a Blob for a download button. Never fetch a QR from an external service (the same-origin gate rejects it) and never draw one by hand. Wiring recipe: `QrCode.example.tsx`.

## Critical Implementation Rules

**An autosave says when it failed — never „Speichert …“ for good** (A9: the full-screen text tab kept „Speichert …“ after a failed write and the edit was lost). Every save you trigger without a button has three visible states: „Speichert …“ while the write runs, „Gespeichert“ after it, and on an error „Nicht gespeichert — erneut versuchen“ with a button that sends the SAME value again (keep the text in state; never clear it on error). Wrong: `setSaving(true); await update…(); setSaving(false)` with no catch. Right: `try { await update…(); setState('saved') } catch { setState('failed') }` and the retry button.

**A button that cannot act says why — never a silent `disabled`** (Bau 10: „Text Vollbild“ and „Kopieren“ were greyed out while the active interaction had no merged text; the owner asked why he could not click). Either show the reason next to it (`<p className="text-xs text-muted-foreground">Erst zusammenführen</p>` or a `title`) or, better, replace the dead button with the next step as a button („Zusammenführen“). Wrong: `<Button disabled={!text}>Kopieren</Button>`. Right: `text ? <Button onClick={copy}>Kopieren</Button> : <Button onClick={mergeGo}>Erst zusammenführen</Button>`.

**Dates and times only through `formatDate` / `formatDateTime`** (`@/lib/formatters`) — never date-fns `format(new Date(v), 'PPp')` yourself (Bau 14: an event card read „6. Nov. 2026 00:00“ for a day without a time; the formatter shows the day). Wrong: `format(new Date(r.fields.datum), 'PPp')`. Right: `formatDateTime(r.fields.datum)`.

**„Neueste“ is sorted, never the list's order** (Bau 14: „Neueste Feedbacks“ showed the seed records before the new ones — the list comes in the order the platform keeps). Sort before you cut: `[...rows].sort((a, b) => (b.createdat ?? '').localeCompare(a.createdat ?? '')).slice(0, 5)`, or `orderby: ['r.createdat desc']` on a live read. Wrong: `rows.slice(0, 5)` under a heading „Neueste“.

**A count of people is a count of SUBMISSIONS, never of records or names** (Doodle KB 7: the poll card said „2 Antworten“ for three sends). A public page that lists what it creates sends SEVERAL records per send (one answer per date); the overview skeleton lists these entities under COUNTS OF SUBMISSIONS. Count them with the layer: `import { submissionsOf } from '@/lib/journey'` → `submissionsOf(antworten, { key: 'zeilen_kennung', names: ['vorname', 'nachname'] }).length` (the dashboard's records with `record_id`/`createdat` go in as they are; `key` is the page's device field, without one the same name within seconds is one send). A count PER OPTION (votes per date) stays per record. Wrong: `new Set(antworten.map(a => a.fields.nachname)).size`, `antworten.length` under „Antworten“.

### Import Hygiene
Only import what you use. TypeScript strict mode **errors on unused imports and variables**. Every `import`, prop, and const must be referenced. Double-check before running `npm run build`.

### Type Imports
```typescript
// ❌ WRONG
import { Workout } from '@/types/app';
// ✅ CORRECT
import type { Workout } from '@/types/app';
```

### extractRecordId Null Check
```typescript
const id = extractRecordId(record.fields.relation);
if (!id) return;
```

### Dates Without Seconds
```typescript
const dateForAPI = formData.date + 'T12:00'; // YYYY-MM-DDTHH:MM only
```

### Optional Date Fields Crash parseISO at RUNTIME
The build does NOT enforce strictNullChecks — `parseISO(undefined)` compiles and then
crashes the whole page ("reading 'split'") for ONE record with a missing date. The gate
flags every unguarded `parseISO(x.fields.…)`.
```typescript
// ❌ WRONG — one date-less record kills the dashboard
terminbuchung.filter(t => isToday(parseISO(t.fields.termin)));
// ✅ RIGHT — presence-filter the chain once, then assert with !
terminbuchung.filter(t => !!t.fields.termin && isToday(parseISO(t.fields.termin!)));
```

### Select Never Empty Value
```typescript
// ❌ <SelectItem value="">None</SelectItem>
// ✅ <SelectItem value="none">None</SelectItem>
```

---

## Completeness Checklist

### Core Component
- [ ] Interactive component implements the chosen UI paradigm
- [ ] Users can create, edit, delete directly from the dashboard
- [ ] Component takes significant screen space (hero element)

### Technical
- [ ] `npm run build` passes
- [ ] Empty state handled (loading/error come from `@/components/DashboardStates` — imported, not rebuilt)
- [ ] No hardcoded demo data
- [ ] Responsive: mobile and desktop layouts

### Polish
- [ ] Greeting + context line with real names from today's data (`gruss`/`namen` from polish)
- [ ] All today/now values derive from `useClock()`
- [ ] Every drag/status write YOU wire calls `undoToast` with the counter-write (dialog writes are inside `useEntityCrud`)
- [ ] Every record click goes to `crud.<entity>.openDetail`; creates/edits to `openCreate`/`openEdit`; `{crud.surfaces}` is the last child
- [ ] Page composed via `<DashboardGrid>`; aside is a `<WorkList>` on its own axis
- [ ] `node scripts/check-dashboard.mjs` exits green

---

## Living Apps API Reference

### Date Formats (STRICT!)

| Field Type | Format | Example |
|------------|--------|---------|
| `date/date` | `YYYY-MM-DD` | `2025-11-06` |
| `date/datetimeminute` | `YYYY-MM-DDTHH:MM` | `2025-11-06T12:00` |

NO seconds for `datetimeminute`!

### applookup Fields

Store record URLs, built with `createRecordUrl()` — never hand-assembled.
The `{LA host}/rest/apps/{app_id}/records/{record_id}` form
this helper builds belongs to the authenticated dashboard surface this skill
covers; public pages use a different form (`recordRef()` from
`@/lib/publicClient` — see the `public-builder` skill).

```typescript
import { extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';

const recordId = extractRecordId(record.fields.category);
if (!recordId) return;

const data = { category: createRecordUrl(APP_IDS.CATEGORIES, selectedId) };
```

### API Response Format

A LIST read returns an **object keyed by record id**, NOT an array — use
`Object.entries()` to get `record_id` per record. The service already does
this for you: `getAllX()` / `getX()` hand back records with `record_id` set.

`createX()` / `updateX()` resolve to a `MutationResult` — read the new id as
`result.record_id` (or `result.id`, same value):

```typescript
// ❌ WRONG — the create answer is ONE record, not a keyed map.
//    Object.entries(res)[0][0] is the STRING "id", so the next write posts
//    `/records/id` and the API answers 400 "Unsupported field value".
const newId = Object.entries(res)[0][0];

// ✅ RIGHT
const auftrag = await LivingAppsService.createAuftraegeEntry({ … });
await LivingAppsService.createTermineEntry({
  termin_auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, auftrag.record_id),
});
```

Chained creates are the classic wizard trap: the first record is written, the
second fails, and the user sees an error on the LAST step with half the data
saved. Walk a multi-step flow through its final step before calling it done.

---

## Data Access (pre-generated — do NOT rewrite)

All data fetching, lookup maps, and enrichment are pre-generated. In DashboardOverview.tsx:

```typescript
// Already in the skeleton — just use the data:
const { kurse, anmeldungen, dozentenMap, loading, error, fetchAll } = useDashboardData();
const enrichedKurse = enrichKurse(kurse, dozentenMap, raeumeMap);

// Lookup fields are pre-enriched { key, label } objects — access .label directly:
record.fields.kursart?.label           // → "Restorative"
record.fields.tags?.map(v => v.label)  // → ["Alpha", "Beta"]
```

For CRUD after user actions:

```typescript
const handleCreate = async (fields) => {
  await LivingAppsService.createKurseEntry(fields);
  fetchAll();
};

const handleDelete = async (id: string) => {
  await LivingAppsService.deleteKurseEntry(id);
  fetchAll();
};
```

## Chart Pattern (recharts)

```typescript
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <XAxis dataKey="name" stroke="var(--muted-foreground)" />
    <YAxis stroke="var(--muted-foreground)" />
    <Tooltip contentStyle={{ backgroundColor: 'var(--background)', border: '1px solid var(--border)' }} />
    <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2} dot={false} />
  </LineChart>
</ResponsiveContainer>
```

## Available Libraries

- **shadcn/ui** — all components in `src/components/ui/`
- **recharts** — LineChart, BarChart, PieChart, AreaChart
- **@tabler/icons-react** — icons (all prefixed with `Icon`, e.g. `IconPlus`, `IconMapPin`; use `stroke` not `strokeWidth`)
- **date-fns** — date formatting with `de` locale

## Formatting (pre-generated — just import)

```typescript
import { formatDate, formatCurrency } from '@/lib/formatters';

formatDate(record.fields.startdatum);     // "06.11.2025" or "Nov 6, 2025"
formatCurrency(record.fields.preis);      // "199,00 €" or "$199.00"
```
