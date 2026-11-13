/**
 * useJourneySubmit — the plan runner that writes a journey's records.
 *
 * Creates are DATA, not a try/catch pyramid:
 *
 *   const submit = useJourneySubmit(port, [
 *     { key: 'auftrag',   entity: 'auftraege',          form: auftrag, primary: true },
 *     { key: 'protokoll', entity: 'wartungsprotokolle', form: protokoll,
 *       needs: ['auftrag'], link: { auftrag: 'auftrag' } },   // field ← id of the done step
 *   ], { draftKey: 'auftrag-anlegen' });
 *
 * Steps that already succeeded stay done across retries — a retry after the
 * second create failed runs ONLY the second create (a live flow once created
 * two identical protocols). Double clicks are ignored while a run is busy.
 * `result` is set only after EVERY step succeeded; it is the only thing a
 * SuccessStep accepts, so the success screen can never render from a refetched
 * list or a half-written journey. The draft is cleared at that moment.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { clearJourneyDraft, journeyDraftClaimed, readJourneyExtra, writeJourneyExtra } from './draft';
import { isEmptyValue } from './rules';
import { JourneyPortError, canUpdate, type JourneyPort, type JourneyRecord } from './port';
import type { EntityKey } from './rules';
import type { FormValues, StepForm, SummaryItem } from './useStepForm';

export interface PlanContext {
  port: JourneyPort;
  /** Records of the steps that already succeeded, by step key. */
  done: Record<string, JourneyRecord>;
}

export interface PlanStep {
  key: string;
  /** Shown in the per-step status list (default: the entity label / the key). */
  label?: string;
  entity?: EntityKey;
  /** Its payload() is the base of the create. */
  form?: StepForm;
  /** Extra values merged over the form payload (static or computed from done steps). */
  values?: FormValues | ((ctx: PlanContext) => FormValues);
  /** field key → step key: the field receives the id of that done step's record. */
  link?: Record<string, string>;
  /** Steps that must be done first (the plan runs in order anyway). */
  needs?: string[];
  /** The id of the record this step CHANGES instead of creating one — a status
   *  flip, a return, a check-in. Payload like a create (form + values + link),
   *  written through the internal door's `update`; the public door throws.
   *  Static, or from the done steps (`ctx => ctx.done.pick.id`). */
  updates?: string | ((ctx: PlanContext) => string | undefined);
  /** The record `updates` changes, as a review row ("Projekt · Alpha (Nr. 101)"):
   *  SummaryStep shows it before the answers and the success page repeats it.
   *  Without it the review listed the new status and the note but never WHICH
   *  project was being changed (inclou, 24.09.2026). The flow hook fills it
   *  from its target pick; a hand-written plan may leave it out. */
  target?: () => SummaryItem | undefined;
  /** The values this step sets itself (fixed by the plan or the owner's
   *  policy) as review rows with the link that changes them — shown under
   *  "Setzt der Ablauf", so nobody wonders where the status came from. */
  settings?: () => SummaryItem[];
  /** The answers of a step that has no form of its own — one entry of a list
   *  the flow creates several records from („1. Termin: 5.11., 14:00“). The
   *  review shows them among the answers, the success page among the facts;
   *  `step` on a row is where „Ändern“ leads. */
  review?: () => SummaryItem[];
  /** The planner's minor assumptions that first ACT in this flow (the invoice
   *  number on the first invoice). The review shows each once — „Passt“ marks it
   *  seen on the plan, „ändern“ leads to its line on „Deine Anwendung“. */
  notices?: () => { id: string; question: string; assumed: string }[];
  /** The record this journey is about — reference and facts come from it (default: first step). */
  primary?: boolean;
  /** What the step does to its record — drives the words in the plan list and the
   *  success heading ("angelegt" / "aktualisiert"). Default: 'update' for a `run`
   *  step without a form, 'create' otherwise. */
  verb?: 'create' | 'update';
  /** Escape hatch for anything that is not a plain create. */
  /** Return the record you touched (a MutationResult from update…Entry works) so the
   *  success screen gets its reference; returning nothing is fine for pure updates. */
  run?: (ctx: PlanContext) => Promise<JourneyRecord | { id?: string; record_id?: string; fields?: Record<string, unknown> } | void>;
}

export type PlanStepStatus = 'idle' | 'running' | 'done' | 'failed';

export interface JourneyResult {
  primary: JourneyRecord;
  entity?: EntityKey;
  records: Record<string, JourneyRecord>;
  /** False when the primary step only updated an existing record — the success
   *  screen then says "aktualisiert", not "angelegt". */
  created: boolean;
  /** The review rows as confirmed (SummaryStep → remember) — the success
   *  screen's facts when no form carries them (update-only journeys). */
  summary?: SummaryItem[];
}

/** The verb of a step: explicit, else derived from its shape. */
export function stepVerb(step: PlanStep): 'create' | 'update' {
  return step.verb ?? (step.updates || (step.run && !step.form) ? 'update' : 'create');
}

export interface JourneySubmit {
  /** Runs the plan (skipping done steps). Resolves to the result or null on failure / when busy. */
  run(): Promise<JourneyResult | null>;
  retry(): Promise<JourneyResult | null>;
  /** Forgets everything — for "create another one". */
  reset(): void;
  /** The review's rows, kept for the result (SummaryStep calls this on confirm). */
  remember(rows: SummaryItem[]): void;
  readonly submitting: boolean;
  readonly done: boolean;
  readonly error: Error | null;
  /** The last attempt failed for want of a network (P-14): the entries and the
   *  done steps are kept, the runner sends again by itself once the browser
   *  is back online. */
  readonly offline: boolean;
  /** EF-42: the door answered 429 (a hall full of phones) — the input stays, the send repeats
   *  by itself after `limitedUntil` (Retry-After, else 5/10/20/40 s). */
  readonly limited: boolean;
  readonly limitedUntil: number | null;
  readonly result: JourneyResult | null;
  readonly status: Record<string, PlanStepStatus>;
  readonly failedStep: string | null;
  readonly doneCount: number;
  readonly plan: PlanStep[];
}

export interface JourneySubmitOptions {
  /** Cleared once the whole plan succeeded. */
  draftKey?: string;
  /** Runs before every send AND every automatic resend (EF-22): return a sentence to refuse
   *  („Inzwischen ist eine andere Frage dran.“ — nothing is sent, the text stays), null to go on.
   *  A network error in here is the OFFLINE way like one in the plan: saved, sent when back online.
   *  Put `freshRef(…)` here, never before `run()` in the page. */
  check?: (ctx: PlanContext) => Promise<string | null | undefined> | string | null | undefined;
  onSuccess?: (result: JourneyResult) => void;
}

async function createFromStep(step: PlanStep, ctx: PlanContext): Promise<JourneyRecord> {
  if (!step.entity) {
    throw new JourneyPortError(`Plan step '${step.key}' has neither 'entity' nor 'run'.`);
  }
  const base = step.form ? step.form.payload() : {};
  const extra = typeof step.values === 'function' ? step.values(ctx) : (step.values ?? {});
  const linked: FormValues = {};
  for (const [field, stepKey] of Object.entries(step.link ?? {})) {
    const rec = ctx.done[stepKey];
    if (!rec) throw new JourneyPortError(`Plan step '${step.key}' links '${field}' to '${stepKey}', which has not succeeded.`);
    linked[field] = rec.id;
  }
  const payload = { ...base, ...extra, ...linked };
  if (step.updates !== undefined) {
    const id = typeof step.updates === 'function' ? step.updates(ctx) : step.updates;
    if (!id) throw new JourneyPortError(`Plan step '${step.key}' updates a record but has no id yet.`);
    if (!canUpdate(ctx.port)) throw new JourneyPortError(`Plan step '${step.key}' updates '${step.entity}' — this door cannot change records (an update step runs under #/intents/… only).`);
    return ctx.port.update(step.entity, id, payload);
  }
  return ctx.port.create(step.entity, payload);
}

function normalizeRecord(raw: unknown): JourneyRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { id?: unknown; record_id?: unknown; fields?: unknown; createdAt?: unknown };
  const id = r.id ?? r.record_id;
  if (id === undefined || id === null || id === '') return undefined;
  return {
    id: String(id),
    fields: (r.fields && typeof r.fields === 'object' ? r.fields : {}) as Record<string, unknown>,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
  };
}

export function useJourneySubmit(
  port: JourneyPort,
  plan: PlanStep[],
  options: JourneySubmitOptions = {},
): JourneySubmit {
  const doneRef = useRef<Record<string, JourneyRecord>>({});
  const completedRef = useRef<Set<string>>(new Set());
  const busyRef = useRef(false);
  const rowsRef = useRef<SummaryItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<JourneyResult | null>(null);
  const [failedStep, setFailedStep] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [limitedUntil, setLimitedUntil] = useState<number | null>(null);
  const limitedN = useRef(0);
  const [status, setStatus] = useState<Record<string, PlanStepStatus>>({});

  const planRef = useRef(plan);
  planRef.current = plan;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // J-5 (04.11.2026): the steps that already succeeded live in the draft's
  // side data, not only in memory — a reload after „Gast angelegt, Buchung
  // fehlgeschlagen“ no longer creates the guest a second time. Cleared with
  // the draft on success and on reset.
  const SUBMIT_KEY = 'submit';
  const persistDone = () => {
    const dk = optionsRef.current.draftKey;
    if (!dk) return;
    const done = Object.keys(doneRef.current).length ? { done: doneRef.current, completed: [...completedRef.current] } : null;
    writeJourneyExtra(dk, SUBMIT_KEY, done);
  };
  useEffect(() => {
    const dk = optionsRef.current.draftKey;
    if (!dk) return;
    const saved = readJourneyExtra<{ done: Record<string, JourneyRecord>; completed: string[] }>(dk, SUBMIT_KEY);
    if (!saved || !saved.done || typeof saved.done !== 'object') return;
    doneRef.current = { ...saved.done };
    completedRef.current = new Set(Array.isArray(saved.completed) ? saved.completed : Object.keys(saved.done));
    setStatus(Object.fromEntries([...completedRef.current].map(k => [k, 'done' as PlanStepStatus])));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount
  }, []);

  // K10a/P-14 (Abnahme 7): a page WITHOUT IntentWizardShell (a one-screen public
  // form) kept no form values at all — the participant's text was gone after a
  // reload although the page passed a draftKey. The plan's forms are kept here
  // under the draft's side data unless a shell claims the key (it keeps them
  // itself). Read per key before anything is saved; the restoring commit's save
  // is skipped; cleared with the draft on success.
  const FORMS_KEY = 'forms';
  const formsRestoredFor = useRef<string | null>(null);
  const formsJustRestored = useRef(false);
  const dkNow = options.draftKey;
  useEffect(() => {
    if (!dkNow || formsRestoredFor.current === dkNow) return;
    formsRestoredFor.current = dkNow;
    if (journeyDraftClaimed(dkNow)) return;
    const saved = readJourneyExtra<Record<string, FormValues>>(dkNow, FORMS_KEY);
    if (!saved || typeof saved !== 'object') return;
    for (const step of planRef.current) {
      const vals = step.form ? saved[step.key] : undefined;
      if (step.form && vals && typeof vals === 'object') { step.form.reset(vals); formsJustRestored.current = true; }
    }
  }, [dkNow]);
  const formsSignature = JSON.stringify(plan.map(s => (s.form ? s.form.values : null)));
  useEffect(() => {
    if (!dkNow || formsRestoredFor.current !== dkNow || journeyDraftClaimed(dkNow) || result) return;
    if (formsJustRestored.current) { formsJustRestored.current = false; return; }
    const data: Record<string, FormValues> = {};
    let any = false;
    for (const step of planRef.current) {
      if (!step.form) continue;
      data[step.key] = step.form.values;
      if (Object.values(step.form.values).some(v => !isEmptyValue(v))) any = true;
    }
    writeJourneyExtra(dkNow, FORMS_KEY, any ? data : null);
  }, [dkNow, formsSignature, result]);

  const setStepStatus = (key: string, s: PlanStepStatus) =>
    setStatus(prev => (prev[key] === s ? prev : { ...prev, [key]: s }));

  const run = useCallback(async (): Promise<JourneyResult | null> => {
    if (busyRef.current) return null;
    if (result) return result;
    busyRef.current = true;
    setSubmitting(true);
    setError(null);
    setOffline(false);
    setLimitedUntil(null);
    setFailedStep(null);
    const steps = planRef.current;
    const ctx: PlanContext = { port, done: doneRef.current };
    try {
      const refusal = optionsRef.current.check ? await optionsRef.current.check(ctx) : null;
      if (refusal) {
        const err = new Error(refusal);
        err.name = 'JourneyRefused';
        throw err;
      }
      for (const step of steps) {
        if (completedRef.current.has(step.key)) continue;
        for (const need of step.needs ?? []) {
          if (!completedRef.current.has(need)) {
            throw new JourneyPortError(`Plan step '${step.key}' needs '${need}' first — order the plan accordingly.`);
          }
        }
        setStepStatus(step.key, 'running');
        const record = normalizeRecord(step.run ? await step.run(ctx) : await createFromStep(step, ctx));
        if (record) doneRef.current[step.key] = record;
        completedRef.current.add(step.key);
        setStepStatus(step.key, 'done');
        persistDone();
      }
      const primaryStep = steps.find(s => s.primary) ?? steps.find(s => doneRef.current[s.key]);
      // A journey that only UPDATES (return a tool, check a guest out) yields no
      // new record. It still succeeded — the success screen then shows the facts
      // without a reference (live: "The plan produced no record" over two green
      // ticks). run() may return the touched record to get a reference anyway.
      const primary = (primaryStep ? doneRef.current[primaryStep.key] : undefined) ?? { id: '', fields: {}, createdAt: null };
      const out: JourneyResult = { primary, entity: primaryStep?.entity, records: { ...doneRef.current }, created: primaryStep ? stepVerb(primaryStep) === 'create' : true, summary: rowsRef.current };
      if (optionsRef.current.draftKey) clearJourneyDraft(optionsRef.current.draftKey);
      limitedN.current = 0;
      setResult(out);
      optionsRef.current.onSuccess?.(out);
      return out;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // no network: the browser says so, or fetch rejected without an answer — raw (TypeError) or
      // wrapped by the public client (SubmitFailedError „Failed to fetch“, EF-22); a refusal is no outage
      setOffline(err.name !== 'JourneyRefused' && ((typeof navigator !== 'undefined' && navigator.onLine === false)
        || /failed to fetch|networkerror|network error|load failed/i.test(err.message)));
      // EF-42: a 429 is a queue, not a failure — keep the input, send again after Retry-After
      // (else 5, 10, 20, 40 s; a success or reset forgets the count)
      if (err.name === 'RateLimitedError') {
        const after = (err as { retryAfterMs?: number | null }).retryAfterMs ?? 0;
        const wait = Math.max(after, [5000, 10_000, 20_000, 40_000][Math.min(limitedN.current, 3)]);
        limitedN.current += 1;
        setLimitedUntil(Date.now() + Math.min(wait, 60_000));
      } else {
        limitedN.current = 0;
      }
      const failing = steps.find(s => !completedRef.current.has(s.key));
      if (failing) setStepStatus(failing.key, 'failed');
      setFailedStep(failing?.key ?? null);
      setError(err);
      return null;
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  }, [port, result]);

  // P-14: offline at submit → send again by itself when the browser is back online
  useEffect(() => {
    if (!offline) return;
    const back = () => { void run(); };
    window.addEventListener('online', back);
    return () => window.removeEventListener('online', back);
  }, [offline, run]);

  // EF-42: rate-limited at submit → send again by itself when the wait is over
  useEffect(() => {
    if (limitedUntil === null) return;
    const t = window.setTimeout(() => { void run(); }, Math.max(0, limitedUntil - Date.now()));
    return () => window.clearTimeout(t);
  }, [limitedUntil, run]);

  const remember = useCallback((rows: SummaryItem[]) => {
    rowsRef.current = rows;
  }, []);

  const reset = useCallback(() => {
    rowsRef.current = [];
    doneRef.current = {};
    completedRef.current = new Set();
    if (optionsRef.current.draftKey) {
      writeJourneyExtra(optionsRef.current.draftKey, SUBMIT_KEY, null);
      writeJourneyExtra(optionsRef.current.draftKey, FORMS_KEY, null);
    }
    busyRef.current = false;
    setSubmitting(false);
    setError(null);
    setResult(null);
    setFailedStep(null);
    setStatus({});
    setOffline(false);
    setLimitedUntil(null);
    limitedN.current = 0;
  }, []);

  return {
    run,
    retry: run,
    reset,
    remember,
    submitting,
    done: result !== null,
    error,
    offline,
    limited: limitedUntil !== null,
    limitedUntil,
    result,
    status,
    failedStep,
    doneCount: completedRef.current.size,
    plan,
  };
}
