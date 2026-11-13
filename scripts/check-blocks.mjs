#!/usr/bin/env node
// Gate: blocks under src/components/blocks/ must stay presentational.
//
// Blocks are the shared UI vocabulary between intent UIs (authenticated,
// livingAppsService) and public pages (anonymous, publicClient). A block
// that imports a data client is chained to one side of that auth boundary
// and silently breaks the other — so data access is banned here entirely:
// props in, callbacks out.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src/components/blocks';

// Import specifiers that mean "this block talks to a backend".
const FORBIDDEN = [
  '@/services/livingAppsService',
  '@/lib/publicClient',
  // module no longer exists (assistant moved into <la-klar-assistant>) — kept so
  // stale copies in updated old repos can never sneak back in
  '@/lib/actions-agent',
  '@/hooks/useDashboardData',
  '@/lib/enrich',
  // The two doors of the journey port. A block takes `port: JourneyPort` as a
  // prop — the PAGE picks the door; a block that imports one is bound to it.
  '@/services/journeyPort',
  '@/lib/journey/publicPort',
];

if (!existsSync(ROOT)) {
  console.log('check-blocks: OK (no blocks directory)');
  process.exit(0);
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

const IMPORT_RE = /^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm;
const errors = [];
let scanned = 0;

for (const file of walk(ROOT)) {
  scanned++;
  const src = readFileSync(file, 'utf8');
  let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1];
    if (FORBIDDEN.some(f => spec === f || spec.startsWith(f + '/'))) {
      const line = src.slice(0, m.index).split('\n').length;
      errors.push(`${file}:${line}: block imports '${spec}' — blocks are presentational (props in, callbacks out); move data access into the page`);
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  process.exit(1);
}
console.log(`check-blocks: OK (${scanned} files scanned)`);
