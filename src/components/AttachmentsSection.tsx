import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment, AttachmentInput, AttachmentType } from '@/types/app';
import {
  getRecordAttachments,
  createRecordAttachment,
  deleteRecordAttachment,
  uploadFile,
} from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  IconPaperclip, IconPlus, IconTrash, IconUpload, IconExternalLink,
  IconFile, IconLink, IconNote, IconBraces, IconLoader2,
} from '@tabler/icons-react';
import { t } from '@/i18n';

interface AttachmentsSectionProps {
  appId: string;
  recordId?: string;
  /** Read-only mode: list attachments, no add/edit/delete UI. */
  readOnly?: boolean;
}

const URL_RE = /^(?:https?:\/\/|www\.)\S+$/i;

/** Sniff the attachment type from a raw text input. */
function detectType(value: string): Exclude<AttachmentType, 'file'> {
  const trimmed = value.trim();
  if (!trimmed) return 'note';
  if (URL_RE.test(trimmed)) return 'url';
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { JSON.parse(trimmed); return 'json'; } catch { /* fall through */ }
  }
  return 'note';
}

function urlDisplay(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return u.host + (path && path !== '/' ? path : '');
  } catch {
    return url;
  }
}

function TypeIcon({ type, className }: { type: AttachmentType; className?: string }) {
  const cls = className ?? 'h-4 w-4';
  if (type === 'file') return <IconFile className={cls} />;
  if (type === 'url') return <IconLink className={cls} />;
  if (type === 'json') return <IconBraces className={cls} />;
  return <IconNote className={cls} />;
}

/** Render a file URL as an <img> thumbnail; fallback to file icon on load error. */
function FileThumbnail({ url, alt }: { url: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
        <IconFile className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-10 w-10 rounded object-cover shrink-0 border bg-muted"
    />
  );
}

function formatRelative(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.round(diffMs / 60000);
  if (m < 1) return t('attachments_rel_just_now');
  if (m < 60) return `${t('attachments_rel_min_prefix')}${m} ${t('attachments_rel_min')}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${t('attachments_rel_hr_prefix')}${h} ${t('attachments_rel_hr')}`;
  const days = Math.round(h / 24);
  if (days < 30) return `${t('attachments_rel_day_prefix')}${days} ${t('attachments_rel_day')}`;
  return d.toLocaleDateString();
}

/* ------------------------- Add-Attachment Sub-Dialog ------------------------- */

interface AddDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called after a successful create — caller refreshes the parent list. */
  onCreated: () => void;
  appId: string;
  recordId: string;
}

function AddAttachmentDialog({ open, onClose, onCreated, appId, recordId }: AddDialogProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const detectedType = useMemo(() => detectType(text), [text]);
  const busy = submitting || uploading;

  // Reset state every time the dialog opens.
  useEffect(() => {
    if (open) {
      setText('');
      setSubmitting(false);
      setUploading(false);
      setDragOver(false);
    }
  }, [open]);

  async function uploadAndAttach(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await uploadFile(file, file.name);
      await createRecordAttachment(appId, recordId, {
        type: 'file',
        label: file.name,
        value: url,
      });
      onCreated();
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t('attachments_upload_failed'));
    } finally {
      setUploading(false);
    }
  }

  async function submitText() {
    const value = text.trim();
    if (!value) return;
    const type = detectedType;
    setSubmitting(true);
    try {
      let label = '';
      if (type === 'url') {
        try { label = new URL(value).host; } catch { label = value.slice(0, 40); }
      } else if (type === 'json') {
        label = 'JSON';
      } else {
        const firstLine = value.split('\n')[0]!;
        label = firstLine.length > 40 ? firstLine.slice(0, 40) + '…' : firstLine;
      }
      const input: AttachmentInput = { type, label, value };
      await createRecordAttachment(appId, recordId, input);
      onCreated();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey && text.trim() && !busy) {
      e.preventDefault();
      void submitText();
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && !busy && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconPaperclip className="h-4 w-4" />
            {t('attachments_add_dialog_title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop-Zone */}
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }}
            onDrop={e => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) void uploadAndAttach(file);
            }}
            onClick={() => !busy && fileInputRef.current?.click()}
            className={`relative rounded-lg border-2 border-dashed transition-all cursor-pointer py-8 ${
              uploading
                ? 'border-primary/40 bg-primary/5 cursor-wait'
                : dragOver
                  ? 'border-primary bg-primary/10'
                  : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
            }`}
          >
            <div className="flex flex-col items-center justify-center gap-2 text-center px-3">
              {uploading ? (
                <>
                  <IconLoader2 className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm text-muted-foreground">{t('attachments_uploading')}</p>
                </>
              ) : (
                <>
                  <IconUpload className="h-8 w-8 text-muted-foreground/70" />
                  <p className="text-sm font-medium">{t('attachments_dz_hint')}</p>
                  <p className="text-xs text-muted-foreground">{t('attachments_dz_subhint')}</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) void uploadAndAttach(f);
                e.target.value = '';
              }}
            />
          </div>

          {uploadError && (
            <p className="text-sm text-destructive text-center px-3" role="alert">{uploadError}</p>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wide">{t('attachments_or')}</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Smart-Input */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
              <TypeIcon type={detectedType} className="h-4 w-4" />
            </div>
            <Input
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={busy}
              placeholder={t('attachments_input_placeholder')}
              className="pl-9 h-10"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => void submitText()}
            disabled={!text.trim() || busy}
          >
            {submitting && <IconLoader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {t('attachments_add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------- Main Section ------------------------- */

export function AttachmentsSection({ appId, recordId, readOnly = false }: AttachmentsSectionProps) {
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [dropOverlay, setDropOverlay] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Attachment | null>(null);
  const dragCounter = useRef(0);

  const reload = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try {
      const list = await getRecordAttachments(appId, recordId);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [appId, recordId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!recordId) {
    return (
      <div className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <IconPaperclip className="h-4 w-4" />
          {t('attachments_label')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('attachments_save_record_first')}
        </p>
      </div>
    );
  }

  async function handleDelete(id: string) {
    if (!recordId) return;
    await deleteRecordAttachment(appId, recordId, id);
    setItems(prev => prev.filter(a => a.id !== id));
  }

  // Power-user shortcut: drop file directly onto the section (anywhere) without
  // opening the dialog first. Uses a counter to handle nested dragenter/leave.
  async function handleSectionDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDropOverlay(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !recordId || readOnly) return;
    setUploading(true);
    try {
      const url = await uploadFile(file, file.name);
      await createRecordAttachment(appId, recordId, {
        type: 'file', label: file.name, value: url,
      });
      await reload();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className="relative space-y-3"
      onDragEnter={readOnly ? undefined : e => {
        e.preventDefault();
        if (!e.dataTransfer.types.includes('Files')) return;
        dragCounter.current += 1;
        setDropOverlay(true);
      }}
      onDragOver={readOnly ? undefined : e => { e.preventDefault(); }}
      onDragLeave={readOnly ? undefined : e => {
        e.preventDefault();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
          dragCounter.current = 0;
          setDropOverlay(false);
        }
      }}
      onDrop={readOnly ? undefined : handleSectionDrop}
    >
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <IconPaperclip className="h-4 w-4" />
          {t('attachments_label')}
          {items.length > 0 && (
            <span className="ml-1 inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full bg-muted text-[10px] font-semibold text-muted-foreground px-1.5">
              {items.length}
            </span>
          )}
        </h3>
        {!readOnly && (
          <Button
            type="button"
            size="sm"
            onClick={() => setAddOpen(true)}
            disabled={uploading}
            className="h-8"
          >
            {uploading ? (
              <IconLoader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <IconPlus className="h-3.5 w-3.5 mr-1" />
            )}
            {t('attachments_add')}
          </Button>
        )}
      </div>

      {loading && items.length === 0 && (
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <IconLoader2 className="h-3.5 w-3.5 animate-spin" />
          {t('attachments_loading')}
        </p>
      )}

      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map(att => {
            // For file/url attachments, the whole card is clickable — opens
            // the link in a new tab. Delete and inner links stopPropagation.
            const linkHref = (att.type === 'file' || att.type === 'url') ? att.value : null;
            const Wrapper: 'a' | 'div' = linkHref ? 'a' : 'div';
            const wrapperProps = linkHref
              ? {
                  href: linkHref,
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  className: 'block group flex items-start gap-3 rounded-md border bg-card px-3 py-2 hover:bg-muted/30 hover:border-primary/40 transition-colors',
                }
              : {
                  className: 'group flex items-start gap-3 rounded-md border bg-card px-3 py-2',
                };
            return (
              <li key={att.id}>
                <Wrapper {...wrapperProps}>
                  {att.type === 'file' && att.value ? (
                    <FileThumbnail url={att.value} alt={att.label ?? ''} />
                  ) : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                      <TypeIcon type={att.type} className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {att.type === 'file' && att.value && (
                      <>
                        <p className="text-sm font-medium truncate">{att.label ?? t('attachments_value_file')}</p>
                        <p className="text-xs text-primary inline-flex items-center gap-1">
                          <IconExternalLink className="h-3 w-3" />
                          {t('attachments_open')}
                        </p>
                      </>
                    )}
                    {att.type === 'url' && att.value && (
                      <>
                        <p className="text-sm font-medium truncate">{att.label ?? urlDisplay(att.value)}</p>
                        <p className="text-xs text-primary truncate">
                          {urlDisplay(att.value)}
                        </p>
                      </>
                    )}
                    {att.type === 'note' && att.value && (
                      <>
                        {att.label && att.label !== att.value && (
                          <p className="text-sm font-medium truncate">{att.label}</p>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">
                          {att.value}
                        </p>
                      </>
                    )}
                    {att.type === 'json' && att.value && (
                      <>
                        <p className="text-sm font-medium truncate">{att.label ?? 'JSON'}</p>
                        <pre className="text-[11px] text-muted-foreground bg-muted/40 rounded px-1.5 py-1 mt-0.5 overflow-x-auto max-h-24 font-mono">
                          {(() => { try { return JSON.stringify(JSON.parse(att.value!), null, 2); } catch { return att.value; } })()}
                        </pre>
                      </>
                    )}
                    {att.createdat && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        {formatRelative(att.createdat)}
                      </p>
                    )}
                  </div>
                  {!readOnly && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDeleteTarget(att);
                      }}
                      aria-label={t('delete')}
                      className="h-8 w-8 p-0 shrink-0 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                    >
                      <IconTrash className="h-4 w-4" />
                    </Button>
                  )}
                </Wrapper>
              </li>
            );
          })}
        </ul>
      ) : !loading ? (
        <p className="text-xs text-muted-foreground py-1">
          {t('attachments_empty')}
        </p>
      ) : null}

      {/* Drag-overlay — covers the section when a file is being dragged over it. */}
      {!readOnly && dropOverlay && (
        <div className="absolute inset-0 rounded-lg border-2 border-dashed border-primary bg-primary/10 flex items-center justify-center pointer-events-none z-10">
          <div className="flex flex-col items-center gap-1.5">
            <IconUpload className="h-7 w-7 text-primary" />
            <p className="text-sm font-medium text-primary">{t('attachments_drop_to_upload')}</p>
          </div>
        </div>
      )}

      {!readOnly && recordId && (
        <AddAttachmentDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={() => void reload()}
          appId={appId}
          recordId={recordId}
        />
      )}

      {!readOnly && (
        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (deleteTarget) void handleDelete(deleteTarget.id);
            setDeleteTarget(null);
          }}
          title={t('attachments_delete_title')}
          description={deleteTarget?.label ? `«${deleteTarget.label}»` : t('attachments_delete_desc')}
        />
      )}
    </div>
  );
}
