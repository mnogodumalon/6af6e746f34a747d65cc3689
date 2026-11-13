import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/Combobox';
import { t } from '@/i18n';

/**
 * PickExistingDialog — "choose an existing record" next to a satellite's "+".
 *
 * A satellite list under a hub record has two kinds of members: records that
 * are NEW by nature (a time entry, an invoice) and records that already EXIST
 * before they join (a consultant, a customer). The "+" covers the first case
 * (create with the hub pre-set). This dialog covers the second: pick one of
 * the source records that does not reference the hub yet, then the caller
 * appends the hub to the source record's list field (multipleapplookup) via
 * `onPick`. Wired by EntityCrud for every list-field back-reference; the
 * page never composes it by hand.
 */
export interface PickExistingItem {
  id: string;
  label: string;
  hint?: string;
}

interface PickExistingDialogProps {
  open: boolean;
  onClose: () => void;
  /** Dialog heading, e.g. "Berater/innen verknüpfen". */
  title: string;
  description?: string;
  /** Candidates that are NOT linked yet — the caller filters. */
  items: PickExistingItem[];
  /** Persist the link; the dialog closes when the promise resolves. */
  onPick: (id: string) => Promise<void> | void;
}

export function PickExistingDialog({ open, onClose, title, description, items, onPick }: PickExistingDialogProps) {
  const [value, setValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setValue(null);
  }, [open]);

  async function confirm() {
    if (!value || busy) return;
    setBusy(true);
    try {
      await onPick(value);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? t('pick_description')}</DialogDescription>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            {t('pick_empty')}
          </p>
        ) : (
          <Combobox
            items={items}
            value={value}
            onChange={setValue}
            placeholder={t('pick_placeholder')}
            searchPlaceholder={t('pick_placeholder')}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{t('cancel')}</Button>
          <Button onClick={confirm} disabled={!value || busy}>{t('pick_confirm')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
