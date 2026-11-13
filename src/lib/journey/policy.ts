/**
 * The owner's field policy — the page's contract after the build.
 *
 * A public page is written by the agent; the owner narrows it afterwards in
 * the dashboard ("Felder anpassen") without a rebuild: a field is hidden, a
 * field becomes required, a field gets another label. The backend turns the
 * policy into the grant (a hidden field is not in the grant → the server
 * answers "unallowed") and ships the same rules in public-pages.json. The
 * layer registers them here when the page config loads, and every consumer
 * reads them at render time:
 *
 *   useStepForm — hidden keys leave `keys` (not validated, not summarised,
 *                 not in payload()), `required` overrides win;
 *   Field/Bound — a hidden or fixed field renders nothing;
 *   labelOf     — the owner's label wins over bundle and rule;
 *   IntentWizardShell — a step whose fields are all hidden is skipped.
 *
 * Outside a public page nothing is registered and every call is a no-op —
 * the same blocks run unchanged on internal routes.
 */
import { t } from '@/i18n';

export interface FieldPolicyRule {
  hidden?: boolean;
  required?: boolean;
  label?: string;
  /** The owner's fixed value — the server presets it, the visitor never sees the field. */
  fixed?: unknown;
}

export type FieldPolicy = Record<string, Record<string, FieldPolicyRule>>;

let registry: FieldPolicy = {};
let version = 0;
const listeners = new Set<() => void>();

/** Replace the active policy (the page config's `policy.fields`, or nothing). */
export function setFieldPolicy(fields: FieldPolicy | undefined | null): void {
  const next = fields && typeof fields === 'object' ? fields : {};
  if (JSON.stringify(next) === JSON.stringify(registry)) return;
  registry = next;
  version += 1;
  listeners.forEach(fn => fn());
}

export function fieldPolicy(entity: string, key: string): FieldPolicyRule {
  return registry[entity]?.[key] ?? {};
}

/** True when the visitor must not see the field: hidden by the owner, or
 *  given a fixed value (the field left the grant; the server fills it in). */
export function isHiddenByPolicy(entity: string, key: string): boolean {
  const rule = registry[entity]?.[key];
  if (!rule) return false;
  if (rule.hidden) return true;
  return rule.fixed !== undefined && rule.fixed !== null && rule.fixed !== '';
}

export function policyLabel(entity: string, key: string): string | undefined {
  const label = registry[entity]?.[key]?.label;
  return label && label.trim() ? label : undefined;
}

export function policyRequired(entity: string, key: string): boolean | undefined {
  return registry[entity]?.[key]?.required;
}

/** The owner's fixed value for a field the FLOW sets itself (a plan preset
 *  such as `status: "entwurf"`): the hook's `values()` asks here first, so
 *  the owner changes the value on the running application — no rebuild
 *  (24.09.2026). undefined = no rule, the plan's value stands. */
export function policyFixedValue(entity: string, key: string): unknown {
  const v = registry[entity]?.[key]?.fixed;
  return v === undefined || v === null || v === '' ? undefined : v;
}

// ── Pick filters ─────────────────────────────────────────────────────────────
// A flow's picks ("only active consultants") are generated from the plan's
// read filter: vSQL for the server, a `where` twin for the client. The owner
// may narrow or widen them after the build: intent-policies.json carries per
// pick the rendered vSQL plus the plan-grammar conditions, and the hook wraps
// its search options in withPickPolicy() — the gates still see the plan's
// literals, the runtime sees the owner's.

export interface PickCondition {
  field: string;
  op: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty';
  value?: unknown;
}

export interface PickWhere {
  mode?: 'all' | 'any';
  conditions: PickCondition[];
}

export interface PickPolicyRule {
  /** vSQL the backend rendered from `where` — what the server filters by. */
  filter?: string;
  /** The same rule in the plan grammar — what the client checks by. */
  where?: PickWhere;
}

export type PickPolicy = Record<string, PickPolicyRule>;

let pickRegistry: PickPolicy = {};

export function setPickPolicy(picks: PickPolicy | undefined | null): void {
  const next = picks && typeof picks === 'object' ? picks : {};
  if (JSON.stringify(next) === JSON.stringify(pickRegistry)) return;
  pickRegistry = next;
  version += 1;
  listeners.forEach(fn => fn());
}

export function pickPolicy(key: string): PickPolicyRule | undefined {
  return pickRegistry[key];
}

function normalizeValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'key' in (raw as object)) return String((raw as { key: unknown }).key);
  if (Array.isArray(raw)) return raw.map(normalizeValue);
  return raw;
}

function relativeIso(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('rel' in (value as object))) return null;
  const v = value as { rel?: string; days?: number };
  const d = new Date();
  d.setDate(d.getDate() + Number(v.days || 0));
  return v.rel === 'now' ? d.toISOString() : d.toISOString().slice(0, 10);
}

function compare(a: unknown, b: unknown): number {
  const na = typeof a === 'number' ? a : Number(a);
  const nb = typeof b === 'number' ? b : Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && typeof a !== 'boolean') return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function holds(record: { fields: Record<string, unknown> }, c: PickCondition): boolean {
  const raw = normalizeValue(record.fields[c.field]);
  const empty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  if (c.op === 'empty') return empty;
  if (c.op === 'not_empty') return !empty;
  const wanted = relativeIso(c.value) ?? c.value;
  const list = Array.isArray(wanted) ? wanted.map(String) : [String(wanted)];
  const have = Array.isArray(raw) ? raw.map(String) : [typeof raw === 'boolean' ? String(raw) : String(raw ?? '')];
  switch (c.op) {
    case 'eq': return have.some(h => list.includes(h));
    case 'ne': return !have.some(h => list.includes(h));
    case 'in': return have.some(h => list.includes(h));
    case 'not_in': return !have.some(h => list.includes(h));
    case 'gt': return !empty && compare(raw, wanted) > 0;
    case 'gte': return !empty && compare(raw, wanted) >= 0;
    case 'lt': return !empty && compare(raw, wanted) < 0;
    case 'lte': return !empty && compare(raw, wanted) <= 0;
    default: return true;
  }
}

/** The client twin of a pick policy: the plan grammar, evaluated on a record. */
/** The rule as a sentence for the person picking — "Status ist Aktiv und Ort ist Berlin".
 *  Labels come from the caller (the rules module knows the entity), so this stays free of it. */
export function whereSentence(where: PickWhere | null | undefined, label: (field: string) => string, option: (field: string, value: unknown) => string): string {
  const conds = where?.conditions ?? [];
  if (conds.length === 0) return '';
  // A relative date ({rel: 'today'|'now', days}) is a word, never an object — live
  // 05.10.2026 the hint read „Datum mindestens [object Object]“.
  const one = (v: unknown, field: string) => {
    if (typeof v === 'boolean') return t(v ? 'yes' : 'no');
    if (v && typeof v === 'object' && 'rel' in (v as object)) {
      const days = Number((v as { days?: number }).days || 0);
      if (!days) return t('am_today');
      const iso = relativeIso(v);
      return iso ? new Date(iso).toLocaleDateString() : t('am_today');
    }
    return option(field, v);
  };
  const parts = conds.map(c => {
    const l = label(c.field);
    const op = t(`am_op_${c.op}`);
    if (c.op === 'empty' || c.op === 'not_empty') return `${l} ${op}`;
    const v = Array.isArray(c.value) ? c.value.map(x => one(x, c.field)).join(', ') : one(c.value, c.field);
    return `${l} ${op} ${v}`;
  });
  return parts.join(t(where?.mode === 'any' ? 'am_join_any' : 'am_join_all'));
}

/** What the pick shows under its search field: the owner's rule when one is
 *  set (also "all", which then shows nothing), else the plan's — with the
 *  link to the line on „Nach dem Bau“ that changes it. */
export function pickHint(key: string, planned: PickWhere | null | undefined, describe: (w: PickWhere) => string, href: string): { text: string; href: string } | undefined {
  const rule = pickRegistry[key];
  const where = rule ? rule.where : planned;
  if (!where || (where.conditions ?? []).length === 0) return undefined;
  const text = describe(where);
  return text ? { text: t('sel_only_where', { text }), href } : undefined;
}

export function conditionsPredicate(where: PickWhere): (record: { fields: Record<string, unknown> }) => boolean {
  const conds = where.conditions || [];
  const any = where.mode === 'any';
  return (record) => (any ? conds.some(c => holds(record, c)) : conds.every(c => holds(record, c)));
}

/** The hook's search options with the owner's pick policy applied — the
 *  plan's `filter`/`where` literals stay in the source (the gates probe
 *  them), the runtime takes the owner's when there is one. */
export function withPickPolicy<O extends object>(key: string, options: O): O {
  const rule = pickRegistry[key];
  if (!rule) return options;
  // `O` is inferred from the hook's literal (searchFields, toItem, …); the two
  // keys this touches are typed loosely so the literal's shape stays intact.
  const next = { ...options } as O & { filter?: string; where?: (record: { fields: Record<string, unknown> }) => boolean };
  if (rule.filter !== undefined) next.filter = rule.filter || undefined;
  if (rule.where) next.where = conditionsPredicate(rule.where);
  else if (rule.filter === '') next.where = undefined;
  return next as O;
}

/** Current policy version (bumps on every change) — see usePolicyVersion. */
export function policyVersion(): number {
  return version;
}

/** Subscribe to policy changes; returns the unsubscribe. */
export function onPolicyChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
