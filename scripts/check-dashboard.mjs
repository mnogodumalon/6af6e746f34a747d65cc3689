#!/usr/bin/env node
/**
 * check-dashboard.mjs — mechanical pre-build gate for DashboardOverview.tsx.
 *
 * Runs in Step 3 (after parse-formulas.mjs, before `npm run build`). Exits
 * non-zero with actionable messages; fix every ERROR and re-run until green.
 * Text-based on purpose: cheap, deterministic, no AST dependency.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const FILE = 'src/pages/DashboardOverview.tsx';
let src;
try {
  src = readFileSync(FILE, 'utf8');
} catch {
  console.error(`ERROR: ${FILE} not found — run from the project root.`);
  process.exit(1);
}

const errors = [];
const warnings = [];

// Comments must be INVISIBLE to every gate — in both directions: a comment
// MENTIONING a banned token fired an error (live: the agent documented the
// rule with `// Today key using clock (never toISOString)` above correct
// code and went gate-red), and a comment naming a REQUIRED token would mute
// a must-gate. Layout-preserving strip: every comment character becomes a
// space, newlines stay — offsets and line numbers keep matching the raw
// file, so quoted lines stay verbatim-editable. Opt-out markers
// (layout-opt-out:, details-opt-out:, i18n-exempt) LIVE in comments and are
// checked against the raw source on purpose.
function stripCommentsKeepLayout(s) {
  let out = '';
  let i = 0, inStr = null, esc = false;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      out += c; i++; continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue; }
    if (c === '/' && n === '/') {
      while (i < s.length && s[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (c === '/' && n === '*') {
      while (i < s.length && !(s[i] === '*' && s[i + 1] === '/')) { out += s[i] === '\n' ? '\n' : ' '; i++; }
      if (i < s.length) { out += '  '; i += 2; }
      continue;
    }
    out += c; i++;
  }
  return out;
}
const code = stripCommentsKeepLayout(src);
const codeLines = code.split('\n');

// EntityCrud discriminator — the DUAL-SHAPE switch. Pages built since the
// EntityCrud scaffold call useEntityCrud() (the plumbing owner); LEGACY pages
// exist too: the update flow regenerates this gate but PRESERVES the old
// hand-rolled overview, so every rule below must accept both shapes — a rule
// that goes red on a correct legacy page bricks every existing dashboard on
// its next update/repair cycle.
const usesEntityCrud = /\buseEntityCrud\s*\(/.test(code);

// Quote the offending source lines VERBATIM (untrimmed, from the RAW file)
// in every pattern-based message: the fix is then a direct Edit with that
// exact string — the agent never has to re-Read the file just to locate a
// reported line. Detection runs on the stripped twin at the same index.
const dashLines = src.split('\n');
const quoteLines = (re, max = 6) => {
  const hits = [];
  for (let i = 0; i < codeLines.length && hits.length < max; i++) {
    if (re.test(codeLines[i])) hits.push(`    line ${i + 1}: ${dashLines[i]}`);
  }
  return hits.length ? '\n' + hits.join('\n') : '';
};

// 1. UTC day-shift trap
if (code.includes('toISOString')) {
  errors.push("toISOString() found — day keys MUST use date-fns format(d, 'yyyy-MM-dd') (toISOString is UTC; the day flips at the wrong hour)." + quoteLines(/toISOString/));
}

// 1b. Phantom tone colors: the theme defines no success/warning/danger/info
// color — Tailwind generates nothing for these classes and the element
// renders UNSTYLED (a live heatmap shipped with every trained day invisible).
// Tone words belong in widget PROPS (tone='success'), never in class names.
{
  const PHANTOM_TONE_RE = /\b(?:bg|text|border|ring|fill|stroke)-(?:success|warning|danger|info)(?:\/\d+)?\b/;
  if (PHANTOM_TONE_RE.test(code)) {
    errors.push("Tone word used as a CSS color (bg-success/text-warning/…) — these colors do not exist in the theme; the class silently renders NOTHING. Tone words are widget PROPS; as colors use the real palette (emerald/amber) or the primary/destructive/muted tokens." + quoteLines(PHANTOM_TONE_RE));
  }
}

// 2. Page skeleton: DashboardGrid or a written opt-out
if (!code.includes('<DashboardGrid') && !src.includes('layout-opt-out:')) {
  errors.push("Page layout is hand-rolled — compose <DashboardGrid hero/kpis/aside/primary> (it owns grid, mobile order, entrance). A genuinely different page shape needs a `// layout-opt-out: <reason>` comment.");
}

// 3. Polish layer imported
if (!code.includes("from '@/lib/polish'")) {
  errors.push("No import from '@/lib/polish' — the polish layer (useClock, gruss, namen, undoToast) is mandatory, do not re-derive it by hand.");
}

// 4. Drag/status writes need the undo toast
if (/onCardMove|onEventDrop|onEventResize/.test(code) && !code.includes('undoToast(')) {
  errors.push('Drag/status write handlers found but no undoToast(...) — every write gets feedback + Rückgängig (counter-write).');
}

// 5. Record clicks open the overlay — via a shell (legacy) or via the
// EntityCrud API (openDetail / crud.overlay.push|replace).
if (/onCardClick|onEventClick|onMarkerClick/.test(code)
    && !code.includes('<RecordOverlay')
    && !/\bopenDetail\s*\(/.test(code)
    && !/\boverlay\.(?:push|replace)\s*\(/.test(code)) {
  errors.push('onCardClick/onEventClick/onMarkerClick wired but nothing opens the record overlay — wire the click to crud.<entity>.openDetail(record) (or a <RecordOverlay> on legacy pages); every record click opens the overlay (RecordView HARD RULE).');
}

// 6. Unguarded parseISO on optional record fields — the sandbox build does NOT
// enforce strictNullChecks, so parseISO(undefined) crashes at RUNTIME
// ("Cannot read properties of undefined (reading 'split')"), taking the whole
// dashboard down for one record with a missing date.
// A parseISO(x.fields.FIELD) is safe when the SAME field is guarded — these
// shapes count, so the natural readable patterns don't trip the gate:
//   · inline on the same line:        x.fields.F ? parseISO(x.fields.F) : …   /  x.fields.F && …  /  x.fields.F!
//   · try/catch on the same line:     try { … parseISO(x.fields.F) … } catch {}
//   · early-return in the callback:   if (!x.fields.F) return …; … parseISO(x.fields.F)
//   · a positive block-if above:      if (x.fields.F) { … parseISO(x.fields.F) … }
//     (a live measurement run went gate-red on exactly this correct shape —
//     ~15s repair round for code that was doubly safe)
//   · pre-filter up the chain:        .filter(r => !!r.fields.F) … parseISO(r.fields.F!)
// Only a parseISO with NO guard on its field anywhere nearby is a real crash
// risk (the sandbox build has no strictNullChecks → parseISO(undefined) throws
// at runtime and takes the whole page down).
const unguardedParseISO = [];
for (let i = 0; i < codeLines.length; i++) {
  const line = codeLines[i];
  const m = line.match(/parseISO\(\s*[\w$]+\.fields\.(\w+)\s*\)/);
  if (!m) continue;
  const field = m[1];
  // (a) inline guard on the same line (?, !, &&) or a same-line try/catch
  if (/[!?]|&&|\btry\b/.test(line)) continue;
  // (b) a guard on the SAME field within the preceding lines — an early-return
  //     `if (!x.fields.F) …`, a positive block-if `if (x.fields.F) {`, a
  //     ternary/&&, a try {, or a `.filter(… fields.F …)` that pre-filtered
  //     the chain. Require both: the field is referenced AND a guard token is
  //     present, so an unrelated mention doesn't wave it through.
  const back = codeLines.slice(Math.max(0, i - 8), i).join('\n');
  const fieldGuarded =
    new RegExp(`\\.fields\\.${field}\\b`).test(back)
    && /(!|\?|&&|\breturn\b|\.filter\(|\bif\s*\(|\btry\b)/.test(back);
  if (fieldGuarded) continue;
  unguardedParseISO.push(i + 1);
}
for (const n of unguardedParseISO) {
  errors.push(`Line ${n}: parseISO(x.fields.…) without a guard — one record with a missing date crashes the page. Guard inline (r.fields.X ? … : …), early-return (if (!r.fields.X) return …) before the parseISO, or pre-filter the chain (.filter(r => !!r.fields.X)) and assert with r.fields.X!.\n    line ${n}: ${dashLines[n - 1]}`);
}

// 7. Frozen clock
if (!code.includes('useClock(')) {
  warnings.push("useClock() not used — if any 'today'/overdue/greeting derivation exists, it must tick (a Date captured once shows yesterday tomorrow).");
}

// 8. Filler totals
if (/(?:title|description)\s*=\s*["'{][^"'}]*[Gg]esamt/.test(code)) {
  warnings.push("A KPI mentions 'gesamt' — bare totals are filler; every KPI is a clickable filter or a progress toward a limit." + quoteLines(/(?:title|description)\s*=\s*["'{][^"'}]*[Gg]esamt/));
}

// 9. Aside present (or consciously omitted)
if (code.includes('<DashboardGrid') && !/aside\s*=/.test(code)) {
  warnings.push('DashboardGrid without aside — fine ONLY when the app truly has no secondary slice; otherwise add a WorkList on a different axis than the primary widget.');
}

// 10. rail is deprecated — the side column grows with the SUM of its surfaces
if (/variant\s*=\s*["'{]+rail/.test(code)) {
  warnings.push('variant="rail" is deprecated — compose variant="wide" with a slim <StatStrip> above the primary surface instead (the rail column outgrows the board with real data).');
}

// 11. the 2×2 card grid is legacy — StatStrip is the compact KPI presentation
if (/layout\s*=\s*["'{]+grid/.test(code)) {
  warnings.push('<StatCardRow layout="grid"> is legacy — use <StatStrip><StatStripItem …/></StatStrip> (slim segmented bar) when the cards row is too heavy for the page.');
}

// 12. DashboardGrid owns the entrance — an ENTRANCE wrapper inside a slot
// collapses the aside band into one column and glues the surfaces together
if (/(?:hero|kpis|aside|primary)=\{\s*(?:\n\s*)?<div[^>]*(?:ENTRANCE|entranceDelay)/.test(code)) {
  errors.push('ENTRANCE/entranceDelay wrapper inside a DashboardGrid slot — the grid owns the staggered entrance. Pass slot content bare (aside surfaces as fragment siblings: <><WorkList …/><WorkList …/></>); the wrapper div collapses the band into one column with no gap.');
}

// 12b. Unguarded .localeCompare on record fields — same crash family as the
// parseISO trap: one record without the value ("Cannot read properties of
// undefined") takes the whole page down. A live fleet build crashed exactly
// here, sorting a 'zuletzt hinzugefügt' band on a bare `createdat`.
for (let i = 0; i < codeLines.length; i++) {
  const line = codeLines[i];
  if (!/[\w$]\.(?:[\w$]+)\.localeCompare\(/.test(line)) continue;
  if (/String\(|\?\.|\?\?|&&|\|\|/.test(line)) continue;
  errors.push(`Line ${i + 1}: unguarded .localeCompare on a possibly-empty field — one record without the value crashes the page. Sort with (a.f ?? '').localeCompare(b.f ?? '') or wrap both sides in String(...).\n    line ${i + 1}: ${dashLines[i]}`);
}

// 13. The page header comes FIRST — greeting h1 above the grid, always.
// (A live build shipped KPIs as the first visible element and no greeting at all.)
const gridIdx = code.indexOf('<DashboardGrid');
if (gridIdx >= 0) {
  const h1Idx = code.indexOf('<h1');
  if (h1Idx === -1 || h1Idx > gridIdx) {
    errors.push('No <h1> page header before <DashboardGrid> — EVERY dashboard starts with the greeting h1 (gruss()), context line and primary action ABOVE the grid; KPIs are never the first element.');
  } else if (!/\bgruss\s*\(/.test(code)) {
    // G-7 (04.11.2026): the prompt promises a GREETING, the gate checked only an <h1>
    warnings.push('The page header exists, but the greeting does not come from gruss() (src/lib/polish) — the h1 should read „Guten Morgen!“ from the clock, not a static title.');
  }
}

// 14. Widgets bring their own card chrome — wrapping one in your own rounded
// card (+ glued <h2>) inside `primary` is double chrome and makes the same
// widget look different across dashboards.
{
  const widgetTag = /<(CalendarWidget|KanbanWidget|ResourceTimeline|MapWidget)\b/;
  let from = 0;
  while (true) {
    const p = code.indexOf('primary={', from);
    if (p === -1) break;
    const windowSrc = code.slice(p, p + 800);
    const m = windowSrc.match(widgetTag);
    if (m && windowSrc.slice(0, m.index).includes('rounded-[27px]')) {
      errors.push(`primary slot wraps <${m[1]}> in an own rounded card — widgets bring their card chrome themselves; remove the wrapper (and its glued heading), pass the widget bare.`);
    }
    from = p + 9;
  }
}

// 16. One-axis heuristic for charts: the SAME record field driving a clickable
// KPI (StatCard/StatStripItem with onClick) AND a ChartWidget dimension on one
// page is the decorated mirror — the chart's tone carries that state.
{
  const dimFields = new Set();
  const dimRe = /dimension=\{\{[\s\S]{0,300}?\}\}/g;
  let dm;
  while ((dm = dimRe.exec(code)) !== null) {
    for (const f of dm[0].matchAll(/fields\.(\w+)/g)) dimFields.add(f[1]);
  }
  if (dimFields.size) {
    const kpiRe = /<Stat(?:Card|StripItem)[\s\S]{0,500}?\/>/g;
    let km;
    while ((km = kpiRe.exec(code)) !== null) {
      if (!km[0].includes('onClick')) continue;
      for (const f of km[0].matchAll(/fields\.(\w+)/g)) {
        if (dimFields.has(f[1])) {
          warnings.push(`Field '${f[1]}' drives BOTH a clickable KPI and a ChartWidget dimension — the KPI is the decorated mirror of a chart segment; drop the KPI (the chart is that axis's control (drill/filter) or its tone carries that state).`);
        }
      }
    }
  }
}

// 17. A filter-mode chart + a filterable table column on the SAME field is
// two controls on one axis — when the chart filters, the facet must GO
// (SANDBOX_PROMPT: one axis, one control).
{
  const filterDimFields = new Set();
  let fm = 0;
  while (true) {
    const p = code.indexOf("mode: 'filter'", fm);
    if (p === -1) break;
    // the dimension usually precedes the interaction prop inside the same
    // <ChartWidget> — scan a window around the mode marker
    const windowSrc = code.slice(Math.max(0, p - 1200), p + 400);
    const dm = windowSrc.match(/dimension=\{\{[\s\S]{0,300}?\}\}/);
    if (dm) for (const f of dm[0].matchAll(/fields\.(\w+)/g)) filterDimFields.add(f[1]);
    fm = p + 14;
  }
  if (filterDimFields.size) {
    const colRe = /\{[^{}]*filterable\s*:\s*true[^{}]*\}/g;
    let cm;
    while ((cm = colRe.exec(code)) !== null) {
      for (const f of cm[0].matchAll(/fields\.(\w+)/g)) {
        if (filterDimFields.has(f[1])) {
          warnings.push(`Field '${f[1]}' has BOTH a filter-mode ChartWidget and a filterable table column — two controls on one axis; the chart IS the control, remove 'filterable' from that column (or drop the chart's filter mode).`);
        }
      }
    }
  }
}

// 18. Every RecordOverlay body IS the generated {Entity}Details block — a
// hand-built field list silently loses fields and renders relations as dead
// text (live finding: customer shown by name, phone unreachable; photo doc
// present but no path to the image).
{
  // FILE-LEVEL check, deliberately not a lexical window around the shell:
  // two correct structures beat windowing in live runs — long onEdit/footer
  // props pushed the Details past a 2500-char cutoff, and a named render
  // helper (`render={top => renderOverlayContent(top)}`) put them BEFORE the
  // host element. Gate 19 already enforces ONE overlay shell per page, so
  // per-overlay precision buys nothing; any <XyzDetails JSX usage in the file
  // is the overlay body. Imports never match (the pattern requires `<`).
  // With useEntityCrud the host renders every Details branch INSIDE
  // crud.surfaces — the page correctly contains no <XyzDetails JSX at all,
  // so this legacy rule would false-positive; gate 23 owns the new shape.
  const overlays = (code.match(/<RecordOverlay/g) || []).length;
  const usesDetails = /<\w+Details\b/.test(code);
  if (!usesEntityCrud && overlays > 0 && !usesDetails && !src.includes('details-opt-out:')) {
    errors.push('The <RecordOverlay> body does NOT render the generated <{Entity}Details> block — compose it (record + lists from useDashboardData + onOpenX/onAddX via overlay.push) instead of hand-building fields; a genuinely different body needs a // details-opt-out: <reason> comment.');
  }
}

// 19. ONE overlay shell per page. A <RecordOverlay> per record type (open-flag
// shells) unmounts/remounts backdrop+panel on every drill/back and replays the
// entrance animation — the blink. The Host keeps one shell mounted. With
// useEntityCrud the rule INVERTS: crud.surfaces already owns the one host, so
// ANY hand-rolled shell in the page is a defect.
{
  const shells = (code.match(/<RecordOverlay\b/g) || []).length;   // \b excludes RecordOverlayHost
  if (usesEntityCrud && shells >= 1) {
    errors.push(`${shells} hand-rolled <RecordOverlay> shell(s) next to useEntityCrud() — crud.surfaces already renders the ONE host with every Details branch; open records via crud.<entity>.openDetail / crud.overlay.push and delete the shell.`);
  } else if (!usesEntityCrud && shells >= 2) {
    errors.push(`${shells} <RecordOverlay> shells found — render the WHOLE stack through ONE <RecordOverlayHost overlay={overlay} render={top => switch(top.type){…}}/>; per-type shells replay the entrance animation on every drill (the blink).`);
  }
}

// 20. Loading/error surfaces are pre-generated (incl. the self-repair flow).
// TWO page shapes, told apart by the generator-owned DashboardReady.tsx:
//   ready  — src/pages/DashboardReady.tsx exists: IT runs useDashboardData()
//            and the two surfaces, then mounts this page with `data` as a
//            prop. Calling the hook here again fetches everything twice and
//            re-mounts the loading/error early-return — the React #310 trap
//            the wrapper removed.
//   legacy — no wrapper file: the page calls the hook itself and keeps the
//            two early-returns with the pre-generated surfaces.
// Either way a local rebuild drifts from the repair protocol and re-types
// ~120 lines every build.
{
  const readyWrapper = existsSync('src/pages/DashboardReady.tsx');
  const HOOK_CALL_RE = /\buseDashboardData\s*\(/;
  const EARLY_RETURN_RE = /if\s*\(\s*(?:loading|error)\s*\)\s*return\b/;
  if (readyWrapper) {
    if (HOOK_CALL_RE.test(code)) {
      errors.push("useDashboardData() called although DashboardReady.tsx already loads the data — this page receives it as a prop: `export default function DashboardOverview({ data }: { data: DashboardData })` (type from '@/hooks/useDashboardData'). Delete the hook call and the loading/error early-returns." + quoteLines(HOOK_CALL_RE));
    }
    if (EARLY_RETURN_RE.test(code)) {
      errors.push("loading/error early-return found — DashboardReady.tsx handles both BEFORE this page mounts; the data is loaded. Delete the branch and keep every hook unconditional." + quoteLines(EARLY_RETURN_RE));
    }
    if (!/function\s+DashboardOverview\s*\(\s*\{[^}]*\bdata\b/.test(code)) {
      errors.push("DashboardOverview must take the loaded data as a prop — `export default function DashboardOverview({ data }: { data: DashboardData })` — DashboardReady.tsx passes it in; without the prop the page has nothing to render.");
    }
  } else {
    if (!/import\s*\{[^}]*\bDashboard(?:Skeleton|Error)\b[^}]*\}\s*from\s*'@\/components\/DashboardStates'/.test(code)) {
      errors.push("DashboardSkeleton/DashboardError not imported from '@/components/DashboardStates' — they are pre-generated; import them, do not rebuild them.");
    }
    if (!code.includes('<DashboardSkeleton')) {
      errors.push("<DashboardSkeleton/> early-return missing — keep `if (loading) return <DashboardSkeleton />;` before any data access.");
    }
    if (!code.includes('<DashboardError')) {
      errors.push("<DashboardError/> early-return missing — keep `if (error) return <DashboardError error={error} onRetry={fetchAll} />;`.");
    }
  }
  if (/(?:function|const)\s+Dashboard(?:Skeleton|Error)\b/.test(code)) {
    errors.push("Local DashboardSkeleton/DashboardError definition found — these ship in '@/components/DashboardStates'; delete the local copy and import them.");
  }
}

// 23. EntityCrud owns the plumbing (gate-20 pattern: import required, usage
// required, local re-implementation banned). Applies ONLY when the page calls
// useEntityCrud() — legacy pages (preserved pre-EntityCrud overviews the
// update flow keeps verbatim) are exempt by construction.
{
  const ENTITY_DIALOG_PASCALS = ["Umfragen", "Terminvorschlaege", "Antworten"];
  if (usesEntityCrud) {
    if (!/import\s*\{[^}]*\buseEntityCrud\b[^}]*\}\s*from\s*'@\/components\/EntityCrud'/.test(code)) {
      errors.push("useEntityCrud() called but not imported from '@/components/EntityCrud' — keep the pre-generated import.");
    }
    if (!/\.surfaces\b/.test(code)) {
      errors.push('useEntityCrud() called but {crud.surfaces} is never rendered — the entity dialogs and the overlay host live there; render it as the LAST child of the page JSX.');
    }
    if (code.includes('<RecordOverlayHost')) {
      errors.push('Hand-rolled <RecordOverlayHost> next to useEntityCrud() — crud.surfaces already renders the host (with every Details branch); use crud.overlay for drills and the footer option for the next-step action.');
    }
    if (/\buseRecordOverlayStack\s*\(/.test(code)) {
      errors.push('useRecordOverlayStack() called next to useEntityCrud() — the stack lives on crud.overlay; a second stack means two overlays fighting. Use crud.overlay.push/replace/close.');
    }
    for (const p of ENTITY_DIALOG_PASCALS) {
      if (new RegExp('<' + p + 'Dialog\\b').test(code)) {
        const camel = p[0].toLowerCase() + p.slice(1);
        errors.push(`<${p}Dialog> rendered in the page next to useEntityCrud() — the dialog is already mounted inside crud.surfaces; open it via crud.${camel}.openCreate(defaults) / crud.${camel}.openEdit(record) and delete the local JSX (and its useState).`);
      }
    }
  } else if (ENTITY_DIALOG_PASCALS.length > 0 && !src.includes('crud-opt-out:')) {
    warnings.push("Page does not use useEntityCrud() — new pages compose the pre-generated CRUD plumbing (crud.<entity>.openCreate/openEdit/openDetail + {crud.surfaces}); hand-rolling it costs ~150 lines per write. A conscious exception needs a // crud-opt-out: <reason> comment. (Preserved legacy pages: ignore, this is a warning by design.)");
  }
}

// 24. No dynamic import() of first-party modules. The app is one bundle;
// `await import('@/services/livingAppsService').then(({ LivingAppsService }) => …)`
// buys nothing and makes Vite print "dynamically imported … but also
// statically imported" — a WARNING on a green build, which an agent then
// "repaired" with two edits and a second full build cycle (live: +40s).
// Every '@/…' module is a plain static import (the skeleton already imports
// LivingAppsService from the service module); lazy chunks belong to the
// scaffold (App.tsx routes, MapWidget's leaflet), never to this page.
{
  const DYN_IMPORT_RE = /\bimport\s*\(\s*['"](?:@\/|\.{1,2}\/)/;
  if (DYN_IMPORT_RE.test(code)) {
    errors.push("Dynamic import() of a first-party module — the app is one bundle, Vite only warns about the mixed static/dynamic import and the code gains nothing. Add the name to the static import at the top of the file (the skeleton already imports LivingAppsService, extractRecordId, createRecordUrl from '@/services/livingAppsService') and call it directly." + quoteLines(DYN_IMPORT_RE));
  }
}

// 25. A change an update flow owns is never written from this page. The flow
// records who and when (a review, a decision); a dashboard button that sets
// the state itself bypasses that control (live 20.10.2026: „Freigeben“ set a
// proposal to approved without reviewer or date, next to the very flow the
// owner's prompt asked for). The page opens the flow for the record:
// flowActionFor(entity, field, id, value) from '@/config/plan'.
{
  const OWNED = {"updateUmfragenEntry": {"entity": "umfragen", "fields": {"finaler_termin": [{"slug": "umfrage-abschliessen"}], "status": [{"slug": "umfrage-abschliessen", "value": "geschlossen"}]}}};
  const callRe = /\b(update\w+Entry)\s*\(/g;
  let m;
  const hits = [];
  while ((m = callRe.exec(code))) {
    const own = OWNED[m[1]];
    if (!own) continue;
    let depth = 0, j = m.index + m[0].length - 1;
    for (; j < code.length; j++) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')' && --depth === 0) break;
    }
    const args = code.slice(m.index + m[0].length, j);
    const keys = new Set();
    for (const k of args.matchAll(/[{,]\s*(\w+)\s*(?::|(?=[,}]))/g)) keys.add(k[1]);
    for (const field of Object.keys(own.fields)) {
      if (!keys.has(field)) continue;
      const line = code.slice(0, m.index).split('\n').length;
      const flows = own.fields[field].map(o => `„${o.slug}“${o.value !== undefined ? ` (sets '${o.value}')` : ''}`).join(', ');
      hits.push(`${own.entity}.${field} — owned by ${flows}\n    line ${line}: ${dashLines[line - 1]}`);
    }
  }
  if (hits.length) {
    errors.push(`This page writes a field an update flow owns — the flow records who and when, a direct write bypasses it. Replace the write with the flow: \`const go = flowActionFor('<entity>', '<field>', r.record_id, '<target key>')\` (import from '@/config/plan'; null while the flow is not live) and \`action: go ? { label, onClick: go } : undefined\`; a drag calls go?.() and returns a short notice:\n  ` + hits.join('\n  '));
  }
}

// 25b. Every flowActionFor(entity, field, …) names a change a flow of the plan
// owns — otherwise it is null forever and a board move or card button only
// says „not available“ (Abnahme 5, 04.11.2026: the moderation board's move to
// FREIGEGEBEN never reached the built flow).
{
  const OWNED = {"updateUmfragenEntry": {"entity": "umfragen", "fields": {"finaler_termin": [{"slug": "umfrage-abschliessen"}], "status": [{"slug": "umfrage-abschliessen", "value": "geschlossen"}]}}};
  const owned = new Set();
  for (const own of Object.values(OWNED)) for (const f of Object.keys(own.fields)) owned.add(`${own.entity}.${f}`);
  const dead = [];
  for (const m of code.matchAll(/\bflowActionFor\(\s*['"](\w+)['"]\s*,\s*['"](\w+)['"]/g)) {
    if (owned.has(`${m[1]}.${m[2]}`)) continue;
    const line = code.slice(0, m.index).split('\n').length;
    dead.push(`${m[1]}.${m[2]} — line ${line}: ${dashLines[line - 1]}`);
  }
  if (dead.length) {
    const known = [...owned].join(', ') || 'none';
    errors.push(`flowActionFor names a change no flow of the plan owns — it is always null, the control can never act. Flows own: ${known}. Use one of them, or write the field directly only if the plan lets the overview write it (plan.dashboard.writes):\n  ` + dead.join('\n  '));
  }
}

// 26. The overview writes only what the plan lets it write itself
// (plan.dashboard.writes — a drag that moves a stay, a button that flips a
// flag). Audit 23.10.2026: the overview moved bookings and set „An Besitzer
// gesendet“ with no plan and no line on „Deine Anwendung“. A plan from
// before that date has no list (null): warn, never fail.
// G-4 (04.11.2026): every file under src/pages (not the flows' and public
// pages — their gates hold them) and under src/components/custom and
// src/components/overview, and a payload kept in a variable
// (`const patch = { status: 'x' }; updateXEntry(id, patch)`) is read too.
{
  const ALLOWED = {};
  const callRe = /\b((?:update|create|delete)\w+Entry)\s*\(/g;
  const walk = (dir) => {
    let out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, n.name);
      if (n.isDirectory()) { if (!['intents', 'public', 'ui'].includes(n.name)) out = out.concat(walk(full)); }
      else if (/\.tsx?$/.test(n.name) && !n.name.endsWith('.example.tsx')) out.push(full);
    }
    return out;
  };
  const files = [...new Set([FILE, ...walk('src/pages'), ...walk('src/components/custom'), ...walk('src/components/overview')])]
    .filter(f => f === FILE || existsSync(f));
  const bad = [];
  for (const file of files) {
    const raw = file === FILE ? src : readFileSync(file, 'utf8');
    const text = file === FILE ? code : stripCommentsKeepLayout(raw);
    const rawLines = raw.split('\n');
    const where = file === FILE ? '' : `${file} `;
    // a payload kept in a variable: const patch = { … } / const patch: X = { … }
    const literalOf = (ident) => {
      const decl = new RegExp(`\\b(?:const|let|var)\\s+${ident}\\s*(?::[^=]+)?=\\s*\\{`).exec(text);
      if (!decl) return null;
      let depth = 0, j = decl.index + decl[0].length - 1;
      for (; j < text.length; j++) {
        if (text[j] === '{') depth++;
        else if (text[j] === '}' && --depth === 0) break;
      }
      return text.slice(decl.index + decl[0].length - 1, j + 1);
    };
    let m;
    callRe.lastIndex = 0;
    while ((m = callRe.exec(text))) {
      const name = m[1];
      const line = text.slice(0, m.index).split('\n').length;
      if (!name.startsWith('update')) {
        bad.push(`${where}${name} — the overview never creates or deletes records itself (open crud.<entity>.openCreate / the record overlay)\n    line ${line}: ${rawLines[line - 1]}`);
        continue;
      }
      let depth = 0, j = m.index + m[0].length - 1;
      for (; j < text.length; j++) {
        if (text[j] === '(') depth++;
        else if (text[j] === ')' && --depth === 0) break;
      }
      const args = text.slice(m.index + m[0].length, j);
      let payload = args;
      // second argument an identifier → its object literal in this file
      const second = /^[^,]*,\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(args.trim());
      if (second && !/[{]/.test(args)) payload = literalOf(second[1]) ?? '';
      const keys = [];
      for (const k of payload.matchAll(/[{,]\s*(\w+)\s*(?::|(?=[,}]))/g)) keys.push(k[1]);
      const allowed = ALLOWED === null ? { entity: name, fields: [] } : (ALLOWED[name] || { entity: name, fields: [] });
      const extra = keys.filter(k => !allowed.fields.includes(k));
      if (extra.length) {
        const only = ALLOWED === null ? 'no plan decided this yet' : `the plan lets this page write only: ${allowed.fields.length ? allowed.fields.join(', ') : 'nothing'}`;
        bad.push(`${where}${allowed.entity}: ${extra.join(', ')} — ${only}\n    line ${line}: ${rawLines[line - 1]}`);
      }
    }
  }
  if (bad.length) {
    const msg = `This page writes fields the plan does not give it (plan.dashboard.writes). A direct write that the plan does not name is invisible on „Deine Anwendung“. Remove the write (use the record dialog: crud.<entity>.openEdit(record)) or ask the owner to change the plan:\n  ` + bad.join('\n  ');
    if (ALLOWED === null) warnings.push(msg + '\n  (plan from before 23.10.2026 — warning only)');
    else errors.push(msg);
  }
}

// 21. Runtime i18n: the dashboard ships its UI languages with a live
// switcher — hardcoded UI strings stay frozen in one language. Every string
// the agent writes is tx-marked (`{tx('…')}` — the pipeline translates) or
// comes from t()/labels from '@/i18n'. Detection is text-based: JSX text
// nodes and localized attributes carrying ≥3 consecutive letters; tx-wrapped
// text never matches (braces/callee break the patterns). Conscious
// exceptions (brand names, codes) take an /* i18n-exempt */ on the line.
{
  const literalHits = [];
  // The closing `<` must start a tag (`</` or `<Tag`). Without that a
  // comparison pair reads as JSX text: `x > 0 && (a.fields.b ?? 0) < y`
  // matched, and the fixer dutifully annotated pure logic (live-seen).
  // The `>` must close a TAG. Without the lookbehind the `>` of an arrow
  // function matched, so `(key: K) => (e: React.ChangeEvent<HTMLInputElement
  // | HTMLTextAreaElement>) =>` was reported as hardcoded UI text and cost a
  // run a gate-red plus an /* i18n-exempt */ on pure type syntax.
  const jsxText = /(?<![=-])>[^<>{}\n]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^<>{}\n]*<[/A-Za-z]/;
  const attrText = /\b(?:title|placeholder|label|aria-label|alt|emptyLabel|emptyText)=(?:\{\s*)?(?:"[^"{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^"{}]*"|'[^'{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^'{}]*')/;
  // Widget props take their text as object fields (dimension={{ label: 'Kosten' }},
  // measure label, Kanban column labels) — same rule, different syntax.
  const objText = /\b(?:title|label|name|emptyLabel|emptyText|hint|description)\s*:\s*(?:"[^"{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^"{}]*"|'[^'{}]*[A-Za-zÄÖÜäöüßÀ-ž]{3,}[^'{}]*')/;
  // A sentence computed in a helper and rendered as {subtitle} is in no
  // JSX text, no attribute and no allowlisted prop — it stayed German
  // while the page around it turned English. One word may be a status
  // key the API reads back ('Aktiv'), so only whole phrases count.
  const returnText = /\breturn\s+(?:"(?=[^"]*[A-Za-zÄÖÜäöüßÀ-ž]{3,})(?=[^"]*\s)[^"{}]*"|'(?=[^']*[A-Za-zÄÖÜäöüßÀ-ž]{3,})(?=[^']*\s)[^'{}]*')/;
  // The makeT({de:{…}, en:{…}}) table IS the translation definition — its own
  // entries are the fix, not the defect. `title:` sits in the allowlist above,
  // so the bundle reported itself and the fixer stamped /* i18n-exempt */ on
  // the very table the rule demands (live-seen: two hits, plus six LookupValue
  // pairs below, in one run — 8 of 10 findings were the gate's own noise).
  // Brace-counted with string skipping: a value like 'Ausleihe(n) überfällig'
  // carries parens, and a lone quote must not derail the scan.
  const i18nDefLines = new Set();
  {
    const openRe = /\bmakeT\s*\(/g;
    let m;
    while ((m = openRe.exec(code)) !== null) {
      let depth = 0, quote = null, i = m.index + m[0].length - 1;
      for (; i < code.length; i++) {
        const c = code[i];
        if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
        if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
        if (c === '(') depth++;
        else if (c === ')' && --depth === 0) break;
      }
      const from = code.slice(0, m.index).split('\n').length - 1;
      const to = code.slice(0, Math.min(i + 1, code.length)).split('\n').length - 1;
      for (let n = from; n <= to; n++) i18nDefLines.add(n);
      openRe.lastIndex = i;
    }
  }
  // `{ key: …, label: 'Verfügbar' }` is a LookupValue — the API's own key/label
  // pair mirrored into optimistic state, not UI text. The label is whatever the
  // record already carries; rewriting it through lookupLabel() changes nothing
  // a user sees. MASKED, not line-skipped: one line may hold both a LookupValue
  // and real UI text, and dropping the whole line would hide the latter.
  const lookupPair = /\{\s*key\s*:\s*[^,{}]+,\s*label\s*:\s*(?:'[^'\n]*'|"[^"\n]*")\s*\}/g;
  for (let i = 0; i < codeLines.length; i++) {
    // Detection on the comment-stripped twin (trailing comments included);
    // the exempt marker lives IN a comment, so it is read off the raw line.
    if (dashLines[i].includes('i18n-exempt')) continue;
    if (i18nDefLines.has(i)) continue;
    const l = codeLines[i].replace(lookupPair, '{}');
    if (jsxText.test(l) || attrText.test(l) || objText.test(l) || returnText.test(l)) literalHits.push(`    line ${i + 1}: ${dashLines[i]}`);
  }
  // WARNING, not error — deliberately. Reporting these as errors bought a
  // 30-60s agent repair loop per build, while the backend's i18n finalize
  // step (scripts/i18n-tx.mjs wrap + one translation call) marks leftovers
  // mechanically after the agent finishes — including template literals
  // these regexes never saw. The agent still writes tx-first (skeleton,
  // SKILL, prompt all teach it); whatever slips through is pipeline input,
  // not the agent's problem.
  if (literalHits.length) {
    warnings.push(
      'Unmarked UI text (tx-wrapped mechanically after the build — no action needed):' +
      '\n' + literalHits.slice(0, 10).join('\n')
    );
  }
}

// 22. LOOKUP_OPTIONS labels resolve the CURRENT locale via getters — a
// module-scope derivation that touches `.label` (e.g.
// `const COLS = LOOKUP_OPTIONS.x.status.map(o => ({key: o.key, label: o.label}))`)
// evaluates ONCE at import and freezes that language forever (live-proven:
// Czech dashboard with English kanban columns). Storing the raw arrays is
// fine — only resolving labels at module scope is not.
{
  // Statement-based, not line-based: the first live escape was a multi-line
  // `.map(` with `label:` on the next line. Also resolves an import alias.
  let optName = 'LOOKUP_OPTIONS';
  const importM = code.match(/import\s*\{([^}]*)\}\s*from\s*'@\/types\/app'/);
  const aliasM = importM && importM[1].match(/LOOKUP_OPTIONS\s+as\s+(\w+)/);
  if (aliasM) optName = aliasM[1];
  const hoisted = [];
  for (let i = 0; i < codeLines.length; i++) {
    if (!/^(?:export\s+)?const\s/.test(codeLines[i])) continue;
    let j = i;
    let stmt = codeLines[i];
    while (!/;\s*$/.test(codeLines[j]) && j + 1 < codeLines.length && j - i < 12) {
      j++;
      stmt += '\n' + codeLines[j];
    }
    if (stmt.includes(optName) && /(?:\.label\b|label\s*:)/.test(stmt)) {
      hoisted.push(`    line ${i + 1}: ${dashLines[i]}`);
    }
    i = j;
  }
  if (hoisted.length) {
    errors.push(
      'Module-scope LOOKUP_OPTIONS label read — the labels are locale-aware getters and freeze in whatever language is active at import. Move THIS derivation unchanged into the component body; a plain const or useMemo there is enough. Do NOT split it into a keys-only module const plus a second lookup in the body — a live run took that path, then had to delete the now-unused const again (three edits for a one-edit move).\n' + hoisted.join('\n')
    );
  }
}

// ── The form-enhancement engine is generator-owned and must stay intact.
// Live (22.09.2026): the form-polish sub-agent left `types.ts` as its bare
// interfaces, all runtime helpers gone; every dialog then failed to compile
// and the dashboard agent spent half its run hand-writing replacements into
// a file it does not own. The dialogs' own import line is the contract —
// whatever they name must be exported there.
{
  const TYPES = 'src/config/form-enhancements/types.ts';
  const DIALOGS = 'src/components/dialogs';
  if (existsSync(TYPES) && existsSync(DIALOGS)) {
    const typesSrc = readFileSync(TYPES, 'utf8');
    const wanted = new Set();
    for (const f of readdirSync(DIALOGS).filter(n => n.endsWith('.tsx'))) {
      const src = readFileSync(join(DIALOGS, f), 'utf8');
      const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"]@\/config\/form-enhancements\/types['"]/g;
      let m;
      while ((m = re.exec(src))) {
        for (const raw of m[1].split(',')) {
          const name = raw.replace(/\btype\b/, '').split(' as ')[0].trim();
          if (name) wanted.add(name);
        }
      }
    }
    const missing = [...wanted].filter(n => !new RegExp(`export\\s+(?:type\\s+|interface\\s+|const\\s+|function\\s+)?${n}\\b`).test(typesSrc));
    if (missing.length) {
      errors.push(`${TYPES} no longer exports ${missing.join(', ')} — the file is GENERATOR-owned; restore it (run Update) instead of re-implementing it in place. The dialogs import these by name.`);
    }
  }
}

// 27. A QR code to a public page is BUILT, never read from a record (Abnahme 5,
// 04.11.2026: the beamer and the overview encoded a link field's seed value
// „https://veranstaltung.example.com/…“ instead of the join page). The block
// <PublicPageQr entity=… recordId=… /> (or usePublicPageLink) finds the
// published page by its link_param. An error when the plan has such a page,
// a warning otherwise (a QR of some other link may be meant).
{
  const LINK_ENTITIES = ["umfragen"];
  const walkQr = (dir) => {
    let out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, n.name);
      if (n.isDirectory()) { if (!['intents', 'public', 'ui'].includes(n.name)) out = out.concat(walkQr(full)); }
      else if (/\.tsx?$/.test(n.name) && !n.name.endsWith('.example.tsx')) out.push(full);
    }
    return out;
  };
  const files = [...new Set([FILE, ...walkQr('src/pages'), ...walkQr('src/components/custom'), ...walkQr('src/components/overview')])]
    .filter(f => f === FILE || existsSync(f));
  const DATA = /\.fields\b|\bfields\s*\[|\bfield(?:Text|Lookup|Ref)\s*\(/;
  const hits = [];
  for (const file of files) {
    const text = file === FILE ? code : stripCommentsKeepLayout(readFileSync(file, 'utf8'));
    const exprs = [];
    for (const m of text.matchAll(/<QrCode\b[^>]*?\bvalue=\{/g)) {
      let depth = 1, j = m.index + m[0].length;
      for (; j < text.length && depth > 0; j++) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; }
      exprs.push([m.index, text.slice(m.index + m[0].length, j - 1)]);
    }
    for (const m of text.matchAll(/\bqrSvgString\(([^,)]*)/g)) exprs.push([m.index, m[1]]);
    for (const [at, expr] of exprs) {
      if (!DATA.test(expr)) continue;
      const line = text.slice(0, at).split('\n').length;
      hits.push(`${file}:${line}: ${expr.trim().slice(0, 120)}`);
    }
  }
  if (hits.length) {
    const msg = `A QR code encodes a value read from a record — a record's link field is not where visitors go (a seed holds a placeholder address). Use <PublicPageQr entity="<entity>" recordId={r.record_id} /> or usePublicPageLink(entity, id) from '@/components/widgets/PublicPageQr': it builds the join link of the published page whose link_param names the entity${LINK_ENTITIES.length ? ` (this plan: ${LINK_ENTITIES.join(', ')})` : ''}:\n  ` + hits.join('\n  ');
    (LINK_ENTITIES.length ? errors : warnings).push(msg);
  }
  // 27b. EF-26 (Bau 16): two public pages open per event — the QR took the FIRST (the rating page)
  // instead of the feedback page. With several link pages for one entity every QR names its page.
  const LINK_PAGES = {"umfragen": ["termin-abstimmen"]};
  const noPage = [];
  for (const file of files) {
    const text = file === FILE ? code : stripCommentsKeepLayout(readFileSync(file, 'utf8'));
    for (const m of text.matchAll(/<PublicPageQr\b([^>]*)>|\busePublicPageLink\(([^)]*)\)/g)) {
      const attrs = m[1] ?? m[2] ?? '';
      const ent = (/entity=["']([\w]+)["']/.exec(attrs) || /^\s*['"]([\w]+)['"]/.exec(attrs) || [])[1];
      if (!ent || (LINK_PAGES[ent] || []).length < 2) continue;
      if (m[1] !== undefined ? /\bpage=/.test(attrs) : attrs.split(',').length >= 3) continue;
      const line = text.slice(0, m.index).split('\n').length;
      noPage.push(`${file}:${line}: ${ent} has the pages ${LINK_PAGES[ent].join(', ')} — say which one: page="<slug>"`);
    }
  }
  if (noPage.length) {
    errors.push(`A QR code goes to the FIRST public page of its entity unless it names one — with several, pass page="<slug>" (<PublicPageQr entity="…" recordId={…} page="…" />, usePublicPageLink(entity, id, page)):\n  ` + noPage.join('\n  '));
  }
}

// 33. Every link to a view for ONE record carries ?record= (EF-30) — or goes through viewHref(route, id).
{
  const RECORD_VIEW_PATHS = Object.values({});
  if (RECORD_VIEW_PATHS.length) {
    const walk33 = (dir) => {
      let out = [];
      if (!existsSync(dir)) return out;
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, n.name);
        if (n.isDirectory()) { if (!['intents', 'public', 'ui', 'views'].includes(n.name)) out = out.concat(walk33(full)); }
        else if (/\.tsx?$/.test(n.name) && !n.name.endsWith('.example.tsx')) out.push(full);
      }
      return out;
    };
    const bare = [];
    for (const file of [...new Set([FILE, ...walk33('src/pages'), ...walk33('src/components/custom'), ...walk33('src/components/overview')])].filter(f => f === FILE || existsSync(f))) {
      const text = file === FILE ? code : stripCommentsKeepLayout(readFileSync(file, 'utf8'));
      for (const p of RECORD_VIEW_PATHS) {
        for (const m of text.matchAll(new RegExp(`#/${p.replace(/[/-]/g, c => '\\' + c)}(?![\\w-])(\\?record=)?`, 'g'))) {
          if (m[1]) continue;
          const line = text.slice(0, m.index).split('\n').length;
          bare.push(`${file}:${line}: #/${p} without ?record=`);
        }
      }
    }
    if (bare.length) {
      errors.push(`A view for ONE record is opened with its record — write viewHref('<route>', r.record_id) from '@/config/plan' (or #/<path>?record=\${id}); without it the view cannot know which one:\n  ` + bare.join('\n  '));
    }
  }
}

// 28. Every MANUAL tool of the plan that works on a record has a start on the
// overview — a <ToolButton tool="<id>"> on that record's card or overlay (S-21,
// Abnahme 6: the manual AI tool was only in „Alle Aktionen“; nobody found it).
{
  const MANUAL = {};
  const walkTools = (dir) => {
    let out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, n.name);
      if (n.isDirectory()) { if (!['intents', 'public', 'ui'].includes(n.name)) out = out.concat(walkTools(full)); }
      else if (/\.tsx?$/.test(n.name) && !n.name.endsWith('.example.tsx')) out.push(full);
    }
    return out;
  };
  const all = [code, ...[...walkTools('src/pages'), ...walkTools('src/components/custom'), ...walkTools('src/components/overview')]
    .filter(f => f !== FILE).map(f => stripCommentsKeepLayout(readFileSync(f, 'utf8')))].join('\n');
  const missing = [];
  for (const [entity, tools] of Object.entries(MANUAL)) {
    for (const t of tools) {
      if (!new RegExp(`<ToolButton\\b[^>]*\\btool=["'{\\s]*${t.id}["'}]`).test(all)) missing.push(`${t.id} (on ${entity}: <ToolButton tool="${t.id}" recordId={r.record_id} label={tx('${t.label}')} />)`);
    }
  }
  if (missing.length) {
    errors.push(`A manual tool of the plan has no start on the overview — put its button on the card or overlay footer of the record it works on (import { ToolButton } from '@/components/ToolButton'):\n  ` + missing.join('\n  '));
  }
}

// Display views (src/pages/views, dashboard.views): every live read's filter is vSQL
// the real server parses (check-vsql), and a read that fails is SAID on screen —
// 0.0.502's beamer sent the plan's words as a filter, got 400 on every poll and
// showed „Pause“ for good, because nothing read the hook's `error`.
{
  const VIEWS = 'src/pages/views';
  const VIEW_EDITS = {};
  const VIEW_QR = new Set([]);
  const VIEW_COMPOSE = {};
  const RECORD_VIEWS = {};
  const walkViews = (dir) => {
    let out = [];
    if (!existsSync(dir)) return out;
    for (const n of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, n.name);
      if (n.isDirectory()) { if (!['ui'].includes(n.name)) out = out.concat(walkViews(full)); }
      else if (/\.tsx?$/.test(n.name)) out.push(full);
    }
    return out;
  };
  if (existsSync(VIEWS)) {
    for (const n of readdirSync(VIEWS).filter(f => f.endsWith('.tsx'))) {
      const file = join(VIEWS, n);
      const vsrc = readFileSync(file, 'utf8');
      const lives = [...vsrc.matchAll(/(?:const|let)\s+(\w+)\s*=\s*useLiveRecords\(/g)].map(m => m[1]);
      for (const v of lives) {
        if (!new RegExp(`\\b${v}\\.error\\b`).test(vsrc)) {
          // a warning: a view built before this rule must not block an update; the filter below is an error
          warnings.push(`${file}: the live read \`${v}\` never shows \`${v}.error\` — when it fails and there are no rows, say so on screen (e.g. {${v}.error && ${v}.records.length === 0 && <p role="alert" data-live-error>…</p>}), never the empty state.`);
        }
      }
      // 30. a view is BUILT, never left as the placeholder (EF-24, Bau 15: both views showed
      // „Diese Ansicht wird noch gebaut.“ and a count, the build said done)
      if (/KLAR_VIEW_PLACEHOLDER/.test(vsrc) && /Diese Ansicht wird noch gebaut\./.test(vsrc)) {
        errors.push(`${file}: still the generated placeholder — build the view the plan orders (its header lists ROUTE, READS, SHOWS, EDITS, JOIN and the CONTRACT), then drop the placeholder sentence and the KLAR_VIEW_PLACEHOLDER token.`);
      }
      if (VIEW_QR.has(file) && !/\b(?:PublicPageQr|usePublicPageLink)\b/.test(stripCommentsKeepLayout(vsrc))) {
        errors.push(`${file}: the plan's view shows a QR code — build it from the public page: <PublicPageQr entity="…" recordId={…} /> (import { PublicPageQr } from '@/components/widgets/PublicPageQr'), never from a record's link field.`);
      }
      // 34. EF-28: the editor keeps its own height — a container around it that may shrink
      // (min-h-0) lets the textarea run over the next block and cover its buttons; flex-1
      // without shrink-0 is a warning. Only plain HTML containers are read (no arrows in them).
      {
        const code34 = stripCommentsKeepLayout(vsrc);
        for (const ed of code34.matchAll(/<ViewTextEditor\b/g)) {
          const before = code34.slice(0, ed.index);
          const stack = [];
          for (const t of before.matchAll(/<(\/?)(div|section|main|article|aside|header|footer)\b([^<>]*?)(\/?)>/g)) {
            if (t[4]) continue;                     // self-closing
            if (t[1]) { const i = stack.map(s => s.tag).lastIndexOf(t[2]); if (i >= 0) stack.splice(i); continue; }
            stack.push({ tag: t[2], attrs: t[3], at: t.index });
          }
          const line = before.split('\n').length;
          for (const s of stack) {
            const cls = (/className=["'`{]([^"'`}]*)/.exec(s.attrs) || [])[1] || '';
            if (/(^|\s)min-h-0(\s|$)/.test(cls)) {
              errors.push(`${file}:${line}: ViewTextEditor sits in a <${s.tag}> with min-h-0 — that container may shrink below the editor's minimum height and the textarea covers what follows; drop min-h-0 (or give the container overflow-y-auto)`);
              break;
            }
            if (/(^|\s)flex-1(\s|$)/.test(cls) && !/(^|\s)shrink-0(\s|$)/.test(cls) && !/overflow-(y-)?auto/.test(cls)) {
              warnings.push(`${file}:${line}: ViewTextEditor sits in a <${s.tag}> with flex-1 and no shrink-0 — on a short screen it can shrink below the editor; add shrink-0 or overflow-y-auto`);
              break;
            }
          }
        }
      }
      // 32. a view for ONE record reads ?record= and never takes the first row app-wide (EF-30, Bau 18:
      // the QR view showed another event's question because the overview opened it without ?record=)
      if (RECORD_VIEWS[file]) {
        const code = stripCommentsKeepLayout(vsrc);
        if (!/get\(\s*['"]record['"]\s*\)/.test(code)) {
          errors.push(`${file}: this view shows ONE record — read it from the address (new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('record')) and say „Bitte über die Übersicht öffnen“ without it.`);
        }
        if (/\.records\[0\]/.test(code) && !/\blimit\s*:\s*1\b/.test(code)) {
          errors.push(`${file}: \`records[0]\` picks the first record app-wide — this view shows the record ?record= names (records.find(r => r.record_id === pinned)).`);
        }
      }
      // 31. a view that composes its text (N2): compose is filled, and something opens it in a new tab
      if (VIEW_COMPOSE[file]) {
        if (/compose=\{\(\)\s*=>\s*null\}/.test(vsrc)) {
          errors.push(`${file}: compose is still the placeholder's \`() => null\` — build the text from the reads as the COMPOSE line says (null only while a read is loading).`);
        }
        const path = VIEW_COMPOSE[file];
        const opener = [...walkViews('src/pages'), ...walkViews('src/components/custom'), ...walkViews('src/components/overview')]
          .filter(f => !f.startsWith(VIEWS)).some(f => {
            const t = readFileSync(f, 'utf8');
            return t.includes(`#/${path}?record=`) && /target=["']_blank["']/.test(t);
          });
        if (!opener) {
          errors.push(`${file}: nothing opens this view — the card button is a real link that opens it in a new tab: <a href={\`#/${path}?record=\${r.record_id}\`} target="_blank" rel="noopener">…</a> (never window.open after an await).`);
        }
      }
      // 29. a text the plan lets the person edit ON this view (dashboard.views[].edits, Bau 10:
      // the merged text was read-only behind an „Bearbeiten“ dialog) keeps its generated editor
      for (const f of (VIEW_EDITS[file] || [])) {
        if (!new RegExp(`<ViewTextEditor\\b[\\s\\S]{0,1500}?\\bfield=["'{\\s]*${f}["'}]`).test(vsrc)) {
          errors.push(`${file}: the plan lets the person edit '${f}' on this view — render <ViewTextEditor field="${f}" recordId={…} value={…} save={…} /> (import { ViewTextEditor } from '@/components/blocks/ViewTextEditor') on the record the view shows; never a read-only text with an edit dialog.`);
        }
      }
      if (/useLiveRecords\(/.test(vsrc) && existsSync('scripts/check-vsql.mjs')) {
        const r = spawnSync('node', ['scripts/check-vsql.mjs', file], { encoding: 'utf8', env: process.env });
        if (r.status !== 0) {
          const lines = `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter(l => l.startsWith('ERROR:')).map(l => l.slice(6).trim());
          for (const l of lines.length ? lines : [`check-vsql red for ${file}`]) errors.push(l);
        }
      }
    }
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n${errors.length} error(s) — fix DashboardOverview.tsx and re-run.`);
  process.exit(1);
}
console.log(`check-dashboard: OK (${warnings.length} warning(s))`);
