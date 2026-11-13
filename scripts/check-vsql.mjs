#!/usr/bin/env node
// check-vsql — the real parser as the gate for every `filter` a page sends.
//
//   node scripts/check-vsql.mjs .intents-staging/NeueBuchungPage.tsx
//
// vSQL is LivingLogic's own dialect: no model has learned it, and a regex gate
// only knows the traps we already fell into (it even taught one wrong: "no
// today()", live 03.09.2026). So this script asks the ONE authority — the
// server that will run the filter later:
//
//   1. Validity: every static `filter` (useRecordSearch, port.list, port.count)
//      goes once to `aggregate_records?filter=…&value=count()`. A 400 is the
//      page's error, quoted with the server's own message. A dynamic filter
//      (`${id}`) is probed with a placeholder id — the type check still runs.
//   2. Meaning: a useRecordSearch `filter` has a TypeScript twin, `where`
//      (check-intents 3p). Both are run over the entity's real records —
//      `where` here in Node, `filter` on the server — and the two hit sets
//      must agree. A date compared as a string is valid vSQL that matches
//      nothing: the twin finds 12, the server 0, and the page is red with the
//      ids that differ. Skipped (with a note) above 500 records or on an
//      empty entity — nothing to compare.
//
// Needs LA_API_URL + LIVINGAPPS_API_KEY in the environment (the sandbox has
// both); without a key it says so and passes — a local run must not fail on
// missing credentials. The key is never printed.

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
if (!target || !existsSync(target)) {
  console.error('usage: node scripts/check-vsql.mjs <page.tsx>');
  process.exit(2);
}
const rel = relative(process.cwd(), resolve(target)).replace(/\\/g, '/');
// A public page's code cannot filter (grants allow field/limit/offset), but its
// SURFACE can: every list endpoint's `scope` is vSQL the server parses when
// the grant is written — after the deploy, in the band's public-pages sync.
// Live (07.09.2026): `r.v_status not in ('storniert', 'angefragt')` passed
// every gate, the grant sync failed, the booking page had no occupancy. So the
// scopes are probed here like a flow's filters; the code literals are not.
const isPublic = args.includes('--public') || rel.startsWith('.public-staging/') || rel.startsWith('src/pages/public/');

const src = isPublic ? '' : readFileSync(rel, 'utf8');
// No default host: generated code never embeds one (same-origin contract) —
// the sandbox passes LA_API_URL, a local run without it skips the probe.
const base = (process.env.LA_API_URL || '').replace(/\/+$/, '');
const key = process.env.LIVINGAPPS_API_KEY || '';
let meta = null;
try { meta = JSON.parse(readFileSync('app_metadata.json', 'utf8')); } catch { /* local run */ }

const errors = [];
const notes = [];
const lineOf = i => src.slice(0, i).split('\n').length;
const PLACEHOLDER_ID = '000000000000000000000000';

function balancedEnd(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

// The `where:` arrow of an options literal, as source text: everything up to
// the comma or brace that closes it at depth 0.
function whereSource(opts) {
  const m = /\bwhere\s*:\s*/.exec(opts);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 0, quote = null;
  for (; i < opts.length; i++) {
    const c = opts[i];
    if (quote) { if (c === quote && opts[i - 1] !== '\\') quote = null; continue; }
    if (c === '\'' || c === '"' || c === '`') { quote = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ',' && depth === 0) break;
  }
  return opts.slice(m.index + m[0].length, i).trim();
}

// ── collect ──────────────────────────────────────────────────────────────
const probes = [];
if (isPublic) {
  const component = basename(rel).replace(/\.tsx$/, '');
  const surfaces = [];
  try {
    for (const f of readdirSync('.public-staging')) if (f.endsWith('.surface.json')) surfaces.push(JSON.parse(readFileSync(`.public-staging/${f}`, 'utf8')));
  } catch { /* no staging dir */ }
  try {
    const merged = JSON.parse(readFileSync('_public/surface.json', 'utf8'));
    for (const page of merged.pages || []) surfaces.push(page);
  } catch { /* no merged surface */ }
  for (const page of surfaces) {
    if (page.component !== component) continue;
    for (const ep of page.endpoints || []) {
      if (ep.op !== 'list' || typeof ep.scope !== 'string' || !ep.scope.trim()) continue;
      probes.push({ entity: ep.entity, filter: ep.scope, dynamic: false, where: null, line: 0, label: `${rel} · scope of list '${ep.entity}' (page '${page.slug}')` });
    }
  }
  if (probes.length === 0) {
    console.log(`check-vsql: public page — grants cannot filter; no list scope declared, nothing to probe`);
    process.exit(0);
  }
}
for (const call of src.matchAll(/useRecordSearch\(\s*\w+\s*,\s*['"](\w+)['"]/g)) {
  const open = src.indexOf('{', call.index + call[0].length);
  const end = open < 0 ? -1 : balancedEnd(src, open);
  if (end < 0) continue;
  const opts = src.slice(open, end + 1);
  const f = /\bfilter\s*:\s*(['"`])([\s\S]*?)\1/.exec(opts);
  if (!f) continue;
  probes.push({ entity: call[1], filter: f[2], dynamic: f[2].includes('${'), where: whereSource(opts), line: lineOf(call.index) });
}
for (const call of src.matchAll(/\.(?:list|count)\(\s*['"](\w+)['"]\s*,\s*\{/g)) {
  const open = call.index + call[0].length - 1;
  const end = balancedEnd(src, open);
  if (end < 0) continue;
  const opts = src.slice(open, end + 1);
  const f = /\bfilter\s*:\s*(['"`])([\s\S]*?)\1/.exec(opts);
  if (!f) continue;
  probes.push({ entity: call[1], filter: f[2], dynamic: f[2].includes('${'), where: null, line: lineOf(call.index) });
}

// A generated flow hook carries the page's searches — probe its filters too.
for (const m of src.matchAll(/from\s*['"]@\/lib\/journey\/flows\/(\w+)['"]/g)) {
  const hookFile = `src/lib/journey/flows/${m[1]}.ts`;
  if (!existsSync(hookFile)) continue;
  const hsrc = readFileSync(hookFile, 'utf8');
  for (const call of hsrc.matchAll(/useRecordSearch\(\s*\w+\s*,\s*['"](\w+)['"]/g)) {
    const open = hsrc.indexOf('{', call.index + call[0].length);
    const end = open < 0 ? -1 : balancedEnd(hsrc, open);
    if (end < 0) continue;
    const opts = hsrc.slice(open, end + 1);
    const f = /\bfilter\s*:\s*(['"`])([\s\S]*?)\1/.exec(opts);
    if (!f) continue;
    probes.push({ entity: call[1], filter: f[2], dynamic: f[2].includes('${'), where: whereSource(opts), line: 0, label: `${hookFile} (flow hook)` });
  }
}

// A display view's live reads (src/pages/views, useLiveRecords) — their filter is vSQL too.
for (const call of src.matchAll(/useLiveRecords\(\s*['"](\w+)['"]\s*,\s*\{/g)) {
  const open = call.index + call[0].length - 1;
  const end = balancedEnd(src, open);
  if (end < 0) continue;
  const opts = src.slice(open, end + 1);
  const f = /\bfilter\s*:\s*(['"`])([\s\S]*?)\1/.exec(opts);
  if (!f) continue;
  probes.push({ entity: call[1], filter: f[2], dynamic: f[2].includes('${'), where: null, line: lineOf(call.index) });
}

// A flow's live list (useLiveList(port, 'e', { list: { filter, orderby } })) reads vSQL too.
for (const call of src.matchAll(/useLiveList\(\s*[\w.]+\s*,\s*['"](\w+)['"]\s*,\s*\{/g)) {
  const open = call.index + call[0].length - 1;
  const end = balancedEnd(src, open);
  if (end < 0) continue;
  const opts = src.slice(open, end + 1);
  const f = /\bfilter\s*:\s*(['"`])([\s\S]*?)\1/.exec(opts);
  if (!f) continue;
  probes.push({ entity: call[1], filter: f[2], dynamic: f[2].includes('${'), where: null, line: lineOf(call.index) });
}

// EF-13 (A11, Bau 14): `orderby: ['r.createdAt asc']` answered 400 on every load, the merge step
// read 0 feedbacks and „Bestätigen“ would have written the empty frame. An orderby item is
// `r.<attribute>` (id, createdat, updatedat, createdby, updatedby — lower case) or `r.v_<field>`,
// optionally `asc`/`desc` — checked without a key, wherever it stands.
const ORDER_OK = /^r\.(?:id|createdat|updatedat|createdby|updatedby|v_[a-z0-9_]+)(?:\s+(?:asc|desc))?$/;
for (const m of src.matchAll(/\borderby\s*:\s*\[([^\]]*)\]/g)) {
  for (const item of m[1].matchAll(/(['"`])([^'"`]*)\1/g)) {
    const expr = item[2].trim();
    if (expr.includes('${') || ORDER_OK.test(expr)) continue;
    const attr = /^r\.(createdAt|updatedAt|createdBy|updatedBy|record_id)\b/.exec(expr);
    const hint = attr ? (attr[1] === 'record_id' ? 'the record id is r.id' : `vSQL attributes are lower case: r.${attr[1].toLowerCase()}`)
      : /^r\.(?!v_)\w/.test(expr) ? `a field is r.v_${expr.slice(2).split(/\s/)[0]}` : 'write r.<attribute> or r.v_<field>, then asc or desc';
    errors.push(`${rel}:${lineOf(m.index)}: orderby \`${expr}\` is not vSQL — ${hint}. The server answers 400 and the list stays empty. Example: 'r.createdat asc'`);
  }
}
if (probes.length === 0) {
  if (errors.length) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(`check-vsql: ${errors.length} error(s) in ${rel}`);
    process.exit(1);
  }
  console.log(`check-vsql: OK (${rel} — no filters to probe)`);
  process.exit(0);
}

// The plan's filter grammar is no vSQL — caught without a key (0.0.502 beamer:
// `r.status eq 'geoeffnet'` answered 400 on every poll and the view stayed on „Pause“).
// Outside string literals: a word operator (eq, ne, gte, not_in …) or a field
// read as `r.<key>` instead of `r.v_<key>` (`r.id` and the other record attributes stay).
function shapeProblem(filter) {
  const bare = filter.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\$\{[^}]*\}/g, "''");
  const word = /\s(eq|ne|gt|gte|lt|lte|not_in|not_empty|empty)(\s|$)/.exec(bare);
  if (word) return `'${word[1]}' is the plan's word, not vSQL — write ${({ eq: '==', ne: '!=', gt: '>', gte: '>=', lt: '<', lte: '<=', not_in: 'not in', not_empty: 'is not None', empty: 'is None' })[word[1]]}`;
  // record attributes stay as they are: r.id, r.createdat, r.updatedat, r.createdby, r.updatedby
  const field = /\br\.(?!v_|(?:id|createdat|updatedat|createdby|updatedby)\b)([a-z]\w*)/.exec(bare);
  if (field && field[1] === 'record_id') return 'the record id is r.id in vSQL, never r.record_id';
  if (field) return `a field is read as r.v_${field[1]}, not r.${field[1]}`;
  return null;
}
for (const p of probes) {
  if (p.dynamic) continue;
  const problem = shapeProblem(p.filter);
  if (problem) errors.push(`${p.label ?? `${rel}:${p.line}`}: filter \`${p.filter}\` on '${p.entity}' is not vSQL — ${problem}. Example: r.v_status == 'offen'`);
}
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`check-vsql: ${errors.length} error(s) in ${rel}`);
  process.exit(1);
}
if (!key || !base) {
  console.log(`check-vsql: ${probes.length} ${isPublic ? 'scope(s)' : 'filter(s)'} in ${rel} — no API key/URL in this environment, live probe skipped`);
  process.exit(0);
}

// ── probe ────────────────────────────────────────────────────────────────
async function api(path) {
  const res = await fetch(base + path, { headers: { 'X-API-Key': key, Accept: 'application/json' } });
  const text = await res.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, body, text };
}

function serverMessage(r) {
  const b = r.body || {};
  const parts = [b.title, b.exception, b.detail].filter(x => typeof x === 'string' && x);
  return parts.length ? parts.join(' — ') : (r.text || '').slice(0, 200);
}

function toJourneyRecord(id, r) {
  return { id: r.id ?? id, fields: r.fields ?? {}, createdAt: r.created_at ?? null };
}

let whereRuntime = null;
async function loadWhereRuntime() {
  if (whereRuntime !== null) return whereRuntime;
  const out = `.check-vsql.${basename(rel, '.tsx')}.fields.mjs`;
  const built = spawnSync('npx', ['--yes', 'esbuild', 'src/lib/journey/fields.ts', '--bundle', '--format=esm', '--platform=node', '--alias:@=./src', `--outfile=${out}`, '--log-level=error'], { encoding: 'utf8' });
  if (built.status !== 0 || !existsSync(out)) { whereRuntime = false; return false; }
  try {
    whereRuntime = await import(resolve(out));
  } catch { whereRuntime = false; }
  finally { try { unlinkSync(out); } catch { /* gone */ } }
  return whereRuntime;
}

async function compileWhere(source) {
  const rt = await loadWhereRuntime();
  if (!rt) return null;
  try {
    const factory = new Function('fieldText', 'fieldLookup', 'fieldNumber', 'fieldDate', 'fieldRef', `return (${source});`);
    const fn = factory(rt.fieldText, rt.fieldLookup, rt.fieldNumber, rt.fieldDate, rt.fieldRef);
    return typeof fn === 'function' ? fn : null;
  } catch {
    return null;
  }
}

for (const p of probes) {
  const appId = meta?.apps?.[p.entity]?.app_id;
  const label = p.label ?? `${rel}:${p.line}`;
  if (!appId) { notes.push(`${label}: no app id for '${p.entity}' in app_metadata.json — filter not probed`); continue; }
  const expr = p.dynamic ? p.filter.replace(/\$\{[^}]*\}/g, PLACEHOLDER_ID) : p.filter;
  const q = encodeURIComponent(expr);
  let count;
  try {
    const r = await api(`/apps/${appId}/aggregate_records?filter=${q}&value=count()`);
    if (r.status !== 200) {
      errors.push(`${label}: the server rejects ${isPublic ? 'scope' : 'filter'} '${p.filter}' (HTTP ${r.status}: ${serverMessage(r)}) — this is the same parser that runs it live; fix the vSQL (fields r.v_<key>, id r.id, lists in brackets: r.v_status not in ['a', 'b'], dates today()/@(YYYY-MM-DD), datetimes now(), booleans True/False)`);
      continue;
    }
    count = Array.isArray(r.body) && Array.isArray(r.body[0]) ? Number(r.body[0][0]) : null;
    notes.push(`${label}: filter '${expr}' → OK (${count ?? '?'} match${count === 1 ? '' : 'es'} today)`);
  } catch (e) {
    notes.push(`${label}: probe failed to reach ${base} (${e instanceof Error ? e.message : e}) — validity unknown`);
    continue;
  }

  // ── twin ──
  if (!p.where || p.dynamic) continue;
  if (count === null || count > 500) { notes.push(`${label}: ${count ?? 'unknown'} matches — twin check needs ≤ 500 records, skipped`); continue; }
  const fn = await compileWhere(p.where);
  if (!fn) { notes.push(`${label}: where '${p.where.slice(0, 80)}' uses names this probe cannot evaluate — twin check skipped`); continue; }
  let all, hit;
  try {
    all = await api(`/apps/${appId}/records?limit=500`);
    hit = await api(`/apps/${appId}/records?filter=${q}&limit=500`);
  } catch (e) {
    notes.push(`${label}: twin fetch failed (${e instanceof Error ? e.message : e})`); continue;
  }
  if (all.status !== 200 || hit.status !== 200 || !all.body || !hit.body) { notes.push(`${label}: twin fetch answered ${all.status}/${hit.status} — skipped`); continue; }
  const allRows = Object.entries(all.body).map(([id, r]) => toJourneyRecord(id, r));
  if (allRows.length === 0) { notes.push(`${label}: '${p.entity}' has no records yet — twin check has nothing to compare`); continue; }
  if (allRows.length >= 500) { notes.push(`${label}: '${p.entity}' has ≥ 500 records — twin check skipped`); continue; }
  const serverIds = new Set(Object.keys(hit.body));
  const expected = new Set();
  for (const r of allRows) {
    let v = false;
    try { v = Boolean(fn(r)); } catch { v = false; }
    if (v) expected.add(r.id);
  }
  const onlyWhere = [...expected].filter(id => !serverIds.has(id));
  const onlyFilter = [...serverIds].filter(id => !expected.has(id));
  if (onlyWhere.length || onlyFilter.length) {
    errors.push(`${label}: filter and where DISAGREE on '${p.entity}' — where matches ${expected.size}, the server ${serverIds.size}` +
      (onlyWhere.length ? `; only where: ${onlyWhere.slice(0, 3).join(', ')}${onlyWhere.length > 3 ? ' …' : ''}` : '') +
      (onlyFilter.length ? `; only filter: ${onlyFilter.slice(0, 3).join(', ')}${onlyFilter.length > 3 ? ' …' : ''}` : '') +
      `. One of the two says something else than you think — a date as a string, a lookup label instead of its key, a missing .lower(). Make both say the same`);
  } else {
    notes.push(`${label}: twin OK — where and filter agree on all ${allRows.length} records (${expected.size} match)`);
  }
}

for (const n of notes) console.log(`check-vsql: ${n}`);
for (const e of errors) console.error(`ERROR: ${e}`);
if (errors.length) {
  console.error(`check-vsql: ${errors.length} problem(s) in ${rel}`);
  process.exit(1);
}
console.log(`check-vsql: OK (${rel} — ${probes.length} ${isPublic ? 'scope(s)' : 'filter(s)'} accepted by the server)`);
