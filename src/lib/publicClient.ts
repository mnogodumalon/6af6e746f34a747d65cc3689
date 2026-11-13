// Anonymous client for LivingApps "Public REST Grants".
//
// A dashboard owner can expose single record endpoints (e.g. "create a
// registration") to the anonymous public under capability URLs:
//
//   {public_api_base}/grants/{grant_id}/apps/{app_id}/records
//
// This client owns the three unpleasant parts so pages don't have to:
//   1. building grant URLs from the runtime config (./public-pages.json,
//      written next to the bundle by the Klar service — no rebuild needed),
//   2. the proof-of-work anti-abuse challenge (solved invisibly, see below),
//   3. mapping the server's RFC-7807 problem JSON to typed errors. The
//      errors carry no user-facing copy — pages translate them, so this
//      file stays language-free.

import { Sentry } from '@/lib/sentry';
import { LOOKUP_OPTIONS } from '@/types/app';
import { withConsent } from '@/lib/consent';
import { setFieldPolicy, type FieldPolicy } from '@/lib/journey/policy';

// ---------------------------------------------------------------------------
// Runtime config (public-pages.json)
// ---------------------------------------------------------------------------

export interface PublicFieldOption {
  key: string;
  label: string;
}

export interface PublicFieldConfig {
  key: string;
  label: string;
  /** LivingApps fulltype, e.g. "string/text", "lookup/select", "date/date". */
  fulltype: string;
  required: boolean;
  /** Present for lookup/multiplelookup fields. */
  options?: PublicFieldOption[];
  /** applookup fields: options are fetched at runtime from the target app. */
  multiple?: boolean;
  target_app_id?: string;
  target_entity?: string;
  display_field?: string;
}

/** One data operation of a custom (agent-built) page. */
export interface PublicEndpointConfig {
  op: 'list' | 'create';
  entity: string;
  app_id: string;
  fields: PublicFieldConfig[];
  scope?: string;
  scope_description?: string;
  max_records?: number;
  preset_fields?: Record<string, unknown>;
  default_fields?: Record<string, unknown>;
}

export interface PublicPageConfig {
  type?: 'form' | 'custom';
  entity: string;
  app_id: string;
  /** Every page owns its own grant (capability) — the WRITE door (POST), and the only door
   *  of a page without a create (then `challenge` is 'none'). */
  grant_id: string;
  /** Anti-abuse challenge of `grant_id`; 'none' skips the PoW. */
  challenge: 'pow' | 'none';
  /** EF-42: the READ door — a second grant with the page's GET paths and NO challenge. A page
   *  that lists AND creates used to solve a proof-of-work per list request (2 lists × every
   *  20 s = 6 challenges/min per phone; 30 phones in one hall share one IP and the platform's
   *  „10 per 1 minute“ limit on `_challenge`) — loading AND sending failed for 20 people.
   *  Absent on dashboards built before 0.0.551: GETs then go through `grant_id` as before. */
  read_grant_id?: string;
  title: string;
  description?: string;
  thank_you_title: string;
  thank_you_message: string;
  fields: PublicFieldConfig[];
  /** Custom pages: which app_id serves which op (list/create). */
  endpoints?: PublicEndpointConfig[];
  /** Form pages: values the grant sets server-side (the owner's fixed values). */
  preset_fields?: Record<string, unknown>;
  /** The owner's field policy ("Felder anpassen"): hidden / required / label
   *  per entity and field. Registered with the journey layer on load — the
   *  page code never has to know it. */
  policy?: { fields?: FieldPolicy } | null;
  /** Declared when the page is reached with `?<name>=<record_id>`. The page
   *  itself reads the value from the URL; this exists so the OWNER-facing
   *  management UI can offer one link per record instead of the bare page
   *  URL, which for such a page is a dead end. */
  link_param?: {
    name: string;
    entity: string;
    app_id: string;
    label_field: string;
    secondary_field?: string | null;
  } | null;
}

export interface PublicPagesConfig {
  version: number;
  public_api_base: string;
  pages: Record<string, PublicPageConfig>;
  /** Pages that exist but are not live (draft or paused). `pages` holds only
   *  published ones, so this is the sidebar's only way to know whether there
   *  is anything to publish. Absent in artifacts written before 0.0.281. */
  unpublished_count?: number;
  /** Owner preview of a draft: the data calls go through Klar with the
   *  owner's session instead of a grant, because a draft has no grant. Set by
   *  the service, never by a page. */
  preview?: boolean;
  /** Preview only: base path for the proxied record calls. */
  preview_base?: string;
  /** Preview only: the vSQL scope is NOT applied (the rest-service evaluates
   *  it, not Klar), so a scoped list shows MORE rows than the live page. The
   *  banner says so — reimplementing the filter here would be a second
   *  derivation that drifts. */
  preview_unscoped?: boolean;
}

/** Owner preview of a page that is still a draft.
 *
 *  There is no preview FLAG and no preview BUTTON: the owner opens the page's
 *  normal link (invitation links with their `?…=<record>` parameter included)
 *  and simply sees it. That is the whole trick — a parameterised page has no
 *  meaningful URL without its parameter, so any preview entry point that
 *  invents its own link leads to a broken page.
 *
 *  Mechanically it is a FALLBACK, not a mode: the artifact is asked first and
 *  only lists PUBLISHED pages, so a hit means "live" and nothing changes. A
 *  miss is either a draft (then Klar answers with the owner's session, and the
 *  page renders with the preview banner) or a stranger asking for a page that
 *  is not public (then Klar refuses and the page stays unavailable).
 *
 *  A draft has no grant at all — grants are created on publish, so a draft
 *  leaves zero footprint in the rest-service. The preview therefore runs its
 *  data through Klar instead: same page code, same field projection, no
 *  public exposure. */
let previewActive = false;

/** True once a preview config was loaded — PublicShell shows its banner from
 *  this. Deliberately module state, not a prop: every page would otherwise
 *  have to thread a flag through to the shell, and the ones that forgot would
 *  silently show a draft with no warning that it is one. */
export function isPreviewMode(): boolean {
  return previewActive;
}

function previewBase(slug: string): string {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const appgroupId = parts[parts.indexOf('objects') + 1] || '';
  return `/claude/public-pages/${encodeURIComponent(appgroupId)}/${encodeURIComponent(slug)}/preview`;
}

async function loadPreviewConfig(slug: string): Promise<PublicPagesConfig | null> {
  try {
    const res = await fetch(previewBase(slug), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const cfg = await res.json();
    if (!cfg || typeof cfg !== 'object' || !cfg.pages) return null;
    return cfg as PublicPagesConfig;
  } catch {
    return null;
  }
}

// One request per page load: the route component and the page it renders both
// ask for the config, and both got their own fetch (P-2, 03.11.2026).
let artifactPromise: Promise<PublicPagesConfig | null> | null = null;

async function loadArtifactConfig(): Promise<PublicPagesConfig | null> {
  if (!artifactPromise) {
    artifactPromise = fetchArtifactConfig().then(cfg => {
      if (cfg === null) artifactPromise = null;   // a failed load is retried next time, not remembered
      return cfg;
    });
  }
  return artifactPromise;
}

async function fetchArtifactConfig(): Promise<PublicPagesConfig | null> {
  try {
    const base = window.location.href.split('#')[0];
    const res = await fetch(new URL('public-pages.json', base).toString(), { cache: 'no-store' });
    if (!res.ok) return null;
    const cfg = await res.json();
    if (!cfg || typeof cfg !== 'object' || !cfg.pages || !cfg.public_api_base) return null;
    return cfg as PublicPagesConfig;
  } catch {
    return null;
  }
}

/**
 * Loads the page's runtime config: ./public-pages.json (published pages) with
 * the owner preview as a fallback for drafts — see the preview note above.
 * Returns null when the page is neither published nor previewable; callers
 * render the "unavailable" state for that.
 *
 * ALWAYS pass the slug. Without it a draft cannot be recognised and the page
 * is unavailable even to its owner.
 */
/** Forget the page load's cached public-pages.json — the next load reads it fresh
 *  (a page published while a beamer is open, S-24: the cache kept `{pages: {}}`). */
export function forgetPublicPagesConfig(): void {
  artifactPromise = null;
}

export async function loadPublicPagesConfig(slug?: string): Promise<PublicPagesConfig | null> {
  const artifact = await loadArtifactConfig();
  if (!slug) return artifact;
  if (artifact && artifact.pages[slug]) {
    setFieldPolicy(artifact.pages[slug].policy?.fields);
    return artifact;
  }
  const preview = await loadPreviewConfig(slug);
  if (preview) {
    previewActive = true;
    setFieldPolicy(preview.pages[slug]?.policy?.fields);
    return preview;
  }
  return artifact;
}

// ---------------------------------------------------------------------------
// Typed errors (text-free — pages own the localized copy)
// ---------------------------------------------------------------------------

/** Grant/endpoint missing, disabled, expired or method not exposed (404/405). */
export class PageUnavailableError extends Error {
  constructor() {
    super('public page unavailable');
    this.name = 'PageUnavailableError';
  }
}

/** Per-IP rate limit hit (429). `retryAfterMs` carries the server's Retry-After when it sent one. */
export class RateLimitedError extends Error {
  retryAfterMs: number | null;
  constructor(retryAfterMs: number | null = null) {
    super('rate limited');
    this.name = 'RateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After in ms (seconds or HTTP date), null when absent or unreadable. */
export function retryAfterMs(res: { headers: { get(name: string): string | null } }): number | null {
  const raw = res.headers.get('Retry-After');
  if (!raw) return null;
  const secs = Number(raw);
  if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  const at = Date.parse(raw);
  return Number.isFinite(at) && at > Date.now() ? at - Date.now() : null;
}

/** The door a request goes through (EF-42): GET through the read grant when the page has one
 *  (no challenge), everything else through `grant_id` with the page's challenge. */
export function doorFor(page: PublicPageConfig, method: string): { grantId: string; challenge: 'pow' | 'none' } {
  if (method === 'GET' && page.read_grant_id) return { grantId: page.read_grant_id, challenge: 'none' };
  return { grantId: page.grant_id, challenge: page.challenge };
}

/** Server-side field policy rejection (400) with the offending field keys.
 *  `detail` carries the server's problem+json diagnostic verbatim — pages own
 *  the localized copy, but the diagnostic must stay reachable for debugging. */
export class FieldValidationError extends Error {
  missingFields: string[];
  unallowedFields: string[];
  detail?: string;
  constructor(missingFields: string[], unallowedFields: string[], detail?: string) {
    super('field validation failed');
    this.name = 'FieldValidationError';
    this.missingFields = missingFields;
    this.unallowedFields = unallowedFields;
    this.detail = detail;
  }
}

/** Everything else (network, 5xx, unexpected status). */
export class SubmitFailedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'SubmitFailedError';
  }
}

// ---------------------------------------------------------------------------
// SHA-256 (synchronous, pure JS)
//
// The PoW loop hashes tens of thousands of short strings. Per-call
// crypto.subtle overhead would dominate at that call rate, and blob-URL
// workers hang under strict CSPs (learned the hard way with HEIC decoding),
// so a compact synchronous implementation with cooperative yielding is the
// robust choice. ~100-200ms for the default difficulty of 50000 on mobile.
// ---------------------------------------------------------------------------

const SHA_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = '0123456789abcdef';

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      const c2 = input.charCodeAt(++i);
      const u = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
      bytes.push(0xf0 | (u >> 18), 0x80 | ((u >> 12) & 0x3f), 0x80 | ((u >> 6) & 0x3f), 0x80 | (u & 0x3f));
    }
  }
  return bytes;
}

export function sha256Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const hi = Math.floor(bitLen / 0x100000000);
  bytes.push(
    (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff,
    (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff,
  );

  const H = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) {
      const j = off + 4 * i;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + SHA_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  let out = '';
  for (let i = 0; i < 8; i++) {
    for (let s = 28; s >= 0; s -= 4) out += HEX[(H[i] >>> s) & 0xf];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Proof-of-work challenge
//
// Protocol (stateless HMAC on the server side):
//   1. GET  {base}/grants/{id}/_challenge?method=POST&path=/apps/{app}/records
//      → { salt, challenge, maxnumber, expires_at, token }
//   2. brute-force n in 0..maxnumber with sha256(salt + n) === challenge
//   3. send header  X-Captcha-Token: <n>:<token>  on the real request
// ---------------------------------------------------------------------------

interface PowChallenge {
  salt: string;
  challenge: string;
  maxnumber: number;
  expires_at: string;
  token: string;
}

async function fetchChallenge(base: string, grantId: string, method: string, path: string): Promise<PowChallenge> {
  const url =
    `${base}/grants/${grantId}/_challenge` +
    `?method=${encodeURIComponent(method)}&path=${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404 || res.status === 405) throw new PageUnavailableError();
  if (res.status === 429) throw new RateLimitedError(retryAfterMs(res));
  if (!res.ok) throw new SubmitFailedError(`challenge request failed: HTTP ${res.status}`);
  return (await res.json()) as PowChallenge;
}

/** Yields to the event loop between batches so typing never stutters. */
async function solveChallenge(ch: PowChallenge): Promise<string> {
  const target = String(ch.challenge).toLowerCase();
  const max = Number(ch.maxnumber);
  const BATCH = 2000;
  for (let n = 0; n <= max; n++) {
    if (sha256Hex(ch.salt + String(n)) === target) return `${n}:${ch.token}`;
    if (n % BATCH === BATCH - 1) await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new SubmitFailedError('pow: no solution within maxnumber');
}

// Token cache: pages call prepareChallenge() on the first field focus so the
// token is usually ready before the user hits submit. ONE ENTRY PER GRANT+
// METHOD+PATH (P-4, 04.11.2026): a page that lists (GET) and creates (POST)
// used to drop the prepared POST token on every list request, so the submit
// solved again and the visitor waited.
//
// A solved token is REUSED (EF-42, measured live 11.11.2026 against the public
// API: the same `<n>:<token>` answers the same method+path again and again until
// its expires_at, TTL 300 s from issue). Until 0.0.550 a token was thrown away
// after one use — every list poll and every send solved a new challenge, and
// the hall's shared IP ran into the platform's `_challenge` limit. A token is
// treated as stale after TOKEN_FRESH_MS and re-solved BEFORE the request, so a
// send after „a few minutes of typing“ never meets an expired token at the door.
export const TOKEN_FRESH_MS = 240_000;
const prepared = new Map<string, { staleAt: number; tokenPromise: Promise<string> }>();

function solveInto(base: string, key: string, grantId: string, method: string, path: string): Promise<string> {
  const tokenPromise = fetchChallenge(base, grantId, method, path).then(solveChallenge);
  // A failed solve must not poison the next request — drop it and let that one re-solve.
  tokenPromise.catch(() => {
    if (prepared.get(key)?.tokenPromise === tokenPromise) prepared.delete(key);
  });
  prepared.set(key, { staleAt: Date.now() + TOKEN_FRESH_MS, tokenPromise });
  return tokenPromise;
}

export function prepareChallenge(
  cfg: PublicPagesConfig,
  page: PublicPageConfig,
  method: string,
  path: string,
): void {
  const door = doorFor(page, method);
  // No grant in a preview, so nothing to pre-solve against.
  if (cfg.preview || door.challenge === 'none') return;
  const key = `${door.grantId} ${method} ${path}`;
  const have = prepared.get(key);
  if (have && have.staleAt > Date.now()) return;
  void solveInto(cfg.public_api_base, key, door.grantId, method, path).catch(() => undefined);
}

async function takeToken(
  cfg: PublicPagesConfig,
  page: PublicPageConfig,
  method: string,
  path: string,
  opts: { fresh?: boolean } = {},
): Promise<string> {
  const door = doorFor(page, method);
  const key = `${door.grantId} ${method} ${path}`;
  const have = opts.fresh ? undefined : prepared.get(key);
  if (have && have.staleAt > Date.now()) {
    try {
      return await have.tokenPromise;
    } catch {
      // fall through to a fresh solve
    }
  }
  return solveInto(cfg.public_api_base, key, door.grantId, method, path);
}

/** Forgets a token the server refused (403) so the next request solves anew. */
function dropToken(page: PublicPageConfig, method: string, path: string): void {
  prepared.delete(`${doorFor(page, method).grantId} ${method} ${path}`);
}

// ---------------------------------------------------------------------------
// Record submission
// ---------------------------------------------------------------------------

export interface PublicRecordResult {
  id: string;
  fields: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

/** A textarea that HOLDS A LIST but was typed on one line.
 *
 *  A page rendering such a field as tiles writes the natural
 *  `value.split('\n')` — one item per line is the convention every form
 *  implies. Owners type differently: a live landing page collapsed five
 *  services into ONE tile because the record held
 *  'Tagesbetreuung, Übernachtung, …' without a single line break.
 *  Normalizing on READ makes that natural split correct whatever was typed,
 *  so no page has to re-derive the heuristic (mirror of hydrateRecords in
 *  livingAppsService — keep the two in step).
 *
 *  Conservative on purpose, prose must survive untouched: existing line
 *  breaks win; ; • · | separate from two parts on; commas only with 3+ parts
 *  that all read like labels — short, at most four words, no sentence
 *  punctuation. The word cap is what keeps prose out: "Katzen und Kleintiere
 *  aller Rassen" is short enough to pass a length test alone. A wrong guess
 *  degrades to one item — never to mangled prose. */
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

function normalizeListTextareas(
  body: Record<string, PublicRecordResult>,
  page: PublicPageConfig,
  appId: string,
): Record<string, PublicRecordResult> {
  // The page config carries each projected field's fulltype — no schema
  // import needed on the anonymous surface.
  const ep = page.endpoints?.find(e => e.op === 'list' && e.app_id === appId);
  const areas = (ep?.fields ?? page.fields ?? [])
    .filter(f => f.fulltype === 'string/textarea')
    .map(f => f.key);
  if (areas.length === 0) return body;
  const out: Record<string, PublicRecordResult> = {};
  for (const [id, rec] of Object.entries(body)) {
    let touched = false;
    const fields = { ...(rec?.fields ?? {}) };
    for (const key of areas) {
      const val = fields[key];
      if (typeof val !== 'string') continue;
      const next = listTextToLines(val);
      if (next !== val) { fields[key] = next; touched = true; }
    }
    out[id] = touched ? { ...rec, fields } : rec;
  }
  return out;
}

// ---------------------------------------------------------------------------
// applookup normalization (value-level self-heal)
// ---------------------------------------------------------------------------

/**
 * Rewrites applookup reference values to the portable bare suffix
 * `/apps/{target_app_id}/records/{record_id}` before submitting.
 *
 * The anonymous surface rejects references written for the wrong surface (a
 * hand-built `…/rest/apps/…` URL — the dokument-einreichen incident) with a
 * 400, and source-level lint rules provably miss glued-together forms.
 * Normalizing at the VALUE level heals every assembly form identically,
 * whatever code produced it; the bare suffix is accepted by every service
 * version. Only fields the page config declares as applookup (with a target
 * app) are touched, and only values that point into this deployment — a
 * foreign host is a real error the server must keep diagnosing, not
 * something to paper over. A healed wrong-surface/wrong-grant form warns and
 * leaves a Sentry breadcrumb: silent healing would hide that some code still
 * assembles references the wrong way.
 */
function normalizeApplookupRefs(
  cfg: PublicPagesConfig,
  page: PublicPageConfig,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const refFields = new Map<string, string>(); // field key -> target_app_id
  for (const f of page.fields) {
    if (f.fulltype.includes('applookup') && f.target_app_id) refFields.set(f.key, f.target_app_id);
  }
  for (const ep of page.endpoints ?? []) {
    if (ep.op !== 'create' || ep.app_id !== page.app_id) continue;
    for (const f of ep.fields) {
      if (f.fulltype.includes('applookup') && f.target_app_id) refFields.set(f.key, f.target_app_id);
    }
  }
  if (refFields.size === 0) return fields;

  const toSuffix = (key: string, targetAppId: string, value: unknown): unknown => {
    if (typeof value !== 'string' || value === '') return value;
    const marker = `/apps/${targetAppId}/records/`;
    const idx = value.lastIndexOf(marker);
    if (idx === -1) return value; // not a URL for the target app — server diagnoses
    const recordId = value.slice(idx + marker.length);
    if (!/^[a-f0-9]{24}$/.test(recordId)) return value;
    const prefix = value.slice(0, idx);
    if (prefix !== '' && !prefix.startsWith('/')) {
      try {
        if (new URL(prefix).origin !== new URL(cfg.public_api_base).origin) return value;
      } catch {
        return value;
      }
    }
    const grantInPrefix = /\/grants\/([a-f0-9]{24})$/.exec(prefix);
    const wrongForm =
      prefix.endsWith('/rest') || prefix.includes('/rest/') ||
      (grantInPrefix !== null && grantInPrefix[1] !== page.grant_id);
    if (wrongForm) {
      const received = `${prefix}${marker}<record-id>`;
      try {
        console.warn(`publicClient: normalized applookup value for '${key}' (received: ${received})`);
        Sentry.addBreadcrumb({
          category: 'public-pages',
          message: `normalized applookup '${key}' from: ${received}`,
          level: 'warning',
        });
      } catch {
        // Sentry unavailable
      }
    }
    return `${marker}${recordId}`;
  };

  const out: Record<string, unknown> = { ...fields };
  for (const [key, targetAppId] of refFields) {
    const value = out[key];
    if (value === undefined || value === null) continue;
    out[key] = Array.isArray(value)
      ? value.map((v) => toSuffix(key, targetAppId, v))
      : toSuffix(key, targetAppId, value);
  }
  return out;
}


/**
 * Preset fields are server-owned: the grant writes them onto every record and
 * rejects a request that carries them (`unallowed_fields` + `preset_fields`
 * in the 400 — live-seen when a page sent `status: 'anfrage'` next to its own
 * `preset_fields: { status: 'anfrage' }`). Whatever a page puts there is
 * dropped here, so the declaration alone decides.
 */
function dropPresetFields(page: PublicPageConfig, fields: Record<string, unknown>): Record<string, unknown> {
  const ep = page.endpoints?.find(e => e.op === 'create' && e.app_id === page.app_id);
  const preset = ep?.preset_fields ?? page.preset_fields;
  if (!preset) return fields;
  const out = { ...fields };
  for (const key of Object.keys(preset)) delete out[key];
  return out;
}

async function throwSubmitError(res: Response): Promise<never> {
  if (res.status === 404 || res.status === 405) throw new PageUnavailableError();
  if (res.status === 429) throw new RateLimitedError(retryAfterMs(res));
  let detail: Record<string, unknown> | null = null;
  try {
    detail = await res.json();
  } catch {
    // not problem JSON
  }
  if (res.status === 400 && detail) {
    const missing = Array.isArray(detail.missing_fields) ? (detail.missing_fields as string[]) : [];
    const unallowed = ([] as string[]).concat(
      Array.isArray(detail.unallowed_fields) ? (detail.unallowed_fields as string[]) : [],
      Array.isArray(detail.preset_fields) ? (detail.preset_fields as string[]) : [],
    );
    // problem+json `detail` is the server's diagnostic (e.g. which record-URL
    // forms an applookup accepts). Dropping it made the dokument-einreichen
    // 400 undiagnosable in the UI — carry it on the error, and report a 400
    // that maps to NO field (illegal_field_value etc.) to Sentry.
    const detailText = typeof detail.detail === 'string' ? detail.detail : `HTTP ${res.status}`;
    if (missing.length > 0 || unallowed.length > 0) {
      throw new FieldValidationError(missing, unallowed, detailText);
    }
    try {
      Sentry.captureException(new Error(`public submit rejected: ${detailText}`), {
        tags: { feature: 'public-pages' },
        extra: { detail },
      });
    } catch {
      // Sentry unavailable
    }
    throw new SubmitFailedError(detailText);
  }
  try {
    Sentry.captureException(new Error(`public submit failed: HTTP ${res.status}`), {
      tags: { feature: 'public-pages' },
      extra: { detail },
    });
  } catch {
    // Sentry unavailable
  }
  throw new SubmitFailedError(`HTTP ${res.status}`);
}

/**
 * Creates a record through the public grant. Solves (or reuses a pre-solved)
 * PoW token; a 403 gets exactly one transparent retry with a fresh token
 * (covers expired challenges without bothering the user).
 */
export async function createPublicRecord(
  cfg: PublicPagesConfig,
  page: PublicPageConfig,
  fields: Record<string, unknown>,
): Promise<PublicRecordResult> {
  fields = dropPresetFields(page, normalizeApplookupRefs(cfg, page, fields));
  // EF-32: without the consent tick the e-mail is not sent — whatever the page's code does
  fields = withConsent(page.entity, fields);
  const path = `/apps/${page.app_id}/records`;
  if (cfg.preview) {
    // A preview submit creates a REAL record — deliberately: a form you
    // cannot send is exactly the half that needs testing. The banner says so.
    const res = await fetch(`${cfg.preview_base}/records`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ app_id: page.app_id, fields }),
    });
    if (!res.ok) await throwSubmitError(res);
    return (await res.json()) as PublicRecordResult;
  }
  // EF-20: a 429 (on the challenge or the POST) is waited out — 3 s, 8 s, 15 s — before the
  // visitor sees an error; the page keeps „Wird gesendet …“ meanwhile
  let limited = 0;
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (page.challenge !== 'none') {
      try {
        // a token the server just refused (403) is not offered twice
        headers['X-Captcha-Token'] = await takeToken(cfg, page, 'POST', path, { fresh: attempt > 0 });
      } catch (err) {
        if (err instanceof RateLimitedError && limited < 3) {
          await new Promise(r => setTimeout(r, [3000, 8000, 15_000][limited++]));
          continue;
        }
        throw err;
      }
    }
    let res: Response;
    try {
      res = await fetch(`${cfg.public_api_base}/grants/${page.grant_id}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ fields }),
      });
    } catch (err) {
      throw new SubmitFailedError(err instanceof Error ? err.message : 'network error');
    }
    if (res.ok) return (await res.json()) as PublicRecordResult;
    if (res.status === 403 && attempt === 0 && page.challenge !== 'none') { dropToken(page, 'POST', path); continue; }
    if (res.status === 429 && limited < 3) {
      const after = Number(res.headers.get('Retry-After'));
      await new Promise(r => setTimeout(r, Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 20_000) : [3000, 8000, 15_000][limited]));
      limited++;
      continue;
    }
    await throwSubmitError(res);
  }
}

/**
 * Reads records through a public list grant (GET with scope applied
 * server-side). Returns the API's `{record_id: record}` map. Used by
 * agent-built pages (e.g. free slots on a booking page); read pages
 * typically run with challenge 'none', so no PoW cost per fetch.
 */
/** Lookup values as `{ key, label }` — the grant delivers bare keys, the
 *  internal door objects. publicPort hydrated its own reads since 0.0.411, but a
 *  page calling listPublicRecords directly still saw raw keys (live: department
 *  cards "fussball / turnen / tennis"). Hydrating here makes every read path
 *  agree; a value that is already an object stays as it is, so the port's own
 *  pass is a no-op on top. */
function hydrateListLookups(page: PublicPageConfig, appId: string, body: Record<string, PublicRecordResult>): Record<string, PublicRecordResult> {
  const entity = page.endpoints?.find(e => e.app_id === appId)?.entity;
  const opts = entity ? (LOOKUP_OPTIONS as Record<string, Record<string, Array<{ key: string; label: string }>> | undefined>)[entity] : undefined;
  if (!opts) return body;
  const objectFor = (options: Array<{ key: string; label: string }>, v: string) => options.find(o => o.key === v) ?? { key: v, label: v };
  for (const rec of Object.values(body)) {
    const fields = rec?.fields as Record<string, unknown> | undefined;
    if (!fields) continue;
    for (const [fieldKey, options] of Object.entries(opts)) {
      const val = fields[fieldKey];
      if (typeof val === 'string' && val !== '') fields[fieldKey] = objectFor(options, val);
      else if (Array.isArray(val) && val.some(v => typeof v === 'string')) fields[fieldKey] = val.map(v => (typeof v === 'string' ? objectFor(options, v) : v));
    }
  }
  return body;
}

export async function listPublicRecords(
  cfg: PublicPagesConfig,
  page: PublicPageConfig,
  opts: { appId?: string; limit?: number; offset?: number } = {},
): Promise<Record<string, PublicRecordResult>> {
  const appId = opts.appId ?? page.app_id;
  const path = `/apps/${appId}/records`;
  const params = new URLSearchParams();
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const query = params.size > 0 ? `?${params.toString()}` : '';
  if (cfg.preview) {
    // Owner preview: no grant exists yet, so Klar reads with the session and
    // applies the same field projection.
    const res = await fetch(`${cfg.preview_base}/records?app_id=${encodeURIComponent(appId)}`, {
      credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-store',
    });
    if (!res.ok) throw new PageUnavailableError();
    const body = (await res.json()) as Record<string, PublicRecordResult>;
    return hydrateListLookups(page, appId, normalizeListTextareas(body, page, appId));
  }
  // EF-42: reads go through the read door (no challenge) when the page has one
  const door = doorFor(page, 'GET');
  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (door.challenge !== 'none') {
      headers['X-Captcha-Token'] = await takeToken(cfg, page, 'GET', path, { fresh: attempt > 0 });
    }
    let res: Response;
    try {
      res = await fetch(`${cfg.public_api_base}/grants/${door.grantId}${path}${query}`, { headers });
    } catch (err) {
      throw new SubmitFailedError(err instanceof Error ? err.message : 'network error');
    }
    if (res.ok) {
      const body = (await res.json()) as Record<string, PublicRecordResult>;
      return hydrateListLookups(page, appId, normalizeListTextareas(body, page, appId));
    }
    if (res.status === 403 && attempt === 0 && door.challenge !== 'none') { dropToken(page, 'GET', path); continue; }
    await throwSubmitError(res);
  }
}

/**
 * Reference URL for a record of another entity — the value an applookup field
 * expects when you CREATE a record through a grant.
 *
 * The anonymous surface accepts ONLY grant-scoped URLs. A hand-built
 * `…/rest/apps/{app}/records/{id}` is rejected with 400 "Unsupported field
 * value" (live-proven: a course registration wrote the participant reference
 * that way and every submit failed at the second create). Never assemble such
 * a URL yourself — use this helper, or pass through a reference URL exactly as
 * a list response returned it (those are already grant-scoped).
 *
 *   const teilnehmer = await createPublicRecord(cfg, tnPage, tnFields);
 *   await createPublicRecord(cfg, anmPage, {
 *     teilnehmer: recordRef(cfg, page, tnEp.app_id, teilnehmer.id),
 *     kursangebot: recordRef(cfg, page, kaEp.app_id, selectedId),
 *   });
 */
export function recordRef(
  cfg: PublicPagesConfig,
  page: PublicPageConfig,
  appId: string,
  recordId: string,
): string {
  return `${cfg.public_api_base}/grants/${page.grant_id}/apps/${appId}/records/${recordId}`;
}
