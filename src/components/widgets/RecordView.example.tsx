/**
 * RecordView.example.tsx — the single copyable wiring truth for RecordView.
 *
 * This file is STATIC (no Jinja2, no conditional emission) and is compiled by
 * the contract tsc-gate against the frozen hotel fixture (entity `Buchung`,
 * applookup `zimmer` -> entity `Zimmer`). It shows the two real surfaces the
 * agent wires: an in-dashboard OVERLAY STACK (relations drill without
 * navigating) and a full-page detail surface. Copy a block, swap the field
 * names, ship. Every import resolves; every enum value is a real one; the
 * `getZimmerDisplayName` helper is an inline literal (no phantom import).
 *
 * Service / type names are exactly what the generators derive for the hotel
 * fixture: interface `Buchung`/`Zimmer`, `APP_IDS.BUCHUNG`/`APP_IDS.ZIMMER`,
 * methods `getBuchung()` / `getZimmer()` / `updateBuchungEntry(id, fields)`.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Buchung, Zimmer } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash, IconBed, IconUser, IconCalendar } from '@tabler/icons-react';
import { formatDate } from '@/lib/formatters';
import {
  RecordView,
  RecordOverlayHost,
  RecordHeader,
  RecordKeyFacts,
  RecordSection,
  RecordField,
  RecordRelation,
  RecordTimeline,
  RecordAttachments,
  RecordViewSkeleton,
  RecordViewEmpty,
  RecordViewError,
  useRecordOverlayStack,
} from './RecordView';

// The display-name helper is an INLINE literal — never a phantom import. Map a
// `zimmer` applookup URL (the value Living-Apps stores) to its label by id.
function makeGetZimmerDisplayName(zimmerList: Zimmer[]) {
  return (url?: unknown): string => {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return zimmerList.find(z => z.record_id === refId)?.fields.name ?? '—';
  };
}

// ─────────────────────────────────────────────────────────────────────────
// SURFACE 1 — Overlay stack inside the dashboard (relations push, never
// navigate). ONE <RecordOverlayHost> shell for the WHOLE stack; the item
// discriminates by type. Per-type <RecordOverlay open={…}> shells would
// unmount/remount on every drill and replay the entrance animation (blink).
// Use this when the user must keep the dashboard context.
// ─────────────────────────────────────────────────────────────────────────

type OverlayItem = { type: 'buchung' | 'zimmer'; id: string };

export function HotelOverlayExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [zimmerList, setZimmerList] = useState<Zimmer[]>([]);
  const overlay = useRecordOverlayStack<OverlayItem>();
  const getZimmerDisplayName = makeGetZimmerDisplayName(zimmerList);

  useEffect(() => {
    Promise.all([LivingAppsService.getBuchung(), LivingAppsService.getZimmer()]).then(
      ([b, z]) => {
        setBuchungen(b);
        setZimmerList(z);
      },
    );
  }, []);

  const currentBuchung =
    overlay.top?.type === 'buchung'
      ? buchungen.find(b => b.record_id === overlay.top!.id)
      : undefined;
  const currentZimmer =
    overlay.top?.type === 'zimmer'
      ? zimmerList.find(z => z.record_id === overlay.top!.id)
      : undefined;

  return (
    <>
      <div className="flex flex-col gap-2">
        {buchungen.map(b => (
          <button
            key={b.record_id}
            type="button"
            onClick={() => overlay.replace({ type: 'buchung', id: b.record_id })}
            className="text-left rounded-2xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="font-medium text-foreground">{b.fields.gast ?? 'Ohne Gast'}</div>
            <div className="text-sm text-muted-foreground">
              {getZimmerDisplayName(b.fields.zimmer)} · {formatDate(b.fields.anreise)}
            </div>
          </button>
        ))}
      </div>

      <RecordOverlayHost
        overlay={overlay}
        placement="side"
        size="md"
        render={() => (
          <>
        {currentBuchung && (
          <>
            <RecordHeader
              title={currentBuchung.fields.gast ?? 'Ohne Gast'}
              subtitle={getZimmerDisplayName(currentBuchung.fields.zimmer)}
              meta={
                <>
                  {formatDate(currentBuchung.fields.anreise)} – {formatDate(currentBuchung.fields.abreise)}
                </>
              }
            />
            <RecordKeyFacts
              items={[
                { label: 'Anreise', value: formatDate(currentBuchung.fields.anreise), icon: IconCalendar },
                { label: 'Zimmer', value: getZimmerDisplayName(currentBuchung.fields.zimmer), icon: IconBed },
              ]}
            />
            <RecordSection title="Aufenthalt" cols={2}>
              <RecordField label="Gast" value={currentBuchung.fields.gast} format="text" />
              <RecordField label="Anreise" value={currentBuchung.fields.anreise} format="date" />
              <RecordField label="Abreise" value={currentBuchung.fields.abreise} format="date" />
            </RecordSection>
            {/* A relation PUSHES the next layer — it never navigates away. */}
            <RecordSection title="Verknüpfungen">
              <RecordRelation
                label="Zimmer"
                name={getZimmerDisplayName(currentBuchung.fields.zimmer)}
                icon={IconBed}
                onClick={() => {
                  const zid = extractRecordId(currentBuchung.fields.zimmer);
                  if (zid) overlay.push({ type: 'zimmer', id: zid });
                }}
              />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.BUCHUNG} recordId={currentBuchung.record_id} />
          </>
        )}
        {currentZimmer && (
          <>
            <RecordHeader title={currentZimmer.fields.name ?? 'Zimmer'} subtitle={currentZimmer.fields.kategorie?.label} />
            <RecordSection title="Zimmer" cols={2}>
              <RecordField label="Name" value={currentZimmer.fields.name} format="text" />
              <RecordField label="Kategorie" value={currentZimmer.fields.kategorie} format="pill" hideEmpty />
            </RecordSection>
            <RecordAttachments appId={APP_IDS.ZIMMER} recordId={currentZimmer.record_id} />
          </>
        )}
          </>
        )}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SURFACE 2 — Full-page detail on a page you compose yourself (e.g. an intent
// step that owns a record id). Wrap the composition in <RecordView>; use the
// state-trias (Skeleton / Empty / Error) for the load lifecycle. `aside` opts
// into the 2-column layout. Editing and drilling arrive as PROPS — exactly
// like the generated <{Entity}Details> block: wire them to
// `crud.buchung.openEdit(record)` / `crud.zimmer.openDetail(record)`.
// ─────────────────────────────────────────────────────────────────────────

export function BuchungDetailPageExample({
  onEdit,
  onOpenZimmer,
}: {
  onEdit: (record: Buchung) => void;
  onOpenZimmer: (record: Zimmer) => void;
}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Buchung | null>(null);
  const [zimmerList, setZimmerList] = useState<Zimmer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const getZimmerDisplayName = makeGetZimmerDisplayName(zimmerList);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [buchungen, zimmer] = await Promise.all([
        LivingAppsService.getBuchung(),
        LivingAppsService.getZimmer(),
      ]);
      setZimmerList(zimmer);
      setRecord(buchungen.find(b => b.record_id === id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteBuchungEntry(record.record_id);
    navigate('/');
  }

  if (loading) return <RecordViewSkeleton />;
  if (error) return <RecordViewError error={error} onRetry={loadData} />;
  if (!record) {
    return (
      <RecordViewEmpty
        title="Buchung nicht gefunden"
        action={
          <Button variant="ghost" onClick={() => navigate('/')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            Zurück
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/')}
      onEdit={() => onEdit(record)}
      aside={
        <>
          <RecordSection title="Verknüpfungen" cols={1}>
            <RecordRelation
              label="Zimmer"
              name={getZimmerDisplayName(record.fields.zimmer)}
              icon={IconBed}
              onClick={() => {
                const zid = extractRecordId(record.fields.zimmer);
                const target = zimmerList.find(z => z.record_id === zid);
                if (target) onOpenZimmer(target);
              }}
            />
          </RecordSection>
          <RecordAttachments appId={APP_IDS.BUCHUNG} recordId={record.record_id} />
        </>
      }
    >
      <RecordHeader
        title={record.fields.gast ?? 'Ohne Gast'}
        subtitle={getZimmerDisplayName(record.fields.zimmer)}
        meta={
          <>
            {formatDate(record.fields.anreise)} – {formatDate(record.fields.abreise)}
          </>
        }
      />
      <RecordKeyFacts
        items={[
          { label: 'Gast', value: record.fields.gast ?? '—', icon: IconUser },
          { label: 'Anreise', value: formatDate(record.fields.anreise), icon: IconCalendar },
        ]}
      />
      <RecordSection title="Aufenthalt" cols={2}>
        <RecordField label="Gast" value={record.fields.gast} format="text" />
        <RecordField label="Anreise" value={record.fields.anreise} format="date" />
        <RecordField label="Abreise" value={record.fields.abreise} format="date" />
      </RecordSection>
      {/* Custom value via children — anything the formats don't cover. */}
      <RecordSection title="Verlauf">
        <RecordTimeline
          items={[
            { id: '1', who: 'System', when: formatDate(record.createdat), text: 'Buchung angelegt' },
          ]}
        />
      </RecordSection>

      <div className="flex justify-end pt-2">
        <Button
          variant="ghost"
          onClick={handleDelete}
          className="text-destructive hover:text-destructive"
        >
          <IconTrash className="h-4 w-4 mr-1.5" />
          Löschen
        </Button>
      </div>
    </RecordView>
  );
}
