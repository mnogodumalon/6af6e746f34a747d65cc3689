/**
 * lib/journey/submissions.ts — one row per SUBMISSION (generated).
 *
 * A send can create several records (one answer per date); a page that lists what
 * it creates shows one row per submission, never per record (EF-46, Doodle KB 7:
 * nine rows for three people) and never per typed name (EF-43: two people with
 * the same name became one row). The submission is known by the page's own
 * device/row key when the records carry one; without a key, records of the same
 * name created within `windowMs` of each other (default 10 s — one send) are one
 * submission, and the same name from a later send is a second row with a time
 * suffix so the two can be told apart.
 *
 *   const rows = submissionsOf(antworten, { key: 'zeilen_kennung', names: ['vorname', 'nachname'] });
 *   rows.map(s => <tr key={s.key}><td>{s.label}</td>{termine.map(t => <td>{choiceOf(s, t)}</td>)}</tr>)
 *   const choiceOf = (s, t) => s.records.find(r => fieldRef(r, 'termin') === t.id);
 *
 * The overview counts the same way (EF-46b): „2 Antworten“ on a poll card is
 * `submissionsOf(antworten, { key, names }).length` over the dashboard's records
 * (`record_id`/`createdat` are read too) — a vote count per date stays per record.
 */
/** A journey record (`id`, `createdAt`) or a dashboard record (`record_id`, `createdat`) — both group. */
export interface SubmissionRecord {
  fields: Record<string, unknown>;
  id?: string;
  record_id?: string;
  createdAt?: string | null;
  createdat?: string | null;
}

function textOf(r: SubmissionRecord, key: string): string {
  const v = r.fields[key];
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (v && typeof v === 'object' && 'label' in v) return String((v as { label: unknown }).label ?? '').trim();
  return '';
}

const idOf = (r: SubmissionRecord): string => r.id ?? r.record_id ?? '';
const createdOf = (r: SubmissionRecord): string | null => r.createdAt ?? r.createdat ?? null;

export interface Submission<R extends SubmissionRecord = SubmissionRecord> {
  /** stable: the device/row key, else `<name>@<first createdAt>` */
  key: string;
  /** the typed name (the `names` fields joined) */
  name: string;
  /** the name, with a time suffix when another submission carries the same name */
  label: string;
  records: R[];
  createdAt: string | null;
}

export interface SubmissionOptions<R extends SubmissionRecord = SubmissionRecord> {
  /** the field the page itself writes per send (`derived:device`, useVisitorKey) — the best key */
  key?: string;
  /** the typed name fields, in display order */
  names?: string[];
  /** how far apart two records of the same name may be and still be ONE send (ms, default 10 000) */
  windowMs?: number;
  /** override how a record is named */
  nameOf?: (r: R) => string;
}

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function timeSuffix(iso: string | null, withDay: boolean): string {
  const t = ms(iso);
  if (t === null) return '';
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return withDay ? `${d.getDate()}.${d.getMonth() + 1}. ${hm}` : hm;
}

function dayOf(iso: string | null): string {
  const t = ms(iso);
  return t === null ? '' : new Date(t).toDateString();
}

export function submissionsOf<R extends SubmissionRecord>(records: readonly R[], opts: SubmissionOptions<R> = {}): Submission<R>[] {
  const windowMs = opts.windowMs ?? 10_000;
  const nameOf = opts.nameOf ?? ((r: R) => (opts.names ?? []).map(k => textOf(r, k)).filter(Boolean).join(' ').trim());
  const ordered = [...records].sort((a, b) => (ms(createdOf(a)) ?? Infinity) - (ms(createdOf(b)) ?? Infinity));
  const out: Submission<R>[] = [];
  const byKey = new Map<string, Submission<R>>();
  for (const r of ordered) {
    const name = nameOf(r);
    const keyValue = opts.key ? textOf(r, opts.key) : '';
    if (keyValue) {
      const hit = byKey.get(keyValue);
      if (hit) { hit.records.push(r); continue; }
      const s: Submission<R> = { key: keyValue, name, label: name, records: [r], createdAt: createdOf(r) };
      byKey.set(keyValue, s);
      out.push(s);
      continue;
    }
    // no key: the same name within the window of the group's LAST record is the same send;
    // a record without a timestamp never joins another (folding needs evidence)
    const t = ms(createdOf(r));
    const open = t === null ? undefined : out.find(s => {
      if (s.name !== name || !s.records.length) return false;
      const last = ms(createdOf(s.records[s.records.length - 1]));
      return last !== null && t - last <= windowMs;
    });
    if (open) { open.records.push(r); continue; }
    out.push({ key: `${name}@${createdOf(r) ?? idOf(r)}`, name, label: name, records: [r], createdAt: createdOf(r) });
  }
  // the same name from two sends: both rows say when
  const count = new Map<string, number>();
  for (const s of out) count.set(s.name, (count.get(s.name) ?? 0) + 1);
  for (const s of out) {
    if ((count.get(s.name) ?? 0) > 1) {
      const days = new Set(out.filter(o => o.name === s.name).map(o => dayOf(o.createdAt)));
      const at = timeSuffix(s.createdAt, days.size > 1);
      s.label = at ? `${s.name} · ${at}` : s.name;
    }
  }
  return out;
}
