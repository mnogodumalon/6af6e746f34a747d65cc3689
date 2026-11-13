#!/usr/bin/env node
// check-staging — a page builder's own pre-flight while Phase 1 shares the tree.
//
//   node scripts/check-staging.mjs .intents-staging/NeueBuchungPage.tsx
//   node scripts/check-staging.mjs .public-staging/Zimmeranfrage.tsx   [--public]
//
// Four checks on a flow page: tsc, check-intents, check-vsql and — new — a
// render-smoke walk of the staged page (bundle, mount, press through).
//
// In intents-pages mode the lanes may not run `tsc`, the gates or `npm run
// build`: one tsbuildinfo, one dist/, and a tree Phase 1 is still writing.
// So their first type check used to be the integration build — long after the
// lane was gone, and every slip cost a 170 s repair agent. This script is the
// one gate-shaped command the mode allows, because it touches nothing shared:
//
//   1. tsc --noEmit over THIS page and what it imports (the blocks, the journey
//      layer, the service, the types — NOT all of src/), through a throw-away
//      tsconfig at the project root (same compilerOptions as tsconfig.app.json,
//      incremental with a buildinfo per page). Scoped on purpose: a whole-tree
//      tsc took 60–120 s in the 2-vCPU sandbox next to Phase 1's own build,
//      and a lane iterating on it ran Phase 2A into its deadline (live
//      02.09.2026). Errors are split: the page's own are reported, errors in
//      the files it imports are Phase 1's business and only counted.
//   2. The page rules of check-intents / check-public on this one file
//      (`--file`): labels, declared steps, search fields, vSQL filter, the
//      journey-layer presence, import allowlist, … Wiring rules (App.tsx,
//      registry, surface) are the integration band's and are skipped.
//   3. check-vsql: every `filter` the page sends is parsed by the REAL server
//      (aggregate_records) and, where a `where` twin exists, both are run
//      over the entity's records and must agree. Flow pages only.
//
// Exit 0 iff both halves are green — a page that has not printed
// `check-staging: OK` is not finished.

import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';

const ts = createRequire(import.meta.url)('typescript');

const args = process.argv.slice(2);
const target = args.find(a => !a.startsWith('--'));
if (!target) {
  console.error('usage: node scripts/check-staging.mjs <.intents-staging/Page.tsx | .public-staging/Page.tsx> [--public]');
  process.exit(2);
}
if (!existsSync(target)) {
  console.error(`ERROR: ${target} does not exist — write the page first, then check it`);
  process.exit(2);
}
const rel = relative(process.cwd(), resolve(target)).replace(/\\/g, '/');
const isPublic = args.includes('--public') || rel.startsWith('.public-staging/') || rel.startsWith('src/pages/public/');
const problems = [];

// ── 1. Types: this page + what it imports, nothing written ──────────────
// One tsc at a time per tree: two lanes checking at once next to Phase 1's own
// build starved the 2-vCPU sandbox. A lock file serialises them; a stale lock
// (a killed lane) is taken over after five minutes.
const LOCK = '.check-staging.lock';
function acquireLock() {
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      writeFileSync(LOCK, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      try {
        if (Date.now() - statSync(LOCK).mtimeMs > 5 * 60 * 1000) { unlinkSync(LOCK); continue; }
      } catch { continue; }
      if (attempt === 0) console.log('check-staging: another check is running — waiting for its tsc to finish');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    }
  }
  return false;
}
function releaseLock() {
  try { if (readFileSync(LOCK, 'utf8') === String(process.pid)) unlinkSync(LOCK); } catch { /* not ours or gone */ }
}

const CONFIG = 'tsconfig.app.json';
const read = ts.readConfigFile(CONFIG, ts.sys.readFile);
if (read.error) {
  console.error(`ERROR: cannot read ${CONFIG}: ${ts.flattenDiagnosticMessageText(read.error.messageText, '\n')}`);
  process.exit(2);
}
const base = read.config || {};
const compilerOptions = { ...(base.compilerOptions || {}) };
const stem = basename(rel, '.tsx');
compilerOptions.noEmit = true;
compilerOptions.composite = false;
// Incremental, with a buildinfo PER PAGE: the first run type-checks the page
// and everything it imports (10–14 s live), the second and third — after the
// lane's repairs — re-check only the page and reuse the tree (2–3 s). One file
// per page so two lanes never share one; noEmit + incremental is fine since
// TS 4.0. Diagnostics of unchanged files are replayed from the buildinfo, so
// "elsewhere in the tree" is still reported and still not counted.
compilerOptions.incremental = true;
compilerOptions.tsBuildInfoFile = `.check-staging.${stem}.tsbuildinfo`;
// Root-level so `baseUrl`/`paths`/`include` keep their meaning; unique per
// page so two lanes checking at once never share a file.
const tempConfig = `.check-staging.${stem}.tsconfig.json`;
writeFileSync(tempConfig, JSON.stringify({
  compilerOptions,
  // `files` only — tsc follows the page's imports; no `include`, so the rest
  // of src/ (the widgets, the overview Phase 1 is still writing) stays out.
  files: [rel],
  include: [],
}, null, 2));

let tscOutput = '';
const locked = acquireLock();
if (!locked) console.log('check-staging: lock wait expired — running anyway');
try {
  const run = spawnSync('npx', ['tsc', '-p', tempConfig, '--pretty', 'false'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  tscOutput = (run.stdout || '') + (run.stderr || '');
} finally {
  try { unlinkSync(tempConfig); } catch { /* already gone */ }
  if (locked) releaseLock();
}

const pageErrors = [];
const configErrors = [];
let treeErrors = 0;
for (const raw of tscOutput.split('\n')) {
  const line = raw.trim();
  const m = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line);
  if (m) {
    if (m[1].replace(/\\/g, '/') === rel) pageErrors.push(line);
    else treeErrors += 1;
    continue;
  }
  if (/^error TS\d+/.test(line)) configErrors.push(line);
}
for (const e of pageErrors) console.error(`ERROR: ${e}`);
for (const e of configErrors) console.error(`ERROR: ${e}`);
problems.push(...pageErrors, ...configErrors);
if (treeErrors > 0) {
  console.log(`check-staging: ${treeErrors} tsc error(s) elsewhere in the tree (files your page imports) — not yours, not counted`);
}

// ── 2. The page rules, on this file only ────────────────────────────────
const gate = isPublic ? 'scripts/check-public.mjs' : 'scripts/check-intents.mjs';
const g = spawnSync('node', [gate, '--file', rel], { encoding: 'utf8' });
if (g.stdout) process.stdout.write(g.stdout);
if (g.stderr) process.stderr.write(g.stderr);
if (g.status !== 0) problems.push(`${gate} red`);

// ── 2b. Hook order, on this file only ───────────────────────────────────
// rules-of-hooks was an integration-only gate: a hook behind the early return
// passed the lane and cost a repair agent after the join (live 07.09.2026).
// Only where eslint is installed (the sandbox tree); a test project without it
// skips the rule visibly instead of failing on a missing package.
let hasEslint = true;
try { createRequire(import.meta.url)('eslint/package.json'); } catch { hasEslint = false; }
if (hasEslint) {
  const hk = spawnSync('node', ['scripts/check-hooks.mjs', rel], { encoding: 'utf8' });
  if (hk.stdout) process.stdout.write(hk.stdout);
  if (hk.stderr) process.stderr.write(hk.stderr);
  if (hk.status !== 0) problems.push('scripts/check-hooks.mjs red');
} else {
  console.log('check-staging: hook-order check skipped (eslint not installed in this tree)');
}

// ── 3. The filters, parsed by the server that will run them ─────────────
if (!isPublic) {
  const v = spawnSync('node', ['scripts/check-vsql.mjs', rel], { encoding: 'utf8', env: process.env });
  if (v.stdout) process.stdout.write(v.stdout);
  if (v.stderr) process.stderr.write(v.stderr);
  if (v.status !== 0) problems.push('scripts/check-vsql.mjs red');
}

// ── 4. The page, rendered once and walked (flow pages) ───────────────────
// Types and rules never LOOK at a page: five live flows were green through
// every gate and dead-ended on step 1 (24.09.2026). render-smoke bundles the
// staged file, mounts it under #/intents/<slug> against a mocked /rest door
// and presses through to the success page — only where types are green
// (a red tsc makes the bundle error a duplicate).
// The walk needs the shadcn primitives the E2B template ships (src/components/ui);
// a bare generator tree (a local test project) says so instead of failing.
const hasPrimitives = existsSync(resolve('src/components/ui')) || Boolean(process.env.RENDER_SMOKE_ALIASES);
if (!isPublic && problems.length === 0 && hasPrimitives) {
  const sm = spawnSync('node', ['scripts/render-smoke.mjs', '--staged', rel], { encoding: 'utf8', env: process.env, timeout: 240000 });
  if (sm.stdout) process.stdout.write(sm.stdout);
  if (sm.stderr) process.stderr.write(sm.stderr);
  if (sm.status !== 0) problems.push('scripts/render-smoke.mjs red');
} else if (!isPublic && problems.length === 0) {
  console.log('check-staging: rendered walk skipped (no src/components/ui in this tree)');
}

if (problems.length > 0) {
  console.error(`check-staging: ${problems.length} problem(s) in ${rel} — fix them and run this again`);
  process.exit(1);
}
console.log(`check-staging: OK (${rel} — types, page rules${isPublic ? '' : ', server-checked filters and a rendered walk'} green)`);
