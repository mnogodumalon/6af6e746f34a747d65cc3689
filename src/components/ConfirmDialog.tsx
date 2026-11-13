import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { IconLoader2 } from '@tabler/icons-react';
import { t } from '@/i18n';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** The confirming button's text — default „Löschen“. A dialog that archives,
   *  sends or resets says so here (S-6: every confirmation read „Löschen“). */
  confirmLabel?: string;
  /** Red for a loss, plain for a reversible step. Default 'destructive'. */
  variant?: 'destructive' | 'default';
  /** True while the action runs: both buttons disabled, the confirm shows a spinner. */
  busy?: boolean;
  /** What the action touches — names the dialog lists, so nobody confirms blind. */
  items?: string[];
  cancelLabel?: string;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel, variant = 'destructive', busy = false, items, cancelLabel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => !v && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {items && items.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded-xl bg-muted/50 px-4 py-2 text-sm">
            {items.map((it, i) => <li key={i} className="truncate py-0.5">{it}</li>)}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>{cancelLabel ?? t('cancel')}</Button>
          <Button variant={variant === 'destructive' ? 'destructive' : 'default'} onClick={onConfirm} disabled={busy} className="gap-2">
            {busy && <IconLoader2 size={16} className="animate-spin" aria-hidden="true" />}
            {confirmLabel ?? t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}