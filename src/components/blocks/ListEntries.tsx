import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { IconPlus } from '@tabler/icons-react';
import { t } from '@/i18n';
import type { SummaryItem } from '@/lib/journey/useStepForm';

/**
 * ListEntries — the step of a flow that creates SEVERAL records of one entity
 * in one run („ein paar Termine vorschlagen“). The flow hook owns the list
 * (`flow.lists.<key>`: entries, add, remove, edit); this block renders the
 * editor's fields (its children), the „Hinzufügen“ button and the entries
 * with „Ändern“ / „Entfernen“.
 *
 *   <ListEntries list={flow.lists.terminvorschlaege}>
 *     <Bound form={flow.forms.terminvorschlaege} name="termin" />
 *     <Bound form={flow.forms.terminvorschlaege} name="anmerkung" />
 *   </ListEntries>
 *
 * „Weiter“ on this step is the hook's business (`flow.validateStep(n)`): a
 * filled editor is taken as one more entry, and at least one entry is needed.
 */
export interface ListEntriesList {
  entries: { id: string; rows: SummaryItem[] }[];
  count: number;
  label: string;
  add(): boolean;
  remove(id: string): void;
  edit(id: string): void;
}

export interface ListEntriesProps {
  list: ListEntriesList;
  /** The editor's fields — Bound/Field on the list's form. */
  children?: ReactNode;
  addLabel?: string;
}

export function ListEntries({ list, children, addLabel }: ListEntriesProps) {
  return (
    <div className="space-y-4" data-journey-list="">
      {children}
      <Button type="button" variant="secondary" onClick={() => list.add()} className="inline-flex items-center gap-2">
        <IconPlus size={16} aria-hidden="true" />
        {addLabel ?? t('le_add')}
      </Button>
      {list.count > 0 ? (
        <ol className="divide-y divide-border rounded-[27px] bg-card shadow-lg overflow-hidden" aria-label={t('le_list', { entity: list.label })}>
          {list.entries.map((e, i) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3">
              <span className="text-sm text-muted-foreground">{i + 1}.</span>
              <span className="min-w-0 flex-1 break-words text-sm font-medium">
                {e.rows.map(r => `${r.label}: ${r.value}`).join(' · ')}
              </span>
              <span className="flex gap-3">
                <button type="button" onClick={() => list.edit(e.id)} className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
                  {t('le_edit')}
                </button>
                <button type="button" onClick={() => list.remove(e.id)} className="text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded">
                  {t('le_remove')}
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">{t('le_empty')}</p>
      )}
    </div>
  );
}
