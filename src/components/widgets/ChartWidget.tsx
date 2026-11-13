/**
 * ChartWidget — vor-generiertes Reporting-Karten-Widget (Archetyp B).
 *
 * Ordnet die MENGEN-Achse: Verteilung pro Kategorie, Verlauf über Zeit, Anteil
 * am Ganzen. Die Karte, die eine Zahl AUFBRICHT — zwischen KPI-Punktwert
 * (StatCard/StatStrip) und exakter Tabelle. Compose; never reimplement.
 *
 * @version 1.1.1
 * @since 2026-07-07  (1.1.1: adversarial-round fixes — the selection is ONE
 *                     identity now: collision key suffixes hash the label
 *                     (rank-stable, a rank swap can no longer silently match
 *                     the WRONG segment), and a selection that slides under
 *                     the cap into "Andere" stays ACTIVE (chip keeps its
 *                     label) — "Filter entfällt" appears only when the
 *                     category left the data, exactly when sel.test goes
 *                     empty on the sibling. "Andere" rows stop propagation
 *                     (clicking them is not an empty-click reset); legend
 *                     dots render only for segments that own a ring slice.
 * @since 2026-07-07  (1.1.0: the two specified Common extensions land —
 *                     `mode:'filter'` (the chart as the page's facet for ONE
 *                     axis; CONTROLLED, type-entangled to kind:'category', a
 *                     time filter cannot compile; toggle/dim/chip/aria-pressed
 *                     built in; a stale selection renders a "Filter entfällt ✕"
 *                     chip — derived rendering, NO auto-callback) and
 *                     `mark:'donut'` on the category arm (cap drops to
 *                     min(maxCategories, 5), the list stays as legend,
 *                     negative sums fall back to bars + notice).
 * @since 2026-07-06  (1.0.3: EVERY bucket up to 6 gets its axis label — a
 *                     four-month axis reading „Apr. Mai Juli“ made Juni look
 *                     MISSING; the first/mid/last rule now starts at 7+.
 * @since 2026-07-06  (1.0.2: HUMAN TIME LABELS — the axis reads „Mai,
 *                     Juni, Juli“ / „5. Mai“ / „KW 23“ instead of numeric
 *                     stamps; the year appears only when the axis spans years
 *                     (the head range always carries it). First-glance
 *                     readability is the WIDGET's duty, never the agent's.
 * @since 2026-07-06  (1.0.1: HONEST EDGES — the head shows the RANGE, never
 *                     the bucket unit ("520 € · pro Monat" on a two-month
 *                     total was a false statement; the unit is an axis
 *                     notice); a running last bucket renders HOLLOW + an
 *                     "unvollständig" notice — a mid-month crash is an
 *                     artifact, not a trend.
 * @since 2026-07-06  (1.0.0: first release per docs/RESEARCH-CHART-WIDGET.md —
 *                     typed dimension/measure with the family's ChartRow
 *                     accessor signature, aggregation on RAW values inside the
 *                     widget, the mark FOLLOWS the dimension (category →
 *                     BarList, time → sparse line; a wrong chart type cannot
 *                     compile), head total that absorbs the metric's StatCard,
 *                     hard caps (8/12 categories + "Andere", 60 time buckets
 *                     with deterministic coarsening), calendar-complete time
 *                     axis, NOTHING-disappears notices, drill interaction,
 *                     focus value label, hand-rolled SVG — zero dependencies.)
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. The widget owns NO detail layer and NO filter state. A click REPORTS a
 *     segment (rowIds + test predicate); what "open" means is YOUR composition.
 *     Detail = <RecordOverlay> from RecordView — a SINGLE-record shell: map the
 *     segment's rowIds to records and page via onPrev/onNext + counter (see
 *     ./ChartWidget.example.tsx). RecordOverlay has NO rowIds/title prop.
 *     FILTER MODE is CONTROLLED for the same reason — you hold the selection:
 *       const [sel, setSel] = useState<ChartSegment<T> | null>(null);
 *       <ChartWidget rows={fullRows} …                        // NEVER sel-filtered
 *         interaction={{ mode: 'filter', selectedKey: sel?.key ?? null, onSelect: setSel }} />
 *       …siblingRows.filter(r => !sel || sel.test(r))         // sel.test hits the SIBLING
 *     Axes compose as AND: a chart receives rows filtered by every OTHER
 *     control on the page, never by its own selection (HARD RULE 6). When the
 *     data changes under a set filter, the chip follows what `sel.test` still
 *     DOES on the sibling: a category that merely slid under the cap into
 *     "Andere" stays an ACTIVE selection (chip keeps its label, only the
 *     "Andere" row stays lit); only a category that left the DATA renders
 *     "Filter entfällt ✕" (sel.test now matches nothing — sibling is empty).
 *     The widget NEVER calls onSelect for you; the chip click is the reset.
 *  2. Never edit this file (nor ./primitives.ts); never import from a sister
 *     widget. Gaps → `footer` (text only) + // TODO(widget-gap). Never fork.
 *  3. Data-agnostic: accessors read the typed row; every key is OPAQUE. The
 *     widget aggregates ITSELF — NEVER pass precomputed chart points.
 *  4. Raw-value contract: aggregation reads accessors, never formatted strings.
 *     `format` decides rendering only (head sum, list values, ticks, focus
 *     label). 'currency' renders via the shared family formatter
 *     (formatCurrency), like the widget family.
 *  5. NOTHING disappears silently: null/'' category → "Ohne Angabe" row;
 *     non-finite measure and unparseable time strings → "n ohne Wert" notice;
 *     "Andere (N)" always visible and last; capped categories → "7 von N"
 *     (one slot is the "Andere" bucket);
 *     coarsened time bucket → axis notice; the bucket unit is named on the
 *     axis; negative values render as |value| bars with the minus visible on
 *     the raw value.
 *  6. The chart ALWAYS receives the full rows of its question. Filtering rows
 *     by the chart's own segment collapses the card to one 100% bar — filtered
 *     rows go to SIBLING surfaces, never back into the chart.
 *
 * ─── ACCESSOR NORMALIZATION (category) — what the widget yields per shape ──
 *   string                     → the string        ('' → "Ohne Angabe")
 *   number / bool              → String / Ja/Nein (locale)
 *   { label: string, ... }     → label             (lookup & enriched applookup)
 *   any other object           → "Ohne Angabe"     (NEVER silently '')
 *   Array<any of the above>    → every item counts (multilookup; head shows
 *                                "N Nennungen" when mentions ≠ records)
 *   null / undefined           → "Ohne Angabe"
 * Pre-extract nothing: pass the enriched raw value; the widget normalizes.
 * Free-TEXT fields are NOT chart food (unbounded cardinality → everything
 * lands in "Andere") — chart lookups, applookups, bools, dates, numbers.
 *
 * ─── COMMON MISTAKES / NEVER LIST ──────────────────────────────────────
 *  · Multi-series / stacked / grouped / dual-axis / second dimension: NEVER —
 *    two ChartWidgets side by side (small multiples) or the escape clause.
 *  · Vertical axis bars / area: NEVER — the BarList reads better in both
 *    geometries; area is a line sub-variant without a new question.
 *  · Zoom/brush, MULTI-select filter, sequential color scales, free sorting,
 *    custom tooltips, renderSegment slots, sparkline/mini mode: NEVER — the
 *    mini slot is StatCard's `footer`, not a chart mode. (mode:'filter' is
 *    SINGLE-select by design — for open axes with many options a table facet
 *    is the better control, see the interaction docs above.)
 *  · mark:'donut' ONLY for ≤5 exhaustive parts of a NAMED whole (a closed
 *    status set, rooms of the house). Open/long-tail axes stay a BarList —
 *    the donut cap is min(maxCategories, 5) and everything else collapses
 *    into "Andere". The list always renders with it (it IS the legend).
 *    Combining donut with mode:'filter' is legal but the tighter cap makes
 *    selections slide into "Andere" sooner — they stay active there (chip).
 *  · Export (image/CSV/print), realtime/auto-refresh/polling: NEVER.
 *  · Hand-built recharts charts: rejected — one render stack, one theming;
 *    recharts is sanctioned ONLY for StatCard footer sparklines.
 *  · Non-existent props (by design): yMin/domain, free colors/hex,
 *    valueFormatter functions, legend config, series arrays, interpolate,
 *    sort switches, a free chart-type enum.
 */
import { useMemo, useState, type ReactNode, type ComponentType } from 'react';
import { IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { addDays, addMonths, addWeeks, differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarISOWeeks, endOfISOWeek, endOfMonth, format, isValid, parseISO, startOfDay, startOfISOWeek, startOfMonth } from 'date-fns';
import { de as dfnsDe } from 'date-fns/locale';
import { formatCurrency } from '@/lib/formatters';
import { TONE_TEXT, labelOf, type WidgetTone } from './primitives';
import { coreLocale as i18nLocale, type CoreLocale as Locale } from '@/i18n';

// Closed tone enum — const array export (family KANBAN_TONES pattern).
export const CHART_TONES = ['default', 'primary', 'success', 'warning', 'destructive'] as const;
export type ChartTone = (typeof CHART_TONES)[number];
// Parity lock against primitives (MapWidget precedent): if WidgetTone ever
// drifts, this line stops compiling.
const _toneParity: Record<ChartTone, WidgetTone> = { default: 'default', primary: 'primary', success: 'success', warning: 'warning', destructive: 'destructive' };
void _toneParity;

/** Getypte Records — Familien-Konvention, identisch Kanban/Map.
 *  id = `entity:${record_id}` (die einzige ID-Quelle). */
export interface ChartRow<T> { id: string; data: T }

/** Format-Vokabular des Charts. 'number'/'currency' sind die Literale des
 *  Familien-Vokabulars (RecordFieldFormat-Erweiterung); 'percent' ist
 *  chart-lokal (Anteil ist eine Aggregat-Eigenschaft, kein Record-Feld —
 *  es gehört bewusst nicht ins Record-Vokabular). */
export type ChartValueFormat = 'number' | 'currency' | 'percent';

/** Sprach-Texte des Widgets (Familien-Muster: eingebaute UI-Map + locale). */
export interface ChartTexts {
  countLabel: string;        // "Anzahl" / "Count"   (Kopf bei measure weggelassen)
  otherLabel: string;        // "Andere" / "Other"
  missingLabel: string;      // "Ohne Angabe" / "Not specified"
  noValueNotice: string;     // "{n} ohne Wert"
  cappedNotice: string;      // "{shown} von {total} Kategorien"
  mentionsLabel: string;     // "{n} Nennungen"
  coarsenedNotice: string;   // "gebündelt pro {unit}"
  partialNotice: string;     // "{label} unvollständig" (laufender Rand-Bucket)
  emptyLabel: string;        // "Keine Daten"
  filterRemovedLabel: string;   // "Filter entfällt" (Selektion existiert nicht mehr)
  donutNegativeNotice: string;  // "negative Werte — als Liste" (Donut-Fallback)
}

/** EINE Dimensions-Achse. `kind` ist das semantische Typ-Signal (Vega-Lite-
 *  Prinzip): Skala, Sortierung, Lücken-Behandlung leitet das WIDGET ab. Die
 *  Mark folgt der Dimension — category→BarList, time→Linie; ein Zeit-Donut
 *  oder ein „falscher Chart-Typ" ist per Typsystem unbaubar.
 *  SIGNATUR: accessor nimmt (row: ChartRow<T>) — die Familien-Signatur. */
export type ChartDimension<T> =
  | { kind: 'category';
      accessor: (row: ChartRow<T>) => unknown;
      label?: string;
      /** Donut NUR hier, nie auf 'time'. When-to-use: ≤5 erschöpfende Teile
       *  eines BENANNTEN Ganzen. Cap fällt auf min(maxCategories, 5); die
       *  Liste bleibt (sie IST die Legende); Negativ-Summen → Bars + Notice. */
      mark?: 'donut' }
  | { kind: 'time';
      accessor: (row: ChartRow<T>) => string | null;  // ISO-Rohstring; invalid ≡ null
      label?: string;
      bucket?: 'day' | 'week' | 'month' | 'auto' };   // Default 'auto'; Hard-Cap 60

/** EINE Mess-Serie. WEGGELASSEN = count. sum/avg ERZWINGEN `value` + `label`. */
export type ChartMeasure<T> =
  | { aggregate?: 'count'; label?: string; format?: ChartValueFormat }
  | { aggregate: 'sum' | 'avg'; label: string;
      value: (row: ChartRow<T>) => number | null;     // ROHZAHL; null/NaN → Notice
      format?: ChartValueFormat };

/** Post-Aggregation. Das Widget besitzt die Bucket-Semantik (Top-N, „Andere",
 *  Zeit-Buckets) — also liefert ES Prädikat und Mitglieds-Snapshot. Der
 *  Konsument re-implementiert NIE Bucket-Logik. */
export interface ChartSegment<T> {
  key: string;       // deterministisch: slug(normalisiertes Label); Sonderfälle
                     // '__other__', '__missing__'; Zeit: ISO-Bucket-Key.
  label: string;
  value: number;
  share: number;     // value / Σ|values| ∈ [0,1]
  rowIds: string[];  // Mitglieds-Snapshot — das Drill-Futter
  isOther: boolean;
  test: (row: ChartRow<T>) => boolean;
}

/** OPTIONAL — weggelassen = display-only (der sichere Default).
 *  'drill' MELDET ein Segment; 'filter' macht das Chart zur Facette der Seite
 *  für EINE Achse — CONTROLLED: der Konsument hält die Selektion im State, das
 *  Widget rendert Toggle, Dimmen, Chip, aria-pressed und den Leerklick-Reset.
 *  „Andere" ist im Filter-Modus NICHT selektierbar (kein test-Prädikat einer
 *  benennbaren Teilmenge — nur Drill schaut hinein). Typ-Verschränkung: die
 *  Props-Union unten erlaubt 'filter' NUR auf kind:'category' — ein
 *  Zeit-Filter ist unbaubar. */
export type ChartInteraction<T> =
  | { mode: 'drill'; onSegmentClick: (seg: ChartSegment<T>) => void }
  | { mode: 'filter';
      selectedKey: string | null;                        // seg.key der Selektion
      onSelect: (seg: ChartSegment<T> | null) => void }; // Toggle & Reset melden null

interface ChartWidgetBaseProps<T> {
  title: string;                    // Pflicht — die Karte trägt ihre Frage; aria-label
  rows: ChartRow<T>[];              // IMMER die vollen Rows der Frage (HARD RULE 6)
  measure?: ChartMeasure<T>;        // weggelassen = count
  maxCategories?: number;           // Default 8, Hard-Cap 12; Überschuss IMMER → „Andere"
  tone?: (seg: ChartSegment<T>) => ChartTone;  // Zustand, nie Deko
  timeStart?: string;               // ISO — Domain-Ausdehnung (nur kind:'time')
  timeEnd?: string;                 // „bis heute" reicht die SEITE herein
  footer?: ReactNode;               // NUR Text/Inline-Kontext — nie Chart/Tabelle
  emptyLabel?: string;
  locale?: Locale;
  texts?: Partial<ChartTexts>;
  className?: string;
}

/** Interaction ist über den Dimension-Kind parametrisiert (Typ-Verschränkung
 *  filter↔category): auf der Zeitachse kompiliert nur 'drill'. */
export type ChartWidgetProps<T> = ChartWidgetBaseProps<T> & (
  | { dimension: Extract<ChartDimension<T>, { kind: 'category' }>;
      interaction?: ChartInteraction<T> }
  | { dimension: Extract<ChartDimension<T>, { kind: 'time' }>;
      interaction?: Extract<ChartInteraction<T>, { mode: 'drill' }> }
);

// ── built-in strings ─────────────────────────────────────────────────────
const TEXTS: Record<Locale, ChartTexts> = {
  de: {
    countLabel: 'Anzahl', otherLabel: 'Andere', missingLabel: 'Ohne Angabe',
    noValueNotice: '{n} ohne Wert', cappedNotice: '{shown} von {total} Kategorien',
    mentionsLabel: '{n} Nennungen', coarsenedNotice: 'gebündelt pro {unit}',
    partialNotice: '{label} unvollständig', emptyLabel: 'Keine Daten',
    filterRemovedLabel: 'Filter entfällt', donutNegativeNotice: 'negative Werte — als Liste',
  },
  en: {
    countLabel: 'Count', otherLabel: 'Other', missingLabel: 'Not specified',
    noValueNotice: '{n} without value', cappedNotice: '{shown} of {total} categories',
    mentionsLabel: '{n} mentions', coarsenedNotice: 'bucketed per {unit}',
    partialNotice: '{label} incomplete', emptyLabel: 'No data',
    filterRemovedLabel: 'Filter removed', donutNegativeNotice: 'negative values — shown as list',
  },
};
const UNIT: Record<Locale, Record<'day' | 'week' | 'month', string>> = {
  de: { day: 'Tag', week: 'Woche', month: 'Monat' },
  en: { day: 'day', week: 'week', month: 'month' },
};
const YESNO: Record<Locale, [string, string]> = { de: ['Ja', 'Nein'], en: ['Yes', 'No'] };
// „pro Tag" / „per day" / „za den" — Präposition der Takt-Notiz.
const PER: Record<Locale, string> = { de: 'pro', en: 'per' };
// Kalenderwochen-Präfix der Zeitachse.
const WEEK_PREFIX: Record<Locale, string> = { de: 'KW', en: 'W' };
// BCP-47-Tag je Locale (das Widget formatiert gegen seine locale-PROP).
const TAG: Record<Locale, string> = { de: 'de-DE', en: 'en-US' };
const DFNS: Record<Locale, typeof dfnsDe | undefined> = { de: dfnsDe, en: undefined };
const tpl = (s: string, vars: Record<string, string | number>) =>
  s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// ── normalization + keys ─────────────────────────────────────────────────
const MISSING = '__missing__';
const OTHER = '__other__';

function slug(label: string): string {
  const s = label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'x';
}

/** Deterministischer String-Hash (djb2 als h*33, base36) \u2014 NUR f\u00fcrs
 *  Kollisions-Suffix von Slug-Keys. H\u00e4ngt allein am eigenen Label, nie am
 *  Rang. (h*33 statt Links-Shift um 5: der Shift-Operator w\u00e4re in dieser
 *  Template-Pipeline der Jinja2-Variablen-Delimiter.) */
function hashOf(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Normalisiert EIN Kategorie-Item auf sein Label — oder null für "Ohne
 *  Angabe" (Header-Tabelle; ein fremdes Objekt wird NIE still ''). */
function categoryLabelOf(item: unknown, locale: Locale): string | null {
  if (item == null || item === '') return null;
  if (typeof item === 'boolean') return YESNO[locale][item ? 0 : 1];
  if (typeof item === 'number') return String(item);
  if (typeof item === 'string') return item;
  const l = labelOf(item);            // {label}-Objekte (lookup/enriched applookup)
  return l === '' ? null : l;
}

// ── aggregation pipeline (the ONE place transforms live) ─────────────────
type Agg<T> = {
  segments: ChartSegment<T>[];
  headValue: number | null;   // count → rows.length; sum → Σ; avg → Ø (über Rows)
  mentions: number;           // Kategorie-Nennungen (Multilookup-Notice)
  noValueCount: number;       // Rows ohne Mess-/Zeitwert
  cappedTotal: number | null; // Gesamt-Kategorienzahl, wenn gedeckelt
  coarsenedTo: 'week' | 'month' | null;
  unit: 'day' | 'week' | 'month' | null;   // Zeitachse
  partialLast: boolean;      // letzter Bucket läuft noch (Achsen-Ende < Bucket-Ende)
  rangeLabel: string | null; // "06.2026–07.2026" für den Kopf (statt der Einheit)
  otherKeys: Map<string, string> | null;  // key→Label der in „Andere" gebündelten
                             // Kategorien — eine dorthin gerutschte Selektion
                             // bleibt AKTIV (Chip), sie ist nicht entfallen.
};

function measureOf<T>(measure: ChartMeasure<T> | undefined, row: ChartRow<T>): number | null {
  // 'value' in measure narrowt die Union: nur sum/avg tragen den Accessor.
  if (!measure || !('value' in measure)) return 1;
  const v = measure.value(row);
  return v == null || !Number.isFinite(v) ? null : v;
}

function aggregateCategory<T>(
  rows: ChartRow<T>[], dim: Extract<ChartDimension<T>, { kind: 'category' }>,
  measure: ChartMeasure<T> | undefined, maxCategories: number, locale: Locale, texts: ChartTexts,
): Agg<T> {
  const isCount = !measure || measure.aggregate === undefined || measure.aggregate === 'count';
  const isAvg = measure?.aggregate === 'avg';
  type Bucket = { label: string; sum: number; n: number; rowIds: string[] };
  const map = new Map<string, Bucket>();     // key: normalisiertes Label ('' = missing)
  let mentions = 0, noValueCount = 0, headSum = 0, headN = 0;

  for (const row of rows) {
    const m = measureOf(measure, row);
    if (m === null) { noValueCount++; continue; }   // sum/avg ohne Wert: Notice, nie still
    headSum += m; headN++;
    const raw = dim.accessor(row);
    const items = Array.isArray(raw) ? (raw.length ? raw : [null]) : [raw];
    for (const item of items) {
      const label = categoryLabelOf(item, locale);
      mentions += label === null ? 0 : 1;
      const k = label ?? '';
      const b = map.get(k) ?? { label: label ?? texts.missingLabel, sum: 0, n: 0, rowIds: [] };
      b.sum += m; b.n++; b.rowIds.push(row.id);
      map.set(k, b);
    }
  }

  const finish = (b: Bucket) => (isAvg ? (b.n ? b.sum / b.n : 0) : b.sum);
  const missing = map.get('');
  map.delete('');
  // Sortierung: absteigend nach Wert; Tie-Break Label aufsteigend, FIXIERTES Locale.
  const ranked = Array.from(map.entries())
    .map(([k, b]) => ({ norm: k, b, v: finish(b) }))
    .sort((a, z) => z.v - a.v || a.b.label.localeCompare(z.b.label, 'de-DE'));

  const cap = Math.min(Math.max(1, maxCategories), 12);
  const top = ranked.length > cap ? ranked.slice(0, cap - 1) : ranked;
  const rest = ranked.length > cap ? ranked.slice(cap - 1) : [];

  // Slug-Keys deterministisch eindeutig. Kollision (zwei Labels → derselbe
  // Slug) suffixt mit dem Hash des NORMALISIERTEN Labels statt mit -2/-3 in
  // Rangfolge: ein Rang-Tausch der Kollisionspartner darf die Identität nicht
  // umwerfen — sonst matcht ein gehaltener `selectedKey` still das FALSCHE
  // Segment (falsches Label im Chip, falsche Zeile gedimmt).
  const slugCounts = new Map<string, number>();
  for (const r of ranked) { const s = slug(r.b.label); slugCounts.set(s, (slugCounts.get(s) ?? 0) + 1); }
  const keyOf = (label: string, norm: string) => {
    const s = slug(label);
    return (slugCounts.get(s) ?? 0) > 1 ? `${s}-${hashOf(norm)}` : s;
  };

  const segs: ChartSegment<T>[] = top.map(({ norm, b, v }) => {
    const key = keyOf(b.label, norm);
    return {
      key, label: b.label, value: v, share: 0, rowIds: [...new Set(b.rowIds)], isOther: false,
      test: (row: ChartRow<T>) => {
        const raw = dim.accessor(row);
        const items = Array.isArray(raw) ? raw : [raw];
        return items.some(i => (categoryLabelOf(i, locale) ?? '') === norm);
      },
    };
  });
  if (rest.length) {
    const ids = [...new Set(rest.flatMap(r => r.b.rowIds))];
    const v = rest.reduce((s, r) => s + finish(r.b), 0);
    const restNorms = new Set(rest.map(r => r.norm));
    segs.push({
      key: OTHER, label: `${texts.otherLabel} (${rest.length})`, value: v, share: 0,
      rowIds: ids, isOther: true,
      test: (row: ChartRow<T>) => {
        const raw = dim.accessor(row);
        const items = Array.isArray(raw) ? raw : [raw];
        return items.some(i => restNorms.has(categoryLabelOf(i, locale) ?? '§none'));
      },
    });
  }
  if (missing) {
    segs.push({
      key: MISSING, label: texts.missingLabel, value: finish(missing), share: 0,
      rowIds: [...new Set(missing.rowIds)], isOther: false,
      test: (row: ChartRow<T>) => {
        const raw = dim.accessor(row);
        const items = Array.isArray(raw) ? (raw.length ? raw : [null]) : [raw];
        return items.some(i => categoryLabelOf(i, locale) === null);
      },
    });
  }
  const denom = segs.reduce((s, x) => s + Math.abs(x.value), 0) || 1;
  for (const s of segs) s.share = Math.abs(s.value) / denom;

  return {
    segments: segs,
    headValue: isCount ? rows.length - noValueCount : isAvg ? (headN ? headSum / headN : null) : headSum,
    mentions, noValueCount,
    cappedTotal: rest.length ? ranked.length : null,
    coarsenedTo: null, unit: null, partialLast: false, rangeLabel: null,
    otherKeys: rest.length ? new Map(rest.map(r => [keyOf(r.b.label, r.norm), r.b.label])) : null,
  };
}

function aggregateTime<T>(
  rows: ChartRow<T>[], dim: Extract<ChartDimension<T>, { kind: 'time' }>,
  measure: ChartMeasure<T> | undefined, timeStart: string | undefined, timeEnd: string | undefined,
  locale: Locale,
): Agg<T> {
  const isCount = !measure || measure.aggregate === undefined || measure.aggregate === 'count';
  const isAvg = measure?.aggregate === 'avg';
  const parsed: { row: ChartRow<T>; d: Date; m: number }[] = [];
  let noValueCount = 0, headSum = 0, headN = 0;
  for (const row of rows) {
    const m = measureOf(measure, row);
    const s = dim.accessor(row);
    const d = s ? parseISO(s) : null;
    if (m === null || !d || !isValid(d)) { noValueCount++; continue; }   // invalid ≡ null (Rule 5)
    parsed.push({ row, d, m }); headSum += m; headN++;
  }
  const empty: Agg<T> = { segments: [], headValue: null, mentions: 0, noValueCount, cappedTotal: null, coarsenedTo: null, unit: null, partialLast: false, rangeLabel: null, otherKeys: null };
  if (!parsed.length) return empty;

  const extra: Date[] = [];
  for (const s of [timeStart, timeEnd]) { if (s) { const d = parseISO(s); if (isValid(d)) extra.push(d); } }
  const all = [...parsed.map(p => p.d), ...extra];
  const min = new Date(Math.min(...all.map(d => d.getTime())));
  const max = new Date(Math.max(...all.map(d => d.getTime())));

  // Bucket-Wahl: Wunsch (Default 'auto') → Hard-Cap 60 → deterministische
  // Vergröberung day→week→month. Reine Funktion der Datenspanne.
  const counts = {
    day: differenceInCalendarDays(max, min) + 1,
    week: differenceInCalendarISOWeeks(max, min) + 1,
    month: differenceInCalendarMonths(max, min) + 1,
  };
  const wish = dim.bucket && dim.bucket !== 'auto' ? dim.bucket
    : counts.day <= 60 ? 'day' : counts.week <= 60 ? 'week' : 'month';
  const order: ('day' | 'week' | 'month')[] = ['day', 'week', 'month'];
  let unit = wish as 'day' | 'week' | 'month';
  while (counts[unit] > 60 && order.indexOf(unit) < 2) unit = order[order.indexOf(unit) + 1];
  const coarsenedTo = unit !== wish ? (unit as 'week' | 'month') : null;

  // Kalender-Parität: ISO-Wochen (weekStartsOn Montag), identisch zur
  // Kalender-Geometrie der Familie. Erwartung (Beispiel):
  //   2026-06-30 (Di) → week-Key '2026-W27', floor Montag 2026-06-29.
  const floor = (d: Date) => unit === 'day' ? startOfDay(d) : unit === 'week' ? startOfISOWeek(d) : startOfMonth(d);
  const step = (d: Date) => unit === 'day' ? addDays(d, 1) : unit === 'week' ? addWeeks(d, 1) : addMonths(d, 1);
  const keyOf = (d: Date) => unit === 'day' ? format(d, 'yyyy-MM-dd') : unit === 'week' ? format(d, "RRRR-'W'II") : format(d, 'yyyy-MM');
  // Achsen-Labels sind MENSCHLICH („Mai“, „5. Mai“, „KW 23“) — erste-Blick-
  // Lesbarkeit ist Widget-Pflicht, keine Agenten-Aufgabe. Das Jahr erscheint
  // nur, wenn die Achse Jahre überspannt (der Kopf-Zeitraum trägt es immer).
  const dfnsLoc = DFNS[locale];
  const spansYears = min.getFullYear() !== max.getFullYear();
  const labelOfBucket = (d: Date) =>
    unit === 'month' ? format(d, spansYears ? 'MMM yy' : 'MMM', { locale: dfnsLoc })
    : unit === 'week' ? `${WEEK_PREFIX[locale]} ${format(d, 'II')}${spansYears ? ` '${format(d, 'RR')}` : ''}`
    : format(d, spansYears ? (locale === 'en' ? 'MMM d yy' : 'd. MMM yy') : (locale === 'en' ? 'MMM d' : 'd. MMM'), { locale: dfnsLoc });

  type B = { d: Date; sum: number; n: number; rowIds: string[] };
  const byKey = new Map<string, B>();
  // Kalendarisch VOLLSTÄNDIG: leere Buckets existieren (count/sum→0; avg→Lücke).
  for (let d = floor(min); d.getTime() <= max.getTime(); d = step(d)) {
    byKey.set(keyOf(d), { d, sum: 0, n: 0, rowIds: [] });
  }
  for (const p of parsed) {
    const b = byKey.get(keyOf(floor(p.d)));
    if (b) { b.sum += p.m; b.n++; b.rowIds.push(p.row.id); }
  }
  const segs: ChartSegment<T>[] = Array.from(byKey.entries()).map(([key, b]) => ({
    key,
    label: labelOfBucket(b.d),
    // avg mit leerem Bucket = LÜCKE (NaN markiert; 0 wäre eine Lüge) — der
    // Pfad-Builder unterbricht dort.
    value: isAvg ? (b.n ? b.sum / b.n : Number.NaN) : b.sum,
    share: 0,
    rowIds: b.rowIds,
    isOther: false,
    test: (row: ChartRow<T>) => {
      const s = dim.accessor(row);
      const d = s ? parseISO(s) : null;
      return !!d && isValid(d) && keyOf(floor(d)) === key;
    },
  }));
  const denom = segs.reduce((s, x) => s + (Number.isFinite(x.value) ? Math.abs(x.value) : 0), 0) || 1;
  for (const s of segs) s.share = Number.isFinite(s.value) ? Math.abs(s.value) / denom : 0;

  // Laufender Rand-Bucket: das Achsen-Ende (Daten-Max bzw. timeEnd) erreicht
  // das KALENDARISCHE Ende des letzten Buckets nicht — der letzte Wert ist
  // eine Zwischensumme, kein Trend-Punkt. Deterministisch (keine Widget-Uhr).
  const lastStart = floor(max);
  const bucketEnd = unit === 'day' ? lastStart : unit === 'week' ? endOfISOWeek(lastStart) : endOfMonth(lastStart);
  const partialLast = unit !== 'day' && startOfDay(max).getTime() < startOfDay(bucketEnd).getTime();
  const first = segs[0], last = segs[segs.length - 1];
  // Der Kopf-Zeitraum trägt IMMER das Jahr (die Achse darf es weglassen).
  const yearSuffix = spansYears ? '' : ` ${format(max, 'yyyy')}`;
  return {
    segments: segs,
    headValue: isCount ? headN : isAvg ? (headN ? headSum / headN : null) : headSum,
    mentions: 0, noValueCount, cappedTotal: null, coarsenedTo, unit, partialLast,
    rangeLabel: first && last && first !== last
      ? `${first.label}–${last.label}${yearSuffix}`
      : first ? `${first.label}${yearSuffix}` : null,
    otherKeys: null,
  };
}

// ── value rendering (head, list values, ticks, focus label) ─────────────
function formatValue(v: number, fmt: ChartValueFormat | undefined, locale: Locale): string {
  if (fmt === 'currency') return formatCurrency(v);
  if (fmt === 'percent') return `${(v * 100).toLocaleString(TAG[locale], { maximumFractionDigits: 1 })} %`;
  return v.toLocaleString(TAG[locale], { maximumFractionDigits: 2 });
}

/** nice max für die y-Achse: kleinste 1/2/2.5/5/10·10^k-Stufe ≥ max
 *  (7→10, 23→25, 40→50, 90→100, 130→200, 480→500). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) { if (v <= m * mag) return m * mag; }
  return 10 * mag;
}

// ── the widget ───────────────────────────────────────────────────────────
export function ChartWidget<T>({
  title, rows, dimension, measure, interaction, maxCategories = 8, tone,
  timeStart, timeEnd, footer, emptyLabel, locale = i18nLocale, texts, className,
}: ChartWidgetProps<T>) {
  const t: ChartTexts = { ...TEXTS[locale], ...texts };
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Interaction-Narrowing (die Props-Union garantiert: filter nur bei category).
  const drill = interaction?.mode === 'drill' ? interaction : null;
  const filter = interaction?.mode === 'filter' ? interaction : null;

  // Donut-Cap-PRÄZEDENZ: mark:'donut' deckelt effektiv auf min(maxCategories, 5)
  // — ein Donut mit 12 Segmenten ist unlesbar; der Überschuss geht in „Andere".
  const donutWish = dimension.kind === 'category' && dimension.mark === 'donut';
  const capEff = donutWish ? Math.min(maxCategories, 5) : maxCategories;

  const agg = useMemo<Agg<T>>(() => (
    dimension.kind === 'category'
      ? aggregateCategory(rows, dimension, measure, capEff, locale, t)
      : aggregateTime(rows, dimension, measure, timeStart, timeEnd, locale)
    // t/capEff sind aus locale+texts bzw. maxCategories+dimension abgeleitet —
    // die Ableitungs-Inputs stehen in den Deps.
  ), [rows, dimension, measure, maxCategories, locale, texts, timeStart, timeEnd]);

  const fmt = measure?.format;
  const isCount = !measure || measure.aggregate === undefined || measure.aggregate === 'count';
  const headLabel = isCount ? (measure?.label ?? t.countLabel) : measure.label;
  const toneOf = (seg: ChartSegment<T>): ChartTone => tone?.(seg) ?? 'default';

  // Filter-Zustand ABGELEITET (Determinismus: kein Effect, kein Auto-Reset),
  // DREISTUFIG — Chip-Präsenz muss der Wirkung von `sel.test` auf der
  // Schwester-Fläche entsprechen, sonst widersprechen sich beide Flächen:
  //   1. sichtbar:      Segment in den Top-N → dimmen + aria-pressed + Chip.
  //   2. in „Andere":   Kategorie EXISTIERT noch, nur unter den Cap gerutscht
  //      → Selektion bleibt AKTIV (sel.test filtert weiter!): Chip zeigt ihr
  //      Label, nur die „Andere"-Zeile bleibt hell.
  //   3. entfallen:     Kategorie hat die DATEN verlassen → sel.test läuft auf
  //      der Schwester ins Leere → Chip „Filter entfällt ✕", nichts gedimmt.
  // onSelect(null) feuert ausschließlich der Nutzer (Chip/Toggle/Leerklick).
  const selSeg = filter && filter.selectedKey !== null
    ? agg.segments.find(s => s.key === filter.selectedKey && !s.isOther) ?? null
    : null;
  const selInOtherLabel = !selSeg && filter && filter.selectedKey !== null
    ? agg.otherKeys?.get(filter.selectedKey) ?? null
    : null;
  const filterStale = !!filter && filter.selectedKey !== null && !selSeg && !selInOtherLabel;
  const selActive = !!selSeg || !!selInOtherLabel;

  // Negativ-Summen machen Anteile am Ganzen bedeutungslos → Bars + Notice.
  const donutOk = donutWish && agg.segments.every(s => s.value >= 0);

  const notices: string[] = [];
  if (agg.noValueCount > 0) notices.push(tpl(t.noValueNotice, { n: agg.noValueCount }));
  if (agg.cappedTotal !== null) notices.push(tpl(t.cappedNotice, { shown: Math.min(Math.max(1, capEff), 12) - 1, total: agg.cappedTotal }));
  if (dimension.kind === 'category' && agg.mentions > rows.length - agg.noValueCount) {
    notices.push(tpl(t.mentionsLabel, { n: agg.mentions }));
  }
  if (agg.coarsenedTo) notices.push(tpl(t.coarsenedNotice, { unit: UNIT[locale][agg.coarsenedTo] }));
  else if (agg.unit) notices.push(`${PER[locale]} ${UNIT[locale][agg.unit]}`);
  if (agg.partialLast && agg.segments.length) notices.push(tpl(t.partialNotice, { label: agg.segments[agg.segments.length - 1].label }));
  if (donutWish && !donutOk) notices.push(t.donutNegativeNotice);

  const empty = agg.segments.length === 0;
  const axisName = dimension.label ?? '';
  // Der Kopf trägt den ZEITRAUM (die Summe gilt für ihn) — nie die Bucket-
  // Einheit ("520 € · pro Monat" wäre eine Falschaussage; sie steht als Notice).

  return (
    <div className={`rounded-[27px] bg-card shadow-lg overflow-hidden${className ? ` ${className}` : ''}`} role="group" aria-label={title}>
      <div className="px-6 pt-5 pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {agg.headValue !== null && (
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold tabular-nums text-foreground">{formatValue(agg.headValue, fmt, locale)}</span>
            <span className="text-sm text-muted-foreground">{headLabel}{axisName ? ` · ${axisName}` : ''}{agg.rangeLabel ? ` · ${agg.rangeLabel}` : ''}</span>
          </p>
        )}
      </div>

      {/* Filter-Chip: macht die Selektion (oder ihren Verfall) SICHTBAR statt
          sie still zu reparieren — Klick ist der einzige Reset-Pfad. */}
      {filter && (selActive || filterStale) && (
        <div className="px-6 pb-2 -mt-1">
          <button
            type="button"
            onClick={() => filter.onSelect(null)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className={filterStale ? 'text-muted-foreground' : undefined}>
              {selSeg ? selSeg.label : selInOtherLabel ?? t.filterRemovedLabel}
            </span>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      )}

      {empty ? (
        <div className="px-6 pb-8 pt-2 text-center text-sm text-muted-foreground">{emptyLabel ?? t.emptyLabel}</div>
      ) : dimension.kind === 'category' ? (
        // Leerklick auf die Kartenfläche (nicht auf eine Zeile) hebt die
        // Selektion auf — die Zeilen-Buttons stoppen die Propagation.
        <div
          className="flex flex-col pb-4"
          onClick={filter && selActive ? () => filter.onSelect(null) : undefined}
        >
          {donutOk && <DonutMark segments={agg.segments} toneOf={toneOf} selKey={selSeg?.key ?? null} />}
          {agg.segments.map((seg, i) => {
            const dim = seg.isOther || seg.key === MISSING;
            const toneCls = TONE_TEXT[toneOf(seg)];
            const isSel = !!selSeg && selSeg.key === seg.key;
            // Bei einer in „Andere" gerutschten Selektion bleibt genau die
            // „Andere"-Zeile hell — dort leben die selektierten Rows.
            const dimmedBySel = selSeg ? !isSel : selInOtherLabel ? !seg.isOther : false;
            const slice = donutOk ? sliceStyleOf(seg, i, toneOf) : null;
            const inner = (
              <>
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`flex min-w-0 items-baseline gap-2 truncate text-sm ${dim ? 'text-muted-foreground' : 'text-foreground'}`} title={seg.label}>
                      {/* Dot nur für Segmente, die im Ring eine Slice HABEN
                          (share 0 → keine Slice → kein Dot-Versprechen). */}
                      {slice && seg.share > 0 && (
                        <span className={`inline-block h-2 w-2 shrink-0 self-center rounded-full bg-current ${slice.cls}`} style={{ opacity: slice.opacity }} />
                      )}
                      <span className="truncate">{seg.label}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-foreground">
                      {formatValue(seg.value, fmt, locale)}
                      <span className="ml-2 hidden text-xs text-muted-foreground tabular-nums sm:inline">{Math.round(seg.share * 100)} %</span>
                    </span>
                  </div>
                  {/* Beim Donut trägt der Ring die Geometrie — die Liste ist
                      seine Legende (Dot + Wert + %), kein zweiter Balken. */}
                  {!donutOk && (
                    <div className={`mt-1 h-2 w-full overflow-hidden rounded-full bg-muted ${toneCls === 'text-muted-foreground' ? 'text-primary' : toneCls} ${dim ? 'opacity-60' : ''}`}>
                      <div className="h-full rounded-full bg-current" style={{ width: `${(seg.share * 100).toFixed(2)}%` }} />
                    </div>
                  )}
                </div>
              </>
            );
            // Filter: „Andere" ist kein benennbares Prädikat → nicht selektierbar.
            const canClick = drill ? true : filter ? !seg.isOther : false;
            return canClick ? (
              <button
                key={seg.key}
                type="button"
                aria-pressed={filter ? isSel : undefined}
                onClick={e => {
                  e.stopPropagation();
                  if (drill) drill.onSegmentClick(seg);
                  else if (filter) filter.onSelect(isSel ? null : seg);
                }}
                className={`block w-full px-6 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none${dimmedBySel ? ' opacity-40' : ''}`}
              >
                {inner}
              </button>
            ) : (
              // Auch nicht-klickbare Zeilen („Andere" im Filter-Modus) stoppen
              // die Propagation: ein Klick auf sie ist kein Leerklick-Reset.
              <div key={seg.key} onClick={filter ? (e => e.stopPropagation()) : undefined} className={`px-6 py-1.5${dimmedBySel ? ' opacity-40' : ''}`}>{inner}</div>
            );
          })}
        </div>
      ) : (
        <TimeMark segments={agg.segments} fmt={fmt} locale={locale} clickable={!!drill} partialLast={agg.partialLast}
          onClick={seg => drill?.onSegmentClick(seg)} focusKey={focusKey} setFocusKey={setFocusKey}
          toneOf={toneOf} title={title} />
      )}

      {notices.length > 0 && !empty && (
        <div className="px-6 pb-3 -mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
          {notices.map((n, i) => <span key={i} className="text-xs text-muted-foreground">{n}</span>)}
        </div>
      )}
      {footer && <div className="border-t border-border px-6 py-2.5 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

// ── the donut (category, opt-in) — stroke-dasharray ring, deterministic ───

/** EINE Farb-Wahrheit für Ring-Slice UND Legenden-Dot: Ton-Override gewinnt;
 *  ohne Ton unterscheidet die Opacity-Leiter der Markenfarbe die Segmente
 *  (geschlossene Palette — keine freien Farben, Familie-Invariante).
 *  „Andere"/„Ohne Angabe" sind IMMER gedämpft. */
function sliceStyleOf<T>(seg: ChartSegment<T>, i: number, toneOf: (s: ChartSegment<T>) => ChartTone): { cls: string; opacity: number } {
  const special = seg.isOther || seg.key === MISSING;
  const toneCls = TONE_TEXT[toneOf(seg)];
  return {
    cls: special ? 'text-muted-foreground' : toneCls === 'text-muted-foreground' ? 'text-primary' : toneCls,
    opacity: special ? 0.5 : Math.max(0.3, Number((1 - i * 0.16).toFixed(2))),
  };
}

/** aria-hidden + pointer-events-none: die LISTE ist die A11y- und
 *  Interaktions-Wahrheit (Filter/Drill laufen über die Zeilen-Buttons);
 *  der Ring ist ihre Geometrie. Vollkreis-Sonderfall: share ≈ 1 rendert als
 *  nackter <circle> ohne dasharray (kein Rundungs-Haarriss). */
function DonutMark<T>({ segments, toneOf, selKey }: {
  segments: ChartSegment<T>[];
  toneOf: (seg: ChartSegment<T>) => ChartTone;
  selKey: string | null;
}) {
  const R = 40, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="pointer-events-none flex justify-center pb-2" aria-hidden="true">
      <svg viewBox="0 0 120 120" className="h-36 w-36">
        {segments.map((seg, i) => {
          const dash = seg.share * C;
          const off = acc;
          acc += dash;
          if (dash <= 0) return null;
          const slice = sliceStyleOf(seg, i, toneOf);
          const dimmedBySel = selKey !== null && selKey !== seg.key;
          const full = seg.share >= 0.9995;
          return (
            <circle
              key={seg.key} cx="60" cy="60" r={R} fill="none"
              className={slice.cls} stroke="currentColor" strokeWidth="18"
              strokeDasharray={full ? undefined : `${dash.toFixed(2)} ${(C - dash).toFixed(2)}`}
              strokeDashoffset={full ? undefined : (-off).toFixed(2)}
              transform="rotate(-90 60 60)"
              opacity={dimmedBySel ? 0.2 : slice.opacity}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ── the sparse line (time) — hand-rolled SVG, fixed height, deterministic ──
function TimeMark<T>({ segments, fmt, locale, clickable, onClick, focusKey, setFocusKey, toneOf, title, partialLast }: {
  segments: ChartSegment<T>[]; fmt: ChartValueFormat | undefined; locale: Locale;
  clickable: boolean; onClick: (seg: ChartSegment<T>) => void;
  focusKey: string | null; setFocusKey: (k: string | null) => void;
  toneOf: (seg: ChartSegment<T>) => ChartTone; title: string; partialLast: boolean;
}) {
  const W = 600, H = 150, PAD_X = 8, PAD_TOP = 8, PAD_BOTTOM = 22;
  const innerW = W - PAD_X * 2, innerH = H - PAD_TOP - PAD_BOTTOM;
  const finite = segments.filter(s => Number.isFinite(s.value));
  const rawMax = Math.max(0, ...finite.map(s => s.value));
  const rawMin = Math.min(0, ...finite.map(s => s.value));
  const yMax = niceMax(Math.max(rawMax, Math.abs(rawMin)) || 1);
  // Domain: [0, niceMax] — mit negativen Werten symmetrisch [-niceMax, niceMax]
  // (Balken-Äquivalent von "Baseline 0"; negative wachsen nach unten).
  const yLo = rawMin < 0 ? -yMax : 0;
  const yOf = (v: number) => PAD_TOP + innerH - ((v - yLo) / (yMax - yLo)) * innerH;
  const xOf = (i: number) => PAD_X + (segments.length === 1 ? innerW / 2 : (i / (segments.length - 1)) * innerW);

  // Pfad mit Lücken (avg-Gaps unterbrechen das Segment).
  let d = '';
  let pen = false;
  segments.forEach((s, i) => {
    if (!Number.isFinite(s.value)) { pen = false; return; }
    d += `${pen ? 'L' : 'M'}${xOf(i).toFixed(2)},${yOf(s.value).toFixed(2)}`;
    pen = true;
  });

  // x-Labels: bis 6 Buckets wird JEDER beschriftet (ein fehlender Monat liest
  // sich als fehlender Datenpunkt); erst darüber die Spartanik-Regel
  // erster/Mitte/letzter — sie existiert für 60-Tage-Achsen, nicht für vier Monate.
  const xIdx = segments.length <= 6 ? segments.map((_, i) => i)
    : [0, Math.floor((segments.length - 1) / 2), segments.length - 1];
  const yTicks = [0, yMax / 2, yMax];

  const focus = focusKey ? segments.find(s => s.key === focusKey) : null;
  const focusIdx = focus ? segments.indexOf(focus) : -1;

  return (
    <div className="relative px-6 pb-2 text-primary">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img"
        aria-label={`${title}: ${segments.filter(s => Number.isFinite(s.value)).map(s => `${s.label} ${formatValue(s.value, fmt, locale)}`).join(', ')}`}>
        {yTicks.map(v => (
          <g key={v}>
            <line x1={PAD_X} x2={W - PAD_X} y1={yOf(v).toFixed(2)} y2={yOf(v).toFixed(2)} className="stroke-border" strokeWidth="1" />
            <text x={PAD_X + 2} y={(yOf(v) - 3).toFixed(2)} className="fill-muted-foreground" fontSize="9">{formatValue(v, fmt, locale)}</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {segments.map((s, i) => Number.isFinite(s.value) && (
          // Der laufende Rand-Bucket ist HOHL — eine Zwischensumme, kein Trend-Punkt.
          <circle key={s.key} cx={xOf(i).toFixed(2)} cy={yOf(s.value).toFixed(2)} r={focusKey === s.key ? 4 : 2.5}
            className={TONE_TEXT[toneOf(s)] === 'text-muted-foreground' ? '' : TONE_TEXT[toneOf(s)]}
            fill={partialLast && i === segments.length - 1 ? 'var(--card)' : 'currentColor'}
            stroke="currentColor" strokeWidth={partialLast && i === segments.length - 1 ? 1.5 : 0} />
        ))}
        {xIdx.map(i => (
          <text key={i} x={xOf(i).toFixed(2)} y={H - 6} textAnchor={i === 0 ? 'start' : i === segments.length - 1 ? 'end' : 'middle'}
            className="fill-muted-foreground" fontSize="9">{segments[i].label}</text>
        ))}
        {/* Fokus-/Hover-Hit-Zonen: EIN Mechanismus für Maus + Tastatur (kein
            freier Tooltip-Layer — das Label clampt ins Karten-Chrome). */}
        {segments.map((s, i) => (
          <rect key={s.key} x={(xOf(i) - innerW / segments.length / 2).toFixed(2)} y={0}
            width={(innerW / segments.length).toFixed(2)} height={H} fill="transparent"
            tabIndex={clickable || Number.isFinite(s.value) ? 0 : -1}
            onMouseEnter={() => setFocusKey(s.key)} onMouseLeave={() => setFocusKey(null)}
            onFocus={() => setFocusKey(s.key)} onBlur={() => setFocusKey(null)}
            onClick={clickable ? () => onClick(s) : undefined}
            onKeyDown={clickable ? (e => { if (e.key === 'Enter') onClick(s); }) : undefined}
          />
        ))}
      </svg>
      {focus && Number.isFinite(focus.value) && (
        <div
          className="pointer-events-none absolute top-1 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm"
          style={{ left: `${Math.min(Math.max((focusIdx / Math.max(1, segments.length - 1)) * 100, 8), 78)}%` }}
        >
          <span className="text-muted-foreground">{focus.label}</span>{' '}
          <span className="font-medium tabular-nums">{formatValue(focus.value, fmt, locale)}</span>{' '}
          <span className="text-muted-foreground tabular-nums">({Math.round(focus.share * 100)} %)</span>
        </div>
      )}
      {/* A11y-Fallback: die Daten als visually-hidden Tabelle. */}
      <table className="sr-only">
        <tbody>
          {segments.map(s => (
            <tr key={s.key}><th scope="row">{s.label}</th><td>{Number.isFinite(s.value) ? formatValue(s.value, fmt, locale) : '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── siblings (family pattern: consumer branches BEFORE the widget) ───────

export function ChartSkeleton() {
  return (
    <div className="rounded-[27px] bg-card shadow-lg overflow-hidden animate-pulse" aria-busy="true">
      <div className="px-6 pt-5 pb-3">
        <div className="h-3 w-40 rounded bg-muted" />
        <div className="mt-2 h-7 w-28 rounded bg-muted" />
      </div>
      <div className="flex flex-col gap-3 px-6 pb-6">
        {['w-full', 'w-4/5', 'w-3/5', 'w-2/5', 'w-1/4'].map(w => (
          <div key={w} className={`h-2 rounded-full bg-muted ${w}`} />
        ))}
      </div>
    </div>
  );
}

const ERROR_TEXTS: Record<Locale, { title: string; retry: string }> = {
  de: { title: 'Auswertung konnte nicht geladen werden', retry: 'Erneut versuchen' },
  en: { title: 'Chart failed to load', retry: 'Try again' },
};

type ChartErrorProps = {
  error: Error | string;
  locale?: Locale;
  title?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: ComponentType<{ size?: number | string; stroke?: number | string }>;
  className?: string;
};

export function ChartError({ error, locale = i18nLocale, title, onRetry, retryLabel, icon: Icon = IconAlertCircle, className }: ChartErrorProps) {
  const message = typeof error === 'string' ? error : error.message;
  const heading = title ?? ERROR_TEXTS[locale].title;
  const retryText = retryLabel ?? ERROR_TEXTS[locale].retry;
  return (
    <div className={`flex flex-col items-center justify-center gap-4 rounded-[27px] bg-card shadow-lg py-16 text-center${className ? ` ${className}` : ''}`}>
      <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive"><Icon size={22} /></div>
      <div className="flex flex-col gap-1 max-w-md px-6">
        <h3 className="font-semibold text-foreground">{heading}</h3>
        <p className="text-sm text-muted-foreground break-words">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm transition-colors hover:bg-muted">
          <IconRefresh size={15} className="mr-1.5" />{retryText}
        </button>
      )}
    </div>
  );
}
