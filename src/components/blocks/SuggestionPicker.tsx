/**
 * blocks/SuggestionPicker.tsx — take ONE suggestion of a list into a field, with one click (generated).
 *
 *   <SuggestionPicker {...flow.suggest('fragestellung')} />
 *
 * J-10 (Abnahme 6): the follow-up question took ALL proposals of the AI result
 * as one block. The hook reads the picked record's list (`user:from_pick_line`),
 * this block shows one row per suggestion; a click writes exactly that line
 * into the field, which stays editable. Presentational — no data access.
 */
import { IconCheck } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';

export interface SuggestionPickerProps {
  suggestions: string[];
  /** The field's current value — the row it equals is marked taken. */
  value?: unknown;
  onPick: (suggestion: string) => void;
  /** Heading above the rows, e.g. „Vorschläge aus der Auswertung“. */
  label?: string;
  /** Shown while there is nothing to offer (no record picked yet, an empty list). */
  emptyText?: string;
}

export function SuggestionPicker({ suggestions, value, onPick, label, emptyText }: SuggestionPickerProps) {
  if (suggestions.length === 0) {
    return emptyText ? <p className="text-sm text-muted-foreground" data-suggestions-empty>{emptyText}</p> : null;
  }
  const current = typeof value === 'string' ? value.trim() : '';
  return (
    <div className="space-y-2" data-suggestions>
      {label ? <p className="text-sm font-medium">{label}</p> : null}
      <ul className="space-y-2">
        {suggestions.map((s, i) => {
          const taken = current !== '' && current === s;
          return (
            <li key={i} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2">
              <span className="flex-1 text-sm leading-relaxed">{s}</span>
              <Button type="button" size="sm" variant={taken ? 'secondary' : 'outline'} onClick={() => onPick(s)}
                aria-pressed={taken} data-suggestion-take>
                {taken ? <><IconCheck size={14} stroke={1.75} /> {t('sp_taken')}</> : t('sp_take')}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default SuggestionPicker;
