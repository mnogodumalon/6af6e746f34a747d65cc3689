// AUTOMATICALLY GENERATED SERVICE
import { APP_IDS, LOOKUP_OPTIONS, FIELD_TYPES } from '@/types/app';
import { ensureUploadableImage } from '@/lib/ai';
import { REST_URL, restFetch } from '@/lib/origin';
import { reportFailedWrite } from '@/lib/sentry';
import type { Umfragen, Terminvorschlaege, Antworten, CreateUmfragen, CreateTerminvorschlaege, CreateAntworten } from '@/types/app';

// Base Configuration — the host is a RUNTIME fact (lib/origin.ts):
// a bundle copied to another LA instance must talk to THAT instance.
const API_BASE_URL = REST_URL;

// --- HELPER FUNCTIONS ---
export function extractRecordId(url: unknown): string | null {
  if (!url) return null;
  if (typeof url !== 'string') return null;
  const match = url.match(/([a-f0-9]{24})$/i);
  return match ? match[1] : null;
}

// multipleapplookup form-state is Array<URL>. The MultiCombobox picker
// works on record-ids; this helper maps a raw form value (which may be
// undefined, null, a single URL string from a legacy single-Combobox
// render, or the expected URL array) to a clean string[] of ids.
export function extractRecordIds(urls: unknown): string[] {
  if (!urls) return [];
  const arr = Array.isArray(urls) ? urls : [urls];
  const out: string[] = [];
  for (const u of arr) {
    const id = extractRecordId(u);
    if (id) out.push(id);
  }
  return out;
}

export function createRecordUrl(appId: string, recordId: string): string {
  return `${API_BASE_URL}/apps/${appId}/records/${recordId}`;
}

export class LivingAppsApiError extends Error {
  status: number;
  type?: string;
  /** Stable error type identifier — the last path segment of `type`
   *  (v1: `…/rest/v1/docs/errors/<id>`, e.g. `no_app_permission`). */
  code?: string;
  control_identifier?: string;
  control_type?: string;
  field_type?: string;
  detail?: string;
  constructor(message: string, status: number, raw?: Record<string, unknown>) {
    super(message);
    this.name = 'LivingAppsApiError';
    this.status = status;
    if (raw) {
      this.type = typeof raw.type === 'string' ? raw.type : undefined;
      this.code = this.type ? this.type.replace(/\/+$/, '').split('/').pop() : undefined;
      this.control_identifier = typeof raw.control_identifier === 'string' ? raw.control_identifier : undefined;
      this.control_type = typeof raw.control_type === 'string' ? raw.control_type : undefined;
      this.field_type = typeof raw.field_type === 'string' ? raw.field_type : undefined;
      this.detail = typeof raw.detail === 'string' ? raw.detail : undefined;
    }
  }
}

async function parseErrorBody(response: Response): Promise<{ message: string; raw?: Record<string, unknown> }> {
  const text = await response.text();
  if (!text) return { message: `HTTP ${response.status}` };
  try {
    const raw = JSON.parse(text);
    if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const message = typeof obj.detail === 'string' ? obj.detail
        : typeof obj.title === 'string' ? obj.title
        : text;
      return { message, raw: obj };
    }
  } catch { /* fall through to text */ }
  return { message: text };
}

export interface CallApiOptions {
  /** Skip errorbus dispatch for expected failures (e.g. optional-param 404s). */
  silent?: boolean;
  /** Abort the request (a keystroke replacing the previous search). */
  signal?: AbortSignal;
}

/** Query options of GET /apps/{id}/records — filter/orderby are vSQL (see the journey layer's
 *  buildSearchFilter; never concatenate user input into them yourself). */
export interface RecordQuery {
  filter?: string;
  orderby?: string[];
  limit?: number;
  offset?: number;
  /** Field projection (`field=` repeated). The record's `fields` then holds ONLY these keys. */
  fields?: string[];
  signal?: AbortSignal;
  /** A read a display surface repeats (polling, a live board): a network failure
 *  is no toast — the surface keeps its last state and says it is stale (S-9). */
  silent?: boolean;
}
// URLSearchParams encodes spaces as `+` — the API accepts it (verified live
// 2026-09-02: orderby=r.v_nachname+asc → 200, sorted; filter with + → 200).
export function recordQueryString(q: RecordQuery): string {
  const p = new URLSearchParams();
  if (q.filter) p.set('filter', q.filter);
  for (const o of q.orderby ?? []) p.append('orderby', o);
  for (const f of q.fields ?? []) p.append('field', f);
  if (q.limit !== undefined) p.set('limit', String(Math.max(1, Math.floor(q.limit))));
  if (q.offset !== undefined) p.set('offset', String(Math.max(0, Math.floor(q.offset))));
  const s = p.toString();
  return s ? `?${s}` : '';
}
/** `[[n]]` from aggregate_records?value=count() -> n; `[]` -> 0; anything else -> 0 (never NaN). */
export function parseAggregateCount(data: unknown): number {
  if (!Array.isArray(data)) return 0;
  if (data.length === 0) return 0;
  const first = data[0];
  const n = Array.isArray(first) ? Number(first[0]) : Number(first);
  return Number.isFinite(n) ? n : 0;
}

/** What the create and update helpers resolve to. Same `record_id`
 *  the read helpers expose, so the whole family behaves alike — the
 *  raw REST answer only
 *  carries `id`, and code that guessed (e.g. Object.keys(res)[0]) built
 *  `/records/id` and got a 400 on the next write. */
export interface MutationResult {
  record_id: string;
  id: string;
  fields: Record<string, any>;
  [key: string]: any;
}

/** The entity (APP_IDS key, lower case) a REST endpoint writes to — for the
 *  failed-write report, which names the entity, never the record. */
function entityOfEndpoint(endpoint: string): string | undefined {
  const m = /\/apps\/([a-f0-9]{24})/.exec(endpoint);
  if (!m) return undefined;
  return (Object.keys(APP_IDS) as (keyof typeof APP_IDS)[]).find(k => APP_IDS[k] === m[1])?.toLowerCase();
}

async function callApi(method: string, endpoint: string, data?: any, options?: CallApiOptions) {
  const silent = options?.silent === true;
  let response: Response;
  try {
    response = await restFetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',  // Nutze Session Cookies für Auth
      signal: options?.signal,
      body: data ? JSON.stringify(data) : undefined
    });
  } catch (netErr) {
    // A search the user typed past is cancelled, not broken — it must not
    // raise an error toast on its way out.
    if (netErr instanceof Error && netErr.name === 'AbortError') throw netErr;
    const message = netErr instanceof Error ? netErr.message : String(netErr);
    if (!silent) {
      window.dispatchEvent(new CustomEvent('errorbus:emit', { detail: {
        source: 'network', message, status: 0,
      } }));
    }
    if (method !== 'GET') reportFailedWrite({ method, status: 0, entity: entityOfEndpoint(endpoint) });
    throw netErr;
  }
  if (!response.ok) {
    // 401 = not signed in → the login screen, never the errorbus (repair can't fix auth).
    // 403 = signed in, but this list is not theirs to read or write: a notice,
    // the page stays (05.10.2026 — it used to say „not logged in“ and blank everything).
    const isAuthError = response.status === 401;
    if (isAuthError) window.dispatchEvent(new Event('auth-error'));
    const { message, raw } = await parseErrorBody(response);
    const err = new LivingAppsApiError(message, response.status, raw);
    if (!silent && !isAuthError) {
      window.dispatchEvent(new CustomEvent('errorbus:emit', { detail: {
        source: 'api',
        status: err.status,
        type: err.type,
        control_identifier: err.control_identifier,
        control_type: err.control_type,
        field_type: err.field_type,
        detail: err.detail,
        message: err.message,
      } }));
    }
    // A refused write goes to Sentry as well as to the toast: the user sees it,
    // now we do too (27.10.2026 — not one failed save had ever reached Sentry).
    if (method !== 'GET') {
      reportFailedWrite({ method, status: err.status, code: err.code, field: err.control_identifier, entity: entityOfEndpoint(endpoint) });
    }
    throw err;
  }
  // DELETE returns often empty body or simple status
  if (method === 'DELETE') return true;
  return response.json();
}

/** Upload a file to LivingApps. Returns the file URL for use in record fields. */
export async function uploadFile(file: File | Blob, filename?: string): Promise<string> {
  // HEIC/HEIF (iPhone photos) crash the server-side image decoder (500).
  // Convert to JPEG in the browser BEFORE upload — every upload path routes
  // through here, so this one guard covers form fields AND attachments.
  if (file instanceof File) file = await ensureUploadableImage(file);
  const formData = new FormData();
  formData.append('file', file, filename ?? (file instanceof File ? file.name : 'upload'));
  const res = await restFetch(`${API_BASE_URL}/files`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event('auth-error'));
    else if (res.status === 403) window.dispatchEvent(new CustomEvent('errorbus:emit', { detail: {
      source: 'api', status: 403, message: 'File upload failed: 403',
    } }));
    throw new Error(`File upload failed: ${res.status}`);
  }
  const data = await res.json();
  return data.url;
}

// --- ATTACHMENT API ---
// Record-attachments: file/note/url/json blobs attached to a single record.
// `getAttachments` returns a dict keyed by attachment id; we flatten to an array.
export async function getRecordAttachments(appId: string, recordId: string) {
  const data = await callApi('GET', `/apps/${appId}/records/${recordId}/attachments`, undefined, { silent: true }).catch(() => ({}));
  if (!data || typeof data !== 'object') return [] as import('@/types/app').Attachment[];
  return Object.entries(data).map(([id, att]) => ({ id, ...(att as Record<string, unknown>) })) as import('@/types/app').Attachment[];
}

export async function createRecordAttachment(appId: string, recordId: string, input: import('@/types/app').AttachmentInput) {
  return callApi('POST', `/apps/${appId}/records/${recordId}/attachments`, input) as Promise<import('@/types/app').Attachment>;
}

export async function updateRecordAttachment(appId: string, recordId: string, attachmentId: string, input: Partial<import('@/types/app').AttachmentInput>) {
  return callApi('PATCH', `/apps/${appId}/records/${recordId}/attachments/${attachmentId}`, input) as Promise<import('@/types/app').Attachment>;
}

export async function deleteRecordAttachment(appId: string, recordId: string, attachmentId: string) {
  return callApi('DELETE', `/apps/${appId}/records/${recordId}/attachments/${attachmentId}`);
}

function enrichLookupFields<T extends { fields: Record<string, unknown> }>(
  records: T[], entityKey: string
): T[] {
  const opts = LOOKUP_OPTIONS[entityKey];
  if (!opts) return records;
  return records.map(r => {
    const fields = { ...r.fields };
    for (const [fieldKey, options] of Object.entries(opts)) {
      const val = fields[fieldKey];
      if (typeof val === 'string') {
        const m = options.find(o => o.key === val);
        fields[fieldKey] = m ?? { key: val, label: val };
      } else if (Array.isArray(val)) {
        fields[fieldKey] = val.map(v => {
          if (typeof v === 'string') {
            const m = options.find(o => o.key === v);
            return m ?? { key: v, label: v };
          }
          return v;
        });
      }
    }
    return { ...r, fields } as T;
  });
}

/** A textarea that HOLDS A LIST but was typed on one line.
 *
 *  Rendering such a field as tiles/bullets is the natural thing to do, and
 *  the natural way to write it is `value.split('\n')` — one item per line
 *  is the convention every form implies. Owners type differently though:
 *  a live landing page collapsed five services into ONE tile because the
 *  record held 'Tagesbetreuung, Übernachtung, …' without a single line
 *  break. Normalizing HERE makes that natural split correct whatever was
 *  typed, instead of asking every page to re-derive the heuristic.
 *
 *  Deliberately conservative — prose must survive untouched:
 *    · already has line breaks  → left alone (the author's own structure)
 *    · ; • · |                  → unambiguous separators, 2 parts suffice
 *    · commas                   → only with 3+ parts that all read like
 *                                 labels: short, at most four words, no
 *                                 sentence punctuation. A prose clause like
 *                                 "Katzen und Kleintiere aller Rassen" is
 *                                 short enough but not wordy-short.
 *  Anything else stays as it is, so a wrong guess degrades to today's
 *  behaviour (one item), never to mangled prose. */
const LIST_LABEL_MAX = 40;
const LIST_LABEL_MAX_WORDS = 4;
function listTextToLines(text: string): string {
  if (!text || /\r?\n/.test(text)) return text;
  const bulleted = text.split(/\s*[;•·|]\s*/).map(s => s.trim()).filter(Boolean);
  if (bulleted.length >= 2) return bulleted.join('\n');
  const parts = text.split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
  const looksLikeLabels = parts.length >= 3 && parts.every(p =>
    p.length <= LIST_LABEL_MAX
    && p.split(/\s+/).length <= LIST_LABEL_MAX_WORDS
    && !/[.!?:]$/.test(p));
  return looksLikeLabels ? parts.join('\n') : text;
}

function normalizeListTextareas<T extends { fields: Record<string, unknown> }>(
  records: T[], entityKey: string
): T[] {
  const types = FIELD_TYPES[entityKey];
  if (!types) return records;
  const areas = Object.keys(types).filter(k => types[k] === 'string/textarea');
  if (areas.length === 0) return records;
  return records.map(r => {
    let touched = false;
    const fields = { ...r.fields };
    for (const key of areas) {
      const val = fields[key];
      if (typeof val !== 'string') continue;
      const next = listTextToLines(val);
      if (next !== val) { fields[key] = next; touched = true; }
    }
    return touched ? ({ ...r, fields } as T) : r;
  });
}

/** The one post-processing step every READ goes through: lookup objects
 *  attached, list-ish textareas line-broken. Read helpers call this, not
 *  the individual passes. */
function hydrateRecords<T extends { fields: Record<string, unknown> }>(
  records: T[], entityKey: string
): T[] {
  return normalizeListTextareas(enrichLookupFields(records, entityKey), entityKey);
}

/** Normalize fields for API writes: strip lookup objects to keys, fix date formats. */
export function cleanFieldsForApi(
  fields: Record<string, unknown>,
  entityKey: string
): Record<string, unknown> {
  const clean: Record<string, unknown> = { ...fields };
  // Strip virtual / unknown keys before they hit the API. Sub-agent invents
  // computed-only keys (e.g. `_netto`, `_bestellung_gesamtbetrag`) for the
  // 'Berechnungen' display, and a leaky submit-backfill would otherwise send
  // them to the Living-Apps backend which rejects with 'field does not exist'.
  const known = FIELD_TYPES[entityKey];
  if (known) {
    for (const k of Object.keys(clean)) {
      if (!(k in known)) delete clean[k];
    }
  }
  for (const [k, v] of Object.entries(clean)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && 'key' in v) clean[k] = (v as any).key;
    if (Array.isArray(v)) clean[k] = v.map((item: any) => item && typeof item === 'object' && 'key' in item ? item.key : item);
  }
  const types = FIELD_TYPES[entityKey];
  if (types) {
    for (const [k, ft] of Object.entries(types)) {
      if (!(k in clean)) continue;
      const val = clean[k];
      // applookup fields: undefined → null (clear single reference)
      if ((ft === 'applookup/select' || ft === 'applookup/choice') && val === undefined) { clean[k] = null; continue; }
      // multipleapplookup fields: undefined/null → [] (clear multi reference)
      if ((ft === 'multipleapplookup/select' || ft === 'multipleapplookup/choice') && (val === undefined || val === null)) { clean[k] = []; continue; }
      // lookup fields: undefined → null (clear single lookup)
      if ((ft.startsWith('lookup/')) && val === undefined) { clean[k] = null; continue; }
      // multiplelookup fields: undefined/null → [] (clear multi lookup)
      if ((ft.startsWith('multiplelookup/')) && (val === undefined || val === null)) { clean[k] = []; continue; }
      if (typeof val !== 'string' || !val) continue;
      if (ft === 'date/datetimeminute') clean[k] = val.slice(0, 16);
      else if (ft === 'date/date') clean[k] = val.slice(0, 10);
    }
  }
  return clean;
}

let _cachedUserProfile: Record<string, unknown> | null = null;

export async function getUserProfile(): Promise<Record<string, unknown>> {
  if (_cachedUserProfile) return _cachedUserProfile;
  const raw = await callApi('GET', '/user');
  const skip = new Set(['id', 'image', 'lang', 'gender', 'title', 'fax', 'menus', 'initials']);
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v != null && !skip.has(k)) data[k] = v;
  }
  _cachedUserProfile = data;
  return data;
}

export interface HeaderProfile {
  firstname: string;
  surname: string;
  email: string;
  image: string | null;
  company: string | null;
}

let _cachedHeaderProfile: HeaderProfile | null = null;

export async function getHeaderProfile(): Promise<HeaderProfile> {
  if (_cachedHeaderProfile) return _cachedHeaderProfile;
  const raw = await callApi('GET', '/user');
  _cachedHeaderProfile = {
    firstname: raw.firstname ?? '',
    surname: raw.surname ?? '',
    email: raw.email ?? '',
    image: raw.image ?? null,
    company: raw.company ?? null,
  };
  return _cachedHeaderProfile;
}

export interface AppGroupInfo {
  id: string;
  name: string;
  image: string | null;
  createdat: string;
  /** Resolved link: /objects/{id}/ if the dashboard exists, otherwise /gateway/apps/{firstAppId}?template=list_page */
  href: string;
}

let _cachedAppGroups: AppGroupInfo[] | null = null;

export async function getAppGroups(): Promise<AppGroupInfo[]> {
  if (_cachedAppGroups) return _cachedAppGroups;
  const raw = await callApi('GET', '/appgroups?with=apps');
  const groups: AppGroupInfo[] = Object.values(raw)
    .map((g: any) => {
      const firstAppId = Object.keys(g.apps ?? {})[0] ?? g.id;
      return {
        id: g.id,
        name: g.name,
        image: g.image ?? null,
        // API field is created_at (snake_case) — the old camelCase read
        // left every group '', silently disabling the newest-first sort.
        createdat: g.created_at ?? g.createdat ?? '',
        href: `/gateway/apps/${firstAppId}?template=list_page`,
        _firstAppId: firstAppId,
      };
    })
    .sort((a, b) => b.createdat.localeCompare(a.createdat));

  // Check which appgroups have a deployed dashboard via app params
  const paramChecks = await Promise.allSettled(
    groups.map(g => callApi('GET', `/apps/${(g as any)._firstAppId}/params/la_page_header_additional_url`, undefined, { silent: true }))
  );
  paramChecks.forEach((result, i) => {
    if (result.status !== 'fulfilled' || !result.value) return;
    const url = result.value.value;
    if (typeof url === 'string' && url.length > 0) {
      try { groups[i].href = new URL(url).pathname; } catch { groups[i].href = url; }
    }
  });

  // Clean up internal helper property
  groups.forEach(g => delete (g as any)._firstAppId);

  _cachedAppGroups = groups;
  return _cachedAppGroups;
}

export class LivingAppsService {
  // --- UMFRAGEN ---
  static async getUmfragen(): Promise<Umfragen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.UMFRAGEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Umfragen[];
    return hydrateRecords(records, 'umfragen');
  }
  static async queryUmfragen(q: RecordQuery = {}): Promise<Umfragen[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.UMFRAGEN}/records${recordQueryString(q)}`, undefined, { signal: q.signal, silent: q.silent });
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Umfragen[];
    return hydrateRecords(records, 'umfragen');
  }
  static async countUmfragen(filter?: string, signal?: AbortSignal): Promise<number> {
    const data = await callApi('GET', `/apps/${APP_IDS.UMFRAGEN}/aggregate_records${recordQueryString({ filter })}${filter ? '&' : '?'}value=count()`, undefined, { signal, silent: true });
    return parseAggregateCount(data);
  }
  static async getUmfragenEntry(id: string): Promise<Umfragen | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.UMFRAGEN}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Umfragen;
    return hydrateRecords([record], 'umfragen')[0];
  }
  static async createUmfragenEntry(fields: CreateUmfragen): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.UMFRAGEN}/records`, { fields: cleanFieldsForApi(fields as any, 'umfragen') });
    return { ...data, record_id: data.id };
  }
  static async updateUmfragenEntry(id: string, fields: Partial<CreateUmfragen>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.UMFRAGEN}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'umfragen') });
    return { ...data, record_id: data.id };
  }
  static async deleteUmfragenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.UMFRAGEN}/records/${id}`);
  }

  // --- TERMINVORSCHLAEGE ---
  static async getTerminvorschlaege(): Promise<Terminvorschlaege[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Terminvorschlaege[];
    return hydrateRecords(records, 'terminvorschlaege');
  }
  static async queryTerminvorschlaege(q: RecordQuery = {}): Promise<Terminvorschlaege[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/records${recordQueryString(q)}`, undefined, { signal: q.signal, silent: q.silent });
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Terminvorschlaege[];
    return hydrateRecords(records, 'terminvorschlaege');
  }
  static async countTerminvorschlaege(filter?: string, signal?: AbortSignal): Promise<number> {
    const data = await callApi('GET', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/aggregate_records${recordQueryString({ filter })}${filter ? '&' : '?'}value=count()`, undefined, { signal, silent: true });
    return parseAggregateCount(data);
  }
  static async getTerminvorschlaegeEntry(id: string): Promise<Terminvorschlaege | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Terminvorschlaege;
    return hydrateRecords([record], 'terminvorschlaege')[0];
  }
  static async createTerminvorschlaegeEntry(fields: CreateTerminvorschlaege): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/records`, { fields: cleanFieldsForApi(fields as any, 'terminvorschlaege') });
    return { ...data, record_id: data.id };
  }
  static async updateTerminvorschlaegeEntry(id: string, fields: Partial<CreateTerminvorschlaege>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'terminvorschlaege') });
    return { ...data, record_id: data.id };
  }
  static async deleteTerminvorschlaegeEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.TERMINVORSCHLAEGE}/records/${id}`);
  }

  // --- ANTWORTEN ---
  static async getAntworten(): Promise<Antworten[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.ANTWORTEN}/records`);
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Antworten[];
    return hydrateRecords(records, 'antworten');
  }
  static async queryAntworten(q: RecordQuery = {}): Promise<Antworten[]> {
    const data = await callApi('GET', `/apps/${APP_IDS.ANTWORTEN}/records${recordQueryString(q)}`, undefined, { signal: q.signal, silent: q.silent });
    const records = Object.entries(data).map(([id, rec]: [string, any]) => ({
      record_id: id, ...rec,
      createdat: rec.created_at ?? '', updatedat: rec.updated_at ?? null,
    })) as Antworten[];
    return hydrateRecords(records, 'antworten');
  }
  static async countAntworten(filter?: string, signal?: AbortSignal): Promise<number> {
    const data = await callApi('GET', `/apps/${APP_IDS.ANTWORTEN}/aggregate_records${recordQueryString({ filter })}${filter ? '&' : '?'}value=count()`, undefined, { signal, silent: true });
    return parseAggregateCount(data);
  }
  static async getAntwortenEntry(id: string): Promise<Antworten | undefined> {
    const data = await callApi('GET', `/apps/${APP_IDS.ANTWORTEN}/records/${id}`);
    const record = { record_id: data.id, ...data, createdat: data.created_at ?? '', updatedat: data.updated_at ?? null } as Antworten;
    return hydrateRecords([record], 'antworten')[0];
  }
  static async createAntwortenEntry(fields: CreateAntworten): Promise<MutationResult> {
    const data = await callApi('POST', `/apps/${APP_IDS.ANTWORTEN}/records`, { fields: cleanFieldsForApi(fields as any, 'antworten') });
    return { ...data, record_id: data.id };
  }
  static async updateAntwortenEntry(id: string, fields: Partial<CreateAntworten>): Promise<MutationResult> {
    const data = await callApi('PATCH', `/apps/${APP_IDS.ANTWORTEN}/records/${id}`, { fields: cleanFieldsForApi(fields as any, 'antworten') });
    return { ...data, record_id: data.id };
  }
  static async deleteAntwortenEntry(id: string) {
    return callApi('DELETE', `/apps/${APP_IDS.ANTWORTEN}/records/${id}`);
  }

}