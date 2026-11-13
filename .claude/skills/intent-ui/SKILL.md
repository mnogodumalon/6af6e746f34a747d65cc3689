---
name: intent-ui
description: |
  Activate this skill when:
  - Building an intent-specific UI page (src/pages/intents/*.tsx)
  - Creating multi-step task workflows that span multiple entities
  - Building wizard/stepper interfaces for complex user tasks
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
---

# Intent UI Building Skill

Build a **multi-step task workflow** — NOT a record list with different styling.

---

## What Makes an Intent UI (vs a record list)

Every entity already has a record list on the Living Apps platform. An intent UI is fundamentally different:

| Platform record list (already exists) | Intent UI (what you build) |
|---|---|
| Shows ONE entity's records | Orchestrates MULTIPLE entities in one flow |
| Generic table + search + dialogs | Task-specific steps with clear progression |
| Creates one record at a time | Often creates MANY records in one flow |
| No context between actions | Live feedback: totals, counts, progress |
| No clear start/end | Wizard with start → steps → summary → success |

**If your intent UI is just a table/list/kanban of ONE entity — you're building a record list, not an intent UI. Stop and redesign.**

---

## Your Workflow

1. **Read `.lane-context.md` FIRST** — the API index generated from this tree: every entity's fields
   (kind, options, targets), every `@/lib/journey` export with its signature, every block's props.
   It replaces `src/types/app.ts` and every grep over `src/lib/journey` / `src/components/blocks`
   / `src/services` — do not run those, the answer is already in the index. NEVER guess field names.
2. **Write the complete file** with `Write` tool — one shot, no read-back. After a red
   `check-staging`, repair the named lines with `Edit` — never a second `Write` of the whole page.
3. Do NOT run `npm run build` and do NOT run the `scripts/check-*.mjs` gates — both belong to the
   orchestrator, which runs them after it has wired your page into `App.tsx` and `src/config/intents.ts`.
   `check-intents` in particular CANNOT pass while you are working (it verifies the route and the registry
   entry, neither exists yet). Write the file and stop.
4. A page that must show WITHOUT the dashboard chrome — a beamer view, a kiosk screen, a print
   sheet — is a normal flow page whose manifest entry carries `bare: true`; the orchestrator wires it
   outside the Layout (`wire-intent --bare`, the `<custom:bare-routes>` block in App.tsx). Never
   rebuild the Layout or hide the drawer with CSS to get a clean screen.

---

## The journey layer — you write sentences and composition, the layer does the mechanics

Every flow page is built from the SAME pre-generated pieces. Validation, required checks, focus
management, the error summary, the draft, idempotent retries, the reference number, copy/print, deep
links and accessibility are all inside them. You never re-implement any of it; the gate rejects a page
that bypasses the layer (`check-intents`: a flow hook or `useJourneySubmit`, `<SummaryStep>`, `<SuccessStep>` must be present).

### With a plan: the flow HOOK owns the plumbing, you compose

When your brief has a section **"Your hook"**, the generator has already written this flow's plumbing:
`src/lib/journey/flows/<Pascal>.ts` exports `use<Pascal>Flow()`, built from the plan's Schreibliste —
the form(s) with exactly the plan's fields and required ingredients, one `useRecordSearch` per picked
field with the plan's columns and filter, and the `useJourneySubmit` plan with every fixed and derived
value. Its docblock (in `.lane-context.md`) shows the exact call. **You never write `useStepForm`,
`useRecordSearch`, `useJourneySubmit` or import `servicePort` in such a page** — `check-intents` refuses
a page that uses the hook and the raw plumbing, and `check-plan` has nothing left to check: a page that
only calls `flow.submit.run()` cannot write a field the plan does not know.

**A flow that CHANGES a record** (the plan's write says `update`): the hook owns the pick of that record too —
`<EntitySelectStep {...flow.picks.<entity>.select} {...flow.pick('<entity>')} />` as the first step. Picking prefills
the form with the record's current values (`flow.targets.<entity>.record` is the record), and the plan step updates
THAT record on submit. Never build the list yourself, never import `useDashboardData` here — `check-intents`
refuses it next to a hook — and never write a create step for it.

**Several records of one entity in one run** (the brief's Schreibliste says „SEVERAL per run“): the hook owns the
list — `flow.lists.<entity>` with `entries`, `count`, `add()`, `remove(id)`, `edit(id)`. Render the editor's fields
inside the `ListEntries` block on their own step; the block adds „Hinzufügen“ and the entry list, the hook's
`validateStep(n)` takes a filled editor as one more entry and needs at least one. Never loop over `useStepForm`,
never call `flow.submit.run()` more than once — the plan already holds one create step per entry.

```tsx
import { ListEntries } from '@/components/blocks/ListEntries';
…
<WizardStep step={2} title="Terminvorschläge">
  <ListEntries list={flow.lists.terminvorschlaege}>
    <Bound form={flow.forms.terminvorschlaege} name="termin" />
    <Bound form={flow.forms.terminvorschlaege} name="anmerkung" />
  </ListEntries>
  <StepNav onNext={() => flow.validateStep(2)} />
</WizardStep>
```

**`create` is the hook's call, not yours.** `flow.picks.<k>.select` already says whether the step offers „Neu anlegen“:
off for the record a flow changes, for multi picks, for a catalogue entity and for an entity that has its own flow in
this plan; on otherwise (the layer's InlineCreate, the entity's required fields). Never write `create={false}` on a hook
pick; write `create={{ fields: [...] }}` only to narrow the fields of a pick the hook left on.

**A single pick moves the wizard on by itself** when its step has no `StepNav` — the step IS the pick, the
layer changes the step (no `setStep` in `onSelect`, nothing to add). Put a `StepNav` on a pick step only when the
step holds more than the pick (a pick plus a date, say); then the button decides.

What stays yours — everything a person notices:

```tsx
/**
 * Rechnung erstellen — 7-Schritt-Wizard. (header as below)
 */
import { useState } from 'react';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Bound } from '@/components/blocks/Bound';
import { Field } from '@/components/blocks/Field';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { fieldText, fieldDate, fieldNumber } from '@/lib/journey';          // readers for `items` only
import { useRechnungErstellenFlow } from '@/lib/journey/flows/RechnungErstellen';
import { tx } from '@/i18n';

export default function RechnungErstellenPage() {
  const [step, setStep] = useState(1);
  const flow = useRechnungErstellenFlow({
    // UX: which step asks which field (the hook's default is one step per pick, then the typed fields)
    steps: { kunde: 1, projekt: 2, berater: 3, zeiterfassungseintraege: 4, rechnungsdatum: 5, faelligkeitsdatum: 5, nettobetrag: 6, mehrwertsteuer: 6, notizen: 6 },
    // UX: how a search hit reads — a card that says "19.09.2026 — 8 Std." beats a record id
    items: {
      kunde: k => ({ id: k.id, title: fieldText(k, 'kundenname'), subtitle: fieldText(k, 'email') }),
      zeiterfassungseintraege: (z, ctx) => ({ id: z.id, title: tx`${fieldDate(z, 'datum') ?? ''} — ${fieldNumber(z, 'stunden') ?? '?'} Std.`, subtitle: ctx.ref('berater') }),
    },
    initial: { rechnungsdatum: todayIso() },
    // only when the hook's docblock says `compute` is REQUIRED — the plan left a rule to you
    compute: { rechnungsmonat: f => monthKeyOf(f.rechnungen.get('rechnungsdatum')) },
  });

  return (
    <IntentWizardShell title={tx('Rechnung erstellen')} currentStep={step} onStepChange={setStep}
      forms={flow.formList} draftKey={flow.draftKey} intro={{ description: tx('…'), needs: [tx('…')] }}>
      <WizardStep label={tx('Kunde')} description={tx('Für welchen Kunden?')}>
        <EntitySelectStep {...flow.picks.kunde.select} {...flow.pick('kunde')} searchPlaceholder={tx('Name oder E-Mail …')} />
      </WizardStep>
      <WizardStep label={tx('Berater')} needs={['projekt']}>
        <Field form={flow.forms.rechnungen} name="berater">
          <EntitySelectStep {...flow.picks.berater.select} {...flow.pickMany('berater')} avatar="initials" />
        </Field>
        <StepNav onBack={() => setStep(2)} onNext={() => flow.validateStep(3)} nextStepLabel={tx('Zeiterfassung')} />
      </WizardStep>
      <WizardStep label={tx('Beträge')} needs={['rechnungsdatum']}>
        <Bound form={flow.forms.rechnungen} name="nettobetrag" hint={tx('In Euro, z. B. 2500')} />
        <Bound form={flow.forms.rechnungen} name="mehrwertsteuer" />
        <StepNav onBack={() => setStep(5)} onNext={() => flow.validateStep(6)} nextStepLabel={tx('Prüfen')} />
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!flow.submit.done && <SummaryStep forms={flow.formList} submit={flow.submit}
          items={[{ key: 'rechnungsstatus', label: tx('Status'), value: tx('Entwurf') }]}
          whatHappensNext={tx('Rechnungsnummer und Gesamtbetrag vergibt das System.')} />}
      </WizardStep>
      {flow.submit.result && <SuccessStep result={flow.submit.result} forms={flow.formList} submit={flow.submit}
        next={[{ label: tx('Stunden buchen'), href: '#/intents/stunden-buchen' }, { label: tx('Zum Dashboard'), href: '#/' }]} />}
    </IntentWizardShell>
  );
}
```

`flow.forms.<entity>` is the StepForm for `<Bound>`/`<Field>`; `flow.picks.<field>` the RecordSearch
(`.select`, `.labelOf`, `.recordOf`); `flow.pick(field)` gives `{ selectedId, onSelect }` for a single
pick, `flow.pickMany(field)` the `records` props for a multi pick; `flow.validateStep(n)` validates every
field mapped to step n; `flow.reviewStep` is the default review index; `flow.reset()` restarts. A field
the plan sets itself (status, today, a computed value) is NOT in `steps` and NOT bound — show it with a
SummaryStep `items` row if the person should see it. The record an update flow CHANGES is in the review by
itself (the hook's plan step names it, "Ändern" leads back to its pick) — no `items` row for it.

### Without a plan: the plumbing is yours

A build without the orchestrator emits no hook; then the page carries the plumbing itself, exactly as the
reference page below shows.

```tsx
/**
 * Werkzeug zuweisen — 4-Schritt-Wizard.
 * Steps: 1) Werkzeug wählen → 2) Mitarbeiter wählen → 3) Details → 4) Prüfen & anlegen.
 * Reads: werkzeuge, mitarbeiter. Writes: werkzeugzuweisungen.
 * Composes: IntentWizardShell, EntitySelectStep, ChoiceGroup, StepNav, SummaryStep, SuccessStep.
 */
import { useState } from 'react';
import { DatePicker } from '@/components/DatePicker';
import { Textarea } from '@/components/ui/textarea';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { Bound } from '@/components/blocks/Bound';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { ChoiceGroup } from '@/components/blocks/ChoiceGroup';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { useStepForm, useJourneySubmit, useRecordSearch, fieldText, fieldLookup } from '@/lib/journey';
import { servicePort } from '@/services/journeyPort';
import { tx } from '@/i18n';

export default function WerkzeugZuweisenPage() {
  // Everything the page reads comes through the layer: picks via useRecordSearch
  // (runtime count → client or server search), availability via useOccupancy.
  // No useDashboardData in a flow (gate 3y warns) — it was the door to every hand-rolled pick.
  const werkzeuge = useRecordSearch(servicePort, 'werkzeuge', {
    filter: "r.v_status == 'verfuegbar'",              // the step's restriction — vSQL, server-side, also counts
    searchFields: ['werkzeugname'],
    toItem: w => ({ id: w.id, title: fieldText(w, 'werkzeugname'), status: fieldLookup(w, 'status') ?? undefined }),
  });
  const mitarbeiter = useRecordSearch(servicePort, 'mitarbeiter', {
    searchFields: ['vorname', 'nachname'],
    toItem: m => ({ id: m.id, title: `${fieldText(m, 'vorname')} ${fieldText(m, 'nachname')}`.trim() }),
  });
  const [step, setStep] = useState(1);

  // ONE form per entity you write. `steps` maps each field to the step that asks it —
  // that is what drives "Ändern" in the summary and the answer chips.
  const zuweisung = useStepForm('werkzeugzuweisungen', {
    steps: { werkzeug: 1, mitarbeiter: 2, ausgabedatum: 3, zustand_bei_rueckgabe: 3, notizen: 3 },
  });
  // The plan: what gets written, in order. Retries repeat ONLY what failed.
  const submit = useJourneySubmit(servicePort, [
    { key: 'zuweisung', entity: 'werkzeugzuweisungen', form: zuweisung, primary: true },
  ], { draftKey: 'werkzeug-zuweisen' });

  const restart = () => { submit.reset(); zuweisung.reset(); setStep(1); };

  return (
    <IntentWizardShell
      title={tx('Werkzeug zuweisen')}
      currentStep={step} onStepChange={setStep}
      loading={data.loading} error={data.error} onRetry={data.fetchAll}
      forms={[zuweisung]} draftKey="werkzeug-zuweisen"
      intro={{ description: tx('Ein Werkzeug an eine Person ausgeben.'), needs: [tx('Werkzeugnummer'), tx('Name der Person')] }}
    >
      {/* Steps are CHILDREN: label + content in one element. The shell counts,
          numbers and shows the current one — no steps array to keep in sync. */}
      <WizardStep label={tx('Werkzeug')}>
        <EntitySelectStep {...werkzeuge.select}
          onSelect={id => { zuweisung.set('werkzeug', id, werkzeuge.labelOf(id)); setStep(2); }}
        />
      </WizardStep>
      <WizardStep label={tx('Mitarbeiter')}>
        <EntitySelectStep {...mitarbeiter.select}
          onSelect={id => { zuweisung.set('mitarbeiter', id, mitarbeiter.labelOf(id)); setStep(3); }}
        />
      </WizardStep>
      <WizardStep label={tx('Details')} description={tx('Zustand und Datum der Ausgabe festhalten.')}>
        <div className="space-y-4">
          {/* <Bound> = label + control + error in ONE element; the control follows the field's kind */}
          <Bound form={zuweisung} name="ausgabedatum" />
          <Bound form={zuweisung} name="zustand_bei_rueckgabe" />
          <Bound form={zuweisung} name="notizen" rows={3} />
          <StepNav onNext={() => zuweisung.validate(['ausgabedatum', 'zustand_bei_rueckgabe'])} nextStepLabel={tx('Prüfen')} />
        </div>
      </WizardStep>
      <WizardStep label={tx('Prüfen')}>
        {!submit.done && (
          <SummaryStep forms={[zuweisung]} submit={submit}
            whatHappensNext={tx('Die Zuweisung erscheint sofort in der Werkzeugliste des Mitarbeiters.')} />
        )}
      </WizardStep>
      {submit.result && (
        <SuccessStep result={submit.result} forms={[zuweisung]}
          next={[{ label: tx('Weitere Zuweisung'), onClick: restart }, { label: tx('Zum Dashboard'), href: '#/' }]}
          whatHappensNext={tx('Bei der Rückgabe den Ablauf „Werkzeug zurücknehmen" nutzen.')} />
      )}
    </IntentWizardShell>
  );
}
```

That is a complete, gate-green flow in ~80 lines. What you add on top is the domain: which records are
eligible in a selection step, the texts, the order of steps, extra context (a BudgetTracker, stats on the
select cards, a live total).

### What the layer owns — never rebuild these

| Concern | Where it lives | Your part |
|---|---|---|
| Required / format validation, messages with the real field label | `useStepForm` (generated rules) | `form.validate([...])` in `StepNav onNext` |
| `aria-invalid`, `aria-describedby`, `type`, `inputMode` | `form.field()` bindings | spread them (person autofill stays OFF here — the team enters someone else's data; only public pages pass `autoComplete: true`) |
| Error summary + focus on the first invalid field | Shell (`forms=`) + `validate()` | nothing |
| "Alles richtig?" with Ändern-links, missing list, confirm | `<SummaryStep forms submit>` | one `whatHappensNext` sentence |
| Idempotent writes, per-step status, retry of the failed step only | `useJourneySubmit` plan | the plan array |
| Reference (`W-42D81A`), facts, copy, print, next actions | `<SuccessStep result>` | 2–3 `next` actions + a sentence |
| Draft in localStorage, "Entwurf von gestern fortgesetzt", Verwerfen | Shell (`draftKey=` + `forms=`) | the key |
| `?step=N` deep link, step buttons, `aria-current`, live region, focus move | Shell | nothing |
| Answer chips of earlier steps | Shell (`forms=`) | nothing |
| Conditional steps | `steps[i].enabledIf` | one boolean |

### Bindings — one per field kind

**Default: `<Bound form={f} name="key" />`** — label, control, hint and error in one element; the control
follows the field's kind (text/number → Input, textarea → Textarea, date → DatePicker, small lookup →
ChoiceGroup pills, bool → Checkbox). Props: `hint`, `placeholder`, `rows`, `allowClear`, `label`, and `as`
to overrule the control. NOT for applookups — those are a pick step (`EntitySelectStep` + `useRecordSearch`)
or the explicit Combobox below; `check-intents` rejects `<Bound>` on a record field.

When you need a control `<Bound>` does not offer, wrap it yourself in `<Field form={f} name="key">` — it
renders the entity's field label, the required mark, an optional `hint` and the error line (the gate
rejects a bound control without it):

```tsx
<Field form={f} name="name"><Input {...f.field('name')} /></Field>                  // text · email · tel · url (type/inputMode/autoComplete set for you)
<Field form={f} name="notizen"><Textarea {...f.field('notizen')} rows={3} /></Field>  // textarea
<Field form={f} name="menge" hint="Stück"><Input {...f.number('menge')} /></Field>    // number (decimal keyboard, step="any")
<Field form={f} name="termin"><DatePicker {...f.date('termin')} /></Field>            // date · datetime — never <Input type="date">
<Field form={f} name="status"><ChoiceGroup {...f.choice('status')} /></Field>         // lookup with ≤ 6 options (the ◈ line says "choice")
<Field form={f} name="newsletter" hideLabel><Checkbox {...f.checkbox('newsletter')} /></Field>   // bool — the checkbox carries its text
<Field form={f} name="kunde"><Combobox {...f.record('kunde')} items={…} /></Field>    // applookup as dropdown
<Field form={f} name="mitarbeiter"><EntitySelectStep {...x.select} {...f.records('mitarbeiter', x.labelOf)} /></Field>   // multipleapplookup — toggle pick
<AvailabilityRangePicker {...f.range('anreise', 'abreise', { blocked })} />           // a date PAIR is one input (labels its own two dates)
<AvailabilityRangePicker unit="days" {...f.range('von', 'bis', { blocked: [], unit: 'days' })} />   // a PERIOD (course, loan): "Beginn/Ende", "3 Tage" — never "Nächte"
```

For a selection step, `EntitySelectStep` stays the block — store the pick with its display name so the
summary can show it: `onSelect={id => f.set('kunde', id, x.labelOf(id))}` (`x` = the step's `useRecordSearch`).

**Multi pick (multipleapplookup — "which employees", "which vehicles"):** the SAME block in its multi shape,
bound through the form — never a `useState<string[]>` with a toggle of your own:

```tsx
// ❌ WRONG — the ids live outside the form: only ids[0] is highlighted, required is not checked,
//    the summary shows nothing, "Weiter" swallows the click (check-intents 3n/3o reject both lines)
const [ids, setIds] = useState<string[]>([]);
<EntitySelectStep {...ma.select} selectedId={ids[0]} onSelect={id => setIds(toggle(ids, id))} />
<StepNav onNext={() => { if (ids.length === 0) return false; }} />

// ✅ RIGHT — the pick is a form value (string[]), required means "at least one", the summary knows the names
<Field form={f} name="mitarbeiter">
  <EntitySelectStep {...ma.select} {...f.records('mitarbeiter', ma.labelOf)} />
</Field>
<StepNav onNext={() => f.validate(['mitarbeiter'])} nextStepLabel={tx('Routendaten')} />
```

`f.records(key, labelOf)` gives `selectedIds` + `onToggle` (+ `id`, `invalid`); `port.create` turns the ids
into references. Nothing to add under `values:` in the plan — the field is part of `f.payload()`.

`<Field>` shows the field's error line — never hand-roll it.

```tsx
// ❌ WRONG — hand-rolled gating, no message, no focus, nothing for screen readers
<Button disabled={!name || !datum} onClick={() => setStep(3)}>Weiter</Button>

// ✅ RIGHT — the layer validates, names the field, focuses it; the button says where it leads
<StepNav onNext={() => f.validate(['name', 'datum'])} nextStepLabel="Zimmer wählen" />
```

### The plan — creates as data

```tsx
// one record
useJourneySubmit(servicePort, [{ key: 'buchung', entity: 'buchungen', form: buchung, primary: true }], { draftKey })

// chained: the second record references the first — `link` fills the applookup with the created id
useJourneySubmit(servicePort, [
  { key: 'auftrag',   entity: 'auftraege',          form: auftrag, primary: true },
  { key: 'protokoll', entity: 'wartungsprotokolle', form: protokoll, needs: ['auftrag'], link: { auftrag: 'auftrag' } },
])

// values the user never typed (a status, a computed number) — merged over the form payload
{ key: 'buchung', entity: 'buchungen', form: buchung, values: { status: 'offen', naechte } }

// N children from a list (bulk): one step per child, keys must be unique
...gaeste.map(g => ({ key: `einladung-${g.record_id}`, entity: 'einladungen', values: { gast: g.record_id, veranstaltung: eventId, status: 'eingeladen' } }))

// anything else: `run` gets { port, done } and returns the record (or nothing)
{ key: 'status', run: async ({ done }) => { await LivingAppsService.updateAuftraegeEntry(done.auftrag.id, { status: 'in_arbeit' }); } }
```

Record ids go in as PLAIN IDS (`'6943fe…'`) — the port turns them into the reference form the API
wants. Never build URLs with `createRecordUrl` inside a plan. Never `fetchAll()` before the success
screen: `submit.result` IS the result — the success step renders from it, a refetched list never proves
that a write happened.

```tsx
// ❌ WRONG — try/catch pyramid, duplicates on retry, success from a refetch
const a = await LivingAppsService.createAuftraegeEntry({...}); await LivingAppsService.createTermineEntry({ auftrag: createRecordUrl(APP_IDS.AUFTRAEGE, a.record_id) }); await fetchAll(); setDone(true);

// ✅ RIGHT — two plan steps; retry repeats only the failed one; SuccessStep renders from submit.result
```

### Read the ◈ line of the brief — it names the input form each field wants

The orchestrator quotes the entity's shapes from `.entity_summary`:

- `anreise+abreise → range candidate` — when the ORCHESTRATOR decided it is a **stay** (your brief says
  `Belegung: per zimmer; frei wenn status ∈ storniert`), never two date fields: `AvailabilityRangePicker`
  with `{...f.range('anreise', 'abreise', { blocked: belegung.blocked })}`. `blocked` comes from ONE hook, never
  from your own filter or your own records: `const belegung = useOccupancy(servicePort, 'buchungen', { resource: f.get('zimmer') as string })`
- ONE NUMBER over many records (capacity: "12 of 15 places taken", open items, "already booked twice") is
  `useRecordCount(servicePort, 'anmeldungen', { filter: kursId ? combineFilters(refFilter('kurs', kursId), "r.v_status in ['neu', 'bestaetigt']") : undefined, where: a => …, enabled: Boolean(kursId) })`
  → `count` (null until known). Never a second `useRecordSearch` for a count, never a dummy filter like
  `r.id == "none"`. When you do need the loaded records of a pick step (a sum over them), they are `x.records`;
  `x.select.items` are CARDS — `fieldLookup(item, …)` does not compile.
  reads the stays through the port and applies the rule from `src/config/journey.ts` (stay pair, booked
  resource, statuses that do not occupy). `belegung.freeIn(anreise, abreise)` is the `where` of the room's
  pick step; `belegung.isFree(from, to, roomId)` answers for one room. The public page uses the same rule,
  so both calendars always agree. Pick the resource in a step BEFORE the calendar (`needs={['anreise', 'abreise']}`
  on the room step renders the way back by itself). No rule in the brief → the pair is not a stay → two DatePickers are right.

```tsx
// ❌ WRONG — bookings pulled through useDashboardData, a private rule, rooms filtered by hand
const { buchungen } = useDashboardData(); const blocked = buchungen.filter(b => b.fields.status?.key === 'bestaetigt').map(…);
// ✅ RIGHT — the decided rule, read through the door, identical everywhere
const belegung = useOccupancy(servicePort, 'buchungen', { resource: f.get('zimmer') as string });
const zimmer = useRecordSearch(servicePort, 'zimmer', { searchFields: ['bezeichnung'], where: belegung.freeIn(anreise, abreise), toItem: … });
<AvailabilityRangePicker {...f.range('anreise', 'abreise', { blocked: belegung.blocked })} />
```
- `status → choice (3 options)` — `ChoiceGroup`, not a `<Select>`.
- `kunde → record (kunden, EntitySelectStep)` — a selection step with search, never an id field.
- `menge → stock` — show the available quantity next to the input and warn when the entry exceeds it
  (`<p className="text-xs text-destructive">` — warn, don't block; the platform allows it).

The field is the fallback, not the default: pick the form that fits the data.

---

## Pre-Generated Shared Components (USE THESE — do NOT recreate!)

### IntentWizardShell
Props: `currentStep`/`onStepChange` (1-based) with the steps as `<WizardStep label heading? description? enabledIf?>` CHILDREN (or the older `steps: { label, key?, enabledIf? }[]` array), `title?`/`subtitle?`
(omit `title` inside a `PublicShell` that already renders the heading), `loading?`/`error?`/`onRetry?` from
`useDashboardData()`, `back?: { href, label } | false`, `forms?: StepForm[]`, `draftKey?`, `intro?: { description?, needs?, startLabel? }` — `description` is ONE short sentence (max 90 chars) saying what the flow achieves; never list the steps in it, the shell renders them right below (gate 3d).
Renders the header back link (to `#/` unless you say otherwise — do NOT add a second one), the step
indicator, progress text, draft bar, answer chips, error summary. `useWizard()` (from the same module) gives
blocks inside the shell `next()`, `prev()`, `goTo()`, `nextLabel`.

**Every step must survive arriving cold via `?step=N`** — the shell restores the step number and, with
`draftKey`, the values. A step gated on a value that is missing shows the way back, never a blank body:

```tsx
// ❌ blank body on reload
{step === 3 && createdId && (…)}
// ✅ the missing prerequisite sends the user back
{step === 3 && (zuweisung.get('werkzeug') ? (…) : <StepNav onBack={() => setStep(1)} nextDisabled>{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</StepNav>)}
```

### EntitySelectStep — "pick an item" step, "Neu anlegen" included
```tsx
const gaeste = useRecordSearch(servicePort, 'gaeste', {
  searchFields: ['vorname', 'nachname'],                 // STRING fields only — check-intents 3j rejects the rest
  toItem: g => ({ id: g.id, title: `${g.fields.vorname ?? ''} ${g.fields.nachname ?? ''}`,
    subtitle: String(g.fields.telefon ?? ''), stats: [{ label: tx('Buchungen'), value: countFor(g.id) }] }),
});

<EntitySelectStep {...gaeste.select} selectedId={buchung.get('gast') as string}
  onSelect={id => { buchung.set('gast', id, gaeste.labelOf(id)); setStep(2); }} />
```
That is the whole step, create included. The layer shows „Neu erstellen", renders the entity's
required fields as a mini-form (`InlineCreate`, from the generated rules — labels, required marks,
the right control per field), writes through the port, adopts the record into the list and calls
YOUR `onSelect` with its id — `gaeste.labelOf(id)` already knows the name. An empty list explains
itself (no hits → „Suche zurücksetzen" · the step's restriction left nothing · the entity has no
records yet) and always shows the way on. Never write this form yourself.

You decide three things at most:
- `create={{ fields: ['vorname', 'nachname', 'telefon'] }}` — other fields than the required ones
  (2–4, what THIS decision needs); `title` renames the panel, `initial` prefills.
- `emptyText={tx('Kein Zimmer ist im gewählten Zeitraum frei.')}` — what the step's `filter` means in
  the user's words; the layer cannot read vSQL aloud, so a restricted step says this itself.
- `create={false}` — only where creating makes no sense (a fixed catalogue, a day). check-intents 3r
  warns: the step dead-ends on an empty list.

No create appears when the entity REQUIRES a record, file, geo or multi-lookup field — no inline form
can send that. Then `emptyText` names the flow that creates such a record. A hand-written panel
(`onCreateNew` + `createDialog`, `<Bound>` inside) still works and overrides the layer's — it is the
exception, not the pattern.

`toItem` is OPTIONAL: without it the card is the record's display name (first + last name, else its
title-like text) — write one only to add a subtitle, stats, a status or `ctx.ref(...)`.

`{...x.select}` supplies `items`/`totalCount`/`onSearch`/`loading`/`error` plus `entity`/`port`/
`filtered`/`adopt` (what the create and the empty state need — never pass those by hand); you add
`onSelect(id)` + `selectedId?` (or `{...f.records(key)}` for a multi pick), `create?`, `createLabel?`,
`emptyText?`/`emptyIcon?`, `searchPlaceholder?`, `columns?`, `mode?`, `avatar?`. The item shape is
`{id, title, subtitle?, status?, stats?, icon?}` — built in `toItem`.

### One way to feed the step — useRecordSearch, always

Never pass `items` from a `useDashboardData()` array — `check-intents` 3k rejects it. A build-time choice
ages: a page built with 13 employees would still load and client-search all of them at 5.000. The layer
decides at RUNTIME instead: `useRecordSearch` counts the entity, below 200 it loads everything once
(client search, zero latency), above it loads one page and searches the SERVER while the user types;
`{...x.select}` wires items, totalCount, onSearch, loading and error in one spread. The `≡` line of the
brief is context (empty vs. big entity), never the decision.

**The referenced record's name on the card** (the guest of a booking, the tool of a
loan) is `ctx.ref(key)` — toItem's second argument; the hook loads the target entity
once and re-maps the cards when the names arrive:
```tsx
toItem: (b, ctx) => ({ id: b.id, title: ctx.ref('gast') ?? tx('Ohne Gast'), subtitle: ctx.ref('zimmer') }),
```
Outside toItem: `x.refLabel(record, 'gast')` — `x` is the search the record CAME FROM (`record` is one
of `x.records`), never the target's search: `gaeste.refLabel(buchung, 'gast')` has no names for `gast`
and returns undefined (a live page showed ids that way) — complete once `x.select.loading` is false (the hook
loads the names before it publishes the list), so a list built from `x.records` + `refLabel` in an
effect or state never sees an id. A JourneyRecord has NO `<key>Name` fields — those
exist only on `useDashboardData`'s enriched records; `fieldText(b, 'gastName')` is always empty
and gate 3w rejects any field key the entity does not have.

**Restricting the pick.** Nearly every selection step is "only the free rooms", "only open assignments",
"only active staff". Say it as `filter` — vSQL, applied server-side to the count, the first page and every
search (`"r.v_status == 'verfuegbar'"`, `"r.v_rueckgabedatum is None"`, `"r.v_aktiv == True"`). Never
filter the items array yourself: the count and the search would disagree, and a live page lost its
restriction that way. Every `filter` comes with its TypeScript twin `where` — the same rule in the language tsc checks
(`filter: "r.v_status == 'verfuegbar'", where: r => fieldLookup(r, 'status')?.key === 'verfuegbar'`).
check-intents 3p requires the pair; `check-staging` then sends the filter to the REAL server (the parser
that runs it live — a 400 comes back with the server's message) and runs both over the entity's records:
they must agree. Should the server ever reject the filter at runtime, the hook loads unfiltered and
`where` restricts — the user sees a correct list, never an empty picker.

vSQL as the platform accepts it (all probed live): a DATE field takes `today()`, `today() - days(7)` or
`@(2026-08-29)` — never `now()` (400) and never a quoted string (matches nothing); a DATETIME field takes
`now()`; booleans `== True`; a lookup its key; "linked to the picked record" is `refFilter('einsatz', id)` from
`@/lib/journey` (`'<id>' in str(r.v_einsatz)`, same for multipleapplookup) — list comprehensions and
`r.v_x[0]` are invalid. `where: r => …` is the client-side fallback for what vSQL cannot say — and the only
option on the public door (grants cannot filter; `check-public` rejects `filter` there). Read fields with
the typed helpers instead of casts: `fieldText(r, 'name')`, `fieldLookup(r, 'status')` → `{ key, label } | null`,
`fieldLookups(r, 'ausstattung')` → `{ key, label }[]` for a multiplelookup (never `as string[]` — the objects would render as React children, #31 live),
`fieldNumber`, `fieldDate`, `fieldRef` (the id an applookup points at). An entity with no text of its own (a link
entity) may pass `searchFields: []` — then pair it with a `filter` that keeps the set small; the layer loads it
whole and the cards are searched client-side.

**The picked record itself — no second request.** After `onSelect={id => …}` you often need more than the
label: the customer the Einsatz links to, its date, its status. The hook already holds the record:
`x.recordOf(id)` returns the `JourneyRecord` it rendered the card from (`fieldRef(x.recordOf(id)!, 'kunde')`).
A record the hook never showed — the linked customer behind that ref, a record from the URL — is
`await servicePort.get('kundenstamm', kundeId)` (null when gone). Never `servicePort.list(entity, { filter:
\`r.record_id == '${id}'\` })`: `r.record_id` is not a vSQL name (400 at runtime; the id is `r.id`), and a
list for one id is what `get` is for — check-intents 3l rejects both.

A LINK entity (its recognisable columns are applookups — a Zuweisung, a Buchungsposten) has no
searchable text of its own: `searchFields` must be STRING fields OF THAT entity, never its applookups
(gate 3j rejects them — vSQL would match the record URL, not the name). When users would search by the
linked record's name, let them pick that record on its OWN step (useRecordSearch on the target entity)
and filter the link entity by the picked id.

```tsx
const gaeste = useRecordSearch(servicePort, 'gaeste', {
  searchFields: ['vorname', 'nachname', 'email'],       // STRING fields only — check-intents 3j rejects the rest
  toItem: g => ({ id: g.id, title: `${g.fields.vorname ?? ''} ${g.fields.nachname ?? ''}`.trim(),
                  subtitle: String(g.fields.email ?? '') }),
  orderby: ['r.v_nachname asc'],
});
const data = useDashboardData({ omit: ['gaeste'] });     // do not pull the table you are searching

{step === 1 && (
  <EntitySelectStep {...gaeste.select} selectedId={f.get('gast') as string}
    onSelect={id => { f.set('gast', id, gaeste.labelOf(id)); setStep(2); }} />
)}
```

`labelOf(id)` is the display name of any record seen so far — use it for `f.set`, because a search hit is
not in any array you hold. After an inline create call `await gaeste.reload()` for THIS entity instead of
`fetchAll()`.

```tsx
// ❌ 3.000 guests as one array — the page loads them all and the picker is a wall
items={gaeste.map(g => ({ id: g.record_id, title: `${g.fields.vorname} ${g.fields.nachname}` }))}
// ✅ counted, paged and searched by the layer
const gaeste = useRecordSearch(servicePort, 'gaeste', { searchFields: ['nachname'], toItem: … });
<EntitySelectStep {...gaeste.select} onSelect={…} />
```

### StepNav · SummaryStep · SuccessStep · ChoiceGroup
- `StepNav`: `onBack?`, `onNext?` (return `form.validate(...)` to stay with the field marked; a returned string
  is shown as the reason; a bare `false` only gets a generic hint and is rejected by check-intents 3n), `nextStepLabel?` ("Weiter: X"),
  `nextLabel?`, `backLabel?`, `nextDisabled?`, `hideBack?`, `busy?`, children between the buttons.
- `SummaryStep`: `forms` + `submit` (required), `whatHappensNext?`, `title?`, `confirmLabel?`,
  `items?: { key, label, value, step?, keys?, fieldId? }[]` for extra rows. A row the page COMPUTES (a total, a status
  the plan sets, today's date) has no input behind it: `{ key, label, value }` is complete — no `keys`, no `fieldId`,
  no `step`; never invent one.
- `SuccessStep`: `result` (required — only `submit.result` fits), `next: { label, href? | onClick? }[]`,
  heading verb from the plan (`result.created`: "angelegt" / "aktualisiert"; override `verb`), `actions={{ copy, print }}`
  to drop the copy/print buttons on an internal status change,
  (first = primary; hrefs only `#/` or `#/intents/<slug>`), `forms?` (facts), `title?`, `whatHappensNext?`.
  The heading is `title` — there is NO `heading` prop (live: a lane guessed one and lost a gate round).
- `ChoiceGroup`: spread `f.choice(key)`; `allowClear?` for optional choices.

### BudgetTracker — one meter for "used of available", money OR count
The mechanics (percent, bar, colour steps, remaining line) are the block's; the MEANING is yours:
`format="currency"` (default — money, formatted as €) or `format="count"` with `unit` (seats, hours, pieces).
`texts` overrides any word (`{ booked, of, remaining, over, none }`). Render only when a maximum exists
(`budget <= 0` shows a deliberate bar-less card).

```tsx
// ❌ WRONG — seats through the money default: "Gebucht 1,00 € von 12,00 €" (live; check-intents 3q rejects it)
<BudgetTracker budget={maxTeilnehmer} booked={belegt} label={tx('Kursauslastung')} />
// ✅ RIGHT — say what the numbers are
<BudgetTracker format="count" unit={tx('Plätze')} budget={maxTeilnehmer} booked={belegt} label={tx('Kursauslastung')} />
<BudgetTracker budget={5000} booked={ausgegeben} label={tx('Materialkosten')} />   // money, the default
```

### StatusBadge
`<StatusBadge statusKey={r.fields.status?.key} label={r.fields.status?.label} tone? />` — the colour comes
from a word table of common German keys (gebucht = green, offen = amber …). When your status means something
else (an "offen" position is neutral, not a warning), say `tone="positive" | "warning" | "danger" | "info" | "neutral"`; same colours via
`getStatusColor(key)`. Colours a fixed table of ~30 German keys; unknown keys render neutral — never
rebuild the table.

### AvailabilityRangePicker
`blocked: { start, end? }[]` (ISO, `end` EXCLUSIVE — the departure day frees the resource), `value`/`onChange`
(`f.range(...)` provides both), `minNights?`, `months?`, `disablePast?`, `legend?: boolean | string` (a string adds a caption to the colour key). Occupied nights are
struck through and unselectable; back-to-back bookings work. Data can go stale while the form is open — the
form re-validates the range on confirm.

---

## CRITICAL: NEVER use the pre-generated `{Entity}Dialog` inside an intent UI

The `{Entity}Dialog` components are the generic CRUD forms: every field, one modal, every situation. A
wizard step shows only what THIS decision needs, in the most ergonomic form.

```tsx
// ❌ DON'T — the full 10-field modal over the wizard
{step === 3 && <BuchungenDialog open onSubmit={…} />}
// ❌ DON'T — the CRUD dialog as the "Neu erstellen" slot
<EntitySelectStep createDialog={<KundenDialog open onSubmit={…} />} />
// ✅ DO — nothing: `{...x.select}` brings the layer's InlineCreate (the entity's required fields, created through the port)
// ✅ DO — `create={{ fields: [...] }}` when THIS decision needs other 2–4 fields
```

`check-intents` rejects any `@/components/dialogs/*` import.

---

## CRITICAL: Never link the user from an intent UI to a platform record list

Allowed link targets: `#/` (dashboard) and `#/intents/<other-slug>` (follow-up flow) — `<other-slug>`
ONLY from the "FLOWS OF THIS RUN" list in your brief (or the registry in `src/config/intents.ts`); a
guessed slug is a dead link (gate 8 rejects it; at runtime `SuccessStep` redirects an unknown slug to the
one flow sharing a token, else drops the action). The sidebar owns the
record lists. On success the `next` actions are "do it again" (reset), the follow-up flow, the dashboard —
never "Zur Buchungsübersicht".

---

## Anti-Patterns (DO NOT BUILD)

- ❌ Status kanban / filtered table / read-only stats of ONE entity → dashboard or platform list
- ❌ A hand-written summary, success screen, draft, retry guard or validation → the layer owns them
- ❌ Two date fields for a stay → `AvailabilityRangePicker`
- ❌ Building record URLs (`createRecordUrl`) inside a plan → plain ids, the port converts

---

## Technical Rules

These are MANDATORY — violation causes TypeScript build errors, gate failures or runtime crashes:

- **Rules of Hooks**: ALL hooks before any early return. `check-hooks` (ESLint) fails otherwise.
- **The journey layer**: `useJourneySubmit` + `<SummaryStep>` + `<SuccessStep>` in every flow (`check-intents`).
- **Import hygiene**: only import what you use (`tsc` strict).
- **No `{Entity}Dialog`**, **no platform-list links** — see above.
- **No `toISOString()` anywhere in the file** — `check-intents` scans the whole file. The bindings and
  `DatePicker` already yield the right strings; for anything else use `format(d, 'yyyy-MM-dd')` /
  `format(d, "yyyy-MM-dd'T'HH:mm")` from date-fns.
- **Delete = undo, not confirm**: a record you remove in a flow goes through `undoToast(msg, () => recreate)`
  from `@/lib/polish` — never a confirm dialog (`check-intents` flags a `delete…Entry` call without `undoToast`).
- **`<SelectItem>` never gets an empty value** (Radix throws): use `ChoiceGroup` or the `'none'` sentinel and
  keep the sentinel out of the payload; name the local state differently from the field
  (`check-lookup-keys` reads `<field>: '<literal>'` as a write).
- **Lookup keys come from `LOOKUP_OPTIONS`** (`@/types/app`) — index with `?.` on both levels and `?? []`;
  never guess a key (`check-lookup-keys`). Prefer `options[0]?.key` over a literal for a default.
- **When you replace a declaration, grep for its callers** — a deleted setter with a surviving call is TS2304.
- **No Bash file ops, no read-back, touch-friendly (no hover-only buttons).**

## Data Access

- Reads: `useDashboardData()` — plain arrays per entity (`kunden` is `Kunden[]`), `{entity}Map` (a real
  `Map`) for applookup targets, `loading`, `error`, `fetchAll()` (after an inline create).
- Writes: the plan via `servicePort` (`@/services/journeyPort`). Direct `LivingAppsService.update…Entry` /
  `delete…Entry` only for side effects outside the plan (an undo, a status flip in a `run` step).
- Field names: `src/types/app.ts`. Method names are spelled in your brief — copy them.
- Required fields carry `!` in the brief; the generated rules enforce them in `form.validate()` and the
  summary. A required field the step deliberately does not ask must be supplied in `values` (or the
  summary will list it as missing).
- The message for an empty required field comes from `src/lib/journey/messages.ts` (the orchestrator's
  sentence per field, else „„Label" ist ein Pflichtfeld") — never write your own „ist erforderlich" text
  into a page. When THIS flow knows more than the entity, override per field:
  `useStepForm('buchungen', { messages: { zimmer: tx('Bitte ein Zimmer für diese Buchung wählen.') } })` — an
  instruction (what is needed), never an explanation why.

## Available Libraries

- **shadcn/ui** (`@/components/ui/*`): Button, Input, Textarea, Checkbox, Select, Badge, Dialog, Tabs.
- **@tabler/icons-react**: all icons prefixed `Icon`; `stroke` prop, not `strokeWidth`.
- **date-fns**: `format`, `parseISO`, `differenceInCalendarDays`, `addDays`; locale via `dateFnsLocale()` from `@/i18n`.

## Design Tokens

Use the existing CSS custom properties — do NOT create new ones: `bg-card`, `bg-secondary`, `bg-primary`,
`bg-destructive/10`, `text-foreground`, `text-muted-foreground`, `text-primary-foreground`, `rounded-2xl`,
`shadow-lg` for card wrappers.

## Reusable Blocks (src/components/blocks/)

A reusable presentational piece of a step (a slot grid, option tiles, a quantity stepper) goes to
`src/components/blocks/<Name>.tsx`. Blocks are shared with PUBLIC pages, so they are strictly
**props in, callbacks out, no data access** — a block that needs data takes `port: JourneyPort` as a
prop and calls `port.list(...)` / `port.create(...)`; it never imports `livingAppsService`,
`useDashboardData`, `publicClient`, `@/services/journeyPort` or `@/lib/journey/publicPort`
(`check-blocks` fails the build). The page picks the door.

```tsx
// ❌ WRONG — the block chose a door, now it only works logged-in
export function SlotGrid() { const { termine } = useDashboardData(); … }
// ✅ RIGHT — the block renders what it is given (or loads through the port it received)
export function SlotGrid({ slots, onSelect }: { slots: Slot[]; onSelect: (s: Slot) => void }) { … }
```

## Required fields the flow does not ask for

`useStepForm` treats a field as part of the form only when it is *bound* — listed in `fields` or given a step in `steps`. A required entity field you never ask for (a status the flow sets itself, the room of a booking you only update) is not "missing" in the review step and is not validated; set it in the plan (`values: { status: 'bestaetigt' }`) when the domain needs it, or leave it alone when the step updates an existing record. Facts of a picked record that you show in the summary via `items` share one source — give them the same `keys` (e.g. `['_recordId']`) and the summary offers one "Auswahl ändern" for the group instead of a per-row "Ändern" that can only reopen the picker.

## A field the flow does not need

The app's required flag is the default: `*`, blur validation, listed as missing in the review. When THIS
flow can do without the field, say so where it counts — `useStepForm(entity, { required: { estimated_hours: false } })` —
and mark, validation and review follow. Never a `hint={tx('Optional')}` next to a `*` (gate 3x): the user
skips the field and the review then refuses to confirm (live).

## The owner's field policy applies to flows too

After the build the owner can narrow a flow in the dashboard ("Abläufe verwalten" → "Felder anpassen"): hide a field, make it required, relabel it, give it a fixed value — without a rebuild. The journey layer applies those rules at runtime to exactly the bindings you write (`useStepForm('entity', { fields: [...] })`, `form.field('key')`, `<Field form={form} name="key">`), so bind every field through the layer and never keep a second copy of a value in your own state: a hidden field must vanish completely, and `IntentWizardShell` skips a step the owner emptied. Fields you set yourself outside the layer (`values`, `initial`, plain `useState`) are invisible to the owner's table — that is the reason not to.

## Step headings

The shell renders each step's `label` as the heading of the content card, so the user always reads what to do. Give every step a one-sentence `description` in the user's words — what to do here, not what the system does: `{ label: tx('Zeitraum'), description: tx('An- und Abreise wählen — belegte Nächte sind ausgegraut.') }`. Use `heading` only when the short indicator label is not a good heading (`label: 'Gast'`, `heading: 'Gast auswählen'`). SummaryStep and SuccessStep bring their own heading and hide the shell's.

## Dates and initial values

Dates render through `<Bound form={f} name="key" />` (it picks the DatePicker itself) or, inline,
`<DatePicker {...f.date('key')} />` from `@/components/DatePicker` — there is NO `@/components/ui/date-picker`
(two lanes guessed that path live) and never a native `<input type="date">`. A prefilled value belongs to the form, not to the input: `useStepForm(entity, { initial: { ausgabedatum: todayIso() } })` (`todayIso` from `@/lib/journey`, local calendar day; `nowIso()` is the datetime twin, `yyyy-MM-dd'T'HH:mm` — never build either with `format(new Date(), …)` in a page). `defaultValue` on any input is rejected by the gate: it shows a value the form never has, so the review step says the field is empty while the user sees it filled (live).

**A value the page derives (a compiled text from the picked records, a default from a pick) goes in with `f.prefill('key', value)`, never `f.set`.** `prefill` writes only while the field is empty or still holds the last prefill — never over what the person typed or over a draft the shell restored after a reload. Live (Abnahme 6): an effect did `f.set('bearbeiteter_text', compiled)` once the records loaded; after a reload it ran again over the restored draft, and with the picked record not loaded yet the text lost its introduction — the person confirmed a prompt without its instruction. check-intents warns on `.set(` inside a `useEffect`.

## Declared steps = rendered steps

`steps` given to the shell is the truth for the indicator, "Schritt n von m" and `wizard.next()`. Render only steps you declared — a review rendered as `step === 4` with three declared steps is unreachable (the gate rejects it). The review is a declared step ("Prüfen") that renders `<SummaryStep>`; its confirm button runs the plan.

## Review and success rows — the layer's, not yours

- A date pair bound with `f.range('anreise', 'abreise')` is ONE review row that already counts: „12.–15. März 2026 · 3 Nächte". Never add a `Nächte`/`Tage` item — it replaces the dates and doubles the count.
- `<Field>`/`<Bound>` render the field's label. No heading with the same text above them (gate 3t warns); an „optional" note goes into `hint`.
- "Ändern" in the review works without a `steps` map: a form learns a field's step from the step it was filled on. `steps` stays useful for the answer chips and for fields prefilled via `initial`.
- A value the PLAN supplies (`values`, `link`, a status the flow decides) is NOT declared in `steps` and not listed in `fields`: the review would show an empty „—" row for it (the form never holds the value), and a field mapped to the review step itself gets no „Ändern" (there is no input to jump to). Show a decided value with an `items` row (`{ key, label, value }`); the success screen gets it from the written record.
- A record pick always carries its NAME: `{...f.records(key, x.labelOf)}` for a multi pick, `f.set(key, id, x.labelOf(id))` for a single one. `f.set(key, ids)` without the label does not compile (the third argument is required on applookup fields; gate 3v adds the hint) — the review would show `6a9ae0fdd32995434b7edfb2`. Pills over a `useDashboardData` array are not a pick step; the step is `EntitySelectStep` fed by `useRecordSearch`.
- No `restart` function: `<SuccessStep result={submit.result} submit={submit} forms={[f]} next={[…]} />` — with `submit` given the first action is „Noch einmal“ (resets plan and forms, jumps to step 1); `restartLabel` renames it.
- A step that needs an earlier answer says so: `<WizardStep label={tx('Zimmer')} needs={['anreise', 'abreise']}>` — the shell renders „Dieser Schritt braucht zuerst: Anreise, Abreise“ with the way back; no hand-written `StepNav nextDisabled` panel.
- An update-only journey (state in `useState`, one `run` step) needs no `facts` on `<SuccessStep>`: the review remembers its rows on confirm and the success screen shows them.

## Update-only journeys

A journey that changes an existing record (return a tool, check a guest out, assign a ticket) is a plan
step with `updates` — the record's id, static or from a done step — and otherwise exactly a create:
```tsx
const f = useStepForm('buchungen', { fields: ['status'], initial: { status: 'eingecheckt' } });
// The initial value of a lookup is one of its option KEYS — the one the brief asks for, matched by
// label. Never the first option because the brief's word is missing: leave it out instead.
// check-intents rejects a value that is not an option.
const submit = useJourneySubmit(servicePort, [
  { key: 'checkin', entity: 'buchungen', form: f, updates: buchungId, primary: true },
]);
```
A step whose values ALL come from the plan (`{ key: 'status', entity: 'werkzeuge', updates: werkzeugId,
values: { status: 'verliehen' }, needs: ['ausleihe'] }`) needs NO `form` — never build an empty
`useStepForm` just to fill the slot (live: two lanes did, one with `steps: {}`).
The plan list says „aktualisiert“, the success heading „Buchung aktualisiert“, the review shows the form's
rows, the record's facts come from `x.recordOf(buchungId)`. References go through `link`/`values` as plain
ids — the port shapes them. Never `LivingAppsService.update…` or `createRecordUrl` in a flow (gate 3z warns):
that path skips the names, the review and the success facts. A `run` step stays the escape hatch for
anything that is neither a create nor a single update (set `verb` there).
