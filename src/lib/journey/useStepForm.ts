/**
 * useStepForm — the validation and binding layer of a journey step.
 *
 * The generator knows every field (required, kind, options, label); this hook
 * turns that into bindings a page spreads onto its inputs and widgets:
 *
 *   const f = useStepForm('buchungen', { steps: { gast: 1, anreise: 2, abreise: 2 } });
 *   <Input {...f.field('name')} />                       text / email / tel / url / textarea
 *   <DatePicker {...f.date('anreise')} />                single date
 *   <ChoiceGroup {...f.choice('status')} />              lookup (≤ 6 options)
 *   <Combobox {...f.record('kunde')} items={…} />        applookup
 *   <EntitySelectStep {...x.select} {...f.records('mitarbeiter', x.labelOf)} />   multipleapplookup (toggle pick)
 *   <AvailabilityRangePicker {...f.range('anreise', 'abreise', { blocked })} />
 *   <StepNav onNext={() => f.validate(['name', 'email'])} />
 *
 * Timing follows "reward early, punish late": nothing is said in an untouched
 * field, an error appears on blur, disappears the moment the value is fixed,
 * and `f.ok(key)` turns true only after the user touched the field. An empty
 * required field shows the agent's sentence for it (`src/lib/journey/messages.ts`,
 * „Bitte einen Gast auswählen."), else the label sentence
 * („„Anreisedatum" ist ein Pflichtfeld"); `messages` overrides per flow.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { t, tp } from '@/i18n';
import { rangeIsFree } from '@/components/blocks/AvailabilityRangePicker';
import { formatFieldValue, formatRange, type RangeUnit } from './format';
import { isUploadValue } from './upload';
import { FIELD_RULES, isEmptyValue, isUnfilled, labelOf, optionsOf, type EntityKey, type FieldRule, type RecordFieldKey } from './rules';
import { requiredMessage } from './messages';
import { occupancyRuleOf } from './occupancy';
import { isHiddenByPolicy, policyRequired } from './policy';
import { usePolicyVersion } from './usePolicy';

export type FormValues = Record<string, unknown>;

// The wizard step the user is on — set by IntentWizardShell, read by `set()`:
// a form without a `steps` map learns which step a field belongs to from the
// step it was filled on. That drives "Ändern" in the review (live: a ticket
// flow with two forms and no steps map offered no Ändern at all).
let activeWizardStep: number | undefined;
export function setActiveWizardStep(step: number | undefined): void {
  activeWizardStep = step;
  // mirrored for lib/sentry's `journey_step` tag — no import in either direction
  if (typeof window !== 'undefined') (window as unknown as { __klarJourneyStep?: number }).__klarJourneyStep = step;
}

// A flow opened for ONE record (`?record=<id>`, the dashboard's card button) has
// nothing to ask on the steps that pick it — the flow hook asks the shell to start
// right after them, without the start screen (Bau 10: „Zusammenführen“ opened the
// intro and step 1 although the interaction was in the link). One pending request,
// taken by the first shell that listens.
let pendingStepRequest: number | undefined;
const stepRequestListeners = new Set<(step: number) => void>();
export function requestWizardStep(step: number): void {
  if (stepRequestListeners.size === 0) { pendingStepRequest = step; return; }
  for (const l of stepRequestListeners) l(step);
}
export function onWizardStepRequest(listener: (step: number) => void): () => void {
  if (pendingStepRequest !== undefined) {
    const step = pendingStepRequest;
    pendingStepRequest = undefined;
    listener(step);
  }
  stepRequestListeners.add(listener);
  return () => { stepRequestListeners.delete(listener); };
}

export interface SummaryItem {
  key: string;
  label: string;
  value: string;
  /** Wizard step that edits this value — enables "Change" in the summary. */
  step?: number;
  /** All field keys behind this row (a range row has two). OPTIONAL like
   *  `fieldId`: a computed row covers no field (live: a lane lost a gate
   *  round and then wrote `keys: []`). */
  keys?: string[];
  /** The element to focus when the user wants to change it. OPTIONAL: a row
   *  the page computes (a total, a status the plan sets, today's date) has no
   *  input behind it — leave it out, "Ändern" then jumps to the step alone.
   *  Live: a required fieldId made a flow invent `fieldId: 'status'` for a
   *  row no field owned. */
  fieldId?: string;
  /** A row nobody answers here — a value the flow sets itself. "Ändern"
   *  then leads to the page that changes it („Nach dem Bau“), not to a step. */
  href?: string;
}

export interface FormError {
  key: string;
  label: string;
  message: string;
  fieldId: string;
}

export interface StepFormOptions {
  /** Subset and order of fields (default: every writable field of the entity). */
  fields?: string[];
  /** field key → wizard step number. Drives "Change" links and answer chips. */
  steps?: Record<string, number>;
  /** Override the platform's `required` per field (public pages declare their own). */
  required?: Record<string, boolean>;
  /** What to say when a required field is empty, per field — when THIS flow
   *  knows more than the entity („Bitte den Einsatzleiter auswählen.").
   *  Default: the entity's sentence from messages.ts. An object overrides per
   *  error kind: `required`, `format` (e-mail, phone, URL, number), `length`
   *  (maxLength), `option` (a value outside the lookup) — P-10: every message
   *  is an instruction („Bitte … eingeben.“), and a page may say it better. */
  messages?: Record<string, string | FieldMessages>;
  initial?: FormValues;
  /** Prefix for element ids (default: the entity key). */
  id?: string;
  /** Browser autofill of the person's OWN data (given-name, email, postal-code, …
   *  from the generated rules). ON for the public door — a visitor types their own
   *  details, autofill is the cheapest conversion lever there is. OFF (default)
   *  inside the dashboard: the team enters someone ELSE's data, and the browser
   *  would offer the team member's own name and address. `type`/`inputMode`
   *  (the right keyboard) are set either way. */
  autoComplete?: boolean;
}

export interface RangeOptions {
  blocked?: Array<{ start: string; end?: string | null }>;
  minNights?: number;
  /** How the pair counts in messages and the summary: 'nights' (a stay),
   *  'days' (a course, a loan, a period) or 'none'. Default: 'nights' when the
   *  entity has an occupancy rule (it IS a stay), else 'days'. */
  unit?: RangeUnit;
}

type ChangeLike = unknown | { target: { value: unknown; type?: string; checked?: boolean } };

/** Binding for a file field — spread onto <FileField>: the value is a pending
 *  upload (data URL), a stored file URL, or null. */
export interface FileProps {
  id: string;
  name: string;
  value: string | null;
  onChange: (value: string | null) => void;
  required: boolean;
  invalid: boolean;
  describedBy?: string;
}

export interface FieldProps {
  id: string;
  name: string;
  value: string;
  onChange: (next: ChangeLike) => void;
  onBlur: () => void;
  required: boolean;
  type?: string;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'tel' | 'email' | 'url';
  autoComplete?: string;
  maxLength?: number;
  step?: string;
  'aria-required'?: true;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
}

export interface DateProps {
  id: string;
  value: string | null;
  onChange: (next: string | null) => void;
  required: boolean;
  invalid: boolean;
  mode: 'date' | 'datetime';
}

export interface ChoiceProps {
  /** Points at the <Field> label — a radiogroup is not labelable by htmlFor. */
  'aria-labelledby'?: string;
  id: string;
  value: string | null;
  onChange: (key: string | null) => void;
  options: Array<{ key: string; label: string }>;
  required: boolean;
  invalid: boolean;
  'aria-describedby'?: string;
}

/** Per-kind messages of one field (`messages` option). */
export interface FieldMessages {
  required?: string;
  format?: string;
  length?: string;
  option?: string;
}

export interface CheckboxProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean | 'indeterminate') => void;
}

export interface RecordProps {
  id: string;
  value: string | null;
  onChange: (id: string | null) => void;
  invalid: boolean;
}

/** A multi-record pick (multipleapplookup): spread onto <EntitySelectStep>. */
export interface RecordsProps {
  id: string;
  selectedIds: string[];
  onToggle: (id: string) => void;
  invalid: boolean;
  'aria-describedby'?: string;
}

export interface RangeProps {
  value: { from: string | null; to: string | null };
  onChange: (range: { from: string | null; to: string | null }) => void;
  blocked: Array<{ start: string; end?: string | null }>;
  minNights: number;
}

/** `set`'s arguments by field: an applookup field takes the record's display
 *  name as a REQUIRED third argument (`x.labelOf(id)` — may be undefined, but
 *  it has to be passed); every other field takes it optionally. A pick stored
 *  without its name no longer compiles — live it showed as a 24-hex id. */
export type SetArgs<E extends EntityKey, K extends string> = K extends RecordFieldKey<E>
  ? [value: unknown, label: string | undefined]
  : [value: unknown, label?: string];

export interface StepForm<E extends EntityKey = EntityKey> {
  readonly entity: E;
  readonly id: string;
  readonly keys: string[];
  /** Keys of `fields` the owner's policy hides — the shell skips a step that has only these. */
  readonly hiddenKeys: string[];
  readonly rules: Record<string, FieldRule>;
  readonly values: FormValues;
  /** Display names learned while picking records, keyed by field key and by record id. */
  readonly labels: Record<string, string>;
  get(key: string): unknown;
  set<K extends string>(key: K, ...rest: SetArgs<E, K>): void;
  /** A STARTING value the page derives (a compiled text, a default from a pick):
   *  written only while the field is empty or still holds the last prefill — never
   *  over what the person typed or a restored draft (J-11, Abnahme 6: a reload kept
   *  the draft, then the page's effect wrote the compiled text over it). Use this,
   *  not set(), for any value an effect computes. */
  prefill(key: string, value: unknown): void;
  /** Teach the form a record's display name (for summaries of multi-record fields). */
  remember(recordId: string, label: string): void;
  /** The label a <Field label="…"> gave the control — the review and the
   *  missing list read it back (J-6: the review said „Fragestellung“ where the
   *  step said „Deine Frage“). */
  title(key: string, text: string): void;
  titleOf(key: string): string;
  reset(values?: FormValues, labels?: Record<string, string>): void;
  field(key: string): FieldProps;
  number(key: string): FieldProps;
  date(key: string): DateProps;
  choice(key: string): ChoiceProps;
  checkbox(key: string): CheckboxProps;
  record(key: string): RecordProps;
  /** Binding for a file field (`<FileField {...form.file('beleg')} />`); the chosen file travels in the create as a data URL. */
  file(key: string): FileProps;
  /** Binding for a multipleapplookup: the value is a `string[]` of record ids,
   *  required means "at least one". `labelOf` (the pick's `useRecordSearch`)
   *  teaches the form the display names the summary shows. */
  records(key: string, labelOf?: (id: string) => string | undefined): RecordsProps;
  range(fromKey: string, toKey: string, opts?: RangeOptions): RangeProps;
  /** The visible error of a field (after touch or a validate() attempt). */
  error(key: string): string | undefined;
  /** True once the user touched the field and it is filled and valid. */
  ok(key: string): boolean;
  /** Errors of attempted fields — what a FieldErrorSummary lists. */
  readonly errors: FormError[];
  /** Labels of required fields that are still empty — regardless of touch state. */
  readonly missing: string[];
  readonly required: (key: string) => boolean;
  /** Validates the given fields (default all), marks them attempted, focuses
   *  the first invalid one. Returns true when everything passed. */
  validate(keys?: string[]): boolean;
  stepOf(key: string): number | undefined;
  /** True when the form ASKS for the field — listed in `fields` or given a
   *  step. A required field the page never asks for is not "missing": the
   *  plan supplies it (values/link), an update leaves it as it is, or it is
   *  the team's later duty. Without `fields` and `steps` every key is bound. */
  bound(key: string): boolean;
  fieldId(key: string): string;
  /** Formatted rows for a summary — a range shows as ONE row. Empty optional
   *  fields are skipped; empty required ones show as "—" so the gap is visible. */
  summary(): SummaryItem[];
  /** Values of the rule fields, empty ones removed — what `port.create` takes. */
  payload(): FormValues;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TEL_RE = /^\+?[0-9][0-9 ()\/.-]{4,}$/;
// Scheme optional (people type "example.org"), a dotted host, then anything.
const URL_RE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[\w-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#]\S*)?$/i;

function isUrl(v: string): boolean {
  return URL_RE.test(v);
}

function isEventLike(v: ChangeLike): v is { target: { value: unknown; type?: string; checked?: boolean } } {
  return typeof v === 'object' && v !== null && 'target' in v && typeof (v as { target: unknown }).target === 'object';
}

function inputTypeFor(rule: FieldRule | undefined): string | undefined {
  switch (rule?.kind) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'number':
      return 'number';
    case 'textarea':
      return undefined;
    default:
      return 'text';
  }
}

function inputModeFor(rule: FieldRule | undefined): FieldProps['inputMode'] {
  switch (rule?.kind) {
    case 'email':
      return 'email';
    case 'tel':
      return 'tel';
    case 'url':
      return 'url';
    case 'number':
      return 'decimal';
    default:
      return undefined;
  }
}

function focusById(id: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  try {
    (el as HTMLElement).focus({ preventScroll: false });
    el.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  } catch {
    /* ignore */
  }
}

export function useStepForm<E extends EntityKey>(entity: E, options: StepFormOptions = {}): StepForm<E> {
  const rules = useMemo(
    () => (FIELD_RULES as Record<string, Record<string, FieldRule>>)[entity] ?? {},
    [entity],
  );
  const fieldsKey = options.fields?.join('|') ?? '';
  // The owner's field policy (public pages, "Felder anpassen"): a hidden key
  // is not a key of this form — not validated, not summarised, not sent. The
  // policy arrives with the page config, after the first render.
  const policyVersion = usePolicyVersion();
  const allKeys = useMemo(
    () => options.fields ?? Object.keys(rules).filter(k => rules[k].writable),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rules, fieldsKey],
  );
  const keys = useMemo(
    () => allKeys.filter(k => !isHiddenByPolicy(entity, k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allKeys, entity, policyVersion],
  );
  const hiddenKeys = useMemo(
    () => allKeys.filter(k => isHiddenByPolicy(entity, k)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allKeys, entity, policyVersion],
  );
  const formId = options.id ?? entity;
  const stepsMap = options.steps ?? {};
  // Steps learned from `set()` while a wizard step was active; the map wins.
  const learnedSteps = useRef<Record<string, number>>({});
  const stepFor = (key: string): number | undefined => stepsMap[key] ?? learnedSteps.current[key];
  const requiredOverride = options.required ?? {};
  const messagesOverride = options.messages ?? {};
  const boundKeys = new Set<string>([...(options.fields ?? []), ...Object.keys(stepsMap)]);
  const bound = (key: string): boolean => boundKeys.size === 0 || boundKeys.has(key);
  // The stay's resource (the agent's occupancy rule in src/config/journey.ts)
  // is mandatory whenever the form carries it — a booking without its room
  // cannot be checked against occupancy. Pages need not repeat that; an
  // explicit `required` entry still wins.
  const occupancyResource = occupancyRuleOf(entity)?.resource;

  const [values, setValues] = useState<FormValues>(() => ({ ...(options.initial ?? {}) }));
  // EF-38 (Doodle Kontrollbau 3): a plan memoised once held the form object of an EARLIER render;
  // its payload() read the empty names of that render and the POST lacked them (400 missing_fields).
  // payload() reads the latest values, whichever render's object is asked.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  const [labels, setLabels] = useState<Record<string, string>>({});
  // the labels the page's <Field> blocks gave the controls (a ref: a child's
  // effect registers them, nothing has to re-render for a later review)
  const titlesRef = useRef<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState<Record<string, boolean>>({});
  // Ranges register themselves on each render (idempotent) so validation and
  // the summary know which two fields form one input.
  const rangesRef = useRef<Record<string, { from: string; to: string; opts: RangeOptions }>>({});

  const fieldId = useCallback((key: string) => `${formId}-${key}`, [formId]);
  const errorId = useCallback((key: string) => `${formId}-${key}-error`, [formId]);
  const isRequired = useCallback(
    (key: string) =>
      policyRequired(entity, key) ?? requiredOverride[key] ?? (key === occupancyResource && keys.includes(key) ? true : rules[key]?.required ?? false),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requiredOverride, rules, occupancyResource, keys, entity, policyVersion],
  );

  const rangeEndingAt = (key: string) => Object.values(rangesRef.current).find(r => r.to === key);
  const rangeUnitOf = (opts: RangeOptions): RangeUnit => opts.unit ?? (occupancyResource ? 'nights' : 'days');

  const messageFor = useCallback(
    (key: string, vals: FormValues): string | undefined => {
      const rule = rules[key];
      const label = titleOf(key);
      const v = vals[key];
      const asTo = rangeEndingAt(key);
      const say = (kind: keyof FieldMessages): string | undefined => {
        const m = messagesOverride[key];
        return typeof m === 'string' ? (kind === 'required' ? m : undefined) : m?.[kind];
      };
      if (isUnfilled(entity, key, v)) {
        const missing = () => say('required') ?? requiredMessage(entity, key);
        if (isRequired(key)) return missing();
        // A stay with an arrival but no departure is incomplete even when the
        // platform marks neither field required.
        if (asTo && !isEmptyValue(vals[asTo.from])) return missing();
        return undefined;
      }
      switch (rule?.kind) {
        case 'email':
          if (!EMAIL_RE.test(String(v).trim())) return say('format') ?? t('v_email', { label });
          break;
        case 'tel':
          if (!TEL_RE.test(String(v).trim())) return say('format') ?? t('v_tel', { label });
          break;
        case 'url':
          if (!isUrl(String(v).trim())) return say('format') ?? t('v_url', { label });
          break;
        case 'number': {
          const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
          if (!Number.isFinite(n)) return say('format') ?? t('v_number', { label });
          break;
        }
        case 'text':
        case 'textarea':
          if (rule.maxLength && String(v).length > rule.maxLength) return say('length') ?? t('v_maxlength', { label, max: rule.maxLength });
          break;
        case 'lookup': {
          const k = typeof v === 'object' && v !== null && 'key' in v ? (v as { key: string }).key : String(v);
          if (rule.options && rule.options.length && !rule.options.includes(k)) return say('option') ?? t('v_option', { label });
          break;
        }
        default:
          break;
      }
      if (asTo) {
        const from = vals[asTo.from];
        if (!isEmptyValue(from)) {
          const a = String(from).slice(0, 10);
          const b = String(v).slice(0, 10);
          if (b <= a) return t('v_range_order', { from: labelOf(entity, asTo.from), to: label });
          const nights = Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
          const min = asTo.opts.minNights ?? 1;
          if (nights < min) return rangeUnitOf(asTo.opts) === 'nights' ? tp('v_min_nights', min, { n: min }) : tp('v_min_days', min + 1, { n: min + 1 });
          if (asTo.opts.blocked && asTo.opts.blocked.length && !rangeIsFree(a, b, asTo.opts.blocked)) {
            return t('v_range_blocked');
          }
        }
      }
      return undefined;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, isRequired, rules, JSON.stringify(messagesOverride)],
  );

  const set = useCallback((key: string, value: unknown, label?: string) => {
    setValues(prev => (prev[key] === value ? prev : { ...prev, [key]: value }));
    if (activeWizardStep !== undefined && learnedSteps.current[key] === undefined) learnedSteps.current[key] = activeWizardStep;
    if (label !== undefined) {
      setLabels(prev => {
        const next = { ...prev, [key]: label };
        if (typeof value === 'string') next[value] = label;
        // A multirecord field picked as ONE record (`set('terminwuensche', [id], label)`):
        // the summary looks the label up by id (live: the chip showed the raw id).
        if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') next[value[0]] = label;
        return next;
      });
    }
  }, []);

  const lastPrefill = useRef<Record<string, unknown>>({});
  const prefill = useCallback((key: string, value: unknown) => {
    setValues(prev => {
      const now = prev[key];
      const ours = key in lastPrefill.current && JSON.stringify(now) === JSON.stringify(lastPrefill.current[key]);
      if (!isEmptyValue(now) && !ours) return prev;          // typed or restored — the person's
      lastPrefill.current[key] = value;
      return now === value ? prev : { ...prev, [key]: value };
    });
  }, []);

  const title = useCallback((key: string, text: string) => { titlesRef.current[key] = text; }, []);
  const titleOf = useCallback((key: string) => titlesRef.current[key] ?? labelOf(entity, key), [entity]);
  const remember = useCallback((recordId: string, label: string) => {
    setLabels(prev => (prev[recordId] === label ? prev : { ...prev, [recordId]: label }));
  }, []);

  const touch = useCallback((key: string) => {
    setTouched(prev => (prev[key] ? prev : { ...prev, [key]: true }));
  }, []);

  const visibleError = (key: string): string | undefined =>
    touched[key] || attempted[key] ? messageFor(key, values) : undefined;

  const describedBy = (key: string): string | undefined => (visibleError(key) ? errorId(key) : undefined);

  const handleChange = (key: string) => (next: ChangeLike) => {
    if (isEventLike(next)) {
      const tgt = next.target;
      set(key, tgt.type === 'checkbox' ? Boolean(tgt.checked) : tgt.value);
    } else {
      set(key, next);
    }
  };

  const file = (key: string): FileProps => {
    const raw = values[key];
    const err = visibleError(key);
    return {
      id: fieldId(key),
      name: key,
      value: typeof raw === 'string' && raw ? raw : null,
      onChange: next => { set(key, next ?? null); touch(key); },
      required: isRequired(key),
      invalid: Boolean(err),
      describedBy: err ? errorId(key) : undefined,
    };
  };

  const field = (key: string): FieldProps => {
    const rule = rules[key];
    const raw = values[key];
    const err = visibleError(key);
    const props: FieldProps = {
      id: fieldId(key),
      name: key,
      value: raw === undefined || raw === null ? '' : String(raw),
      onChange: handleChange(key),
      onBlur: () => touch(key),
      required: isRequired(key),
    };
    const type = inputTypeFor(rule);
    if (type) props.type = type;
    const mode = inputModeFor(rule);
    if (mode) props.inputMode = mode;
    if (options.autoComplete && rule?.autoComplete) props.autoComplete = rule.autoComplete;
    if (rule?.maxLength) props.maxLength = rule.maxLength;
    if (rule?.kind === 'number') props.step = 'any';
    if (props.required) props['aria-required'] = true;
    if (err) {
      props['aria-invalid'] = true;
      props['aria-describedby'] = errorId(key);
    }
    return props;
  };

  const number = (key: string): FieldProps => field(key);

  const date = (key: string): DateProps => ({
    id: fieldId(key),
    value: values[key] === undefined || values[key] === null || values[key] === '' ? null : String(values[key]),
    onChange: next => {
      set(key, next);
      touch(key);
    },
    required: isRequired(key),
    invalid: Boolean(visibleError(key)),
    mode: rules[key]?.kind === 'datetime' ? 'datetime' : 'date',
  });

  const choice = (key: string): ChoiceProps => ({
    id: fieldId(key),
    // A radiogroup is not labelable by htmlFor — it points at the <Field> label.
    'aria-labelledby': `${fieldId(key)}-label`,
    value:
      values[key] === undefined || values[key] === null || values[key] === ''
        ? null
        : typeof values[key] === 'object' && 'key' in (values[key] as object)
          ? String((values[key] as { key: string }).key)
          : String(values[key]),
    onChange: next => {
      set(key, next);
      touch(key);
    },
    options: optionsOf(entity, key),
    required: isRequired(key),
    invalid: Boolean(visibleError(key)),
    'aria-describedby': describedBy(key),
  });

  const checkbox = (key: string): CheckboxProps => ({
    id: fieldId(key),
    checked: Boolean(values[key]),
    onCheckedChange: next => {
      set(key, next === true);
      touch(key);
    },
  });

  const record = (key: string): RecordProps => ({
    id: fieldId(key),
    value: values[key] === undefined || values[key] === null || values[key] === '' ? null : String(values[key]),
    onChange: id => {
      set(key, id);
      touch(key);
    },
    invalid: Boolean(visibleError(key)),
  });

  const records = (key: string, labelOf?: (id: string) => string | undefined): RecordsProps => {
    const raw = values[key];
    const selectedIds = Array.isArray(raw) ? raw.map(String) : raw === undefined || raw === null || raw === '' ? [] : [String(raw)];
    return {
      id: fieldId(key),
      selectedIds,
      onToggle: id => {
        const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id];
        set(key, next);
        const label = labelOf?.(id);
        if (label) remember(id, label);
        touch(key);
      },
      invalid: Boolean(visibleError(key)),
      'aria-describedby': describedBy(key),
    };
  };

  const range = (fromKey: string, toKey: string, opts: RangeOptions = {}): RangeProps => {
    rangesRef.current[`${fromKey}|${toKey}`] = { from: fromKey, to: toKey, opts };
    const from = values[fromKey];
    const to = values[toKey];
    return {
      value: {
        from: from === undefined || from === null || from === '' ? null : String(from),
        to: to === undefined || to === null || to === '' ? null : String(to),
      },
      onChange: next => {
        setValues(prev => ({ ...prev, [fromKey]: next.from, [toKey]: next.to }));
        touch(fromKey);
        if (next.to) touch(toKey);
      },
      blocked: opts.blocked ?? [],
      minNights: opts.minNights ?? 1,
    };
  };

  const errors: FormError[] = keys
    .filter(k => attempted[k])
    .map(k => ({ key: k, message: messageFor(k, values) }))
    .filter((e): e is { key: string; message: string } => Boolean(e.message))
    .map(e => ({ key: e.key, label: labelOf(entity, e.key), message: e.message, fieldId: fieldId(e.key) }));

  const missing = keys.filter(k => bound(k) && isRequired(k) && isUnfilled(entity, k, values[k])).map(k => titleOf(k));

  const validate = (which?: string[]): boolean => {
    const target = which ?? keys.filter(bound);
    setAttempted(prev => {
      const next = { ...prev };
      for (const k of target) next[k] = true;
      return next;
    });
    const firstBad = target.find(k => messageFor(k, values));
    if (firstBad) {
      focusById(fieldId(firstBad));
      return false;
    }
    return true;
  };

  const summary = (): SummaryItem[] => {
    const items: SummaryItem[] = [];
    const rangeByFrom = new Map<string, { from: string; to: string }>();
    const consumed = new Set<string>();
    for (const r of Object.values(rangesRef.current)) {
      rangeByFrom.set(r.from, r);
      consumed.add(r.from);
      consumed.add(r.to);
    }
    for (const key of keys) {
      const asFrom = rangeByFrom.get(key);
      if (asFrom) {
        const from = values[asFrom.from];
        const to = values[asFrom.to];
        const empty = isEmptyValue(from) && isEmptyValue(to);
        if (!bound(asFrom.from) && !bound(asFrom.to)) continue;
        if (empty && !isRequired(asFrom.from) && !isRequired(asFrom.to)) continue;
        items.push({
          key: `${asFrom.from}+${asFrom.to}`,
          keys: [asFrom.from, asFrom.to],
          label: `${labelOf(entity, asFrom.from)} / ${labelOf(entity, asFrom.to)}`,
          value: formatRange(from as string | null, to as string | null, rangeUnitOf(rangesRef.current[`${asFrom.from}|${asFrom.to}`]?.opts ?? {})),
          step: stepFor(asFrom.from) ?? stepFor(asFrom.to),
          fieldId: fieldId(asFrom.from),
        });
        continue;
      }
      if (consumed.has(key)) continue;
      const empty = isEmptyValue(values[key]);
      if (!bound(key) || (empty && !isRequired(key))) continue;
      items.push({
        key,
        keys: [key],
        label: titleOf(key),
        value: formatFieldValue(entity, key, values[key], labels),
        step: stepFor(key),
        fieldId: fieldId(key),
      });
    }
    return items;
  };

  const payload = (): FormValues => {
    const values = valuesRef.current;
    const out: FormValues = {};
    for (const key of keys) {
      // a file is not writable as a value — but a file the person CHOSE here
      // travels as a data URL and the platform stores it (lib/journey/upload)
      if (rules[key] && !rules[key].writable && !(rules[key].kind === 'file' && isUploadValue(values[key]))) continue;
      if (isEmptyValue(values[key])) continue;
      out[key] = values[key];
    }
    return out;
  };

  const reset = (next?: FormValues, nextLabels?: Record<string, string>) => {
    setValues({ ...(next ?? options.initial ?? {}) });
    lastPrefill.current = {};                               // a restored draft is the person's
    setLabels({ ...(nextLabels ?? {}) });
    setTouched({});
    setAttempted({});
  };

  return {
    entity,
    // The implementation takes (key, value, label?) — the interface narrows it per field.
    id: formId,
    keys,
    rules,
    values,
    labels,
    get: key => values[key],
    set: set as unknown as StepForm<E>['set'],
    prefill,
    remember,
    title,
    titleOf,
    reset,
    field,
    file,
    number,
    date,
    choice,
    checkbox,
    record,
    records,
    range,
    error: visibleError,
    ok: key => Boolean(touched[key]) && !isEmptyValue(values[key]) && !messageFor(key, values),
    errors,
    missing,
    required: isRequired,
    validate,
    stepOf: stepFor,
    bound,
    fieldId,
    summary,
    payload,
    hiddenKeys,
  };
}
