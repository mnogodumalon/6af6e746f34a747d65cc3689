import { useRef, useState } from 'react';
import { IconFileUpload, IconPaperclip, IconX } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { t } from '@/i18n';
import {
  UPLOAD_ACCEPT, UPLOAD_MAX_MB, fileToUploadValue, uploadDisplayName, uploadProblem, uploadSize,
} from '@/lib/journey/upload';

/**
 * FileField — one file for a file field of a step form (public page or flow).
 * Bind it with `form.file(key)` (Bound does that for a field of kind `file`):
 *   <FileField {...form.file('angebot')} />
 * The chosen file becomes the field's value as a data URL; the record create
 * carries it, the platform stores it (see lib/journey/upload). Types and the
 * size limit are checked here — the platform checks neither.
 */
export interface FileFieldProps {
  id: string;
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  required?: boolean;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

function sizeLabel(bytes: number): string {
  if (bytes <= 0) return '';
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileField({ id, name, value, onChange, required, invalid, describedBy, disabled }: FileFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    const why = uploadProblem(file);
    if (why) {
      setProblem(why === 'size' ? t('up_too_big', { mb: UPLOAD_MAX_MB }) : why === 'type' ? t('up_bad_type') : t('up_empty'));
      if (input.current) input.current.value = '';
      return;
    }
    setProblem(null);
    setReading(true);
    try {
      onChange(await fileToUploadValue(file));
    } catch {
      setProblem(t('up_read_failed'));
    } finally {
      setReading(false);
      if (input.current) input.current.value = '';
    }
  };

  const fileName = uploadDisplayName(value);
  return (
    <div className="space-y-2">
      <input
        ref={input}
        id={id}
        name={name}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="sr-only"
        required={required && !value}
        aria-invalid={invalid || Boolean(problem) || undefined}
        aria-describedby={describedBy}
        disabled={disabled || reading}
        onChange={e => void choose(e.target.files?.[0])}
      />
      {value ? (
        <div className="flex min-w-0 items-center gap-2 rounded-xl border bg-card px-3 py-2">
          <IconPaperclip size={16} className="shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-sm" title={fileName}>{fileName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{sizeLabel(uploadSize(value))}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => input.current?.click()} disabled={disabled || reading}>
            {t('up_replace')}
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={t('up_remove')} onClick={() => onChange(null)} disabled={disabled}>
            <IconX size={16} />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => input.current?.click()}
          disabled={disabled || reading}
          data-journey-file=""
        >
          <IconFileUpload size={16} className="shrink-0" />
          {reading ? t('up_reading') : t('up_choose')}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{t('up_hint', { mb: UPLOAD_MAX_MB })}</p>
      {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
    </div>
  );
}
