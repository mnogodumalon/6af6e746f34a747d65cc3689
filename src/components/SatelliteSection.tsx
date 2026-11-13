import type { ComponentType, ReactNode } from 'react';
import { IconPlus, IconLink } from '@tabler/icons-react';
import { RecordSection, RecordRelation } from '@/components/widgets/RecordView';
import { t } from '@/i18n';

/**
 * SatelliteSection — one section of a hub record's overlay (hub-and-spoke).
 *
 * In a hub app (a central entity with many applookup satellites — Baustelle ←
 * Mängel/Berichte/Fotos/…), the hub's overlay shows ONE of these per satellite
 * entity. The component bakes in the three mechanics that are easy to get wrong
 * by hand, so they're guaranteed by construction:
 *   1. it renders a "+" whenever the user may create (`onAdd` given — the
 *      scaffold leaves it out for a list the user may not write);
 *   2. clicking a row calls `onOpen` (→ open the record's DETAIL overlay via
 *      overlay.push), NEVER the edit form — editing happens from inside that
 *      detail;
 *   3. consistent header-with-count + relation-list + dashed-add layout;
 *   4. optional `onPick` — a second dashed action "choose existing" for
 *      satellites whose members already exist before they join (a consultant,
 *      a customer). EntityCrud wires it for every list-field (multipleapplookup)
 *      back-reference; hand-rendered sections may pass it too.
 *
 * Render one per entity in HUB_TOPOLOGY[hubKey]; the gate checks completeness.
 *
 *   <SatelliteSection
 *     title="Mängel"
 *     items={maengelVon(b.record_id)}
 *     getKey={m => m.record_id}
 *     map={m => ({ name: m.fields.typ, label: m.fields.prioritaet?.label, meta: m.fields.beschreibung, icon: IconAlertTriangle })}
 *     onOpen={m => overlay.push({ typ: 'mangel', id: m.record_id })}   // DETAIL, not edit
 *     onAdd={() => openCreate('maengelerfassung', b.record_id)}        // the "+"
 *   />
 */
type IconType = ComponentType<{ size?: number | string; className?: string; stroke?: number | string }>;

export interface SatelliteRow {
  /** The record's name/identifier line. */
  name: ReactNode;
  /** Small uppercase label above the name (status, priority…). */
  label?: ReactNode;
  /** Secondary line (description, date…). */
  meta?: ReactNode;
  /** Per-row leading icon. */
  icon?: IconType;
}

interface SatelliteSectionProps<T> {
  /** Satellite entity name, e.g. "Mängel" — count is appended automatically. */
  title: string;
  items: T[];
  /** How one record renders as a row. */
  map: (item: T) => SatelliteRow;
  /** Row click → open the record's DETAIL overlay (overlay.push). NOT the edit form. */
  onOpen: (item: T) => void;
  /** REQUIRED — the contextual "+" that opens this entity's create dialog with the hub pre-set. */
  onAdd?: () => void;
  /** Defaults to a localised "add ${title}" label. */
  addLabel?: string;
  /** Optional "choose existing" action — opens a picker that links an EXISTING record. */
  onPick?: () => void;
  /** Defaults to a localised "choose existing" label. */
  pickLabel?: string;
  /** Section heading icon. */
  icon?: IconType;
  getKey?: (item: T) => string;
  emptyText?: string;
}

export function SatelliteSection<T,>({ title, items, map, onOpen, onAdd, addLabel, onPick, pickLabel, icon, getKey, emptyText }: SatelliteSectionProps<T>) {
  return (
    <RecordSection title={`${title} (${items.length})`} icon={icon}>
      <div className="flex flex-col gap-2">
        {items.map((item, i) => {
          const row = map(item);
          return (
            <RecordRelation
              key={getKey ? getKey(item) : i}
              label={row.label}
              name={row.name}
              meta={row.meta}
              icon={row.icon}
              onClick={() => onOpen(item)}
            />
          );
        })}
        {items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            {emptyText ?? t('sat_empty', { title })}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row">
          {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <IconPlus size={18} stroke={1.75} />{addLabel ?? t('sat_add', { title })}
          </button>
          )}
          {onPick && (
            <button
              type="button"
              onClick={onPick}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
            >
              <IconLink size={18} stroke={1.75} />{pickLabel ?? t('sat_pick')}
            </button>
          )}
        </div>
      </div>
    </RecordSection>
  );
}
