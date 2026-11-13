#!/usr/bin/env node
// Mechanical healer for the record-shape TS error classes (run BEFORE
// `npm run build`: `node scripts/heal-tsc.mjs && node scripts/i18n-tx.mjs wrap && npm run build`).
//
// The generated data model has one rigid shape: record fields live under
// `.fields`, resolved lookup names live as extras on the Enriched* types
// (src/types/enriched.ts), write payloads take `undefined` — never `null`.
// Live builds keep slipping on exactly these spots, all provable — so they
// are pipeline input, not repair tasks:
//
//   A. TS2339 `auftrag.auftragsnummer` where the field lives on
//      `auftrag.fields.auftragsnummer` — the missing `.fields.` prefix.
//      Fix: insert `fields.` before the property name (works for `?.` too).
//   B. TS2339 `record: RechnungsPdfErstellen` in a type-literal member while
//      the body reads the Enriched-only field (`p.rechnungName`) — the raw
//      type where the data flowing in is enriched. Fix: retype the `record:`
//      member(s) to the Enriched* type and ensure its import.
//   C. TS2322 `{ status: prev ?? null }` in a service-call payload — the
//      field type wants `undefined`, never `null` (live: two undo paths cost
//      ~40s). Fix: `?? null` → `?? undefined`, only when the reported target
//      type accepts undefined and rejects null.
//   D. TS2367 `top.type === 'belegung_buchungen'` against an OverlayItem union
//      that spells its keys camelCase. Two sources: a page written before
//      0.0.326 (when the discriminant WAS the snake_case identifier) that an
//      Update pulled the new scaffold under, and an agent falling back to the
//      identifier out of habit. Fix: rewrite the literal to the union member
//      it matches once `_` and case are ignored — only when exactly one
//      member matches, and only for a literal the union does not already
//      contain.
//   E. TS2503 `icon: JSX.Element` — under `react-jsx` there is no global
//      JSX namespace (live: one intent page cost a whole repair-agent
//      round). Fix: rewrite the type to `React.ReactElement` and ensure a
//      default React import — the exact rewrite the repair agent performed.
//      Only `JSX.Element`; any other `JSX.*` stays for the agent.
//   F. TS5076 `dKey || COLUMNS[…]?.key ?? ''` — `??` may not be mixed
//      unparenthesized with `||`/`&&`. Fix: parenthesize the mixed child of
//      the flagged expression AS TSC PARSED IT — zero semantic change, the
//      grammar error disappears.
//   G. TS2783 `{ schichttypId, bereich, ...plan }` — a property written
//      BEFORE a spread that provably carries the same key; the spread wins,
//      the explicit member is dead code (live: a fan-out intent page passed
//      its own gate and turned the i18n rebuild red). Fix: drop the flagged
//      member — zero semantic change. Only when its value cannot have side
//      effects (identifier, member chain, literal, shorthand); a call or
//      `await` there stays for the agent.
//   H. TS2305/TS2724 `import { lookupOption } from '@/lib/formatters'` — a
//      scaffold export imported from the wrong module (live: the WRITE
//      helper appended to the formatters import, two lines under the comment
//      forbidding it — one repair edit). Fix: drop the name from that import
//      and import it from its real home (EXPORT_HOME, generated). Only names
//      the map knows; anything else stays for the agent.
//
// A/B only apply when the property PROVABLY exists at the target (parsed
// from the generated src/types/app.ts + src/types/enriched.ts) — no
// guessing, and everything else in the tsc output is passed through
// verbatim for the agent. A rewrite is only written out if it re-parses.
// `remaining` in the report counts ALL open tsc errors — a build failing on
// something this script cannot heal must never read as "0 remaining" (live:
// a TS2774-only failure printed remaining:0 above the real error).
//
//   default              — run tsc, fix, re-run tsc; exit 0 iff clean.
//   --errors-file <f>    — test mode: read tsc output from <f>, apply fixes,
//                          print the report, exit 0 (no tsc runs;
//                          remaining: -1 = unknown, nothing re-ran).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
// typescript is CJS; default-import interop breaks on some node/ts combos.
const ts = createRequire(import.meta.url)('typescript');

const APP_TYPES = 'src/types/app.ts';
const ENRICHED_TYPES = 'src/types/enriched.ts';

// ── Generated type shapes ───────────────────────────────────────────

function sourceFile(path) {
  return ts.createSourceFile(
    path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

// app.ts: `export interface X { …; fields: { a?: …; b?: … }; }`
function parseRecordFields() {
  const byType = new Map();
  if (!existsSync(APP_TYPES)) return byType;
  const sf = sourceFile(APP_TYPES);
  for (const stmt of sf.statements) {
    if (!ts.isInterfaceDeclaration(stmt)) continue;
    for (const member of stmt.members) {
      if (
        ts.isPropertySignature(member) && member.name.getText(sf) === 'fields' &&
        member.type && ts.isTypeLiteralNode(member.type)
      ) {
        const names = new Set(
          member.type.members
            .filter((m) => ts.isPropertySignature(m))
            .map((m) => m.name.getText(sf)),
        );
        byType.set(stmt.name.text, names);
      }
    }
  }
  return byType;
}

// enriched.ts: `export type EnrichedX = X & { extraA: string; … };`
function parseEnriched() {
  const extras = new Map();   // EnrichedX -> Set(extraNames)
  const base = new Map();     // EnrichedX -> X
  const byBase = new Map();   // X -> EnrichedX
  if (!existsSync(ENRICHED_TYPES)) return { extras, base, byBase };
  const sf = sourceFile(ENRICHED_TYPES);
  for (const stmt of sf.statements) {
    if (!ts.isTypeAliasDeclaration(stmt) || !ts.isIntersectionTypeNode(stmt.type)) continue;
    const ref = stmt.type.types.find((t) => ts.isTypeReferenceNode(t));
    const lit = stmt.type.types.find((t) => ts.isTypeLiteralNode(t));
    if (!ref || !lit) continue;
    const names = new Set(
      lit.members.filter((m) => ts.isPropertySignature(m)).map((m) => m.name.getText(sf)),
    );
    extras.set(stmt.name.text, names);
    base.set(stmt.name.text, ref.typeName.getText(sf));
    byBase.set(ref.typeName.getText(sf), stmt.name.text);
  }
  return { extras, base, byBase };
}

// ── tsc ─────────────────────────────────────────────────────────────

function runTsc() {
  const r = spawnSync('npx', ['tsc', '-b', '--pretty', 'false'], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
  });
  return { ok: r.status === 0, output: (r.stdout || '') + (r.stderr || '') };
}

const ERROR_RE = /^(.+?)\((\d+),(\d+)\): error TS2339: Property '(.+?)' does not exist on type '(.+?)'\.$/;
const NULL_RE = /^(.+?)\((\d+),(\d+)\): error TS2322: Type '(.+?)' is not assignable to type '(.+?)'\.$/;
const CMP_RE = /^(.+?)\((\d+),(\d+)\): error TS2367: This comparison appears to be unintentional because the types '(.+?)' and '(.+?)' have no overlap\.$/;
const JSX_RE = /^(.+?)\((\d+),(\d+)\): error TS2503: Cannot find namespace 'JSX'\.$/;
const MIX_RE = /^(.+?)\((\d+),(\d+)\): error TS5076: '(?:\|\||&&|\?\?)' and '(?:\|\||&&|\?\?)' operations cannot be mixed without parentheses\.$/;
const DUP_RE = /^(.+?)\((\d+),(\d+)\): error TS2783: '(.+?)' is specified more than once, so this usage will be overwritten\.$/;
const HOME_RE = /^(.+?)\((\d+),(\d+)\): error TS(?:2305|2724): Module '"(.+?)"' has no exported member (?:named )?'(.+?)'\./;
// TS2459: the wrong module IMPORTS the name itself ("declares 'APP_IDS' locally,
// but it is not exported") — same class H, same groups (file, line, col, module, name).
const HOME_LOCAL_RE = /^(.+?)\((\d+),(\d+)\): error TS2459: Module '"(.+?)"' declares '(.+?)' locally, but it is not exported\./;

/** name → the '@/…' module that really exports it (generated from the scaffold). */
const EXPORT_HOME = {
  "QrCode": "@/components/widgets/QrCode",
  "qrSvgString": "@/components/widgets/QrCode",
  "encodeQr": "@/components/widgets/QrCode",
  "PublicPageQr": "@/components/widgets/PublicPageQr",
  "usePublicPageLink": "@/components/widgets/PublicPageQr",
  "lookupOption": "@/types/app",
  "APP_IDS": "@/types/app",
  "LOOKUP_OPTIONS": "@/types/app",
  "formatDate": "@/lib/formatters",
  "formatDateTime": "@/lib/formatters",
  "formatCurrency": "@/lib/formatters",
  "displayLookup": "@/lib/formatters",
  "displayMultiLookup": "@/lib/formatters",
  "lookupKey": "@/lib/formatters",
  "lookupKeys": "@/lib/formatters",
  "t": "@/i18n",
  "tx": "@/i18n",
  "tp": "@/i18n",
  "appLabel": "@/i18n",
  "fieldLabel": "@/i18n",
  "lookupLabel": "@/i18n",
  "localeTag": "@/i18n",
  "dateFnsLocale": "@/i18n",
  "useDashboardData": "@/hooks/useDashboardData",
  "useLiveRecords": "@/hooks/useLiveRecords",
  "useLiveRecord": "@/hooks/useLiveRecords",
  "LivingAppsService": "@/services/livingAppsService",
  "createRecordUrl": "@/services/livingAppsService",
  "extractRecordId": "@/services/livingAppsService",
  "cleanFieldsForApi": "@/services/livingAppsService",
  "useEntityCrud": "@/components/EntityCrud",
  "cn": "@/lib/utils"
};

/** Discriminant spellings compare equal once `_` and case are dropped. */
function normKey(s) {
  return s.replace(/_/g, '').toLowerCase();
}

function parseErrors(output) {
  const errors = [];
  const nullErrors = [];
  const cmpErrors = [];
  const jsxErrors = [];
  const mixErrors = [];
  const dupErrors = [];
  const homeErrors = [];
  let total = 0;
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (/error TS\d+/.test(trimmed)) total += 1;
    const j = trimmed.match(JSX_RE);
    if (j) {
      jsxErrors.push({ file: j[1], line: Number(j[2]), col: Number(j[3]) });
      continue;
    }
    const h = trimmed.match(HOME_RE) || trimmed.match(HOME_LOCAL_RE);
    if (h) {
      const [, file, lineNo, col, module, name] = h;
      if (EXPORT_HOME[name] && EXPORT_HOME[name] !== module) {
        homeErrors.push({ file, line: Number(lineNo), col: Number(col), module, name });
      }
      continue;
    }
    const d = trimmed.match(DUP_RE);
    if (d) {
      dupErrors.push({ file: d[1], line: Number(d[2]), col: Number(d[3]), prop: d[4] });
      continue;
    }
    const x = trimmed.match(MIX_RE);
    if (x) {
      mixErrors.push({ file: x[1], line: Number(x[2]), col: Number(x[3]) });
      continue;
    }
    const m = trimmed.match(ERROR_RE);
    if (m) {
      const [, file, lineNo, col, prop, typeName] = m;
      // Only bare identifier types — our classes never involve unions/literals.
      if (/^[A-Za-z_$][\w$]*$/.test(typeName)) {
        errors.push({ file, line: Number(lineNo), col: Number(col), prop, typeName });
      }
      continue;
    }
    const c = trimmed.match(CMP_RE);
    if (c) {
      const [, file, lineNo, col, leftType, rightType] = c;
      // Class D shape only: both sides are string-literal types, so the
      // union of valid keys is right there in the message.
      const lits = [...`${leftType} ${rightType}`.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
      if (lits.length >= 2) {
        cmpErrors.push({ file, line: Number(lineNo), col: Number(col), lits });
      }
      continue;
    }
    const n = trimmed.match(NULL_RE);
    if (n) {
      const [, file, lineNo, col, sourceType, targetType] = n;
      // Class C shape only: the source union carries null, the target takes
      // undefined and rejects null — the fix is provably `?? null` → `?? undefined`.
      if (
        /\bnull\b/.test(sourceType) &&
        /\bundefined\b/.test(targetType) && !/\bnull\b/.test(targetType)
      ) {
        nullErrors.push({ file, line: Number(lineNo), col: Number(col) });
      }
    }
  }
  return { errors, nullErrors, cmpErrors, jsxErrors, mixErrors, dupErrors, homeErrors, total };
}

// ── Fixes ───────────────────────────────────────────────────────────

function verifyParses(src, filePath) {
  const sf = ts.createSourceFile(
    filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diags = sf.parseDiagnostics ?? [];
  if (diags.length) {
    throw new Error(`rewrite would not parse — ${filePath} left unchanged`);
  }
}

// The `?? null` whose null the class-C error points at: same line.
function findNullishNull(sf, line) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isBinaryExpression(n) &&
      n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      n.right.kind === ts.SyntaxKind.NullKeyword &&
      sf.getLineAndCharacterOfPosition(n.right.getStart(sf)).line + 1 === line
    ) {
      found = n.right;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// The property-access node the error points at: same line, same name.
/** The string literal on `line` for which the message names exactly one
 *  differently-spelled but equal-once-normalised counterpart. `valid` holds
 *  the literals from BOTH sides of the comparison, so the wrong one is in
 *  there too — hence the `v !== node.text` guard rather than a set lookup.
 *  Two entities differing only in underscores would yield two matches and
 *  heal nothing, which is the safe outcome. */
function findDiscriminantLiteral(sf, line, valid) {
  let hit = null;
  const walk = (node) => {
    if (hit) return;
    if (ts.isStringLiteral(node)) {
      const { line: nodeLine } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      if (nodeLine === line - 1) {
        const matches = valid.filter(
          (v) => v !== node.text && normKey(v) === normKey(node.text),
        );
        if (matches.length === 1) hit = { node, target: matches[0] };
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return hit;
}

// Class E: the `JSX.Element` type reference on `line`. Any other `JSX.*`
// (IntrinsicElements, …) is NOT ours — it stays in the output for the agent.
function findJsxElementType(sf, line) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isTypeReferenceNode(n) && ts.isQualifiedName(n.typeName) &&
      ts.isIdentifier(n.typeName.left) && n.typeName.left.text === 'JSX' &&
      n.typeName.right.text === 'Element' &&
      sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 === line
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// `React.ReactElement` needs the default import. Upgrade the existing value
// import from 'react' in place; otherwise add a standalone default import.
function ensureReactDefaultImport(src) {
  if (/(^|\n)import\s+React[\s,]/.test(src)) return src;
  const named = src.match(/(^|\n)import\s*\{([^}]*)\}(\s*from\s*'react';)/);
  if (named) {
    return src.replace(named[0], `${named[1]}import React, {${named[2]}}${named[3]}`);
  }
  const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let importEnd = 0;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) importEnd = stmt.getEnd();
  }
  return src.slice(0, importEnd) + `\nimport React from 'react';` + src.slice(importEnd);
}

// Class F: the OUTERMOST binary expression on `line` that mixes `??` with
// `||`/`&&` at one level. The fix parenthesizes the mixed CHILD exactly as
// tsc parsed it — no semantic change, the grammar complaint disappears.
const MIXABLE = new Set([
  ts.SyntaxKind.QuestionQuestionToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
]);
function findMixedChild(sf, line) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (ts.isBinaryExpression(n) && MIXABLE.has(n.operatorToken.kind)) {
      const { line: nodeLine } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      if (nodeLine + 1 === line) {
        const mixes = (c) =>
          ts.isBinaryExpression(c) && MIXABLE.has(c.operatorToken.kind) &&
          c.operatorToken.kind !== n.operatorToken.kind &&
          (c.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
            n.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken);
        if (mixes(n.left)) { found = n.left; return; }
        if (mixes(n.right)) { found = n.right; return; }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

// Class G: the object-literal member named `prop` on `line` that a LATER
// spread in the same literal overwrites (that is what TS2783 asserts — the
// spread's type carries the key as required). Returns null unless the member
// is side-effect free, so dropping it changes nothing but the diagnostic.
function isPureValue(n) {
  if (!n) return false;
  if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) {
    return isPureValue(n.expression);
  }
  if (ts.isIdentifier(n) || n.kind === ts.SyntaxKind.ThisKeyword) return true;
  if (
    ts.isStringLiteral(n) || ts.isNumericLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) ||
    n.kind === ts.SyntaxKind.TrueKeyword || n.kind === ts.SyntaxKind.FalseKeyword ||
    n.kind === ts.SyntaxKind.NullKeyword
  ) return true;
  if (ts.isPropertyAccessExpression(n)) return isPureValue(n.expression);
  if (ts.isElementAccessExpression(n)) {
    return isPureValue(n.expression) && isPureValue(n.argumentExpression);
  }
  return false;
}
function findOverwrittenProperty(sf, line, prop) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (
      (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) &&
      n.name.getText(sf) === prop &&
      ts.isObjectLiteralExpression(n.parent) &&
      sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1 === line
    ) {
      const props = n.parent.properties;
      const idx = props.indexOf(n);
      const spreadAfter = props.slice(idx + 1).some((p) => ts.isSpreadAssignment(p));
      const pure = ts.isShorthandPropertyAssignment(n) || isPureValue(n.initializer);
      if (spreadAfter && pure && idx < props.length - 1) {
        // Remove up to the next member's start — takes the comma and the
        // whitespace with it, whatever the formatting.
        found = { start: n.getStart(sf), end: props[idx + 1].getStart(sf) };
      }
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function findAccess(sf, line, prop) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if (
      ts.isPropertyAccessExpression(n) && n.name.text === prop &&
      sf.getLineAndCharacterOfPosition(n.name.getStart(sf)).line + 1 === line
    ) {
      found = n;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function ensureEnrichedImport(src, name) {
  if (new RegExp(`import\\s+type\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'@/types/enriched'`).test(src)) {
    return src;
  }
  const m = src.match(/import\s+type\s*\{([^}]*)\}\s*from\s*'@\/types\/enriched';/);
  if (m) {
    return src.replace(
      m[0],
      `import type { ${m[1].replace(/^\s*|[,\s]*$/g, '')}, ${name} } from '@/types/enriched';`,
    );
  }
  const sf = ts.createSourceFile('x.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let importEnd = 0;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) importEnd = stmt.getEnd();
  }
  return src.slice(0, importEnd) + `\nimport type { ${name} } from '@/types/enriched';` + src.slice(importEnd);
}

// Retyping can orphan the raw-type import — the sandbox build runs with
// noUnusedLocals, so an idle import is its own TS6133. Drop the name from
// its import clause when NOTHING outside an import references it anymore.
function dropUnusedImport(src, name, filePath) {
  const sf = ts.createSourceFile(
    filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let used = false;
  const inImport = (n) => {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isImportDeclaration(p)) return true;
    }
    return false;
  };
  const visit = (n) => {
    if (used) return;
    if (ts.isIdentifier(n) && n.text === name && !inImport(n)) {
      used = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (used) return src;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) continue;
    const nb = stmt.importClause.namedBindings;
    if (!ts.isNamedImports(nb)) continue;
    const el = nb.elements.find((e) => e.name.text === name);
    if (!el) continue;
    if (nb.elements.length === 1 && !stmt.importClause.name) {
      let end = stmt.getEnd();
      while (end < src.length && (src[end] === '\n' || src[end] === '\r')) end += 1;
      return src.slice(0, stmt.getStart(sf)) + src.slice(end);
    }
    const idx = nb.elements.indexOf(el);
    let start = el.getStart(sf);
    let end = el.getEnd();
    if (idx < nb.elements.length - 1) end = nb.elements[idx + 1].getStart(sf);
    else start = nb.elements[idx - 1].getEnd();
    return src.slice(0, start) + src.slice(end);
  }
  return src;
}

/** Class H helpers — string level, AST-located, like ensureEnrichedImport. */
function dropNamedImportFrom(src, name, module, filePath) {
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== module) continue;
    const nb = stmt.importClause.namedBindings;
    if (!ts.isNamedImports(nb)) continue;
    const el = nb.elements.find((e) => e.name.text === name);
    if (!el) continue;
    if (nb.elements.length === 1 && !stmt.importClause.name) {
      let end = stmt.getEnd();
      while (end < src.length && (src[end] === '\n' || src[end] === '\r')) end += 1;
      return { src: src.slice(0, stmt.getStart(sf)) + src.slice(end), done: true };
    }
    const idx = nb.elements.indexOf(el);
    let start = el.getStart(sf);
    let end = el.getEnd();
    if (idx < nb.elements.length - 1) end = nb.elements[idx + 1].getStart(sf);
    else start = nb.elements[idx - 1].getEnd();
    return { src: src.slice(0, start) + src.slice(end), done: true };
  }
  return { src, done: false };
}

function ensureNamedImport(src, name, module, filePath) {
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let lastImportEnd = 0;
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    lastImportEnd = stmt.getEnd();
    if (!ts.isStringLiteral(stmt.moduleSpecifier) || stmt.moduleSpecifier.text !== module) continue;
    if (stmt.importClause?.isTypeOnly) continue;
    const nb = stmt.importClause?.namedBindings;
    if (!nb || !ts.isNamedImports(nb)) continue;
    if (nb.elements.some((e) => e.name.text === name)) return src;
    const last = nb.elements[nb.elements.length - 1];
    if (!last) return src.slice(0, nb.getStart(sf) + 1) + ` ${name} ` + src.slice(nb.getStart(sf) + 1);
    return src.slice(0, last.getEnd()) + `, ${name}` + src.slice(last.getEnd());
  }
  const line = `import { ${name} } from '${module}';\n`;
  if (lastImportEnd === 0) return line + src;
  let at = lastImportEnd;
  while (at < src.length && src[at] !== '\n') at += 1;
  return src.slice(0, at + 1) + line + src.slice(at + 1);
}

function healFile(filePath, errors, nullErrors, cmpErrors, jsxErrors, mixErrors, dupErrors, homeErrors, shapes) {
  const before = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(
    filePath, before, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const { fieldsByType, enriched } = shapes;
  const edits = [];          // {start, end, text}
  const fixed = [];
  const needImports = new Set();
  const retypedRaw = new Set();
  let needReact = false;

  // Class E: `JSX.Element` → `React.ReactElement` (+ default React import).
  for (const err of jsxErrors) {
    const node = findJsxElementType(sf, err.line);
    if (!node) continue;
    edits.push({ start: node.getStart(sf), end: node.getEnd(), text: 'React.ReactElement' });
    needReact = true;
    fixed.push({ file: filePath, line: err.line, kind: 'jsx-to-react-element' });
  }

  // Class G: drop the member a later spread overwrites anyway.
  for (const err of dupErrors) {
    const span = findOverwrittenProperty(sf, err.line, err.prop);
    if (!span) continue;
    edits.push({ start: span.start, end: span.end, text: '' });
    fixed.push({ file: filePath, line: err.line, kind: 'drop-overwritten-property', prop: err.prop });
  }

  // Class F: parenthesize the mixed `??`/`||`/`&&` child as parsed.
  for (const err of mixErrors) {
    const child = findMixedChild(sf, err.line);
    if (!child) continue;
    const start = child.getStart(sf);
    const end = child.getEnd();
    edits.push({ start, end, text: `(${before.slice(start, end)})` });
    fixed.push({ file: filePath, line: err.line, kind: 'parenthesize-mixed-ops' });
  }

  // Class D: a discriminant literal in the other spelling (see header).
  for (const err of cmpErrors) {
    const found = findDiscriminantLiteral(sf, err.line, err.lits);
    if (!found) continue;
    const quote = before[found.node.getStart(sf)];
    edits.push({
      start: found.node.getStart(sf),
      end: found.node.getEnd(),
      text: `${quote}${found.target}${quote}`,
    });
    fixed.push({ file: filePath, line: err.line, kind: 'discriminant', from: found.node.text, to: found.target });
  }

  // Class C: `?? null` where the payload type wants undefined.
  for (const err of nullErrors) {
    const nullNode = findNullishNull(sf, err.line);
    if (!nullNode) continue;
    edits.push({ start: nullNode.getStart(sf), end: nullNode.getEnd(), text: 'undefined' });
    fixed.push({ file: filePath, line: err.line, kind: 'null-to-undefined' });
  }

  for (const err of errors) {
    // Class A: the property is a FIELD of the record — the `.fields.` prefix
    // is missing. Applies to raw and Enriched types alike (Enriched extends
    // the raw record, so `fields` is present either way).
    const baseName = enriched.base.get(err.typeName) ?? err.typeName;
    const fields = fieldsByType.get(baseName);
    if (fields?.has(err.prop)) {
      const node = findAccess(sf, err.line, err.prop);
      if (node) {
        const pos = node.name.getStart(sf);
        edits.push({ start: pos, end: pos, text: 'fields.' });
        fixed.push({ file: filePath, line: err.line, kind: 'fields-prefix', prop: err.prop });
      }
      continue;
    }
    // Class B: the property is an Enriched-only extra, but the expression is
    // typed with the RAW record type — the annotation is wrong, not the read.
    // The annotation idiom is the overlay-union member `record: T` (the
    // skeleton pre-generates it correctly; this heals hand-written ones and
    // legacy dashboards). Retype every `record: T` type-literal member.
    const enrichedName = enriched.byBase.get(err.typeName);
    if (enrichedName && enriched.extras.get(enrichedName)?.has(err.prop)) {
      let retyped = 0;
      const visit = (n) => {
        if (
          ts.isPropertySignature(n) && n.name.getText(sf) === 'record' &&
          n.type && ts.isTypeReferenceNode(n.type) &&
          n.type.typeName.getText(sf) === err.typeName
        ) {
          edits.push({ start: n.type.getStart(sf), end: n.type.getEnd(), text: enrichedName });
          retyped += 1;
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
      if (retyped) {
        needImports.add(enrichedName);
        retypedRaw.add(err.typeName);
        fixed.push({ file: filePath, line: err.line, kind: 'raw-to-enriched', prop: err.prop, type: enrichedName });
      }
    }
    // Anything else: not our class — stays in the tsc output for the agent.
  }

  // Class H: the name belongs to another module — move it there.
  const moves = [];
  for (const err of homeErrors) {
    const home = EXPORT_HOME[err.name];
    if (!home || home === err.module) continue;
    moves.push(err);
  }

  if (!edits.length && !moves.length) return fixed;

  // Overlapping/duplicate edits (two errors retyping the same member) — dedupe.
  const seen = new Set();
  const unique = edits.filter((e) => {
    const key = `${e.start}:${e.end}:${e.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => b.start - a.start);
  let out = before;
  for (const e of unique) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  for (const name of needImports) out = ensureEnrichedImport(out, name);
  for (const name of retypedRaw) out = dropUnusedImport(out, name, filePath);
  for (const err of moves) {
    const dropped = dropNamedImportFrom(out, err.name, err.module, filePath);
    if (!dropped.done) continue;
    out = ensureNamedImport(dropped.src, err.name, EXPORT_HOME[err.name], filePath);
    fixed.push({ file: filePath, line: err.line, kind: 'import-from-home', name: err.name, from: err.module, to: EXPORT_HOME[err.name] });
  }
  if (needReact) out = ensureReactDefaultImport(out);
  verifyParses(out, filePath);
  writeFileSync(filePath, out);
  return fixed;
}

// ── CLI ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const errorsFileIdx = args.indexOf('--errors-file');
const testMode = errorsFileIdx !== -1;

let output;
if (testMode) {
  output = readFileSync(args[errorsFileIdx + 1], 'utf8');
} else {
  const first = runTsc();
  if (first.ok) {
    console.log(JSON.stringify({ fixed: [], remaining: 0 }));
    process.exit(0);
  }
  output = first.output;
}

const parsed = parseErrors(output);
const shapes = {
  fieldsByType: parseRecordFields(),
  enriched: parseEnriched(),
};

const files = new Set(
  [...parsed.errors, ...parsed.nullErrors, ...parsed.cmpErrors,
   ...parsed.jsxErrors, ...parsed.mixErrors, ...parsed.dupErrors, ...parsed.homeErrors].map((e) => e.file),
);
const fixed = [];
for (const file of files) {
  if (!existsSync(file)) continue;
  try {
    fixed.push(...healFile(
      file,
      parsed.errors.filter((e) => e.file === file),
      parsed.nullErrors.filter((e) => e.file === file),
      parsed.cmpErrors.filter((e) => e.file === file),
      parsed.jsxErrors.filter((e) => e.file === file),
      parsed.mixErrors.filter((e) => e.file === file),
      parsed.dupErrors.filter((e) => e.file === file),
      parsed.homeErrors.filter((e) => e.file === file),
      shapes,
    ));
  } catch (e) {
    console.error(`heal-tsc: ${file}: ${String(e.message ?? e)}`);
  }
}

if (testMode) {
  console.log(JSON.stringify({ fixed, remaining: -1 }));
  process.exit(0);
}

if (!fixed.length) {
  // Nothing we can prove — hand the original output straight to the agent.
  // `remaining` counts ALL open tsc errors, not this script's candidates:
  // a build failing on an unhealable class must never read as "0 remaining".
  console.log(JSON.stringify({ fixed: [], remaining: parsed.total }));
  process.stdout.write(output);
  process.exit(1);
}

const second = runTsc();
console.log(JSON.stringify({
  fixed,
  remaining: second.ok ? 0 : parseErrors(second.output).total,
}));
if (!second.ok) process.stdout.write(second.output);
process.exit(second.ok ? 0 : 1);
