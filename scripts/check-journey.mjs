#!/usr/bin/env node
// check-journey.mjs — are the agent's journey decisions consistent with the app
// metadata? (1) the occupancy decision in src/config/journey.ts, (2) the
// required-field sentences in src/lib/journey/messages.ts.
//
// The decision itself (stay or not, which field is the resource, which
// statuses do not occupy) is the build agent's; this gate checks only FORM:
// every entity exists, from/to are date fields, the resource is an applookup
// or a single lookup (a place number),
// the status field is a lookup and its free keys are real options. A typo
// here would silently disable the calendar on both doors.
import { existsSync, readFileSync } from 'node:fs';

const FILE = 'src/config/journey.ts';
const METADATA = 'app_metadata.json';
const errors = [];

if (!existsSync(FILE)) {
  console.log('check-journey: OK (no journey config)');
  process.exit(0);
}
const src = readFileSync(FILE, 'utf8');
const block = /\/\/ <custom:occupancy>([\s\S]*?)\/\/ <\/custom:occupancy>/.exec(src);
if (!block) {
  errors.push(`${FILE}: the <custom:occupancy> marker block is missing — restore it (the scaffold owns the file outside the markers)`);
}

let apps = {};
if (existsSync(METADATA)) {
  try {
    apps = JSON.parse(readFileSync(METADATA, 'utf8')).apps ?? {};
  } catch (e) {
    errors.push(`${METADATA}: not valid JSON (${e.message})`);
  }
}

const entryRe = /^\s*['"]?([a-z0-9_]+)['"]?\s*:\s*\{([^}]*)\}\s*,?\s*$/gm;
const str = (body, key) => {
  const m = new RegExp(`\\b${key}\\s*:\\s*['"]([^'"]+)['"]`).exec(body);
  return m ? m[1] : undefined;
};
const list = (body, key) => {
  const m = new RegExp(`\\b${key}\\s*:\\s*\\[([^\\]]*)\\]`).exec(body);
  return m ? [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]) : undefined;
};

const seen = new Set();
if (block) {
  for (const m of block[1].matchAll(entryRe)) {
    const [, entity, body] = m;
    if (seen.has(entity)) errors.push(`${FILE}: '${entity}' is declared twice`);
    seen.add(entity);
    const app = apps[entity];
    if (Object.keys(apps).length && !app) {
      errors.push(`${FILE}: unknown entity '${entity}' — the keys are: ${Object.keys(apps).join(', ')}`);
      continue;
    }
    const controls = app?.controls ?? {};
    const isDate = k => String(controls[k]?.fulltype ?? '').startsWith('date');
    const from = str(body, 'from');
    const to = str(body, 'to');
    const resource = str(body, 'resource');
    const statusField = str(body, 'statusField');
    const freeKeys = list(body, 'freeKeys');
    if (!from || !to) errors.push(`${FILE}: '${entity}' needs both from: and to:`);
    if (from === to) errors.push(`${FILE}: '${entity}' uses the same field for from and to`);
    if (Object.keys(controls).length) {
      for (const k of [from, to].filter(Boolean)) {
        if (!controls[k]) errors.push(`${FILE}: '${entity}.${k}' is not a field of the entity`);
        else if (!isDate(k)) errors.push(`${FILE}: '${entity}.${k}' is ${controls[k].fulltype}, not a date field`);
      }
      if (resource !== undefined) {
        if (!controls[resource]) errors.push(`${FILE}: '${entity}.${resource}' (resource) is not a field of the entity`);
        else if (!/^(applookup|lookup\/)/.test(String(controls[resource].fulltype ?? ''))) {
          errors.push(`${FILE}: '${entity}.${resource}' (resource) is ${controls[resource].fulltype} — the resource must be an applookup or a single lookup field`);
        }
      }
      if (statusField !== undefined) {
        const ctrl = controls[statusField];
        if (!ctrl) errors.push(`${FILE}: '${entity}.${statusField}' (statusField) is not a field of the entity`);
        else if (!String(ctrl.fulltype ?? '').startsWith('lookup/')) {
          errors.push(`${FILE}: '${entity}.${statusField}' (statusField) is ${ctrl.fulltype} — must be a lookup field`);
        } else {
          const keys = Object.keys(ctrl.lookup_data ?? {});
          for (const k of freeKeys ?? []) {
            if (!keys.includes(k)) errors.push(`${FILE}: '${entity}.${statusField}' has no option '${k}' — the keys are: ${keys.join('|')}`);
          }
        }
      }
      if ((freeKeys?.length ?? 0) > 0 && statusField === undefined) {
        errors.push(`${FILE}: '${entity}' lists freeKeys without a statusField`);
      }
    }
  }
}

// ── Required-field sentences ────────────────────────────────────────────────
// The sentences are the agent's; this checks FORM only: the block exists, every
// entity and field is real. A required field WITHOUT a sentence is reported as
// a note (the label sentence covers it) — never an error, a rewrite for wording
// is not worth a build cycle.
const MESSAGES = 'src/lib/journey/messages.ts';
let sentences = 0;
let uncovered = [];
if (existsSync(MESSAGES)) {
  const msrc = readFileSync(MESSAGES, 'utf8');
  const mblock = /\/\/ <custom:messages>([\s\S]*?)\/\/ <\/custom:messages>/.exec(msrc);
  if (!mblock) {
    errors.push(`${MESSAGES}: the <custom:messages> marker block is missing — restore it (the scaffold owns the file outside the markers)`);
  } else {
    const covered = new Map();
    for (const line of mblock[1].split('\n')) {
      const em = /^\s*['"]?([a-z0-9_]+)['"]?\s*:\s*\{(.*)\},?\s*$/.exec(line);
      if (!em) continue;
      const [, entity, body] = em;
      const app = apps[entity];
      if (Object.keys(apps).length && !app) {
        errors.push(`${MESSAGES}: unknown entity '${entity}' — the keys are: ${Object.keys(apps).join(', ')}`);
        continue;
      }
      const controls = app?.controls ?? {};
      const keys = new Set();
      for (const fm of body.matchAll(/(?:^|[{,])\s*([a-z][a-z0-9_]*)\s*:\s*"/g)) {
        const key = fm[1];
        if (Object.keys(controls).length && !controls[key]) {
          errors.push(`${MESSAGES}: '${entity}.${key}' is not a field of the entity — the fields are: ${Object.keys(controls).join(', ')}`);
          continue;
        }
        keys.add(key);
        sentences++;
      }
      covered.set(entity, keys);
    }
    for (const [entity, app] of Object.entries(apps)) {
      for (const [key, ctrl] of Object.entries(app.controls ?? {})) {
        if (ctrl.required && !String(ctrl.fulltype ?? '').startsWith('file') && !covered.get(entity)?.has(key)) uncovered.push(`${entity}.${key}`);
      }
    }
  }
}

if (errors.length) {
  console.error('check-journey: FAILED');
  for (const e of errors) console.error(`  ERROR: ${e}`);
  process.exit(1);
}
if (uncovered.length) {
  console.log(`check-journey: note — ${uncovered.length} required field(s) without an own sentence (label sentence applies): ${uncovered.join(', ')}`);
}
console.log(`check-journey: OK (${seen.size} occupancy rule(s), ${sentences} field sentence(s))`);
