#!/usr/bin/env node
/**
 * check-hub.mjs — build gate for hub-and-spoke completeness.
 *
 * When the schema has a HUB entity (≥3 applookup edges pointing at it), its
 * dashboard overlay MUST make every satellite reachable as a <SatelliteSection>
 * (which bakes in the "+" and the row-click-opens-detail mechanics). Loop
 * history: the agent repeatedly wired only some satellites ("kann nur Mängel
 * hinzufügen") or none. Runs before `npm run build`.
 *
 * TWO ways satisfy it, because there are two correct ways to build the body:
 *   1. Compose the pre-generated <{Hub}Details> block — it already renders one
 *      SatelliteSection per incoming edge, plus the record's field details.
 *      This is the cheap, preferred path.
 *   2. Hand-render the sections in DashboardOverview.tsx itself.
 * Until 2026-08 the gate accepted only (2): it counted `<SatelliteSection` in
 * DashboardOverview.tsx alone, so an overlay that correctly composed
 * <{Hub}Details> failed. Two live builds reacted by re-generating the whole page
 * and hand-rebuilding the field list — ~90s of output tokens each, and the hub
 * overlay lost its Stammdaten. Counting inside the Details file lets (1) pass on
 * its own terms.
 *
 * HUBS is embedded from the schema: hub entity -> { component, file, satellites }.
 * `satellites` has one entry per applookup EDGE (an entity pointing twice counts
 * twice) — the Details block renders per edge too, so the numbers are comparable.
 */
import { existsSync, readFileSync } from 'node:fs';

const HUBS = {};

const hubKeys = Object.keys(HUBS);
if (hubKeys.length === 0) {
  console.log('check-hub: no hub entity in schema — skipped');
  process.exit(0);
}

const OVERVIEW = 'src/pages/DashboardOverview.tsx';
let src;
try {
  src = readFileSync(OVERVIEW, 'utf8');
} catch {
  console.error(`ERROR: ${OVERVIEW} not found.`);
  process.exit(1);
}

const countSections = s => (s.match(/<SatelliteSection/g) || []).length;
const inOverview = countSections(src);

const errors = [];
const resolved = [];

for (const [hub, spec] of Object.entries(HUBS)) {
  const need = spec.satellites.length;
  const names = [...new Set(spec.satellites)].join(', ');

  // Path 0 — the page uses the EntityCrud scaffold: its generated host
  // renders <{Hub}Details> for every entity by construction, so the literal
  // never appears in DashboardOverview.tsx. Without this path the gate would
  // hard-fail every hub app built on EntityCrud. Coverage is still verified
  // where the sections live (the Details file), same as path 1.
  if (/\buseEntityCrud\s*\(/.test(src) && existsSync(spec.file)) {
    const inBlock = countSections(readFileSync(spec.file, 'utf8'));
    if (inBlock + inOverview >= need) {
      resolved.push(`${hub} via useEntityCrud() host`);
      continue;
    }
  }

  // Path 1 — the overlay composes the generated block. Verify the coverage
  // where the sections actually live instead of demanding a literal copy here.
  if (new RegExp(`<${spec.component}\\b`).test(src)) {
    if (existsSync(spec.file)) {
      const inBlock = countSections(readFileSync(spec.file, 'utf8'));
      if (inBlock + inOverview >= need) {
        resolved.push(`${hub} via <${spec.component}>`);
        continue;
      }
      errors.push(
        `Hub '${hub}' needs ${need} satellite section(s) (${names}), but <${spec.component}> renders ${inBlock} ` +
        `and ${OVERVIEW} adds ${inOverview}. ${spec.file} is generated — do NOT edit it; if one satellite is ` +
        `genuinely missing there, render that ONE <SatelliteSection> in the overlay body.`
      );
      continue;
    }
    // Scaffold file gone — fall through to the literal count rather than
    // failing on a path problem (check-icons policy: unsure → don't block).
    console.warn(`WARN: ${spec.file} not found — counting sections in ${OVERVIEW} instead.`);
  }

  // Path 2 — hand-rendered sections in the overview.
  if (inOverview >= need) {
    resolved.push(`${hub} via ${inOverview} hand-wired section(s)`);
    continue;
  }
  errors.push(
    `Hub '${hub}' has ${need} satellite relation(s) (${names}) but its overlay covers ${inOverview}. ` +
    `CHEAPEST FIX — one line, no rewrite: render <${spec.component} record={rec} …/> in the hub's overlay branch. ` +
    `That generated block already carries one SatelliteSection per satellite AND the record's field details; ` +
    `its props are in the cheatsheet. Hand-rendering a <SatelliteSection> per satellite also passes — but never ` +
    `do both, the sections then render twice.`
  );
}

if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(
    `\n${errors.length} hub-completeness error(s) — compose the generated <{Hub}Details> block ` +
    `(preferred) or render a <SatelliteSection> per satellite.`
  );
  process.exit(1);
}
console.log(`check-hub: OK (${resolved.join('; ')})`);
