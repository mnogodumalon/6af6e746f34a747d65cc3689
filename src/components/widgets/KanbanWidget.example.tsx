/**
 * KanbanWidget.example.tsx — the single copyable wiring truth for KanbanWidget.
 *
 * This file is STATIC (no Jinja2, no conditional emission) and is compiled by
 * the contract tsc-gate against the frozen hotel fixture (entity `buchung`
 * with the static lookup `status`: angefragt/bestaetigt/eingecheckt/abgereist,
 * plus gast/anreise; entity `zimmer`). It shows the full wiring the agent
 * reproduces in the dashboard: columns from the SCHEMA's lookup values, map
 * records → KanbanCard[], move a card = write the status key back, open a
 * <RecordOverlay> on click, add a card with the status prefilled.
 * Copy a block, swap the field names, ship.
 *
 * Every import resolves; every enum value is a real one; there is NO `parseId`
 * helper — the card id is built with a template literal and read back with
 * `id.split(':')` (the family convention).
 */
import { useEffect, useMemo, useState } from 'react';
import { LivingAppsService } from '@/services/livingAppsService';
import type { Buchung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS, lookupOption } from '@/types/app';
import { lookupKey } from '@/lib/formatters';
import {
  RecordOverlay,
  RecordHeader,
  RecordSection,
  RecordField,
  RecordAttachments,
  useRecordOverlayStack,
} from './RecordView';
import {
  KanbanWidget,
  KanbanSkeleton,
  KanbanError,
  type KanbanCard,
  type KanbanColumn,
  type KanbanTone,
} from './KanbanWidget';

const CARD_PREFIX = 'buchung';
function buchungIdOf(card: KanbanCard): string {
  return card.id.split(':')[1] ?? '';
}

// tone is a CLOSED enum (KanbanTone) — `'danger'` does NOT exist. Map workflow
// semantics, not decoration: the terminal stage reads muted, the active one
// primary. Anything richer than a colour belongs in renderCard.
function toneForStatus(status: string | undefined): KanbanTone {
  if (status === 'eingecheckt') return 'success';
  if (status === 'bestaetigt') return 'primary';
  if (status === 'abgereist') return 'default';
  return 'warning';   // angefragt / unbearbeitet → needs attention
}

export function HotelKanbanExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

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

  // Columns come from the SCHEMA, not from guesses: LOOKUP_OPTIONS holds every
  // static lookup's key→label pairs per app/field. The column ORDER is the
  // lookup's order — reorder here if the workflow reads differently.
  //
  // INSIDE the component body, never at module scope: `o.label` is a
  // locale-aware GETTER, so a module-scope derivation resolves once at import
  // and freezes that language for the session (a Czech dashboard kept English
  // kanban columns). check-dashboard gate 22 rejects the hoisted form — this
  // example used to show it and walked a live build straight into the gate.
  const COLUMNS = useMemo<KanbanColumn[]>(
    () => (LOOKUP_OPTIONS['buchung']?.['status'] ?? []).map(o => ({ key: o.key, label: o.label })),
    [],
  );

  // Records → the widget's lean, data-agnostic card shape. The status FIELD
  // NAME lives HERE, in the consumer — never in the widget. `lookupKey()`
  // unwraps the LookupValue to its opaque key; an unset status maps to the
  // first column EXPLICITLY (better than relying on the fallback column).
  const cards = useMemo<KanbanCard[]>(
    () =>
      buchungen.map(b => {
        const status = lookupKey(b.fields.status) ?? COLUMNS[0]?.key ?? '';
        return {
          id: `${CARD_PREFIX}:${b.record_id}`,
          column: status,
          title: b.fields.gast ?? 'Ohne Gast',
          subtitle: b.fields.anreise,
          tone: toneForStatus(status),
        };
      }),
    [buchungen, COLUMNS],
  );

  // Status change on drag. DRAG IS OFF until onCardMove is passed. Optimistic
  // local patch, write the PLAIN KEY back (Create<Entity> accepts the key
  // string for lookup fields — the service converts it), re-fetch on error.
  // RULES use the REJECTION CHANNEL: check FIRST and RETURN the reason — the
  // widget snaps the card back and shows the string in its built-in notice.
  // Never build an own banner next to it (double notice).
  const moveCard = async (cardId: string, newColumn: string) => {
    const rid = cardId.split(':')[1];
    if (!rid) return;
    if (newColumn === 'eingecheckt' && buchungen.filter(b => lookupKey(b.fields.status) === 'eingecheckt').length >= 5) {
      return 'Maximal 5 Gäste gleichzeitig eingecheckt — bitte erst einen Check-out buchen.';
    }
    setBuchungen(prev =>
      prev.map(b =>
        b.record_id === rid
          // lookupOption is the ONLY way to synthesize a LookupValue: it keeps
          // the locale-aware label getter alive. A re-typed label freezes one
          // language; `label: newColumn` prints the raw key in every list.
          ? { ...b, fields: { ...b.fields, status: lookupOption('buchung', 'status', newColumn) } }
          : b,
      ),
    );
    try {
      await LivingAppsService.updateBuchungEntry(rid, { status: newColumn });
    } catch {
      await reload();
    }
  };

  if (loading) return <KanbanSkeleton />;
  if (error) return <KanbanError error={error} onRetry={() => void reload()} />;

  const current = overlay.top ? buchungen.find(b => b.record_id === overlay.top!.id) : undefined;

  return (
    <>
      <KanbanWidget
        cards={cards}
        columns={COLUMNS}
        // The terminal stage starts COLLAPSED (narrow strip, count visible,
        // still a drop target) — never solve width by dropping a column.
        defaultCollapsed={['abgereist']}
        onCardClick={card => overlay.replace({ type: CARD_PREFIX, id: buchungIdOf(card) })}
        onCardMove={moveCard}
        // The built-in "+ Karte" button fires with the column key — open the
        // generated create dialog with the status prefilled. In a real
        // dashboard: setCreateDefaults({ status: column }); setCreateOpen(true).
        onAddCard={column => {
          void LivingAppsService.createBuchungEntry({ gast: 'Neue Buchung', status: column }).then(() => void reload());
        }}
        // Per-column aggregates come via CLOSURE over YOUR data — the slot
        // only receives the column. (The default header already shows the
        // count; replace it only when you need more.)
        renderColumnHeader={col => (
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{col.label}</span>
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {cards.filter(c => c.column === col.key).length}
            </span>
          </span>
        )}
      />

      {/* A clicked card opens a <RecordOverlay> — the board owns no detail layer. */}
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
            </RecordSection>
            <RecordAttachments appId={APP_IDS.BUCHUNG} recordId={current.record_id} />
          </>
        )}
      </RecordOverlay>
    </>
  );
}
