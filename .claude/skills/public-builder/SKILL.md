---
name: public-builder
description: >
  Build or upgrade PUBLIC pages — pages for anonymous visitors without a
  LivingApps account, shared via link/QR. Activate when the user asks for a
  public form, booking page, public list ("freie Termine", Speisekarte,
  offene Stellen), landing/submission page, or wants an existing public
  form to become nicer/custom.
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep]
---

# Public Page Building Skill

Public pages are served at `/#/public/<slug>` to ANONYMOUS visitors. They
talk to a restricted public API through `@/lib/publicClient` — never to
`livingAppsService` (that needs a login and would break for every visitor).

## The contract: you declare, the service grants

You never create permissions yourself. You do exactly three things:

1. **Write the page component** in `src/pages/public/<Pascal>.tsx`.
2. **Register its slug** in `src/pages/public/registry.tsx` (markers only).
3. **Declare its data needs** in `_public/surface.json`.

After the build, the Klar service validates your declaration, creates the
public permissions (as unpublished drafts — the owner publishes with one
click), and serves each page its runtime config in `public-pages.json`.

## Existing pages (upgrade path)

Read `_agent_context/public_pages.json` first. It lists the owner's current
public pages (slug, entity, fields, published). To UPGRADE one (e.g. "make
the registration form a booking page"), reuse its **exact slug** — the
shared link and QR codes keep working. Declaring a changed data policy
automatically un-publishes the page until the owner confirms it again;
that is expected, mention it in your summary.

## Reuse intent flows

`_agent_context/intents.json` (when present) lists the dashboard's internal
workflow pages ("Abläufe"): route, label, a summary docblock, the components
each flow composes and the service methods it writes with. When the requested
public page matches one of these flows — an internal booking wizard and a
requested public booking page are the same flow — mirror its step sequence,
labels, and presentational pieces instead of inventing a new flow. But swap
the data layer completely:

Wrong: copy the intent page keeping `useDashboardData()`,
`LivingAppsService.createBuchungenEntry(...)` or `<BuchungenDialog>` —
every one of these needs a login and dies for anonymous visitors.
Right: same steps and layout; reads become `listPublicRecords` behind a
`scope`, writes become `createPublicRecord`, the form is built from the
page's `fields` config.

## The page component

Before writing: Read `.lane-context.md` — the API index of this tree (every entity's fields with
kinds, options and targets; every `@/lib/journey` export with its signature; every block's props).
It replaces `src/types/app.ts` and every grep over `src/lib/journey` / `src/components/blocks`.

Compose from `PublicShell` + blocks + widgets; data flows only through
`publicClient`.

UI TEXT (multilingual): public pages follow the visitor's browser language
(de/en; more languages attach later as overlays). Write every UI string ONCE
in German and MARK it with `tx` from `@/i18n` (`{tx('Absenden')}`,
`` tx`${n} freie Plätze` `` for interpolation) — the pipeline translates
after the build; never write translations or makeT tables yourself.
`@/i18n` is anonymous-safe and allowlisted in check-public.

```tsx
import { useEffect, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig, listPublicRecords, createPublicRecord,
  prepareChallenge, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';

export default function Booking() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ALWAYS pass the slug: it is what lets the OWNER open the page while it
    // is still a draft (it then renders with a preview banner). Without it an
    // unpublished page is unavailable even to its owner.
    loadPublicPagesConfig('buchung').then(c => {
      setCfg(c);
      setPage(c?.pages['buchung'] ?? null);
      setLoading(false);
    });
  }, []);

  if (loading || !cfg || !page) {
    return <PublicShell loading={loading} unavailable={!loading} />;
  }
  // list endpoints: listPublicRecords(cfg, page, { appId, limit, offset })
  //   → returns a Record<string, PublicRecordResult>, NOT an array: take
  //     Object.values(...) when you want a list.
  //   A conditional fallback must keep that type:
  //     appId ? listPublicRecords(cfg, page, { appId }) : Promise.resolve<Record<string, PublicRecordResult>>({})
  //   A bare Promise.resolve({}) widens everything to unknown (TS18046 on
  //   every r.fields) — check-public rejects it.
  //   Public grants cannot filter or count (allowed query: field/limit/offset;
  //   max 500). `useRecordSearch(publicPort, …)` works — it loads up to 500 and
  //   searches client-side, and the step still adapts cards/search-first
  //   to the count. Above 500 records a public picker is the wrong design — ask
  //   for a link parameter or a narrower `scope`.
  // create endpoints: createPublicRecord(cfg, page, fields)
  // A PublicRecordResult is { id, fields, created_at, updated_at } — the id
  // field is `id`, NOT `record_id`. That name belongs to the INTERNAL record
  // types in @/types/app, which public pages never import. A live build
  // declared `interface WebsiteRecord { record_id: string; … }` and cast the
  // result onto it: TS2352, one failed build and a repair round.
  // `fields` is a Record<string, unknown> — the anonymous surface ships no
  // schema, so every value needs its own cast on the way into your interface
  // (a live build collected 13 TS2322s in one page, one per field):
  //   WRONG: unternehmensname: r.fields.unternehmensname ?? null,
  //   RIGHT: unternehmensname: (r.fields.unternehmensname as string) ?? null,
  // page.endpoints tells you which app_id serves which op — the field is
  // OPTIONAL in the type, so always access it with `?.` (tsc errors on the
  // bare form with TS18048):
  //   WRONG: const ep = page.endpoints.find(e => e.op === 'create');
  //   RIGHT: const ep = page.endpoints?.find(e => e.op === 'create');
  return <PublicShell title={page.title} description={page.description} wide>…</PublicShell>;
}
```

Layout — pick the shell mode by page type:
- Forms and small booking flows: default column (640px), or `wide` (still
  only 672px). In these modes the shell already renders the hosted-page
  card around your children — accent strip, title block (from
  `title`/`description`), white card, footer. Put fields and content
  directly inside; the page looks finished without any layout work.
- Landing pages: `<PublicShell fullBleed>` — the shell's form columns are
  FAR too narrow for hero sections and card grids. With `fullBleed`, build
  full-width bands and give each section its own inner container
  (`max-w-5xl mx-auto px-4`).
- No `intro` on a public wizard: the shell's title and subtitle already say what the page does, and the
  wizard ignores the prop on a `#/public` route anyway — a visitor starts in step 1.
- Wizards (`IntentWizardShell`) render INSIDE the shell's card like any
  other column content. The shell widens the card to the intent pages'
  column on its own when a wizard is inside — do not pass `wide` for it.
  Never pass `plain` for a wizard: a live pair of dashboards shipped the
  same 0.0.331 shell, but the wizard page opted out and looked like a
  different product next to the carded form.
- `plain` (opt out of the shell's card) is a rare escape hatch for a page
  that genuinely composes several SEPARATE top-level surfaces. It
  sacrifices the standardized hosted look — when in doubt, stay in the
  card and separate sections inside it (spacing, borders).

Wrong: a landing page inside `wide` — the 672px column crushes a 3-column
card grid into ~200px cards and truncates every course name and time.
Right: `fullBleed` + full-width hero band + sections with their own
`max-w-5xl` containers; no `truncate` on names, dates, or prices a
visitor must read.

Wrong: `<PublicShell title={…}><div className="rounded-[27px] bg-card
shadow-lg p-6">…</div></PublicShell>` — the shell already draws that card;
nesting another one shows a card inside a card.
Right: `<PublicShell title={…}><form className="space-y-5">…</form>
</PublicShell>` — or `plain` if the page really brings its own surfaces.

Rules:
- NEVER import `livingAppsService`, `useDashboardData`, or any dialog/page
  from the dashboard — anonymous visitors have no session.
- NEVER use in-page anchors (`<a href="#...">`) — the app is hash-routed,
  so the click REPLACES the route and navigates the visitor off the page.
  Scroll with a button + `ref.scrollIntoView({ behavior: 'smooth' })`
  (check-public rejects anchor hrefs).
- Page-to-page navigation (e.g. "back to the overview") uses the router:
  `import { Link } from 'react-router-dom'` + `<Link to="/public/<slug>">`.
  Never a raw `href` — the app lives under a sub-path (`/objects/<id>/`),
  so `href="/#/public/x"` resolves against the SITE root and dumps the
  visitor on the platform (a live back button did exactly that). And never
  a target outside `/public` — anonymous visitors have no session in the
  dashboard. check-public rejects root-relative hrefs and non-public
  navigation targets.
  Wrong: `<a href="/#/public/verfuegbarkeit">Zurück</a>`
  Right: `<Link to="/public/verfuegbarkeit">Zurück</Link>`
- Call `prepareChallenge(cfg, page, 'POST', `/apps/${appId}/records`)` on
  the first form interaction so submits feel instant. It returns `void`, not
  a Promise, and already swallows its own errors — chaining `.catch(…)` onto
  it is a TS2339 that cost a live build a repair round.
- Handle `PageUnavailableError` by rendering `<PublicShell unavailable />`.
- Mobile-first; most visitors open a shared link on a phone.

## registry.tsx — markers only

```tsx
// <public:imports>
import { lazy } from 'react';
// </public:imports>
…
  // <public:pages>
  'buchung': lazy(() => import('@/pages/public/Booking')),
  // </public:pages>
```

Never touch `PublicPage.tsx`, `PublicFormPage.tsx`, or `publicClient.ts`.

## _public/surface.json — the declaration

One file, all your public pages. Ops: `list` (read with a filter) and
`create` (anonymous submit) — **there are no others**. Field names must exist
on the entity (check `app_metadata.json`).

**An anonymous visitor can never MODIFY an existing record.** "Register for
this meeting" is a `create` in a registration entity, never an edit of the
meeting.

Wrong: `{ "entity": "sitzungen", "op": "update", "fields": ["angemeldete"] }`,
or a hand-rolled `fetch(..., { method: 'PATCH' })` around publicClient. Both
pass every gate and are thrown away by the ingest AFTER the deploy — a live
page cost 304 lane-seconds and left the dashboard with no public page at all.
Right: `{ "entity": "anmeldungen", "op": "create", "fields": [...] }`.

**If the brief needs an edit and no registration entity exists, the page is
NOT buildable.** Write `<staging>/<slug>.blocked.json` =
`{"reason": "<one sentence: what is missing>"}`, write nothing else, and stop.
That is a legitimate outcome and it is reported to the owner — inventing an op
is not.

**One flow = ONE page.** Every page is a separate publish decision for the
owner. Declare ALL data a page needs as endpoints of THAT page — one page
may carry several list/create endpoints across different entities
(`page.endpoints` tells the runtime which app_id serves which op).

Wrong: a booking page plus two component-less "list pages" it reads from —
the owner must publish three things before one link works.
Right: one `buchung` page with three endpoints (list slots, list courses,
create booking); one publish, one link.

```json
{
  "version": 1,
  "pages": [{
    "slug": "buchung",
    "component": "Booking",
    "title": "Termin buchen",
    "endpoints": [
      { "entity": "slots", "op": "list",
        "fields": ["slot_start", "slot_end", "slot_label"],
        "scope": "r.v_available == True",
        "scope_description": "zeigt nur Termine mit verfügbar = ja",
        "max_records": 100 },
      { "entity": "buchungen", "op": "create",
        "fields": ["name", "email", "slot"],
        "preset_fields": { "status": "neu" } }
    ]
  }]
}
```

`max_records` is capped at **500** by the platform (the grant is rejected
above it); the service clamps larger values to 500, so declare what the page
actually needs and page with `limit`/`offset` beyond that.

**A page reached with a link parameter MUST declare it.** If the page reads
`?sitzungId=…` (an invitation, a personalised booking link), add a
`link_param` block — otherwise the owner has no way to obtain a working
link: the management UI can only offer the bare page URL, which such a page
answers with "link incomplete". A live build shipped exactly that: a page
demanding a parameter that nothing in the whole dashboard produced.

```json
"link_param": {
  "slug_note": "sits next to slug/component/title, NOT inside endpoints",
  "name": "sitzungId",
  "entity": "sitzungen",
  "label_field": "titel",
  "secondary_field": "datum"
}
```
`name` is the query parameter your page reads, `entity` supplies the value
(the record's id — the `id` field of a PublicRecordResult) and needs a `list`
endpoint on this SAME page — the page can
only show a record it may read. `label_field`/`secondary_field` are what the
owner sees when picking a record. The service then generates one link per
record under Verwaltung → Öffentliche Seiten → Links (each link with its QR code there — the dashboard shows the same symbol via `@/components/widgets/QrCode` wherever it offers the link; a public page itself never needs one). `check-public` rejects
a page that reads a parameter without declaring it.

Still give the page a sensible state WITHOUT the parameter (a short note, or
a list to pick from) — visitors do share bare URLs.

- `scope` is a vSQL filter over `r`. Lists take BRACKETS: `r.v_status not in ['storniert', 'angefragt']` —
  parentheses are a 400 that only shows after the deploy (live: the booking page lost its occupancy).
  `check-staging` probes every scope against the real server. Two hard syntax rules (the server
  probes the expression and rejects the whole page otherwise): fields are
  ALWAYS accessed with the `v_` prefix (`r.v_status`, never `r.status`),
  a DATETIME field compares with `now()`, a DATE field with `today()` or a
  `@(YYYY-MM-DD)` literal — the other way round is a 400, a quoted string
  against a date matches nothing. Example: `r.v_einsatz_beginn >= now()`. Keep scopes simple — one or two
  conditions. ALWAYS pair scope with a plain-language `scope_description`
  — the owner confirms that text when publishing, never the vSQL.
- Visitors type their OWN data: `useStepForm(entity, { fields: [...], autoComplete: true })` switches
  browser autofill on (given-name, email, postal-code… from the generated rules). The layer leaves it
  off by default because the dashboard's team enters other people's data; `check-public` rejects a
  public page that forgets it.
- `preset_fields` are server-owned values the visitor can neither see nor
  override; `fields` is the strict allowlist of what a visitor may submit.
- A preset VALUE for a lookup must be one of the field's option keys (`lookup_data` in
  `app_metadata.json`) AND the one the owner asked for — match the owner's word against the
  option LABELS ("als Anfrage" → the key whose label reads Anfrage). If no option matches, do
  NOT fall back to the first one: three live pages turned public requests into `angenommen`,
  `geplant` and `aktiv`. Leave the preset out and name the gap in your summary; `check-public`
  rejects a value that is not an option — and a preset on a field the owner named ("Status …")
  when none of the field's options appears in the owner's words.
- A preset key must be a FIELD OF THE ENTITY (the brief's `name![type: keys]` list, `app_metadata.json`).
  "The team sets the status later" in a brief is an intention, not a field — when the entity has no
  `status` control, there is nothing to preset: leave it out. `check-staging` checks your fragment;
  the integration drops such a key anyway, so it never helps.
- The create payload may carry ONLY keys from that endpoint's `fields` —
  ONE undeclared key rejects the WHOLE submit at runtime, and the generic
  catch message is all the visitor ever sees.

Wrong: `createPublicRecord(cfg, page, { ...form, status: 'offen' })` with
`status` not in `fields` — every submit fails with 400.
Right: `"preset_fields": { "status": "offen" }` in the endpoint, and the
payload sends only the declared `fields`.
- Never put a preset key into the payload yourself — not in the form, not in
  the plan's `values`. The grant rejects it (`unallowed_fields`), and the
  client drops preset keys before the request anyway: the declaration alone
  decides. `values: () => ({ status: 'anfrage' })` next to
  `preset_fields: { status: 'anfrage' }` is dead code.
- The stay's resource (`OCCUPANCY[entity].resource`, e.g. `zimmer`) is a FORM
  FIELD: list it in `useStepForm(entity, { fields: [...] })` and bind it
  (`f.record('zimmer')`, or the EntitySelectStep calling `f.set('zimmer', id, label)`).
  Page state handed over through `values` never reaches the draft, the summary
  or validation — a reload lost the room and the record was created without
  one (live-seen). `useStepForm` makes the resource required on its own;
  `check-public.mjs` rejects a form for that entity without it.

Wrong: `const [zimmer, setZimmer] = useState<string>(); … values: () => ({ zimmer: zimmer ?? '' })`
Right: `useStepForm('buchungen', { fields: ['zimmer', 'anreisedatum', 'abreisedatum', …] })` and `f.set('zimmer', id, label)` from the room picker.
- A `required` control in `app_metadata.json` is an INTERNAL duty for the
  team, not an entry duty for a visitor. Ask what the visitor can actually
  know: a table number, an assigned employee, or a confirmation status is
  the team's job AFTER the submit — leave those out of `fields` entirely and
  the record is created with them empty. Only preset a field when a fixed
  value is genuinely correct for every submission (a status like "neu").
- But a field you DO list in `fields` must have a real input in the form.
  Declaring a required field and never sending it makes every submit fail
  with 400 — `check-public.mjs` rejects that.

Wrong: `preset_fields: { "tisch": "…/records/abc" }` — pinning every
visitor to one hard-coded table just to satisfy an internal duty.
Right: `tisch` appears in neither `fields` nor `preset_fields`; the
reservation arrives without a table and the team assigns one.
- Expose the MINIMUM: every field you list is world-readable (list) or
  world-writable (create).
- Lookup fields (`lookup/*`, `multiplelookup`) reach the page as `{ key, label }`
  — a multiplelookup as an ARRAY of them — on both doors: the public port
  hydrates the grant's bare keys so page code compares the same way everywhere.
  Read them with `fieldLookup(r, key)` / `fieldLookups(r, key)` from
  `@/lib/journey`, compare `.key`, show `.label`. Never `as string` /
  `as string[]`: a live landing page cast `ausstattung as string[]` and handed
  React the objects as children — React #31 for every visitor, green through
  tsc. `check-public` rejects the cast.
- applookup fields in a LIST projection return the record's reference URL — a
  foreign key. To show the referenced record's data, declare a second list
  endpoint for the target entity on the SAME page and join client-side
  (extract the record id from the URL).
- **`file` fields: readable AND uploadable.** In a `list` projection the value
  comes through as a plain file URL you can drop straight into `<img src=…>`
  — those URLs serve anonymously. That is how a logo, a hero image or a
  gallery reaches a public page. In a `create` endpoint a visitor uploads a
  document into a file field: list the field in the endpoint's `fields` and
  bind it with `<Bound form={f} name="angebot_pdf" />` (or
  `<FileField {...f.file('angebot_pdf')} />` from
  `@/components/blocks/FileField`). The file travels INSIDE the create as a
  data URL; the block limits type (PDF, image, Word, Excel …) and size
  (10 MB). ONE file per file field — there are no anonymous attachments
  (`/files` and attachments are not grantable). A wish for more documents
  than the entity has file fields: build the fields it has and say in your
  summary how many more file fields the structure needs. Never replace an
  upload with a link or text field.
- Listing a file field HANDS OUT the link to that file. Right for a logo,
  wrong for a vaccination record or an ID scan — expose deliberately, and say
  in your summary which files the page makes public.
- WRITING an applookup value (a create endpoint, e.g. linking a registration
  to the participant you just created): the anonymous surface accepts ONLY
  grant-scoped URLs. Build them with `recordRef(cfg, page, appId, recordId)`
  from `@/lib/publicClient`, or pass a reference through exactly as a list
  response returned it. Never assemble a record URL yourself.

Wrong: `teilnehmer: \`https://…/rest/apps/${appId}/records/${id}\`` — the
REST form is rejected with 400 "Unsupported field value", and the page
only fails at the LAST step of a multi-create flow.
Right: `teilnehmer: recordRef(cfg, page, tnEp.app_id, created.id)` — or, on the
journey layer, a plan step with `link: { teilnehmer: 'teilnehmer' }` (the
port shapes the reference; nothing to build by hand).

Wrong: page fetches everything and filters client-side
(`fields: [all 12 fields]`, no scope — leaks the whole table).
Right: `scope` narrows the rows server-side, `fields` lists only the 3
columns the page actually shows.

## Reusable blocks

Extract reusable presentational pieces (slot grid, option tiles, stepper)
to `src/components/blocks/` — props in, callbacks out, NO data-client
imports (`scripts/check-blocks.mjs` enforces this). Blocks are shared with
intent UIs, so keep them auth-agnostic.

Pre-provided flow blocks already live there — compose them instead of
rebuilding steppers (`check-public` rejects a page that keeps its own step state and buttons without the shell): `IntentWizardShell` (wizard container; pass
`back={false}` on public pages — anonymous visitors have no dashboard),
`StepNav`, `SummaryStep`, `SuccessStep`, `ChoiceGroup`, `EntitySelectStep`
(searchable pick-an-item list), `BudgetTracker`, `StatusBadge`,
`AvailabilityRangePicker` (availability-aware date-range calendar, see below).

## The journey layer on a public page — same blocks, the public door

A public form or wizard is the same journey as the internal flow; only the
data door differs. The journey layer (`@/lib/journey`, allowlisted) gives a
public page validation with real field labels, the review step, the success
screen with reference/copy/print, the draft and idempotent writes — with the
grant-scoped adapter instead of the service:

```tsx
import { useStepForm, useJourneySubmit } from '@/lib/journey';
import { createPublicPort } from '@/lib/journey/publicPort';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';

const port = useMemo(() => createPublicPort(cfg, page), [cfg, page]);   // after cfg/page loaded
// `required` mirrors the PAGE's fields config — the platform's internal
// required flags do not bind an anonymous visitor (the grant decides).
const anfrage = useStepForm('buchungen', {
  fields: page.fields.map(f => f.key),
  required: Object.fromEntries(page.fields.map(f => [f.key, f.required])),
  steps: { anreise: 1, abreise: 1, vorname: 2, nachname: 2, email: 2 },
});
const submit = useJourneySubmit(port, [{ key: 'anfrage', entity: 'buchungen', form: anfrage, primary: true }], { draftKey: 'buchung' });

<IntentWizardShell steps={STEPS} currentStep={step} onStepChange={setStep} back={false} forms={[anfrage]} draftKey="buchung">
  {step === 1 && <><AvailabilityRangePicker {...anfrage.range('anreise', 'abreise', { blocked })} /><StepNav onNext={() => anfrage.validate(['abreise'])} nextStepLabel={tx('Kontakt')} /></>}
  {step === 2 && <><Input {...anfrage.field('vorname')} /><Input {...anfrage.field('email')} /><StepNav onNext={() => anfrage.validate(['vorname', 'nachname', 'email'])} nextStepLabel={tx('Prüfen')} /></>}
  {step === 3 && !submit.done && <SummaryStep forms={[anfrage]} submit={submit} whatHappensNext={tx('Wir melden uns innerhalb eines Tages per E-Mail.')} />}
  {submit.result && <SuccessStep result={submit.result} forms={[anfrage]} next={[{ label: tx('Weitere Anfrage'), onClick: restart }]} />}
</IntentWizardShell>
```

Rules the layer settles for you: record ids stay plain (`port.ref` shapes
the grant reference — never `recordRef` by hand inside a plan), the port
creates through EVERY create endpoint the page declares in surface.json (an
entity without one throws with the fix in the message), `port.list(entity)`
reads through the page's list endpoints (declare them in surface.json), and
the success screen renders ONLY from `submit.result`.

**Two records from one page (a guest, then the booking that links it) are two
PLAN STEPS, never a hand-written create:**
```tsx
const submit = useJourneySubmit(port, [
  { key: 'gast', entity: 'gaeste', form: gast },
  { key: 'buchung', entity: 'buchungen', form: buchung, primary: true, needs: ['gast'], link: { gast: 'gast' } },  // field ← id of the done step
], { draftKey: 'buchungsanfrage' });
```
Both entities need a `create` endpoint on the page; `link` writes the grant
reference for you. List the MAIN record's endpoint first — the page's
entity (title, reference, occupancy read) is the create target that
references the others, else the first listed. A `PublicShell` renders the heading — give
the inner `IntentWizardShell` no `title`.

Wrong: `createPublicRecord(cfg, page, {...})` in a hand-written submit handler
with its own required check and a "Vielen Dank" div.
Right: `useJourneySubmit(port, plan)` + `<SummaryStep>` + `<SuccessStep>` —
one review step, one reference, a retry that never duplicates.

**Booking-style pages MUST use `AvailabilityRangePicker`.** Whenever the
page both LISTS occupancy (an entity with a start/end date pair and a
free/booked status) and lets the visitor request a date range, the visitor
must SEE availability in the picker itself and must be UNABLE to select an
occupied night — not learn about it from an error after submitting. The
block does all of it (month grid, blocked nights struck and unselectable,
no range across an occupied night, min-nights, legend, i18n); map the
listed records into its `blocked` prop and bind `value`/`onChange`:

```tsx
import { AvailabilityRangePicker } from '@/components/blocks/AvailabilityRangePicker';
import { occupancyFor } from '@/lib/journey';
// ONE rule for "which nights are taken" — decided by the build orchestrator in
// src/config/journey.ts and applied by the same function the internal flow
// uses, so both calendars always agree: stay pair, picked resource, no
// cancelled records. Never filter by hand. No rule for the entity → no
// calendar (two DatePickers), no availability claim.
const blocked = occupancyFor('buchungen', Object.values(records), { resource: f.get('zimmer') as string });
<AvailabilityRangePicker {...f.range('anreise', 'abreise', { blocked, minNights: 3 })} />
```

The form's range binding re-validates the picked stay against `blocked` on
confirm — the availability on the page can go stale between load and submit.
Do not re-derive overlap logic: departure days are EXCLUSIVE (back-to-back
bookings are legal), and the block already encodes that convention. Let the
visitor pick the RESOURCE (room, vehicle) before the calendar — occupancy is
per resource; a calendar over all rooms at once blocks nights that are free.

Availability semantics: `occupancyFor` maps only occupying records into
`blocked` — **absence of a record means available**, and a cancelled or
"free" record is just as available as no record at all. Never render
per-record "free" markers: a calendar where three explicitly-marked days are
green and every other free day looks neutral tells the visitor the neutral
days are NOT bookable (a live page did exactly that). Occupied is the only
state worth marking; everything else is selectable.

Wrong: two bare `<DatePicker>` / `<input type="date">` fields next to a
separate availability list — the visitor can request an occupied period
and only finds out by mail days later.
Right: one `AvailabilityRangePicker` fed from the same list endpoint the
page already loads; the two dates land in the create fields on submit.

**One heading per page.** `PublicShell` renders the title and `IntentWizardShell`
renders one too — giving both the same text prints it twice, which is the most
visible flaw a visitor sees.

Wrong: `<PublicShell title="Antrag einreichen"><IntentWizardShell
title="Antrag einreichen" …>` — two identical `<h1>` above each other.
Right: title on `PublicShell`, and `IntentWizardShell` gets only a `subtitle`
(or nothing) — its `title` is optional.

## Before finishing

Run `node scripts/check-public.mjs` and `node scripts/check-blocks.mjs`
(both must be green — check-public verifies the import allowlist and that
every registered slug is declared in surface.json) plus the standard
gates, then `npm run build`. In your summary: name the page's slug, state
that it is a DRAFT until the owner publishes it, and quote the
`scope_description` you declared.

## Dates and initial values

Dates render through `<Bound form={f} name="key" />` (it picks the DatePicker itself) or, inline,
`<DatePicker {...f.date('key')} />` from `@/components/DatePicker` — there is NO `@/components/ui/date-picker`
and never a native `<input type="date">`. A prefilled value belongs to the form, not to the input: `useStepForm(entity, { initial: { ausgabedatum: todayIso() } })` (`todayIso` from `@/lib/journey`, local calendar day; `nowIso()` is the datetime twin, `yyyy-MM-dd'T'HH:mm` — never build either with `format(new Date(), …)` in a page). `defaultValue` on any input is rejected by the gate: it shows a value the form never has, so the review step says the field is empty while the user sees it filled (live).

**A value the page derives (a compiled text from the picked records, a default from a pick) goes in with `f.prefill('key', value)`, never `f.set`.** `prefill` writes only while the field is empty or still holds the last prefill — never over what the person typed or over a draft the shell restored after a reload. Live (Abnahme 6): an effect did `f.set('bearbeiteter_text', compiled)` once the records loaded; after a reload it ran again over the restored draft, and with the picked record not loaded yet the text lost its introduction — the person confirmed a prompt without its instruction. check-intents warns on `.set(` inside a `useEffect`.

## Presets and identifiers (check-public rules 3q and 3w)

A `preset_fields`/`default_fields` value is only allowed when the OWNER asked
for it — the request names the field and, for a lookup, one of its options.
Anything else is a value nobody ordered, written into every record the page
creates (live: `status: 'angenommen'`, `kundentyp: 'privat'`): leave it out;
if the record cannot do without it, ask the visitor. Identifiers
(`*nummer`, `*number`, `*_nr`) never belong to a public page — not computed
(`AU-${date}-${rand}` collides), not preset (`'AUSSTEHEND'` is a
placeholder), not typed by the visitor (editable). Drop the field; the
platform or a tool numbers the record afterwards, the success page shows the
layer's reference. The same holds for the other doors (rule 3x): a create
field the visitor never enters and the owner never asked for must not be
filled by the page through plan `values` or `form.set` (live:
`annahmedatum: todayIso()`), and an amount (`*preis`, `*betrag`, `total`,
…) is never computed in the browser and written — display an estimate if you
like, but a tool prices the record. `useStepForm(…, { initial: { key } })` is
the same door (rule 3x): a prefilled value the owner never asked for lands in
every record whose visitor does not change it. And internal state — `status`,
`kundentyp`, `prioritaet`, anything `*_status` — is never a visitor's control
(rule 3z): the operator or a tool sets it afterwards. Only what the OWNER
named is on the page.

## The owner's field policy (after the build)

The owner adjusts a page in the dashboard without you: hide a field, make it
required, fix a value, relabel it, change the texts. That policy lives in
`_agent_context/public_pages.json` (`pages[].policy`) and outlives every
re-declaration — it is the contract, your surface is the material. When you
change a page: keep hidden fields out (do not re-add an input for them), keep
fixed values out of your fields, and never mention a fixed value in your
summary as if the visitor chose it. The grant enforces the policy whatever the
code does; the render-smoke runs your page under it.

The owner can also narrow a LIST after the build: a filter in plain words ("Besucher sehen nur Einträge, bei denen Status ist verfügbar" — conditions joined by and/or), a lower `max_records`, hidden columns. Your `scope` is parsed into that table and becomes the owner's to edit or remove, as long as it stays within the grammar: `==`, `!=`, `<`, `<=`, `>`, `>=`, `in [...]`, `not in [...]`, `is None`, `is not None`, `True`/`False`, numbers, `now()`/`today() ± days(n)`, `@(YYYY-MM-DD)`, joined by `and` OR by `or` (not both, no nested groups, no other functions). A scope outside the grammar stays text the owner cannot change without you — so stay inside it. Consequence for you: never derive availability or any other visitor-facing rule from a column in the browser (`records.filter(r => r.fields.status === …)`) — put it into `scope` and show what the grant returns. A column that only feeds such a filter is a column the owner may hide, and then the page would silently change.

## The render-smoke (runs after your build, before the deploy)

`node scripts/render-smoke.mjs` renders every page in `_public/surface.json`
once in jsdom, fed with a synthetic `public-pages.json` built from your
surface entries and real (or generated) records, then walks the wizard: fills
each step with example input, presses "Weiter", confirms the summary against
a mocked door (nothing is written). It fails the page when: the page crashes,
it reports "not available" against its own declaration (the slug you load
must be the slug in surface.json), a step shows a heading but no control or
card, "Weiter" leaves the step without a message, or the summary blocks on a
required field no step asked for. Run it yourself before you finish:
`node scripts/render-smoke.mjs --page <slug>`. Its ERROR lines name the step
and what was visible — that is what a visitor would have seen.

## Nothing read before the send (EF-39)

A check before sending (is the poll still open, is the name already taken, is the question still active) goes into `useJourneySubmit(port, plan, { check: async () => … })` — never into the click handler before `submit.run()`. Offline that read fails and the page says „hat nicht geklappt“ instead of „gesichert, wird gesendet“; inside `check` a network error is the offline way and the resend checks again.

## Fixed slots (EF-37)

When the structure holds a list in fixed slots (`termin_1..termin_5`), the page shows at most that many — and when the list has MORE, it says so above the table („Es gibt 6 Terminvorschläge, hier ist Platz für 5.“). Never `slice(0, n)` silently: check-public refuses it in the lane.

## A vote matrix on a phone (EF-35)

A table of options (dates × answers) scrolls sideways on a phone. The person's own inputs (name, e-mail) go ABOVE the table, never into its sticky first column; the sticky column shows text only and stays narrow (`max-w-[40vw]`). Live a 402 px sticky column with the name inputs covered the whole 375 px screen — no vote button was reachable. A machine key (a row id, a submission id) is never shown to the visitor.

## One row per submission, never per name, never per record (EF-43, EF-46)

Records a page lists AND creates (one answer per person per option) are shown one row per SUBMISSION. One send creates one record per option, so the row is neither the record (Doodle KB 7: nine rows for three people, „–“ in the other columns) nor the typed name (KB 6: two people with the same name became one row and the older one's votes left the sums). The group key is the page's own device/row key (`derived:device` field, `useVisitorKey()`); without one, the same name within a few seconds of `createdAt` is one send, and the same name from a later send is a second row that says when. The layer does it:

```tsx
import { submissionsOf, fieldRef } from '@/lib/journey';
const rows = submissionsOf(antworten, { key: 'zeilen_kennung', names: ['vorname', 'nachname'] });   // key: the device field, when the page writes one
rows.map(s => <tr key={s.key}><td>{s.label}</td>{termine.map(t => <td key={t.id}>{choice(s.records.find(r => fieldRef(r, 'termin') === t.id))}</td>)}</tr>)
```

Every stored record counts exactly once in the sums. check-public refuses a `Map`/index keyed on a name field in the lane; the render-smoke serves two sends of the same name (two records with one key, one second apart, plus one from another device) and fails a page that shows the name once (folded) or three times (per record).

## Editing a live page: the write path stays (EF-45)

An edit order about the display (rows, marks, texts, layout) never touches the write path: `useStepForm(...)` fields, every plan step's `entity`/`values`/`link`, a `createPublicRecord` payload. Keep that code byte-identical — the plan steps stay an array of `{ entity: '…', form, values: () => ({ … }) }` with the field names as literal keys; do not move the values into a helper or a block body. check-public compares the staged page with the live source (`<Component>.live.tsx`) and fails the lane when a write is gone unless the owner named the field.

## Exactly one „most popular“ (EF-44)

A rank has one winner. Never mark every option whose count `=== Math.max(...)` — at a tie two options read as the most popular. Use `topOne(items, [scores…], earliest)` from `@/lib/journey`: most yes, then most maybe, then the earliest date, then list order; compare ids (`t.id === top?.id`). `topOne` returns null when nobody voted yes.

## Tap targets (K8)

Every button a thumb presses — a vote cell, a hand-made radio, a chip — is at least 44 px high (`min-h-11`, and `min-w-11` for an icon-only button). Live the vote buttons were 68×30 px. `ChoiceGroup` and `Bound` already are; a `role="radio"` button without a 44 px class fails check-public in the lane.

## E-Mail and consent (EF-32)

An e-mail next to a consent box is sent ONLY with the tick — the public client drops it otherwise (`withConsent` in `@/lib/consent`, applied to every create). Tell the visitor before sending: `personalWithoutConsent(entity, values)` → a sentence under the box („Ohne Häkchen speichern wir deine E-Mail nicht.“). Never send the e-mail and hope a tool clears it later.

## Labels

**No time of day in a fixed text** (Bau 14: the thank-you said „Dein Kürzel für heute Abend“ at every hour). A page is opened in the morning, at noon, the day after. Wrong: „für heute Abend“, „heute Nachmittag“, „Guten Morgen“. Right: „für diese Veranstaltung“, or the record's own date from `fieldText`.


**Default: `<Bound form={f} name="key" />`** (`@/components/blocks/Bound`) — label from the entity's rules, required mark, optional `hint`, error line and the control in ONE element. `<Field form={f} name="key">…</Field>` (`@/components/blocks/Field`) is for a control you place yourself (`<Input {...f.field('key')} />`, `<ChoiceGroup {...f.choice('key')} />`, `<Combobox {...f.record('key')} …/>`). Never nest them — `<Field><Bound/></Field>` is redundant (the layer renders one label anyway, `check-public` warns). `check-public` rejects a bound control without a label.

## Drafts, offline, and the e-mail offer (P-14, acceptance 4)

- Every wizard and every one-screen form passes the SAME `draftKey` to `useJourneySubmit` and `<IntentWizardShell>` — a text a visitor typed survives a reload. A one-screen form WITHOUT the shell is covered too: `useJourneySubmit` keeps the plan's forms under the key itself (K10a, Abnahme 7). `check-public --file` fails a `useJourneySubmit` without `draftKey`. Per record a page is opened for (`link_param`), the key carries the id: `draftKey={`beitrag-${veranstaltungId}`}`.
- Offline is the layer's: `submit.offline` is true when the send failed for want of a network, the review shows „Keine Verbindung — deine Eingaben sind gesichert.“ and the runner sends again by itself on `online`. Never write your own offline banner, never `alert`.
- A link whose record does not exist says so — „Dieser Link passt zu keiner Veranstaltung. Scanne bitte den QR-Code noch einmal.“ — never the empty state of a valid record („keine Frage geöffnet“) (Abnahme 7). But ONLY after the list LOADED: `if (!live.loaded && live.error) return <LoadProblem onRetry={live.reload} />` (`@/components/blocks/LoadProblem`), then `if (live.loaded && !record) …unknown link` — a 429/503 or a dropped connection is not an unknown link (P-17, Abnahme 8); the list hooks retry by themselves until the first load succeeds.
- A date the visitor reads is `fieldText(r, 'datum')` (formatted, „07.11.2026“); `fieldDate` is the ISO value for comparing and computing, never shown (Abnahme 8: „2026-11-07“ on the participant page).
- An empty „Senden“ is never silent: `form.validate()` marks the fields and the controls come from `<Field>`/`<Bound>` (they show the error); a page with its own inputs renders `<FieldErrorSummary form={form} />` above the button. Focus moves to the first missing field only for controls bound through the layer (`form.field(…)`/`<Bound>`) — an input of your own gets no focus (Abnahme 8).
- The visitor's code (`useVisitorKey()`) is ONE per device for the whole dashboard — never a `name` option (A9: two names, two codes, the e-mail landed with no feedback). A page the brief lists under „The same visitor's other pages“ is linked from the success state.
- A consent sentence stands ONCE: as the checkbox's text, not again as the field label above it (A9).
- An e-mail field or a consent belongs where the plan puts it — never offered before the visitor finished the main thing, and always with a plain „Nein, danke“ that leaves the record without it.

