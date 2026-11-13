/**
 * The PUBLIC door of the journey port — anonymous, grant-scoped.
 *
 *   const port = createPublicPort(cfg, page);
 *
 * `list` reads through the page's list endpoints (a `scope` on the grant
 * decides what a visitor sees), `create` writes through ANY create endpoint
 * the page declares in `_public/surface.json` (a guest, then the booking that
 * links it — one plan, two steps), `ref` yields the grant-scoped record
 * reference. An entity without a create endpoint on this page throws a
 * JourneyPortError with the fix in the message. The page's `entity`/`app_id`
 * is only the FIRST of its create targets; the port never depends on that
 * order (live: a reordered surface broke the second write of a booking page).
 */
import {
  createPublicRecord,
  listPublicRecords,
  prepareChallenge,
  recordRef,
  type PublicPageConfig,
  type PublicPagesConfig,
} from '@/lib/publicClient';
import { JourneyPortError, toWirePayload, type JourneyPort, type JourneyRecord } from './port';
import { matchesSearch } from './search';
import { ENTITIES, type EntityKey } from './rules';
import { LOOKUP_OPTIONS } from '@/types/app';

/**
 * Lookup values in the SAME shape on both doors. The internal door hands
 * `{ key, label }` objects out (livingAppsService hydrates every read); a
 * grant answers with the bare key (`status: "verfuegbar"`). A page written
 * against the dashboard — `fields.status?.key === 'verfuegbar'` — therefore
 * matched nothing on a public page and showed an empty list without any
 * error (live 2026-09-16: a booking form offered no apartment although the
 * grant returned two). Hydrating here removes the difference: whatever the
 * page compares against, it sees the object it sees everywhere else. Values
 * that already are objects (a legacy grant, a hand-built record) pass through;
 * a key the schema does not know keeps itself as label, like the internal door.
 */
export function hydrateLookups(entity: EntityKey, fields: Record<string, unknown>): Record<string, unknown> {
  const opts = (LOOKUP_OPTIONS as Record<string, Record<string, Array<{ key: string; label: string }>> | undefined>)[entity];
  if (!opts) return fields;
  let out: Record<string, unknown> | null = null;
  const objectFor = (options: Array<{ key: string; label: string }>, v: string) => options.find(o => o.key === v) ?? { key: v, label: v };
  for (const [fieldKey, options] of Object.entries(opts)) {
    const val = fields[fieldKey];
    if (typeof val === 'string' && val !== '') {
      (out ??= { ...fields })[fieldKey] = objectFor(options, val);
    } else if (Array.isArray(val) && val.some(v => typeof v === 'string')) {
      (out ??= { ...fields })[fieldKey] = val.map(v => (typeof v === 'string' ? objectFor(options, v) : v));
    }
  }
  return out ?? fields;
}

function appIdOf(entity: EntityKey): string {
  const info = (ENTITIES as Record<string, { appId: string } | undefined>)[entity];
  if (!info) throw new JourneyPortError(`Unknown entity '${entity}' — use one of: ${Object.keys(ENTITIES).join(', ')}.`);
  return info.appId;
}

export function createPublicPort(cfg: PublicPagesConfig, page: PublicPageConfig): JourneyPort {
  // The proof-of-work for every create is solved while the visitor reads and
  // types, not when they press „Senden“ (Abnahme 7: the confirmation took
  // 1.8 s, most of it the challenge; PublicFormPage did this, the port did not).
  // A token goes stale after 4 min — submit then solves a fresh one as before.
  try {
    const creates = (page.endpoints ?? []).filter(e => e.op === 'create' && e.app_id);
    for (const ep of creates.length ? creates : [{ app_id: page.app_id }]) {
      if (ep.app_id) prepareChallenge(cfg, page, 'POST', `/apps/${ep.app_id}/records`);
    }
  } catch { /* a pre-solve never blocks the page */ }
  const port: JourneyPort = {
    door: 'public',
    async list(entity, opts) {
      const map = await listPublicRecords(cfg, page, {
        appId: appIdOf(entity), limit: opts?.limit ?? 500, offset: opts?.offset,
      });
      const rows = Object.entries(map).map(([id, r]): JourneyRecord => ({
        id: r.id ?? id,
        fields: hydrateLookups(entity, (r.fields ?? {}) as Record<string, unknown>),
        createdAt: r.created_at ?? null,
      }));
      // A grant's allowed query is field/limit/offset — no `filter`. So the
      // search happens here, over the page the grant handed out, and a
      // standing `filter` (vSQL) cannot be honoured at all: check-public
      // rejects it on a public page; useRecordSearch's `where` is the
      // client-side restriction that works on this door.
      const search = opts?.search;
      return search ? rows.filter(r => matchesSearch(r.fields, search.query, search.fields)) : rows;
    },
    // Grants allow field/limit/offset only — no aggregate, no filter. null
    // means "this door cannot count", which is not the same as zero.
    async count() {
      return null;
    },
    // No per-record path on a grant: the page the grant hands out is searched.
    async get(entity, id) {
      const rows = await port.list(entity);
      return rows.find(r => r.id === id) ?? null;
    },
    async create(entity, values) {
      const appId = appIdOf(entity);
      // The endpoint for THIS entity — the page's own fields/preset apply per
      // target (createPublicRecord reads them by app_id). A legacy page
      // without endpoints creates its one entity as before.
      const ep = (page.endpoints ?? []).find(e => e.op === 'create' && e.app_id === appId);
      const target: PublicPageConfig = ep ? { ...page, entity: ep.entity, app_id: ep.app_id, fields: ep.fields } : page;
      if (appId !== target.app_id) {
        const declared = (page.endpoints ?? []).filter(e => e.op === 'create').map(e => e.entity);
        throw new JourneyPortError(
          `This public page has no create endpoint for '${entity}' (declared: ${declared.length ? declared.join(', ') : page.entity}). ` +
            `Add { op: 'create', entity: '${entity}', fields: [...] } to the page in _public/surface.json.`,
        );
      }
      const r = await createPublicRecord(cfg, target, toWirePayload(entity, values, port));
      return { id: r.id, fields: hydrateLookups(entity, (r.fields ?? {}) as Record<string, unknown>), createdAt: r.created_at ?? null };
    },
    ref: (appId, recordId) => recordRef(cfg, page, appId, recordId),
  };
  return port;
}
