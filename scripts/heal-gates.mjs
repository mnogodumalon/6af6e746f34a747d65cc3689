#!/usr/bin/env node
// heal-gates — mechanical repairs for the two check-intents rules whose fix is
// deterministic, run BEFORE the gates so a model never has to "repair" them:
//
//   3i  a page renders `step === N` for an N it never declared in `steps`
//       → append the missing `{ label }` entries (the last one is "Prüfen"
//         when that step renders <SummaryStep>, else "Schritt N").
//   3h  a bound control (`{...f.field('x')}` & co.) sits under no <Field>
//       → wrap the single-line / self-closing element in
//         <Field form={f} name="x"> … </Field> and import Field.
//
// Why a script and not the repair agent: two live runs in a row the agent
// either "fixed" 3j with the wrong fields or reported success while changing
// nothing — 170 s each. These two classes are pure text surgery; anything the
// heuristics below cannot place with certainty is left untouched, the gate
// reports it, and the agent gets only what really needs a mind.
//
// Never fails the build: exit code 0 always. Prints one line per heal.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'src/pages/intents';
const FIELD_IMPORT = "import { Field } from '@/components/blocks/Field';";

const pages = existsSync(DIR)
  ? readdirSync(DIR).filter(f => /\.tsx$/.test(f))
  : [];

const notes = [];
let changed = 0;

for (const name of pages) {
  const file = join(DIR, name);
  const before = readFileSync(file, 'utf8');
  let src = before;
  src = healSteps(src, file);
  src = healLabels(src, file);
  if (src !== before) {
    writeFileSync(file, src);
    changed++;
  }
}

for (const n of notes) console.log(`heal-gates: ${n}`);
console.log(`heal-gates: ${changed} file(s) changed, ${pages.length} scanned`);

// ── 3i: declared steps vs. rendered steps ───────────────────────────────

function healSteps(src, file) {
  // Same two shapes check-intents 3i accepts: an inline `steps={[ … ]}` or a
  // `const STEPS: WizardStep[] = [ … ];` literal.
  const inline = /steps=\{\s*\[([\s\S]*?)\]\s*\}/.exec(src);
  const named = inline ? null : /const\s+\w+(?:\s*:\s*WizardStep\[\])?\s*=\s*\[([\s\S]*?\blabel\b[\s\S]*?)\];/.exec(src);
  const m = inline || named;
  if (!m) return src;

  const declared = (m[1].match(/\blabel\s*:/g) || []).length;
  let rendered = 0;
  for (const r of src.matchAll(/\b(?:step|currentStep|activeStep)\s*===\s*(\d+)/g)) {
    rendered = Math.max(rendered, Number(r[1]));
  }
  if (declared === 0 || rendered <= declared) return src;

  const usesTx = /import\s*\{[^}]*\btx\b[^}]*\}\s*from\s*['"]@\/i18n['"]/.test(src);
  const label = text => (usesTx ? `tx('${text}')` : `'${text}'`);

  const entries = [];
  for (let n = declared + 1; n <= rendered; n++) {
    // What does that step render? A review step is called "Prüfen".
    const at = src.search(new RegExp(`\\b(?:step|currentStep|activeStep)\\s*===\\s*${n}\\b`));
    const window = at >= 0 ? src.slice(at, at + 600) : '';
    const text = /<SummaryStep\b/.test(window) ? 'Prüfen' : `Schritt ${n}`;
    entries.push(`{ label: ${label(text)} }`);
  }

  // Insert before the `]` that closes the literal, honouring a trailing comma.
  const literalStart = m.index + m[0].indexOf('[');
  const closeRel = m[0].lastIndexOf(']');
  const closeAbs = m.index + closeRel;
  const body = src.slice(literalStart + 1, closeAbs);
  const sep = /,\s*$/.test(body) ? ' ' : ', ';
  src = src.slice(0, closeAbs) + sep + entries.join(', ') + ' ' + src.slice(closeAbs);
  notes.push(`${file}: declared ${declared} step(s) but renders ${rendered} — appended ${entries.join(', ')} (3i)`);
  return src;
}

// ── 3h: bound controls without a label ──────────────────────────────────

function healLabels(src, file) {
  // form.kind('key') → the keys check-intents 3h will ask a label for.
  const bound = [];
  for (const b of src.matchAll(/\b([A-Za-z_$][\w$]*)\.(field|number|date|choice|checkbox|record|records)\(\s*['"]([\w]+)['"]/g)) {
    bound.push({ form: b[1], kind: b[2], key: b[3] });
  }
  const seen = new Set();
  let lines = src.split('\n');
  let touched = false;

  for (const { form, kind, key } of bound) {
    if (seen.has(key)) continue;
    seen.add(key);
    const labelled = new RegExp(`<Field\\b[^>]*\\bname=["']${key}["']`).test(src)
      || new RegExp(`htmlFor=\\{[^}]*fieldId\\(\\s*['"]${key}['"]`).test(src);
    if (labelled) continue;

    // The element that carries the spread: starts on a line of its own
    // (`<Tag`), ends at the first `/>` within a few lines, and no other tag
    // opens in between. Anything else is left to the gate + agent.
    const spreadRe = new RegExp(`\\{\\.\\.\\.${form}\\.${kind}\\(\\s*['"]${key}['"]`);
    const li = lines.findIndex(l => spreadRe.test(l));
    if (li < 0) continue;
    let start = li;
    while (start >= 0 && !/^\s*<[A-Z][\w.]*/.test(lines[start])) {
      if (li - start > 3 || /\/>|<\//.test(lines[start])) { start = -1; break; }
      start--;
    }
    if (start < 0) { notes.push(`${file}: '${key}' has no label and no self-contained element to wrap — left for the gate (3h)`); continue; }
    let end = -1;
    for (let k = start; k < Math.min(lines.length, start + 12); k++) {
      if (k > start && /^\s*<[A-Za-z]/.test(lines[k])) break;   // another element opens first
      if (/\/>\s*$/.test(lines[k])) { end = k; break; }
    }
    if (end < 0) { notes.push(`${file}: '${key}' has no label and its element does not self-close nearby — left for the gate (3h)`); continue; }

    const indent = (lines[start].match(/^\s*/) || [''])[0];
    const inner = lines.slice(start, end + 1).map(l => '  ' + l);
    lines.splice(start, end - start + 1,
      `${indent}<Field form={${form}} name="${key}">`,
      ...inner,
      `${indent}</Field>`,
    );
    src = lines.join('\n');
    touched = true;
    notes.push(`${file}: wrapped {...${form}.${kind}('${key}')} in <Field form={${form}} name="${key}"> (3h)`);
  }

  if (touched && !/import\s*\{[^}]*\bField\b[^}]*\}\s*from\s*['"]@\/components\/blocks\/Field['"]/.test(src)) {
    // After the last import line, so the module stays valid.
    const importLines = lines.map((l, i) => (/^import\s/.test(l) ? i : -1)).filter(i => i >= 0);
    const at = importLines.length ? importLines[importLines.length - 1] + 1 : 0;
    lines.splice(at, 0, FIELD_IMPORT);
    src = lines.join('\n');
  }
  return src;
}
