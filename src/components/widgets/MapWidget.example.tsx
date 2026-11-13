/**
 * MapWidget.example.tsx — the single copyable wiring truth for MapWidget.
 *
 * This file is STATIC (no Jinja2, no conditional emission). It is wired to the
 * frozen hotel-style fixture (entity `buchung`) extended with a `standort` geo
 * field (a GeoLocation `{ lat, long, info? }`) — the shape a real geo app has.
 * It shows the full wiring the agent reproduces in the dashboard: map records →
 * MapMarker[] (drop records without coordinates), colour the pin by status,
 * open a <RecordOverlay> on a marker click, and — BY DEFAULT — a tap on the
 * empty map opens a create dialog PRE-FILLED with the tapped coordinates. Copy a
 * block, swap the field names, ship.
 *
 * Tap-to-create is the DEFAULT (onMapPointClick wired); drop it only for a
 * deliberately read-only map. Every import resolves; every enum value is real;
 * there is NO `parseId` helper — the marker id is built with a template literal
 * and read back with `id.split(':')` (the family convention). `long`, never `lng`.
 */
import { useEffect, useMemo, useState } from 'react';
import { LivingAppsService } from '@/services/livingAppsService';
import type { Buchung, GeoLocation } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { lookupKey } from '@/lib/formatters';
import { reverseGeocodeDetailed } from '@/lib/ai';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
  RecordAttachments,
  useRecordOverlayStack,
} from './RecordView';
import {
  MapWidget,
  MapSkeleton,
  MapError,
  MapRouteLinks,
  type MapMarker,
  type MapTone,
} from './MapWidget';

const MARKER_PREFIX = 'buchung';
function buchungIdOf(marker: MapMarker): string {
  return marker.id.split(':')[1] ?? '';
}

// tone is a CLOSED enum (MapTone) — `'danger'` does NOT exist. Map workflow
// semantics to the pin colour, not decoration: the active stay reads success,
// a request needs attention. Anything richer than a colour is out of scope.
function toneForStatus(status: string | undefined): MapTone {
  if (status === 'eingecheckt') return 'success';
  if (status === 'bestaetigt') return 'primary';
  if (status === 'abgereist') return 'default';
  return 'warning';   // angefragt / unbearbeitet → needs attention
}

export function HotelMapExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Tap-to-create draft: the tapped coordinates + reverse-geocoded address, held
  // until the create dialog is submitted or dismissed. null → no dialog open.
  const [draft, setDraft] = useState<{ lat: number; long: number; info?: string } | null>(null);

  const overlay = useRecordOverlayStack<{ type: string; id: string }>();

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

  // Records → the widget's lean, data-agnostic marker shape. The geo FIELD NAME
  // (`standort`) lives HERE, in the consumer — never in the widget. `flatMap`
  // drops records without coordinates (the widget ALSO counts dropped ones, but
  // pre-filtering keeps the array typed `number`, not `number | undefined`).
  // Use `long`, NOT `lng` — a `lng` key on the marker is a compile error.
  const markers = useMemo<MapMarker[]>(
    () =>
      buchungen.flatMap(b => {
        const geo: GeoLocation | undefined = b.fields.standort;
        if (!geo) return [];
        return [{
          id: `${MARKER_PREFIX}:${b.record_id}`,
          lat: geo.lat,
          long: geo.long,
          title: b.fields.gast ?? 'Ohne Gast',
          subtitle: geo.info ?? b.fields.anreise,
          tone: toneForStatus(lookupKey(b.fields.status)),
          // icon: a glyph that FITS THE RECORDS (here a stay → a building). A
          // closed MAP_ICONS value — tone sets the colour, icon the symbol.
          icon: 'building',
        }];
      }),
    [buchungen],
  );

  if (loading) return <MapSkeleton />;
  if (error) return <MapError error={error} onRetry={() => void reload()} />;

  const current = overlay.top ? buchungen.find(b => b.record_id === overlay.top!.id) : undefined;

  return (
    <>
      <MapWidget
        markers={markers}
        // A key overlay (bottom-left) that gives the pin COLOURS their meaning —
        // the widget knows the tone, only you know what 'success' stands for. List
        // the statuses you actually colour by; mirror the toneForStatus mapping.
        legend={[
          { label: 'Eingecheckt', tone: 'success' },
          { label: 'Bestätigt', tone: 'primary' },
          { label: 'Abgereist', tone: 'default' },
          { label: 'Offen / angefragt', tone: 'warning' },
        ]}
        // Clustering is AUTOMATIC above ~100 markers — nothing to wire here. (Pass
        // `cluster={false}` to always show every pin, `cluster` to always group.)
        // A clicked marker opens a <RecordOverlay> — the map owns no detail layer.
        onMarkerClick={marker => overlay.replace({ type: MARKER_PREFIX, id: buchungIdOf(marker) })}
        // DEFAULT: a tap on the empty map opens a create dialog PRE-FILLED with
        // the tapped point. We reverse-geocode it so the ADDRESS is filled too,
        // not just the coordinates. If THIS app had separate address-component
        // fields you would map them here as well (the agent knows the field names):
        //   strasse: addr.road, hausnummer: addr.houseNumber,
        //   postleitzahl: addr.postcode, ort: addr.city
        // The Buchung fixture has only the geo field, so we set standort.info.
        // Omit onMapPointClick entirely only for a deliberately read-only map.
        onMapPointClick={async ({ lat, long }) => {
          const addr = await reverseGeocodeDetailed(lat, long);
          setDraft({ lat, long, info: addr.display });
        }}
      />

      {/* Create-by-click: the tapped point pre-fills the geo field. This stands
          in for the app's real create form (which would render the entity's
          fields and call LivingAppsService.create… on submit) — the point is the
          pre-filled `standort`. */}
      {draft && (
        <RecordOverlay open onClose={() => setDraft(null)} ariaLabel="Neue Buchung">
          <RecordHeader title="Neue Buchung" subtitle="an der getippten Position" />
          <RecordSection title="Standort (vorausgewählt)" cols={2}>
            <RecordField label="Adresse" value={draft.info ?? '—'} />
            <RecordField label="Breite" value={draft.lat.toFixed(5)} />
            <RecordField label="Länge" value={draft.long.toFixed(5)} />
          </RecordSection>
        </RecordOverlay>
      )}

      <RecordOverlay open={overlay.open} onClose={overlay.close} ariaLabel="Buchung">
        {current && (
          <>
            <RecordHeader
              title={current.fields.gast ?? 'Ohne Gast'}
              subtitle={current.fields.status?.label}
            />
            <RecordSection title="Details" cols={2}>
              <RecordField label="Anreise" value={current.fields.anreise} format="date" />
              <RecordField label="Status" value={current.fields.status} format="pill" />
              <RecordField label="Standort" value={current.fields.standort?.info} />
            </RecordSection>
            {/* The pin popup already carries built-in Route links; mirror them in
                the detail (the SAME exported control, the record's own coords) so a
                user who drilled straight into a record can navigate without going
                back to the map. Guarded — only when the record has coordinates. */}
            {current.fields.standort && (
              <RecordSection title="Navigation">
                <MapRouteLinks lat={current.fields.standort.lat} long={current.fields.standort.long} />
              </RecordSection>
            )}
            <RecordAttachments appId={APP_IDS.BUCHUNG} recordId={current.record_id} />
          </>
        )}
      </RecordOverlay>
    </>
  );
}
