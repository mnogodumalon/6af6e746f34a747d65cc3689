#!/usr/bin/env node
// Gate: render-smoke — the finished public page, executed once.
//
// tsc proves types, the check-* gates prove source patterns, the surface
// ingest proves the declaration. None of them ever LOOKS at the page. Three
// live pages passed all of that and broke for every visitor: a landing page
// threw React #31, a wizard showed a heading and no fields on step 2, a form
// rendered every label twice. This script is the fourth check: every page in
// _public/surface.json is rendered in jsdom with React, fed the data a
// visitor would get (a synthetic public-pages.json built from the surface
// and app_metadata.json, records from .smoke/records.json or generated from
// the field types), then walked step by step with example input:
//
//   * a render error (thrown, or logged by React)            → ERROR
//   * the page reports "unavailable" against its own config → ERROR
//   * a step with heading but no control, card or summary   → ERROR
//   * "Weiter" leaves the step where it is, without a message → ERROR
//   * the summary blocks because a required field was never asked → ERROR
//   * a step the example input cannot get past (custom rule)  → WARN, stop
//
// Nothing is written anywhere: fetch is mocked, create answers 201 with a
// fake id, so the run walks THROUGH the summary to the success page.
// Exit 1 on any ERROR (the page job then repairs or fails); exit 0 with a
// WARN when jsdom cannot be installed — a build never fails on infrastructure.
//
// Options: --page <slug> (repeatable), --keep (leave bundles in .smoke/),
//          --json <file> (machine-readable report).
// Env:     RENDER_SMOKE_ALIASES = JSON {importPath: absoluteFile} — extra
//          module aliases (the local test harness stubs @/components/ui/*).

import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const SURFACE = '_public/surface.json';
const PAGES_DIR = 'src/pages/public';
const SMOKE_DIR = '.smoke';
const RECORDS_FILE = join(SMOKE_DIR, 'records.json');
const PUBLIC_API_BASE = 'http://smoke.invalid/public-api';
const GRANT_ID = 'smoke-grant';
const READ_GRANT_ID = 'smoke-read-grant';   // EF-42: the challenge-free read door of a page that creates
const MAX_STEPS = 12;
const SETTLE_MS = 6000;
const CONFIRM_MS = 10000;

const argv = process.argv.slice(2);
const onlySlugs = [];
// `--staged <file>`: an INTERNAL flow page a lane wrote to .intents-staging/
// (or any src/pages/intents/*.tsx) — bundled from that path, mounted like
// the app does under #/intents/<slug>, walked against a mocked /rest door.
// Five live flows dead-ended on step 1 (24.09.2026) while every gate was
// green: nothing had ever rendered an internal page before the deploy.
const stagedFiles = [];
let keep = false;
let jsonOut = null;
let prepareOnly = false;   // `--prepare`: fetch jsdom once, before the lanes start, then exit
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--page' && argv[i + 1]) onlySlugs.push(argv[++i]);
  else if (argv[i] === '--staged' && argv[i + 1]) stagedFiles.push(argv[++i]);
  else if (argv[i] === '--keep') keep = true;
  else if (argv[i] === '--prepare') prepareOnly = true;
  else if (argv[i] === '--json' && argv[i + 1]) jsonOut = argv[++i];
}

const errors = [];
const warnings = [];
const report = [];

function readJson(rel) {
  try { return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')); } catch { return null; }
}

// ── 1. What to smoke ──────────────────────────────────────────────────────────
function kebab(name) {
  return name.replace(/Page$/, '').replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}
// A staged flow page: the slug lives in the lane's manifest, not in the file
// name; without a manifest entry the component name is close enough for a URL.
function stagedPage(file) {
  const rel = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const component = rel.split('/').pop().replace(/\.tsx$/, '');
  const manifest = readJson('.intents-staging/manifest.json');
  const entry = ((manifest && manifest.flows) || []).find(f => f && (f.file === rel || String(f.file || '').endsWith('/' + component + '.tsx') || f.component === component));
  return { slug: (entry && entry.slug) || kebab(component), component, file: rel, internal: true };
}
let pages;
if (stagedFiles.length > 0) {
  pages = stagedFiles.map(stagedPage);
} else {
  const surface = readJson(SURFACE);
  const allPages = (surface && Array.isArray(surface.pages)) ? surface.pages : [];
  pages = allPages
    .filter(p => p && p.slug && p.component && (onlySlugs.length === 0 || onlySlugs.includes(p.slug)))
    .map(p => ({ ...p, file: `${PAGES_DIR}/${p.component}.tsx`, internal: false }));
}
// The plan's display views (dashboard.views) are walked too — the chain a live meeting runs:
// a view for ONE record opened with ?record= shows the right page's link for the right parent, a
// view that composes writes a text with the children's values (Bau 16/18: QR of another event).
const planViews = stagedFiles.length === 0
  ? ((((readJson('.plan.json') || {}).dashboard || {}).views) || []).filter(v => v && v.route)
      .map(v => ({ ...v, file: `src/pages/views/${String(v.route).split(/[-_]/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join('')}View.tsx` }))
      .filter(v => existsSync(join(ROOT, v.file)) && (onlySlugs.length === 0 || onlySlugs.includes(v.route)))
  : [];
if (pages.length === 0 && planViews.length === 0 && !prepareOnly) {
  console.log('render-smoke: OK (no public pages declared)');
  process.exit(0);
}
const appMeta = readJson('app_metadata.json');
const apps = (appMeta && appMeta.apps) || {};

// ── The plan's Soll (.plan.json, sandbox form) ───────────────────────────
// Without a plan the walk only says what it SEES (a step without controls, a
// Weiter that leads nowhere). With one it also knows what the page MUST ask —
// the create fields the plan lists as `user`/`picked` — and which records the
// pick steps need to find (a public list's `eq` conditions). A page that
// reaches its summary without asking an ordered field is red; a page that
// blocks the example input is red too, not a warning, because the Soll says
// the input belongs there (G-3, 03.11.2026; before: a repair without a Soll
// weakened the Soll, B5).
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
const planData = readJson('.plan.json');
function plannedFields(page) {
  if (!planData) return [];
  const out = [];
  if (page.internal) {
    const flow = (planData.flows || []).find(f => f && f.slug === page.slug);
    for (const w of (flow && flow.writes) || []) {
      for (const [k, src] of Object.entries(w.fields || {})) if (String(src).startsWith('user') || src === 'picked') out.push({ entity: w.entity, key: k });
    }
  } else {
    const pg = (planData.public_pages || []).find(p => p && p.slug === page.slug);
    // a reference the visitor never picks: to the record the page's LINK names
    // (link_param) and to a record this page creates in the same submit (the
    // participant a contribution links to) — P-16, Bau 4: both read „no control“
    const lpSurface = page.link_param && typeof page.link_param === 'object' ? page.link_param : null;
    const linkEntity = (lpSurface && lpSurface.entity) || (pg && pg.link_param && pg.link_param.name ? pg.link_param.entity : null);
    const created = new Set(((pg && pg.creates) || []).map(c => c.entity));
    // a reference the page sets itself from its linked record (the active interaction — a
    // `must_equal` check of the page; Bau 11 read „no control“ for exactly that)
    const pageSets = new Set((pg && pg.page_sets) || []);
    // EF-36 (Doodle): a field the page's code sets itself — a plan step's `values`/`link` (the poll from the
    // link, a row id the page makes) — is no visitor input; demanding a control made the repair print a
    // machine key on the page
    let codeSets = new Set();
    try {
      const src = readFileSync(join(ROOT, page.file), 'utf8');
      codeSets = new Set(writtenKeys(src).filter(w => w.how === 'values' || w.how === 'link').map(w => `${w.entity}.${w.key}`));
    } catch { /* no source — the Soll stays as it is */ }
    for (const c of (pg && pg.creates) || []) {
      for (const [k, src] of Object.entries(c.fields || {})) {
        if (!(String(src).startsWith('user') || src === 'picked')) continue;
        if (pageSets.has(`${c.entity}.${k}`) || codeSets.has(`${c.entity}.${k}`)) continue;
        if (src === 'picked') {
          const target = entityOfAppId(targetAppId(control(c.entity, k)));
          if (target && (target === linkEntity || (created.has(target) && target !== c.entity))) continue;
        }
        out.push({ entity: c.entity, key: k });
      }
    }
  }
  return out;
}
// The plan's restrictions on a pick of this entity — a public list's filter AND a
// flow's `reads[].filter` (scaffold, 03.11.2026: the flow's precondition „KI-Ergebnis
// leer“ lived only in the reads, so the smoke picked a record the page rightly
// refused). `eq` sets the value, `empty` clears the field; `value: null` = clear.
function plannedConditions(entity) {
  if (!planData) return [];
  const out = [];
  const take = (flt) => {
    for (const c of ((flt && flt.conditions) || [])) {
      if (!c || !c.field) continue;
      if ((c.op === 'eq' || c.op === '==' || c.op === 'is') && typeof c.value === 'string') out.push({ field: c.field, value: c.value });
      else if (c.op === 'empty') out.push({ field: c.field, value: null });
    }
  };
  for (const pg of planData.public_pages || []) for (const l of (pg && pg.lists) || []) if (l && l.entity === entity) take(l.filter);
  for (const fl of planData.flows || []) for (const r of (fl && fl.reads) || []) if (r && r.entity === entity) take(r.filter);
  return out;
}
function labelOfField(entity, key) {
  const c = apps[entity] && apps[entity].controls && apps[entity].controls[key];
  return (c && c.label) || key;
}

// ── 2. Dependencies: esbuild ships with vite; jsdom is fetched on demand ──────
// jsdom is NOT in the template. It is installed into its own tiny tree under
// .smoke/deps (36 packages, seconds) — never into the app's node_modules: an
// `npm install --no-save` there makes npm reconcile the whole template tree
// against the lockfile, minutes in a cold sandbox, and it may prune packages
// the app needs.
const DEPS_DIR = join(ROOT, SMOKE_DIR, 'deps');
const appRequire = createRequire(join(ROOT, 'package.json'));

async function loadDep(name) {
  for (const base of [join(ROOT, 'package.json'), join(DEPS_DIR, 'package.json')]) {
    try {
      const req = base === join(ROOT, 'package.json') ? appRequire : createRequire(base);
      return await import(req.resolve(name));
    } catch { /* try the next tree */ }
  }
  return null;
}

const tStart = Date.now();
const secs = (from) => ((Date.now() - from) / 1000).toFixed(1);

let esbuild = await loadDep('esbuild');
if (!esbuild) {
  console.log('WARN: render-smoke: esbuild not resolvable from node_modules — smoke skipped');
  process.exit(0);
}
let jsdomMod = await loadDep('jsdom');
if (!jsdomMod) {
  // One installer per tree: six lanes reach check-staging within seconds of
  // each other, and six concurrent `npm install` into the same directory
  // corrupt it. mkdir is the atomic lock; the others wait for the winner.
  const tInstall = Date.now();
  const lockDir = join(ROOT, SMOKE_DIR, 'deps.installing');
  mkdirSync(join(ROOT, SMOKE_DIR), { recursive: true });
  let owner = false;
  try { mkdirSync(lockDir); owner = true; } catch { owner = false; }
  if (owner) {
    try {
      mkdirSync(DEPS_DIR, { recursive: true });
      if (!existsSync(join(DEPS_DIR, 'package.json'))) {
        writeFileSync(join(DEPS_DIR, 'package.json'), JSON.stringify({ name: 'render-smoke-deps', private: true, version: '0.0.0' }));
      }
      execSync('npm install --no-audit --no-fund --no-package-lock --loglevel=error jsdom@26', {
        cwd: DEPS_DIR, stdio: ['ignore', 'inherit', 'inherit'], timeout: 180000,
      });
      jsdomMod = await loadDep('jsdom');
      console.log(`render-smoke: jsdom installed into ${SMOKE_DIR}/deps in ${secs(tInstall)}s`);
    } catch (e) {
      console.log(`WARN: render-smoke: jsdom install failed after ${secs(tInstall)}s (${String(e && e.message || e).split('\n')[0]}) — smoke skipped`);
    } finally {
      try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* fine */ }
    }
  } else {
    for (let waited = 0; waited < 180000 && existsSync(lockDir); waited += 1000) await new Promise(r => setTimeout(r, 1000));
    jsdomMod = await loadDep('jsdom');
    if (jsdomMod) console.log(`render-smoke: jsdom installed by a parallel run (waited ${secs(tInstall)}s)`);
  }
} else {
  console.log('render-smoke: jsdom present');
}
if (!jsdomMod) {
  console.log('WARN: render-smoke: jsdom not available — smoke skipped');
  process.exit(0);
}
if (prepareOnly) {
  console.log(`render-smoke: prepared (esbuild + jsdom ready, ${secs(tStart)}s)`);
  process.exit(0);
}
const { JSDOM } = jsdomMod;

// ── 3. Synthetic visitor data ─────────────────────────────────────────────────
function hex24(seed) {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h.toString(16).padStart(8, '0') + 'a1b2c3d4e5f60718293a4b5c').slice(0, 24);
}

function control(entity, key) {
  const c = apps[entity] && apps[entity].controls && apps[entity].controls[key];
  return c || null;
}

function appIdOf(entity) {
  return (apps[entity] && apps[entity].app_id) || `app-${entity}`;
}

function targetAppId(c) {
  const url = c && (c.lookup_app || c.lookupapp || c.target_app);
  if (typeof url !== 'string') return undefined;
  const m = /\/apps\/([a-f0-9]{24})/i.exec(url);
  return m ? m[1] : url;
}

function fieldConfig(entity, key) {
  const c = control(entity, key);
  const options = c && c.lookup_data && typeof c.lookup_data === 'object'
    ? Object.entries(c.lookup_data).map(([k, l]) => ({ key: k, label: String(l) }))
    : undefined;
  const tgt = targetAppId(c);
  const target_entity = tgt ? Object.keys(apps).find(e => apps[e].app_id === tgt) : undefined;
  return {
    key,
    label: (c && c.label) || key,
    fulltype: (c && c.fulltype) || 'string/text',
    required: Boolean(c && c.required && c.required !== 'None' && c.required !== 'False'),
    ...(options ? { options } : {}),
    ...(c && String(c.fulltype || '').startsWith('multiple') ? { multiple: true } : {}),
    ...(tgt ? { target_app_id: tgt } : {}),
    ...(target_entity ? { target_entity } : {}),
  };
}

function pageConfig(page) {
  const endpoints = (page.endpoints || []).map(ep => ({
    op: ep.op,
    entity: ep.entity,
    app_id: appIdOf(ep.entity),
    fields: (ep.fields || []).map(k => fieldConfig(ep.entity, k)),
    ...(ep.scope ? { scope: ep.scope } : {}),
    ...(ep.scope_description ? { scope_description: ep.scope_description } : {}),
    ...(ep.max_records ? { max_records: ep.max_records } : {}),
    ...(ep.preset_fields ? { preset_fields: ep.preset_fields } : {}),
    ...(ep.default_fields ? { default_fields: ep.default_fields } : {}),
  }));
  const primary = endpoints.find(e => e.op === 'create') || endpoints[0] || { entity: 'page', app_id: 'app-page', fields: [] };
  const lp = page.link_param && typeof page.link_param === 'object' ? page.link_param : null;
  // EF-42: a page that creates runs with the production shape — a pow write door and a
  // challenge-free read door — so a GET that still asks for a `_challenge` is visible here
  const creates = endpoints.some(e => e.op === 'create');
  return {
    type: 'custom',
    entity: primary.entity,
    app_id: primary.app_id,
    grant_id: GRANT_ID,
    challenge: creates ? 'pow' : 'none',
    ...(creates ? { read_grant_id: READ_GRANT_ID } : {}),
    title: page.title || page.slug,
    description: page.description || '',
    thank_you_title: '',
    thank_you_message: '',
    fields: primary.fields,
    endpoints,
    link_param: lp ? {
      name: lp.name || 'id',
      entity: lp.entity,
      app_id: appIdOf(lp.entity),
      label_field: lp.label_field || '',
      secondary_field: lp.secondary_field || null,
    } : null,
  };
}

const today = new Date();
function isoDate(offsetDays) {
  const d = new Date(today.getTime() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

// A reference must point at a record the mock serves: the target's provided
// ids, else its synthetic ids (hex24(<entity>:k) — before, refs used the APP id
// as seed and matched no record, so a page that shows the questions of the
// linked event never found one and its fields never appeared; P-16, Bau 4).
function entityOfAppId(appId) {
  return Object.keys(apps).find(k => apps[k] && apps[k].app_id === appId);
}
function refIdsOf(targetAppIdValue) {
  const ent = entityOfAppId(targetAppIdValue);
  const provided = ent ? providedRecords[ent] : null;
  if (Array.isArray(provided) && provided.length) return provided.map((r, k) => String((r && (r.id || r.record_id)) || hex24(ent + ':' + k)));
  return [0, 1, 2].map(k => hex24((ent || targetAppIdValue) + ':' + k));
}

function fakeValue(entity, key, i, recordsByEntity) {
  const c = control(entity, key) || {};
  const ft = String(c.fulltype || 'string/text');
  const label = c.label || key;
  if (ft.startsWith('multipleapplookup')) {
    const t = targetAppId(c);
    return t ? [`${PUBLIC_API_BASE}/grants/${GRANT_ID}/apps/${t}/records/${refIdsOf(t)[i % refIdsOf(t).length]}`] : [];
  }
  if (ft.startsWith('applookup')) {
    const t = targetAppId(c);
    return t ? `${PUBLIC_API_BASE}/grants/${GRANT_ID}/apps/${t}/records/${refIdsOf(t)[i % refIdsOf(t).length]}` : null;
  }
  if (ft.startsWith('multiplelookup')) {
    const keys = Object.keys(c.lookup_data || {});
    return keys.length ? [keys[i % keys.length]] : [];
  }
  if (ft.startsWith('lookup')) {
    const keys = Object.keys(c.lookup_data || {});
    return keys.length ? keys[i % keys.length] : null;
  }
  if (ft.startsWith('bool')) return i % 2 === 0;
  if (ft.startsWith('int') || ft.startsWith('number')) return 10 * (i + 1);
  if (ft.startsWith('date/datetime')) return `${isoDate(i + 1)}T${String(9 + i).padStart(2, '0')}:00:00`;
  if (ft.startsWith('date')) return isoDate(i + 1);
  if (ft === 'string/email') return `smoke${i + 1}@example.invalid`;
  if (ft === 'string/tel') return `0951 00000${i + 1}`;
  if (ft === 'string/url') return `https://example.invalid/${i + 1}`;
  if (ft.startsWith('file') || ft.startsWith('geo') || ft.startsWith('signature')) return null;
  return `${label} ${i + 1}`;
}

// EF-43 (Doodle KB 6): the page grouped its answer rows by first + last name — two people with the
// same name on two devices became one row, and the older one's answers left the sums. The smoke
// serves the case: for an entity a public page LISTS AND CREATES (one record per submission), every
// synthetic record carries the SAME name as the first — and the same parent, so a page opened per
// record sees them all — while id, device key and every other field differ. The page must show that
// name as often as there are records (one row per submission), or not at all.
const NAME_KEY_RE = /name\b|^name|vorname|nachname|^kuerzel$|^kürzel$/i;
// How many ROWS show a text: the innermost tr / li / role=row elements containing it; a page
// without row elements counts plain occurrences.
function rowsShowing(doc, value) {
  const rows = [...doc.querySelectorAll('tr, li, [role="row"]')].filter(el => text(el).includes(value));
  const inner = rows.filter(el => !rows.some(o => o !== el && el.contains(o)));
  return inner.length || (text(doc.body).split(value).length - 1);
}
function deviceKeysOf(entity) {
  const out = new Set();
  for (const pg of (planData && planData.public_pages) || []) {
    for (const c of pg.creates || []) if (c.entity === entity) {
      for (const [k, src] of Object.entries(c.fields || {})) if (String(src).startsWith('derived:device') || src === 'derived:visitor_key') out.add(k);
    }
  }
  return out;
}
function submissionTwins(entity) {
  const controls = (apps[entity] && apps[entity].controls) || {};
  const devices = deviceKeysOf(entity);
  const names = new Set();
  const parents = new Set();
  let found = false;
  let matrix = false;
  for (const pg of pages) {
    if (pg.internal) continue;
    const eps = Array.isArray(pg.endpoints) ? pg.endpoints : [];
    const pgPlan = ((planData && planData.public_pages) || []).find(p => p && p.slug === pg.slug);
    const lists = eps.some(e => e && e.entity === entity && e.op !== 'create') || Boolean(pgPlan && (pgPlan.lists || []).some(l => l && l.entity === entity));
    const creates = eps.some(e => e && e.entity === entity && e.op === 'create') || Boolean(pgPlan && (pgPlan.creates || []).some(c => c && c.entity === entity));
    if (!lists || !creates) continue;
    found = true;
    const lp = pg.link_param && typeof pg.link_param === 'object' ? pg.link_param : (pgPlan && pgPlan.link_param) || null;
    const linkEntity = lp && lp.entity;
    const listed = new Set([...eps.filter(e => e && e.op !== 'create').map(e => e.entity), ...((pgPlan && pgPlan.lists) || []).map(l => l && l.entity)]);
    for (const [k, c] of Object.entries(controls)) {
      const ft = String(c.fulltype || '');
      if (/^string/.test(ft) && !devices.has(k) && (NAME_KEY_RE.test(k) || /\bname\b/i.test(String(c.label || '')))) names.add(k);
      if (linkEntity && /^applookup/.test(ft) && !/multiple/.test(ft) && entityOfAppId(targetAppId(c)) === linkEntity) parents.add(k);
      // EF-46: a MATRIX — the created entity points at an entity the page also lists (the dates of a
      // poll): one send creates one record per option, so a row is a submission, not a record
      const target = /^applookup/.test(ft) && !/multiple/.test(ft) ? entityOfAppId(targetAppId(c)) : null;
      if (target && target !== entity && target !== linkEntity && listed.has(target)) matrix = true;
    }
  }
  return found && names.size ? { names, parents, matrix, devices } : null;
}
const twinNames = {};   // entity → the one name value every synthetic record of a submission entity carries
const twinMatrix = {};  // entity → true when the page is a matrix (EF-46): records 0 and 1 are ONE submission
function syntheticRecords(entity, n) {
  const controls = (apps[entity] && apps[entity].controls) || {};
  const keys = Object.keys(controls);
  const out = {};
  for (let i = 0; i < n; i++) {
    const id = hex24(entity + ':' + i);
    const fields = {};
    for (const k of keys) fields[k] = fakeValue(entity, k, i);
    // the plan's pick steps must find a record: the first one satisfies every
    // `eq` condition a public list puts on this entity (a status the page scopes to)
    if (i === 0) {
      for (const { field, value } of plannedConditions(entity)) {
        if (!(field in fields)) continue;
        const ft = String((controls[field] && controls[field].fulltype) || '');
        fields[field] = value === null ? null : ft.startsWith('multiplelookup') ? [value] : value;
      }
    }
    out[id] = { id, fields, created_at: `${isoDate(-i - 1)}T08:00:00`, updated_at: null };
  }
  const twins = submissionTwins(entity);
  if (twins) {
    const first = Object.values(out)[0];
    for (const rec of Object.values(out)) {
      for (const k of twins.names) rec.fields[k] = first.fields[k];
      for (const k of twins.parents) rec.fields[k] = first.fields[k];
    }
    twinNames[entity] = [...twins.names].map(k => String(first.fields[k] || '')).filter(Boolean);
    if (twins.matrix) {
      // records 0 and 1 = one send (same device key, created one second apart, two different options);
      // record 2 = the same name from another device two days earlier. Two submissions, three records.
      const recs = Object.values(out);
      if (recs.length >= 2) {
        recs[0].created_at = `${isoDate(-1)}T08:00:00`;
        recs[1].created_at = `${isoDate(-1)}T08:00:01`;
        for (const k of twins.devices) recs[1].fields[k] = recs[0].fields[k];
      }
      twinMatrix[entity] = true;
    }
  }
  return out;
}

const providedRecords = readJson(RECORDS_FILE) || {};
// The owner's field policy per slug (page_job writes it from the page state):
// the walk then sees the page as the visitor does — hidden fields gone,
// fixed values as presets — and a step the policy emptied must be skipped.
const POLICY_FILE = join(SMOKE_DIR, 'policy.json');
const providedPolicy = readJson(POLICY_FILE) || {};

function applyPolicy(cfgPage, policy) {
  if (!policy || typeof policy !== 'object') return cfgPage;
  const fieldRules = policy.fields || {};
  const listRules = policy.lists || {};
  for (const ep of cfgPage.endpoints || []) {
    const rules = fieldRules[ep.entity] || {};
    if (ep.op === 'create') {
      const preset = { ...(ep.preset_fields || {}) };
      ep.fields = (ep.fields || []).filter(f => {
        const r = rules[f.key] || {};
        if (r.fixed !== undefined && r.fixed !== null) preset[f.key] = r.fixed;
        return !r.hidden && (r.fixed === undefined || r.fixed === null);
      }).map(f => {
        const r = rules[f.key] || {};
        return { ...f, ...(r.required !== undefined && r.required !== null ? { required: Boolean(r.required) } : {}), ...(r.label ? { label: r.label } : {}) };
      });
      for (const [k, r] of Object.entries(rules)) if (r.fixed !== undefined && r.fixed !== null) preset[k] = r.fixed;
      if (Object.keys(preset).length) ep.preset_fields = preset;
    } else {
      const lr = listRules[ep.entity] || {};
      const hidden = new Set(lr.hidden || []);
      if (hidden.size) ep.fields = (ep.fields || []).filter(f => !hidden.has(f.key));
      // The owner's filter and size run in the grant; the mock applies them
      // to the records it serves (projectList), so the page sees the same list.
      if (lr.filter && (lr.filter.field || (lr.filter.conditions || []).length)) ep.owner_filter = lr.filter;
      if (lr.max_records) ep.max_records = Math.min(Number(lr.max_records), Number(ep.max_records || 500));
    }
  }
  const primary = (cfgPage.endpoints || []).find(e => e.op === 'create');
  if (primary) cfgPage.fields = primary.fields;
  if (Object.keys(fieldRules).length) cfgPage.policy = { fields: fieldRules };
  for (const k of ['title', 'description', 'thank_you_title', 'thank_you_message']) {
    if (policy.texts && policy.texts[k]) cfgPage[k] = policy.texts[k];
  }
  return cfgPage;
}
const recordsCache = new Map();
function recordsFor(entity) {
  if (recordsCache.has(entity)) return recordsCache.get(entity);
  let map;
  const provided = providedRecords[entity];
  if (Array.isArray(provided) && provided.length > 0) {
    map = {};
    for (const r of provided) {
      const id = String((r && (r.id || r.record_id)) || hex24(entity + ':' + Object.keys(map).length));
      map[id] = { id, fields: (r && r.fields) || {}, created_at: (r && r.created_at) || `${isoDate(-1)}T08:00:00`, updated_at: null };
    }
  } else {
    map = syntheticRecords(entity, 3);
  }
  recordsCache.set(entity, map);
  return map;
}

// The real grant answers a list with the endpoint's projection only — a
// column the owner hid (or the page never declared) is simply absent. The
// mock does the same, so a page that filters on a hidden column runs here
// exactly as it does for the visitor (live: FeWo counted "verfügbar" from a
// status the list no longer carried).
function projectList(cfg, entity, map) {
  const page = Object.values(cfg.pages || {})[0] || {};
  const ep = (page.endpoints || []).find(e => e.op !== 'create' && e.entity === entity);
  if (!ep || !Array.isArray(ep.fields) || ep.fields.length === 0) return map;
  const keep = new Set(ep.fields.map(f => f.key));
  const flt = ep.owner_filter;
  const norm = (x) => (x && typeof x === 'object' && 'key' in x) ? String(x.key) : (typeof x === 'boolean' ? String(x) : String(x ?? ''));
  const same = (a, b) => norm(a).toLowerCase() === norm(b).toLowerCase();
  const dateOf = (v) => {
    if (v && typeof v === 'object' && v.rel) { const d = new Date(); d.setDate(d.getDate() + Number(v.days || 0)); return v.rel === 'today' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 16); }
    return String(v ?? '');
  };
  const holds = (c, all) => {
    const v = all[c.field];
    const empty = v === undefined || v === null || v === '';
    switch (c.op) {
      case 'empty': return empty;
      case 'not_empty': return !empty;
      case 'eq': return same(v, c.value);
      case 'ne': return !same(v, c.value);
      case 'in': return (Array.isArray(c.value) ? c.value : [c.value]).some(x => same(v, x));
      case 'not_in': return !(Array.isArray(c.value) ? c.value : [c.value]).some(x => same(v, x));
      default: {
        if (empty) return false;
        const isDate = c.value && typeof c.value === 'object' || /^\d{4}-\d{2}-\d{2}/.test(String(c.value));
        const a = isDate ? String(v) : Number(v), b = isDate ? dateOf(c.value) : Number(c.value);
        if (c.op === 'gt') return a > b; if (c.op === 'gte') return a >= b; if (c.op === 'lt') return a < b; return a <= b;
      }
    }
  };
  const out = {};
  let n = 0;
  for (const [id, rec] of Object.entries(map)) {
    const all = rec.fields || {};
    if (flt) {
      const conds = Array.isArray(flt.conditions) ? flt.conditions : (flt.field ? [flt] : []);
      const results = conds.map(c => holds(c, all));
      const ok = flt.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
      if (conds.length && !ok) continue;
    }
    if (ep.max_records && n >= Number(ep.max_records)) break;
    const fields = {};
    for (const [k, v] of Object.entries(all)) if (keep.has(k)) fields[k] = v;
    out[id] = { ...rec, fields };
    n++;
  }
  return out;
}

function entityByAppId(appId) {
  return Object.keys(apps).find(e => apps[e].app_id === appId) || null;
}

// EF-32: an entity with a consent yes/no next to e-mail fields — the same reading as consent.ts
const CONSENT_RE = /(einwilligung|zustimmung|consent|dsgvo|datenschutz)/i;
function consentPair(entity) {
  const controls = (apps[entity] || {}).controls || {};
  const personal = Object.keys(controls).filter(k => /email/.test(String(controls[k].fulltype || '')));
  const consent = Object.keys(controls).find(k => /^bool/.test(String(controls[k].fulltype || '')) && (CONSENT_RE.test(k) || CONSENT_RE.test(String(controls[k].label || ''))));
  return personal.length && consent ? { consent, personal } : null;
}
function consentViolation(entity, fields) {
  const pair = entity ? consentPair(entity) : null;
  if (!pair) return null;
  const v = fields[pair.consent];
  if (v === true || v === 'true' || v === 1) return null;
  const sent = pair.personal.filter(k => typeof fields[k] === 'string' && fields[k].trim());
  return sent.length ? `${entity}: ${sent.join(', ')} sent without „${pair.consent}“` : null;
}

// ── 4. The mocked network ─────────────────────────────────────────────────────
function makeFetch(cfg, log) {
  let inflight = 0;
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
  const impl = async (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String((init && init.method) || 'GET').toUpperCase();
    inflight++;
    try {
      await new Promise(r => setTimeout(r, 5));
      log.requests.push(`${method} ${url}`);
      if (/public-pages\.json(\?|$)/.test(url)) return json(cfg);
      if (/\/locales\/[\w-]+\.json(\?|$)/.test(url)) return new Response('{}', { status: 404 });
      if (/\/version\.json(\?|$)/.test(url)) return json({ version: 'smoke' });
      if (/_challenge(\?|$)/.test(url)) {
        // a trivially solvable pair: sha256('s' + '0')
        return json({ salt: 's', challenge: 'ec18eac8d758b1eba52d3c10d39adc6dd9806472cb4ae069635d383d9086a513', maxnumber: 1, token: 'smoke', expires_at: new Date(Date.now() + 60000).toISOString() });
      }
      let m = /\/grants\/[^/]+\/apps\/([^/?]+)\/records\/([^/?]+)/.exec(url);
      if (m && method === 'GET') {
        const entity = entityByAppId(m[1]);
        const rec = entity ? recordsFor(entity)[m[2]] : null;
        return rec ? json(rec) : json({ detail: 'not found' }, 404);
      }
      m = /\/grants\/[^/]+\/apps\/([^/?]+)\/records(\?|$)/.exec(url);
      if (m && method === 'GET') {
        const entity = entityByAppId(m[1]);
        return json(entity ? projectList(cfg, entity, recordsFor(entity)) : {});
      }
      if (m && method === 'POST') {
        let fields = {};
        try { fields = JSON.parse(init && init.body || '{}').fields || {}; } catch { /* body not JSON */ }
        // EF-33 (Doodle, 0.0.541): a field the grant does not list is refused by the platform with
        // 400 — the mock accepted anything and the page went live broken. Same rule here.
        const eps = Object.values(cfg.pages || {}).flatMap(p => (p.endpoints || []).filter(e => e.op === 'create' && e.app_id === m[1]));
        if (eps.length) {
          const allowed = new Set(eps.flatMap(e => [...(e.fields || []).map(f => (typeof f === 'string' ? f : f.key)),
            ...Object.keys(e.preset_fields || {}), ...Object.keys(e.default_fields || {})]));
          const extra = Object.keys(fields).filter(k => !allowed.has(k));
          if (extra.length) {
            log.refused = [...(log.refused || []), `${entityByAppId(m[1]) || m[1]}: ${extra.join(', ')}`];
            return json({ type: 'unsupported_field', title: 'Unsupported field',
              detail: `The grant does not allow: ${extra.join(', ')}`, status: 400 }, 400);
          }
          // EF-38 (Doodle Kontrollbau 3): a required field of the grant missing in the body is a 400
          // `missing_fields` on the platform — the names never arrived and nobody could vote
          const presets = new Set(eps.flatMap(e => [...Object.keys(e.preset_fields || {}), ...Object.keys(e.default_fields || {})]));
          const required = [...new Set(eps.flatMap(e => (e.fields || []).filter(f => f && typeof f === 'object' && f.required).map(f => f.key)))];
          const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
          const missing = required.filter(k => !presets.has(k) && empty(fields[k]));
          if (missing.length) {
            log.refused = [...(log.refused || []), `${entityByAppId(m[1]) || m[1]}: missing ${missing.join(', ')}`];
            return json({ type: 'public-grant-validation-error', title: 'Validation error', missing_fields: missing,
              detail: `Missing required fields: ${missing.join(', ')}`, status: 400 }, 400);
          }
        }
        const id = hex24('created:' + log.created.length);
        const violation = consentViolation(entityByAppId(m[1]), fields);
        if (violation) (log.consent ??= []).push(violation);
        log.created.push({ app_id: m[1], fields });
        return json({ id, fields, created_at: new Date().toISOString().slice(0, 19), updated_at: null }, 201);
      }
      // The internal door (livingAppsService via servicePort): the same
      // synthetic records, the app's REST shapes — a list is a map keyed by
      // id, one record carries `id`, aggregate_records answers [[n]].
      m = /\/rest(?:\/v1)?\/apps\/([^/?]+)\/aggregate_records/.exec(url);
      if (m) {
        const entity = entityByAppId(m[1]);
        return json([[entity ? Object.keys(recordsFor(entity)).length : 0]]);
      }
      m = /\/rest(?:\/v1)?\/apps\/([^/?]+)\/records\/([^/?]+)(\?|$)/.exec(url);
      if (m && method === 'GET') {
        const entity = entityByAppId(m[1]);
        const rec = entity ? recordsFor(entity)[m[2]] : null;
        return rec ? json(rec) : json({ detail: 'not found' }, 404);
      }
      if (m && method === 'PATCH') {
        const entity = entityByAppId(m[1]);
        const rec = entity ? recordsFor(entity)[m[2]] : null;
        if (!rec) return json({ detail: 'not found' }, 404);
        let fields = {};
        try { fields = JSON.parse(init && init.body || '{}').fields || {}; } catch { /* body not JSON */ }
        rec.fields = { ...rec.fields, ...fields };
        rec.updated_at = new Date().toISOString().slice(0, 19);
        log.updated.push({ app_id: m[1], id: m[2], fields });
        return json(rec);
      }
      if (m && method === 'DELETE') return new Response('', { status: 204 });
      m = /\/rest(?:\/v1)?\/apps\/([^/?]+)\/records(\?|$)/.exec(url);
      if (m && method === 'GET') {
        const entity = entityByAppId(m[1]);
        return json(entity ? recordsFor(entity) : {});
      }
      if (m && method === 'POST') {
        let fields = {};
        try { fields = JSON.parse(init && init.body || '{}').fields || {}; } catch { /* body not JSON */ }
        const id = hex24('created:' + log.created.length);
        const entity = entityByAppId(m[1]);
        const rec = { id, fields, created_at: new Date().toISOString().slice(0, 19), updated_at: null };
        if (entity) recordsFor(entity)[id] = rec;
        log.created.push({ app_id: m[1], fields });
        return json(rec, 201);
      }
      if (/\/rest(?:\/v1)?\/user(\?|$)/.test(url)) return json({ id: 'smoke-user', name: 'Smoke' });
      if (/sentry|\/rest\/|\/litellm\//.test(url)) return new Response('', { status: 204 });
      log.unexpected.push(`${method} ${url}`);
      return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
    } finally {
      inflight--;
    }
  };
  impl.pending = () => inflight;
  return impl;
}

// ── 5. A browser-shaped global scope ──────────────────────────────────────────
const installedGlobals = new Set();

function installDom(slug, onJsdomError, internal = false, query = '', hashPath = null) {
  const virtualConsole = new jsdomMod.VirtualConsole();
  virtualConsole.sendTo(console, { omitJSDOMErrors: true });
  virtualConsole.on('jsdomError', (e) => onJsdomError(e));
  const dom = new JSDOM('<!doctype html><html lang="de"><head></head><body><div id="root"></div></body></html>', {
    url: `http://smoke.invalid/objects/smoke/#/${hashPath ?? `${internal ? 'intents' : 'public'}/${slug}`}${query}`,
    pretendToBeVisual: true,
    virtualConsole,
  });
  const win = dom.window;
  const define = (k, v) => {
    try { Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); installedGlobals.add(k); } catch { /* read-only host global */ }
  };
  const mirror = (k) => {
    try { Object.defineProperty(globalThis, k, { get: () => win[k], configurable: true }); installedGlobals.add(k); } catch { /* keep */ }
  };
  define('window', win);
  define('document', win.document);
  define('navigator', win.navigator);
  define('self', win);
  // Every page gets a fresh window: re-point what an earlier page installed.
  for (const k of Object.getOwnPropertyNames(win)) {
    if (k in globalThis && !installedGlobals.has(k)) continue;
    const d = Object.getOwnPropertyDescriptor(win, k);
    if (d && ('value' in d || d.get)) mirror(k);
  }
  for (const k of ['localStorage', 'sessionStorage', 'location', 'history', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) mirror(k);
  // EventTarget members live on the prototype, not on the instance — Sentry
  // and friends call `globalThis.addEventListener('pagehide', …)` directly.
  for (const k of ['addEventListener', 'removeEventListener', 'dispatchEvent']) {
    if (typeof win[k] === 'function') define(k, win[k].bind(win));
  }
  // Media queries: the DatePicker asks for '(pointer: coarse)' and renders a
  // native <input type="date"> when it matches — the branch a script can fill.
  const mm = (q) => ({ matches: /pointer:\s*coarse/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
  win.matchMedia = mm; define('matchMedia', mm);
  class NoopObserver { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } }
  if (!win.ResizeObserver) { win.ResizeObserver = NoopObserver; define('ResizeObserver', NoopObserver); }
  if (!win.IntersectionObserver) { win.IntersectionObserver = NoopObserver; define('IntersectionObserver', NoopObserver); }
  win.HTMLElement.prototype.scrollIntoView = function () {};
  win.print = () => {};
  win.scrollTo = () => {};
  return dom;
}

// ── 6. Bundle one page with esbuild ───────────────────────────────────────────
function aliasPlugin() {
  let extra = {};
  try { extra = JSON.parse(process.env.RENDER_SMOKE_ALIASES || '{}'); } catch { extra = {}; }
  const keys = Object.keys(extra);
  return {
    name: 'render-smoke-aliases',
    setup(build) {
      if (keys.length === 0) return;
      build.onResolve({ filter: /.*/ }, (args) => {
        if (extra[args.path]) return { path: extra[args.path] };
        return null;
      });
    },
  };
}

async function bundlePage(page) {
  mkdirSync(join(ROOT, SMOKE_DIR), { recursive: true });
  const entry = join(ROOT, SMOKE_DIR, `entry-${page.slug}.tsx`);
  const outfile = join(ROOT, SMOKE_DIR, `bundle-${page.slug}.mjs`);
  writeFileSync(entry, [
    "import React from 'react';",
    "import { createRoot } from 'react-dom/client';",
    "import { HashRouter } from 'react-router-dom';",
    `import Page from '../${page.file.replace(/\.tsx$/, '')}';`,
    'export { React, createRoot, HashRouter, Page };',
    '',
  ].join('\n'));
  const result = await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    write: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    jsx: 'automatic',
    jsxDev: false,
    sourcemap: 'inline',
    alias: { '@': resolve(ROOT, 'src') },
    plugins: [aliasPlugin()],
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.jpeg': 'dataurl', '.gif': 'dataurl', '.webp': 'dataurl', '.woff': 'empty', '.woff2': 'empty' },
    define: {
      'process.env.NODE_ENV': '"development"',
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
      'import.meta.env.MODE': '"development"',
      'import.meta.env.SSR': 'false',
      'import.meta.env.BASE_URL': '"./"',
    },
    logLevel: 'silent',
    absWorkingDir: ROOT,
  });
  return { outfile, warnings: result.warnings || [] };
}

// ── 7. The walk ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function text(el) {
  return (el && el.textContent || '').replace(/\s+/g, ' ').trim();
}

function visible(el) {
  // jsdom has no layout: "visible" means attached and not hidden by attribute.
  if (!el || !el.isConnected) return false;
  for (let n = el; n; n = n.parentElement) {
    if (n.hidden || n.getAttribute('aria-hidden') === 'true') return false;
  }
  return true;
}

async function settle(doc, fetchImpl, maxMs = SETTLE_MS) {
  const start = Date.now();
  let last = '';
  let stable = 0;
  while (Date.now() - start < maxMs) {
    await sleep(40);
    const now = doc.body.innerHTML;
    if (now === last && fetchImpl.pending() === 0) {
      stable++;
      if (stable >= 3) return;
    } else {
      stable = 0;
      last = now;
    }
  }
}

function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? el.ownerDocument.defaultView.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? el.ownerDocument.defaultView.HTMLSelectElement.prototype
    : el.ownerDocument.defaultView.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('input', { bubbles: true }));
  el.dispatchEvent(new el.ownerDocument.defaultView.Event('change', { bubbles: true }));
}

function click(el) {
  const win = el.ownerDocument.defaultView;
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    try { el.dispatchEvent(new win.MouseEvent(type, { bubbles: true, cancelable: true, button: 0 })); } catch { /* jsdom: PointerEvent missing */ }
  }
  el.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
}

function currentStep(doc) {
  // The shell writes the step into the URL (`?step=n`, absent on step 1);
  // that is the page's own numbering. The indicator's position is only a
  // fallback — a skipped step (enabledIf, emptied by the owner's policy) is
  // not rendered there, so positions and step numbers drift apart.
  const m = /[?&]step=(\d+)/.exec(doc.defaultView.location.hash);
  if (m) return Number(m[1]);
  const cur = doc.querySelector('[aria-current="step"]');
  if (cur) {
    const li = cur.closest('li');
    if (li && li.parentElement) return Array.from(li.parentElement.children).indexOf(li) + 1;
  }
  return 1;
}

function stepRegion(doc) {
  return doc.querySelector('[role="region"]') || doc.body;   // the body: a portal renders outside #root
}

const CONTROL_SELECTOR = [
  '[data-field]', 'input:not([type="hidden"])', 'textarea', 'select',
  '[role="radio"]', '[role="option"]', '[role="checkbox"]', '[role="switch"]', '[role="combobox"]',
  'button[aria-pressed]', '[data-key]', '[data-journey-range]',
  '[data-journey-summary]', '[data-journey-success]', '[data-journey-file]',
].join(', ');

function hasControls(region) {
  return Array.from(region.querySelectorAll(CONTROL_SELECTOR)).some(visible);
}

// A step that SHOWS something instead of asking („Vorschlag ansehen“, the
// decision's preparation before the verdict) has no control — and is not
// empty: below its heading it renders values of a record the door served.
// A hint sentence alone („Bitte unten fortfahren.“) still is an empty step.
// Live 20.10.2026 two lanes failed here and added a meaningless
// data-key/data-field to a div just to pass; a gate that punishes a
// legitimate step trains the agents to game it.
function readContent(region) {
  const clone = region.cloneNode(true);
  for (const el of clone.querySelectorAll('[data-journey-step-heading], button, nav, [role="alert"]')) el.remove();
  return text(clone);
}
function showsRecord(region) {
  const content = readContent(region);
  if (!content) return false;
  for (const map of recordsCache.values()) {
    for (const rec of Object.values(map)) {
      for (const v of Object.values(rec.fields || {})) {
        const s = v && typeof v === 'object' && 'label' in v ? v.label : v;
        if (typeof s !== 'string' || s.trim().length < 4 || /^https?:|^\d{4}-\d{2}-\d{2}/.test(s)) continue;
        if (content.includes(s.trim().slice(0, 20))) return true;
      }
    }
  }
  return false;
}

let askedKeys = new Set();   // control names the walk met on this page (the Soll check reads it)
function noteAsked(el) {
  const name = el && (el.getAttribute('name') || el.getAttribute('data-key') || el.id);
  if (name) askedKeys.add(String(name).replace(/^[^-]*-/, '').toLowerCase()), askedKeys.add(String(name).toLowerCase());
}

function fillStep(region, doc) {
  const actions = [];
  // Cards / pills (EntitySelectStep, ChoiceGroup): pick the first one when nothing is picked.
  for (const group of region.querySelectorAll('[role="radiogroup"], [role="group"]')) {
    const options = Array.from(group.querySelectorAll('[role="radio"], [role="checkbox"]')).filter(visible);
    noteAsked(group);
    if (options.length === 0) continue;
    if (options.some(o => o.getAttribute('aria-checked') === 'true')) continue;
    click(options[0]); actions.push(`pick ${text(options[0]).slice(0, 30) || 'option'}`);
  }
  // A single checkbox or switch (shadcn: `button role="checkbox"`, outside any
  // group) IS the control for a bool field — the walk notes it and leaves its
  // default alone (gold-18, 03.11.2026: every unticked bool of the Schreibliste
  // counted as „no step asked for it“).
  for (const el of region.querySelectorAll('[role="checkbox"], [role="switch"]')) {
    if (!visible(el) || el.closest('[role="radiogroup"], [role="group"]')) continue;
    noteAsked(el);
    const lbl = el.id && region.querySelector(`label[for="${el.id}"]`);
    if (lbl) actions.push(`bool ${text(lbl).slice(0, 30)}`);
  }
  const cards = Array.from(region.querySelectorAll('button[aria-pressed]')).filter(v => visible(v) && !v.hasAttribute('data-day'));
  if (cards.length > 0 && !cards.some(c => c.getAttribute('aria-pressed') === 'true')) {
    click(cards[0]); actions.push(`card ${text(cards[0]).slice(0, 30)}`);
  }
  // Availability range: two free days ahead.
  for (const range of region.querySelectorAll('[data-journey-range]')) {
    const days = Array.from(range.querySelectorAll('button[data-day]')).filter(b => !b.disabled && visible(b));
    const pressed = days.filter(b => b.getAttribute('aria-pressed') === 'true');
    if (pressed.length >= 2 || days.length < 2) continue;
    const todayIso = isoDate(0);
    const future = days.filter(b => b.getAttribute('data-day') > todayIso);
    const pick = future.length >= 2 ? future : days;
    click(pick[0]); actions.push(`range from ${pick[0].getAttribute('data-day')}`);
    if (pick[1]) { click(pick[1]); actions.push(`range to ${pick[1].getAttribute('data-day')}`); }
  }
  // Combobox pickers: open, take the first option.
  for (const box of region.querySelectorAll('input[role="combobox"]')) {
    if (!visible(box) || box.value) continue;
    box.focus(); click(box);
    setNativeValue(box, 'a');
    actions.push('combobox open');
  }
  // A file field (FileField): choose a small PDF once — it travels as a data URL.
  for (const el of region.querySelectorAll('input[type="file"]')) {
    if (el.disabled || !el.parentElement || !el.parentElement.querySelector('[data-journey-file]')) continue;
    const win = el.ownerDocument.defaultView;
    const file = new win.File(['%PDF-1.4\n%%EOF\n'], 'smoke.pdf', { type: 'application/pdf' });
    Object.defineProperty(el, 'files', { value: [file], configurable: true });
    el.dispatchEvent(new win.Event('change', { bubbles: true }));
    actions.push('file smoke.pdf');
  }
  // Plain controls.
  for (const el of region.querySelectorAll('input:not([type="hidden"]), textarea, select')) {
    if (!visible(el)) continue;
    noteAsked(el);
    if (el.disabled || el.readOnly) continue;
    if (el.getAttribute('role') === 'combobox') continue;
    const type = (el.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : 'text')).toLowerCase();
    if (type === 'checkbox' || type === 'radio' || type === 'file' || type === 'submit' || type === 'button') continue;
    // A picker's search box narrows the cards — typing there hides them.
    if (type === 'search' || el.getAttribute('role') === 'searchbox' || el.getAttribute('aria-controls')) continue;
    if (el.value !== '' && el.value !== null) continue;
    let value;
    switch (type) {
      case 'email': value = 'smoke@example.invalid'; break;
      case 'tel': value = '0951 123456'; break;
      case 'url': value = 'https://example.invalid'; break;
      case 'number': {
        const min = parseFloat(el.getAttribute('min') || '');
        value = Number.isFinite(min) && min > 1 ? String(min) : '1';
        break;
      }
      case 'date': value = isoDate(7); break;
      case 'datetime-local': value = `${isoDate(7)}T10:30`; break;
      case 'time': value = '10:30'; break;
      case 'select': {
        const opt = Array.from(el.options).find(o => o.value !== '' && !o.disabled);
        value = opt ? opt.value : null;
        break;
      }
      case 'textarea': value = 'Smoke-Test'; break;
      default: {
        const mode = (el.getAttribute('inputmode') || '').toLowerCase();
        if (mode === 'numeric' || mode === 'decimal') value = '1';
        else if (mode === 'email') value = 'smoke@example.invalid';
        else if (mode === 'tel') value = '0951 123456';
        else value = 'Smoke-Test';
      }
    }
    if (value === null) continue;
    setNativeValue(el, value);
    actions.push(`${type} ${el.getAttribute('name') || el.id || ''}=${value}`);
  }
  return actions;
}

function alertsIn(doc) {
  return Array.from(doc.querySelectorAll('[role="alert"], [data-journey-error-summary]')).filter(visible).map(text).filter(Boolean);
}

async function smokePage(page) {
  const file = page.file;
  const pageReport = { slug: page.slug, file, internal: Boolean(page.internal), steps: [], result: 'unknown', errors: [], warnings: [], requests: [] };
  askedKeys = new Set();
  const fail = (msg) => { pageReport.errors.push(msg); errors.push(`${file}: render-smoke '${page.slug}': ${msg}`); };
  const warn = (msg) => { pageReport.warnings.push(msg); warnings.push(`${file}: render-smoke '${page.slug}': ${msg}`); };

  if (!existsSync(join(ROOT, file))) {
    fail(page.internal ? `${file} does not exist` : `declared in ${SURFACE} but ${file} does not exist`);
    pageReport.result = 'missing';
    return pageReport;
  }

  let bundle;
  try {
    bundle = await bundlePage(page);
  } catch (e) {
    const msg = (e && e.errors && e.errors.length)
      ? e.errors.map(x => `${x.location ? `${x.location.file}:${x.location.line}: ` : ''}${x.text}`).join('; ')
      : String(e && e.message || e);
    fail(`does not bundle: ${msg.slice(0, 600)}`);
    pageReport.result = 'bundle-error';
    return pageReport;
  }

  // A public page gets its synthetic grant config; an internal page talks to
  // the app's own door and needs none.
  const cfg = page.internal
    ? { version: 1, public_api_base: PUBLIC_API_BASE, pages: {}, unpublished_count: 0 }
    : { version: 1, public_api_base: PUBLIC_API_BASE, pages: { [page.slug]: applyPolicy(pageConfig(page), providedPolicy[page.slug]) }, unpublished_count: 0 };
  if (!page.internal && providedPolicy[page.slug]) pageReport.policy = providedPolicy[page.slug];
  const log = { requests: [], created: [], updated: [], unexpected: [] };

  const runtimeErrors = [];
  const consoleNoise = [];
  const origConsoleError = console.error;
  // React logs a thrown component error before a boundary catches it; a key
  // or act() warning is dev noise. Only error signatures count.
  const looksLikeError = (line) => /(TypeError|ReferenceError|RangeError|SyntaxError|Uncaught|Minified React error|Objects are not valid as a React child|The above error occurred|error boundary|Maximum update depth|Rendered (more|fewer) hooks)/i.test(line);
  console.error = (...args) => {
    const line = args.map(a => (a && a.stack) || (typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })())).join(' ');
    const short = line.split('\n').slice(0, 3).join(' ').slice(0, 500);
    if (looksLikeError(line)) runtimeErrors.push(short); else consoleNoise.push(short);
  };
  const onWindowError = (ev) => { runtimeErrors.push(String(ev && (ev.error && ev.error.stack || ev.message) || ev).slice(0, 500)); };
  // A page that declares a link_param is opened the way its link opens it —
  // with `?<name>=<id>` of a smoke record of that entity. Without it the walk
  // saw only the entry screen („laufende Veranstaltungen … Öffnen“) and the
  // Soll check called every ordered field „no control“ (scaffold, 03.11.2026).
  let linkQuery = '';
  const lpDecl = page.link_param && typeof page.link_param === 'object' ? page.link_param : null;
  if (lpDecl && lpDecl.entity) {
    const first = Object.keys(recordsFor(lpDecl.entity))[0];
    if (first) linkQuery = `?${encodeURIComponent(lpDecl.name || 'id')}=${encodeURIComponent(first)}`;
  }
  const dom = installDom(page.slug, (e) => { runtimeErrors.push(`uncaught: ${String(e && (e.detail && e.detail.stack || e.message) || e).slice(0, 400)}`); }, page.internal, linkQuery);
  if (linkQuery) pageReport.opened_with = linkQuery;
  const doc = dom.window.document;
  const fetchImpl = makeFetch(cfg, log);
  dom.window.fetch = fetchImpl;
  Object.defineProperty(globalThis, 'fetch', { value: fetchImpl, configurable: true, writable: true });
  dom.window.addEventListener('error', onWindowError);
  const onRejection = (reason) => { runtimeErrors.push(`unhandled rejection: ${String(reason && reason.stack || reason).slice(0, 400)}`); };
  process.on('unhandledRejection', onRejection);

  let root = null;
  try {
    const mod = await import(pathToFileURL(bundle.outfile).href + `?t=${Date.now()}`);
    const { React, createRoot, HashRouter, Page } = mod;
    let boundaryError = null;
    class Boundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      componentDidCatch(error) { boundaryError = error; }
      render() { return this.state.error ? React.createElement('div', { 'data-smoke-crash': '' }, String(this.state.error && this.state.error.message || this.state.error)) : this.props.children; }
    }
    root = createRoot(doc.getElementById('root'));
    root.render(React.createElement(Boundary, null, React.createElement(HashRouter, null, React.createElement(Page, null))));
    await settle(doc, fetchImpl);

    // Loading may legitimately take a moment (config, then records).
    for (let i = 0; i < 5 && doc.querySelector('[data-public-loading]'); i++) await settle(doc, fetchImpl, 2000);

    const crashed = () => boundaryError || doc.querySelector('[data-smoke-crash]');
    if (crashed()) {
      fail(`crashes while rendering: ${String((boundaryError && boundaryError.message) || text(doc.querySelector('[data-smoke-crash]'))).slice(0, 300)}`);
      pageReport.result = 'crash';
      return pageReport;
    }
    // An internal wizard opens with its start screen ("So funktioniert's" +
    // "Los geht's"); the visitor presses the button, so does the smoke.
    const start = doc.querySelector('[data-journey-intro] [data-journey-start]');
    if (start && visible(start)) {
      click(start);
      await settle(doc, fetchImpl);
      pageReport.steps.push({ step: 'intro', text: 'start pressed' });
      if (crashed()) {
        fail(`crashes after the start screen: ${String((boundaryError && boundaryError.message) || text(doc.querySelector('[data-smoke-crash]'))).slice(0, 300)}`);
        pageReport.result = 'crash';
        return pageReport;
      }
    }
    if (!page.internal && doc.querySelector('[data-public-unavailable]')) {
      fail(`reports "not available" against its own declaration — the page loads a slug or endpoint the surface does not declare (requests: ${log.requests.filter(r => !/sentry/.test(r)).slice(0, 4).join(' | ')})`);
      pageReport.result = 'unavailable';
      return pageReport;
    }
    if (doc.querySelector('[data-public-loading]')) {
      fail('never leaves the loading state (config or records request left unanswered)');
      pageReport.result = 'stuck-loading';
      return pageReport;
    }

    // EF-43: every synthetic record of a submission entity carries the same name — a page that
    // shows that name shows it once per record (one row per submission), never once for all.
    if (!page.internal) {
      const shown = text(doc.body);
      for (const [entity, values] of Object.entries(twinNames)) {
        if (providedRecords[entity] && Object.keys(providedRecords[entity]).length) continue;   // real records: no twins
        const total = Object.keys(recordsFor(entity)).length;
        const v = values[0];
        if (!v || total < 2) continue;
        const seen = shown.split(v).length - 1;
        if (seen === 1) {
          fail(`shows »${v}« once although ${total} '${entity}' records carry that name (same name from ${total} devices) — the page folds submissions by name; one row per submission: group with submissionsOf(records, { key: '<the page's device field>', names: [<name fields>] }) from @/lib/journey, count every stored record once (EF-43)`);
          pageReport.result = 'same-name-collapsed';
          pageReport.steps.push({ step: 0, label: 'page', text: shown.slice(0, 300) });
          return pageReport;
        }
        // EF-46 (Doodle KB 7): records 0 and 1 are ONE send (same device key, one second apart) —
        // a page that shows the name once per RECORD lists three rows for two submissions
        if (twinMatrix[entity] && total >= 3 && rowsShowing(doc, v) >= total) {
          fail(`shows »${v}« ${rowsShowing(doc, v)} times for ${total} '${entity}' records that are TWO submissions (two records share the device key and were created one second apart) — the page shows one row per RECORD; one row per SUBMISSION: submissionsOf(records, { key: '<the page's device field>', names: [<name fields>] }) from @/lib/journey — same key, else same name within seconds, is one row; the same name from another send is a second row with its time (EF-46)`);
          pageReport.result = 'rows-per-record';
          pageReport.steps.push({ step: 0, label: 'page', text: shown.slice(0, 300) });
          return pageReport;
        }
      }
    }

    const isWizard = Boolean(doc.querySelector('[aria-current="step"], [data-journey-next], [data-journey-summary]'));
    if (!isWizard) {
      // A landing page or a one-screen form: rendered without a crash, with
      // content — that is the whole test for it.
      const body = text(doc.body);   // the whole document: dialogs and sheets render through portals outside #root
      if (body.length < 20) fail(`renders almost nothing (${JSON.stringify(body)})`);
      // The Soll holds here too: a one-screen page must show a control for every
      // field the plan orders (scaffold, 03.11.2026: the check ran only in the
      // wizard branch, so a planned one-screen page was „green“ by rendering).
      const planned = plannedFields(page);
      if (planned.length) {
        const lowered = body.toLowerCase();
        const asked = key => Boolean(doc.querySelector(`[name="${key}"], [data-key="${key}"], [id="${key}"], [id$="-${key}"]`)) || askedKeys.has(key.toLowerCase());
        const never = planned.filter(({ entity, key }) => !asked(key) && !lowered.includes(String(labelOfField(entity, key)).toLowerCase()));
        pageReport.soll = { planned: planned.length, missing: never.map(f => `${f.entity}.${f.key}`) };
        if (never.length) {
          fail(`the plan orders ${never.map(f => `»${labelOfField(f.entity, f.key)}« (${f.entity}.${f.key})`).join(', ')} and the page shows no control for it`);
          pageReport.result = 'soll-missing';
          pageReport.steps.push({ step: 0, label: 'page', text: body.slice(0, 300) });
          return pageReport;
        }
      }
      // EF-31 (Bau 19): a one-screen form was „rendered“ and green while its send-time check refused
      // EVERY submit — the walk never pressed „Senden“. A page the plan gives creates is filled with
      // example input and sent once against the mocked door: at least one create, or the page is red.
      const pgPlan = !page.internal && planData ? (planData.public_pages || []).find(p => p && p.slug === page.slug) : null;
      if (!pageReport.errors.length && pgPlan && (pgPlan.creates || []).length) {
        const sendBtn = Array.from(doc.querySelectorAll('form button[type="submit"], [data-journey-confirm], button'))
          .filter(visible)
          .find(b => b.matches('form button[type="submit"], [data-journey-confirm]') || /\b(senden|absenden|abschicken|einreichen|send|submit)\b/i.test(text(b)));
        if (sendBtn) {
          const filled = fillStep(doc.body, doc);
          await settle(doc, fetchImpl);
          // EF-32 negative probe: the e-mail typed, the consent NOT ticked — nothing personal may arrive
          const consentEntities = (pgPlan.creates || []).map(c => c.entity).filter(e => consentPair(e));
          if (consentEntities.length) {
            const boxes = Array.from(doc.querySelectorAll('input[type="checkbox"], [role="checkbox"]')).filter(el => {
              const id = el.getAttribute('id');
              const label = (id && doc.querySelector(`label[for="${id}"]`)) || el.closest('label') || el.parentElement;
              return CONSENT_RE.test(`${el.getAttribute('name') || ''} ${el.getAttribute('aria-label') || ''} ${text(label)}`);
            });
            for (const b of boxes) {
              const checked = b.getAttribute('aria-checked') === 'true' || b.checked === true;
              if (checked) click(b);
            }
            await settle(doc, fetchImpl);
            if (boxes.length) {
              const beforeNeg = log.created.length;
              click(sendBtn);
              await settle(doc, fetchImpl, CONFIRM_MS);
              pageReport.steps.push({ step: 'consent-off', created: log.created.length - beforeNeg, text: text(doc.body).slice(0, 160) });
              if ((log.consent || []).length) {
                fail(`sends personal data without consent: ${log.consent[0]} — the e-mail must not be sent without the tick`);
                pageReport.result = 'consent-leak';
                return pageReport;
              }
              if (log.created.length > beforeNeg) {
                pageReport.result = 'success';     // sent without the e-mail — the positive send is proven too
                return pageReport;
              }
              for (const b of boxes) click(b);   // tick it and send for real
              await settle(doc, fetchImpl);
            }
          }
          const before = log.created.length;
          click(sendBtn);
          await settle(doc, fetchImpl, CONFIRM_MS);
          pageReport.steps.push({ step: 1, label: 'send', actions: filled, text: text(doc.body).slice(0, 200) });
          if ((log.consent || []).length) {
            fail(`sends personal data without consent: ${log.consent[0]}`);
            pageReport.result = 'consent-leak';
            return pageReport;
          }
          if (log.created.length > before) {
            pageReport.result = 'success';
            pageReport.steps.push({ step: 'success', text: text(doc.querySelector('[data-journey-success]') || doc.body).slice(0, 300) });
            return pageReport;
          }
          const problems = alertsIn(doc);
          fail(`the form cannot be sent with example input — no record was created${problems.length ? `: ${problems.join(' / ').slice(0, 300)}` : ' and no message appears'} (filled: ${filled.join(', ').slice(0, 200) || 'nothing'})`);
          pageReport.result = 'send-failed';
          return pageReport;
        }
      }
      pageReport.result = pageReport.errors.length ? 'empty' : 'rendered';
      pageReport.steps.push({ step: 0, label: 'page', text: body.slice(0, 300) });
      return pageReport;
    }

    let lastStep = -1;
    let stuckRounds = 0;
    // The boundary replaces the whole tree, so the step indicator is gone
    // once a step crashed: remember which step "Weiter" was heading for.
    let enteringStep = 1;
    for (let round = 0; round < MAX_STEPS; round++) {
      if (crashed()) {
        fail(`crashes on step ${enteringStep}: ${String((boundaryError && boundaryError.message) || text(doc.querySelector('[data-smoke-crash]'))).slice(0, 300)}`);
        pageReport.result = 'crash';
        return pageReport;
      }
      if (doc.querySelector('[data-journey-success]')) {
        pageReport.result = 'success';
        pageReport.steps.push({ step: 'success', text: text(doc.querySelector('[data-journey-success]')).slice(0, 300) });
        return pageReport;
      }
      const summary = doc.querySelector('[data-journey-summary]');
      if (summary) {
        const confirm = summary.querySelector('[data-journey-confirm]');
        pageReport.steps.push({ step: 'summary', text: text(summary).slice(0, 400) });
        if (!confirm) { fail('summary without a confirm button'); pageReport.result = 'summary-no-confirm'; return pageReport; }
        {
          const planned = plannedFields(page);
          const summaryText = text(summary).toLowerCase();
          const never = planned.filter(({ entity, key }) => !askedKeys.has(key.toLowerCase()) && !summaryText.includes(String(labelOfField(entity, key)).toLowerCase()));
          if (planData) pageReport.soll = { planned: planned.length, missing: never.map(f => `${f.entity}.${f.key}`) };
          if (never.length) {
            fail(`the plan orders ${never.map(f => `»${labelOfField(f.entity, f.key)}« (${f.entity}.${f.key})`).join(', ')} and no step asked for it — the page reaches its review without the ordered input`);
            pageReport.result = 'soll-missing';
            return pageReport;
          }
        }
        if (confirm.disabled) {
          const missing = Array.from(summary.querySelectorAll('button, a')).filter(b => b !== confirm && visible(b)).map(text).filter(t => t && !/ändern|change|zurück|back/i.test(t));
          fail(`summary blocks the confirm — required fields no step asked for: ${missing.slice(0, 6).join(', ') || text(summary).slice(0, 200)}`);
          pageReport.result = 'summary-blocked';
          return pageReport;
        }
        enteringStep = 'success';
        click(confirm);
        await settle(doc, fetchImpl, CONFIRM_MS);
        if (doc.querySelector('[data-journey-success]')) continue;
        const problems = alertsIn(doc);
        if (problems.length) { fail(`confirm failed: ${problems.join(' / ').slice(0, 300)}`); pageReport.result = 'confirm-failed'; return pageReport; }
        if (crashed()) continue;
        fail('confirm does not reach the success page (no error shown, no success rendered)');
        pageReport.result = 'confirm-silent';
        return pageReport;
      }

      const step = currentStep(doc);
      const region = stepRegion(doc);
      const label = region.getAttribute('aria-label') || `step ${step}`;
      const stepText = text(region);
      const reading = !hasControls(region) && showsRecord(region);
      if (!hasControls(region) && !reading) {
        fail(`step ${step} "${label}" shows a heading and nothing else — no control, card, summary or content (a step that only SHOWS the picked record passes when it renders that record) — visible: ${JSON.stringify(stepText.slice(0, 200))}`);
        pageReport.result = 'empty-step';
        return pageReport;
      }
      const actions = reading ? ['read'] : fillStep(region, doc);
      await settle(doc, fetchImpl, 2500);
      // A combobox opened above: take its first option now that it rendered.
      const option = Array.from(doc.querySelectorAll('[role="option"]')).find(visible);
      if (option) { click(option); actions.push(`option ${text(option).slice(0, 30)}`); await settle(doc, fetchImpl, 1500); }
      pageReport.steps.push({ step, label, actions, text: stepText.slice(0, 300) });

      // A single pick on a step without StepNav moves on by itself (the layer
      // owns that step change): the example input already left the step.
      if (currentStep(doc) !== step || doc.querySelector('[data-journey-summary], [data-journey-success]')) {
        lastStep = step; stuckRounds = 0; enteringStep = currentStep(doc);
        continue;
      }

      const next = Array.from(doc.querySelectorAll('[data-journey-next]')).find(visible);
      if (!next) {
        warn(`step ${step} "${label}" has no StepNav "Weiter" and no pick that moves on — the smoke cannot walk further`);
        pageReport.result = 'no-next';
        return pageReport;
      }
      if (next.disabled) {
        // A disabled next is a validation gate the example input did not satisfy.
        warn(`step ${step} "${label}": "Weiter" stays disabled after example input (${actions.join(', ') || 'nothing to fill'})`);
        pageReport.result = 'blocked';
        return pageReport;
      }
      const before = doc.body.innerHTML;
      enteringStep = step + 1;
      click(next);
      await settle(doc, fetchImpl);
      if (crashed()) continue;
      const after = currentStep(doc);
      enteringStep = after;
      const progressed = after !== step || doc.querySelector('[data-journey-summary], [data-journey-success]');
      if (progressed) { lastStep = step; stuckRounds = 0; continue; }
      const problems = alertsIn(doc);
      if (problems.length === 0 && doc.body.innerHTML === before) {
        fail(`"Weiter" on step ${step} "${label}" leads nowhere: the step stays, no message appears`);
        pageReport.result = 'next-dead';
        return pageReport;
      }
      if (problems.length === 0) {
        // Something changed but no step change and no message: give it one more round.
        stuckRounds++;
        if (stuckRounds >= 2) { fail(`"Weiter" on step ${step} "${label}" leads nowhere: the step stays, no message appears`); pageReport.result = 'next-dead'; return pageReport; }
        continue;
      }
      // Blocked with a reason: the page told the visitor what is missing — fill once more, then stop.
      stuckRounds++;
      if (stuckRounds >= 2 || lastStep === step) {
        if (plannedFields(page).length) {
          // the plan says which input belongs here — a block is a failure, not a note
          fail(`step ${step} "${label}" blocks the example input although the plan orders this page's fields: ${problems.join(' / ').slice(0, 200)}`);
          pageReport.result = 'blocked';
          return pageReport;
        }
        warn(`step ${step} "${label}" blocks the example input: ${problems.join(' / ').slice(0, 200)}`);
        pageReport.result = 'blocked';
        return pageReport;
      }
      lastStep = step;
    }
    fail(`did not reach the success page within ${MAX_STEPS} rounds (last step ${currentStep(doc)})`);
    pageReport.result = 'no-end';
    return pageReport;
  } catch (e) {
    fail(`crashes: ${String(e && e.stack || e).split('\n').slice(0, 4).join(' ').slice(0, 500)}`);
    pageReport.result = 'crash';
    return pageReport;
  } finally {
    if (runtimeErrors.length && pageReport.result !== 'crash') {
      fail(`logs a runtime error: ${runtimeErrors[0].slice(0, 300)}`);
    }
    if (consoleNoise.length) pageReport.console = consoleNoise.slice(0, 10);
    pageReport.requests = log.requests.filter(r => !/sentry/.test(r)).slice(0, 20);
    // EF-42: a page with a form reads through the read door — a `_challenge` for a GET means a
    // hand-written fetch through the write door (every poll would cost a proof-of-work live)
    const getChallenges = log.requests.filter(r => /_challenge\?method=GET/.test(r));
    if (getChallenges.length) fail(`asks for a proof-of-work challenge on a READ (${getChallenges.length}×) — reads go through listPublicRecords/createPublicPort, never through a hand-built grant fetch: ${getChallenges[0].slice(0, 160)}`);
    pageReport.created = log.created;
    pageReport.updated = log.updated;
    pageReport.refused = log.refused || [];
    if (log.unexpected.length) pageReport.warnings.push(`unexpected requests: ${log.unexpected.slice(0, 5).join(' | ')}`);
    try { if (root) root.unmount(); } catch { /* already gone */ }
    console.error = origConsoleError;
    process.off('unhandledRejection', onRejection);
    try { dom.window.close(); } catch { /* fine */ }
  }
}

// ── 7b. A view for one record, opened the way the overview opens it ───────────
const HEX = /([0-9a-f]{24})/;
function idOf(v) { const m = HEX.exec(typeof v === 'string' ? v : JSON.stringify(v ?? '')); return m ? m[1] : null; }
function entityOfId(id) {
  for (const ent of Object.keys(apps)) if (recordsFor(ent)[id]) return ent;
  return null;
}
async function smokeView(view) {
  const vReport = { slug: `view:${view.route}`, file: view.file, internal: true, view: true, steps: [], result: 'unknown', errors: [], warnings: [], requests: [] };
  const planPages = (planData && planData.public_pages) || [];
  const linkPages = planPages.filter(p => p && p.link_param && p.link_param.entity);
  const editRefs = (view.edits || []).map(r => String(r).split('.'));
  const composeRefs = (view.compose || []).map(c => String(c.field || '').split('.'));
  const qrView = linkPages.length > 0 && /\bqr\b/i.test([view.purpose, ...(view.contract || []), JSON.stringify(view.label || {})].join(' '));
  const oneRecord = !view.shows_marked && (editRefs.length > 0 || qrView);
  const strict = oneRecord;                     // the chain's views fail; other views only warn
  const fail = (msg) => { (strict ? vReport.errors : vReport.warnings).push(msg); (strict ? errors : warnings).push(`${view.file}: render-smoke 'view:${view.route}': ${msg}`); };
  let bundle;
  try { bundle = await bundlePage({ slug: `view-${view.route}`, file: view.file }); }
  catch (e) { fail(`does not bundle: ${String(e && e.message || e).slice(0, 400)}`); vReport.result = 'bundle-error'; return vReport; }
  // the record the overview opens it for: the edited entity, else the read of a link entity (or its child)
  const linkEntities = linkPages.map(p => p.link_param.entity);
  const ent = (editRefs[0] && editRefs[0][0]) || ((view.reads || []).find(r => linkEntities.includes(r.entity)) || (view.reads || [])[0] || {}).entity;
  const recId = ent ? Object.keys(recordsFor(ent))[0] : null;
  const query = oneRecord && recId ? `?record=${recId}` : '';
  vReport.opened_with = query;
  const cfg = { version: 1, public_api_base: PUBLIC_API_BASE, unpublished_count: 0,
    pages: Object.fromEntries(pages.map(p => [p.slug, applyPolicy(pageConfig(p), providedPolicy[p.slug])])) };
  const log = { requests: [], created: [], updated: [], unexpected: [] };
  const runtimeErrors = [];
  const dom = installDom(view.route, (e) => { runtimeErrors.push(String(e && e.message || e).slice(0, 300)); }, true, query, `ansicht/${view.route}`);
  const doc = dom.window.document;
  const fetchImpl = makeFetch(cfg, log);
  dom.window.fetch = fetchImpl;
  Object.defineProperty(globalThis, 'fetch', { value: fetchImpl, configurable: true, writable: true });
  let root = null;
  try {
    const { React, createRoot, HashRouter, Page } = await import(pathToFileURL(bundle.outfile).href + `?t=${Date.now()}`);
    let boundaryError = null;
    class Boundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      componentDidCatch(error) { boundaryError = error; }
      render() { return this.state.error ? React.createElement('div', { 'data-smoke-crash': '' }, String(this.state.error && this.state.error.message || this.state.error)) : this.props.children; }
    }
    root = createRoot(doc.getElementById('root'));
    root.render(React.createElement(Boundary, null, React.createElement(HashRouter, null, React.createElement(Page, null))));
    await settle(doc, fetchImpl);
    await settle(doc, fetchImpl, 3000);
    if (boundaryError || doc.querySelector('[data-smoke-crash]')) {
      fail(`crashes when opened${query ? ` with ${query}` : ''}: ${String(boundaryError && boundaryError.message || text(doc.querySelector('[data-smoke-crash]'))).slice(0, 300)}`);
      vReport.result = 'crash';
      return vReport;
    }
    // 1. the QR / link goes to a planned page for the record's OWN parent
    if (qrView && recId) {
      const links = Array.from(doc.querySelectorAll('[data-public-link]')).map(el => el.getAttribute('data-public-link') || '');
      const rec = recordsFor(ent)[recId];
      let expected = linkEntities.includes(ent) ? recId : null;
      if (!expected && rec) {
        for (const v of Object.values(rec.fields || {})) {
          const id = idOf(v);
          if (id && linkEntities.includes(entityOfId(id) || '')) { expected = id; break; }
        }
      }
      vReport.steps.push({ step: 'qr', links, expected });
      if (!links.length) fail(`shows no join link for ${query} — the QR is built with <PublicPageQr …> from the planned page`);
      else if (expected && !links.some(l => linkPages.some(p => l.includes(`/public/${p.slug}?${p.link_param.name}=${expected}`)))) {
        fail(`the join link goes elsewhere: ${links[0].slice(0, 160)} — expected a planned page with ?<param>=${expected} (the parent of the record this view was opened for)`);
      }
    }
    // 2. a composing view writes its text with the children's values
    for (const [cEnt, cField] of composeRefs) {
      const patch = log.updated.find(u => entityByAppId(u.app_id) === cEnt && typeof (u.fields || {})[cField] === 'string');
      const composed = patch ? String(patch.fields[cField]) : '';
      const kids = [];
      for (const e of Object.keys(apps)) for (const r of Object.values(recordsFor(e))) {
        if (e === cEnt || !JSON.stringify(r.fields || {}).includes(recId || '\u0000')) continue;
        for (const v of Object.values(r.fields || {})) if (typeof v === 'string' && v.length >= 3 && !HEX.test(v)) kids.push(v);
      }
      vReport.steps.push({ step: 'compose', field: `${cEnt}.${cField}`, length: composed.length, children: kids.length });
      if (!composed.trim()) fail(`opened with ${query} it composes nothing into ${cEnt}.${cField} (no save) — compose() must put the text together from the reads`);
      else if (kids.length && !kids.some(k => composed.includes(k))) fail(`the composed ${cEnt}.${cField} contains none of the records that belong to it — compose() reads the wrong records`);
    }
    vReport.result = vReport.errors.length ? 'failed' : 'rendered';
    if (runtimeErrors.length && strict) fail(`logs a runtime error: ${runtimeErrors[0]}`);
  } catch (e) {
    fail(`crashes: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' ').slice(0, 400)}`);
    vReport.result = 'crash';
  } finally {
    vReport.requests = log.requests.filter(r => !/sentry/.test(r)).slice(0, 20);
    vReport.updated = log.updated;
    try { if (root) root.unmount(); } catch { /* gone */ }
    try { dom.window.close(); } catch { /* fine */ }
  }
  return vReport;
}

// ── 8. Run ────────────────────────────────────────────────────────────────────
for (const page of pages) {
  const tPage = Date.now();
  const r = await smokePage(page);
  // EF-33: a field the grant does not list was sent (the mock refused it like the platform)
  for (const refused of r.refused || []) {
    const msg = /: missing /.test(refused)
      ? `sends without a field the grant requires — ${refused} (the platform answers 400 missing_fields): every required field comes from the form, values, link or a preset`
      : `sends a field the grant does not list — ${refused} (the platform answers 400): declare it in the create endpoint's fields or stop writing it`;
    if (!r.errors.includes(msg)) { r.errors.push(msg); errors.push(`${page.file}: render-smoke '${page.slug}': ${msg}`); }
  }
  // EF-32: no create of any walk carries personal data without its consent (wizards too)
  if (r.result !== 'consent-leak') {
    const leak = (r.created || []).map(c => consentViolation(entityByAppId(c.app_id), c.fields || {})).find(Boolean);
    if (leak) {
      const msg = `sends personal data without consent: ${leak}`;
      r.errors.push(msg);
      errors.push(`${page.file}: render-smoke '${page.slug}': ${msg}`);
    }
  }
  // a page opened per record sends FOR that record: a created record names it, or names a child
  // of it (the feedback names the interaction of THIS event) — never another event's (EF-27/30)
  const linked = /=([0-9a-f]{24})/.exec(r.opened_with || '');
  if (linked && r.result === 'success' && (r.created || []).length) {
    const lid = linked[1];
    const carries = (r.created || []).some(c => {
      const body = JSON.stringify(c.fields || {});
      if (body.includes(lid)) return true;
      for (const v of Object.values(c.fields || {})) {
        const id = idOf(v);
        const e = id ? entityOfId(id) : null;
        if (e && JSON.stringify((recordsFor(e)[id] || {}).fields || {}).includes(lid)) return true;
      }
      return false;
    });
    if (!carries) {
      const msg = `sent for ${r.opened_with} but no created record names that record or one of its children — the page writes for another record`;
      r.errors.push(msg);
      errors.push(`${page.file}: render-smoke '${page.slug}': ${msg}`);
    }
  }
  r.seconds = Number(secs(tPage));
  report.push(r);
  const stepsWalked = r.steps.filter(s => typeof s.step === 'number').length;
  if (r.errors.length === 0) {
    console.log(`render-smoke: ${page.slug} ${r.result === 'success' ? `OK (${stepsWalked} steps, summary confirmed, success page reached)` : r.result === 'rendered' ? 'OK (renders)' : `${r.result} (${r.warnings[0] || 'see report'})`} in ${r.seconds}s`);
  } else {
    console.log(`render-smoke: ${page.slug} FAILED (${r.result}) after ${r.seconds}s`);
  }
}

for (const view of planViews) {
  const t = Date.now();
  const r = await smokeView(view);
  r.seconds = Number(secs(t));
  report.push(r);
  console.log(`render-smoke: view ${view.route} ${r.errors.length ? `FAILED (${r.result})` : `OK (${r.result})`} in ${r.seconds}s`);
}

if (jsonOut) {
  try { writeFileSync(jsonOut, JSON.stringify(report, null, 2)); } catch { /* optional */ }
}
if (!keep) {
  // Bundles and entries go; .smoke/deps (jsdom) and .smoke/records.json stay
  // for a second pass in the same sandbox (repair round). The deploy removes
  // the whole directory.
  for (const page of pages) {
    for (const f of [`entry-${page.slug}.tsx`, `bundle-${page.slug}.mjs`]) {
      try { rmSync(join(ROOT, SMOKE_DIR, f), { force: true }); } catch { /* fine */ }
    }
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`render-smoke: OK (${pages.length} page${pages.length === 1 ? '' : 's'}, ${secs(tStart)}s)`);
