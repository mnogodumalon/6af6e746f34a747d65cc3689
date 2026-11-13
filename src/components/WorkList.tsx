import { useState, type ReactNode } from 'react';
import { t } from '@/i18n';

/**
 * WorkList — the aside ACTION list (not a link list).
 *
 * Anatomy it owns, so it cannot degrade between builds:
 *   · every row opens the record's detail (→ <RecordOverlay>) via `onItemClick`
 *   · the trailing quick-action performs the workflow's NEXT STEP (advance the
 *     status, confirm, check-out) — wired as role="button" with stopPropagation,
 *     never a nested <button>
 *   · status lives in the second line as a colored WORD, never a truncating badge
 *   · capped at `max` rows with a "+N weitere" line
 *   · empty state shows the NEXT real record or a CTA — never a dead
 *     "Keine Einträge" box without a way forward
 *
 * What a row SHOWS and what the action DOES stays with the consumer:
 *
 *   <WorkList
 *     title="Fällig heute & überfällig"
 *     items={faellige.map(r => ({
 *       id: r.record_id,
 *       title: r.kundeName ?? r.fields.kennzeichen,
 *       secondLine: <><span className="font-medium text-destructive">Überfällig</span>
 *                     <span className="text-muted-foreground"> · {formatDate(r.fields.faellig)}</span></>,
 *       action: { label: '✓ Weiter', onClick: () => advance(r) },   // same shared helper as board + overlay
 *     }))}
 *     onItemClick={id => overlay.replace({ id })}
 *     empty={{ text: 'Alles im Zeitplan — nächster Termin Di 11:00', action: { label: 'Neuer Auftrag', onClick: openCreate } }}
 *   />
 */
export interface WorkListItem {
  id: string;
  /** The person/thing — the record's name field, not the entity name. */
  title: ReactNode;
  /** Status as a colored word + context, e.g. <span className="text-destructive">Überfällig</span> · 12.06. */
  secondLine?: ReactNode;
  /** Leading icon for the row (optional). */
  icon?: ReactNode;
  /** The advancing quick-action — the workflow's next step, NOT an edit link. */
  action?: { label: ReactNode; onClick: () => void };
}

interface WorkListProps {
  /** Section heading, e.g. "Fällig heute & überfällig". */
  title: ReactNode;
  /** Heading icon (optional). */
  icon?: ReactNode;
  items: WorkListItem[];
  /** Row click → open the record's <RecordOverlay>. */
  onItemClick: (id: string) => void;
  /** Shown when `items` is empty. `text` names the NEXT real thing
   *  ("Nächste Anreise: Di — Fam. Öztürk"); `action` is a CTA fallback. */
  empty?: { text: ReactNode; action?: { label: ReactNode; onClick: () => void } };
  /** Max visible rows before the "+N weitere" line (default 5). */
  max?: number;
  className?: string;
}

export function WorkList({ title, icon, items, onItemClick, empty, max = 5, className }: WorkListProps) {
  // „+N weitere“ opens the rest — a cut list with no way to the hidden rows
  // let a contribution vanish from the moderation (acceptance 4, S-15)
  const [all, setAll] = useState(false);
  const visible = all ? items : items.slice(0, max);
  const rest = items.length - visible.length;
  return (
    <section className={`rounded-[27px] bg-card p-5 shadow-lg overflow-hidden ${className ?? ''}`}>
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        <span className="min-w-0 truncate">{title}</span>
      </h2>
      {items.length === 0 ? (
        <div className="mt-3 space-y-3">
          {empty?.text ? <p className="text-sm text-muted-foreground">{empty.text}</p> : null}
          {empty?.action ? (
            <button
              type="button"
              onClick={empty.action.onClick}
              className="inline-flex items-center justify-center gap-1.5 min-h-9 max-sm:min-h-11 rounded-lg border border-border px-3 max-sm:px-4 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
            >
              {empty.action.label}
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-border -mx-2">
          {visible.map(item => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onItemClick(item.id)}
                className="flex w-full items-center gap-2 rounded-xl px-2 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                {item.icon ? <span className="shrink-0 text-muted-foreground">{item.icon}</span> : null}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  {item.secondLine ? <span className="mt-0.5 block truncate text-xs">{item.secondLine}</span> : null}
                </span>
                {item.action ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); item.action!.onClick(); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        item.action!.onClick();
                      }
                    }}
                    className="shrink-0 inline-flex items-center justify-center min-h-8 max-sm:min-h-11 rounded-lg border border-border px-2 max-sm:px-4 py-1 text-xs max-sm:text-sm font-medium hover:bg-muted transition-colors"
                  >
                    {item.action.label}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
          {rest > 0 ? (
            <li>
              <button type="button" onClick={() => setAll(true)} data-worklist-more=""
                className="w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-primary hover:bg-muted transition-colors">
                {t('wl_more', { n: rest })}
              </button>
            </li>
          ) : all && items.length > max ? (
            <li>
              <button type="button" onClick={() => setAll(false)} className="w-full rounded-lg px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted transition-colors">
                {t('wl_less')}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  );
}
