// Owner-facing client for the application map (same-origin /claude/orchestrate):
// what the built application DOES, sentence by sentence in groups by occasion
// (map v2, GET …/view), and the calls that change a line on the running
// application through its channel.

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
const BASE = '/claude/orchestrate';

export type LineSource = { kind: 'plan' | 'tool_metadata' | 'tool_listing' | 'planner' | 'agent_note'; path: string };
export type LineChannel = 'policy' | 'trigger' | 'tool' | 'page' | 'plan';

export interface FilterCondition {
  field: string;
  op: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'not_empty';
  value?: unknown;
}

export interface FilterValue {
  mode?: 'all' | 'any';
  conditions: FilterCondition[];
}

export interface FilterField {
  key: string;
  label: string;
  type: string;
  options?: { value: string; label: string }[];
}

export interface LineEditable {
  kind: 'option' | 'text' | 'rule' | 'filter' | 'schedule' | 'file';
  /** a template question: the line takes a file as well as (or instead of) an option */
  file?: boolean;
  value: unknown;
  /** what `{value}` in the sentence shows — „6:00“, „19 %“, „nur aktive Berater“ */
  value_label?: string | null;
  options?: { value: string; label: string }[] | null;
  channel: LineChannel;
  ready: boolean;
  /** filter lines: the entity's fields for the condition editor */
  fields?: FilterField[];
  entity?: string;
}

export type GroupKind = 'understanding' | 'setup' | 'gaps' | 'create' | 'update' | 'schedule' | 'manual' | 'dashboard' | 'pages' | 'roles' | 'limits' | 'platform';

/** A block of the page, in display order. Empty groups are not sent. */
export interface MapGroup {
  id: string;
  kind: GroupKind;
  title: string;
  /** create groups: the list, its plural noun (for the page's one-line subtitle) and the flow that creates on it */
  entity?: string;
  many?: string;
  intent?: string;
  intent_label?: string;
}

/** request: `text` is the wish sent through the change door instead of the line's text, `gap` its gap/question id */
export type LineAction = { id: 'confirm' | 'file' | 'publish' | string; label: string; text?: string; gap?: string; slug?: string };

export interface MapLine {
  id: string;
  /** the group this sentence stands in */
  group: string;
  /** the v1 section — kept for developers */
  section: string;
  about: { kind: string; id: string; label?: string };
  /** one sentence; `{value}` marks where editable.value_label (or the control) goes — at most once */
  text: string;
  source: LineSource;
  editable: LineEditable | null;
  /** automations: when it ran, when it runs next; ok null = never ran yet */
  status?: { text: string; ok: boolean | null } | null;
  /** „Gut zu wissen“ — shown when the line is open */
  note?: string | null;
  /** policy / trigger / plan act at once, tool / page take minutes */
  speed?: 'instant' | 'minutes';
  /** a question the owner has neither answered nor confirmed nor seen */
  tag?: 'assumed' | 'inferred' | null;
  /** setup lines: the short sentence for the dashboard's notice */
  notice?: string | null;
  /** the bold opening of the sentence without its stars — unused by the page, which renders `**…**` */
  lead?: string | null;
  /** setup cards: „Stimmt so“ (confirm) and „Logo hochladen“ (file) */
  actions?: LineAction[] | null;
  /** developer-only lines (steps, agent notes, raw values) */
  hidden?: boolean;
  /** questions: what the planner assumed */
  assumed?: string;
  topic?: string | null;
  /** questions: the owner has confirmed or changed it */
  answered?: boolean;
  weight?: 'important' | 'minor';
  /** questions: the owner saw this minor assumption where it first acted */
  seen?: boolean;
  /** the plan fragment this sentence is rendered from (compact JSON) — developers only */
  fragment?: string | null;
}

/** What an owner's change set in motion on a line, and how it ended. */
export interface LineJob {
  id: string;
  line_id: string;
  kind: 'tool' | 'page';
  text: string;
  about?: string | null;
  status: 'running' | 'done' | 'failed';
  /** the value the order carried — „Nochmal“ sends it again */
  value?: unknown;
  started_at: string;
  finished_at?: string | null;
  note?: string | null;
  error?: string | null;
}

/** One line of the plan's story: version, when, the sentence, its effect. */
export interface PlanChange {
  version: number;
  at: string;
  text: string;
  how: string;
  kind: 'build' | 'decision' | 'value' | 'delta' | 'undo';
  /** present when „Zurück auf vorher“ can re-apply it here — instant channels and „Passt“ only */
  undo?: { line_id: string; value?: unknown; unconfirm?: boolean } | null;
  /** present after agent work: „Zurückbauen · einige Minuten“ sends the old value as a new order */
  rebuild?: { line_id: string; value?: unknown; job?: string } | null;
  /** an agent change the server can restore exactly (a plain „Rückgängig“, no rebuild) */
  exact?: boolean;
  undone?: boolean;
}

export interface ProposalItem {
  tag: 'add' | 'change' | 'remove' | 'keep';
  id: string;
  text: string;
  before?: string | null;
  why: string;
}

/** What a sentence is about: „Was soll an „Projekt anlegen“ anders sein?“ */
export interface ChangeAbout { kind: 'intent' | 'tool'; id: string; label?: string }

/** „Was soll an … anders sein?“ — the planner's answer to the owner's sentence, before anything happens. */
export interface Proposal {
  id: string;
  wish: string;
  /** the flow or automation the owner wrote the sentence about */
  about?: ChangeAbout | null;
  status: 'planning' | 'ready' | 'failed';
  /** 'structure': proposed by the update flow for new lists/fields, not written by the owner */
  kind?: string;
  created_at: string;
  summary?: string;
  items?: ProposalItem[];
  effect?: string;
  error?: string;
  seconds?: number;
}

export interface AppMap {
  version: number;
  groups: MapGroup[];
  lines: MapLine[];
  counts: Record<string, number>;
  editable: number;
  /** stays in the JSON for developers — the page never shows it */
  summary?: string;
  /** one line under the title: the lists the application works on („Kunden, Projekte und Rechnungen.“) */
  subtitle?: string;
}

export interface AppMapState {
  map: AppMap | null;
  status: string | null;
  createdAt: string | null;
  planVersion: number;
  changes: PlanChange[];
  proposal: Proposal | null;
  jobs: Record<string, LineJob>;
  /** a full build without this plan happened after it — the page says so */
  stale: { at: string; reason: string } | null;
  /** the last planning gave no plan — the application was built without one (adopted = this page was read off it) */
  planningFailed: { at: string; adopted: boolean } | null;
  /** false for a viewer without admin rights: the page is read-only (an older server sends nothing = true) */
  canChange: boolean;
}

const EMPTY: AppMapState = { map: null, status: null, createdAt: null, planVersion: 0, changes: [], proposal: null, jobs: {}, stale: null, planningFailed: null, canChange: false };

/** The newest job on a line, running first. */
export function jobFor(jobs: Record<string, LineJob>, lineId: string): LineJob | undefined {
  const mine = Object.values(jobs).filter(j => j.line_id === lineId);
  mine.sort((a, b) => (a.status === 'running' ? -1 : 0) - (b.status === 'running' ? -1 : 0) || b.started_at.localeCompare(a.started_at));
  return mine[0];
}

const DISMISSED_KEY = 'klar-appmap-dismissed-jobs';
const FAILED_SHOWN_HOURS = 48;

function dismissedJobs(): string[] {
  try { return JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]; } catch { return []; }
}

/** „So lassen“ on a failed job — the page and the dashboard notice stop showing it (this browser). */
export function dismissJob(id: string): void {
  try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedJobs().filter(x => x !== id), id].slice(-50))); } catch { /* private mode */ }
}

/**
 * The jobs the owner still has to hear about: every running one, and a failed
 * one while it is recent, not dismissed and not overtaken by a newer job on
 * the same line.
 */
export function openJobs(jobs: Record<string, LineJob>): LineJob[] {
  const gone = new Set(dismissedJobs());
  const all = Object.values(jobs);
  const cutoff = Date.now() - FAILED_SHOWN_HOURS * 3600_000;
  return all.filter(j => {
    if (j.status === 'running') return true;
    if (j.status !== 'failed' || gone.has(j.id)) return false;
    if (new Date(j.finished_at ?? j.started_at).getTime() < cutoff) return false;
    return !all.some(o => o.id !== j.id && o.line_id === j.line_id && o.started_at > j.started_at);
  }).sort((a, b) => b.started_at.localeCompare(a.started_at));
}

function stateOf(data: Record<string, unknown>): AppMapState {
  return {
    map: (data.map as AppMap | undefined) ?? null,
    status: (data.status as string | undefined) ?? null,
    createdAt: (data.created_at as string | undefined) ?? null,
    planVersion: Number(data.plan_version ?? 1),
    changes: (data.changes as PlanChange[] | undefined) ?? [],
    proposal: (data.proposal as Proposal | null | undefined) ?? null,
    jobs: (data.jobs as Record<string, LineJob> | undefined) ?? {},
    stale: (data.stale as { at: string; reason: string } | null | undefined) ?? null,
    planningFailed: (data.planning_failed as { at: string; adopted: boolean } | null | undefined) ?? null,
    canChange: data.can_change !== false,
  };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const d = body?.detail;
    if (typeof d === 'string') return d;
    if (d && typeof d === 'object') return d.message ?? JSON.stringify(d);
  } catch { /* not JSON */ }
  return `${res.status} ${res.statusText}`;
}

let cached: Promise<AppMapState> | null = null;
/** The map once per page load — for blocks that only need to know a line's state (the review's notices). */
export function getAppMapCached(): Promise<AppMapState> {
  if (!cached) cached = getAppMap().catch(e => { cached = null; throw e; });
  return cached;
}

/** The owner saw a minor assumption where it first acted — not shown there again. */
export async function markSeen(lineId: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seen: true }),
  });
  if (!res.ok) throw new Error(await readError(res));
  cached = null;
}

/** The current map, built fresh with the live automations — empty when the application was never orchestrated. */
export async function getAppMap(): Promise<AppMapState> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/view`, { credentials: 'include' });
  if (res.status === 404) return { ...EMPTY };
  if (!res.ok) throw new Error(await readError(res));
  return stateOf(await res.json());
}

export interface AnswerResult {
  line: MapLine | null;
  action: Record<string, unknown> & { channel: LineChannel };
  map: AppMap;
  plan_version?: number;
  changes?: PlanChange[];
}

/** The owner's sentence, bound to a flow or an automation when it has one; the proposal arrives on the next reads.
 *  `gap`: the id of a line under „Fehlt noch“ whose „Einrichten“ wrote the sentence — accepting the proposal removes the gap. */
/** „Was stimmt nicht?“ — a sentence from the owner about something that is
 *  wrong. No page job, no proposal: it becomes a finding for us (Sentry, area
 *  owner_report) and a note in the application's state. */
export async function sendOwnerReport(text: string): Promise<void> {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/reports`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text.slice(0, 500), route: hash.slice(0, 200) }),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export async function proposeChange(text: string, about?: ChangeAbout | null, gap?: string | null): Promise<Proposal> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/changes`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, ...(about ? { about } : {}), ...(gap ? { gap } : {}) }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()).proposal as Proposal;
}

export interface AcceptResult {
  map: AppMap;
  plan_version: number;
  changes: PlanChange[];
  started: { what: string; id: string; how: string }[];
}

/** „Passt“ on a proposal: the plan grows, only the touched parts are built. */
export async function acceptProposal(id: string): Promise<AcceptResult> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/changes/${encodeURIComponent(id)}/accept`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** „Zurück auf vorher“ on a history entry. */
export async function undoChange(version: number): Promise<AcceptResult> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/changes/undo/${version}`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function rejectProposal(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/changes/${encodeURIComponent(id)}/reject`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
}

/** Change one line: the plan is updated, the change goes through the line's channel. */
export async function answerLine(lineId: string, value: unknown): Promise<AnswerResult> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** "Passt": the owner keeps the planner's assumption — recorded in the plan, nothing changes on the application. */
export async function confirmLine(lineId: string): Promise<AnswerResult> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/lines/${encodeURIComponent(lineId)}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** A template for a tool: the file travels to the actions agent with an order on the existing tool. */
export async function answerLineWithFile(lineId: string, file: File): Promise<AnswerResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/lines/${encodeURIComponent(lineId)}/file`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
