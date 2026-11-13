/**
 * MapWidget — pre-generated geo-map widget set (Archetype B).
 *
 * The "where on the map are my records?" surface: each record carrying
 * coordinates becomes a status-coloured pin on a real OpenStreetMap map, the
 * view auto-zooms to fit every point, a click opens the record's detail.
 * Applications: Filialen/Standorte, Außendienst-Termine/Lieferungen, Fuhrpark/
 * Assets, Veranstaltungsorte. This is the sister widget to CalendarWidget/
 * ResourceTimeline/KanbanWidget — a calendar orders ONE time axis, an occupancy
 * board orders resource × time, a kanban orders a CATEGORY axis, a map orders a
 * GEO axis (latitude × longitude). Compose; never reimplement.
 *
 * @version 1.6.0
 * @since 2026-07-10  (1.6.0: Leaflet + markercluster kommen GEBÜNDELT aus
 *                     node_modules (dynamic import → Lazy-Chunk nur für
 *                     Karten-Seiten, Vite-dedupliziert mit GeoMapPicker) —
 *                     der Runtime-Load vom my.living-apps.de/npm-Proxy
 *                     entfällt: eine Herkunft, deterministische Versionen
 *                     (im E2B-Template gepinnt), echte @types/leaflet im
 *                     Sandbox-tsc. Die schmale typed Facade bleibt die
 *                     API-Wahrheit des Widgets.
 * @since 2026-06-30  (1.5.1: + Waze in the popup Route links — popular,
 *                     traffic-aware driving nav that deep-links its app on a
 *                     phone. Just another MAP_NAV_PROVIDERS entry; the footer now
 *                     offers Google Maps / Apple Karten / Waze.)
 * @since 2026-06-30  (1.5.0: NAVIGATE THERE. A map of locations is only half the
 *                     value — the other half is GETTING there. Every pin popup now
 *                     carries built-in "Route" links (Google Maps / Apple Karten);
 *                     each opens that provider's DIRECTIONS to the point — on a
 *                     phone the OS deep-links the native app (turn-by-turn, the
 *                     Außendienst/delivery case), on desktop the browser map. It
 *                     needs ONLY the coordinate the widget already owns, so it is
 *                     fully data-agnostic and AUTOMATIC — no prop, no agent wiring.
 *                     Co-located records share one route control (exact coords).
 *                     The same control is EXPORTED as `MapRouteLinks` (+ the pure
 *                     `mapsDirectionsUrl(lat, long, provider?)` helper) so you can
 *                     drop "Route there" into the <RecordOverlay> detail too.)
 * @since 2026-06-30  (1.4.0: CLUSTERING + TONE LEGEND. Two answers to "I have
 *                     hundreds of markers" and "what do the colours mean?".
 *                     CLUSTERING: above ~100 markers the widget AUTOMATICALLY
 *                     aggregates nearby pins into a count bubble (zoom in to
 *                     split; click to zoom-to-bounds) via `leaflet.markercluster`
 *                     from the SAME Living-Apps CDN mirror (non-fatal extra load —
 *                     if it fails the map still plots every pin, just unclustered).
 *                     No new behaviour for normal datasets; pass `cluster` to
 *                     force it on/off. It COMPOSES with co-location: identical
 *                     coordinates still collapse to one list-popup pin FIRST, then
 *                     clustering aggregates distinct nearby points on top — exact
 *                     grouping and radius aggregation stay separate concepts.
 *                     LEGEND: an optional `legend={[{ label, tone?, icon? }]}`
 *                     renders a compact key overlay (bottom-left) so status
 *                     colours/symbols are explained on the map itself — the
 *                     consumer supplies the label→tone meaning (the widget never
 *                     knows what 'success' means). Distinct from `children` (a
 *                     free slot ABOVE the map); the legend sits ON it.)
 * @since 2026-06-30  (1.3.0: FILLS ITS CONTAINER + dashboard-styled zoom. The
 *                     card now GROWS to fill its parent's height (floor: 420px /
 *                     320px mobile) instead of a fixed 420px — placed in a
 *                     stretched grid cell next to taller content (e.g. a KPI
 *                     column), it fills the cell instead of leaving dead space
 *                     below it. Standalone (parent height auto) it still shows at
 *                     the 420px floor, exactly as before. The Leaflet +/- zoom
 *                     control is restyled to the dashboard via arbitrary variants
 *                     on the container (soft rounded group, card bg, secondary/
 *                     primary hover) — Leaflet draws its OWN control DOM, so it
 *                     can't take Tailwind classes directly; the `[&_.leaflet-*]:!…`
 *                     variants beat its stylesheet, same trick as the crosshair
 *                     cursor. Neither is a new prop — both are automatic.)
 * @since 2026-06-29  (1.2.0: MARKER ICONS. MapMarker gains an optional `icon`
 *                     from the closed MAP_ICONS set (truck/building/user/store/
 *                     …), rendered WHITE inside the coloured pin. Choose the glyph
 *                     that fits the application's records; omit it for a plain
 *                     status dot. Still a pure divIcon HTML string — the icon is
 *                     inlined Tabler SVG markup, NOT a React component (HARD RULE:
 *                     no React in Leaflet's DOM). A CLOSED set, exactly like tone
 *                     — no free-form SVG, so an agent can't get the markup wrong.)
 * @since 2026-06-29  (1.1.0: CO-LOCATION. Records with IDENTICAL coordinates
 *                     (6 dp) now collapse into ONE pin with a count badge; its
 *                     popup lists every record at that point, each a row firing
 *                     onMarkerClick. Before this, a second record at the same
 *                     point rendered exactly on top of the first — the one
 *                     underneath was invisible AND unclickable, and zoom can
 *                     never separate identical points (so it was NOT solvable by
 *                     the deferred clustering). This is exact-coordinate
 *                     grouping, not a zoom radius — clustering stays separate.)
 * @since 2026-06-25  (1.0.0: first release. Vanilla Leaflet 1.9.4 from the
 *                     Living-Apps CDN mirror (no npm, no react-leaflet, no E2B
 *                     image change) — the load promise + double-load guard are
 *                     COPIED from GeoMapPicker (sister widgets never import each
 *                     other; the picker is a form FIELD, this is a display
 *                     surface). A narrow TYPED Leaflet facade (only the members
 *                     used, no index signature, no `any`) makes every L.* call
 *                     compile-checked — that is what turns the family's #1
 *                     mistake, `lng` for `long`, into a build error. Pins are
 *                     L.divIcon HTML strings coloured from the shared TONE_DOT
 *                     palette (no React in Leaflet's DOM). The click popup is
 *                     the widget's OWN React overlay positioned via Leaflet
 *                     events (no renderToString / createRoot into foreign DOM).
 *                     Auto-fit-bounds is internal (the widget owns the view
 *                     after the seed). invalidateSize() is wired to a
 *                     ResizeObserver — EVERY container resize, not once after
 *                     mount — so a column resize / sidebar toggle never leaves
 *                     grey tile gaps. A CDN/tile failure shows MapError(onRetry),
 *                     never a silent white square.)
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. A clicked marker MUST open a <RecordOverlay> (from RecordView) — this
 *     widget owns NO detail layer. Wire `onMarkerClick`; never render your own
 *     modal. (The built-in popup is only a compact IDENTIFY preview.)
 *  2. Never edit this file (nor ./primitives.ts — the family's shared
 *     mechanics); never import from a sister widget (CalendarWidget/
 *     ResourceTimeline/KanbanWidget). If a slot is missing: unblock via
 *     children + // TODO(widget-gap). Never fork, never leave the build red.
 *  3. Data-agnostic: every MapMarker key is an OPAQUE value — never a
 *     Living-Apps field name. The consumer maps record.fields.<geo> → the slim
 *     marker shape. No `geoField` prop, no field knowledge in here.
 *  4. NOTHING disappears silently: a record with a missing/invalid coordinate
 *     is COUNTED in a built-in "N ohne gültigen Standort" notice — never
 *     dropped without a trace.
 *  5. `long`, NEVER `lng`. MapMarker.long is the Living-Apps GeoLocation field
 *     name; the typed shape + the typed facade make a `lng` mapping a compile
 *     error instead of a pin silently landing at [lat, 0].
 *
 * ─── API at a glance (exact prop names — NEVER guess) ──────────────────
 *
 *  <MapWidget
 *     markers          MapMarker[]    — { id: string, lat: number, long: number, title, subtitle?, tone?, icon? }
 *     onMarkerClick?   (marker) => void                      — open a <RecordOverlay>
 *     onMapPointClick? (point: { lat: number; long: number }) => void — DEFAULT: wire it so a tap on an empty
 *                                                              point opens a create dialog PRE-FILLED with those
 *                                                              coords. Omit ONLY for a deliberately read-only map
 *                                                              (the crosshair affordance is off then).
 *     defaultCenter?   { lat: number; long: number }         — SEED only; the widget owns the view via auto-fit
 *     defaultZoom?     number                                — SEED only
 *     legend?          { label, tone?, icon? }[]             — a key overlay ON the map (bottom-left) explaining
 *                                                              the pin colours/symbols; YOU give each tone its meaning
 *     cluster?         boolean                               — force marker clustering on/off; DEFAULT auto (on above
 *                                                              ~100 markers). Leave unset and it just works.
 *     children?        ReactNode                             — filter / hint slot ABOVE the map (free JSX)
 *  >
 *  // + <MapSkeleton /> / <MapError error onRetry? />  (State-Trias)
 *
 *  tone (MapMarker.tone, default 'default'): 'default' | 'primary' | 'success' | 'warning' | 'destructive'
 *    Exported as `MAP_TONES` (const array) and `MapTone` (union type) — reference, don't transcribe.
 *
 *  icon (MapMarker.icon, optional): CHOOSE A GLYPH THAT FITS THE APPLICATION'S
 *    records — 'truck' for deliveries/fleet, 'building'/'store'/'factory'/
 *    'warehouse' for sites, 'home' for properties, 'user' for contacts, 'tool'
 *    for service calls, 'calendar' for events, 'parking'/'gas'/'flag'/'star'/
 *    'map' otherwise. It renders white inside the coloured pin (tone still sets
 *    the colour). Exported as `MAP_ICONS` (const array) and `MapIcon` (union) —
 *    reference, don't transcribe. Omit it for a plain status dot. A closed set:
 *    no free-form SVG, no custom renderMarker (HARD RULE 2) — this IS the marker
 *    customisation surface.
 *
 *  Navigate-there: every pin popup AUTOMATICALLY shows "Route" links (Google Maps
 *  / Apple Karten / Waze) to that point — built in, no prop. To put the SAME control in
 *  the <RecordOverlay> detail, import the exported `<MapRouteLinks lat long />`
 *  (or build one link with `mapsDirectionsUrl(lat, long, 'google' | 'apple')`).
 *
 *  The view AUTO-FITS all valid markers (1 marker → a sensible fixed zoom);
 *  defaultCenter/defaultZoom are only the initial seed. The OpenStreetMap
 *  attribution is wired in and non-removable (licence requirement). There is NO
 *  routed map page — embed <MapWidget> directly in the dashboard.
 *
 * ─── ❌ COMMON MISTAKES (family-proven traps) ───────────────────────────
 *  • `lng` instead of `long` — the single most common geo mistake (even the
 *    hand-curated gold reference slipped to it). The field is `long`; a `{ lng }`
 *    object is a TS error here, not a silent bug.
 *  • `tone: 'danger'` — does NOT exist; the closest is `'destructive'`. Use the
 *    exported `MAP_TONES` array.
 *  • `parseId(marker.id)` — there is NO `parseId` helper. Build the id with a
 *    template literal (`` `filiale:${r.record_id}` ``) and read it back with
 *    `id.split(':')` — exactly as the example.tsx does.
 *  • Inventing callbacks from other map libraries (onMapClick, onPinClick) or
 *    passing two positional numbers — it is `onMapPointClick({ lat, long })`,
 *    an OBJECT (two numbers would be silently swappable), and `onMarkerClick`
 *    takes the whole marker.
 *  • > ~100 markers — the widget now CLUSTERS automatically (count bubbles that
 *    split on zoom); no action needed. The pins are still all there, just
 *    aggregated. For thousands, also consider pre-filtering via `children` (a
 *    filter UI) or the query so the map stays meaningful, not just performant.
 *
 * ─── When to use ──────────────────────────────────────────────────────
 *
 * Any time records carry a LOCATION (a `geo` control) and the user benefits
 * from seeing them spatially: branches, field appointments/deliveries, fleet/
 * assets, venues. YOU embed <MapWidget> directly in the dashboard: map records
 * → MapMarker[] (the geo field name lives in YOUR mapping; `subtitle` is a
 * natural fit for GeoLocation.info), pass onMarkerClick that opens a
 * <RecordOverlay>, and SET `icon` to the MAP_ICONS glyph that matches the records
 * (e.g. 'truck' for a delivery app, 'building' for branches, 'user' for a contact
 * map) so the pins read at a glance. BY DEFAULT also wire `onMapPointClick` so a
 * tap on the empty map opens a create dialog pre-filled with those coordinates;
 * reverse-geocode the point (`reverseGeocodeDetailed` from @/lib/ai) to fill the
 * ADDRESS too — set standort.info to addr.display, and if the app has separate
 * address fields, map addr.road/houseNumber/postcode/city onto them (you know the
 * field names). Drop onMapPointClick only for a deliberately read-only map.
 * Records with a DATE → CalendarWidget; a STATUS pipeline → KanbanWidget. v1 plots
 * records that ALREADY carry coordinates (bulk address → coordinates resolution
 * for existing records is a separate Living-Apps backend concern, out of scope).
 *
 * Full compiling example: ./MapWidget.example.tsx
 */
import { type ReactNode, type ComponentType, useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { IconMapPin, IconAlertCircle, IconRefresh, IconNavigation, IconBrandGoogleMaps, IconBrandApple, IconBrandWaze } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
// Shared widget MECHANICS (M4) — the tone class-maps. Sister widgets never
// import each other; ALL import './primitives'. The Leaflet load pattern is
// COPIED from GeoMapPicker (a form-field picker, not a family widget) below —
// not imported — because the picker is not part of the widget family.
import { TONE_DOT, type WidgetTone } from './primitives';
import { coreLocale as i18nLocale, type CoreLocale as Locale } from '@/i18n';

// The widget's OWN chrome strings — indexed at RENDER time (`MW[i18nLocale]`),
// never hoisted into a module constant.
const MW: Record<Locale, {
  map: string; tileError: string; withoutLocation: string;
  errorTitle: string; retry: string; retryHint: string;
}> = {
  de: {
    map: 'Karte', tileError: 'Kartenkacheln konnten nicht geladen werden.',
    withoutLocation: 'ohne gültigen Standort',
    errorTitle: 'Karte konnte nicht geladen werden', retry: 'Erneut versuchen',
    retryHint: 'Bitte erneut versuchen.',
  },
  en: {
    map: 'Map', tileError: 'Map tiles could not be loaded.',
    withoutLocation: 'without a valid location',
    errorTitle: 'Map failed to load', retry: 'Try again',
    retryHint: 'Please try again.',
  },
};

// Records are a COUNTED noun: German has two forms, Czech three (1 záznam,
// 2–4 záznamy, 5+ záznamů) — so the plural rule lives in a function.
function recordsLabel(n: number, l: Locale): string {
  if (l === 'en') return `${n} ${n === 1 ? 'record' : 'records'}`;
  return `${n} ${n === 1 ? 'Datensatz' : 'Datensätze'}`;
}

// Closed enum — exported as a const array so consumers reference instead of
// transcribe (a mistyped 'danger' was a real build failure in this family). The
// union is derived from the array, so the two can never drift apart. Mirrored
// from WidgetTone (the shared palette) — the values live once, in primitives.
export const MAP_TONES = ['default', 'primary', 'success', 'warning', 'destructive'] as const;
export type MapTone = (typeof MAP_TONES)[number];
// Compile-time proof that MapTone stays a subset of the shared palette: if
// primitives' WidgetTone ever loses a value MapTone names, this errors.
const _toneParity: Record<MapTone, WidgetTone> = {
  default: 'default', primary: 'primary', success: 'success', warning: 'warning', destructive: 'destructive',
};
void _toneParity;

// Closed marker-icon set — same philosophy as MAP_TONES: a fixed, referenceable
// vocabulary instead of free-form SVG (which an agent gets wrong). Pick the one
// that fits the application's records (truck → deliveries, building → branches,
// user → contacts, …). The icon renders WHITE inside the coloured pin; omit it
// for a plain status dot. Paths are verbatim Tabler outline (24×24, stroke).
export const MAP_ICONS = [
  'building', 'home', 'store', 'factory', 'warehouse', 'truck', 'package',
  'user', 'tool', 'calendar', 'parking', 'gas', 'flag', 'star', 'map',
] as const;
export type MapIcon = (typeof MAP_ICONS)[number];

const ICON_PATHS: Record<MapIcon, string> = {
  building: '<path d="M3 21l18 0" /><path d="M9 8l1 0" /><path d="M9 12l1 0" /><path d="M9 16l1 0" /><path d="M14 8l1 0" /><path d="M14 12l1 0" /><path d="M14 16l1 0" /><path d="M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16" />',
  home: '<path d="M5 12l-2 0l9 -9l9 9l-2 0" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" /><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />',
  store: '<path d="M3 21l18 0" /><path d="M3 7v1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1m0 1a3 3 0 0 0 6 0v-1h-18l2 -4h14l2 4" /><path d="M5 21l0 -10.15" /><path d="M19 21l0 -10.15" /><path d="M9 21v-4a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v4" />',
  factory: '<path d="M3 21h18" /><path d="M5 21v-12l5 4v-4l5 4h4" /><path d="M19 21v-8l-1.436 -9.574a.5 .5 0 0 0 -.495 -.426h-1.145a.5 .5 0 0 0 -.494 .418l-1.43 8.582" /><path d="M9 17h1" /><path d="M14 17h1" />',
  warehouse: '<path d="M3 21v-13l9 -4l9 4v13" /><path d="M13 13h4v8h-10v-6h6" /><path d="M13 21v-9a1 1 0 0 0 -1 -1h-2a1 1 0 0 0 -1 1v3" />',
  truck: '<path d="M5 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 17a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M5 17h-2v-11a1 1 0 0 1 1 -1h9v12m-4 0h6m4 0h2v-6h-8m0 -5h5l3 5" />',
  package: '<path d="M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5" /><path d="M12 12l8 -4.5" /><path d="M12 12l0 9" /><path d="M12 12l-8 -4.5" /><path d="M16 5.25l-8 4.5" />',
  user: '<path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" /><path d="M6 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />',
  tool: '<path d="M7 10h3v-3l-3.5 -3.5a6 6 0 0 1 8 8l6 6a2 2 0 0 1 -3 3l-6 -6a6 6 0 0 1 -8 -8l3.5 3.5" />',
  calendar: '<path d="M4 7a2 2 0 0 1 2 -2h12a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2l0 -12" /><path d="M16 3l0 4" /><path d="M8 3l0 4" /><path d="M4 11l16 0" /><path d="M8 15h2v2h-2l0 -2" />',
  parking: '<path d="M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14" /><path d="M10 16v-8h2.667c.736 0 1.333 .895 1.333 2s-.597 2 -1.333 2h-2.667" />',
  gas: '<path d="M14 11h1a2 2 0 0 1 2 2v3a1.5 1.5 0 0 0 3 0v-7l-3 -3" /><path d="M4 20v-14a2 2 0 0 1 2 -2h6a2 2 0 0 1 2 2v14" /><path d="M3 20l12 0" /><path d="M18 7v1a1 1 0 0 0 1 1h1" /><path d="M4 11l10 0" />',
  flag: '<path d="M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9" /><path d="M5 21v-7" />',
  star: '<path d="M12 17.75l-6.172 3.245l1.179 -6.873l-5 -4.867l6.9 -1l3.086 -6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873l-6.158 -3.245" />',
  map: '<path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" /><path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />',
};

export type MapMarker = {
  id: string;
  /** GeoLocation.lat. */
  lat: number;
  /** GeoLocation.long — NEVER `lng`. */
  long: number;
  title: ReactNode;
  /** Optional secondary line in the popup (natural source: GeoLocation.info). */
  subtitle?: ReactNode;
  tone?: MapTone;
  /** Optional pin symbol from the closed MAP_ICONS set — pick the one that fits
   *  the records (truck/building/user/…). White inside the pin; omit → status dot. */
  icon?: MapIcon;
};

/** One row of the optional on-map legend. The widget knows tones/icons but NOT
 *  their meaning — YOU supply the label (e.g. tone 'success' → "In Betrieb").
 *  `tone`/`icon` mirror what you set on the matching markers. */
export type MapLegendItem = {
  label: ReactNode;
  tone?: MapTone;
  icon?: MapIcon;
};

// ── Leaflet from the Living-Apps CDN mirror (no npm, no react-leaflet) ──────
// A NARROW, TYPED facade: only the members this widget calls, no index
// signature, no `any` fallback. Every L.* call below is therefore type-checked
// — a future call to an unlisted member is a compile error (add it explicitly),
// not a silent slide onto `any`. This is what makes the typed contract real.

// Leaflet + markercluster kommen GEBÜNDELT aus node_modules (im E2B-Template
// installiert, Versionen dort gepinnt): dynamic import → eigener Lazy-Chunk,
// der nur lädt, wenn eine Karte mountet. Kein Runtime-Load von
// my.living-apps.de/npm mehr — eine Herkunft (S3), deterministisch, offline-fest.
// Nur MarkerCluster.css wird importiert — NICHT MarkerCluster.Default.css: its
// coloured-circle defaults would fight our own dashboard-styled cluster icon.
// Above this many distinct points the map auto-clusters (honest plotting becomes
// clutter past it). Below → every pin shown, exactly as before. `cluster` overrides.
const CLUSTER_AUTO_THRESHOLD = 100;

type LatLngTuple = [number, number];
type LeafletLatLng = { lat: number; lng: number };
type LeafletPoint = { x: number; y: number };
/** Opaque to us — only produced by getBounds() and handed back to fitBounds(). */
type LeafletBounds = { __bounds: true };
type LeafletMouseEvent = { latlng: LeafletLatLng };
type LeafletDivIcon = { __divIcon: true };

interface LeafletMarker {
  addTo(layer: LeafletMarkerLayer): this;
  on(type: 'click' | 'mouseover' | 'mouseout', handler: () => void): this;
  getLatLng(): LeafletLatLng;
}
/** A plain layerGroup OR a markerClusterGroup — markers are added to it, it is
 *  added to the map. The two are interchangeable here (we call no cluster-only
 *  method on the instance), so the widget can swap which one backs the markers. */
interface LeafletMarkerLayer {
  addTo(map: LeafletMap): this;
  clearLayers(): this;
}
interface LeafletFeatureGroup {
  getBounds(): LeafletBounds;
}
interface LeafletTileLayer {
  addTo(map: LeafletMap): this;
  on(type: 'tileerror' | 'load', handler: () => void): this;
}
/** Handed to markerClusterGroup's iconCreateFunction — the only cluster member used. */
interface LeafletCluster {
  getChildCount(): number;
}
interface LeafletMap {
  setView(center: LatLngTuple, zoom: number): this;
  fitBounds(bounds: LeafletBounds, options?: { padding?: [number, number]; maxZoom?: number }): this;
  on(type: 'click', handler: (e: LeafletMouseEvent) => void): this;
  on(type: 'move' | 'zoom', handler: () => void): this;
  latLngToContainerPoint(latlng: LatLngTuple): LeafletPoint;
  removeLayer(layer: LeafletMarkerLayer): this;
  invalidateSize(): this;
  remove(): this;
}
interface LeafletStatic {
  map(el: HTMLElement, options?: { zoomControl?: boolean; attributionControl?: boolean }): LeafletMap;
  tileLayer(url: string, options?: { maxZoom?: number; attribution?: string }): LeafletTileLayer;
  marker(latlng: LatLngTuple, options?: { icon?: LeafletDivIcon }): LeafletMarker;
  divIcon(options: { className?: string; html?: string; iconSize?: [number, number]; iconAnchor?: [number, number] }): LeafletDivIcon;
  layerGroup(): LeafletMarkerLayer;
  featureGroup(layers: LeafletMarker[]): LeafletFeatureGroup;
  /** Added by the leaflet.markercluster plugin (loaded after core). Returns the
   *  same shape we treat any marker layer as. */
  markerClusterGroup(options?: {
    iconCreateFunction?: (cluster: LeafletCluster) => LeafletDivIcon;
    maxClusterRadius?: number;
    showCoverageOnHover?: boolean;
    spiderfyOnMaxZoom?: boolean;
    chunkedLoading?: boolean;
  }): LeafletMarkerLayer;
}
// Ambient-Deklarationen für Plugin + CSS-Importe liegen in
// src/types/leaflet-plugins.d.ts (mit-generiert) — ein untypisiertes Modul
// kann nicht aus einer Modul-Datei heraus deklariert werden (TS2665).
let L: LeafletStatic;  // gesetzt von loadLeaflet(); vor 'ready' greift kein Codepfad zu

let leafletPromise: Promise<void> | null = null;

/** Leaflet-Core (FATAL bei Fehler → MapError; Promise-Reset erlaubt Retry) und
 *  danach das markercluster-Plugin (NON-fatal: ohne Plugin plotten alle Pins
 *  ungeclustert — Clustering ist Enhancement, keine Voraussetzung). Der Import
 *  ist Vite-dedupliziert: GeoMapPicker und weitere Karten teilen denselben
 *  Chunk und dasselbe Modul-Objekt — das alte DOM-Polling entfällt. */
function loadLeaflet(): Promise<void> {
  if (!leafletPromise) {
    leafletPromise = (async () => {
      await import('leaflet/dist/leaflet.css');
      const mod: unknown = await import('leaflet');
      L = ((mod as { default?: unknown }).default ?? mod) as LeafletStatic;
      (window as unknown as { L: LeafletStatic }).L = L;  // UMD-Plugins erwarten das Global
      try {
        await import('leaflet.markercluster/dist/MarkerCluster.css');
        await import('leaflet.markercluster');  // hängt markerClusterGroup an L
      } catch { /* clustering unavailable; pins plot unclustered */ }
    })().catch(err => { leafletPromise = null; throw err; });
  }
  return leafletPromise;
}

/** True once the markercluster plugin has attached `L.markerClusterGroup`. The
 *  cast keeps the probe honest — the facade declares the member as present, but
 *  at runtime it only exists after the plugin module executed. */
function clusterLoaded(): boolean {
  return typeof L !== 'undefined' && typeof (L as { markerClusterGroup?: unknown }).markerClusterGroup === 'function';
}

// ── Tone pin (L.divIcon HTML string — no React in Leaflet's DOM) ────────────
// The teardrop's colour comes from the shared TONE_DOT palette (the single
// source of tone values). TONE_DOT is a `bg-*` utility; the SVG fills with
// `currentColor`, so we swap the prefix to the matching `text-*` utility — the
// COLOUR stays defined once in primitives, only the CSS property differs.
// `count > 1`: co-located records share one pin (see the marker effect); a badge
// shows how many, and the popup lists them all so none is hidden under the stack.
// `icon` (optional): a white Tabler glyph from the closed MAP_ICONS set, embedded
// in the teardrop head (scaled 24→16, centred on the head); without it the head
// carries the plain white status dot. Still a pure HTML string — no React in
// Leaflet's DOM (HARD RULE), so the icon is inlined SVG markup, not a component.
function pinHtml(tone: MapTone, count: number, icon?: MapIcon): string {
  const textColor = TONE_DOT[tone].replace('bg-', 'text-');
  const head = icon
    ? `<g transform="translate(6 5.5) scale(0.667)" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[icon]}</g>`
    : `<circle cx="14" cy="14" r="5.2" fill="#ffffff"/>`;
  const badge = count > 1
    ? `<span class="absolute -right-2 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-bold leading-none text-background ring-2 ring-card">${count}</span>`
    : '';
  return `<span class="relative block ${textColor} drop-shadow-md"><svg width="28" height="38" viewBox="0 0 28 38" xmlns="http://www.w3.org/2000/svg"><path d="M14 0C6.27 0 0 6.27 0 14c0 9.5 14 24 14 24s14-14.5 14-24C28 6.27 21.73 0 14 0z" fill="currentColor"/>${head}</svg>${badge}</span>`;
}

// Cluster bubble (markercluster's iconCreateFunction). Dashboard-styled — a
// primary-tone circle with the child count, sized in three steps — instead of
// the plugin's default coloured circles (which we don't load the CSS for). A
// pure HTML string like the pins (no React in Leaflet's DOM). The Tailwind
// classes are string literals here, so the content scanner keeps them.
function clusterIcon(cluster: LeafletCluster): LeafletDivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 44 : 52;
  const fontPx = count < 1000 ? 13 : 11;
  return L.divIcon({
    className: '',
    html: `<span class="flex items-center justify-center rounded-full bg-primary font-semibold text-white shadow-md ring-2 ring-card" style="width:${size}px;height:${size}px;font-size:${fontPx}px">${count}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Germany centre — the seed when no defaultCenter and no markers (an in-place
// empty map, never a "not found" box; that idiom is RecordView's).
const SEED_CENTER: LatLngTuple = [51.1657, 10.4515];
const SEED_ZOOM = 6;

/** Defensive coordinate guard — runs BEFORE any L.marker call. L.marker([NaN,
 *  NaN]) silently lands at [0,0] (Gulf of Guinea) and wrecks fitBounds, so a
 *  non-finite or out-of-range coordinate must be dropped here (and COUNTED). */
function isValidMarker(m: MapMarker): boolean {
  return (
    Number.isFinite(m.lat) && Number.isFinite(m.long) &&
    Math.abs(m.lat) <= 90 && Math.abs(m.long) <= 180
  );
}

// The open popup holds the GROUP of records at one point (1 for a lone pin, N
// for co-located ones) plus the pin's container-pixel position.
type ActivePopup = { markers: MapMarker[]; x: number; y: number };

type MapWidgetProps = {
  markers: MapMarker[];
  /** A clicked marker MUST open a <RecordOverlay> (HARD RULE 1). */
  onMarkerClick?: (marker: MapMarker) => void;
  /** DEFAULT create affordance: tap an empty point → its coords; wire it to open
   *  a create dialog pre-filled with them. Omit ONLY for a read-only map (the
   *  crosshair affordance is off then). Object form, NOT (lat, long). */
  onMapPointClick?: (point: { lat: number; long: number }) => void;
  /** SEED only — the widget owns the view via auto-fit after first paint. */
  defaultCenter?: { lat: number; long: number };
  defaultZoom?: number;
  /** Optional key overlay (bottom-left) explaining the pin colours/symbols. */
  legend?: MapLegendItem[];
  /** Force marker clustering on/off. DEFAULT undefined = auto (clusters above
   *  CLUSTER_AUTO_THRESHOLD distinct points). Set `false` to always show every
   *  pin, `true` to always aggregate. */
  cluster?: boolean;
  children?: ReactNode;
};

// Leaflet renders its zoom control as its OWN DOM (not React), so it can't take
// Tailwind classes directly — we restyle it from the container via arbitrary
// variants (same mechanism as the crosshair cursor). `!` beats Leaflet's own
// `.leaflet-bar` stylesheet (which uses no !important). The result matches the
// dashboard: a soft rounded group, card background, secondary/primary hover —
// instead of the default sharp-cornered white box with a hard black border.
const ZOOM_CONTROL_CLASSES = [
  '[&_.leaflet-control-zoom]:!m-3',
  '[&_.leaflet-control-zoom]:!rounded-xl',
  '[&_.leaflet-control-zoom]:!border-0',
  '[&_.leaflet-control-zoom]:!overflow-hidden',
  '[&_.leaflet-control-zoom]:!shadow-lg',
  '[&_.leaflet-control-zoom]:!ring-1',
  '[&_.leaflet-control-zoom]:!ring-black/5',
  '[&_.leaflet-bar_a]:!h-9',
  '[&_.leaflet-bar_a]:!w-9',
  '[&_.leaflet-bar_a]:!leading-9',
  '[&_.leaflet-bar_a]:!text-lg',
  '[&_.leaflet-bar_a]:!font-medium',
  '[&_.leaflet-bar_a]:!bg-card',
  '[&_.leaflet-bar_a]:!text-foreground',
  '[&_.leaflet-bar_a]:!border-border',
  '[&_.leaflet-bar_a:hover]:!bg-secondary',
  '[&_.leaflet-bar_a:hover]:!text-primary',
  '[&_.leaflet-bar_a.leaflet-disabled]:!bg-muted',
  '[&_.leaflet-bar_a.leaflet-disabled]:!text-muted-foreground/40',
].join(' ');

// One legend swatch: a tone-coloured dot, optionally carrying the same white
// MAP_ICONS glyph the matching pins show. The glyph is a closed-set SVG path
// (ICON_PATHS) — dangerouslySetInnerHTML is safe here (never user input), and
// it keeps the legend in sync with the pins without a React icon component.
function LegendSwatch({ tone = 'default', icon }: { tone?: MapTone; icon?: MapIcon }) {
  return (
    <span className={`relative flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${TONE_DOT[tone]}`} aria-hidden>
      {icon && (
        <svg
          viewBox="0 0 24 24"
          className="h-2.5 w-2.5"
          fill="none"
          stroke="#ffffff"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: ICON_PATHS[icon] }}
        />
      )}
    </span>
  );
}

// ── Navigate-there (data-agnostic: a directions URL is a PURE function of the
// coordinate the widget already owns — no field name, no new prop, nothing for
// the agent to wire). The two consumer map apps; each directions URL deep-links
// the NATIVE app on a phone (turn-by-turn — the Außendienst/delivery case) and
// falls back to the browser map on desktop. `noopener` on every link (a foreign
// origin in a new tab). ──────────────────────────────────────────────────────
export const MAP_NAV_PROVIDERS = [
  {
    id: 'google',
    label: 'Google Maps',
    Icon: IconBrandGoogleMaps,
    href: (lat: number, long: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${long}&travelmode=driving`,
  },
  {
    id: 'apple',
    label: 'Apple Karten',   // DE default; NAV_LABELS overrides it at render
    Icon: IconBrandApple,
    href: (lat: number, long: number) => `https://maps.apple.com/?daddr=${lat},${long}&dirflg=d`,
  },
  {
    id: 'waze',
    label: 'Waze',
    Icon: IconBrandWaze,
    href: (lat: number, long: number) => `https://waze.com/ul?ll=${lat},${long}&navigate=yes`,
  },
] as const;

// Per-locale override for the provider chips. Only Apple's map app has a
// localized name; Google Maps and Waze are brand names in every language.
const NAV_LABELS: Record<Locale, Partial<Record<(typeof MAP_NAV_PROVIDERS)[number]['id'], string>>> = {
  de: {},
  en: { apple: 'Apple Maps' },
};

/** Directions URL to a coordinate. `provider` defaults to Google Maps (the
 *  universal one — native app on mobile, browser on desktop). A pure function of
 *  lat/long — reach for it when a single custom button fits better than the
 *  two-chip MapRouteLinks (e.g. one icon-button in a dense table cell). */
export function mapsDirectionsUrl(lat: number, long: number, provider: 'google' | 'apple' | 'waze' = 'google'): string {
  return (MAP_NAV_PROVIDERS.find(p => p.id === provider) ?? MAP_NAV_PROVIDERS[0]).href(lat, long);
}

/** Route-to-here links — one chip per provider (Google Maps / Apple Karten). Built
 *  into the pin popup below; ALSO exported so you can drop the SAME control into
 *  the <RecordOverlay> detail (pass the record's geo coords). stopPropagation
 *  keeps a chip click from also triggering an enclosing row/card click. */
export function MapRouteLinks({ lat, long, className }: { lat: number; long: number; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className ?? ''}`}>
      {MAP_NAV_PROVIDERS.map(({ id, label, Icon, href }) => (
        <a
          key={id}
          href={href(lat, long)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          <Icon className="h-3.5 w-3.5" stroke={1.5} />
          {NAV_LABELS[i18nLocale][id] ?? label}
        </a>
      ))}
    </div>
  );
}

export function MapWidget(props: MapWidgetProps) {
  const { markers, onMarkerClick, onMapPointClick, defaultCenter, defaultZoom, legend, cluster, children } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerLayerRef = useRef<LeafletMarkerLayer | null>(null);
  // Which kind of layer currently backs the markers (false = plain, true =
  // cluster). Lets the marker effect swap layers only when the decision flips.
  const clusterModeRef = useRef<boolean | null>(null);
  const tilesOkRef = useRef(false);
  // Latest handlers in a ref so the map's once-bound listeners always call the
  // fresh consumer callbacks without re-binding mid-session.
  const handlersRef = useRef({ onMarkerClick, onMapPointClick });
  handlersRef.current = { onMarkerClick, onMapPointClick };
  // A lone-pin popup is a HOVER preview; it floats ~2.5rem above the pin, so the
  // pointer crosses empty map to reach it (mouseout would snatch it away first).
  // We DEFER the close a beat and CANCEL it if the pointer enters the popup — the
  // standard hovercard grace period, and the only way the popup's Route links are
  // reachable on a lone pin. (Stacked popups are click-opened and don't use it.)
  const closeTimerRef = useRef<number | null>(null);
  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  }, []);
  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [active, setActive] = useState<ActivePopup | null>(null);

  // Defensive filtering (HARD RULE 4): invalid coords are dropped AND counted.
  const valid = useMemo(() => markers.filter(isValidMarker), [markers]);
  const dropped = markers.length - valid.length;
  // Stable signature: the marker effect (auto-fit) re-runs only when the plotted
  // set actually changes, never on every parent re-render (which would re-snap
  // the view and fight the user's pan/zoom).
  const markersKey = useMemo(
    () => valid.map(m => `${m.id}@${m.lat},${m.long}#${m.tone ?? ''}~${m.icon ?? ''}`).join('|'),
    [valid],
  );

  const load = useCallback(() => {
    setStatus('loading');
    setError(null);
    loadLeaflet().then(() => setStatus('ready')).catch(e => { setError(e); setStatus('error'); });
  }, []);
  useEffect(() => { load(); }, [load]);

  // Init the map once Leaflet is ready. Seeded to defaultCenter/defaultZoom (or
  // Germany), then the marker effect takes over the view via auto-fit.
  useEffect(() => {
    if (status !== 'ready' || !containerRef.current || mapRef.current) return;
    const el = containerRef.current;
    const map = L.map(el, { zoomControl: true, attributionControl: true });
    map.setView(
      defaultCenter ? [defaultCenter.lat, defaultCenter.long] : SEED_CENTER,
      defaultZoom ?? SEED_ZOOM,
    );
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      // Licence requirement — wired in, non-removable.
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    });
    tiles.on('load', () => { tilesOkRef.current = true; });
    // Total tile block (e.g. OSM rejecting a missing Referer) before a single
    // tile ever loaded → MapError, not a silent grey grid. A transient miss
    // after tiles have shown is tolerated.
    tiles.on('tileerror', () => { if (!tilesOkRef.current) { setError(new Error(MW[i18nLocale].tileError)); setStatus('error'); } });
    tiles.addTo(map);
    // Default to a plain layer; the marker effect swaps in a cluster group when
    // the dataset (or the `cluster` prop) calls for it.
    markerLayerRef.current = L.layerGroup().addTo(map);
    clusterModeRef.current = false;

    // A click on the EMPTY map (Leaflet does not bubble marker clicks here)
    // dismisses an open popup, and — if wired — fires the create affordance.
    map.on('click', (e: LeafletMouseEvent) => {
      setActive(null);
      handlersRef.current.onMapPointClick?.({ lat: e.latlng.lat, long: e.latlng.lng });
    });
    // Keep the popup glued to its pin as the map moves/zooms.
    const reposition = () => setActive(a => (a ? { ...a, ...pointFor(map, a.markers[0].lat, a.markers[0].long) } : a));
    map.on('move', reposition);
    map.on('zoom', reposition);

    mapRef.current = map;
    // invalidateSize on EVERY container resize (column resize, sidebar toggle,
    // accordion) — not once after mount (the GeoMapPicker footgun) — so tiles
    // never leave grey gaps. Leaflet is intrinsically responsive otherwise.
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => mapRef.current?.invalidateSize())
      : null;
    ro?.observe(el);
    // First paint after the container has its real size.
    const t = window.setTimeout(() => map.invalidateSize(), 60);

    return () => {
      window.clearTimeout(t);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      clusterModeRef.current = null;
    };
  }, [status, defaultCenter, defaultZoom]);

  // Plot the markers + auto-fit. Re-runs only when the valid set changes
  // (markersKey) or the map (re)mounts. The widget OWNS the view here.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // Co-located records (IDENTICAL coordinates) collapse into ONE pin — without
    // this, a second record at the same point renders exactly on top of the
    // first and the one underneath is invisible AND unclickable (zoom can never
    // separate identical points). The grouped pin carries a count badge; its
    // popup lists every record at that point, each opening the overlay. Grouping
    // is EXACT coordinate equality (6 dp ≈ 0.11 m), NOT a zoom radius — radius
    // aggregation is CLUSTERING, which composes on top of this (just below).
    const groups = new Map<string, MapMarker[]>();
    for (const m of valid) {
      const key = `${m.lat.toFixed(6)},${m.long.toFixed(6)}`;
      const g = groups.get(key);
      if (g) g.push(m); else groups.set(key, [m]);
    }
    // Clustering decision: the explicit `cluster` prop wins; otherwise auto above
    // the threshold. Gated on clusterLoaded() — if the plugin failed to load we
    // plot every pin unclustered (no silent loss). Co-location already ran above,
    // so clustering aggregates DISTINCT nearby points, never identical ones.
    const wantCluster = (cluster ?? groups.size > CLUSTER_AUTO_THRESHOLD) && clusterLoaded();
    // (Re)create the backing layer ONLY when the mode flips — rebuilding it on
    // every data change would needlessly tear down the whole cluster tree.
    if (clusterModeRef.current !== wantCluster) {
      if (markerLayerRef.current) map.removeLayer(markerLayerRef.current);
      markerLayerRef.current = wantCluster
        ? L.markerClusterGroup({ iconCreateFunction: clusterIcon, maxClusterRadius: 60, showCoverageOnHover: false, spiderfyOnMaxZoom: true, chunkedLoading: true })
        : L.layerGroup();
      markerLayerRef.current.addTo(map);
      clusterModeRef.current = wantCluster;
    }
    const layer = markerLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const leafletMarkers: LeafletMarker[] = [];
    for (const group of groups.values()) {
      const head = group[0];
      const mk = L.marker([head.lat, head.long], {
        icon: L.divIcon({ className: '', html: pinHtml(head.tone ?? 'default', group.length, head.icon), iconSize: [28, 38], iconAnchor: [14, 38] }),
      });
      const at = () => pointFor(map, head.lat, head.long);
      // Lone pin: hover previews, mouseout dismisses AFTER a grace beat (so the
      // pointer can reach the popup's Route links without it being snatched away
      // — see closeTimerRef). Stacked pin: hover does nothing — it opens the LIST
      // popup on click and stays open (mouseout must not snatch it before a pick).
      mk.on('mouseover', () => { if (group.length === 1) { clearCloseTimer(); setActive({ markers: group, ...at() }); } });
      mk.on('mouseout', () => {
        if (group.length !== 1) return;
        clearCloseTimer();
        closeTimerRef.current = window.setTimeout(
          () => setActive(a => (a && a.markers.length === 1 && a.markers[0].id === head.id ? null : a)),
          140,
        );
      });
      // Lone pin click: open the popup AND fire onMarkerClick (HARD RULE 1 — the
      // consumer opens the <RecordOverlay>). Stacked pin click: open the list
      // ONLY — we must not guess which of the N to open; the row click does.
      mk.on('click', () => {
        clearCloseTimer();
        setActive({ markers: group, ...at() });
        if (group.length === 1) handlersRef.current.onMarkerClick?.(head);
      });
      mk.addTo(layer);
      leafletMarkers.push(mk);
    }
    // Auto-fit (internal, no prop): frame every pin GROUP. 1 group → a sensible
    // fixed zoom; 0 → keep the seed view (in-place empty).
    if (leafletMarkers.length === 1) {
      map.setView([valid[0].lat, valid[0].long], 13);
    } else if (leafletMarkers.length > 1) {
      map.fitBounds(L.featureGroup(leafletMarkers).getBounds(), { padding: [48, 48], maxZoom: 13 });
    }
    // Drop a stale popup whose group's lead marker is gone after a data change.
    setActive(a => (a && valid.some(m => m.id === a.markers[0].id) ? a : null));
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [markersKey, status, cluster]);

  if (status === 'loading') return <MapSkeleton />;
  if (status === 'error') return <MapError error={error} onRetry={load} />;

  return (
    // `h-full` lets the card FILL a stretched parent (e.g. a grid cell sized by
    // a taller sibling column) instead of leaving a gap below a fixed height;
    // when the parent height is auto, h-full resolves to auto and the map's
    // min-height floor (below) sets the size — so standalone is unchanged.
    <div className="flex h-full flex-col gap-4">
      {children}
      {/* `isolate` (isolation: isolate) TRAPS Leaflet's hardcoded pane/control
          z-indexes (panes 200–700, controls/zoom up to 1000) inside THIS card's
          own stacking context. Leaflet ships values an order of magnitude above
          the app's --z-* token ladder (max --z-drag: 100); without isolation
          they leak into the page's root context and punch the zoom controls +
          pins through the sidebar, chat widget and even the RecordOverlay. With
          it, the whole map participates in the page as ordinary content (z-auto)
          and every token-laddered overlay (fixed + --z-*, body-portalled) paints
          above it — exactly as the ladder intends. The popup's z-[1100] below is
          scoped to THIS context too (above Leaflet's 1000, below app overlays). */}
      <div className="flex min-h-0 flex-1 flex-col rounded-[27px] bg-card shadow-lg overflow-hidden isolate">
        {dropped > 0 && (
          <div role="status" aria-live="polite" className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-700">
            <IconAlertCircle size={16} className="shrink-0" />
            <span className="min-w-0 flex-1">
              {recordsLabel(dropped, i18nLocale)} {MW[i18nLocale].withoutLocation}
            </span>
          </div>
        )}
        {/* flex-1 + min-height floor: grows to fill the card (which fills the
            parent) but never collapses below 420px / 320px mobile. The map
            container is `absolute inset-0` so Leaflet always gets a resolved
            box, regardless of how the flex height resolves. */}
        <div className="relative min-h-[420px] flex-1 max-sm:min-h-[320px]">
          <div
            ref={containerRef}
            className={`absolute inset-0 ${ZOOM_CONTROL_CLASSES} ${onMapPointClick ? '[&_.leaflet-container]:cursor-crosshair' : ''}`}
            aria-label={MW[i18nLocale].map}
          />
          {legend && legend.length > 0 && (
            // A compact key OVERLAY (bottom-left, above tiles/controls at z-[1000],
            // below the z-[1100] popup). pointer-events-none so it NEVER eats a map
            // click — it is purely informational; the consumer owns the meanings.
            <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-[60%] rounded-xl border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur-sm">
              <ul className="flex flex-col gap-1.5">
                {legend.map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-xs font-medium text-foreground">
                    <LegendSwatch tone={item.tone} icon={item.icon} />
                    <span className="truncate">{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {active && (
            // z-[1100]: a RAW value, not the `--z-*` ladder — this popup is
            // scoped to the map's LOCAL stacking context (the `relative` wrapper
            // above), and must only out-rank Leaflet's own panes/controls
            // (z ≤ ~1000). The fixed <RecordOverlay> (z-overlay) still paints
            // above it, as it should. One ROW per record at this point (1 for a
            // lone pin, N for co-located ones) — each row fires onMarkerClick so
            // every stacked record is reachable, never hidden under the pin.
            <div
              className="pointer-events-auto absolute z-[1100] w-[240px] -translate-x-1/2 -translate-y-[calc(100%+2.5rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/5"
              style={{ left: active.x, top: active.y }}
              // Entering the popup CANCELS the lone-pin close timer (the pointer
              // arrived); leaving it closes a lone-pin hover preview at once
              // (a stacked, click-opened list stays — only the map click / a row
              // pick dismisses that).
              onMouseEnter={clearCloseTimer}
              onMouseLeave={() => setActive(a => (a && a.markers.length === 1 ? null : a))}
            >
              {active.markers.length > 1 && (
                <div className="border-b border-border bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
                  {active.markers.length} Einträge an diesem Ort
                </div>
              )}
              <div className="max-h-48 overflow-auto">
                {active.markers.map(m => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handlersRef.current.onMarkerClick?.(m)}
                    className="flex w-full items-start gap-2 px-3 py-2 max-sm:py-3 text-left transition-colors hover:bg-secondary"
                  >
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[m.tone ?? 'default']}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-foreground">{m.title}</span>
                      {m.subtitle != null && m.subtitle !== '' && (
                        <span className="block truncate text-xs text-muted-foreground">{m.subtitle}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
              {/* Navigate-there footer: co-located records share EXACT coordinates,
                  so ONE route control serves the whole popup. Outside the scroll
                  area so it never scrolls away; coords from the lead marker. */}
              <div className="flex items-center gap-2 border-t border-border bg-secondary/40 px-3 py-2">
                <IconNavigation className="h-3.5 w-3.5 shrink-0 text-muted-foreground" stroke={1.5} aria-hidden />
                <MapRouteLinks lat={active.markers[0].lat} long={active.markers[0].long} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Pin's current container-pixel position (popup anchor) from its lat/long.
function pointFor(map: LeafletMap, lat: number, long: number): { x: number; y: number } {
  const p = map.latLngToContainerPoint([lat, long]);
  return { x: p.x, y: p.y };
}

// ── State wrappers (Skeleton / Error — same self-framing card as the family) ─

export function MapSkeleton() {
  return (
    // Mirrors the live card's fill behaviour so there is no height jump on ready.
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col rounded-[27px] bg-card shadow-lg overflow-hidden animate-pulse" aria-busy="true">
        <div className="relative min-h-[420px] flex-1 max-sm:min-h-[320px] bg-muted">
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-muted-foreground/60">
            <IconMapPin size={32} stroke={1.5} />
            <span className="h-3 w-28 rounded bg-muted-foreground/20" />
          </div>
        </div>
      </div>
    </div>
  );
}

type MapErrorProps = {
  error?: unknown;
  title?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ComponentType<{ size?: number | string; stroke?: number | string }>;
  className?: string;
};

export function MapError({ error, title = MW[i18nLocale].errorTitle, onRetry, retryLabel = MW[i18nLocale].retry, icon: Icon = IconAlertCircle, className }: MapErrorProps) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : MW[i18nLocale].retryHint;
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
