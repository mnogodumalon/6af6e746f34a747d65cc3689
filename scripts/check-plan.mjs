// check-plan — the build against the orchestrator's plan (docs/orchestrator/SPEC.md §6.1).
//
// Runs in the integration band like every gate; without `.plan.json` it is a
// no-op (builds without a plan stay byte-identical). With a plan it holds
// every flow page and the public surface against the Schreibliste:
//
//   ERROR  a flow writes an entity its plan line does not list
//   ERROR  a flow binds a field another flow or a tool owns
//   ERROR  a flow asks the user for a field the plan sets automatically
//          (fixed / derived) — the layer sets it, the user never types it
//   ERROR  a public page declares an endpoint (entity, op) the plan lacks
//   WARN   a planned flow or page was not built (the report marks it failed;
//          there is no file to repair, so it is not an ERROR here)
//   WARN   a flow or page was built that the plan did not ask for
//
// ERROR lines name the page file so the repair agent and the quarantine can
// act on exactly that file.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PLAN = '.plan.json';
const SURFACE = '_public/surface.json';
const APP = 'src/App.tsx';
const INTENTS_DIR = 'src/pages/intents';
const PUBLIC_DIR = 'src/pages/public';

if (!existsSync(PLAN)) {
  console.log('check-plan: OK (no plan)');
  process.exit(0);
}

let plan;
try {
  plan = JSON.parse(readFileSync(PLAN, 'utf8'));
} catch (e) {
  console.error(`ERROR: ${PLAN}: not valid JSON — ${e.message}`);
  process.exit(1);
}

const errors = [];
const warnings = [];
const ownership = plan.ownership || {};
const flows = Array.isArray(plan.flows) ? plan.flows : [];
const pages = Array.isArray(plan.public_pages) ? plan.public_pages : [];

// ── Where does a flow slug live? App.tsx: <Route path="intents/<slug>" … <Intent<Component> …
const appSrc = existsSync(APP) ? readFileSync(APP, 'utf8') : '';
function fileForSlug(slug) {
  // wire-intent writes `<Route path="intents/<slug>" element={<Suspense fallback={<DashboardSkeleton />}><Intent… /></Suspense>} />`:
  // the component sits behind another tag on the SAME line, so the search runs to the end of the
  // line, not to the next `>` ([^>]*? stopped at `<Suspense …>` and called every wired flow "not
  // built" — the binding check below never ran for a plan flow, 03.11.2026).
  const re = new RegExp(`<Route\\s+path=["']intents/${slug.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}["'][^\\n]*?<Intent([A-Za-z][A-Za-z0-9]*)\\b`);
  const m = re.exec(appSrc);
  if (!m) return null;
  const file = `${INTENTS_DIR}/${m[1]}.tsx`;
  return existsSync(file) ? file : null;
}

// ── What a flow page binds and writes
function pageBindings(src) {
  const forms = new Map();                    // var → entity
  for (const m of src.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*useStepForm\(\s*['"]([\w-]+)['"]/g)) forms.set(m[1], m[2]);
  const bound = [];                           // {entity, key}
  for (const m of src.matchAll(/\b(\w+)\.(?:field|number|date|choice|checkbox|record|records)\(\s*['"](\w+)['"]/g)) {
    const entity = forms.get(m[1]);
    if (entity) bound.push({ entity, key: m[2] });
  }
  for (const m of src.matchAll(/<(?:Field|Bound)\b([^>]*?)\/?>/gs)) {
    const fm = /\bform=\{(\w+)\}/.exec(m[1]);
    const nm = /\bname=["'](\w+)["']/.exec(m[1]);
    if (fm && nm && forms.get(fm[1])) bound.push({ entity: forms.get(fm[1]), key: nm[1] });
  }
  // plan steps of useJourneySubmit: every `entity: 'x'` inside the call's array
  const written = new Set(forms.values());
  const js = /useJourneySubmit\s*\(/.exec(src);
  if (js) {
    const start = src.indexOf('[', js.index);
    if (start > 0) {
      let depth = 0, end = -1;
      for (let k = start; k < src.length && k < start + 20000; k++) {
        if (src[k] === '[') depth++;
        else if (src[k] === ']' && --depth === 0) { end = k; break; }
      }
      const body = end > 0 ? src.slice(start, end + 1) : src.slice(start);
      for (const m of body.matchAll(/\bentity:\s*['"]([\w-]+)['"]/g)) written.add(m[1]);
    }
  }
  return { bound, written };
}

const builtSlugs = new Set();
for (const m of appSrc.matchAll(/<Route\s+path=["']intents\/([\w-]+)["']/g)) builtSlugs.add(m[1]);

for (const flow of flows) {
  const file = fileForSlug(flow.slug);
  if (!file) {
    warnings.push(`plan flow '${flow.slug}' was not built (no route/page) — the report marks it failed`);
    continue;
  }
  const src = readFileSync(file, 'utf8');
  // A page on its generated flow hook: the plumbing IS the plan (the hook is
  // rendered from this very Schreibliste), so the bindings/required checks
  // below have nothing to compare. What CAN go wrong is the page importing
  // another flow's hook, or the hook file not existing — checked here; the raw
  // plumbing next to a hook is check-intents 3b's error.
  const hookImport = /from\s*['"]@\/lib\/journey\/flows\/(\w+)['"]/.exec(src);
  if (hookImport) {
    const expected = flow.slug.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
    if (hookImport[1] !== expected) {
      errors.push(`${file}: flow '${flow.slug}' imports the hook of '${hookImport[1]}' — its own is @/lib/journey/flows/${expected} (use${expected}Flow)`);
    } else if (!existsSync(`src/lib/journey/flows/${expected}.ts`)) {
      errors.push(`${file}: flow '${flow.slug}' imports @/lib/journey/flows/${expected}, which the generator did not emit (is the flow in the plan?)`);
    }
    if (!/\buseStepForm\s*\(|useJourneySubmit\s*\(/.test(src)) continue;   // pure composition — nothing to hold against the plan
  }
  const { bound, written } = pageBindings(src);
  const planned = new Map();                  // entity → {field → source}
  for (const w of flow.writes || []) planned.set(w.entity, { ...(planned.get(w.entity) || {}), ...(w.fields || {}) });
  for (const entity of written) {
    if (!planned.has(entity)) {
      errors.push(`${file}: flow '${flow.slug}' writes entity '${entity}' — not in the plan's Schreibliste (${[...planned.keys()].join(', ') || 'nothing'}); either the plan or the page is wrong, the plan wins`);
    }
  }
  const seen = new Set();
  for (const { entity, key } of bound) {
    const id = `${entity}.${key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const owner = (ownership[entity] || {})[key];
    if (owner && owner !== `intent:${flow.slug}`) {
      errors.push(`${file}: flow '${flow.slug}' binds '${id}' which ${owner.replace(':', ' ')} owns — remove the input; that write is not this flow's`);
      continue;
    }
    const source = (planned.get(entity) || {})[key];
    if (source && !/^(user|picked)$/.test(source)) {
      errors.push(`${file}: flow '${flow.slug}' asks the user for '${id}' but the plan sets it automatically (${source}) — set it in the plan step's values, do not bind it`);
    }
  }
  // An ingredient of a computed value must not be declared optional. The app's
  // base view says "optional" for such a field (nothing there knows a tool
  // will compose an identifier from it), so the page copies that and the value
  // silently never gets built — live 22.09.2026: `projektstart_jahr: false`,
  // project created with a number and no identifier.
  for (const id of flow.required || []) {
    const key = id.split('.')[1];
    const re = new RegExp(`required\\s*:\\s*\\{[^}]*\\b${key}\\s*:\\s*false`, 's');
    if (re.test(src)) {
      errors.push(`${file}: flow '${flow.slug}' declares '${id}' optional, but the plan builds a value from it — mark it required and validate it before the step advances`);
    }
  }
}
for (const slug of builtSlugs) {
  if (!flows.some(f => f.slug === slug)) warnings.push(`flow '${slug}' was built but is not in the plan`);
}

// ── Every way a page WRITES a field (EF-33, Doodle 0.0.541) ─────────────────
// A repair hid `auswahl` in a plan step's `values` after check-plan refused it as a visitor
// field — the grant did not list it and the live POST got 400. What a page writes is: the
// form's `fields` (useStepForm), a plan step's `values` and `link` (useJourneySubmit), and a
// direct createPublicRecord payload. Returns [{ entity|null, key, how, line }].
function wkMatchClose(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function wkEnclosingOpen(src, at) {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    const ch = src[i];
    if (ch === '}' || ch === ')' || ch === ']') depth++;
    else if (ch === '{' || ch === '(' || ch === '[') { if (depth === 0) return ch === '{' ? i : -1; depth--; }
  }
  return -1;
}
function wkTopKeys(obj) {
  const body = obj.slice(1, -1);
  const parts = [];
  let depth = 0, start = 0, quote = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) { if (ch === quote && body[i - 1] !== '\\') quote = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if ('([{'.includes(ch)) depth++;
    else if (')]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) { parts.push(body.slice(start, i)); start = i + 1; }
  }
  parts.push(body.slice(start));
  const keys = [];
  for (const p of parts) {
    const t = p.trim();
    if (t.startsWith('...') || t.startsWith('[')) { keys.push('*'); continue; }   // a spread or a computed key: unknown
    if (!t) continue;
    const m = /^['"]?([A-Za-z_$][\w$]*)['"]?\s*(?::|$)/.exec(t);
    if (m) keys.push(m[1]);
  }
  return keys;
}
// The keys of the object a `values:`/`link:` expression yields, read at `at` (just after the colon):
// an object literal, an arrow returning one `() => ({…})`, an arrow or function with a BLOCK body
// (`=> { …; return {…}; }` — the keys of its last top-level return), or the NAME of a helper
// defined in the file (`values: answersFor(t)` / `values: answersFor`), followed to its body.
// Anything the reader cannot follow is `['*']` — unknown, never "writes nothing" (EF-45, Doodle KB 6:
// a page edit moved the values into a helper and the gate called a required field unwritten).
function wkSkipArrowHead(src, at) {
  // `(a, b): T => ` or `a => ` → index just after `=>`; -1 when no arrow starts here
  let i = at;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === '(') {
    const close = wkMatchClose(src, i);
    if (close < 0) return -1;
    i = close + 1;
    while (i < src.length && /[\s\w.<>\[\],:|&'"]/.test(src[i]) && !(src[i] === '=' && src[i + 1] === '>')) i++;
  } else {
    const id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
    if (!id) return -1;
    i += id[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
  }
  return src[i] === '=' && src[i + 1] === '>' ? i + 2 : -1;
}
function wkBlockReturnKeys(src, open) {
  const close = wkMatchClose(src, open);
  if (close < 0) return ['*'];
  const body = src.slice(open + 1, close);
  let keys = null;
  for (const r of body.matchAll(/\breturn\s*\(?\s*\{/g)) {
    const o = open + 1 + r.index + r[0].length - 1;
    const c = wkMatchClose(src, o);
    if (c < 0) continue;
    keys = wkTopKeys(src.slice(o, c + 1));
  }
  return keys || ['*'];
}
function wkValueKeys(src, at, depth) {
  if (depth > 3) return ['*'];
  let i = at;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === '{') {                                      // an object literal
    const c = wkMatchClose(src, i);
    return c < 0 ? ['*'] : wkTopKeys(src.slice(i, c + 1));
  }
  if (src.startsWith('async', i) && /\s/.test(src[i + 5] || '')) i += 5;
  const arrowBody = wkSkipArrowHead(src, i);
  if (arrowBody >= 0) {                                      // an arrow: `=> ({…})` or `=> { … return {…} }`
    let j = arrowBody;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === '(') { const c = wkMatchClose(src, j); if (c < 0) return ['*']; return wkValueKeys(src, j + 1, depth + 1); }
    if (src[j] === '{') return wkBlockReturnKeys(src, j);
    return wkValueKeys(src, j, depth + 1);                   // `=> helper(t)` / `=> helper`
  }
  if (src.startsWith('function', i)) {                       // function (…) { … return {…} }
    const b = src.indexOf('{', i);
    return b < 0 ? ['*'] : wkBlockReturnKeys(src, b);
  }
  const name = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 80));
  if (!name) return ['*'];
  // a helper defined in this file: const name = (…) => … | function name(…) { … }
  const decl = new RegExp(`(?:\\b(?:const|let|var)\\s+${name[0]}\\s*(?::[^=]+)?=\\s*|\\bfunction\\s+${name[0]}\\s*\\()`).exec(src);
  if (!decl) return ['*'];
  if (decl[0].endsWith('(')) { const b = src.indexOf('{', decl.index + decl[0].length); return b < 0 ? ['*'] : wkBlockReturnKeys(src, b); }
  return wkValueKeys(src, decl.index + decl[0].length, depth + 1);
}
function writtenKeys(src) {
  const out = [];
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  // a plan step: { key, entity: 'x', …, values: {…} | () => ({…}), link: {…} }
  for (const m of src.matchAll(/\bentity\s*:\s*['"](\w+)['"]/g)) {
    const open = wkEnclosingOpen(src, m.index - 1);
    if (open < 0) continue;
    const close = wkMatchClose(src, open);
    if (close < 0) continue;
    const obj = src.slice(open, close + 1);
    for (const how of ['values', 'link']) {
      const vm = new RegExp(`\\b${how}\\s*:\\s*`).exec(obj);
      if (!vm) continue;
      const at = open + vm.index + vm[0].length;
      const keys = wkValueKeys(src, at, 0);
      for (const key of keys) out.push({ entity: m[1], key, how, line: lineAt(at) });
    }
  }
  // the form's fields: useStepForm('x', { fields: ['a', 'b'] })
  for (const m of src.matchAll(/\buseStepForm\(\s*['"](\w+)['"]\s*,\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = wkMatchClose(src, open);
    if (close < 0) continue;
    const fm = /\bfields\s*:\s*\[([^\]]*)\]/.exec(src.slice(open, close + 1));
    if (!fm) { out.push({ entity: m[1], key: '*', how: 'form', line: lineAt(m.index) }); continue; }
    for (const k of fm[1].matchAll(/['"](\w+)['"]/g)) out.push({ entity: m[1], key: k[1], how: 'form', line: lineAt(m.index) });
  }
  // a direct createPublicRecord(cfg, page, { … })
  for (const m of src.matchAll(/\bcreatePublicRecord\(\s*[^,]+,\s*[^,]+,\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const close = wkMatchClose(src, open);
    if (close < 0) continue;
    for (const key of wkTopKeys(src.slice(open, close + 1))) out.push({ entity: null, key, how: 'createPublicRecord', line: lineAt(m.index) });
  }
  return out;
}
// ── Public surface against the plan
if (pages.length && existsSync(SURFACE)) {
  let surface = { pages: [] };
  try { surface = JSON.parse(readFileSync(SURFACE, 'utf8')); } catch { /* check-public reports broken JSON */ }
  const byslug = new Map((surface.pages || []).map(p => [p.slug, p]));
  for (const page of pages) {
    const sp = byslug.get(page.slug);
    if (!sp) { warnings.push(`plan public page '${page.slug}' is not in the surface — the report marks it failed`); continue; }
    const file = sp.component ? `${PUBLIC_DIR}/${sp.component}.tsx` : SURFACE;
    const allowed = new Set([...(page.lists || []).map(l => `${l.entity}:list`), ...(page.creates || []).map(c => `${c.entity}:create`)]);
    for (const ep of sp.endpoints || []) {
      const key = `${ep.entity}:${ep.op}`;
      // An availability read is Klar's own (intents_integration.add_availability_endpoints,
      // from the occupancy decision): dates, resource, status of what is taken — never
      // who. It is not a plan decision; rejecting it made the repair agent strip the
      // calendar off a booking page (Pension Gästehaus 23.10.2026).
      if (ep.op === 'list' && ep.purpose === 'availability') continue;
      if (!allowed.has(key)) {
        errors.push(`${file}: public page '${page.slug}' declares ${ep.op} on '${ep.entity}' — the plan allows only: ${[...allowed].join(', ') || 'nothing'}`);
      }
    }
    for (const c of page.creates || []) {
      const ep = (sp.endpoints || []).find(e => e.op === 'create' && e.entity === c.entity);
      if (!ep) continue;
      const have = new Set((ep.fields || []).map(f => (typeof f === 'string' ? f : f.key)));
      for (const k of have) {
        if (!(k in (c.fields || {}))) errors.push(`${file}: public page '${page.slug}' asks visitors for '${c.entity}.${k}' — not a visitor field in the plan (${Object.keys(c.fields || {}).join(', ')})`);
      }
    }
  }
  // EF-33: what the page WRITES (form fields, plan step values/link, createPublicRecord) is
  // what the plan orders — a refused field moved to `values` passed this check before
  for (const page of pages) {
    const sp = byslug.get(page.slug);
    const compFile = sp && sp.component ? `${PUBLIC_DIR}/${sp.component}.tsx` : null;
    if (!compFile || !existsSync(compFile)) continue;
    const src = readFileSync(compFile, 'utf8');
    const ordered = new Map((page.creates || []).map(c => [c.entity, new Set([...Object.keys(c.fields || {}), ...Object.keys(c.fixed || {})])]));
    const all = new Set([...ordered.values()].flatMap(s => [...s]));
    const seen = new Set();
    for (const w of writtenKeys(src)) {
      const allowed = w.entity ? ordered.get(w.entity) : all;
      if (!allowed) { if (w.how !== 'form') errors.push(`${compFile}:${w.line}: public page '${page.slug}' writes '${w.entity}.${w.key}' (${w.how}) — the plan has no create of '${w.entity}' on this page`); continue; }
      if (w.key === '*' || allowed.has(w.key) || seen.has(`${w.entity}.${w.key}`)) continue;
      seen.add(`${w.entity}.${w.key}`);
      errors.push(`${compFile}:${w.line}: public page '${page.slug}' writes '${w.entity ?? 'the record'}.${w.key}' through ${w.how} — not in the plan (${[...allowed].join(', ')}). Never move it to another write path: remove the write, or report the plan gap`);
    }
  }
  for (const sp of surface.pages || []) {
    if (!pages.some(p => p.slug === sp.slug)) warnings.push(`public page '${sp.slug}' was built but is not in the plan`);
  }
} else if (pages.length) {
  warnings.push(`plan lists ${pages.length} public page(s) but ${SURFACE} does not exist`);
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`check-plan: OK (${flows.length} flows, ${pages.length} public pages held against the plan)`);
