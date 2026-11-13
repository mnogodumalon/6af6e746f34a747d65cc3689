#!/usr/bin/env node
// Gate: intent flows must be reachable and findable.
//
// A flow page is three things at once, and all three have to agree:
//   1. the component in src/pages/intents/<Name>.tsx
//   2. a route in App.tsx (<custom:routes>) so the URL resolves
//   3. an entry in src/config/intents.ts (<custom:intents>) so it appears
//      in the sidebar
// Live-proven: a build shipped a complete 35 KB wizard, routed correctly, but
// with an empty registry — the flow existed and was simply invisible to the
// owner. Nothing failed, nothing warned.
//
// The docblock is checked too: app/services/intent_context.py derives
// _agent_context/intents.json from it, which is how a LATER agent run finds a
// flow worth reusing. Without it a flow is invisible to future runs as well.
//
// And the UTC day-shift trap is checked here as well, because nothing else
// can: the same rule is gate 1 of check-dashboard.mjs, but that script reads
// ONE file (src/pages/DashboardOverview.tsx). A flow step that writes a date
// field with toISOString() was therefore outside every gate — even a run that
// executes all of them.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = 'src/pages/intents';
const REGISTRY = 'src/config/intents.ts';
const APP = 'src/App.tsx';

const errors = [];
const warnings = [];

// App metadata for type-aware field checks (present in every sandbox).
let appMeta = null;
try {
  appMeta = JSON.parse(readFileSync('app_metadata.json', 'utf8'));
} catch {
  // metadata missing (e.g. local runs) — type checks are skipped
}

// --file <path>: a lane's pre-flight over ONE staged page (check-staging.mjs).
// Page rules only — App.tsx, the registry and INTENTS_PENDING are wired later
// by the integration band and cannot be judged from staging.
const fileArgAt = process.argv.indexOf('--file');
const fileArg = fileArgAt >= 0 ? process.argv[fileArgAt + 1] : null;
const pageOnly = fileArg !== null;
if (pageOnly && !existsSync(fileArg)) {
  console.error(`ERROR: ${fileArg} does not exist`);
  process.exit(1);
}

const pages = pageOnly
  ? [basename(fileArg).replace(/\.tsx$/, '')]
  : existsSync(DIR)
    ? readdirSync(DIR).filter(f => /\.tsx$/.test(f)).map(f => f.replace(/\.tsx$/, ''))
    : [];
const pageFile = name => (pageOnly ? fileArg : join(DIR, `${name}.tsx`));

// No flows at all is a legitimate state (phase 2 may build none).
if (pages.length > 0) {
  const registrySrc = existsSync(REGISTRY) ? readFileSync(REGISTRY, 'utf8') : '';
  const appSrc = existsSync(APP) ? readFileSync(APP, 'utf8') : '';

  // Registry paths live inside the <custom:intents> marker; read only that
  // block so the doc comment's example entry above it is not counted.
  const block = /\/\/ <custom:intents>([\s\S]*?)\/\/ <\/custom:intents>/.exec(registrySrc);
  const registryBody = block ? block[1] : '';
  const registryPaths = new Set(
    [...registryBody.matchAll(/path:\s*['"]([^'"]+)['"]/g)].map(m => m[1]),
  );

  // Routes: <Route path="intents/…"> — App.tsx writes them without a leading
  // slash because they are nested; the registry stores the absolute path.
  const routePaths = new Set(
    [...appSrc.matchAll(/<Route\s+path=["'](intents\/[^"']+)["']/g)].map(m => `/${m[1]}`),
  );

  for (const name of pages) {
    const file = pageFile(name);
    const src = readFileSync(file, 'utf8');

    // fieldText is the DISPLAY text („12.10.2026, 11:00“); new Date()/parseISO
    // read it month-first — salon 05.10.2026 showed Monday 12 Oct as
    // „Donnerstag, 10.12.2026“. Anything computed or formatted from a date
    // reads fieldDate (ISO).
    {
      const textVars = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*fieldText\(/g)].map(m => m[1]);
      const direct = /(?:new Date|parseISO)\(\s*fieldText\(/.test(src);
      const viaVar = textVars.some(v => new RegExp(`(?:new Date|parseISO)\\(\\s*${v}\\b`).test(src));
      if (direct || viaVar) {
        errors.push(`${file}: a fieldText(...) value goes into new Date()/parseISO — fieldText is the DISPLAY text ('12.10.2026, 11:00'), which Date reads month-first (12 Oct became 10 Dec, live). Use fieldDate(r, key) — the ISO value — for anything computed or formatted from a date`);
      }
    }

    // 1. Imported and routed? (not from staging — the band wires later)
    if (!pageOnly && !appSrc.includes(`@/pages/intents/${name}`)) {
      errors.push(`${APP}: no import for '${name}' — add it inside <custom:imports> and route it in <custom:routes>`);
    }

    // 2. Docblock (purpose + steps + reads/writes) at the very top.
    if (!/^\s*\/\*\*/.test(src)) {
      errors.push(`${file}: missing the leading /** … */ docblock (purpose, Steps, Reads, Writes, Composes) — later agent runs find reusable flows through it`);
    }

    // 3. Generic dialogs belong on the CRUD pages, not in a wizard step.
    const dialogImport = /import\s[^;]*?from\s+['"]@\/components\/dialogs\/([^'"]+)['"]/.exec(src);
    if (dialogImport) {
      errors.push(`${file}: imports the generic dialog '${dialogImport[1]}' — a wizard step uses its own small form (the generic dialogs stay on the CRUD pages)`);
    }

    // 3b. The journey layer. Types can force HOW SummaryStep/SuccessStep are
    //     used (forms+submit, result) but not THAT they are rendered — a flow
    //     that skips the review step or hand-rolls its success screen compiles
    //     fine and ships below the floor. So this is a presence check.
    // A generated flow hook (`use<Pascal>Flow` from @/lib/journey/flows/…) IS the
    //     plan runner: it owns useStepForm/useRecordSearch/useJourneySubmit, the
    //     page only composes. With a hook the page must NOT reach for the raw
    //     plumbing — that is the whole point: a page that only calls flow.submit
    //     cannot write a field the plan does not know.
    const hookImport = /import\s*\{[^}]*\buse([A-Z]\w*)Flow\b[^}]*\}\s*from\s*['"]@\/lib\/journey\/flows\/(\w+)['"]/.exec(src);
    const usesFlowHook = !!hookImport && new RegExp(`\\buse${hookImport[1]}Flow\\s*\\(`).test(src);
    if (usesFlowHook) {
      const raw = [];
      if (/\buseStepForm\s*\(/.test(src)) raw.push('useStepForm');
      if (/\buseJourneySubmit\s*\(/.test(src)) raw.push('useJourneySubmit');
      if (/\buseRecordSearch\s*\(/.test(src)) raw.push('useRecordSearch');
      if (/from\s*['"]@\/services\/journeyPort['"]/.test(src)) raw.push('servicePort');
      if (raw.length) {
        errors.push(`${file}: uses the flow hook use${hookImport[1]}Flow AND the raw plumbing (${raw.join(', ')}) — the hook owns the form(s), the record searches and the submit plan; compose with flow.forms.<key>, flow.picks.<field>.select + flow.pick()/flow.pickMany(), flow.validateStep(n), flow.submit; availability or a count through the hook's door: useOccupancy(flow.port, entity, { resource }), useRecordCount(flow.port, …). Remove the raw calls.`);
      }
    }
    if (!/useJourneySubmit\s*\(/.test(src) && !usesFlowHook) {
      errors.push(`${file}: no useJourneySubmit(...) and no flow hook — every flow writes through the plan runner (with a plan: the generated hook use<Pascal>Flow under @/lib/journey/flows; without: import { useJourneySubmit } from '@/lib/journey'; const submit = useJourneySubmit(servicePort, [{ key, entity, form, primary: true }], { draftKey }))`);
    }
    if (!/<SummaryStep[\s/>]/.test(src)) {
      errors.push(`${file}: no <SummaryStep> — render <SummaryStep forms={[…]} submit={submit} whatHappensNext="…" /> as the review step before the write`);
    }
    if (!/<SuccessStep[\s/>]/.test(src)) {
      errors.push(`${file}: no <SuccessStep> — render {submit.result && <SuccessStep result={submit.result} next={[…]} />} instead of a hand-written success screen`);
    }

    // 3c. A delete inside a flow is reversible (undoToast), never a confirm
    //     dialog — the same rule check-dashboard enforces for drag/status
    //     writes on the overview. Checked on the CALL, not on a word.
    if (/LivingAppsService\.delete\w*\s*\(/.test(src) && !src.includes('undoToast(')) {
      errors.push(`${file}: LivingAppsService.delete…(…) without undoToast(…) — a removal in a flow executes immediately and offers Rückgängig (undoToast from '@/lib/polish'), it does not ask for confirmation`);
    }

    // 3d. The start screen's description is ONE short sentence. The steps
    //     are listed right below it, so an enumeration ("… — Gast zuordnen,
    //     Zimmer wählen, Zeitraum prüfen.") doubles them (live-seen). The
    //     skill asks for ≤90 chars; the gate fails only a paragraph (>140) —
    //     a 105-char sentence cost a full repair round live and read fine.
    const introDesc = src.match(/intro=\{\{[\s\S]*?description:\s*(?:\w+\()?\s*(['"`])([\s\S]*?)\1/);
    if (introDesc) {
      const text = introDesc[2];
      const enumerates = /\s[—–-]\s[^,]*,/.test(text) || /:\s[^,]*,[^,]*,/.test(text);
      if (text.length > 140 || enumerates) {
        errors.push(`${file}: intro.description is ${text.length} chars${enumerates ? ' and enumerates the steps' : ''} — one short sentence (aim for 90, hard limit 140) saying what the flow achieves; the steps are listed right below it, never repeat them. Now: "${text.slice(0, 70)}"`);
      }
    }

    // 3f. The review step comes BEFORE the write. A live page rendered
    //     <SummaryStep> only while `submit.done` was true and put a StepNav
    //     "Weiter" on the last step instead — wizard.next() went nowhere, the
    //     record was never written and the button did nothing.
    for (const m of src.matchAll(/<SummaryStep\b/g)) {
      const guard = src.slice(Math.max(0, m.index - 260), m.index);
      const afterWrite = /(?<![!\w.])\w+\.(?:done|result)\s*&&/.exec(guard);
      if (afterWrite) {
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: <SummaryStep> is rendered only after the write (guarded by '${afterWrite[0].trim()}') — the review comes BEFORE it: {step === N && !submit.result && <SummaryStep forms={[f]} submit={submit} />}; its confirm button runs the plan, a StepNav "Weiter" on the last step calls nothing`);
      }
    }

    // 3g. A date is a form value, not a pixel. A native <input type="date"
    //     defaultValue={today}> LOOKS filled while useStepForm holds nothing —
    //     validation said "Ausgabedatum fehlt" over a visibly filled field, and
    //     re-picking the shown day fires no change event (live). Dates render
    //     through <DatePicker {...f.date('key')} />; initial values belong in
    //     useStepForm(entity, { initial: { key: todayIso() } }).
    for (const m of src.matchAll(/type\s*=\s*["'](date|datetime-local|time)["']/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${file}:${line}: native <input type="${m[1]}"> — use <DatePicker {...f.date('key')} /> from '@/components/DatePicker' (the form owns the value); a native date input with a default shows a day the form never has`);
    }
    for (const m of src.matchAll(/\bdefaultValue\s*=/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${file}:${line}: defaultValue on an input — initial values belong to the form: useStepForm(entity, { initial: { key: value } }) (dates: todayIso() from '@/lib/journey'); an uncontrolled default is never submitted and fails validation`);
    }

    // 3u. A hand-rolled stepper. A page that keeps its own step state and moves
    //     between steps with its own buttons passes tsc and every gate here, but
    //     nothing the layer provides works for it: no URL step, no draft resume,
    //     no "needs" back-link, no focus management — and the render-smoke has
    //     no "Weiter" to press, so the walk stops at step 1 (live: a five-step
    //     membership form rebuilt the stepper in 480 lines). The shell IS the
    //     stepper: IntentWizardShell + StepNav, the page only owns `step`.
    {
      const ownsSteps = /\bsetStep\s*\(|\[\s*step\s*,\s*setStep\s*\]|useState\(\s*STEP_/.test(src);
      const onTheLayer = /<SummaryStep\b|useJourneySubmit\(|\buse[A-Z]\w*Flow\(/.test(src);
      if (ownsSteps && onTheLayer && !/IntentWizardShell/.test(src)) {
        errors.push(`${file}: a hand-rolled stepper (own step state and buttons) without IntentWizardShell — wrap the steps in <IntentWizardShell steps={STEPS} currentStep={step} onStepChange={setStep} forms={[…]}> and move between them with <StepNav onNext={…} /> (both under @/components/blocks); the shell owns URL step, draft resume, focus and the buttons the render-smoke presses`);
      }
    }
    // 3h. Every bound control sits under a label. The bindings carry id, value,
    //     aria-* — not the label; a step with five bare inputs shipped (live).
    //     <Field form={f} name="key"> renders label, hint and error from the
    //     entity's rules; a hand-written <Label htmlFor={f.fieldId('key')}> also counts.
    {
      const bound = new Set();
      for (const m of src.matchAll(/\.(?:field|number|date|choice|checkbox|record|records)\(\s*['"]([\w]+)['"]/g)) bound.add(m[1]);
      for (const key of bound) {
        const wrapped = new RegExp(`<(?:Field|Bound)\\b[^>]*\\bname=["']${key}["']`).test(src);
        const labelled = new RegExp(`htmlFor=\\{[^}]*fieldId\\(\\s*['"]${key}['"]`).test(src);
        if (!wrapped && !labelled) {
          errors.push(`${file}: the control bound with f.…('${key}') has no label — use <Bound form={f} name="${key}" /> (label, control, hint and error in one; from '@/components/blocks/Bound') or wrap your own control: <Field form={f} name="${key}">…</Field>`);
        }
      }
      // A <Field> whose only child is a <Bound> of the same key is redundant —
      // the layer renders one label either way (Bound sees the enclosing Field).
      for (const m of src.matchAll(/<Field\b([^>]*)>\s*<Bound\b([^>]*)\/>\s*<\/Field>/g)) {
        const outer = (/\bname=["'](\w+)["']/.exec(m[1]) || [])[1];
        const inner = (/\bname=["'](\w+)["']/.exec(m[2]) || [])[1];
        if (outer && outer === inner) {
          const line = src.slice(0, m.index).split('\n').length;
          warnings.push(`${file}:${line}: <Field name="${outer}"> around <Bound name="${outer}"> — Bound already renders label, hint and error; drop the Field (keep its label= or hint= on the Bound)`);
        }
      }
    }

    // 3m. <Bound> picks the control from the field's rule — it has no records
    //     to offer. An applookup, a file or a geo field behind it renders a bare
    //     text input for a record URL; the pick step (EntitySelectStep +
    //     useRecordSearch) or an explicit Combobox is the way.
    if (appMeta) {
      const formEntity = new Map();
      for (const m of src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useStepForm\(\s*['"](\w+)['"]/g)) formEntity.set(m[1], m[2]);
      for (const m of src.matchAll(/<Bound\b([^>]*)>/g)) {
        const formVar = (/\bform=\{(\w+)\}/.exec(m[1]) || [])[1];
        const key = (/\bname=["'](\w+)["']/.exec(m[1]) || [])[1];
        const entity = formVar ? formEntity.get(formVar) : undefined;
        const ft = entity && key ? appMeta.apps?.[entity]?.controls?.[key]?.fulltype : undefined;
        if (ft && /applookup|^file|^geo/.test(ft)) {
          errors.push(`${file}: <Bound name="${key}"> on a ${ft} field — Bound has no records to offer; pick '${key}' on its own step (EntitySelectStep fed by useRecordSearch) or render <Field form={${formVar}} name="${key}"><Combobox {...${formVar}.record('${key}')} items={…} /></Field>`);
        }
      }
    }

    // 3n. Lookup values are `{ key, label }` on BOTH doors (the public port
    //     hydrates the grant's bare keys), a multiplelookup an ARRAY of them. A
    //     live landing page cast `ausstattung as string[]` and handed React the
    //     objects as children — React #31 for every visitor, green through tsc.
    if (appMeta) {
      const lookupKinds = new Map();
      for (const app of Object.values(appMeta.apps || {})) {
        for (const [k, c] of Object.entries(app?.controls || {})) {
          const ft = c?.fulltype || '';
          if (ft.startsWith('lookup') || ft.startsWith('multiplelookup')) lookupKinds.set(k, ft);
        }
      }
      const CAST_RE = /\.fields(?:\.(\w+)|\[['"](\w+)['"]\])\s+as\s+(?:string(?:\s*\[\s*\])?|Array<string>)/g;
      for (const m of src.matchAll(CAST_RE)) {
        const key = m[1] || m[2];
        const ft = lookupKinds.get(key);
        if (!ft) continue;
        const line = src.slice(0, m.index).split('\n').length;
        const multi = ft.startsWith('multiple');
        const helper = multi ? `fieldLookups(r, '${key}')` : `fieldLookup(r, '${key}')`;
        errors.push(`${file}:${line}: \`fields.${key} as string${multi ? '[]' : ''}\` — '${key}' is a ${ft} field: the port delivers { key, label }${multi ? ' as an array' : ''} on both doors, and a string cast renders the object as a React child (React #31, live). Read it with ${helper} from '@/lib/journey', compare .key, show .label`);
      }
    }

    // 3o. <WizardStep> children are the step list — the shell renders the
    //     current one by position. Wrapping them in `{step === n && …}` leaves
    //     the shell with ONE child from step 2 on, nodes[n-1] is undefined and
    //     the visitor sees a heading without fields or "Weiter" (live, public
    //     page, green through every gate). Either all <WizardStep> children
    //     unconditionally, or `steps={…}` with plain `{step === n && <>…</>}`.
    {
      const COND_STEP_RE = /\{\s*(?:step|currentStep|activeStep)\s*===\s*(\d+)\s*&&[^<]{0,120}<WizardStep\b/g;
      for (const m of src.matchAll(COND_STEP_RE)) {
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: <WizardStep> rendered conditionally (step === ${m[1]} && …) — the shell shows the current step itself and selects children by position; a conditional child leaves every later step empty (live: only the heading, no fields, no "Weiter"). Render all <WizardStep> children unconditionally, or drop WizardStep and keep the branches with a steps={…} prop`);
      }
    }
    // 3p. A raw <input> has no styling in this scaffold — a live page's fields
    //     were invisible (className="input" is not a Tailwind class). Bound
    //     controls render through <Input> from '@/components/ui/input' (spread
    //     f.field('key')) or through <Bound>.
    {
      const RAW_INPUT_RE = /<input\b(?![^>]*type=["']hidden["'])/g;
      for (const m of src.matchAll(RAW_INPUT_RE)) {
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: raw <input> — unstyled in this scaffold (a live page's fields were invisible). Use <Input {...f.field('key')} /> from '@/components/ui/input' inside <Field>, or <Bound form={f} name="key" />`);
      }
    }

    // 3q. `initial: { status: 'x' }` on a lookup field must name one of the
    //     field's options — the one the owner asked for. Live pages set the
    //     first option (`aktiv`, `angenommen`) where the prompt said
    //     "Interessent" / "Anfrage".
    if (appMeta) {
      const SF_INIT_RE = /useStepForm\(\s*['"](\w+)['"]\s*,\s*\{[\s\S]*?\binitial\s*:\s*\{([^}]*)\}/g;
      for (const m of src.matchAll(SF_INIT_RE)) {
        const controls = appMeta.apps?.[m[1]]?.controls || {};
        for (const kv of m[2].matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)) {
          const c = controls[kv[1]];
          const options = c?.lookup_data && typeof c.lookup_data === 'object' ? Object.keys(c.lookup_data) : null;
          if (options && !options.includes(kv[2])) {
            const line = src.slice(0, m.index).split('\n').length;
            errors.push(`${file}:${line}: initial ${m[1]}.${kv[1]} = '${kv[2]}' is not an option of that field — valid keys: ${options.join(', ')}. Take the option the owner named (match its label); if none matches, leave the initial value out — never the first option`);
          }
        }
      }
    }

    // 3i. The page may only render steps it declares. A live flow declared
    //     three steps and rendered its review as step 4: the indicator said
    //     "3 von 3", wizard.next() had nowhere to go, the last "Weiter" was dead.
    {
      const stepsLiteral = /steps=\{\s*\[([\s\S]*?)\]\s*\}/.exec(src) || /const\s+\w+(?:\s*:\s*WizardStep\[\])?\s*=\s*\[([\s\S]*?\blabel\b[\s\S]*?)\];/.exec(src);
      if (stepsLiteral) {
        const declared = (stepsLiteral[1].match(/\blabel\s*:/g) || []).length;
        let rendered = 0;
        for (const m of src.matchAll(/\b(?:step|currentStep|activeStep)\s*===\s*(\d+)/g)) rendered = Math.max(rendered, Number(m[1]));
        if (declared > 0 && rendered > declared) {
          errors.push(`${file}: renders step ${rendered} but declares only ${declared} step(s) in \`steps\` — add the missing step(s) (e.g. { label: 'Prüfen' }); the indicator, "Schritt n von m" and wizard.next() follow the array, so an undeclared step is unreachable`);
        }
      }
    }


    // 3j. useRecordSearch searches STRING fields only — the vSQL filter wraps
    //     each field in `str(...).lower()`, so a lookup, date or number field
    //     matches its raw storage form and effectively never hits. A typo names
    //     a field the entity does not have, which silently searches nothing.
    {
      const RS_RE = /useRecordSearch\(\s*\w+\s*,\s*['"]([\w]+)['"]\s*,\s*\{[\s\S]*?searchFields\s*:\s*\[([^\]]*)\]/g;
      for (const m of src.matchAll(RS_RE)) {
        const entity = m[1];
        const fields = [...m[2].matchAll(/['"]([\w]+)['"]/g)].map(x => x[1]);
        const controls = appMeta?.apps?.[entity]?.controls;
        if (appMeta && !controls) {
          errors.push(`${file}: useRecordSearch names unknown entity '${entity}' — use the identifier from app_metadata.json`);
          continue;
        }
        // The repair agent once "fixed" an unknown field by picking the two
        // applookups of a link entity — plausible names, dead search. Name the
        // fields that WOULD work, so the first fix is the right one.
        const stringFields = controls ? Object.keys(controls).filter(k => (controls[k]?.fulltype || '').startsWith('string')) : [];
        const stringHint = controls ? ` — string fields of '${entity}': ${stringFields.length ? stringFields.join(', ') : "(none)"}` : '';
        if (fields.length === 0) {
          // Legitimate for a LINK entity that has no text of its own (a
          // Zuweisung: two applookups and dates) — the layer then loads the
          // whole (filtered) set and searches the cards client-side. Wrong for
          // a big text entity, hence a warning, not an error (live 02.09.2026:
          // the error sent a correct page into a 170 s repair loop).
          warnings.push(`${file}: useRecordSearch('${entity}') has an empty searchFields — the step loads the whole (filtered) set and searches the cards client-side; fine for a link entity with a filter, add 1–4 string fields for an entity people search by text`);
        }
        for (const f of fields) {
          const ft = controls?.[f]?.fulltype;
          if (controls && !ft) {
            errors.push(`${file}: useRecordSearch('${entity}') searchFields names '${f}', which '${entity}' does not have${stringHint}`);
          } else if (ft && ft.includes('applookup')) {
            errors.push(`${file}: useRecordSearch('${entity}') searchFields '${f}' is ${ft} — a LINK never matches typed text (vSQL sees the record URL, not the name). Users search the linked record's NAME: give that record its own pick step (useRecordSearch on the target entity) and keep '${entity}' filtered by the picked id${stringHint}`);
          } else if (ft && !ft.startsWith('string')) {
            errors.push(`${file}: useRecordSearch('${entity}') searchFields '${f}' is ${ft} — only string fields are searchable (text, email, tel, textarea)${stringHint}`);
          }
        }
      }
    }

    // 3l. A `filter` is vSQL — wherever it appears (useRecordSearch options,
    //     port.list/count). The traps check-public knows from public scopes:
    //     fields are r.v_<field>, the record id is r.id (NOT r.record_id — the
    //     REST field name is an unknown vSQL name: live 400 on Eichprotokoll),
    //     booleans are True/False, a DATE field compares with today() or
    //     @(YYYY-MM-DD), a DATETIME field with now() — the other way round is a
    //     400 (VSQLSubnodeTypesError), a quoted string against a date matches
    //     nothing or fails (all probed live 03.09.2026). And a filter
    //     for ONE id is a smell: the record the user just picked is
    //     x.recordOf(id) with no request; any other record is port.get().
    for (const m of src.matchAll(/\bfilter\s*:\s*(['"`])([\s\S]*?)\1/g)) {
      const expr = m[2];
      if (!expr.trim()) continue;
      // Only the journey calls — a CSS `filter: 'blur(4px)'` in a style object is not ours.
      const before = src.slice(Math.max(0, m.index - 600), m.index);
      const call = Math.max(before.lastIndexOf('useRecordSearch('), before.lastIndexOf('.list('), before.lastIndexOf('.count('));
      const style = before.lastIndexOf('style=');
      if (call < 0 || style > call) continue;
      const line = src.slice(0, m.index).split('\n').length;
      if (/\br\.record_id\b/.test(expr)) {
        errors.push(`${file}:${line}: filter '${expr}' uses r.record_id — vSQL has no such name (400 at runtime); the record id is r.id. For the record just picked use x.recordOf(id) (no request), for any other servicePort.get(entity, id)`);
      } else if (/\br\.id\s*==/.test(expr)) {
        errors.push(`${file}:${line}: filter '${expr}' lists ONE record by id — the layer has this: x.recordOf(id) for the record just picked (already loaded), servicePort.get(entity, id) for a linked record (fieldRef)`);
      } else if (!/r\.v_\w+|r\.createdat|r\.updatedat|r\.id\b/.test(expr)) {
        errors.push(`${file}:${line}: filter '${expr}' is not vSQL — fields are ALWAYS r.v_<field> (e.g. "r.v_status == 'verfuegbar'"), never bare`);
      }
      if (/\b(true|false)\b/.test(expr)) {
        errors.push(`${file}:${line}: filter uses lowercase true/false — vSQL booleans are True/False`);
      }
      if (/\btoday\b(?!\s*\()/.test(expr)) {
        errors.push(`${file}:${line}: filter uses a bare 'today' — vSQL's calendar day is the function today() (date fields), the current time now() (datetime fields)`);
      }
      // With the metadata at hand the date/time comparison is checked by FIELD KIND.
      const entM = [...before.matchAll(/(?:useRecordSearch\(\s*\w+\s*,|\.(?:list|count)\()\s*['"](\w+)['"]/g)].pop();
      const ctrls = entM && appMeta ? appMeta.apps?.[entM[1]]?.controls : undefined;
      if (ctrls) {
        for (const fm of expr.matchAll(/\br\.v_(\w+)\s*(?:==|!=|>=|<=|>|<)\s*([^\s)]+)/g)) {
          const ft = ctrls[fm[1]]?.fulltype ?? '';
          const rhs = fm[2];
          if (/^date\/date$|^date$/.test(ft) && /^now\(/.test(rhs)) {
            errors.push(`${file}:${line}: filter compares the DATE field r.v_${fm[1]} with now() — a date takes today() (or today() - days(n), @(YYYY-MM-DD)); now() is a 400 VSQLSubnodeTypesError`);
          }
          if (/^date\/datetime/.test(ft) && /^today\(/.test(rhs)) {
            errors.push(`${file}:${line}: filter compares the DATETIME field r.v_${fm[1]} with today() — a datetime takes now() (or now() - days(n)); today() is a 400`);
          }
          if (/^date/.test(ft) && /^['"]/.test(rhs)) {
            errors.push(`${file}:${line}: filter compares the date field r.v_${fm[1]} with a quoted string — vSQL date literals are @(YYYY-MM-DD) (a string matches nothing with == and is a 400 with >=)`);
          }
        }
      }
      if (/[=!]==|&&|\|\||\bnull\b/.test(expr)) {
        errors.push(`${file}:${line}: filter looks like JavaScript — vSQL uses ==, and/or/not, is None`);
      }
    }

    // 3p. A useRecordSearch `filter` needs its TypeScript twin `where`. vSQL is
    //     a dialect no model has learned; `where` is the same rule in the
    //     language tsc checks. check-vsql runs both over the real records and
    //     fails the page when they disagree (a date as a string is valid vSQL
    //     that matches nothing), and the hook falls back to `where` at runtime
    //     should the server ever reject the filter.
    for (const call of src.matchAll(/useRecordSearch\(/g)) {
      const open = src.indexOf('{', call.index);
      if (open < 0) continue;
      let depth = 0, end = -1;
      for (let k = open; k < src.length && k < open + 4000; k++) {
        if (src[k] === '{') depth++;
        else if (src[k] === '}' && --depth === 0) { end = k; break; }
      }
      if (end < 0) continue;
      const opts = src.slice(open, end + 1);
      if (/\bfilter\s*:/.test(opts) && !/\bwhere\s*:/.test(opts)) {
        const line = src.slice(0, call.index).split('\n').length;
        errors.push(`${file}:${line}: useRecordSearch has a filter but no where twin — say the same rule in TypeScript: where: r => fieldLookup(r, 'status')?.key === 'verfuegbar' (check-vsql compares both on real records; the hook uses where when the server rejects the filter)`);
      }
    }

    // 3u-b. A value an effect derives goes in with prefill(), never set() — set()
    //       runs again after a reload and writes over the restored draft (J-11,
    //       Abnahme 6: the edited AI prompt lost its introduction on reload).
    for (const eff of src.matchAll(/\buseEffect\(\s*\(\)\s*=>\s*\{/g)) {
      let depth = 1, k = eff.index + eff[0].length;
      for (; k < src.length && depth > 0; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; }
      const body = src.slice(eff.index, k);
      for (const m of body.matchAll(/\b(\w+)\.set\(\s*['"](\w+)['"]/g)) {
        if (m[1] === 'params' || m[1] === 'searchParams' || m[1] === 'url') continue;
        const line = src.slice(0, eff.index + m.index).split('\n').length;
        warnings.push(`${file}:${line}: ${m[1]}.set('${m[2]}', …) inside a useEffect — a derived starting value goes in with ${m[1]}.prefill('${m[2]}', …): it writes only an empty field or its own last prefill, never over what the person typed or a draft restored after a reload`);
      }
    }

    // 3t. <Field> renders the field's label itself. A heading with the same
    //     text right above it doubles the label (live: "Zusatzleistungen" twice
    //     in a booking step). Compared against the entity's real label.
    if (appMeta) {
      const formEntities = {};
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useStepForm\(\s*['"]([\w-]+)['"]/g)) formEntities[m[1]] = m[2];
      for (const m of src.matchAll(/<Field\b([^>]*)>/g)) {
        const formVar = (/\bform=\{(\w+)\}/.exec(m[1]) || [])[1];
        const name = (/\bname=["'](\w+)["']/.exec(m[1]) || [])[1];
        const entity = formVar && formEntities[formVar];
        const label = entity && name ? appMeta.apps?.[entity]?.controls?.[name]?.label : undefined;
        if (!label) continue;
        const before = src.slice(Math.max(0, m.index - 400), m.index);
        const esc = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`tx\\(\\s*['"\`]${esc}['"\`]\\s*\\)`, 'i').test(before)) {
          const line = src.slice(0, m.index).split('\n').length;
          warnings.push(`${file}:${line}: a heading "${label}" right above <Field name="${name}"> — the Field renders that label itself, the user reads it twice; drop the heading (an "optional" note belongs into the Field's hint)`);
        }
      }
    }

    // 3v. A record pick stored without its name: `f.set('<applookup key>', id)`
    //     with no label. The review and the success screen then show the id
    //     (live: "Zusatzleistungen 6a9ae0fdd32995434b7edfb2" — a hand-rolled
    //     pill pick over useDashboardData, so 3k/3o never saw it). Clearing
    //     (null/[]) is fine. Checked by field kind from the metadata.
    if (appMeta) {
      const formEntities3v = {};
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useStepForm\(\s*['"]([\w-]+)['"]/g)) formEntities3v[m[1]] = m[2];
      for (const m of src.matchAll(/\b(\w+)\.set\(\s*['"](\w+)['"]\s*,/g)) {
        const entity = formEntities3v[m[1]];
        const ft = entity ? appMeta.apps?.[entity]?.controls?.[m[2]]?.fulltype : undefined;
        if (!ft || !ft.includes('applookup')) continue;
        // Split the call's arguments at depth 0.
        let depth = 1, i = m.index + m[0].length, argStart = i;
        const args = [];
        for (; i < src.length && depth > 0; i++) {
          const c = src[i];
          if (c === '(' || c === '[' || c === '{') depth++;
          else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) break; }
          else if (c === ',' && depth === 1) { args.push(src.slice(argStart, i).trim()); argStart = i + 1; }
        }
        args.push(src.slice(argStart, i).trim());
        const value = args[0] || '';
        if (args.length >= 2 && args[1]) continue;
        if (/^(null|undefined|\[\s*\])$/.test(value)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: ${m[1]}.set('${m[2]}', …) stores a record pick without its name — the review and the success screen show the id. Bind the pick to the form: <EntitySelectStep {...x.select} {...${m[1]}.records('${m[2]}', x.labelOf)} /> (multi) or ${m[1]}.set('${m[2]}', id, x.labelOf(id)) (single) — the name comes from the useRecordSearch that feeds the step, never from a useDashboardData array`);
      }
    }

    // 3w. Field readers inside a useRecordSearch mapper name fields the entity
    //     does not have. Live: `fieldText(b, 'gastName')` on every booking card
    //     — `<key>Name` exists only on the dashboard's ENRICHED records, never
    //     on a JourneyRecord — so every guest was "Unbekannter Gast". The
    //     referenced record's name is `ctx.ref('gast')` (toItem's 2nd argument).
    if (appMeta) {
      for (const call of src.matchAll(/useRecordSearch\(\s*\w+\s*,\s*['"]([\w-]+)['"]/g)) {
        const entity = call[1];
        const controls = appMeta.apps?.[entity]?.controls;
        if (!controls) continue;
        const open = src.indexOf('{', call.index + call[0].length);
        if (open < 0) continue;
        let depth = 0, end = -1;
        for (let k = open; k < src.length && k < open + 6000; k++) {
          if (src[k] === '{') depth++;
          else if (src[k] === '}' && --depth === 0) { end = k; break; }
        }
        if (end < 0) continue;
        const opts = src.slice(open, end + 1);
        const seenKeys = new Set();
        for (const m of opts.matchAll(/\bfield(?:Text|Lookup|Number|Date|Ref)\(\s*\w+\s*,\s*['"](\w+)['"]\s*\)|\.fields(?:\[['"](\w+)['"]\]|\.(\w+))/g)) {
          const key = m[1] || m[2] || m[3];
          if (!key || controls[key] || seenKeys.has(key)) continue;
          seenKeys.add(key);
          const stem = key.replace(/Name$/, '');
          const isRefName = stem !== key && controls[stem] && String(controls[stem].fulltype || '').includes('applookup');
          const line = src.slice(0, open + m.index).split('\n').length;
          errors.push(`${file}:${line}: '${key}' is not a field of '${entity}' (fields: ${Object.keys(controls).join(', ')})` + (isRefName
            ? ` — the name of the referenced ${stem} is ctx.ref('${stem}') in toItem: (r, ctx) => ({ title: ctx.ref('${stem}') ?? tx('…') }); <key>Name fields exist only on the dashboard's enriched records, never on a JourneyRecord`
            : ''));
        }
      }
    }

    // 3x. "Optional" next to a required mark. A field the app requires shows
    //     `*` and blocks the review while empty — a hint saying "Optional" on
    //     it (live: Estimated hours) contradicts both. The flow may well treat
    //     the field as optional: then say so where it counts,
    //     `useStepForm(entity, { required: { key: false } })`, and the mark,
    //     the validation and the review follow. Never a hint.
    if (appMeta) {
      const formOpts3x = {};
      for (const m of src.matchAll(/const\s+(\w+)\s*=\s*useStepForm\(\s*['"]([\w-]+)['"]/g)) {
        const open = src.indexOf('{', m.index + m[0].length);
        let depth = 0, end = -1;
        if (open > 0 && open < src.indexOf(';', m.index)) {
          for (let k = open; k < src.length && k < open + 4000; k++) {
            if (src[k] === '{') depth++;
            else if (src[k] === '}' && --depth === 0) { end = k; break; }
          }
        }
        formOpts3x[m[1]] = { entity: m[2], opts: end > 0 ? src.slice(open, end + 1) : '' };
      }
      for (const m of src.matchAll(/<(?:Field|Bound)\b([^>]*)>/g)) {
        const props = m[1];
        if (!/\b(?:hint|placeholder)=\{?\s*(?:tx\()?\s*['"`][^'"`]*optional[^'"`]*['"`]/i.test(props)) continue;
        const formVar = (/\bform=\{(\w+)\}/.exec(props) || [])[1];
        const name = (/\bname=["'](\w+)["']/.exec(props) || [])[1];
        const form = formVar && formOpts3x[formVar];
        if (!form || !name) continue;
        const control = appMeta.apps?.[form.entity]?.controls?.[name];
        if (!control?.required) continue;
        if (new RegExp(`\\brequired\\s*:\\s*\\{[^}]*\\b${name}\\s*:\\s*false`).test(form.opts)) continue;
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: '${name}' of '${form.entity}' is required by the app (the Field shows *, the review blocks while it is empty) but its hint says optional — decide once: useStepForm('${form.entity}', { required: { ${name}: false } }) if this flow does not need it, else drop the hint`);
      }
    }

    // 3y. useDashboardData in a flow page. It was the one import that opened
    //     the door to every hand-rolled pick and filter (six live pages, four
    //     with it): picks come from useRecordSearch, availability from
    //     useOccupancy, the picked record from x.recordOf(id). Left for the
    //     rare aggregate the layer has no hook for — a warning names the layer's way.
    if (/useDashboardData\(/.test(src)) {
      const line = src.slice(0, src.search(/useDashboardData\(/)).split('\n').length;
      if (usesFlowHook) {
        // With a hook there is no aggregate left to excuse it: the hook owns every
        // pick — including the record an update flow changes (flow.pick('<entity>')).
        // Live 23.09.2026: a lane fed the target of an update from the dashboard
        // array because the hook offered no pick; the warning let it through.
        errors.push(`${file}:${line}: useDashboardData next to the flow hook — the hook owns every pick: {...flow.picks.<field>.select} {...flow.pick('<field>')}, and for the record an update changes {...flow.picks.<entity>.select} {...flow.pick('<entity>')} (prefilled, updated on submit). Remove useDashboardData and the hand-built items`);
      } else {
        warnings.push(`${file}:${line}: useDashboardData in a flow — picks are useRecordSearch (never items from an array), availability is useOccupancy(servicePort, entity, { resource }) — with a flow hook useOccupancy(flow.port, …) —, the picked record is x.recordOf(id); keep the hook only for an aggregate the layer has no answer for`);
      }
    }

    // 3z. A write past the port. Two live update flows called
    //     LivingAppsService.update… and built the reference with createRecordUrl —
    //     and lost every rule the layer settles (names, references, review,
    //     success facts). An update is a plan step: { key, entity, form, updates: id }.
    for (const m of src.matchAll(/LivingAppsService\.update\w*\(|\bcreateRecordUrl\(/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      warnings.push(`${file}:${line}: ${m[0].replace('(', '')} in a flow — an update is a plan step ({ key, entity, form, updates: id }, payload like a create, references shaped by the port via link/values); nothing to build by hand`);
    }

    // 3r. A pick step without a way to create is a dead end the moment the
    //     right record does not exist (280 live flow pages: one in five had a
    //     create path). The layer offers "Neu anlegen" by itself from
    //     {...x.select}; `create={false}` switches that off and is a
    //     deliberate decision — worth a second look, not a build failure.
    //     On a hook page the plan decided (`picks.<k>.select.create`) — a lane
    //     that writes `create=` there overrides it knowingly; no warning that
    //     costs a rewrite round (two lanes, 30–45 s each, inclou 24.09.2026).
    for (const m of usesFlowHook ? [] : src.matchAll(/<EntitySelectStep\b[^>]*?\bcreate=\{\s*false\s*\}/gs)) {
      const line = src.slice(0, m.index).split('\n').length;
      warnings.push(`${file}:${line}: <EntitySelectStep create={false}> — the step dead-ends when the list is empty; keep it off only where creating makes no sense (a fixed catalogue, a day), otherwise drop the prop and let the layer offer "Neu anlegen"`);
    }

    // 3q. <BudgetTracker> formats as currency unless told otherwise. A course
    //     page fed it seats and shipped "Gebucht 1,00 € von 12,00 €" (live
    //     03.09.2026). Where the budget expression reads like a capacity, the
    //     format has to be said.
    for (const m of src.matchAll(/<BudgetTracker\b([^>]*)>/g)) {
      const props = m[1];
      if (/\bformat=/.test(props)) continue;
      const budget = (/\bbudget=\{([^}]*)\}/.exec(props) || [])[1] || '';
      if (/teilnehmer|pl(?:ae|ä)tze|platz|kapazit|anzahl|max_?(?!betrag|preis|kosten)|slots?|personen|stunden|st(?:ue|ü)ck|seats?|capacity|count|limit/i.test(budget)) {
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: <BudgetTracker budget={${budget.trim()}}> without format — this budget reads like a capacity, the block would print it as € (live: "Gebucht 1,00 € von 12,00 €"); say format="count" unit={tx('Plätze')} (or format="currency" if it really is money)`);
      }
    }

    // 3k. The DATA PATH of a pick step is decided at RUNTIME by useRecordSearch —
    //     an items= array from useDashboardData freezes the build-time count: a page
    //     built with 13 employees still loads and client-searches all of them at
    //     5.000 (live-seen on Werkzeugverwaltung). The hook counts, pages and
    //     switches to server-side search by itself.
    {
      const dd = /(?:const|let|var)\s*\{([^}]*)\}\s*=\s*useDashboardData\s*\(/.exec(src);
      if (dd) {
        const arrays = dd[1].split(',').map(s => s.split(':')[0].trim())
          .filter(n => /^[a-z]\w*$/.test(n) && !/^(loading|error|fetchAll)$/.test(n) && !/Map$/.test(n));
        for (const m of src.matchAll(/<EntitySelectStep\b[\s\S]{0,400}?\bitems=\{\s*(\w+)\b/g)) {
          if (arrays.includes(m[1])) {
            errors.push(`${file}: <EntitySelectStep items={${m[1]}.…}> feeds a pick step from the useDashboardData array '${m[1]}' — the data path is a RUNTIME decision: const x = useRecordSearch(servicePort, '<entity>', { searchFields: [...], toItem }); <EntitySelectStep {...x.select} …/>; and drop the table from the hook: useDashboardData({ omit: ['<entity>'] })`);
          }
        }
      }
      // The same door, held differently: `const data = useDashboardData(…)` and
      // `items={projektItems}` built from `data.projekte` (live 23.09.2026 —
      // the destructuring pattern above never saw it).
      const dd2 = /(?:const|let|var)\s+(\w+)\s*=\s*useDashboardData\s*\(/.exec(src);
      if (dd2) {
        for (const m of src.matchAll(/<EntitySelectStep\b[\s\S]{0,400}?\bitems=\{\s*(\w+)\b/g)) {
          const def = new RegExp(`(?:const|let|var)\\s+${m[1]}\\s*=([\\s\\S]*?);\\n`).exec(src);
          if (def && def[1].includes(`${dd2[1]}.`)) {
            errors.push(`${file}: <EntitySelectStep items={${m[1]}}> is built from ${dd2[1]}.<entity> (useDashboardData) — the data path is a RUNTIME decision: pick through useRecordSearch ({...x.select}) or, with a flow hook, {...flow.picks.<field>.select} {...flow.pick('<field>')}`);
          }
        }
      }
    }

    // 3n. A "Weiter" that swallows the click. `onNext` may stay on the step,
    //     but the user must learn WHY: form.validate(...) marks and focuses the
    //     field; a returned string is shown as the reason. A bare `return false`
    //     without either did nothing visible (live: Einsatzplanung step 3 — no
    //     employee picked, click, silence). StepNav now shows a generic line
    //     for it, but the page knows the real reason — say it, or better, bind
    //     the pick through the form so the layer says it.
    for (const m of src.matchAll(/\bonNext=\{/g)) {
      let depth = 0, i = m.index + m[0].length - 1, end = -1;
      for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end < 0) continue;
      const body = src.slice(m.index, end + 1);
      const staysSilently = /\breturn\s+false\b|=>\s*false\b/.test(body);
      const explains = /\bvalidate\s*\(|\breturn\s+(?:tx|t)\s*\(|\breturn\s+['"`]/.test(body);
      if (staysSilently && !explains) {
        const line = src.slice(0, m.index).split('\n').length;
        errors.push(`${file}:${line}: onNext returns false without a reason — the step stays and the user sees nothing. Either return the reason as text (return tx('Bitte mindestens einen Mitarbeiter wählen')) or, for a pick, bind it through the form: <EntitySelectStep {...x.select} {...f.records('<key>', x.labelOf)} /> and onNext={() => f.validate(['<key>'])} — the layer then names the field, focuses it and shows the error under the step`);
      }
    }

    // 3o. A multi pick kept by hand: `selectedId={ids[0]}` highlights ONE of
    //     the chosen records and hides the rest (live: two employees picked, one
    //     shown). The block has a multi shape — selectedIds + onToggle — and
    //     the form has the binding for it.
    for (const m of src.matchAll(/\bselectedId=\{\s*(\w+)\s*\[\s*0\s*\]\s*\}/g)) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${file}:${line}: selectedId={${m[1]}[0]} highlights only the first pick — a multi pick (multipleapplookup) is {...f.records('<key>', x.labelOf)} on the <EntitySelectStep> (selectedIds + onToggle, required = at least one, summary knows the names); drop the useState`);
    }

    // 4. UTC day-shift trap — same rule as gate 1 of check-dashboard.mjs, which
    //    only ever sees DashboardOverview.tsx. A wizard step writes date fields
    //    DIRECTLY via the service, so this is exactly where the shift lands.
    //    The offending lines are quoted VERBATIM (untrimmed) so the fix is a
    //    direct Edit with that exact string — no re-Read to locate them.
    if (src.includes('toISOString')) {
      const lines = src.split('\n');
      const hits = [];
      for (let i = 0; i < lines.length && hits.length < 6; i++) {
        if (lines[i].includes('toISOString')) hits.push(`    line ${i + 1}: ${lines[i]}`);
      }
      errors.push(
        `${file}: toISOString() found — it is UTC, so the day flips at the wrong hour and the record lands on the neighbouring date. ` +
        `Write date fields with date-fns format(): a date/date field → format(d, 'yyyy-MM-dd'), a date/datetimeminute field → format(d, "yyyy-MM-dd'T'HH:mm").` +
        (hits.length ? '\n' + hits.join('\n') : ''),
      );
    }
  }

  if (!pageOnly) {
  // 5. Every route needs a registry entry, or the flow is invisible in the
  //    sidebar even though its URL works.
  for (const path of routePaths) {
    if (!registryPaths.has(path)) {
      errors.push(`${REGISTRY}: route '${path}' has no entry inside <custom:intents> — the flow works by URL but never appears in the sidebar; add { path: '${path}', label: …, icon: …, description: … }`);
    }
  }

  // 6. …and the other way round: a registry entry without a route is a dead
  //    sidebar link.
  for (const path of registryPaths) {
    if (!routePaths.has(path)) {
      errors.push(`${APP}: registry lists '${path}' but no <Route path="${path.replace(/^\//, '')}"> exists — the sidebar link leads nowhere`);
    }
  }

  // 7. Flows exist, so the Phase-1 ghost rows must be gone. INTENTS_PENDING
  //    lives outside the markers and is flipped by the orchestrator, not by
  //    any file this gate already checks — leave it true and the sidebar
  //    shows "werden erstellt…" forever next to the finished flows.
  if (/export const INTENTS_PENDING = true/.test(registrySrc)) {
    errors.push(`${REGISTRY}: INTENTS_PENDING is still true although ${pages.length} flow(s) exist — set it to false, the sidebar keeps showing ghost rows otherwise`);
  }

  // 8. A follow-up link must point at a flow that exists. Lanes run in
  //    parallel and a lane guessed its neighbour's slug ('#/intents/neue-rechnung'
  //    for the flow registered as 'rechnung-erstellen') — the success screen's
  //    button led to "Diese Seite gibt es nicht" (live). Tree run only: in a
  //    lane's pre-flight the routes of the other lanes are not wired yet.
  for (const page of pages) {
    const src = readFileSync(pageFile(page), 'utf8');
    for (const m of src.matchAll(/['"`]#(\/intents\/[a-z0-9-]+)/g)) {
      if (routePaths.has(m[1])) continue;
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${pageFile(page)}:${line}: link to '#${m[1]}' — no such flow; the flows of this build are ${[...routePaths].map(p => `'#${p}'`).join(', ') || 'none'}. Link only to a slug from the brief's FLOWS OF THIS RUN list`);
    }
  }
  }
}

// Runtime i18n: intent pages mark their UI text with tx (source language
// once, pipeline translates) — the dashboard has a live language switcher.
// Same rule and same escape hatch as check-dashboard gate 21. WARNING, not
// error: the i18n finalize step wraps leftovers mechanically after the
// build — a gate-red here only bought a 30-60s agent repair loop.
for (const page of pages) {
  const file = pageFile(page);
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  // The closing `<` must start a tag (`</` or `<Tag`). Without that a
  // comparison pair reads as JSX text: `x > 0 && (a.fields.b ?? 0) < y`
  // matched, and the fixer dutifully annotated pure logic (live-seen).
  // The `>` must close a TAG. Without the lookbehind the `>` of an arrow
  // function matched, so `(key: K) => (e: React.ChangeEvent<HTMLInputElement
  // | HTMLTextAreaElement>) =>` was reported as hardcoded UI text and cost a
  // run a gate-red plus an /* i18n-exempt */ on pure type syntax.
  const jsxText = /(?<![=-])>[^<>{}\n]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^<>{}\n]*<[/A-Za-z]/;
  const attrText = /\b(?:title|placeholder|label|aria-label|alt|emptyLabel|emptyText)=(?:\{\s*)?(?:"[^"{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^"{}]*"|'[^'{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^'{}]*')/;
  const objText = /\b(?:title|label|name|emptyLabel|emptyText|hint|description)\s*:\s*(?:"[^"{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^"{}]*"|'[^'{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^'{}]*')/;
  // A sentence computed in a helper and rendered as {subtitle} is in no
  // JSX text, no attribute and no allowlisted prop — it stayed German
  // while the page around it turned English. One word may be a status
  // key the API reads back ('Aktiv'), so only whole phrases count.
  const returnText = /\breturn\s+(?:"(?=[^"]*[A-Za-zÄÖÜäöüßÀ-ž]{3,})(?=[^"]*\s)[^"{}]*"|'(?=[^']*[A-Za-zÄÖÜäöüßÀ-ž]{3,})(?=[^']*\s)[^'{}]*')/;
  const hits = [];
  for (let i = 0; i < lines.length && hits.length < 8; i++) {
    const l = lines[i];
    if (l.includes('i18n-exempt')) continue;
    const trimmed = l.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
    if (jsxText.test(l) || attrText.test(l) || objText.test(l) || returnText.test(l)) hits.push(`    line ${i + 1}: ${l}`);
  }
  if (hits.length) {
    warnings.push(
      `${file}: unmarked UI text (healed mechanically after the build — no action needed); ` +
      `write it as {tx('…')} from '@/i18n' next time; brand names/codes take /* i18n-exempt */ on the line.\n` + hits.join('\n')
    );
  }
  // LOOKUP_OPTIONS labels are locale-aware getters — resolving them at module
  // scope freezes one language at import time (same rule as check-dashboard 22).
  // Statement-based: multi-line `.map(` statements escaped a per-line regex.
  let optName = 'LOOKUP_OPTIONS';
  const importM = src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/types\/app'/);
  const aliasM = importM && importM[1].match(/LOOKUP_OPTIONS\s+as\s+(\w+)/);
  if (aliasM) optName = aliasM[1];
  for (let i = 0; i < lines.length; i++) {
    if (!/^(?:export\s+)?const\s/.test(lines[i])) continue;
    let j = i;
    let stmt = lines[i];
    while (!/;\s*$/.test(lines[j]) && j + 1 < lines.length && j - i < 12) {
      j++;
      stmt += '\n' + lines[j];
    }
    if (stmt.includes(optName) && /(?:\.label\b|label\s*:)/.test(stmt)) {
      errors.push(`${file}:${i + 1}: module-scope LOOKUP_OPTIONS label read — move it inside the component body, the getters freeze at import otherwise:\n    ${lines[i]}`);
    }
    i = j;
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(pageOnly ? `check-intents: OK (staged page ${fileArg})` : `check-intents: OK (${pages.length} flows)`);
