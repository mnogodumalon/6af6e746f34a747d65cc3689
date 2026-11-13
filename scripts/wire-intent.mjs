#!/usr/bin/env node
// wire-intent.mjs — deterministic wiring for one intent flow page.
//
// A flow is three things at once (page, route, registry entry — see
// check-intents.mjs). Wiring them used to be five hand-written edits at the
// <custom:*> markers per build; a single slipped marker loses every custom
// route on the next scaffold update. This script is the mechanical version:
// idempotent, marker-safe, and it clears the sidebar's INTENTS_PENDING ghost
// rows in the same pass.
//
// Usage:
//   node scripts/wire-intent.mjs <PageComponent> <slug> <label> <IconName> [description]
//   node scripts/wire-intent.mjs --no-flows
//   node scripts/wire-intent.mjs --remove <PageComponent> <slug>   # quarantine: undo exactly one wire
//   node scripts/wire-intent.mjs <PageComponent> <slug> <label> <IconName> [description] --bare
//                                                                  # route outside the Layout (beamer, kiosk, print)
//
// Examples:
//   node scripts/wire-intent.mjs NeueBuchungPage neue-buchung 'Neue Buchung' IconCalendarPlus 'Buchung in 3 Schritten anlegen'
//   node scripts/wire-intent.mjs --no-flows   # decision gate said skip: only clear the ghost rows
//
// Run it once per flow AFTER src/pages/intents/<PageComponent>.tsx exists;
// check-intents.mjs verifies the result.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const APP = 'src/App.tsx';
const REGISTRY = 'src/config/intents.ts';

function fail(msg) { console.error(`ERROR: ${msg}`); process.exit(1); }

function read(file) {
  if (!existsSync(file)) fail(`${file} not found — run from the project root`);
  return readFileSync(file, 'utf8');
}

function clearPendingFlag(src) {
  return src.replace('export const INTENTS_PENDING = true;', 'export const INTENTS_PENDING = false;');
}

const args = process.argv.slice(2);

if (args[0] === '--no-flows') {
  const src = read(REGISTRY);
  const out = clearPendingFlag(src);
  if (out === src) {
    console.log('wire-intent: INTENTS_PENDING already false — nothing to do');
  } else {
    writeFileSync(REGISTRY, out);
    console.log('wire-intent: INTENTS_PENDING → false (ghost rows cleared, no flows registered)');
  }
  process.exit(0);
}

if (args[0] === '--remove') {
  // Quarantine: undo exactly what one wire did — the three single lines it
  // inserted (lazy import, <Route>, registry entry) plus the icon import and
  // the skeleton import when nothing else uses them. Line-based on purpose:
  // insertBeforeMarker writes each of them as ONE line of its own, so a line
  // filter is the exact inverse. INTENTS_PENDING stays false — a quarantined
  // flow is "not built", not "being built".
  const [, rpage, rslug] = args;
  if (!rpage || !rslug) fail('usage: node scripts/wire-intent.mjs --remove <PageComponent> <slug>');
  if (!/^[A-Z][A-Za-z0-9]*$/.test(rpage)) fail(`'${rpage}' is not a PascalCase component name`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rslug)) fail(`'${rslug}' is not a kebab-case slug`);
  const dropLines = (src, pred) => src.split('\n').filter(l => !pred(l)).join('\n');
  const removed = [];

  let app = read(APP);
  const appBefore = app;
  app = dropLines(app, l => l.includes(`import('@/pages/intents/${rpage}')`));
  app = dropLines(app, l => new RegExp(`<Route\\s+path=["']intents/${rslug}["']`).test(l));
  if (!/<Route\s+path=["']intents\//.test(app) && (app.match(/\bDashboardSkeleton\b/g) || []).length === 1) {
    app = dropLines(app, l => l.includes("from '@/components/DashboardStates'"));
  }
  if (app !== appBefore) { writeFileSync(APP, app); removed.push(`${APP}: import + route of ${rpage} (#/intents/${rslug})`); }

  let reg = read(REGISTRY);
  const regBefore = reg;
  const entryRe = new RegExp(`^\\s*\\{\\s*path: '/intents/${rslug}'`);
  const entryLine = reg.split('\n').find(l => entryRe.test(l));
  reg = dropLines(reg, l => entryRe.test(l));
  const iconUsed = entryLine ? /icon:\s*(Icon[A-Za-z0-9]+)/.exec(entryLine) : null;
  if (iconUsed) {
    const icon = iconUsed[1];
    const outsideImports = reg.split('\n').filter(l => !/^\s*import\s/.test(l)).join('\n');
    if (!new RegExp(`\\b${icon}\\b`).test(outsideImports)) {
      reg = reg.split('\n').map(l => {
        const m = /^(\s*)import \{ ([^}]*) \} from '@tabler\/icons-react';$/.exec(l);
        if (!m) return l;
        const names = m[2].split(',').map(s => s.trim()).filter(n => n && n !== icon);
        return names.length ? `${m[1]}import { ${names.join(', ')} } from '@tabler/icons-react';` : null;
      }).filter(l => l !== null).join('\n');
    }
  }
  if (reg !== regBefore) { writeFileSync(REGISTRY, reg); removed.push(`${REGISTRY}: entry /intents/${rslug}${iconUsed ? ' (+ icon import if unused)' : ''}`); }

  for (const r of removed) console.log(`wire-intent: - ${r}`);
  console.log(`wire-intent: OK (removed ${rpage} ↔ #/intents/${rslug})`);
  process.exit(0);
}

// --bare: the route goes into <custom:bare-routes>, OUTSIDE the dashboard's
// Layout — a beamer view, a kiosk page, a print sheet (S-2, 03.11.2026). The
// registry entry is the same, so the flow list links to it.
const bare = args.includes('--bare');
const [page, slug, label, icon, description] = args.filter(a => a !== '--bare');
if (!page || !slug || !label || !icon) {
  fail('usage: node scripts/wire-intent.mjs <PageComponent> <slug> <label> <IconName> [description]\n' +
       '       node scripts/wire-intent.mjs --no-flows');
}
if (!/^[A-Z][A-Za-z0-9]*$/.test(page)) fail(`'${page}' is not a PascalCase component name`);
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) fail(`'${slug}' is not a kebab-case slug`);
if (!/^Icon[A-Z][A-Za-z0-9]*$/.test(icon)) fail(`'${icon}' is not a Tabler icon name (IconLikeThis)`);

const pageFile = `src/pages/intents/${page}.tsx`;
if (!existsSync(pageFile)) fail(`${pageFile} does not exist — write the page first, then wire it`);

// Registry entries are single-quoted strings.
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Insert `line` directly above the CLOSING marker, reusing its indentation.
// A missing marker fails loudly: the block was overwritten by something, and
// appending anywhere else would be lost the same way on the next update.
function insertBeforeMarker(src, marker, line, file) {
  const at = src.indexOf(marker);
  if (at === -1) fail(`${file}: marker '${marker}' not found — restore the marker block before wiring`);
  const lineStart = src.lastIndexOf('\n', at) + 1;
  const indent = src.slice(lineStart, at);
  if (/\S/.test(indent)) fail(`${file}: marker '${marker}' must start its own line`);
  return src.slice(0, lineStart) + indent + line + '\n' + src.slice(lineStart);
}

const done = [];
const same = [];

// ── src/App.tsx: lazy import + route ───────────────────────────────────────
// The local identifier is ALWAYS `Intent${page}` — never the bare component
// name. A flow page may legitimately share its name with an entity CRUD page
// (live-proven twice: JahresinspektionPlanenPage was both the wish-app's CRUD
// page and the flow page → TS2440, a repair agent per build). The alias makes
// that collision class impossible; the scaffold never emits Intent*-named
// pages, so the alias itself cannot collide.
const ident = `Intent${page}`;

let app = read(APP);
const appBefore = app;

if (app.includes(`@/pages/intents/${page}`)) {
  same.push(`${APP}: import for ${page} already present`);
} else {
  app = insertBeforeMarker(
    app, '// </custom:imports>',
    `const ${ident} = lazy(() => import('@/pages/intents/${page}'));`, APP,
  );
  done.push(`${APP}: lazy import for ${page} (as ${ident})`);
}

// The lazy chunk of a flow used to load behind `fallback={null}` — a white
// page for the whole download. The scaffold's DashboardSkeleton is the
// fallback now; its import lives inside <custom:imports> so a dashboard
// without flows never carries an unused import (tsc noUnusedLocals).
const SKELETON_IMPORT = "import { DashboardSkeleton } from '@/components/DashboardStates';";
if (!app.includes("from '@/components/DashboardStates'")) {
  app = insertBeforeMarker(app, '// </custom:imports>', SKELETON_IMPORT, APP);
  done.push(`${APP}: DashboardSkeleton import (route fallback)`);
}

if (new RegExp(`<Route\\s+path=["']intents/${slug}["']`).test(app)) {
  same.push(`${APP}: route intents/${slug} already present`);
} else {
  app = insertBeforeMarker(
    app, bare ? '{/* </custom:bare-routes> */}' : '{/* </custom:routes> */}',
    `<Route path="intents/${slug}" element={<Suspense fallback={<DashboardSkeleton />}><${ident} /></Suspense>} />`, APP,
  );
  done.push(`${APP}: route intents/${slug}${bare ? ' (bare, outside the Layout)' : ''}`);
}

if (app !== appBefore) writeFileSync(APP, app);

// ── src/config/intents.ts: icon import + registry entry + pending flag ─────
let reg = read(REGISTRY);
const regBefore = reg;

// The doc comment at the top of intents.ts shows the markers WITHOUT the
// leading `//`, so matching on the commented form skips the example block.
const importBlock = /\/\/ <custom:intent-imports>([\s\S]*?)\/\/ <\/custom:intent-imports>/.exec(reg);
if (!importBlock) fail(`${REGISTRY}: marker '// <custom:intent-imports>' not found — restore the marker block before wiring`);

if (new RegExp(`\\b${icon}\\b`).test(importBlock[1])) {
  same.push(`${REGISTRY}: ${icon} already imported`);
} else {
  const tabler = /import \{ ([^}]*) \} from '@tabler\/icons-react';/.exec(importBlock[1]);
  if (tabler) {
    // Merge into the existing tabler import; replace the whole marker block
    // so the doc comment's example import can never be hit instead.
    const mergedBlock = importBlock[0].replace(
      tabler[0], `import { ${tabler[1]}, ${icon} } from '@tabler/icons-react';`,
    );
    reg = reg.replace(importBlock[0], mergedBlock);
  } else {
    reg = insertBeforeMarker(
      reg, '// </custom:intent-imports>',
      `import { ${icon} } from '@tabler/icons-react';`, REGISTRY,
    );
  }
  done.push(`${REGISTRY}: import ${icon}`);
}

const entriesBlock = /\/\/ <custom:intents>([\s\S]*?)\/\/ <\/custom:intents>/.exec(reg);
if (!entriesBlock) fail(`${REGISTRY}: marker '// <custom:intents>' not found — restore the marker block before wiring`);

// Label and description: preferred is a JSON object with both UI languages
// ('{"de":"Neue Buchung","en":"New booking"}'); a plain string stays valid and
// renders unchanged in every language. `literalOf` renders either form.
function literalOf(text, what) {
  if (!text.trim().startsWith('{')) return `'${esc(text)}'`;
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(`${what} looks like JSON but does not parse: ${text}`); }
  const parts = ['de', 'en', 'cs']
    .filter((l) => typeof parsed[l] === 'string' && parsed[l].trim())
    .map((l) => `${l}: '${esc(parsed[l])}'`);
  if (!parts.length) fail(`${what} JSON must carry at least one of de/en/cs: ${text}`);
  return `{ ${parts.join(', ')} }`;
}
// The German (or only) text of a registry literal — what an owner sees, and
// what decides whether a re-wire is a change or a no-op.
function deOf(literal) {
  if (literal === undefined || literal === null) return '';
  const t = literal.trim();
  if (t.startsWith('{')) {
    const m = /\bde:\s*'((?:[^'\\]|\\.)*)'/.exec(t) || /\b(?:en|cs):\s*'((?:[^'\\]|\\.)*)'/.exec(t);
    return m ? m[1] : '';
  }
  return t.replace(/^'|'$/g, '');
}
const labelLiteral = literalOf(label, 'label');
const desc = description ? `, description: ${literalOf(description, 'description')}` : '';
const newEntry = `{ path: '/intents/${slug}', label: ${labelLiteral}, icon: ${icon}${desc} },`;

const existingRe = new RegExp(`^([ \\t]*)\\{\\s*path: '/intents/${slug}'.*$`, 'm');
const existing = existingRe.exec(entriesBlock[1]);
if (existing) {
  // A re-wire of a known slug (the page job's EDIT): the entry is replaced
  // only when what the owner sees changes — label, icon or description. An
  // identical re-wire is a no-op, so the runtime-translated object the i18n
  // step wrote (description: { de, en }) is never overwritten by the plain
  // German string an unchanged edit passes.
  const line = existing[0];
  const field = (name) => {
    const m = new RegExp(`\\b${name}:\\s*(\\{[^}]*\\}|'(?:[^'\\\\]|\\\\.)*')`).exec(line);
    return m ? m[1] : undefined;
  };
  const oldIconMatch = /\bicon:\s*(Icon[A-Za-z0-9]+)/.exec(line);
  const oldIcon = oldIconMatch ? oldIconMatch[1] : undefined;
  const changed =
    deOf(field('label')) !== deOf(labelLiteral) ||
    oldIcon !== icon ||
    (description ? deOf(field('description')) !== deOf(literalOf(description, 'description')) : false);
  if (!changed) {
    same.push(`${REGISTRY}: entry /intents/${slug} already present`);
  } else {
    const updatedBlock = entriesBlock[0].replace(line, `${existing[1]}${newEntry}`);
    reg = reg.replace(entriesBlock[0], updatedBlock);
    done.push(`${REGISTRY}: entry /intents/${slug} updated (label/icon/description)`);
    if (oldIcon && oldIcon !== icon) {
      const entriesNow = /\/\/ <custom:intents>([\s\S]*?)\/\/ <\/custom:intents>/.exec(reg);
      if (entriesNow && !new RegExp(`\\b${oldIcon}\\b`).test(entriesNow[1])) {
        const ib = /\/\/ <custom:intent-imports>([\s\S]*?)\/\/ <\/custom:intent-imports>/.exec(reg);
        if (ib) {
          const cleaned = ib[0]
            .replace(new RegExp(`\\b${oldIcon}\\s*,\\s*`), '')
            .replace(new RegExp(`,\\s*\\b${oldIcon}\\b`), '')
            .replace(new RegExp(`^import \\{\\s*${oldIcon}\\s*\\} from '@tabler/icons-react';\\n?`, 'm'), '');
          if (cleaned !== ib[0]) {
            reg = reg.replace(ib[0], cleaned);
            done.push(`${REGISTRY}: import ${oldIcon} dropped (unused)`);
          }
        }
      }
    }
  }
} else {
  reg = insertBeforeMarker(reg, '// </custom:intents>', newEntry, REGISTRY);
  done.push(`${REGISTRY}: entry /intents/${slug}`);
}

const flipped = clearPendingFlag(reg);
if (flipped !== reg) {
  reg = flipped;
  done.push(`${REGISTRY}: INTENTS_PENDING → false`);
}

if (reg !== regBefore) writeFileSync(REGISTRY, reg);

for (const d of done) console.log(`wire-intent: + ${d}`);
for (const s of same) console.log(`wire-intent: = ${s}`);
console.log(`wire-intent: OK (${page} ↔ #/intents/${slug})`);
