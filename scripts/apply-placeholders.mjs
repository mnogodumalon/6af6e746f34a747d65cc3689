#!/usr/bin/env node
// Apply Form-Polish Sub-Agent's placeholder suggestions to dialog files.
//
// Reads `.placeholder-suggestions.json` (written by the form-polish sub-agent)
// and rewrites every `placeholder=""` next to a matching `id="<key>"` to the
// suggested string. Works for Input, Textarea, Combobox, DatePicker, and
// `<SelectValue placeholder="" />` patterns — anything where `placeholder=""`
// appears within ~500 chars after `id="<key>"`.
//
// Runs in the sandbox BEFORE `parse-formulas.mjs` and `npm run build`. Idempotent:
// if a placeholder is already filled (no empty `placeholder=""` near the id),
// the entry is silently skipped.

import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const SUGGESTIONS_FILE = '.placeholder-suggestions.json';
const DIALOGS_DIR = 'src/components/dialogs';

// JSX attribute values are single-line strings — strip quotes/newlines and cap
// length so a malformed suggestion can't break the build.
function sanitize(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/"/g, '')      // " breaks the JSX attribute
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Match every empty `placeholder=""` and pair it with the nearest PRECEDING
// `id="<key>"` (within ~200 chars — typical JSX field width). This is more
// robust than scanning forward from each id, because fields without a
// placeholder slot (like `string/phone`) would otherwise let a forward scan
// leak into the next field's placeholder.
const ID_PATTERN = /id="([a-z_][a-z0-9_]*)"/gi;
const EMPTY_PLACEHOLDER_PATTERN = /placeholder=""/g;
const MAX_BACKSCAN = 250;

function applyAll(src, fieldMap) {
  // Index every `id="..."` occurrence (offset → key).
  const idHits = [];
  for (const m of src.matchAll(ID_PATTERN)) {
    idHits.push({ offset: m.index, key: m[1] });
  }
  // For each empty placeholder slot, find the closest preceding id within range.
  const replacements = [];
  for (const m of src.matchAll(EMPTY_PLACEHOLDER_PATTERN)) {
    const slotStart = m.index;
    let owner = null;
    for (let i = idHits.length - 1; i >= 0; i--) {
      if (idHits[i].offset >= slotStart) continue;
      if (slotStart - idHits[i].offset > MAX_BACKSCAN) break;
      owner = idHits[i].key;
      break;
    }
    if (!owner) continue;
    const clean = sanitize(fieldMap[owner]);
    if (!clean) continue;
    replacements.push({ start: slotStart, end: slotStart + m[0].length, replacement: `placeholder="${clean}"`, key: owner });
  }
  if (replacements.length === 0) return { src, applied: 0, keys: [] };
  // Apply replacements right-to-left so earlier offsets stay valid.
  replacements.sort((a, b) => b.start - a.start);
  let out = src;
  for (const r of replacements) {
    out = out.slice(0, r.start) + r.replacement + out.slice(r.end);
  }
  return { src: out, applied: replacements.length, keys: replacements.map(r => r.key) };
}

async function fileExists(path) {
  try { await access(path); return true; } catch { return false; }
}

async function main() {
  if (!await fileExists(SUGGESTIONS_FILE)) {
    console.log(`[apply-placeholders] no ${SUGGESTIONS_FILE} — nothing to do`);
    return;
  }

  let suggestions;
  try {
    suggestions = JSON.parse(await readFile(SUGGESTIONS_FILE, 'utf8'));
  } catch (err) {
    console.warn(`[apply-placeholders] cannot parse ${SUGGESTIONS_FILE}: ${err.message}`);
    return;
  }

  let totalApplied = 0, totalSkipped = 0, touched = 0;
  for (const [dialogName, fields] of Object.entries(suggestions)) {
    if (!dialogName.endsWith('.tsx') || !fields || typeof fields !== 'object') continue;
    const path = join(DIALOGS_DIR, dialogName);
    let src;
    try { src = await readFile(path, 'utf8'); }
    catch (err) { console.warn(`[apply-placeholders] skip ${dialogName}: ${err.message}`); continue; }

    const res = applyAll(src, fields);
    const offered = Object.keys(fields).length;
    const skipped = offered - res.applied;
    if (res.applied > 0) {
      await writeFile(path, res.src, 'utf8');
      touched++;
    }
    totalApplied += res.applied;
    totalSkipped += skipped;
    console.log(`[apply-placeholders] ${dialogName}: ${res.applied} applied, ${skipped} skipped`);
  }
  console.log(`[apply-placeholders] done — ${touched} files, ${totalApplied} placeholders applied, ${totalSkipped} skipped`);
}

main().catch(err => { console.error('[apply-placeholders] fatal:', err); process.exit(0); });
