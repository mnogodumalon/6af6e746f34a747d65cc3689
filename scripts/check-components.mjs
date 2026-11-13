#!/usr/bin/env node
// Gate: fan-out components under src/components/custom/ keep their contract.
//
// These files are agent-designed custom UI, generated in parallel lanes while
// the Overview was written against a DICTATED props interface (see
// .components-manifest.json). The gate checks the seam mechanically:
//   1. presentational only — the same FORBIDDEN list as check-blocks (data
//      arrives via props, interaction leaves via callbacks)
//   2. no toISOString() — file-wide and context-free, same rule as the
//      dashboard/intents gates (UTC day-shift class)
//   3. the manifest contract holds: a component the manifest reports ok must
//      exist, export `interface {Name}Props` and export {Name} by NAME (the
//      page imports it by name out of `@/components/custom/{Name}`)
// A spot-check, not a proof — tsc proves the actual composition afterwards.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = 'src/components/custom';
const MANIFEST = '.components-manifest.json';

const FORBIDDEN = [
  '@/services/livingAppsService',
  '@/lib/publicClient',
  // module no longer exists (assistant moved into <la-klar-assistant>) — kept so
  // stale copies in updated old repos can never sneak back in
  '@/lib/actions-agent',
  '@/hooks/useDashboardData',
  '@/lib/enrich',
];

// Comment-blind scanning (same lesson as the other gates): a rule quoted in
// a comment must not trip the gate. Layout-preserving so line numbers hold.
function stripCommentsKeepLayout(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length));
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
  }
  return files;
}

let manifest = { components: [] };
if (existsSync(MANIFEST)) {
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  } catch {
    /* tolerated — the manifest checks below just skip */
  }
}
const manifestByFile = new Map(
  (manifest.components || []).map((c) => [c.file, c])
);

const dirExists = existsSync(ROOT);
if (!dirExists && manifestByFile.size === 0) {
  console.log('check-components: OK (no custom components)');
  process.exit(0);
}

const errors = [];
const warnings = [];
let scanned = 0;

const IMPORT_RE = /^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm;

const files = dirExists ? walk(ROOT) : [];
for (const file of files) {
  scanned++;
  const raw = readFileSync(file, 'utf8');
  const src = stripCommentsKeepLayout(raw);
  const name = basename(file).replace(/\.(tsx?|jsx?)$/, '');

  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1];
    if (FORBIDDEN.some((f) => spec === f || spec.startsWith(f + '/'))) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(
        `${file}:${line}: imports '${spec}' — custom components are presentational (props in, callbacks out); move data access into the page`
      );
    }
  }

  const iso = /\btoISOString\s*\(/.exec(src);
  if (iso) {
    const line = src.slice(0, iso.index).split('\n').length;
    errors.push(
      `${file}:${line}: toISOString() found — use date-fns format() (toISOString is UTC; the day flips at the wrong hour)`
    );
  }

  // Tone words are PROPS, not CSS colors: the theme defines no success/
  // warning/danger/info color, so Tailwind generates NOTHING for these
  // classes and the element renders unstyled (a live heatmap shipped with
  // every trained day invisible — the JS carried bg-success/30, the CSS had
  // no rule for it).
  const PHANTOM_TONE_RE = /\b(?:bg|text|border|ring|fill|stroke)-(?:success|warning|danger|info)(?:\/\d+)?\b/g;
  let tone;
  while ((tone = PHANTOM_TONE_RE.exec(src)) !== null) {
    const line = src.slice(0, tone.index).split('\n').length;
    errors.push(
      `${file}:${line}: '${tone[0]}' — this color does not exist in the theme (tone words are widget PROPS, not CSS classes); the class silently renders NOTHING. Use the real palette (emerald for success, amber for warning) or the primary/destructive/muted tokens.`
    );
  }

  if (/export\s+default\b/.test(src)) {
    errors.push(
      `${file}: has a default export — the page imports by NAME: export function ${name}(…) / export interface ${name}Props`
    );
  }

  const propsRe = new RegExp(`export\\s+(?:interface|type)\\s+${name}Props\\b`);
  if (!propsRe.test(src)) {
    errors.push(
      `${file}: does not export '${name}Props' — the page composes against exactly that interface`
    );
  }
  const namedRe = new RegExp(
    `export\\s+(?:function\\s+${name}\\b|const\\s+${name}\\b|\\{[^}]*\\b${name}\\b[^}]*\\})`
  );
  if (!namedRe.test(src)) {
    errors.push(
      `${file}: does not export '${name}' by name — required for import { ${name} } from '@/components/custom/${name}'`
    );
  }

  if (!/^\s*\/\*\*/.test(raw)) {
    warnings.push(`${file}: missing leading /** … */ docblock (purpose + one line per prop)`);
  }
  if (!manifestByFile.has(file)) {
    warnings.push(`${file}: not in ${MANIFEST} — hand-written after the join? The contract rules above still apply.`);
  }
}

// Manifest says ok, but the file is gone: the page imports a ghost.
for (const [file, entry] of manifestByFile) {
  if (entry.ok && !files.includes(file)) {
    errors.push(`${file}: manifest reports ok but the file does not exist — re-brief it via build_components or remove its import from the page`);
  }
}

for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n${errors.length} error(s) — fix the flagged lines and re-run.`);
  process.exit(1);
}
console.log(`check-components: OK (${scanned} files scanned${warnings.length ? `, ${warnings.length} warning(s)` : ''})`);
