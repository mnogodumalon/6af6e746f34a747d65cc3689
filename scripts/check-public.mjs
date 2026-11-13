#!/usr/bin/env node
// Gate: public pages must stay anonymous-safe and fully declared.
//
// Agent-written pages under src/pages/public/ are served to visitors WITHOUT
// a LivingApps session. An import of the authenticated data layer
// (livingAppsService, useDashboardData, dialogs, …) compiles fine but dies
// with 401s for every real visitor — so '@/' imports are allowlisted here.
// And a page is only reachable/usable when registry.tsx and
// _public/surface.json agree: the registry routes it, the surface declares
// what the service must grant.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const PAGES_DIR = 'src/pages/public';
const SURFACE = '_public/surface.json';
const REGISTRY = join(PAGES_DIR, 'registry.tsx');
// Scaffold files — generator-owned, not subject to the page rules.
const SCAFFOLD = new Set(['PublicPage.tsx', 'PublicFormPage.tsx', 'registry.tsx']);

// The '@/' modules a public page may import. Everything else on '@/' is the
// authenticated dashboard side. Entries ending in '/' allow the subtree.
const ALLOWED_AT = [
  '@/lib/publicClient',
  '@/components/PublicShell',
  '@/components/blocks/',
  '@/components/ui/',
  '@/components/widgets/',
  '@/lib/utils',
  '@/lib/formatters',
  // The journey layer (port, rules, useStepForm, plan runner, public adapter)
  // is door-agnostic by design — the internal adapter lives under
  // '@/services/', which stays forbidden here.
  '@/lib/journey',
  '@/lib/journey/',
  '@/i18n',
  '@/types/',
];

const errors = [];
const warnings = [];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
  }
  return files;
}

// App metadata for type-aware field checks (present in every sandbox).
let appMeta = null;
try {
  appMeta = JSON.parse(readFileSync('app_metadata.json', 'utf8'));
} catch {
  // metadata missing (e.g. local runs) — type checks are skipped
}
// The owner's words for this page job (.page_request, written by the page
// job, removed by the deploy). Lets 3q judge a lookup preset against what
// the owner asked for; absent in local runs → that part is skipped.
let pageRequest = null;
try {
  pageRequest = readFileSync('.page_request', 'utf8').toLowerCase();
} catch {
  // no request on disk
}
// The plan (.plan.json, sandbox form) is the owner's order where one exists: a
// field a public page's create lists as `user`/`picked` is ordered, whatever
// words the prompt used. Before, 3x/3z matched the prompt TEXT and failed
// `kuerzel`/`einsendekennung` on a planned page (03.11.2026).
const planOrdered = new Map();   // `${slug}|${entity}` → Set(keys)
const planLinkParam = new Map(); // slug → {name, entity, label_field} the plan orders (PV-3)
const planStatusField = new Map(); // entity → the plan's status field (G-5)
const planSiblings = new Map(); // slug → other planned pages of the same visitor (one device key, A9)
const planVisitor = new Map(); // slug → ["entity.field"] filled with the visitor's code
const planPageSets = new Map(); // slug → ["entity.field"] the page sets from its linked record (must_equal)
const planLists = new Map(); // slug → [entity] the page lists
const planDevice = new Map(); // slug → ["entity.field"] the page makes on the device (derived:device / visitor key) — the submission's own key (EF-43)
try {
  const planData = JSON.parse(readFileSync('.plan.json', 'utf8'));
  for (const pg of planData.public_pages || []) {
    for (const c of pg.creates || []) {
      // a `derived:device` field is the page's own silent value (PV-16) — ordered, no control expected
      const keys = new Set(Object.entries(c.fields || {}).filter(([, src]) => src === 'user' || String(src).startsWith('picked') || String(src).startsWith('derived:device:') || src === 'derived:visitor_key').map(([k]) => k));
      planOrdered.set(`${pg.slug}|${c.entity}`, keys);
      const dev = Object.entries(c.fields || {}).filter(([, src]) => String(src).startsWith('derived:device') || src === 'derived:visitor_key').map(([k]) => `${c.entity}.${k}`);
      if (dev.length) planDevice.set(pg.slug, [...(planDevice.get(pg.slug) || []), ...dev]);
    }
    if (pg.link_param && pg.link_param.name && pg.link_param.entity) planLinkParam.set(pg.slug, pg.link_param);
  }
  for (const [ent, prof] of Object.entries(planData.entities || {})) {
    if (prof && prof.status_field) planStatusField.set(ent, prof.status_field);
  }
  // the visitor's code: `visitor_fields` (the plan's derived:visitor_key, and a derived:device
  // field two pages share — Bau 13), else derived:visitor_key for plans from before
  for (const pg of planData.public_pages || []) {
    const vf = Array.isArray(pg.visitor_fields) ? pg.visitor_fields
      : (pg.creates || []).flatMap(c => Object.entries(c.fields || {}).filter(([, s]) => s === 'derived:visitor_key').map(([k]) => `${c.entity}.${k}`));
    if (vf.length) planVisitor.set(pg.slug, vf);
    if (Array.isArray(pg.page_sets) && pg.page_sets.length) planPageSets.set(pg.slug, pg.page_sets);
    planLists.set(pg.slug, (pg.lists || []).map(l => l.entity).filter(Boolean));
  }
  const keyed = [...planVisitor.keys()];
  for (const s of keyed) planSiblings.set(s, keyed.filter(o => o !== s));
} catch {
  // no plan on disk — the prompt's words decide, as before
}
// The same visitor's pages link on (A9, Bau 10: the feedback's thank-you had no way to the
// e-mail page although the brief asked for it): every planned sibling appears as `/public/<slug>`.
// The visitor's code comes from useVisitorKey ONLY (Bau 13: the feedback page kept its own
// localStorage code, the e-mail page used useVisitorKey — one visitor, two codes).
function checkVisitorKey(slug, src, file, sink) {
  const fields = planVisitor.get(slug) || [];
  if (!fields.length) return;
  if (!/\b(?:useVisitorKey|visitorKey)\(/.test(src)) {
    sink.push(`${file}: page '${slug}' fills ${fields.join(', ')} with the visitor's code — take it from useVisitorKey() ('@/lib/journey'), the one code per device every public page shares; never an own generator`);
  }
  const own = /\b(?:window\.)?localStorage\.(?:setItem|getItem)\(/.exec(src);
  if (own) {
    const line = src.slice(0, own.index).split('\n').length;
    sink.push(`${file}:${line}: page '${slug}' reads or writes localStorage itself — the visitor's code lives in useVisitorKey(), drafts in the journey layer; an own key gives the same visitor a second code`);
  }
}
// EF-20 (Bau 14): two lists at intervalMs 3000 on one open form sent 66 requests a minute
// (each read solves a challenge) and drew 429s; the layer clamps to PUBLIC_MIN_INTERVAL_MS (20 s)
function checkPollRate(slug, src, file, sink) {
  for (const m of src.matchAll(/\bintervalMs\s*:\s*([\d_]+)/g)) {
    const ms = Number(m[1].replace(/_/g, ''));
    if (ms > 0 && ms < 20000) {
      const line = src.slice(0, m.index).split('\n').length;
      sink.push(`${file}:${line}: page '${slug}' polls every ${ms} ms — a public read costs a challenge each time and draws 429 (rate limit) for every visitor behind the same network; poll at most every 20 000 ms (the layer clamps to it), freshRef checks at send`);
    }
  }
}
// EF-14: a reference the page sets from its linked record's pointer is read fresh at send time
function checkFreshPointer(slug, src, file, sink) {
  const sets = planPageSets.get(slug) || [];
  if (sets.length && !/\bfreshRef\(/.test(src)) {
    sink.push(`${file}: page '${slug}' sends ${sets.join(', ')}, which must be what the linked record points at WHEN the visitor sends — read it with freshRef(port, …) right before the create and refuse to send when it changed; a value loaded earlier goes to a question that is no longer open`);
  }
  // EF-22: freshRef outside useJourneySubmit's `check` breaks the offline way (the challenge fails
  // offline, the raw error shows, nothing is resent)
  if (sets.length && /\bfreshRef\(/.test(src) && !/\bcheck\s*:\s*(?:async\b)?[\s\S]{0,600}?\bfreshRef\(/.test(src)) {
    sink.push(`${file}: page '${slug}' calls freshRef outside the submit — put it into useJourneySubmit(port, plan, { check: async () => … }) so an offline send is saved and resent (the check runs again then)`);
  }
  // EF-16: the fresh read is an ADDITIONAL check — the shown pointer stays live (useLiveList)
  if (sets.length && !/\buseLiveList\(/.test(src)) {
    sink.push(`${file}: page '${slug}' shows what the linked record points at, but polls nothing — keep useLiveList(port, …) on that record so an open form follows the switch within one poll; freshRef only checks again when sending`);
  }
}
// EF-27 (Bau 16): the feedback page took the first ACTIVE interaction app-wide. A page opened per
// record narrows every child list of that record to it — fieldRef(r, '<reference>') against the
// linked id, or refFilter — a grant cannot scope through a reference, so the code must.
function checkLinkedChildren(slug, src, file, sink) {
  const lp = planLinkParam.get(slug);
  if (!lp || !appMeta) return;
  const parentApp = appMeta.apps?.[lp.entity]?.app_id;
  if (!parentApp) return;
  for (const child of planLists.get(slug) || []) {
    if (child === lp.entity) continue;
    const controls = appMeta.apps?.[child]?.controls || {};
    const ref = Object.entries(controls).find(([, c]) => /applookup/.test(String(c.fulltype || '')) && !/multiple/.test(String(c.fulltype || ''))
      && String(c.lookup_app || c.lookupapp || '').replace(/\/+$/, '').split('/').pop() === parentApp)?.[0];
    if (!ref) continue;
    const narrowed = new RegExp(`\\bfieldRef\\([^,]+,\\s*['"]${ref}['"]\\)|\\brefFilter\\(\\s*['"]${ref}['"]|dependsOn\\([^)]*['"]${ref}['"]`).test(src);
    if (!narrowed) {
      sink.push(`${file}: page '${slug}' opens per '${lp.entity}' record but never narrows '${child}' to it — keep only the rows with fieldRef(r, '${ref}') === <the id from ?${lp.name}=> (never records[0] of all: another '${lp.entity}'s record)`);
    }
  }
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
// EF-33: every key a page writes (form fields, a plan step's values/link, a direct
// createPublicRecord) is one its grant lists — anything else is a 400 on the live POST
function checkWrittenKeys(slug, src, endpoints, file, sink) {
  const creates = (endpoints || []).filter(e => e.op === 'create');
  const keyOf = f => (typeof f === 'string' ? f : f && f.key);
  const allowedBy = new Map(creates.map(e => [e.entity, new Set([...(e.fields || []).map(keyOf), ...Object.keys(e.preset_fields || {}), ...Object.keys(e.default_fields || {})])]));
  const all = new Set([...allowedBy.values()].flatMap(s => [...s]));
  const seen = new Set();
  for (const w of writtenKeys(src)) {
    const allowed = w.entity ? allowedBy.get(w.entity) : all;
    if (!allowed) { if (w.how !== 'form') sink.push(`${file}:${w.line}: page '${slug}' writes '${w.entity}.${w.key}' (${w.how}) but declares no create endpoint for '${w.entity}' — the POST is refused`); continue; }
    if (w.key === '*' || allowed.has(w.key)) continue;
    const id = `${w.entity}.${w.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    sink.push(`${file}:${w.line}: page '${slug}' writes '${w.entity ?? 'the record'}.${w.key}' through ${w.how} — the grant does not list it (${[...(allowed || [])].join(', ') || 'nothing'}), the live POST answers 400. Never move a refused field to another write path: remove the write, or the page needs the field in the plan (report it)`);
  }
}
// EF-38 (Doodle Kontrollbau 3): the required names never reached the POST — 400 missing_fields live.
// Every required field of a create endpoint comes from the form, a plan step's values/link, or a preset.
function checkRequiredSources(slug, src, endpoints, file, sink) {
  if (!appMeta) return;
  const written = writtenKeys(src);
  for (const ep of (endpoints || []).filter(e => e.op === 'create')) {
    const mine = written.filter(w => w.entity === ep.entity);
    if (mine.some(w => w.key === '*') || !mine.length) continue;      // a spread or no plan step: not judged
    const keyOf = f => (typeof f === 'string' ? f : f && f.key);
    const listed = new Set((ep.fields || []).map(keyOf));
    const controls = appMeta.apps?.[ep.entity]?.controls || {};
    const req = c => c && c.required && c.required !== 'None' && c.required !== 'False';
    const required = [...listed].filter(k => req(controls[k]) || (ep.fields || []).some(f => typeof f === 'object' && f && f.key === k && f.required));
    const have = new Set([...mine.map(w => w.key), ...Object.keys(ep.preset_fields || {}), ...Object.keys(ep.default_fields || {})]);
    const missing = required.filter(k => !have.has(k));
    if (missing.length) {
      sink.push(`${file}: page '${slug}' creates '${ep.entity}' but never writes its required ${missing.map(k => `'${k}'`).join(', ')} (not in the form's fields, a plan step's values/link, or a preset) — the platform answers 400 missing_fields; put the form into the step (form: <the form>) or the value into values`);
    }
  }
}
// EF-39 (Doodle KB 3): the send handler read the poll and the answers itself BEFORE submit.run —
// offline that read failed, the page said „Das hat gerade nicht geklappt“, nothing was saved or resent
// (the EF-22 class). A read before the send belongs into useJourneySubmit's `check`.
function functionBodyOpen(src, at) {
  let open = wkEnclosingOpen(src, at);
  while (open > 0) {
    let i = open - 1;
    while (i >= 0 && /\s/.test(src[i])) i--;
    if (src[i] === '>' && src[i - 1] === '=') return open;          // an arrow function's body
    if (src[i] === ')') {
      let depth = 0, j = i;
      for (; j >= 0; j--) { if (src[j] === ')') depth++; else if (src[j] === '(' && --depth === 0) break; }
      const word = /(\w+)\s*$/.exec(src.slice(Math.max(0, j - 20), j));
      if (!word || !['if', 'for', 'while', 'switch', 'catch'].includes(word[1])) return open;   // a function
    }
    open = wkEnclosingOpen(src, open - 1);
  }
  return -1;
}
function checkReadsBeforeSend(slug, src, file, sink) {
  for (const s of src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*useJourneySubmit\(/g)) {
    for (const run of src.matchAll(new RegExp(`\\b${s[1]}\\.(?:run|retry)\\(`, 'g'))) {
      const open = functionBodyOpen(src, run.index);
      if (open < 0) continue;
      const before = src.slice(open, run.index);
      const read = /\b(?:\w+\.(?:get|list|count)\(|fetch\(|freshRef\(|freshFlag\(|listPublicRecords\()/.exec(before);
      if (read && /\bawait\b|\.then\(/.test(before)) {
        const line = src.slice(0, open + read.index).split('\n').length;
        sink.push(`${file}:${line}: page '${slug}' reads the network (${read[0]}…) in the send handler BEFORE ${s[1]}.run — offline that read fails and nothing is saved or resent; put the check into useJourneySubmit(port, plan, { check: async () => … }) (a sentence refuses, a network error goes the offline way)`);
        break;
      }
    }
  }
}
// EF-35 (Doodle): a sticky first column with the name inputs, 402 px wide, covered the whole phone
// width — no vote button could be reached at any scroll position. A sticky cell in a scrolling
// table carries text only and stays narrow (max-w ≤ 40vw); the person's inputs go above the table.
function checkStickyColumn(slug, src, file, sink, warnSink) {
  for (const m of src.matchAll(/<(\w+)\b[^>]*?className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})[^>]*>/g)) {
    const cls = m[2] ?? m[3] ?? m[4] ?? '';
    if (!/(^|\s)sticky(\s|$)/.test(cls) || !/(^|\s)(left|start)-/.test(cls)) continue;
    const close = src.indexOf(`</${m[1]}>`, m.index + m[0].length);
    const inner = close > 0 ? src.slice(m.index + m[0].length, close) : '';
    const line = src.slice(0, m.index).split('\n').length;
    if (/<(input|Input|textarea|Textarea|Bound|Field|select|Select|Checkbox|RadioGroup)\b/.test(inner)) {
      sink.push(`${file}:${line}: page '${slug}' puts an input into a sticky column (<${m[1]} className="…sticky…">) — on a phone it covers the scrolling cells and no button behind it can be reached; ask the person's name ABOVE the table, the sticky column shows text only`);
    } else if (!/max-w-\[(\d+)vw\]/.test(cls) || Number((/max-w-\[(\d+)vw\]/.exec(cls) || [])[1]) > 40) {
      warnSink.push(`${file}:${line}: page '${slug}' has a sticky column without a narrow width — give it max-w-[40vw] (or less) so the scrolling cells stay reachable on a phone`);
    }
  }
}
// EF-37 (Doodle): the page showed 5 of 6 dates — `slice(0, 5)` with no word about the sixth. A list
// cut to a fixed number says so when there are more (a `length > n` branch next to it).
// entities that hold another list in numbered slots (termin_1..termin_n) — the same reading as slot_groups()
function slotHolders() {
  const out = new Set();
  if (!appMeta) return out;
  const byApp = Object.fromEntries(Object.entries(appMeta.apps || {}).map(([k, a]) => [a.app_id, k]));
  for (const [holder, app] of Object.entries(appMeta.apps || {})) {
    const groups = {};
    for (const [key, c] of Object.entries(app.controls || {})) {
      const m = /^(.+?)_?(\d+)$/.exec(key);
      const ft = String(c.fulltype || '');
      if (!m || !ft.startsWith('applookup') || ft.includes('multiple')) continue;
      const target = byApp[String(c.lookup_app || c.lookupapp || '').replace(/\/+$/, '').split('/').pop()];
      if (target) (groups[`${m[1]}|${target}`] ??= new Set()).add(Number(m[2]));
    }
    if (Object.values(groups).some(s => s.has(1) && s.has(2))) out.add(holder);
  }
  return out;
}
function checkSilentCut(slug, src, file, sink, mildSink) {
  const holders = slotHolders();
  const slotted = [...planOrdered.keys()].some(k => k.startsWith(`${slug}|`) && holders.has(k.split('|')[1]));
  if (!slotted) sink = mildSink;
  for (const m of src.matchAll(/\.slice\(\s*0\s*,\s*([A-Za-z_$][\w$.]*|\d+)\s*\)/g)) {
    const n = m[1];
    const mentions = new RegExp(`length\\s*(?:>|>=|!==|===)\\s*${n.replace(/[.$]/g, '\\$&')}\\b|${n.replace(/[.$]/g, '\\$&')}\\s*<\\s*[\\w.]+\\.length`).test(src);
    if (!mentions) {
      const line = src.slice(0, m.index).split('\n').length;
      sink.push(`${file}:${line}: page '${slug}' cuts a list to ${n} (.slice(0, ${n})) and never says when there are more — show a sentence when list.length > ${n} („Es gibt mehr Termine, als hier Platz haben.“); never drop silently`);
    }
  }
}
// EF-43 (Doodle KB 6, DK-17): the page grouped the answer rows by first + last name — two people
// with the same name on two devices became ONE row with the younger one's choice, the older one's
// answers vanished from the sums (stored 2 Ja, shown 1 Ja) and the admin fixed the wrong date.
// One row per SUBMISSION: the key is the submission's own id (the page's device field, a row id,
// the record id), never a typed name. Static dataflow: a `fieldText(r, '<name field>')` value —
// directly or through a const / helper call — used as a Map key or an object index.
function nameFieldsOf(endpoints) {
  const out = new Set();
  if (!appMeta) return out;
  const ents = new Set((endpoints || []).map(ep => ep && ep.entity).filter(Boolean));
  for (const [ent, app] of Object.entries(appMeta.apps || {})) {
    if (ents.size && !ents.has(ent)) continue;
    for (const [key, c] of Object.entries(app.controls || {})) {
      if (!/^string/.test(String(c.fulltype || ''))) continue;
      if (/name\b|^name|vorname|nachname|^kuerzel$|^kürzel$/i.test(key) || /\bname\b/i.test(String(c.label || ''))) out.add(key);
    }
  }
  return out;
}
function checkGroupByName(slug, src, endpoints, file, sink) {
  const names = nameFieldsOf(endpoints);
  if (!names.size) return;
  const nameRead = new RegExp(`\\bfieldText\\(\\s*[\\w.]+\\s*,\\s*['"](${[...names].join('|')})['"]\\s*\\)`);
  // taint: consts whose initialiser reads a name field, and consts built from those
  const tainted = new Set();
  for (let pass = 0; pass < 3; pass++) {
    for (const m of src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g)) {
      const expr = m[2];
      if (nameRead.test(expr) || [...tainted].some(t => new RegExp(`\\b${t}\\b`).test(expr))) tainted.add(m[1]);
    }
  }
  const keyExpr = (arg) => nameRead.test(arg) || [...tainted].some(t => new RegExp(`^\\s*${t}\\s*$|\\b${t}\\b`).test(arg));
  const hits = [];
  for (const m of src.matchAll(/\.(get|set|has)\(\s*([^,)]+?)\s*[,)]/g)) if (keyExpr(m[2])) hits.push(m.index);
  for (const m of src.matchAll(/\[\s*([A-Za-z_$][\w$]*)\s*\]\s*(?:\?\?=|=|\?\?)/g)) if (tainted.has(m[1])) hits.push(m.index);
  for (const m of src.matchAll(/\bgroupBy\(\s*[^,]+,\s*([^)]+)\)/g)) if (keyExpr(m[1])) hits.push(m.index);
  if (!hits.length) return;
  const line = src.slice(0, Math.min(...hits)).split('\n').length;
  const dev = planDevice.get(slug) || [];
  const key = dev.length ? `the page's own submission key (${dev.join(', ')}) — submissionsOf(records, { key, names }) from @/lib/journey` : 'the submission (submissionsOf(records, { names }) from @/lib/journey: the same name within seconds is one send; never the record, never the bare name)';
  sink.push(`${file}:${line}: page '${slug}' groups records by a typed NAME (${[...names].filter(n => new RegExp(`['"]${n}['"]`).test(src)).join(', ') || 'name field'}) — two people with the same name on two devices become ONE row and the older one's answers vanish from the sums (EF-43). One row per submission: key by ${key}, never by a name; count every stored record exactly once; the same name twice is two rows`);
}
// EF-44 (Doodle KB 6, DK-18): „Beliebtester Termin“ was marked on TWO dates at a tie — the page
// compared every count with Math.max. Exactly one is the most popular: most yes, then most maybe,
// then the earliest — topOne() in @/lib/journey decides that; the page compares ids.
function checkTieMark(slug, src, file, sink) {
  const maxes = [...src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:useMemo\(\s*\(\)\s*=>\s*)?Math\.max\(/g)].map(m => m[1]);
  for (const name of maxes) {
    const cmp = new RegExp(`(?:===?\\s*${name}\\b|\\b${name}\\s*===?)`).exec(src);
    if (!cmp) continue;
    const line = src.slice(0, cmp.index).split('\n').length;
    sink.push(`${file}:${line}: page '${slug}' marks every option whose count equals ${name} (Math.max) — at a tie two options read as „the most popular“ (EF-44). Exactly ONE: const top = topOne(termine, [t => counts[t.id]?.ja ?? 0, t => counts[t.id]?.vielleicht ?? 0], t => fieldDate(t, '<date field>')) from '@/lib/journey' (most yes, then most maybe, then the earliest), then compare t.id === top?.id`);
  }
}
// K8 (Messlatte, Bau 1 and KB 6): the vote buttons were 68×30 px — a thumb misses them. A hand-made
// radio/checkbox button is at least 44 px high (h-11 / min-h-11 / size-11 / py-3); the layer's
// ChoiceGroup and Bound already are. jsdom has no layout, so this reads the classes.
const TALL_RE = /(^|\s)(?:min-)?h-(?:1[1-9]|[2-9]\d|\[(?:4[4-9]|[5-9]\d|\d{3})px\])(\s|$)|(^|\s)size-(?:1[1-9]|[2-9]\d)(\s|$)|(^|\s)py-(?:[3-9]|\d\d)(\s|$)|(^|\s)min-h-\[\d+(?:\.\d+)?rem\](\s|$)/;
function checkTapTargets(slug, src, file, sink, warnSink) {
  for (const m of src.matchAll(/<(button|div|span|label|input)\b([^>]*?)(?:\/?>)/g)) {
    const attrs = m[2];
    const role = /\brole=["'](radio|checkbox|switch)["']/.exec(attrs);
    const native = m[1] === 'input' && /\btype=["'](radio|checkbox)["']/.test(attrs);
    if (!role && !native) continue;
    const cm = /className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/.exec(attrs);
    const cls = cm ? (cm[1] ?? cm[2] ?? cm[3] ?? '') : '';
    if (TALL_RE.test(cls)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    if (role) {
      sink.push(`${file}:${line}: page '${slug}' renders a role="${role[1]}" button without a 44 px height (className "${cls.slice(0, 60)}") — on a phone a thumb misses it (K8: live 68×30 px). Give it min-h-11 min-w-11 (44 px) or use <ChoiceGroup> / <Bound> from the blocks`);
    } else {
      warnSink.push(`${file}:${line}: page '${slug}' renders a native <input type="radio|checkbox"> — the box itself is 13 px; make the whole <label> the tap target (flex items-center min-h-11) or use <ChoiceGroup>`);
    }
  }
}
// EF-45 (Doodle KB 6, page job d3fa4b28): an edit „one row per submission, one winner, leave the
// form and the send alone“ came back with the required `antwort` no longer written where the gate
// reads — the job failed, the live page stayed. On an edit the page job lays the LIVE source next to
// the staged copy (`<Component>.live.tsx`); every write the live page had (entity.key through form,
// values, link or createPublicRecord) must still be there unless the owner's words name the field.
function liveBaselineFor(file) {
  const p = join(dirname(file), basename(file, '.tsx') + '.live.tsx');
  const alt = join('.public-staging', basename(file, '.tsx') + '.live.tsx');
  for (const c of [p, alt]) { try { return [c, readFileSync(c, 'utf8')]; } catch { /* next */ } }
  return null;
}
function checkWritePathKept(slug, src, file, sink) {
  const base = liveBaselineFor(file);
  if (!base) return;
  const [basePath, baseSrc] = base;
  const now = new Set(writtenKeys(src).map(w => `${w.entity || ''}.${w.key}`));
  const spreadNow = new Set(writtenKeys(src).filter(w => w.key === '*').map(w => w.entity || ''));
  const lc = s => String(s || '').toLowerCase();
  const dropped = [];
  for (const w of writtenKeys(baseSrc)) {
    if (w.key === '*' || now.has(`${w.entity || ''}.${w.key}`) || spreadNow.has(w.entity || '')) continue;
    const label = appMeta?.apps?.[w.entity]?.controls?.[w.key]?.label;
    const named = pageRequest && [w.key, label].map(lc).filter(x => x.length >= 3).some(x => pageRequest.includes(x));
    if (named) continue;
    const lineText = baseSrc.split('\n')[w.line - 1] || '';
    dropped.push(`${w.entity ? w.entity + '.' : ''}${w.key} (${w.how}, ${basePath}:${w.line}: ${lineText.trim().slice(0, 100)})`);
  }
  if (dropped.length) {
    sink.push(`${file}: page '${slug}' no longer writes ${dropped.join('; ')} — the LIVE page wrote it and the owner did not ask to change the write path. A display order never touches useStepForm fields, a plan step's entity/values/link or a createPublicRecord payload: restore that code exactly as it stands in ${basePath} (keep its shape — a values arrow stays an arrow returning an object literal) and change only what the owner named`);
  }
}
// EF-31: freshRef reads a REFERENCE; on a yes/no it never returns the id and refuses every send
function checkFreshKinds(slug, src, file, sink) {
  if (!appMeta) return;
  for (const m of src.matchAll(/\bfreshRef\(\s*[\w.]+\s*,\s*['"](\w+)['"]\s*,[^,]+,\s*['"](\w+)['"]/g)) {
    const ft = String(appMeta.apps?.[m[1]]?.controls?.[m[2]]?.fulltype || '');
    if (ft && !/^applookup/.test(ft)) {
      const line = src.slice(0, m.index).split('\n').length;
      sink.push(`${file}:${line}: freshRef on '${m[1]}.${m[2]}' (${ft}) — freshRef reads a reference and never returns an id here, every send is refused; for a yes/no write (await freshFlag(port, '${m[1]}', id, '${m[2]}')) === true`);
    }
  }
}
function checkSiblingLinks(slug, src, file, sink) {
  // a sibling that opens per record needs its parameter on the link (EF-27, Bau 16: the thank-you
  // linked #/public/abschlussbewertung without ?veranstaltung= — „Dieser Link ist unvollständig“)
  const target = s => { const lp = planLinkParam.get(s); return lp ? `/public/${s}?${lp.name}=` : `/public/${s}`; };
  const missing = (planSiblings.get(slug) || []).filter(s => !src.includes(target(s)));
  if (missing.length) {
    sink.push(`${file}: page '${slug}' serves the same visitor as ${missing.map(s => `'${s}'`).join(', ')} (one device key) — after a successful send link on: ${missing.map(s => `#${target(s)}${planLinkParam.get(s) ? '<the same id>' : ''}`).join(', ')} (SuccessStep \`actions\` or a link under the thank-you text); never a dead end`);
  }
}
const orderedByPlan = (slug, entity, key) => planOrdered.get(`${slug}|${entity}`)?.has(key) === true;

// ── 1. Import allowlist over agent-written pages ─────────────────────────
const IMPORT_RE = /^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm;
// --file <path>: a lane's pre-flight over ONE staged page (check-staging.mjs)
// — the per-page rules only; registry ↔ surface belongs to the integration band.
const fileArgAt = process.argv.indexOf('--file');
const fileArg = fileArgAt >= 0 ? process.argv[fileArgAt + 1] : null;
const pageOnly = fileArg !== null;
if (pageOnly && !existsSync(fileArg)) {
  console.error(`ERROR: ${fileArg} does not exist`);
  process.exit(1);
}
const pageFiles = pageOnly
  ? [fileArg]
  : existsSync(PAGES_DIR)
    ? walk(PAGES_DIR).filter(f => !SCAFFOLD.has(basename(f)))
    : [];
for (const file of pageFiles) {
  const src = readFileSync(file, 'utf8');

  // ONE visitor code per device (A9): a page's own key name split one visitor into two codes
  // (feedback with one, the e-mail with another). The layer ignores `name` now; the gate says so.
  {
    const m = /\b(?:useVisitorKey|visitorKey)\(\s*\{[^}]*\bname\s*:/.exec(src);
    if (m) {
      const line = src.slice(0, m.index).split('\n').length;
      (pageOnly ? errors : warnings).push(`${file}:${line}: visitorKey with its own name — every public page of the dashboard shares ONE code per device; drop the name option (the layer ignores it and takes an old named key over once)`);
    }
  }
  // A date the visitor READS comes from fieldText (formatted: „07.11.2026“); fieldDate is the
  // ISO value for computing (Abnahme 8: the participant page showed „2026-11-07“).
  {
    const m = /\{\s*fieldDate\(/.exec(src);
    if (m) {
      const line = src.slice(0, m.index).split('\n').length;
      warnings.push(`${file}:${line}: fieldDate(…) rendered as text — the visitor reads „2026-11-07“; show fieldText(r, key) (formatted), keep fieldDate for comparing and computing`);
    }
  }
  // K10a/P-14 (Abnahme 7): a visitor's text survives a reload only when the
  // submit carries a draftKey — the layer keeps the forms under it (with or
  // without IntentWizardShell). An error for the lane's staged page, a warning
  // in the tree run, so a page built before the rule is not held back.
  if (/useJourneySubmit\(/.test(src) && !/\bdraftKey\s*[:=]/.test(src)) {
    const line = src.slice(0, src.search(/useJourneySubmit\(/)).split('\n').length;
    (pageOnly ? errors : warnings).push(`${file}:${line}: useJourneySubmit(…) without a draftKey — the visitor's text is lost on a reload; pass { draftKey: '<slug>' } (with a link parameter: \`<slug>-\${id}\`), the layer keeps the forms under it`);
  }

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
  // A record reference written for the authenticated REST API is rejected by
  // the anonymous surface with 400 "Unsupported field value" — applookup
  // values must be grant-scoped. Live-proven twice: a course registration
  // built the participant URL by hand in one literal, and a document form
  // glued origin+"/rest" from parts — which a one-literal regex
  // (/['"`]…\/rest\/apps\/…['"`]/) provably missed. The authenticated
  // prefix has NO legitimate use in a public page, however it is spelled, so
  // flag `/rest` wherever a delimiter follows (`/rest'`, `/rest"`,
  // backtick, `/rest/`) — that catches glued forms without tripping on
  // words like "/restaurants".
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
  // Visitors type their OWN data: useStepForm must switch browser autofill on
  // (`autoComplete: true`) — the layer leaves it off by default because the
  // dashboard's team enters other people's data. The generic PublicFormPage
  // does it; a bespoke page has to say it.
  for (const m of src.matchAll(/useStepForm\(\s*['"`][^'"`]+['"`]\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/g)) {
    if (m[1] && /\bautoComplete\s*:\s*true\b/.test(m[1])) continue;
    const line = src.slice(0, m.index).split('\n').length;
    errors.push(`${file}:${line}: useStepForm(...) without autoComplete: true — visitors enter their OWN data, switch browser autofill on: useStepForm(entity, { ..., autoComplete: true })`);
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
    const onTheLayer = /<SummaryStep\b|useJourneySubmit\(/.test(src);
    if (ownsSteps && onTheLayer && !/IntentWizardShell/.test(src)) {
      errors.push(`${file}: a hand-rolled stepper (own step state and buttons) without IntentWizardShell — wrap the steps in <IntentWizardShell steps={STEPS} currentStep={step} onStepChange={setStep} forms={[…]}> and move between them with <StepNav onNext={…} /> (both under @/components/blocks); the shell owns URL step, draft resume, focus and the buttons the render-smoke presses`);
    }
  }

  // 3h. Every bound control sits under a label. The bindings carry id, value,
  //     aria-* — not the label; a step with five bare inputs shipped (live).
  //     <Bound form={f} name="key"> IS a labelled control; <Field form={f}
  //     name="key"> renders label, hint and error around a control the page
  //     places itself; a hand-written <Label htmlFor={f.fieldId('key')}> also
  //     counts. Same rule as check-intents — the public variant once accepted
  //     only <Field>, and pages wrapped every <Bound> in one: two labels each.
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
      if (fields.length === 0) {
        errors.push(`${file}: useRecordSearch('${entity}') has an empty searchFields — name 1–4 string fields users recognise a record by`);
      }
      for (const f of fields) {
        const ft = controls?.[f]?.fulltype;
        if (controls && !ft) {
          errors.push(`${file}: useRecordSearch('${entity}') searchFields names '${f}', which '${entity}' does not have`);
        } else if (ft && !ft.startsWith('string')) {
          errors.push(`${file}: useRecordSearch('${entity}') searchFields '${f}' is ${ft} — only string fields are searchable (text, email, tel, textarea)`);
        }
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

  // `cond ? listPublicRecords(…) : Promise.resolve({})` — the untyped {}
  // widens the Promise.all tuple, Object.values() then yields unknown[] and
  // every `r.fields` access is TS18046 (11 errors in one live page, first
  // seen by the integration build, one repair round).
  const emptyFallback = /Promise\.resolve\(\s*\{\s*\}\s*\)/.exec(src);
  if (emptyFallback) {
    const line = src.slice(0, emptyFallback.index).split('\n').length;
    errors.push(`${file}:${line}: Promise.resolve({}) — the untyped {} widens the result to unknown (TS18046 on every r.fields); write Promise.resolve<Record<string, PublicRecordResult>>({}) with \`import type { PublicRecordResult } from '@/lib/publicClient'\`, or drop the guard and call listPublicRecords unconditionally`);
  }

  // A useRecordSearch `filter` is server-side vSQL — a public grant cannot run
  // it (allowed query: field/limit/offset), the public door silently ignores it
  // and the visitor sees unfiltered records. `where` is the client-side
  // restriction that works here.
  for (const call of src.matchAll(/useRecordSearch\(/g)) {
    const open = src.indexOf('{', call.index);
    if (open < 0) continue;
    let depth = 0, end = -1;
    for (let k = open; k < src.length && k < open + 4000; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}' && --depth === 0) { end = k; break; }
    }
    if (end >= 0 && /\bfilter\s*:/.test(src.slice(open, end + 1))) {
      const line = src.slice(0, call.index).split('\n').length;
      errors.push(`${file}:${line}: useRecordSearch filter on a public page — grants cannot filter server-side, the restriction would be silently dropped; use where: r => … (client-side) or a narrower scope in _public/surface.json`);
    }
  }

  const restUrl = /\/rest['"`\/]/.exec(src);
  if (restUrl) {
    const line = src.slice(0, restUrl.index).split('\n').length;
    errors.push(`${file}:${line}: reference to the authenticated /rest surface — public pages must not build /rest URLs (the anonymous surface rejects them); use recordRef(cfg, page, appId, recordId) from '@/lib/publicClient', or pass a reference URL through exactly as a list response returned it`);
  }
  // In-page anchors are broken by design here: the app is HASH-routed, so an
  // href of "#anfrage" REPLACES the route (from the public slug route to a
  // route named anfrage) and navigates the visitor off the page instead of
  // scrolling. Live-proven by a hero CTA that kicked every visitor back to
  // the router. Only hrefs continuing with a slash are real routes.
  const ANCHOR_RE = /href\s*=\s*[{]?\s*["'`]#(?!\/)/g;
  let anchor;
  while ((anchor = ANCHOR_RE.exec(src)) !== null) {
    const line = src.slice(0, anchor.index).split('\n').length;
    errors.push(`${file}:${line}: in-page anchor href — the app is hash-routed, so this REPLACES the route and navigates the visitor off the page; scroll with a button + ref.scrollIntoView({ behavior: 'smooth' }) instead`);
  }
  // Root-relative hrefs are broken by design as well: the SPA is deployed
  // under /objects/<id>/, so href="/#/public/x" resolves against the SITE
  // root and dumps the visitor on the platform, not the dashboard. This is
  // the historic evasion of the anchor rule above — forbidden href="#…",
  // a live lane wrote href="/#/…", which passed the gate and broke worse.
  const ROOT_HREF_RE = /href\s*=\s*[{]?\s*["'`]\//g;
  let rootHref;
  while ((rootHref = ROOT_HREF_RE.exec(src)) !== null) {
    const line = src.slice(0, rootHref.index).split('\n').length;
    errors.push(`${file}:${line}: root-relative href — the app is deployed under a sub-path, so "/…" resolves against the site root and throws the visitor off the dashboard; navigate page-to-page with react-router's <Link to="/public/<slug>">, and use a full https:// URL for external targets`);
  }
  // Router targets outside /public bounce an anonymous visitor into the
  // authenticated shell. A public page may only navigate to public pages.
  const INTERNAL_NAV_RE = /(?:to\s*=\s*[{]?\s*|navigate\(\s*)["'`]\/(?!public\b)/g;
  let internalNav;
  while ((internalNav = INTERNAL_NAV_RE.exec(src)) !== null) {
    const line = src.slice(0, internalNav.index).split('\n').length;
    errors.push(`${file}:${line}: navigation target outside /public — an anonymous visitor has no session there and gets bounced; public pages may only link to other public pages (<Link to="/public/<slug>">)`);
  }
  // The hosted-page look is standardized by the shell's card. A wizard fits
  // inside it (the stepper is compact) — opting out with `plain` made two
  // live dashboards on the SAME scaffold version look like different
  // products, so the combination is rejected outright.
  const plainWizard = src.includes('IntentWizardShell')
    && /<PublicShell\b[^>]*\bplain\b/.test(src);
  if (plainWizard) {
    errors.push(`${file}: PublicShell \`plain\` combined with IntentWizardShell — wizards render INSIDE the shell's card (drop \`plain\`); the standardized hosted look must be identical across pages`);
  }
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1];
    const line = src.slice(0, m.index).split('\n').length;
    if (spec.startsWith('@/')) {
      const ok = ALLOWED_AT.some(a => spec === a || (a.endsWith('/') && spec.startsWith(a)));
      if (!ok) {
        errors.push(`${file}:${line}: '${spec}' is dashboard-side (needs a login) — public pages may import only: ${ALLOWED_AT.join(', ')}`);
      }
    } else if (spec.startsWith('..')) {
      errors.push(`${file}:${line}: relative import '${spec}' escapes ${PAGES_DIR} — use an allowlisted '@/' module or a sibling './' import`);
    }
  }
}

// The occupancy rule (src/config/journey.ts, from the plan or the agent):
// the stay pair, the booked resource and the status that frees a stay. Missing file or block → no rules.
const JOURNEY_CONFIG = 'src/config/journey.ts';
const occupancyRules = {};
if (existsSync(JOURNEY_CONFIG)) {
  const block = /\/\/ <custom:occupancy>([\s\S]*?)\/\/ <\/custom:occupancy>/.exec(readFileSync(JOURNEY_CONFIG, 'utf8'));
  if (block) {
    for (const m of block[1].matchAll(/^\s*['"]?([a-z0-9_]+)['"]?\s*:\s*\{([^}]*)\}\s*,?\s*$/gm)) {
      const body = m[2];
      const str = key => { const s = new RegExp(`\\b${key}\\s*:\\s*['"]([^'"]+)['"]`).exec(body); return s ? s[1] : undefined; };
      occupancyRules[m[1]] = { from: str('from'), to: str('to'), resource: str('resource'), statusField: str('statusField') };
    }
  }
}

// One endpoint of one page — the same checks in the tree run (surface.json)
// and in a lane's pre-flight (a staged fragment next to the staged page).
// `pageSrc` is the page's source when it exists (required-field and stay
// checks read it), else null.
function checkEndpoint(slug, ep, pageSrc, pageFile, where = SURFACE) {
  // A public page can READ and CREATE — nothing else. There is no update,
  // no delete: a grant that lets an anonymous visitor MODIFY an existing
  // record is not something the platform hands out. A live build declared
  // `op: 'update'` (to append a member to a meeting's participant list),
  // hand-rolled its own PATCH, passed every gate, and was thrown away by
  // the ingest AFTER the deploy — 304 lane-seconds for nothing, and the
  // dashboard was left without any public page at all.
  // "Register for an existing X" is therefore a CREATE in a registration
  // entity, never an edit of X.
  if (!['list', 'create'].includes(ep.op)) {
    errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' declares op '${ep.op}' — only 'list' (read) and 'create' (anonymous submit) exist. An anonymous visitor can never MODIFY an existing record: model the action as a create in a registration entity. If this page cannot be built that way, write _public/<slug>.blocked.json instead (see the public-builder skill) — never invent an op.`);
  }
  // A10 (Bau 13): the plan ordered interaktion + absendekennung for the feedback create, the
  // surface granted only feedbacktext + teilnehmerkuerzel — every feedback arrived without its
  // interaction (400 on the field) and the merge found nothing. Every field the plan orders for
  // a create (typed, picked, made on the device) must be one the grant lets through.
  if (ep.op === 'create') {
    const ordered = planOrdered.get(`${slug}|${ep.entity}`);
    const granted = new Set([...(ep.fields || []), ...Object.keys(ep.preset_fields || {})]);
    const missing = ordered ? [...ordered].filter(k => !granted.has(k)) : [];
    if (missing.length) {
      errors.push(`${where}: page '${slug}' creates '${ep.entity}' without ${missing.map(k => `'${k}'`).join(', ')} in its fields, although the plan orders ${missing.length > 1 ? 'them' : 'it'} — the grant refuses a field it does not list (400) and the record arrives without it. Add ${missing.length > 1 ? 'them' : 'it'} to the endpoint's fields`);
    }
  }
  if (ep.scope && !ep.scope_description) {
    errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' has a scope but no scope_description — the owner confirms that text when publishing, never the vSQL`);
  }
  // G-5: a public list of an entity the plan gives a STATUS without a scope
  // hands every record, whatever its state, to anyone with the URL (the
  // closed event's questions stayed readable, Meet-the-Member).
  if (ep.op === 'list' && !ep.scope && planStatusField.has(ep.entity)) {
    const sf = planStatusField.get(ep.entity);
    errors.push(`${where}: page '${slug}' lists '${ep.entity}' without a scope although the plan calls '${sf}' its status field — every record, whatever its state, would be readable by anyone with the page URL. Scope the list (e.g. r.v_${sf} == '<the open option>') and give it a scope_description`);
  }
  // The entity identifier must EXIST. Guessing it from the app's display
  // name is the classic failure: an app called "Kurse & Workshops" has the
  // identifier `kurse_workshops`, not `kurse_&_workshops`. The ingest then
  // raises "unknown entity" and drops the WHOLE page — visible only as one
  // [WARNING] line in the deploy stream, so the owner just sees nothing.
  // Every check below silently passes for an unknown entity (`controls`
  // falls back to {}), which is why this has to come first.
  if (appMeta) {
    const known = Object.keys(appMeta.apps || {});
    if (!known.includes(ep.entity)) {
      errors.push(`${where}: page '${slug}' references unknown entity '${ep.entity}' — use the IDENTIFIER from app_metadata.json, never the display name. Known: ${known.join(', ')}`);
      return;
    }
    // Same trap one level down: a field key that does not exist is rejected
    // by the ingest with "invalid field selection", again dropping the page.
    const controlKeys = Object.keys(appMeta.apps[ep.entity].controls || {});
    for (const key of [...(ep.fields || []), ...Object.keys(ep.preset_fields || {}), ...Object.keys(ep.default_fields || {})]) {
      if (!controlKeys.includes(key)) {
        errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' references unknown field '${key}' — known fields: ${controlKeys.join(', ')}`);
      }
    }
  }
  // Scope shape: the server probes the vSQL expression when the grant is
  // created (at publish) — a malformed scope fails silently late, so the
  // known-fatal shapes are rejected here.
  if (ep.scope) {
    if (!/r\.v_\w+/.test(ep.scope)) {
      errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' scope '${ep.scope}' is not vSQL — fields are ALWAYS accessed as r.v_<field> (e.g. r.v_status == 'geplant'), never bare`);
    }
    if (/\b(true|false)\b/.test(ep.scope)) {
      errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' scope uses lowercase true/false — vSQL booleans are Python-style True/False (e.g. r.v_aktiv == True)`);
    }
    if (/\btoday\b(?!\s*\()/.test(ep.scope)) {
      errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' scope uses a bare 'today' — a DATE field compares with today() (or @(YYYY-MM-DD)), a DATETIME field with now()`);
    }
  }
  // 3q. A preset/default VALUE must be one the OWNER asked for. A lookup
  //     value must be one of the field's options, and the option the owner
  //     named; any preset the request never mentions is a value nobody
  //     ordered, written into every record the page creates (live: status
  //     'angenommen', kundentyp 'privat', mitgliedsnummer 'AUSSTEHEND',
  //     eintrittsdatum '__today__' — three of them against the owner's words).
  if (ep.op === 'create' && appMeta) {
    const controls = appMeta.apps?.[ep.entity]?.controls || {};
    const lc = (x) => String(x ?? '').toLowerCase().trim();
    for (const [bag, obj] of [['preset_fields', ep.preset_fields], ['default_fields', ep.default_fields]]) {
      for (const [key, val] of Object.entries(obj || {})) {
        const c = controls[key];
        if (!c) continue;
        const options = c.lookup_data && typeof c.lookup_data === 'object' ? Object.keys(c.lookup_data) : null;
        if (options && typeof val === 'string' && !options.includes(val)) {
          errors.push(`${where}: page '${slug}' ${bag} sets ${ep.entity}.${key} = '${val}', which is not an option of that field — valid keys: ${options.join(', ')}. Take the option the owner named (match its label); if none matches, leave the preset OUT and say so in your summary — never the first option`);
          continue;
        }
        if (!pageRequest) continue;  // no owner text to judge against (initial build)
        const fieldWords = [key, c.label].map(lc).filter(w => w.length >= 3);
        const optionWords = options ? Object.entries(c.lookup_data).flatMap(([k, l]) => [lc(k), lc(l)]).filter(w => w.length >= 3) : [];
        const mentionsField = fieldWords.some(w => pageRequest.includes(w));
        const mentionsOption = optionWords.some(w => pageRequest.includes(w));
        if (options && mentionsField && !mentionsOption) {
          errors.push(`${where}: page '${slug}' ${bag} sets ${ep.entity}.${key} = '${val}', but the owner's request names '${c.label || key}' with a value this field does not offer (options: ${options.join(', ')}). Do not substitute: leave '${key}' out of ${bag} and say in your summary that the requested value does not exist`);
        } else if (!mentionsField) {
          // An option word elsewhere in the text is no order (live: "Beitrag für
          // Erwachsene und Kinder" turned into beitragsklasse = 'erwachsener' for
          // every new member) — the owner has to name the FIELD.
          errors.push(`${where}: page '${slug}' ${bag} sets ${ep.entity}.${key} = '${JSON.stringify(val)}' although the owner never asked for '${c.label || key}' — a value nobody ordered lands in every record this page writes. Leave '${key}' out of ${bag}; if the record cannot do without it, ask the visitor (a field on the page) and name the choice in your summary`);
        }
      }
    }
  }
  // 3w. Identifiers are never assigned by a public page. A visitor-facing
  //     page that computes an order or booking number (`AU-${date}-${rand}`,
  //     generateNummer()), presets a placeholder ('AUSSTEHEND') or lets the
  //     visitor type the number produces duplicates and editable ids (live:
  //     three pages, one of them `ANF-<day>` for every request of a day).
  //     Numbers come from the platform or a tool after the record exists.
  if (ep.op === 'create') {
    const ID_KEY = /(nummer|number|_nr)$/i;
    const NOT_ID = /(telefon|phone|mobil|handy|fax|haus|steuer|ust|iban|bic|konto|sozial|versicher|rente|pass|ausweis|zimmer|raum|platz|tisch|seiten|artikel|teile|serien|fahrgestell|chassis|vin)/i;
    const bags = [['fields', ep.fields || []], ['preset_fields', Object.keys(ep.preset_fields || {})], ['default_fields', Object.keys(ep.default_fields || {})]];
    for (const [bag, keys] of bags) {
      for (const key of keys) {
        if (!ID_KEY.test(key) || NOT_ID.test(key)) continue;
        errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' puts the identifier '${key}' into ${bag} — a public page never assigns numbers: computed in the browser they collide (one live page wrote the same number for every request of a day), preset they are placeholders, typed by the visitor they are editable. Drop '${key}' from the page; the platform or a tool numbers the record after it exists, and the success page shows the reference the layer generates`);
      }
    }
  }
  // 3x. The same rule for the OTHER doors a value can take into a record:
  //     plan `values`, `form.set('key', …)`. A create field the visitor never
  //     enters and the owner never asked for, filled by the page itself, is a
  //     value nobody ordered (live: `annahmedatum: todayIso()` in a plan step,
  //     `gesamtpreis` = nights × price computed in the browser). Picks count
  //     as visitor input (`onSelect={id => f.set('wohnung', id, …)}`), plan
  //     `link`s are the layer's job, presets/defaults are judged by 3q.
  if (ep.op === 'create' && appMeta && pageSrc) {
    const controls = appMeta.apps?.[ep.entity]?.controls || {};
    const lc = (x) => String(x ?? '').toLowerCase().trim();
    const esc = (k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const MONEY = /(preis|betrag|summe|kosten|total|amount|price|gebuehr|gebühr|rabatt|steuer)/i;
    for (const key of ep.fields || []) {
      const k = esc(key);
      const bound = new RegExp(`name=["']${k}["']|\\.(?:field|number|date|choice|checkbox|record|records)\\(\\s*['"]${k}['"]|\\.range\\(\\s*['"]${k}['"]|\\.range\\(\\s*['"]\\w+['"]\\s*,\\s*['"]${k}['"]|onSelect=\\{[^}]*set\\(\\s*['"]${k}['"]|set\\(\\s*['"]${k}['"]\\s*,\\s*(?:id|item|selected|picked|choice|record|\\w*Id)\\b`).test(pageSrc);
      const linked = new RegExp(`link\\s*:\\s*\\{[^}]*\\b${k}\\s*:`).test(pageSrc);
      const preset = key in (ep.preset_fields || {}) || key in (ep.default_fields || {});
      const filledByPage = new RegExp(`\\bvalues\\s*:[^;]*?\\b${k}\\s*:|set\\(\\s*['"]${k}['"]\\s*,`).test(pageSrc);
      const prefilled = new RegExp(`\\binitial\\s*:\\s*\\{[^}]*\\b${k}\\s*:`).test(pageSrc);
      const c = controls[key] || {};
      // A prefilled control is a value nobody ordered with a visitor who did
      // not object (live: `initial: { status: 'angenommen' }` behind a pill
      // group the visitor never touches). The owner has to name the field.
      if (prefilled && pageRequest && !orderedByPlan(slug, ep.entity, key)) {
        const named = [key, c.label].map(lc).filter(w => w.length >= 3).some(w => pageRequest.includes(w));
        if (!named) {
          errors.push(`${pageFile || where}: page '${slug}' prefills '${ep.entity}.${key}' (useStepForm initial) although the owner never asked for '${c.label || key}' — a prefilled value lands in every record whose visitor does not change it. Drop '${key}' from the page; if the record cannot do without it, ask the visitor without a default`);
          continue;
        }
      }
      if (bound || linked || preset) continue;
      const computedMoney = MONEY.test(key) && new RegExp(`set\\(\\s*['"]${k}['"]\\s*,\\s*[^)]*[*+]|\\b${k}\\s*:\\s*[^,}]*[*+]|const\\s+${k}\\s*=\\s*[^;]*[*+]`).test(pageSrc);
      if (computedMoney) {
        errors.push(`${pageFile || where}: page '${slug}' computes the amount '${key}' in the browser and writes it into '${ep.entity}' — a visitor's browser never sets a price (it can be edited before submit, and it drifts from the owner's rules). Drop '${key}' from the create endpoint; a tool prices the record after it exists, the page may only DISPLAY an estimate`);
        continue;
      }
      if (!filledByPage) continue;
      if (!pageRequest || orderedByPlan(slug, ep.entity, key)) continue;
      const words = [key, c.label].map(lc).filter(w => w.length >= 3);
      if (words.some(w => pageRequest.includes(w))) continue;
      errors.push(`${pageFile || where}: page '${slug}' fills '${ep.entity}.${key}' itself (plan values / form.set) although no visitor enters it and the owner never asked for '${c.label || key}' — a value nobody ordered lands in every record. Drop '${key}' from the create endpoint and from the page; if the record cannot do without it, ask the visitor for it`);
    }
  }
  // 3z. Internal state is the operator's, never the visitor's. A visitor who
  //     picks the order status ("Auftragsstatus: angenommen") or the customer
  //     type on a public page writes workflow state nobody ordered (live: the
  //     repair page moved status from a preset into a pill group). Such a
  //     field stays off the page unless the owner asked for exactly that.
  if (ep.op === 'create' && appMeta && pageRequest) {
    const controls = appMeta.apps?.[ep.entity]?.controls || {};
    const lc = (x) => String(x ?? '').toLowerCase().trim();
    const STATE = /^(status|zustand|phase|stufe|prioritaet|priorität|bearbeiter|zugewiesen|freigabe|freigegeben|bezahlt|erledigt|abgeschlossen|kategorie|typ|art)$|_status$|_typ$/i;
    for (const key of ep.fields || []) {
      if (!STATE.test(key)) continue;
      const c = controls[key] || {};
      if (orderedByPlan(slug, ep.entity, key)) continue;
      const named = [key, c.label].map(lc).filter(w => w.length >= 3).some(w => pageRequest.includes(w));
      if (named) continue;
      errors.push(`${where}: page '${slug}' lets the visitor set '${ep.entity}.${key}' (${c.label || key}) — internal state belongs to the operator, and the owner never asked for it. Remove '${key}' from the create endpoint and the page; the record gets its state from the operator or a tool afterwards`);
    }
  }
  // A list endpoint without an explicit projection is rejected by the
  // service — and an implicit "all fields" would be a data leak anyway.
  // applookup fields ARE allowed (raw record URL, join client-side);
  // file fields are not.
  if (ep.op === 'list' && !(Array.isArray(ep.fields) && ep.fields.length > 0)) {
    errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' is a list without a "fields" projection — name exactly the columns the page shows`);
  }
  // A public list of an entity with an occupancy rule is read for the
  // calendar — it must carry every field the rule evaluates. Without the
  // status field a cancelled stay still blocks nights (live 23.10.2026:
  // the page listed anreise/abreise/platz and left `status` out).
  if (ep.op === 'list' && occupancyRules[ep.entity]) {
    const rule = occupancyRules[ep.entity];
    const have = Array.isArray(ep.fields) ? ep.fields : [];
    const missing = [rule.from, rule.to, rule.resource, rule.statusField].filter(k => k && !have.includes(k));
    if (missing.length) {
      errors.push(`${where}: page '${slug}' lists '${ep.entity}', whose occupancy rule (src/config/journey.ts) evaluates ${missing.map(k => `'${k}'`).join(', ')} — the list projection lacks ${missing.length === 1 ? 'it' : 'them'}, so the calendar cannot tell a free stay from a booked one; add ${missing.map(k => `'${k}'`).join(', ')} to the list endpoint's fields`);
    }
  }
  // file fields: READING is fine — a file URL answers an anonymous GET with
  // 200 and `cache-control: public` (measured), so a listed logo or hero
  // image simply renders. UPLOADING works too (probed 20.10.2026): a file
  // field in a create endpoint takes the file as a data URL — the page binds
  // it with <FileField {...form.file(key)} /> (Bound does it by kind), which
  // limits type and size. /files and attachments stay ungrantable.
  // preset_fields are server-owned — a key listed in fields too would make
  // the visitor's value win, defeating the preset.
  const epFields = ep.fields || [];
  for (const key of Object.keys(ep.preset_fields || {})) {
    if (epFields.includes(key)) {
      errors.push(`${where}: page '${slug}' endpoint '${ep.entity}' lists '${key}' in both fields and preset_fields — preset fields are server-owned, remove '${key}' from fields`);
    }
  }
  // A required field the page DECLARES must also be submitted. Leaving an
  // internally-required field out of the declaration is legal (internal
  // requirement is an editing duty, not an entry duty) — but declaring it
  // and never sending it makes EVERY submit fail with 400, and the page
  // looks perfect until a visitor presses the button (live-proven with a
  // reservation form and its required 'tisch').
  if (ep.op === 'create' && appMeta) {
    const controls = appMeta.apps?.[ep.entity]?.controls || {};
    const preset = ep.preset_fields || {};
    if (pageSrc !== null) {
      for (const key of epFields) {
        // `continue`, never `return`: a `return` here left checkEndpoint at the
        // first optional field and skipped the stay-resource rule below (live:
        // a booking page without its room passed the gate).
        if (!controls[key]?.required || key in preset || key in (ep.default_fields || {})) continue;
        // The key must be PROVIDED for this entity, not merely mentioned: a
        // live page listed `status` in the create fields, never set it, and
        // read `r.fields['status']` in another entity's where-filter — the old
        // "is the word in the source" test passed, every submit got 400
        // missing_fields: ["status"]. Provided means: in this entity's
        // useStepForm fields, set on that form, or in a plan step's values.
        const formBlocks = [...pageSrc.matchAll(new RegExp(`useStepForm\\(\\s*['"]${ep.entity}['"]\\s*,\\s*\\{([\\s\\S]*?)\\}\\s*\\)`, 'g'))].map(m => m[1]);
        const inFormFields = formBlocks.some(b => new RegExp(`\\bfields\\s*:\\s*\\[[^\\]]*['"]${key}['"]`).test(b));
        const setOnForm = new RegExp(`\\.set\\(\\s*['"]${key}['"]`).test(pageSrc);
        const inValues = new RegExp(`\\bvalues\\s*:[\\s\\S]{0,600}?\\b${key}\\s*:`).test(pageSrc);
        const inCreateCall = new RegExp(`createPublicRecord\\([\\s\\S]{0,400}?\\b${key}\\s*:`).test(pageSrc);
        if (!inFormFields && !setOnForm && !inValues && !inCreateCall) {
          errors.push(`${pageFile}: required field '${key}' of '${ep.entity}' is declared in ${where} but the page never provides it (not in useStepForm('${ep.entity}', { fields: [...] }), not set(), not in a plan step's values) — every submit fails with 400 missing_fields. Either bind an input for '${key}' or drop it from the endpoint's fields so the team fills it internally; a fixed value belongs in preset_fields`);
        }
      }
    }
    // The stay's resource is a FORM FIELD. The agent's occupancy rule names
    // it; a page that kept the picked room in page state and handed it over
    // through the plan's `values` lost it on reload (not in the draft), hid
    // it from the summary and never validated it — a booking without its
    // room was created live. useStepForm makes the resource required by
    // itself, but only for a field it carries.
    const stay = occupancyRules[ep.entity];
    if (stay?.resource) {
      if (!epFields.includes(stay.resource) && !(stay.resource in preset)) {
        errors.push(`${where}: page '${slug}' creates '${ep.entity}', whose stay resource is '${stay.resource}' (src/config/journey.ts), but the create endpoint does not declare it — a record without its ${stay.resource} cannot be checked against occupancy; add '${stay.resource}' to fields`);
      }
      if (pageSrc !== null) {
        const formRe = new RegExp(`useStepForm\\(\\s*['"\`]${ep.entity}['"\`]\\s*,\\s*\\{[\\s\\S]*?fields\\s*:\\s*\\[([^\\]]*)\\]`);
        const form = formRe.exec(pageSrc);
        if (form && !new RegExp(`['"\`]${stay.resource}['"\`]`).test(form[1])) {
          errors.push(`${pageFile}: useStepForm('${ep.entity}', { fields: [...] }) omits the stay resource '${stay.resource}' — make it a form field (f.record('${stay.resource}'), or f.set('${stay.resource}', id, label) from the picker) instead of page state passed through the plan's values; only a form field survives a reload, appears in the summary and is validated`);
        }
      }
    }
  }
}

if (pageOnly) {
  // The lane's fragment (.public-staging/<slug>.surface.json) gets the same
  // endpoint checks as the merged surface — here, while the lane can still
  // fix it. Live: a preset on a field the entity does not have passed the
  // lane, and the first look at the fragment was the integration gate, after
  // the lane was gone (a 35 s repair agent then "fixed" it the wrong way).
  const stagedDir = dirname(fileArg);
  const component = basename(fileArg, '.tsx');
  let fragments = [];
  try {
    fragments = readdirSync(stagedDir).filter(f => f.endsWith('.surface.json')).map(f => join(stagedDir, f));
  } catch {
    // no staging dir (a page under src/pages/public/ checked directly)
  }
  const parsed = [];
  for (const f of fragments) {
    try {
      parsed.push([f, JSON.parse(readFileSync(f, 'utf8'))]);
    } catch (e) {
      errors.push(`${f}: invalid JSON — ${e.message}`);
    }
  }
  const own = parsed.filter(([, frag]) => frag && frag.component === component);
  const mine = own.length ? own : (parsed.length === 1 ? parsed : []);
  const stagedSrc = readFileSync(fileArg, 'utf8');
  for (const [f, frag] of mine) {
    const slug = frag.slug || basename(f, '.surface.json');
    if (!Array.isArray(frag.endpoints) || frag.endpoints.length === 0) {
      errors.push(`${f}: no "endpoints" — declare what the page reads (list) and writes (create)`);
      continue;
    }
    for (const ep of frag.endpoints) checkEndpoint(slug, ep, stagedSrc, fileArg, f);
    checkWrittenKeys(slug, stagedSrc, frag.endpoints, fileArg, errors);
    checkStickyColumn(slug, stagedSrc, fileArg, errors, warnings);
    checkGroupByName(slug, stagedSrc, frag.endpoints, fileArg, errors);
    checkWritePathKept(slug, stagedSrc, fileArg, errors);
    checkTieMark(slug, stagedSrc, fileArg, errors);
    checkTapTargets(slug, stagedSrc, fileArg, errors, warnings);
    checkSilentCut(slug, stagedSrc, fileArg, errors, warnings);
    checkRequiredSources(slug, stagedSrc, frag.endpoints, fileArg, errors);
    checkReadsBeforeSend(slug, stagedSrc, fileArg, errors);
    checkSiblingLinks(slug, stagedSrc, fileArg, errors);
    checkVisitorKey(slug, stagedSrc, fileArg, errors);
    checkFreshPointer(slug, stagedSrc, fileArg, errors);
    checkPollRate(slug, stagedSrc, fileArg, errors);
    checkLinkedChildren(slug, stagedSrc, fileArg, errors);
    checkFreshKinds(slug, stagedSrc, fileArg, errors);
  }
  // the lane sees its warnings too — before, file mode printed errors only (Abnahme 8)
  for (const w of warnings) console.log(`WARN: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    process.exit(1);
  }
  console.log(`check-public: OK (staged page ${fileArg})`);
  process.exit(0);
}

// ── 2. registry.tsx ↔ surface.json consistency ───────────────────────────
const registrySlugs = new Map(); // slug -> imported module name
if (existsSync(REGISTRY)) {
  const src = readFileSync(REGISTRY, 'utf8');
  // Form 1 (canonical): slug mapped to an inline lazy dynamic import of the
  // page module. (Kept prose-only so the snapshot import-scanner doesn't
  // read the example as a real import.)
  const INLINE_RE = /['"]([\w-]+)['"]\s*:\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]@\/pages\/public\/([\w.-]+)['"]\s*\)\s*\)/g;
  let m;
  while ((m = INLINE_RE.exec(src)) !== null) registrySlugs.set(m[1], m[2]);
  // Form 2 (equally legal, agents write it regularly): a lazy-bound const
  // referenced by name in the mapping. Two runs self-healed around a false
  // "component unreachable" here — recognize the form instead.
  const VAR_DEF_RE = /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]@\/pages\/public\/([\w.-]+)['"]\s*\)\s*\)/g;
  const varFiles = new Map();
  while ((m = VAR_DEF_RE.exec(src)) !== null) varFiles.set(m[1], m[2]);
  const VAR_REF_RE = /['"]([\w-]+)['"]\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/g;
  while ((m = VAR_REF_RE.exec(src)) !== null) {
    if (!registrySlugs.has(m[1]) && varFiles.has(m[2])) registrySlugs.set(m[1], varFiles.get(m[2]));
  }
}

let surface = null;
if (existsSync(SURFACE)) {
  try {
    surface = JSON.parse(readFileSync(SURFACE, 'utf8'));
  } catch (e) {
    errors.push(`${SURFACE}: invalid JSON — ${e.message}`);
  }
}
if (surface !== null) {
  // The service ingests only this exact shape — a missing version field
  // once silently dropped an entire deploy's declarations.
  if (surface.version !== 1) {
    errors.push(`${SURFACE}: missing or wrong "version" — add "version": 1 at the top level (the service ingests only {"version": 1, "pages": [...]})`);
  }
  if (!Array.isArray(surface.pages)) {
    errors.push(`${SURFACE}: "pages" must be an array`);
  }
}
const surfacePages = new Map(((surface && Array.isArray(surface.pages) && surface.pages) || []).map(p => [p.slug, p]));

for (const [slug, module] of registrySlugs) {
  if (!surfacePages.has(slug)) {
    errors.push(`${REGISTRY}: slug '${slug}' is registered but ${SURFACE} declares no page for it — without the declaration the service grants nothing and the page renders "unavailable"`);
  }
  if (!existsSync(join(PAGES_DIR, `${module}.tsx`))) {
    errors.push(`${REGISTRY}: slug '${slug}' imports '@/pages/public/${module}' but ${PAGES_DIR}/${module}.tsx does not exist`);
  }
}
for (const [slug, page] of surfacePages) {
  if (page.component && !registrySlugs.has(slug)) {
    errors.push(`${SURFACE}: page '${slug}' declares component '${page.component}' but ${REGISTRY} has no entry for it — the component is unreachable`);
  }
  // One flow = one page = ONE publish decision for the owner. A page
  // without a component is a data-carrier: it renders nothing itself but
  // forces the owner to publish it separately before the real page works.
  if (!page.component) {
    errors.push(`${SURFACE}: page '${slug}' has no "component" — declare its data as additional endpoints of the page that shows it (one page may carry several list/create endpoints); extra carrier pages each force a separate publish`);
  }
  // A page reached with `?x=<record_id>` MUST declare that parameter: the
  // management UI can otherwise only offer the bare page URL, which for such
  // a page is a dead end. Live proof: an invitation page demanded
  // ?sitzungId=… and nothing in the whole dashboard produced one — correct
  // and unreachable at the same time.
  const src = existsSync(join(PAGES_DIR, `${page.component}.tsx`))
    ? readFileSync(join(PAGES_DIR, `${page.component}.tsx`), 'utf8')
    : '';
  const readsParam = /useSearchParams|searchParams|URLSearchParams/.test(src);
  // 3r. A read of a field the list projection does not include is always
  //     empty for visitors — the grant never delivers it. Live: "Ändern"
  //     added Beschreibung and Ausstattung to the cards in code only, the
  //     surface stayed as it was, the page stayed published and showed
  //     nothing. Only keys that belong to a LISTED entity and to no declared
  //     endpoint field (create or list) are judged — a form field of another
  //     entity with the same name is left alone.
  if (appMeta && src) {
    const declared = new Set();
    for (const e of page.endpoints || []) for (const k of (e.fields || [])) declared.add(k);
    const reads = new Set();
    for (const m of src.matchAll(/\.fields(?:\.(\w+)|\[['"](\w+)['"]\])/g)) reads.add(m[1] || m[2]);
    for (const m of src.matchAll(/\bfield(?:Text|Lookup|Lookups|Number|Date|Ref)\(\s*[^,()]+,\s*['"](\w+)['"]/g)) reads.add(m[1]);
    for (const ep of (page.endpoints || []).filter(e => e.op === 'list')) {
      const controls = appMeta.apps?.[ep.entity]?.controls || {};
      const projection = new Set(ep.fields || []);
      for (const key of reads) {
        if (projection.has(key) || declared.has(key) || !controls[key]) continue;
        errors.push(`${SURFACE}: page '${slug}' reads '${key}' of '${ep.entity}' (${page.component}.tsx), but the list projection does not include it — the grant never delivers that field, visitors always see it empty. Add '${key}' to the list endpoint's fields (and mind what that exposes) or remove the read`);
      }
    }
  }
  // a warning in the tree run: a page built before the rule must not block an update
  if (src) checkSiblingLinks(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkVisitorKey(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkFreshPointer(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkPollRate(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkLinkedChildren(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkFreshKinds(slug, src, `${PAGES_DIR}/${page.component}.tsx`, errors);
  if (src) checkWrittenKeys(slug, src, page.endpoints, `${PAGES_DIR}/${page.component}.tsx`, errors);
  if (src) checkStickyColumn(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings, warnings);
  if (src) checkGroupByName(slug, src, page.endpoints, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkWritePathKept(slug, src, `${PAGES_DIR}/${page.component}.tsx`, errors);
  if (src) checkTieMark(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  if (src) checkTapTargets(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings, warnings);
  if (src) checkSilentCut(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings, warnings);
  if (src) checkRequiredSources(slug, src, page.endpoints, `${PAGES_DIR}/${page.component}.tsx`, errors);
  if (src) checkReadsBeforeSend(slug, src, `${PAGES_DIR}/${page.component}.tsx`, warnings);
  // PV-3: the plan ordered a link parameter — the surface must declare it, same entity
  const planned = planLinkParam.get(slug);
  if (planned && (!page.link_param || page.link_param.entity !== planned.entity)) {
    errors.push(`${SURFACE}: page '${slug}' is planned to open per '${planned.entity}' record (link_param '${planned.name}') but the surface declares ${page.link_param ? `link_param for '${page.link_param.entity}'` : 'no link_param'} — declare link_param: { name: '${planned.name}', entity: '${planned.entity}'${planned.label_field ? `, label_field: '${planned.label_field}'` : ''} } and read ?${planned.name}= in the page`);
  }
  if (readsParam && !page.link_param) {
    errors.push(`${SURFACE}: page '${slug}' reads a query parameter but declares no "link_param" — without it the owner only gets the bare page URL, which shows "link incomplete". Add link_param: { name, entity, label_field } (entity needs a list endpoint on this page).`);
  }
  if (page.link_param) {
    const lp = page.link_param;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(String(lp.name || ''))) {
      errors.push(`${SURFACE}: page '${slug}' link_param.name '${lp.name}' is not a query-parameter identifier`);
    }
    if (readsParam && src && !src.includes(String(lp.name || '\u0000'))) {
      errors.push(`${SURFACE}: page '${slug}' declares link_param '${lp.name}' but ${page.component}.tsx never reads that name — the generated links would carry a parameter the page ignores`);
    }
    const lpList = (page.endpoints || []).find(e => e.op === 'list' && e.entity === lp.entity);
    if (!lpList) {
      errors.push(`${SURFACE}: page '${slug}' link_param entity '${lp.entity}' has no list endpoint on this page — the page could not read the linked record`);
    } else if (!lpList.scope) {
      // The grant has no per-record path: the page reads the WHOLE list to find
      // the linked record, so every record is readable for anyone with the bare
      // URL (live: all order numbers, statuses and plates of a workshop).
      warnings.push(`${SURFACE}: page '${slug}' link_param entity '${lp.entity}' is listed without a scope — anyone with the page URL can read every '${lp.entity}' record through the grant, not only the linked one. Narrow the list with a scope where the data allows it, and name the exposure in your summary`);
    }
  }
  {
    const module = registrySlugs.get(slug);
    const pageFile = module ? join(PAGES_DIR, `${module}.tsx`) : null;
    const pageSrc = pageFile && existsSync(pageFile) ? readFileSync(pageFile, 'utf8') : null;
    for (const ep of page.endpoints || []) checkEndpoint(slug, ep, pageSrc, pageFile);
    // The plan runner writes through the public port, and the port creates
    // through EVERY create endpoint of the page. A hand-written
    // createPublicRecord next to it rebuilds what the port does — and got the
    // second target wrong once the surface was reordered (live: a guest
    // created by hand, the booking refused as 'not this page's entity').
    if (pageSrc !== null && /useJourneySubmit\(/.test(pageSrc) && /createPublicRecord\(/.test(pageSrc)) {
      const line = pageSrc.slice(0, pageSrc.search(/createPublicRecord\(/)).split('\n').length;
      warnings.push(`${pageFile}:${line}: createPublicRecord(…) next to useJourneySubmit — make it a plan step ({ key, entity, form, needs, link }); the port creates through every create endpoint the page declares`);
    }
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`check-public: OK (${pageFiles.length} pages, ${registrySlugs.size} registered slugs)`);
