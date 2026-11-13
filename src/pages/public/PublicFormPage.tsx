import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { IconEye, IconLoader2 } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/DatePicker';
import { AddressAutocomplete } from '@/components/AddressAutocomplete';
import { AvailabilityRangePicker, rangeIsFree } from '@/components/blocks/AvailabilityRangePicker';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { FileField } from '@/components/blocks/FileField';
import { FieldErrorSummary } from '@/components/blocks/FieldErrorSummary';
import { SuccessStep } from '@/components/blocks/SuccessStep';
// Feldlabels/Options folgen der Besucher-Browsersprache über das Bundle;
// das Config-Label bleibt der Fallback (Alt-Seiten, fremde Apps).
import { t, fieldLabelByAppId, lookupLabelByAppId } from '@/i18n';
import {
  loadPublicPagesConfig,
  isPreviewMode,
  prepareChallenge,
  listPublicRecords,
  PageUnavailableError,
  RateLimitedError,
  FieldValidationError,
  type PublicPagesConfig,
  type PublicPageConfig,
  type PublicFieldConfig,
} from '@/lib/publicClient';
import {
  JourneyPortError,
  SHAPES,
  occupancyFor,
  occupancyRuleOf,
  useJourneySubmit,
  useStepForm,
  type EntityKey,
  type JourneyPort,
  type StepForm,
} from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { requiredMessage } from '@/lib/journey/messages';
import { displayPart } from '@/lib/journey/rules';

// Public form page — the anonymous side of "Öffentliche Formulare".
//
// Rendered entirely from the runtime config (./public-pages.json): the Klar
// service writes that file next to the bundle when the owner creates or edits
// a public page, so new forms go live without a rebuild. Mounted OUTSIDE
// <Layout>: no sidebar, no auth listener, mobile-first single column.
//
// The form itself is the journey layer behind the public door: `useStepForm`
// validates with the real field labels (required comes from the PAGE config,
// not from the platform's internal flags), `useJourneySubmit` writes through
// `createPublicPort` (idempotent retry, result-only success) and `SuccessStep`
// shows a reference the visitor can quote. The input FORM of a field follows
// `SHAPES`: a date pair renders as ONE availability calendar fed with the
// entity's existing occupancy (when the page lists it), a small lookup as
// pills — a plain field only when nothing better fits the data.

type Status = 'loading' | 'ready' | 'unavailable';

interface RefOption {
  id: string;
  label: string;
}

// Until the config is loaded there is no door yet — the runner never runs
// before the visitor could submit, but the hook needs a port object.
const PENDING_PORT: JourneyPort = {
  door: 'public',
  list: async () => {
    throw new JourneyPortError('public page config not loaded yet');
  },
  // A count is a question, not a write: an unloaded door answers "cannot
  // count" (the public door's permanent answer) rather than throwing.
  count: async () => null, get: async () => null,
  create: async () => {
    throw new JourneyPortError('public page config not loaded yet');
  },
  ref: (appId, id) => `/apps/${appId}/records/${id}`,
};

function FieldError({ form, fieldKey }: { form: StepForm; fieldKey: string }) {
  const message = form.error(fieldKey);
  if (!message) return null;
  return (
    <p id={`${form.fieldId(fieldKey)}-error`} className="text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

interface FieldInputProps {
  field: PublicFieldConfig;
  appId: string;
  form: StepForm;
  smallLookup: boolean;
  refOptions?: RefOption[];
  refLoading?: boolean;
  /** Extra text per applookup option (e.g. "frei" / "belegt" for the picked stay). */
  optionHint?: (id: string) => string | undefined;
}

function FieldInput({ field, appId, form, smallLookup, refOptions, refLoading, optionHint }: FieldInputProps) {
  const ft = field.fulltype;
  const options = field.options ?? [];
  const key = field.key;

  // a document the visitor sends: it travels in the create (lib/journey/upload)
  if (ft === 'file' || ft.startsWith('file/')) {
    return <FileField {...form.file(key)} />;
  }
  if (ft.includes('applookup')) {
    if (refLoading) {
      return <IconLoader2 size={18} stroke={1.5} className="animate-spin text-muted-foreground" />;
    }
    const opts = refOptions ?? [];
    if (field.multiple) {
      const current = Array.isArray(form.values[key]) ? (form.values[key] as string[]) : [];
      return (
        <div className="space-y-2" role="group" aria-describedby={form.error(key) ? `${form.fieldId(key)}-error` : undefined}>
          {opts.map(opt => (
            <div key={opt.id} className="flex items-center gap-2">
              <Checkbox
                id={`${form.fieldId(key)}_${opt.id}`}
                checked={current.includes(opt.id)}
                onCheckedChange={checked => {
                  const next = checked ? [...current, opt.id] : current.filter(v => v !== opt.id);
                  form.set(key, next.length ? next : undefined);
                }}
              />
              <Label htmlFor={`${form.fieldId(key)}_${opt.id}`} className="font-normal">{opt.label}</Label>
            </div>
          ))}
        </div>
      );
    }
    const rec = form.record(key);
    return (
      <Select value={rec.value ?? 'none'} onValueChange={v => {
        const picked = opts.find(o => o.id === v);
        if (v === 'none') form.set(key, undefined);
        else form.set(key, v, picked?.label);
      }}>
        <SelectTrigger id={rec.id} className="max-sm:h-11" aria-invalid={rec.invalid || undefined}><SelectValue placeholder="" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {opts.map(opt => {
            const hint = optionHint?.(opt.id);
            return (
              <SelectItem key={opt.id} value={opt.id}>{hint ? `${opt.label} · ${hint}` : opt.label}</SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    );
  }

  if (ft === 'string/textarea') {
    return <Textarea {...form.field(key)} rows={3} />;
  }

  if (ft === 'number' || ft.startsWith('number/')) {
    return <Input {...form.number(key)} placeholder="" />;
  }

  if (ft === 'bool') {
    const cb = form.checkbox(key);
    return (
      <div className="flex items-center gap-2 pt-1">
        <Checkbox {...cb} />
        <Label htmlFor={cb.id} className="font-normal">{fieldLabelByAppId(appId, key) ?? field.label}</Label>
      </div>
    );
  }

  if (ft === 'date/date' || ft === 'date/datetimeminute') {
    return <DatePicker {...form.date(key)} placeholder="" />;
  }

  if ((ft === 'lookup/select' || ft === 'lookup/radio') && options.length > 0) {
    const choice = form.choice(key);
    const localized = options.map(opt => ({ key: opt.key, label: lookupLabelByAppId(appId, key, opt.key) ?? opt.label }));
    // Few options → pills (matches the dialog UX and the ◈ shape); larger sets → Select.
    if (smallLookup || options.length <= 5) {
      return <ChoiceGroup {...choice} options={localized} allowClear={!choice.required} />;
    }
    return (
      <Select value={choice.value ?? 'none'} onValueChange={v => choice.onChange(v === 'none' ? null : v)}>
        <SelectTrigger id={choice.id} className="max-sm:h-11" aria-invalid={choice.invalid || undefined}><SelectValue placeholder="" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">—</SelectItem>
          {localized.map(opt => (
            <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (ft.includes('multiplelookup') && options.length > 0) {
    const current = Array.isArray(form.values[key]) ? (form.values[key] as string[]) : [];
    return (
      <div className="space-y-2" role="group">
        {options.map(opt => (
          <div key={opt.key} className="flex items-center gap-2">
            <Checkbox
              id={`${form.fieldId(key)}_${opt.key}`}
              checked={current.includes(opt.key)}
              onCheckedChange={checked => {
                const next = checked ? [...current, opt.key] : current.filter(k => k !== opt.key);
                form.set(key, next.length ? next : undefined);
              }}
            />
            <Label htmlFor={`${form.fieldId(key)}_${opt.key}`} className="font-normal">{lookupLabelByAppId(appId, key, opt.key) ?? opt.label}</Label>
          </div>
        ))}
      </div>
    );
  }

  if (ft === 'geo') {
    const geo = form.values[key] as { lat: number; long: number; info?: string } | undefined;
    return (
      <div className="space-y-2">
        <AddressAutocomplete
          placeholder={t('pf_address_placeholder')}
          onSelect={r => form.set(key, { lat: r.lat, long: r.long, info: r.label })}
        />
        {geo ? (
          <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
            <span className="truncate">{geo.info ?? `${geo.lat}, ${geo.long}`}</span>
            <button type="button" className="underline shrink-0" onClick={() => form.set(key, undefined)}>
              {t('pf_remove_text')}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  // string/text · email · tel · url → the binding sets type/inputMode/autoComplete.
  return <Input {...form.field(key)} placeholder="" />;
}

export default function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [status, setStatus] = useState<Status>('loading');
  const [config, setConfig] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  // applookup options fetched at runtime, keyed by field key (record id + label).
  const [refOptions, setRefOptions] = useState<Record<string, RefOption[]>>({});
  const [refLoading, setRefLoading] = useState(false);
  // Existing records of the page's own entity (the grant projects them to the
  // stay dates, the resource and the status) — `occupancyFor` turns them into
  // the calendar's blocked nights, the SAME way the internal flow does.
  const [ownRecords, setOwnRecords] = useState<Array<{ fields: Record<string, unknown> }>>([]);
  const preparedRef = useRef(false);

  const entity = (page?.entity ?? '') as EntityKey;
  const fieldKeys = useMemo(() => (page?.fields ?? []).map(f => f.key), [page]);

  // The stay this page renders as a calendar — ONLY when the build agent
  // decided the entity has one (src/config/journey.ts) and both fields are on
  // the page. The rule's resource (room, vehicle), when on the page, becomes
  // mandatory — a stay without its resource cannot be checked against
  // occupancy — and renders BEFORE the calendar. A rule that names a resource
  // the page does not carry means: calendar, but no occupancy claim.
  const range = useMemo(() => {
    const rule = occupancyRuleOf(entity);
    if (!rule || !fieldKeys.includes(rule.from) || !fieldKeys.includes(rule.to)) return null;
    const resource = rule.resource && fieldKeys.includes(rule.resource) ? rule.resource : null;
    return { from: rule.from, to: rule.to, resource, occupancyKnown: !rule.resource || resource !== null };
  }, [entity, fieldKeys]);
  const requiredMap = useMemo(() => {
    const map: Record<string, boolean> = Object.fromEntries((page?.fields ?? []).map(f => [f.key, Boolean(f.required)]));
    if (range?.resource) map[range.resource] = true;
    return map;
  }, [page, range]);
  // Visitors type their OWN data here — browser autofill on (the internal flows leave it off).
  const form = useStepForm(entity, { fields: fieldKeys, required: requiredMap, id: 'pf', autoComplete: true });

  const port = useMemo(() => (config && page ? createPublicPort(config, page) : PENDING_PORT), [config, page]);
  const submit = useJourneySubmit(port, [{ key: 'eintrag', entity, form, primary: true }]);

  const pickedResource = range?.resource ? (form.values[range.resource] as string | undefined) : undefined;
  // Occupancy is a claim about ONE resource. Before the visitor picked it,
  // the calendar makes no claim: the union of every room's bookings marked
  // nights as taken that were free in two of three rooms (live-seen).
  const resourcePending = Boolean(range?.resource) && !pickedResource;
  const occupancyShown = Boolean(range?.occupancyKnown) && !resourcePending;
  const blocked = useMemo(
    () => (range && occupancyShown ? occupancyFor(entity, ownRecords, { resource: pickedResource }) : []),
    [entity, ownRecords, range, occupancyShown, pickedResource],
  );
  // Per resource option: is it free for the currently picked stay?
  const availabilityHint = (id: string): string | undefined => {
    if (!range) return undefined;
    const from = form.values[range.from] as string | undefined;
    const to = form.values[range.to] as string | undefined;
    if (!from || !to) return undefined;
    return rangeIsFree(from, to, occupancyFor(entity, ownRecords, { resource: id })) ? t('pf_free') : t('pf_occupied');
  };
  const smallLookups = useMemo(() => {
    const shapes = (SHAPES as Record<string, Array<{ kind: string; field?: string }>>)[entity] ?? [];
    return new Set(shapes.filter(s => s.kind === 'choice' && s.field).map(s => s.field as string));
  }, [entity]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await loadPublicPagesConfig(slug);
      if (cancelled) return;
      const pg = cfg && slug ? cfg.pages[slug] : undefined;
      if (!cfg || !pg) {
        setStatus('unavailable');
        return;
      }
      setConfig(cfg);
      setPage(pg);
      setStatus('ready');

      // Option lists for applookup fields from their target apps (chained
      // read grant). Best-effort: a field whose list fails just renders empty.
      const refFields = pg.fields.filter(f => f.fulltype.includes('applookup') && f.target_app_id);
      if (refFields.length > 0) {
        setRefLoading(true);
        const loaded: Record<string, RefOption[]> = {};
        for (const f of refFields) {
          try {
            const records = await listPublicRecords(cfg, pg, { appId: f.target_app_id!, limit: 500 });
            loaded[f.key] = Object.entries(records).map(([id, rec]) => ({
              id: rec.id ?? id,
              label: (f.display_field ? displayPart(rec.fields[f.display_field]) : '') || id,
            }));
            // The summary and the success facts show names, not ids.
            for (const opt of loaded[f.key]) form.remember(opt.id, opt.label);
          } catch {
            loaded[f.key] = [];
          }
        }
        if (!cancelled) {
          setRefOptions(loaded);
          setRefLoading(false);
        }
      }

      // Occupancy for the range calendar — only when the agent's rule says the
      // entity has a stay, both fields are on this page AND the grant lists
      // the entity itself (the owner service adds that read, projected to the
      // stay dates, the resource and the status). A page without it shows a
      // calendar without blocked nights. Records stay raw; `occupancyFor`
      // derives the nights.
      const pair = occupancyRuleOf(pg.entity);
      if (pair && pg.fields.some(f => f.key === pair.from) && pg.fields.some(f => f.key === pair.to)) {
        try {
          const own = await listPublicRecords(cfg, pg, { appId: pg.app_id, limit: 500 });
          if (!cancelled) {
            setOwnRecords(Object.values(own).map(rec => ({ fields: (rec.fields ?? {}) as Record<string, unknown> })));
          }
        } catch {
          /* no list grant for the entity itself — calendar without occupancy */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // A submit that hit a closed page: show the unavailable panel instead of an error box.
  useEffect(() => {
    if (submit.error instanceof PageUnavailableError) setStatus('unavailable');
  }, [submit.error]);

  // Pre-solve the anti-abuse challenge on first interaction so submitting
  // feels instant. Fire-and-forget; submit re-solves if this one went stale.
  const handleFirstInteraction = () => {
    if (preparedRef.current || !config || !page) return;
    preparedRef.current = true;
    prepareChallenge(config, page, 'POST', `/apps/${page.app_id}/records`);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config || !page || submit.submitting) return;
    if (!form.validate()) return;
    await submit.run();
  };

  const resetForAnotherEntry = () => {
    submit.reset();
    form.reset();
    preparedRef.current = false;
  };

  const formError = (() => {
    const err = submit.error;
    if (!err || err instanceof PageUnavailableError) return null;
    if (err instanceof FieldValidationError) {
      // The client validates first, so this is the rare server-side catch —
      // it still says per field what to do (the agent's sentence), never
      // "Dieses Feld ist erforderlich: a, b".
      return err.missingFields.length > 0 && err.unallowedFields.length === 0
        ? err.missingFields.map(k => requiredMessage(entity, k)).join(' ')
        : t('pf_error_generic_text');
    }
    if (err instanceof RateLimitedError) return t('pf_rate_limit_text');
    return t('pf_error_generic_text');
  })();

  // Same chrome as PublicShell (bespoke pages) — keep the two in sync.
  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-background flex flex-col">
      {isPreviewMode() ? (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          <IconEye size={14} stroke={1.5} className="shrink-0" />
          <span>{t('ps_preview_banner')}</span>
        </div>
      ) : null}
      <main className="flex-1 w-full max-w-[640px] mx-auto px-4 py-8 sm:py-12">{children}</main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        {t('pf_powered_by_text')}
      </footer>
    </div>
  );

  if (status === 'loading') {
    return shell(
      <div className="flex justify-center pt-16">
        <IconLoader2 size={28} stroke={1.5} className="animate-spin text-muted-foreground" />
      </div>,
    );
  }

  if (status === 'unavailable' || !page || !config) {
    return shell(
      <div className="rounded-[27px] bg-card shadow-lg p-6 sm:p-8 text-center">
        <h1 className="text-xl font-medium mb-2">{t('pf_unavailable_title')}</h1>
        <p className="text-muted-foreground">{t('pf_unavailable_message')}</p>
      </div>,
    );
  }

  if (submit.result) {
    return shell(
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
        <div className="h-2 bg-primary" aria-hidden="true" />
        <div className="p-6 sm:p-8">
          <SuccessStep
            result={submit.result}
            title={page.thank_you_title}
            forms={[form]}
            whatHappensNext={page.thank_you_message}
            next={[{ label: t('pf_another_entry_text'), onClick: resetForAnotherEntry }]}
          />
        </div>
      </div>,
    );
  }

  const labelFor = (field: PublicFieldConfig) => fieldLabelByAppId(page.app_id, field.key) ?? field.label;
  const rendered = new Set<string>();

  return shell(
    <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
      <div className="h-2 bg-primary" aria-hidden="true" />
      <div className="p-6 sm:p-8">
      <header className="mb-6 pb-5 border-b border-border">
        <h1 className="text-2xl font-semibold">{page.title}</h1>
        {page.description ? <p className="text-base text-muted-foreground mt-1">{page.description}</p> : null}
      </header>
      <form
        className="space-y-5"
        onSubmit={handleSubmit}
        noValidate
      >
        <FieldErrorSummary forms={[form]} />
        {page.fields.map(field => {
          if (rendered.has(field.key)) return null;
          // The stay renders once, where its first field sits: the resource
          // pickers (room, vehicle) FIRST — each option says whether it is
          // free for the picked dates — then the calendar with that
          // resource's occupancy. Same derivation as the internal flow.
          if (range && (field.key === range.from || field.key === range.to || field.key === range.resource)) {
            rendered.add(range.from);
            rendered.add(range.to);
            if (range.resource) rendered.add(range.resource);
            const fromField = page.fields.find(f => f.key === range.from);
            const toField = page.fields.find(f => f.key === range.to);
            const resField = range.resource ? page.fields.find(f => f.key === range.resource) : undefined;
            const required = Boolean(fromField?.required || toField?.required);
            return (
              <div key={`${range.from}+${range.to}`} className="space-y-5" onFocusCapture={handleFirstInteraction}>
                {resField && range.resource && (
                  <div className="space-y-2">
                    <Label htmlFor={form.fieldId(range.resource)}>{labelFor(resField)} *</Label>
                    <FieldInput
                      field={resField}
                      appId={page.app_id}
                      form={form}
                      smallLookup={false}
                      refOptions={refOptions[range.resource]}
                      refLoading={refLoading}
                      optionHint={availabilityHint}
                    />
                    <FieldError form={form} fieldKey={range.resource} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor={form.fieldId(range.from)}>
                    {fromField ? labelFor(fromField) : range.from} / {toField ? labelFor(toField) : range.to}
                    {required ? ' *' : ''}
                  </Label>
                  {resourcePending && resField && (
                    <p className="text-sm text-muted-foreground" role="status">{t('pf_pick_resource_first', { resource: labelFor(resField) })}</p>
                  )}
                  <div id={form.fieldId(range.from)} tabIndex={-1} className="outline-none">
                    {/* Without a known resource the calendar is a range picker, not an availability claim. */}
                    <AvailabilityRangePicker {...form.range(range.from, range.to, { blocked })} legend={occupancyShown} />
                  </div>
                  <FieldError form={form} fieldKey={range.to} />
                </div>
              </div>
            );
          }
          rendered.add(field.key);
          return (
            <div key={field.key} className="space-y-2" onFocusCapture={handleFirstInteraction}>
              {field.fulltype !== 'bool' ? (
                <Label htmlFor={form.fieldId(field.key)}>
                  {labelFor(field)}
                  {field.required ? ' *' : ''}
                </Label>
              ) : null}
              <FieldInput
                field={field}
                appId={page.app_id}
                form={form}
                smallLookup={smallLookups.has(field.key)}
                refOptions={refOptions[field.key]}
                refLoading={refLoading && field.fulltype.includes('applookup')}
              />
              <FieldError form={form} fieldKey={field.key} />
            </div>
          );
        })}
        {formError ? (
          <p className="text-sm text-destructive" role="alert">{formError}</p>
        ) : null}
        <Button type="submit" className="w-full max-sm:h-11" disabled={submit.submitting}>
          {submit.submitting ? (
            <span className="inline-flex items-center gap-2">
              <IconLoader2 size={16} stroke={1.5} className="animate-spin" />
              {t('pf_submitting_text')}
            </span>
          ) : (
            t('pf_submit_text')
          )}
        </Button>
      </form>
      </div>
    </div>,
  );
}
