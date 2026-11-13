/**
 * Files in a step form — the visitor's document travels INSIDE the record.
 *
 * Live 20.10.2026 (probed on the platform): an anonymous public grant cannot
 * expose `/files` or attachments (400 „does not resolve to a public REST
 * route“), but a FILE FIELD in a record create takes a data URL —
 * `data:<mime>;filename=<name>;base64,<…>` — and the platform stores it as a
 * real file (8 MB, any type, served back byte-identical). The same form works
 * with the owner's REST API, so one shape serves public pages and flows.
 *
 * The platform sets no type or size limit, so the form does: UPLOAD_ACCEPT and
 * UPLOAD_MAX_MB. A data URL is ~4/3 of the file — never put it in a draft
 * (draft.ts drops `data:` values) or a summary (formatFileValue shows the name).
 */

/** What a visitor may send: documents, images, spreadsheets. No executables. */
export const UPLOAD_EXTENSIONS = [
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif',
  'doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp',
] as const;
export const UPLOAD_ACCEPT = UPLOAD_EXTENSIONS.map(e => `.${e}`).join(',');
export const UPLOAD_MAX_MB = 10;

export type UploadProblem = 'type' | 'size' | 'empty';

/** Why a file cannot be sent — null when it can. */
export function uploadProblem(file: File): UploadProblem | null {
  if (file.size === 0) return 'empty';
  if (file.size > UPLOAD_MAX_MB * 1024 * 1024) return 'size';
  const ext = (file.name.split('.').pop() ?? '').toLowerCase();
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) return 'type';
  return null;
}

/** The name as the data URL can carry it: no `;`, `,`, quotes or whitespace
 *  (umlauts are fine — the platform transliterates them). */
export function uploadFileName(name: string): string {
  const clean = name.replace(/[;,"'\\\s]+/g, '_').replace(/_+/g, '_').slice(-120);
  return clean || 'datei';
}

/** The file as the value a file field takes: `data:<mime>;filename=<name>;base64,…`. */
export function fileToUploadValue(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      const comma = raw.indexOf(',');
      const head = raw.slice(5, comma).replace(/;base64$/, '') || file.type || 'application/octet-stream';
      resolve(`data:${head};filename=${uploadFileName(file.name)};base64,${raw.slice(comma + 1)}`);
    };
    reader.readAsDataURL(file);
  });
}

/** True for a file the form holds but has not sent yet. */
export function isUploadValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:');
}

/** The file's name for a summary or a chip — from a pending upload or a stored file URL. */
export function uploadDisplayName(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  if (value.startsWith('data:')) {
    const m = /;filename=([^;,]+)/.exec(value);
    return m ? m[1] : 'Datei';
  }
  const last = value.split('?')[0].split('/').filter(Boolean).pop() ?? '';
  return decodeURIComponent(last) || 'Datei';
}

/** Approximate size of a pending upload in bytes (base64 → bytes). */
export function uploadSize(value: unknown): number {
  if (!isUploadValue(value)) return 0;
  const b64 = value.slice(value.indexOf(',') + 1);
  return Math.floor((b64.length * 3) / 4);
}
