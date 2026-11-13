/**
 * useUmfrageAnlegenFlow — the plumbing of the flow « Umfrage mit Terminen anlegen », generated from the plan.
 *
 * Writes `umfragen`: asks `titel`, `beschreibung`, `ort`; sets `status` itself.
Writes `terminvorschlaege` SEVERAL times — one record per entry of `flow.lists.terminvorschlaege`; the form is the editor of one entry: asks `beginn`, `ende`; links `umfrage` ← the created `umfragen`.
 * The hook OWNS: the form(s) with exactly these fields and the plan's required
 * ingredients, one record search per picked field (columns and filter from
 * the plan), and the submit plan with its fixed and derived values. A page
 * that only calls `flow.submit.run()` cannot write a field the plan does not
 * know — there is no way to spell it.
 *
 * YOU decide what a person notices, through the options:
 *   steps     which wizard step asks which field (default: one step per pick,
 *             then one for the typed fields, then "Prüfen" = step 3)
 *   items     how a search hit is displayed per pick (title, subtitle, status …)
 *   initial   prefills for typed fields
 *   messages  the sentence for an empty required field, per field
 *
 *   Lists (several records of one entity per run): `flow.lists.<key>` holds the
 *   entries — `add()` validates the editor form and takes its values as one more
 *   record, `remove(id)`, `edit(id)` (back into the editor), `entries`, `count`.
 *   Render the editor's fields INSIDE <ListEntries list={flow.lists.<key>}> (the
 *   block adds „Hinzufügen“ and the entry list); „Weiter“ on that step takes a
 *   filled editor as one more entry and needs at least one entry.
 *
 *   const flow = useUmfrageAnlegenFlow({
 *     steps: { titel: 1, beschreibung: 1, ort: 1, beginn: 2, ende: 2 },
 *   });
 *   <IntentWizardShell forms={flow.forms} draftKey={flow.draftKey} …>
 *     <Bound form={flow.forms.umfragen} name="titel" />
 *     <Bound form={flow.forms.umfragen} name="beschreibung" />
 *     <Bound form={flow.forms.umfragen} name="ort" />
 *     <ListEntries list={flow.lists.terminvorschlaege}><Bound form={flow.forms.terminvorschlaege} name="beginn" /><Bound form={flow.forms.terminvorschlaege} name="ende" /></ListEntries>
 *     <StepNav onNext={() => flow.validateStep(n)} />
 *     {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit} />}
 *     {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit} />}
 *   </IntentWizardShell>
 */
import { useEffect, useRef, useState } from 'react';
import { readJourneyExtra, writeJourneyExtra } from '@/lib/journey/draft';
import { nounOne } from '@/config/plan';
import {
  useStepForm, useJourneySubmit, useRecordSearch,
  fieldText, fieldLookup, fieldLookups, fieldNumber, fieldDate, fieldRef,
  todayIso, nowIso, isEmptyValue, policyFixedValue, withPickPolicy, usePolicyVersion,  type StepForm, type JourneyRecord, type RefContext, type SelectItemLike, type FormValues, type PlanStep, type SummaryItem,} from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { labelOf, optionsOf, type EntityKey } from '@/lib/journey/rules';
import { entityLabel } from '@/lib/journey/rules';

export type UmfrageAnlegenFieldKey = 'beginn' | 'beschreibung' | 'ende' | 'ort' | 'titel';

export interface UmfrageAnlegenForms {
  umfragen: StepForm<'umfragen'>;
  terminvorschlaege: StepForm<'terminvorschlaege'>;
}

// Alias so the option generics stay readable.
type Key = UmfrageAnlegenFieldKey;

export interface UmfrageAnlegenFlowOptions {
  /** field → wizard step that asks it; drives „Ändern“ links and answer chips. */
  steps?: Partial<Record<Key, number>>;
  initial?: Partial<Record<Key, unknown>>;
  messages?: Partial<Record<Key, string>>;
}

/** One entry of a list the flow creates several records from (`flow.lists.<key>`). */
export interface ListEntry { id: string; values: FormValues; labels: Record<string, string>; rows: SummaryItem[] }

const DEFAULT_STEPS: Record<string, number> = {"beginn": 2, "beschreibung": 1, "ende": 2, "ort": 1, "titel": 1};
export const UMFRAGEANLEGEN_REVIEW_STEP = 3;

// local calendar day — the ISO-string of a Date is UTC and flips the date in the evening (J-7)
function isoDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Returns T, not Partial<T>: a Record's index signature is already "maybe
// absent", and Partial<Record<string, string>> does not assign to the
// Record<string, string> useStepForm wants (tsc, live 23.09.2026 — eight
// errors, one per hook, caught only in the sandbox build).
function only<T extends Record<string, unknown>>(obj: T | undefined, keys: string[]): T | undefined {
  if (!obj) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out as T;
}

function hasValues(form: StepForm): boolean {
  return form.keys.some(k => !isEmptyValue(form.values[k]));
}

export function useUmfrageAnlegenFlow(options: UmfrageAnlegenFlowOptions = {}) {
  const steps = { ...DEFAULT_STEPS, ...(options.steps ?? {}) } as Record<string, number>;
  const umfragen = useStepForm('umfragen', {
    fields: ["titel", "beschreibung", "ort"],
    steps: only(steps, ["titel", "beschreibung", "ort"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["titel", "beschreibung", "ort"]),
    messages: only(options.messages as Record<string, string> | undefined, ["titel", "beschreibung", "ort"]),
  });
  const terminvorschlaege = useStepForm('terminvorschlaege', {
    fields: ["beginn", "ende"],
    steps: only(steps, ["beginn", "ende"]) as Record<string, number>,
    initial: only(options.initial as FormValues | undefined, ["beginn", "ende"]),
    messages: only(options.messages as Record<string, string> | undefined, ["beginn", "ende"]),
  });
  const [terminvorschlaegeEntries, setTerminvorschlaegeEntries] = useState<ListEntry[]>(() => readJourneyExtra<ListEntry[]>('umfrage-anlegen', 'list:terminvorschlaege') ?? []);
  useEffect(() => { writeJourneyExtra('umfrage-anlegen', 'list:terminvorschlaege', terminvorschlaegeEntries.length ? terminvorschlaegeEntries : null); }, [terminvorschlaegeEntries]);
  const forms: UmfrageAnlegenForms = { umfragen, terminvorschlaege };
  // the editor of a list is not a record of its own: the review and the success
  // page read the entries (PlanStep.review), never the half-filled editor
  const formList: StepForm[] = [umfragen];
  const allForms: StepForm[] = [umfragen, terminvorschlaege];
  // The owner's rules after the build (intent-policies.json): a fixed value
  // for a field this flow sets itself, a narrower or wider pick — read at
  // render time, so a change works on the running application.
  usePolicyVersion();
  const searches = {
  };
  // Whether a pick offers „Neu anlegen“ is the plan's call: off for the record
  // this flow changes, for multi picks, for a catalogue entity and for an
  // entity with its own flow. The page spreads `.select` and writes no `create=`.
  // a fixed value the flow sets itself, as a review row with the link that changes it
  const setting = (entity: EntityKey, field: string, value: unknown): SummaryItem => ({
    key: `setting:${entity}.${field}`, label: labelOf(entity, field),
    value: optionsOf(entity, field).find(o => o.key === String(value))?.label ?? String(value ?? ''),
    href: `#/verwaltung/anwendung?line=intent:umfrage-anlegen:write:${entity}.${field}`,
  });
  const picks = {
  };

  // Lists — several records of one entity in one run („ein paar Termine“): the
  // editor form takes one entry at a time, `add()` validates it and puts it on
  // the list, the plan creates one record per entry (02.11.2026: the wish said
  // several, the flow made exactly one and nobody reported the difference)
  const lists = {
    terminvorschlaege: {
      entries: terminvorschlaegeEntries,
      count: terminvorschlaegeEntries.length,
      label: nounOne('terminvorschlaege', entityLabel('terminvorschlaege')),
      /** Validates the editor and takes its values as one more `terminvorschlaege`; false when a required field is empty. */
      add: (): boolean => {
        if (!terminvorschlaege.validate()) return false;
        const rows = terminvorschlaege.summary().filter(r => r.value !== '—');
        const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        // the snapshot is taken HERE, never inside the updater: React may run the updater in the
        // next render, after reset() below emptied the editor — and payload() reads the latest
        // values (EF-38), so every entry arrived without its dates (EF-41, Doodle KB 5)
        const values = terminvorschlaege.payload();
        const labels = { ...terminvorschlaege.labels };
        setTerminvorschlaegeEntries(list => [...list, { id, values, labels, rows }]);
        terminvorschlaege.reset();
        return true;
      },
      remove: (id: string) => setTerminvorschlaegeEntries(list => list.filter(e => e.id !== id)),
      /** Takes an entry back into the editor to change it. */
      edit: (id: string) => {
        const e = terminvorschlaegeEntries.find(x => x.id === id);
        if (!e) return;
        setTerminvorschlaegeEntries(list => list.filter(x => x.id !== id));
        terminvorschlaege.reset(e.values, e.labels);
      },
    },
  };
  const plan: PlanStep[] = [
    {
      key: 'umfragen', entity: 'umfragen', form: umfragen, label: nounOne('umfragen', entityLabel('umfragen')), primary: true,
      values: (): FormValues => ({
        status: policyFixedValue('umfragen', 'status') ?? "offen",
      }),

      // the review shows what this step sets itself — changeable on „Deine Anwendung“, not here
      settings: () => [setting('umfragen', 'status', policyFixedValue('umfragen', 'status') ?? "offen")],
    },
    ...terminvorschlaegeEntries.map((entry, i) => ({
      key: `terminvorschlaege:${entry.id}`, entity: 'terminvorschlaege', label: `${nounOne('terminvorschlaege', entityLabel('terminvorschlaege'))} ${i + 1}`,
      needs: ['umfragen'],
      link: { umfrage: 'umfragen' },
      values: (): FormValues => ({
        ...entry.values,
      }),
      // the review lists every entry („1. Termin: …“); „Ändern“ leads back to the list's step
      review: () => entry.rows.map(r => ({ ...r, key: `terminvorschlaege:${entry.id}:${r.key}`, label: `${i + 1}. ${r.label}`, step: steps[r.key] })),
    } as PlanStep)),
  ];

  const submit = useJourneySubmit(servicePort, plan, { draftKey: 'umfrage-anlegen' });

  // A typed field the plan prefills from the picked record (`user:from_pick`),
  // still the person's to change: filled once, only while empty (PV-12)
  const prefillFrom = (pickKey: string, rec: JourneyRecord) => {
    void pickKey; void rec;
  };

  // Opened with `?<field>=<value>` for a field this flow asks — a dashboard
  // link that pre-picks the event, a form that hands the question on (J-2):
  // a typed field takes the value while it is empty (a draft wins), a pick
  // loads the record, takes it into the pick and selects it WITH its name.
  // `initial` with a bare record id gets its name the same way.
  const [linkedParams] = useState(() => new URLSearchParams(window.location.hash.split('?')[1] ?? ''));
  useEffect(() => {
    let on = true;
    const coerce = (form: StepForm, key: string, raw: string): unknown => {
      const kind = form.rules[key]?.kind;
      if (kind === 'number') { const n = Number(raw); return Number.isFinite(n) ? n : raw; }
      if (kind === 'bool') return raw === 'true' || raw === '1' || raw === 'ja';
      return raw;
    };
    { const v = linkedParams.get('titel'); if (v !== null && isEmptyValue(umfragen.get('titel'))) (umfragen.set as (k: string, v: unknown) => void)('titel', coerce(umfragen, 'titel', v)); }
    { const v = linkedParams.get('beschreibung'); if (v !== null && isEmptyValue(umfragen.get('beschreibung'))) (umfragen.set as (k: string, v: unknown) => void)('beschreibung', coerce(umfragen, 'beschreibung', v)); }
    { const v = linkedParams.get('ort'); if (v !== null && isEmptyValue(umfragen.get('ort'))) (umfragen.set as (k: string, v: unknown) => void)('ort', coerce(umfragen, 'ort', v)); }
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per link
  }, []);

  /** Props for a single-record pick step: {...flow.picks.x.select} {...flow.pick('x')} */
  const pick = (field: UmfrageAnlegenFieldKey) => {
    const owner = allForms.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined; recordOf?(id: string): JourneyRecord | undefined }>)[field];
    return {
      selectedId: (typeof owner.get(field) === 'string' ? (owner.get(field) as string) : null) || null,
      // `field as never` collapsed the conditional SetArgs<E, never> to never and
      // no argument was assignable any more (tsc, live 23.09.2026); widen `set`
      // itself instead — the label stays a required third argument.
      onSelect: (id: string) => {
        (owner.set as (k: string, v: unknown, l?: string) => void)(field, id, search?.labelOf(id));
        const rec = search?.recordOf?.(id);
        if (rec) prefillFrom(field, rec);
      },
    };
  };
  /** Props for a multi-record pick step: {...flow.picks.x.select} {...flow.pickMany('x')} */
  const pickMany = (field: UmfrageAnlegenFieldKey) => {
    const owner = allForms.find(f => f.keys.includes(field)) ?? formList[0];
    const search = (picks as Record<string, { labelOf(id: string): string | undefined }>)[field];
    return owner.records(field, id => search?.labelOf(id));
  };
  /** Validate every field the wizard asks in step `n` — for StepNav.onNext. */
  const validateStep = (n: number): boolean =>
    formList.every(f => f.validate(f.keys.filter(k => steps[k] === n)))    // the list's step: a filled editor is taken as one more entry; at least one entry is needed
    && (steps['beginn'] !== n || (hasValues(terminvorschlaege) ? lists.terminvorschlaege.add() : terminvorschlaegeEntries.length > 0 || terminvorschlaege.validate()));
  const reset = () => { submit.reset(); formList.forEach(f => f.reset()); terminvorschlaege.reset(); setTerminvorschlaegeEntries([]); };

  return {
    slug: 'umfrage-anlegen' as const,
    draftKey: 'umfrage-anlegen' as const,    entity: 'umfragen' as const,
    form: umfragen,
    forms, formList, picks, submit, steps, lists,    reviewStep: UMFRAGEANLEGEN_REVIEW_STEP,
    pick, pickMany, validateStep, reset,    // the door the hook reads through — for what it does not own: availability
    // (useOccupancy(flow.port, …)), a count (useRecordCount(flow.port, …)). A page
    // importing servicePort next to the hook fails gate 3 (fewo 05.10.2026: the
    // gate taught useOccupancy(servicePort, …) and forbade servicePort at once)
    port: servicePort,
  };
}

export type UmfrageAnlegenFlow = ReturnType<typeof useUmfrageAnlegenFlow>;
