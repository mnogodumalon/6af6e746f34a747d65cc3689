/**
 * ResourceTimeline.example.tsx — the single copyable wiring truth for ResourceTimeline.
 *
 * This file is STATIC (no Jinja2, no conditional emission) and is compiled by the
 * contract tsc-gate against the frozen hotel fixture (entity `Buchung` with fields
 * `anreise`/`abreise`/`zimmer`, where `zimmer` is an APPLOOKUP to its own entity `Zimmer`).
 * It is the occupancy-plan sibling to CalendarWidget.example.tsx: the rooms become
 * the resource axis (rows), each booking a bar, and a drag can MOVE a booking to a
 * different room (cross-resource). Copy a block, swap the field names, ship.
 *
 * Every import resolves; every enum value is a real one; there is NO `parseId`
 * helper — the event id is built with a template literal and read back with
 * `id.split(':')` (the family convention, exactly as RecordView does).
 *
 * Service / type names are exactly what the generators derive for the hotel
 * fixture: interface `Buchung`/`Zimmer`, `APP_IDS.BUCHUNG`/`APP_IDS.ZIMMER`,
 * methods `getBuchung()` / `getZimmer()` / `updateBuchungEntry(id, fields)`.
 */
import { useEffect, useMemo, useState } from 'react';
import { dateFnsLocale } from '@/i18n';
import { parseISO, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import type { Buchung, Zimmer } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { formatDate } from '@/lib/formatters';
import { IconBed } from '@tabler/icons-react';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
  RecordAttachments,
  useRecordOverlayStack,
} from './RecordView';
import {
  ResourceTimeline,
  ResourceTimelineSkeleton,
  ResourceTimelineError,
  type ResourceEvent,
  type ResourceGroup,
  type ResourceTone,
} from './ResourceTimeline';

// The event id is a TEMPLATE LITERAL `${entity}:${recordId}` — no `parseId` helper
// exists. Read it back with split(':'). Same convention as CalendarWidget.example.
const EVENT_PREFIX = 'buchung';
function buchungIdOf(id: string): string {
  return id.split(':')[1] ?? '';
}

// tone is a CLOSED enum (ResourceTone). `'danger'` does NOT exist — the closest is
// `'destructive'`. Anything richer than a colour belongs in renderEvent, not a prop.
function toneForBuchung(b: Buchung): ResourceTone {
  return b.fields.anreise && b.fields.abreise ? 'primary' : 'warning';
}

export function HotelOccupancyExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [zimmerList, setZimmerList] = useState<Zimmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Seed date for the timeline (uncontrolled — the widget owns navigation). Kept
  // here so the renderGroupHeader closure can compute occupancy for the month it
  // shows. (Pass `referenceDate` + a setter instead to drive the cursor yourself.)
  const [seedDate] = useState<Date>(() => new Date());

  const overlay = useRecordOverlayStack<{ type: string; id: string }>();

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const [b, z] = await Promise.all([LivingAppsService.getBuchung(), LivingAppsService.getZimmer()]);
      setBuchungen(b);
      setZimmerList(z);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  // groups = the RESOURCE axis (opaque keys). APPLOOKUP resource (rooms are their
  // OWN entity Zimmer) → the key is each room's record_id, taken from the fetched
  // records. (A STATIC lookup would map over the field's options instead.)
  const groups = useMemo<ResourceGroup[]>(
    () => zimmerList.map(z => ({ key: z.record_id, label: z.fields.name ?? z.record_id })),
    [zimmerList],
  );

  // Records → the widget's lean, data-agnostic event shape. The field names
  // (anreise/abreise/zimmer) live HERE, in the consumer — never in the widget.
  // `group` is the OPAQUE room key: for an APPLOOKUP field the stored value is a
  // record URL, so read the id with extractRecordId (a bare string would use lookupKey).
  const events = useMemo<ResourceEvent[]>(
    () =>
      buchungen
        .filter(b => !!b.fields.anreise)
        .map(b => ({
          id: `${EVENT_PREFIX}:${b.record_id}`,
          start: b.fields.anreise!,
          end: b.fields.abreise,             // optional → newEnd only fires when this exists
          allDay: true,                      // date-only fields are all-day bookings
          title: b.fields.gast ?? 'Buchung',
          subtitle: b.fields.anreise ? formatDate(b.fields.anreise) : undefined,
          tone: toneForBuchung(b),
          group: extractRecordId(b.fields.zimmer) ?? '',
        })),
    [buchungen],
  );

  // renderGroupHeader has NO event access — it receives only the group. Per-row
  // aggregates come from the consumer's data via CLOSURE: here we count nights this
  // room is occupied in the seed month and turn it into an occupancy %. The closure
  // reads `buchungen` + `seedDate`, NOT anything the widget passes in.
  const occupancyByRoom = useMemo(() => {
    const start = startOfMonth(seedDate);
    const end = endOfMonth(seedDate);
    const daysInMonth = end.getDate();
    const counts = new Map<string, number>();
    for (const b of buchungen) {
      const roomId = extractRecordId(b.fields.zimmer);
      if (!roomId || !b.fields.anreise) continue;
      const from = parseISO(b.fields.anreise);
      const to = b.fields.abreise ? parseISO(b.fields.abreise) : from;
      let occupied = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (isWithinInterval(d, { start: from, end: to })) occupied += 1;
      }
      counts.set(roomId, (counts.get(roomId) ?? 0) + occupied);
    }
    const pct = new Map<string, number>();
    for (const [roomId, occupied] of counts) {
      pct.set(roomId, Math.round((occupied / daysInMonth) * 100));
    }
    return pct;
  }, [buchungen, seedDate]);

  // Reschedule on drag. DRAG IS OFF until onEventDrop is passed. A cross-resource
  // move carries `newGroup` (the room the bar was dropped on); write it back to the
  // APPLOOKUP field as a record URL via createRecordUrl (a bare string is TS2345 —
  // a STATIC lookup would instead write { zimmer: { key, label } }). `newEnd` is
  // undefined when the booking has no `abreise` — patch the end ONLY when present.
  const reschedule = async (id: string, newStart: string, newEnd?: string, newGroup?: string) => {
    const rid = buchungIdOf(id);
    if (!rid) return;
    const zimmerPatch = newGroup ? { zimmer: createRecordUrl(APP_IDS.ZIMMER, newGroup) } : {};
    setBuchungen(prev =>
      prev.map(b =>
        b.record_id === rid
          ? { ...b, fields: { ...b.fields, anreise: newStart, ...(newEnd ? { abreise: newEnd } : {}), ...zimmerPatch } }
          : b,
      ),
    );
    try {
      await LivingAppsService.updateBuchungEntry(rid, {
        anreise: newStart,
        ...(newEnd ? { abreise: newEnd } : {}),
        ...zimmerPatch,
      });
    } catch {
      await reload();
    }
  };

  // Day-granular resize on the occupancy plan: stretch a bar's edge to another day.
  const resize = async (id: string, newStart: string, newEnd: string) => {
    const rid = buchungIdOf(id);
    if (!rid) return;
    setBuchungen(prev =>
      prev.map(b => (b.record_id === rid ? { ...b, fields: { ...b.fields, anreise: newStart, abreise: newEnd } } : b)),
    );
    try {
      await LivingAppsService.updateBuchungEntry(rid, { anreise: newStart, abreise: newEnd });
    } catch {
      await reload();
    }
  };

  if (loading) return <ResourceTimelineSkeleton />;
  if (error) return <ResourceTimelineError error={error} onRetry={() => void reload()} />;

  const currentBuchung = overlay.top ? buchungen.find(b => b.record_id === overlay.top!.id) : undefined;
  const currentRoom = currentBuchung
    ? zimmerList.find(z => z.record_id === extractRecordId(currentBuchung.fields.zimmer))
    : undefined;

  return (
    <>
      <ResourceTimeline
        events={events}
        groups={groups}
        axis="day"
        defaultRange="week"
        defaultDate={seedDate}
        locale={dateFnsLocale()}  // runtime locale — never pin date-fns `de` here
        onEventClick={ev => overlay.replace({ type: EVENT_PREFIX, id: buchungIdOf(ev.id) })}
        onEventDrop={reschedule}
        // Drag-to-create: drag across empty day cells IN A ROW → a stay for
        // THAT room. Args are DATES (like onEmptyClick, NOT ISO strings like
        // onEventDrop) and `group` is the REAL resource key — take all three.
        onRangeCreate={(start, end, group) => {
          openCreateBooking({ anreise: start, abreise: end, zimmer: group });
        }}
        onEventResize={resize}
        onEmptyClick={(date, group) => {
          // Empty cell tapped: open a PREFILLED create. TAKE BOTH args — `date` is
          // the clicked day, `group` the room's opaque key. A 1-arg lambda would
          // silently drop `group` (TS-conformant, but the room prefill stays empty).
          openCreateBooking({ anreise: date, zimmer: group });
        }}
        renderEvent={(ev, meta) => (
          // tone comes from the event; the bar itself is fully ours via render-prop.
          <div
            className={`flex items-center gap-1.5 truncate text-xs ${
              ev.tone === 'primary' ? 'text-primary' : 'text-foreground'
            }`}
          >
            <IconBed className="h-3.5 w-3.5 shrink-0" />
            {meta.isStart && <span className="truncate">{ev.title}</span>}
          </div>
        )}
        renderGroupHeader={group => (
          // CLOSURE over occupancyByRoom (consumer data) — renderGroupHeader has no
          // event access, so the per-row aggregate is computed outside and read here.
          <div className="flex w-full items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-foreground">{group.label}</span>
            <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-primary tabular-nums">
              {occupancyByRoom.get(group.key) ?? 0}%
            </span>
          </div>
        )}
      />

      {/* A clicked event opens a <RecordOverlay> — the timeline owns no detail layer. */}
      <RecordOverlay open={overlay.open} onClose={overlay.close} ariaLabel="Buchung">
        {currentBuchung && (
          <>
            <RecordHeader
              title={currentBuchung.fields.gast ?? 'Buchung'}
              meta={
                <>
                  {currentRoom?.fields.name ?? 'Ohne Zimmer'} ·{' '}
                  {formatDate(currentBuchung.fields.anreise)}
                  {currentBuchung.fields.abreise ? ` – ${formatDate(currentBuchung.fields.abreise)}` : ''}
                </>
              }
            />
            <RecordSection title="Zeitraum" cols={2}>
              <RecordField label="Anreise" value={currentBuchung.fields.anreise} format="date" />
              <RecordField label="Abreise" value={currentBuchung.fields.abreise} format="date" />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.BUCHUNG} recordId={currentBuchung.record_id} />
          </>
        )}
      </RecordOverlay>
    </>
  );

  // The prefilled-create entry point. In a real dashboard this opens the generated
  // <BuchungDialog> seeded with the day + room; here it stands in as a typed stub so
  // the wiring (BOTH onEmptyClick args used) compiles and reads clearly.
  function openCreateBooking(seed: { anreise: Date; abreise?: Date; zimmer?: string }): void {
    void seed;
  }
}
