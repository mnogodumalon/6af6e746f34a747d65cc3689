/**
 * ChartWidget.example.tsx — the single copyable wiring truth for ChartWidget.
 *
 * STATIC (no Jinja2, no conditional emission), compiled by the contract
 * tsc-gate against the frozen hotel fixture (entity `buchung`: gast, anreise,
 * preis, the static lookup `status`, the enriched applookup `zimmer`). It
 * shows the full wiring the agent reproduces: rows = typed records, dimension
 * names the axis, measure names the number — the widget aggregates ITSELF.
 *
 * The one rule that bites: `value` returns the RAW number, never a formatted
 * string — the aggregation sums it. `formatCurrency(x)` inside `value` breaks
 * every total; `format: 'currency'` is how euros appear.
 *
 * WRONG vs RIGHT (HARD RULE 6 — the chart owns its own breakdown):
 *   // WRONG — feeding the chart rows filtered by its own segment collapses
 *   // the card to one 100% bar:
 *   //   <ChartWidget rows={rows.filter(seg.test)} … />
 *   // RIGHT — the chart ALWAYS gets the full rows of its question; a selected
 *   // segment filters SIBLING surfaces (a table, a list), never the chart:
 *   //   <ChartWidget rows={rows} … />  +  tableRows.filter(seg.test)
 *
 * FILTER MODE — the four-line, two-target idiom (card 3 below):
 *   1. const [sel, setSel] = useState<ChartSegment<Buchung> | null>(null);
 *   2. <ChartWidget rows={rows} …            // ALWAYS the full rows (rule above)
 *   3.   interaction={{ mode: 'filter', selectedKey: sel?.key ?? null, onSelect: setSel }} />
 *   4. siblingRows.filter(r => !sel || sel.test(r))   // sel.test hits the SIBLING
 * Axes compose as AND: this chart would receive rows filtered by every OTHER
 * control on the page (a search box, another facet) — never by its own sel.
 * ONE AXIS, ONE CONTROL: a filter chart REPLACES the table facet on the same
 * field. And know the trade: a facet offers ALL schema options multi-select;
 * the chart offers Top-N single-select — filter mode fits closed, dominant
 * axes (a status set), not open long-tail ones.
 * Three more rules the widget already enforces — do NOT rebuild them:
 *   · The widget OWNS the reset (the ✕ chip + empty-click on the card) —
 *     never add your own "Zurücksetzen" button next to the sibling.
 *   // WRONG — hardcoding the key: the sibling filters but the chart never
 *   // mirrors the selection (no dim, no chip, no toggle):
 *   //   interaction={{ mode: 'filter', selectedKey: null, onSelect: setSel }}
 *   // RIGHT — pass the held selection back: selectedKey: sel?.key ?? null
 *   · Stale selections are the widget's job: slid into "Andere" → chip keeps
 *     the label (sel.test still filters); left the data → "Filter entfällt"
 *     chip while the sibling goes empty. One chip click (→ onSelect(null))
 *     resets chart AND sibling — your only cleanup is setSel(null).
 */
import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { LivingAppsService } from '@/services/livingAppsService';
import type { Buchung } from '@/types/app';
import { useClock } from '@/lib/polish';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
} from './RecordView';
import {
  ChartWidget,
  ChartSkeleton,
  ChartError,
  type ChartRow,
  type ChartSegment,
} from './ChartWidget';

const ROW_PREFIX = 'buchung';

export function HotelChartExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Drill state: the clicked segment + the index we are paging at.
  const [drill, setDrill] = useState<{ seg: ChartSegment<Buchung>; i: number } | null>(null);
  // Filter state (idiom line 1): the PAGE owns the selection, the widget is
  // controlled — it renders toggle/dim/chip and reports via onSelect.
  const [sel, setSel] = useState<ChartSegment<Buchung> | null>(null);
  const clock = useClock();

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      setBuchungen(await LivingAppsService.getBuchung());
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, []);

  // Records → typed rows. `data` is the REAL record — accessors are tsc-checked.
  const rows = useMemo<ChartRow<Buchung>[]>(
    () => buchungen.map(b => ({ id: `${ROW_PREFIX}:${b.record_id}`, data: b })),
    [buchungen],
  );
  const byId = useMemo(() => new Map(buchungen.map(b => [`${ROW_PREFIX}:${b.record_id}`, b])), [buchungen]);

  // State trias BEFORE the widget (sibling components, never props):
  if (loading) return <ChartSkeleton />;
  if (error) return <ChartError error={error} onRetry={() => void reload()} />;

  const drillRecord = drill ? byId.get(drill.seg.rowIds[drill.i]) : undefined;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 1) Distribution with a sum measure + drill. The accessor passes the
             ENRICHED raw lookup object — the widget normalizes to its label
             (NEVER pre-extract ?.label). Head shows "Umsatz gesamt: 12.480 €"
             and absorbs that metric's StatCard. */}
      <ChartWidget<Buchung>
        title="Umsatz nach Status"
        rows={rows}
        dimension={{ kind: 'category', accessor: r => r.data.fields.status, label: 'Status' }}
        // RAW number in `value` — never a formatted string, the aggregation sums it.
        measure={{ aggregate: 'sum', label: 'Umsatz', value: r => r.data.fields.preis ?? null, format: 'currency' }}
        tone={seg => (seg.key === 'angefragt' ? 'warning' : 'default')}
        interaction={{ mode: 'drill', onSegmentClick: seg => setDrill({ seg, i: 0 }) }}
        footer={<>Stand: {format(clock, 'dd.MM.yyyy')}</>}
      />

      {/* 2) Trend, measure omitted = count. `timeEnd` comes from the PAGE
             (useClock) so the axis runs "bis heute" — otherwise it would end
             at the last booking and hide the recent lull. The applookup case:
             an enriched `zimmer` object would go through the SAME accessor
             shape — dimension={{ kind: 'category', accessor: r => r.data.fields.zimmer }}. */}
      <ChartWidget<Buchung>
        title="Buchungen pro Monat"
        rows={rows}
        dimension={{ kind: 'time', accessor: r => r.data.fields.anreise ?? null, bucket: 'month', label: 'Anreise' }}
        timeEnd={format(clock, 'yyyy-MM-dd')}
      />

      {/* 3) FILTER MODE (idiom lines 2+3): the chart is the page's ONE control
             for the status axis — it REPLACES a table facet on the same field.
             The chart keeps the FULL rows; the selection filters the sibling
             below. Type-entangled: this compiles ONLY on kind:'category'. */}
      <ChartWidget<Buchung>
        title="Buchungen nach Status"
        rows={rows}
        dimension={{ kind: 'category', accessor: r => r.data.fields.status, label: 'Status' }}
        interaction={{ mode: 'filter', selectedKey: sel?.key ?? null, onSelect: setSel }}
      />

      {/* …the NAMED sibling target (idiom line 4): sel.test filters THIS
             surface — in a real dashboard this is the TableWidget's rows. */}
      <div className="rounded-[27px] bg-card px-6 py-5 shadow-lg" role="group" aria-label="Buchungen (gefiltert)">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Buchungen{sel ? ` — ${sel.label}` : ''}
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-foreground">
          {rows.filter(r => !sel || sel.test(r)).slice(0, 8).map(r => (
            <li key={r.id}>{r.data.fields.gast ?? 'Ohne Gast'}</li>
          ))}
        </ul>
      </div>

      {/* 4) DONUT — ONLY for ≤5 exhaustive parts of a NAMED whole (rooms of
             the house, a closed status set). Open/long-tail axes stay a
             BarList: the donut cap is min(maxCategories, 5), the rest lands
             in "Andere". The list renders WITH the ring (it is the legend);
             negative sums would fall back to bars + notice automatically. */}
      <ChartWidget<Buchung>
        title="Belegung nach Zimmer"
        rows={rows}
        dimension={{ kind: 'category', accessor: r => r.data.fields.zimmer, label: 'Zimmer', mark: 'donut' }}
      />

      {/* Drill overlay — RecordOverlay is a SINGLE-record shell (no rowIds/title
          prop): page through the segment's records via onPrev/onNext + counter. */}
      {drill && drillRecord && (
        <RecordOverlay
          open
          onClose={() => setDrill(null)}
          ariaLabel={`${drill.seg.label} — ${drill.i + 1} / ${drill.seg.rowIds.length}`}
          counter={`${drill.i + 1} / ${drill.seg.rowIds.length}`}
          onPrev={drill.i > 0 ? () => setDrill({ ...drill, i: drill.i - 1 }) : undefined}
          onNext={drill.i < drill.seg.rowIds.length - 1 ? () => setDrill({ ...drill, i: drill.i + 1 }) : undefined}
        >
          <RecordHeader title={drillRecord.fields.gast ?? 'Ohne Gast'} subtitle={drill.seg.label} />
          <RecordSection title="Details" cols={2}>
            <RecordField label="Anreise" value={drillRecord.fields.anreise} format="date" />
            <RecordField label="Preis" value={drillRecord.fields.preis} format="currency" />
            <RecordField label="Status" value={drillRecord.fields.status} format="pill" />
          </RecordSection>
        </RecordOverlay>
      )}
    </div>
  );
}
