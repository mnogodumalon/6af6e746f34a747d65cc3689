#!/usr/bin/env node
// Mechanical i18n pass for agent-written pages (run by the Klar pipeline
// after every agent phase — not by the agent).
//
// The tx contract: page text is written ONCE in the build language and
// marked — tx('…') / tx`${a} …` — and the SOURCE TEXT is the catalog key
// (locales/pages.json, generated server-side). This script's job is therefore
// pure CODE MOTION, never translation:
//
//   wrap <files...>     — heal hardcoded date-fns locales (locale: de →
//                         dateFnsLocale()), hoist unsafe module-scope label
//                         consts into their component, then wrap every
//                         unmarked human literal in tx() at the proven
//                         positions (JSX text, localized attributes/props,
//                         ??/||/+= fallbacks, ternary branches, toasts/new
//                         Error, returns and assignments, template literals
//                         via the tx tag; backtick literals without ${}
//                         count as string literals everywhere).
//                         Idempotent: tx-marked text is never re-wrapped.
//   extract <files...>  — write .i18n-texts.json: every tx key in the files
//                         (the texts one LLM call translates) plus
//                         `residues`: findings that need judgement.
//   intents <files...>  — legacy config/intents.ts labels: reads
//                         .i18n-translations.json ({source, map}) and turns
//                         plain-string label/description into {de,en} pairs.
//   verify <files...>   — independent net: is there source-language prose
//                         OUTSIDE tx/makeT, and does any legacy makeT en row
//                         still equal its de row?
//
// Deliberately left alone (reported as residues, not guessed at): single
// words in unknown positions (may be API values — matches('Impfung')),
// unknown prop names carrying phrases, module-scope literals that cannot be
// hoisted, and anything on an /* i18n-exempt */ line.
//
// A rewrite is only written out if it still parses — a bug here must fail
// THIS step, not `npm run build` minutes later.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
// typescript is CJS; default-import interop breaks on some node/ts combos.
const ts = createRequire(import.meta.url)('typescript');

const ATTRS = new Set([
  'title', 'placeholder', 'label', 'aria-label', 'alt', 'emptyLabel',
  'emptyText', 'searchPlaceholder', 'createLabel', 'subtitle', 'description',
]);
const PROPS = new Set([
  'title', 'label', 'name', 'emptyLabel', 'emptyText', 'hint', 'description',
  'text', 'subtitle',
  'desc', 'caption', 'summary', 'heading', 'subheading', 'sublabel',
  'helper', 'helperText', 'message', 'msg', 'body', 'tooltip', 'note',
]);
// Callees whose string arguments are class lists, not copy.
const CN_CALLEES = new Set(['cn', 'clsx', 'cva', 'twMerge', 'classNames']);
// Callees whose string arguments are never user-facing copy. tx/tt/t/tp are
// in here so a wrapped file re-scans to zero — idempotency.
const SKIP_CALLEE = /^console\.|^(tx|tt|t|tp|tc|require|import|format|formatDate|formatDateTime|parse|parseISO|lookupKey|appLabel|fieldLabel|lookupLabel)$/;
// Callees whose string arguments ARE copy — a single word is safe there.
const COPY_CALLEE = /toast|^(alert|confirm)$|^window\.(alert|confirm)$/i;
// date-fns / Intl pattern strings ('dd. MMMM yyyy') read as prose otherwise.
const DATE_PATTERN = /^[dDMyYhHmsSaAZzEwWQXx'.:,\/\- ]+$/;

const TEXTS_FILE = '.i18n-texts.json';
const TRANSLATIONS_FILE = '.i18n-translations.json';
const HAS_LETTER = /[A-Za-zÀ-ž]{2,}/;
// A whitespace-separated token that could plausibly be a Tailwind class,
// URL segment or key — all-lowercase ASCII plus css punctuation.
const CSSISH_TOKEN = /^[a-z0-9\-_:\/\[\]().%#,&>*!'"@=+]+$/;

const isIntentsFile = (p) => /config\/intents\.ts$/.test(p);
// A backtick literal without ${} is a string literal in every way that
// matters here — same .text, same wrap form.
const isTextLit = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);
const esc = (s) => s
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r');

// Human copy vs. code-ish string: umlauts, a Capitalized word, or two-plus
// words that are not all css-shaped (see i18n-migrate history: a lowercase
// German phrase without umlauts must not read as a class list — real class
// lists carry a hyphen, colon, slash, bracket or digit somewhere).
function looksHuman(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!HAS_LETTER.test(t)) return false;
  if (/[À-ž]/.test(t)) return true;
  if (/(^|[^A-Za-z0-9_])[A-Z][a-zà-ž]/.test(t)) return true;
  const words = t.split(' ').filter((w) => /[A-Za-z]{2,}/.test(w));
  const cssish = words.every((w) => CSSISH_TOKEN.test(w)) &&
    words.some((w) => /[-:/\[\]0-9]/.test(w));
  return words.length >= 2 && !cssish;
}

function enclosingFunction(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p)
    ) return p;
  }
  return null;
}

function outermostFunction(node) {
  let found = null;
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p)
    ) found = p;
  }
  return found;
}

function inClassNameContext(node, sf) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return /class/i.test(p.name.getText(sf));
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && CN_CALLEES.has(p.expression.text)) return true;
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p)
    ) return false;
  }
  return false;
}

function lineOf(source, pos) {
  return source.slice(source.lastIndexOf('\n', pos) + 1, source.indexOf('\n', pos));
}

// The tagged-template KEY — must build the exact string the runtime builds
// (cooked statics joined by {0}/{1}/… slots).
function templateKey(tpl) {
  if (ts.isNoSubstitutionTemplateLiteral(tpl)) return tpl.text;
  let key = tpl.head.text;
  tpl.templateSpans.forEach((span, i) => { key += `{${i}}` + span.literal.text; });
  return key;
}

// ── module-scope const hoisting ─────────────────────────────────────
// A const at module scope whose value carries UI labels freezes them at
// import time (tx resolves the locale at CALL time — same trap as the
// legacy getters, gate 22). When it is used by exactly one component we
// move the whole declaration into that component's body — pure code motion.

function hasHumanLiteral(node, sf) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && looksHuman(n.text)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function collectHoists(sf) {
  const hoists = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if (stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const decl = stmt.declarationList.declarations[0];
    if (!decl || !ts.isIdentifier(decl.name) || !decl.initializer) continue;

    const declText = stmt.getText(sf);
    // A legacy makeT table must stay at module scope — runtime, gates and
    // overlay extractor all expect it there.
    if (/\bmakeT\s*\(/.test(declText)) continue;
    const carriesLabels =
      /\blabel\s*:/.test(declText) ||
      (/LOOKUP_OPTIONS/.test(declText) && /\.label\b/.test(declText)) ||
      /\btx\s*[(`]/.test(declText) ||
      hasHumanLiteral(decl.initializer, sf);
    if (!carriesLabels) continue;
    if (declText.includes('i18n-exempt')) continue;

    // Every reference must live inside one and the same component.
    const name = decl.name.text;
    let target = null;
    let ok = true;
    const visit = (n) => {
      if (ts.isIdentifier(n) && n.text === name && n !== decl.name) {
        const fn = outermostFunction(n);
        if (!fn || !fn.body || !ts.isBlock(fn.body)) ok = false;
        else if (target && target !== fn) ok = false;
        else target = fn;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!ok || !target) continue;

    hoists.push({
      start: stmt.getStart(sf),
      end: stmt.getEnd(),
      insertPos: target.body.getStart(sf) + 1,
      text: declText,
    });
  }
  return hoists;
}

function hoistModuleConsts(source, filePath) {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hoists = collectHoists(sf);
  if (hoists.length === 0) return { source, hoisted: 0 };

  const edits = [];
  let hoisted = 0;
  for (const h of hoists) {
    if (h.insertPos <= h.end) continue; // component declared before the const
    hoisted += 1;
    edits.push({ pos: h.insertPos, insert: `\n  ${h.text}\n` });
    let end = h.end;
    while (end < source.length && (source[end] === '\n' || source[end] === '\r')) end += 1;
    edits.push({ pos: h.start, end, insert: '' });
  }
  edits.sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const e of edits) out = out.slice(0, e.pos) + e.insert + out.slice(e.end ?? e.pos);
  return { source: out, hoisted };
}

// ── scan: wrap edits + tx keys + residues ───────────────────────────

function scan(filePath, sourceOverride) {
  const raw = sourceOverride ?? readFileSync(filePath, 'utf8');
  const isIntents = isIntentsFile(filePath);
  const { source, hoisted } = isIntents ? { source: raw, hoisted: 0 } : hoistModuleConsts(raw, filePath);
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Legacy makeT tables: their interior is the translated SOLUTION — never a
  // wrap target and never a residue (i18n-migrate history: TS7022/TS2448).
  const tableRanges = [];
  const collectTables = (n) => {
    if (
      ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
      n.expression.text === 'makeT'
    ) tableRanges.push([n.getStart(sf), n.getEnd()]);
    ts.forEachChild(n, collectTables);
  };
  collectTables(sf);
  const inTable = (pos) => tableRanges.some(([a, b]) => pos >= a && pos < b);

  const edits = [];       // {start, end, text} replacements ({start===end} = insert)
  const txKeys = [];      // source texts already marked with tx
  const residues = [];
  const intentSpans = []; // legacy plain-string intent labels

  const lineNo = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const exempt = (pos) => lineOf(source, pos).includes('i18n-exempt');

  const pushResidue = (kind, start, end, text) => {
    if (inTable(start) || exempt(start)) return;
    if (residues.some((r) => start >= r.start && start < r.end)) return;
    residues.push({
      kind, start, end, line: lineNo(start),
      text: text.replace(/\s+/g, ' ').trim().slice(0, 100),
      src: lineOf(source, start).trim().slice(0, 200),
    });
  };

  let moduleScope = 0;
  const wrappedTexts = []; // what the agent left unmarked — diagnosis input
  // One gate for every wrap: letters, not a table entry, not exempted, not
  // at module scope (tx would freeze there — residue instead).
  const record = (start, end, text, node, render) => {
    if (!HAS_LETTER.test(text)) return false;
    if (inTable(start) || exempt(start)) return false;
    if (!enclosingFunction(node)) {
      moduleScope += 1;
      pushResidue('module-scope', start, end, text);
      return false;
    }
    edits.push({ start, end, text: render(esc(text)) });
    wrappedTexts.push(text.replace(/\s+/g, ' ').trim().slice(0, 80));
    return true;
  };

  const visit = (node) => {
    if (isIntents) {
      // Registry data: only legacy plain-string labels; multilingual objects
      // and everything else stay untouched (see i18n-migrate history — the
      // description field is typed `string | {de,en}` for exactly this).
      if (
        ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
        (node.name.text === 'label' || node.name.text === 'description') &&
        ts.isStringLiteral(node.initializer) &&
        HAS_LETTER.test(node.initializer.text) &&
        !exempt(node.initializer.getStart(sf))
      ) {
        const init = node.initializer;
        intentSpans.push({ start: init.getStart(sf), end: init.getEnd(), text: init.text });
      }
      ts.forEachChild(node, visit);
      return;
    }

    // Already-marked text: collect the key, skip the interior.
    if (
      ts.isCallExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === 'tx' && node.arguments.length &&
      (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      txKeys.push(node.arguments[0].text);
      // params object may hide ternary branches etc. — keep walking args 1+.
      for (const arg of node.arguments.slice(1)) visit(arg);
      return;
    }
    if (
      ts.isTaggedTemplateExpression(node) && ts.isIdentifier(node.tag) &&
      node.tag.text === 'tx'
    ) {
      txKeys.push(templateKey(node.template));
      if (ts.isTemplateExpression(node.template)) {
        for (const span of node.template.templateSpans) {
          const ex = span.expression;
          // A string ternary INSIDE a tx slot is grammar smuggled past the
          // catalog — `tx\`${n === 1 ? 'ist' : 'sind'} krank\`` interpolates
          // the source language verbatim. Not wrappable (the sentence must
          // split), so it is a named judgement case.
          if (
            ts.isConditionalExpression(ex) &&
            [ex.whenTrue, ex.whenFalse].every((b) => isTextLit(b) && HAS_LETTER.test(b.text))
          ) {
            pushResidue('tx-slot-branch', ex.getStart(sf), ex.getEnd(), ex.getText(sf));
            continue;
          }
          // slot expressions may carry their own human branches — walk them.
          visit(ex);
        }
      }
      return;
    }

    if (ts.isJsxText(node)) {
      const raw2 = node.getText(sf);
      // JSX collapses newline+indent runs when it renders — ONE text.
      const trimmed = raw2.replace(/\s+/g, ' ').trim();
      if (trimmed) {
        const lead = raw2.match(/^\s*/)[0];
        const trail = raw2.match(/\s*$/)[0];
        record(node.getStart(sf), node.getEnd(), trimmed, node,
          (t) => `${lead}{tx('${t}')}${trail}`);
      }
    } else if (
      ts.isJsxAttribute(node) && node.initializer && ATTRS.has(node.name.getText(sf))
    ) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) {
        record(init.getStart(sf), init.getEnd(), init.text, node, (t) => `{tx('${t}')}`);
      } else if (ts.isJsxExpression(init) && init.expression && isTextLit(init.expression)) {
        record(init.expression.getStart(sf), init.expression.getEnd(),
          init.expression.text, node, (t) => `tx('${t}')`);
      }
    } else if (
      ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
      PROPS.has(node.name.text) &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      record(node.initializer.getStart(sf), node.initializer.getEnd(),
        node.initializer.text, node, (t) => `tx('${t}')`);
    } else if (
      // Same shape, name not on the list: report instead of dropping it.
      ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
      ts.isStringLiteral(node.initializer) && /\s/.test(node.initializer.text.trim()) &&
      looksHuman(node.initializer.text) && !DATE_PATTERN.test(node.initializer.text) &&
      !inClassNameContext(node, sf)
    ) {
      pushResidue('prop', node.initializer.getStart(sf), node.initializer.getEnd(),
        node.initializer.text);
    } else if (ts.isTemplateExpression(node)) {
      // `${n} Tiere im System` → tx`${n} Tiere im System` — a zero-width
      // tag insert; the expressions become {i} slots at runtime, so the
      // sentence stays whole and translatable. Never re-tag a tagged one.
      const tagged = node.parent && ts.isTaggedTemplateExpression(node.parent) &&
        node.parent.template === node;
      const key = templateKey(node);
      const human = looksHuman(key.replace(/\{\d+\}/g, ' '));
      if (!tagged && human && !inTable(node.getStart(sf)) &&
          !exempt(node.getStart(sf)) && !inClassNameContext(node, sf)) {
        if (!enclosingFunction(node)) {
          moduleScope += 1;
          pushResidue('module-scope', node.getStart(sf), node.getEnd(), node.getText(sf));
        } else {
          edits.push({ start: node.getStart(sf), end: node.getStart(sf), text: 'tx' });
          wrappedTexts.push(key.replace(/\s+/g, ' ').trim().slice(0, 80));
        }
      }
      // Walk the spans either way — inner ternary branches are their own case.
      for (const span of node.templateSpans) visit(span.expression);
      return;
    } else if (
      ts.isConditionalExpression(node) && !inClassNameContext(node, sf)
    ) {
      // Display ternaries: wrap each human string branch IN PLACE —
      // `n===1 ? 'Tier' : 'Tiere'` → `n===1 ? tx('Tier') : tx('Tiere')`.
      // A lone word whose sibling branch is NOT also copy may be an API
      // value (`ok ? 'Aktiv' : null`) — judgement call, residue.
      const branches = [node.whenTrue, node.whenFalse];
      const humanStr = (b) => isTextLit(b) && looksHuman(b.text) && !DATE_PATTERN.test(b.text);
      // Both branches are non-empty strings and at least one is human copy →
      // it is a display ternary, single words included ('Tier'/'Tiere').
      const bothCopy = branches.every((b) => isTextLit(b) && b.text.trim() !== '') &&
        branches.some(humanStr);
      for (const b of branches) {
        if (!humanStr(b)) continue;
        if (!/\s/.test(b.text.trim()) && !bothCopy) {
          pushResidue('branch', b.getStart(sf), b.getEnd(), b.text);
          continue;
        }
        record(b.getStart(sf), b.getEnd(), b.text, node, (t) => `tx('${t}')`);
      }
      visit(node.condition);
      for (const b of branches) if (!isTextLit(b)) visit(b);
      return;
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
      isTextLit(node.right) && looksHuman(node.right.text) &&
      !inClassNameContext(node, sf)
    ) {
      record(node.right.getStart(sf), node.right.getEnd(), node.right.text, node,
        (t) => `tx('${t}')`);
    } else if (
      ts.isReturnStatement(node) && node.expression &&
      isTextLit(node.expression) && looksHuman(node.expression.text) &&
      !inClassNameContext(node.expression, sf)
    ) {
      // A sentence computed in a helper and rendered as {subtitle} sits in
      // no JSX text, no attribute, no allowlisted prop. One word may be a
      // status key the API reads back ('Aktiv') — a phrase is copy.
      const text = node.expression.text;
      if (DATE_PATTERN.test(text) || !/\s/.test(text.trim())) {
        pushResidue('return', node.expression.getStart(sf), node.expression.getEnd(), text);
      } else {
        record(node.expression.getStart(sf), node.expression.getEnd(), text, node,
          (t) => `tx('${t}')`);
      }
    } else if (
      ((ts.isVariableDeclaration(node) && node.initializer &&
        isTextLit(node.initializer)) ||
       (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        isTextLit(node.right))) &&
      !inClassNameContext(node, sf)
    ) {
      const lit = ts.isVariableDeclaration(node) ? node.initializer : node.right;
      if (isTextLit(lit) && looksHuman(lit.text) && !DATE_PATTERN.test(lit.text)) {
        if (!/\s/.test(lit.text.trim())) {
          pushResidue('assign', lit.getStart(sf), lit.getEnd(), lit.text);
        } else {
          record(lit.getStart(sf), lit.getEnd(), lit.text, node, (t) => `tx('${t}')`);
        }
      }
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // `new Error('Kein Datensatz zurückgegeben')` is a call argument in
      // every way that matters here.
      const callee = node.expression.getText(sf);
      if (!SKIP_CALLEE.test(callee) && !CN_CALLEES.has(callee)) {
        const isCopy = COPY_CALLEE.test(callee);
        for (const arg of node.arguments ?? []) {
          if (!isTextLit(arg) || !looksHuman(arg.text)) continue;
          if (inClassNameContext(arg, sf) || DATE_PATTERN.test(arg.text)) continue;
          if (!isCopy && !/\s/.test(arg.text.trim())) {
            pushResidue('callarg', arg.getStart(sf), arg.getEnd(), arg.text);
            continue;
          }
          record(arg.getStart(sf), arg.getEnd(), arg.text, node, (t) => `tx('${t}')`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Overlapping edits would corrupt the file — keep the outermost; the
  // zero-width tag inserts never collide with interior replacements.
  edits.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const e of edits) {
    if (kept.length && e.start < kept[kept.length - 1].end) continue;
    kept.push(e);
  }
  residues.sort((a, b) => a.start - b.start);

  return { source, edits: kept, txKeys, residues, moduleScope, hoisted, intentSpans, wrappedTexts };
}

// The rewrite is only allowed out if it still parses (i18n-migrate history:
// an unterminated string literal shipped and npm found it minutes later).
function verifyParses(src, filePath) {
  const sf = ts.createSourceFile(
    filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diags = sf.parseDiagnostics ?? [];
  if (!diags.length) return;
  const d = diags[0];
  const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
  throw new Error(
    `rewrite would not parse (line ${line + 1}: ` +
    `${ts.flattenDiagnosticMessageText(d.messageText, ' ')}) — file left unchanged`,
  );
}

// Wrap needs its runtime imports; add each once, after the last import.
function ensureI18nImport(src, filePath, name) {
  if (new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'@\\/i18n'`).test(src)) return src;
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*'@\/i18n';/);
  if (m) {
    return src.replace(m[0], `import { ${m[1].replace(/^[\s]*|[,\s]*$/g, '')}, ${name} } from '@/i18n';`);
  }
  const sf = ts.createSourceFile(filePath, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let importEnd = 0;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) importEnd = stmt.getEnd();
  }
  return src.slice(0, importEnd) + `\nimport { ${name} } from '@/i18n';` + src.slice(importEnd);
}
const ensureTxImport = (src, filePath) => ensureI18nImport(src, filePath, 'tx');

// ── locale heal: hardcoded date-fns locales ─────────────────────────
// Old agent code pinned the build language's date-fns locale —
// `format(d, 'EEEE', { locale: de })`, `locale={de}` — freezing weekday and
// month names while every tx text switches. Swap those references to
// dateFnsLocale() (the runtime locale) and drop the date-fns/locale import
// when nothing else uses it. Only `locale:` props and `locale={…}` JSX
// attributes are touched — any other use keeps the import and is left alone.
function healHardcodedLocale(source, filePath) {
  if (!source.includes('date-fns/locale')) return { source, healed: 0 };
  const sf = ts.createSourceFile(
    filePath, source, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const importDecls = [];
  const names = new Set();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!/^date-fns\/locale(\/|$)/.test(stmt.moduleSpecifier.text)) continue;
    importDecls.push(stmt);
    const clause = stmt.importClause;
    if (!clause) continue;
    if (clause.name) names.add(clause.name.text);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const el of clause.namedBindings.elements) names.add(el.name.text);
    }
  }
  if (!names.size) return { source, healed: 0 };

  const edits = [];
  let otherUses = 0;
  const inImport = (pos) => importDecls.some((d) => pos >= d.getStart(sf) && pos < d.getEnd());
  const visit = (n) => {
    if (ts.isIdentifier(n) && names.has(n.text) && !inImport(n.getStart(sf))) {
      const p = n.parent;
      if (ts.isPropertyAssignment(p) && p.initializer === n && p.name.getText(sf) === 'locale') {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: 'dateFnsLocale()' });
      } else if (
        ts.isJsxExpression(p) && p.expression === n && p.parent &&
        ts.isJsxAttribute(p.parent) && p.parent.name.getText(sf) === 'locale'
      ) {
        edits.push({ start: n.getStart(sf), end: n.getEnd(), text: 'dateFnsLocale()' });
      } else if (!ts.isPropertyAccessExpression(p) || p.expression === n) {
        // `foo.de` is not our identifier; anything else is a real other use.
        otherUses += 1;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) return { source, healed: 0 };

  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  if (otherUses === 0) {
    // The module only exports locales — a dead import goes out whole.
    for (const d of importDecls) {
      const text = d.getText(sf);
      const idx = out.indexOf(text);
      if (idx === -1) continue;
      let end = idx + text.length;
      if (out[end] === '\r') end += 1;
      if (out[end] === '\n') end += 1;
      out = out.slice(0, idx) + out.slice(end);
    }
  }
  return { source: ensureI18nImport(out, filePath, 'dateFnsLocale'), healed: edits.length };
}

function wrapFile(filePath) {
  const before = readFileSync(filePath, 'utf8');
  const h = healHardcodedLocale(before, filePath);
  const r = scan(filePath, h.source);
  let out = r.source;
  for (const e of [...r.edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
  }
  if (r.edits.length) out = ensureTxImport(out, filePath);
  if (out !== before) {
    verifyParses(out, filePath);
    writeFileSync(filePath, out);
  }
  return {
    file: filePath, wrapped: r.edits.length, hoisted: r.hoisted,
    residue: r.residues.length, moduleScope: r.moduleScope,
    localeHealed: h.healed,
    samples: r.wrappedTexts.slice(0, 8),
  };
}

// ── verify: an independent net (different question, different detector) ──
// Is there source-language prose anywhere OUTSIDE tx and the legacy tables,
// and does any legacy makeT en row still equal its de row?
const GERMAN_WORD = /(^|[^A-Za-zÀ-ž])(?:der|das|den|dem|des|eine|einen|einem|einer|kein|keine|keinen|nicht|noch|und|oder|für|mit|von|vom|zum|zur|aus|bei|ist|sind|wird|werden|wurde|wurden|sofort|jetzt|bitte|alle|alles|ohne|sich|dein|deine|deinen|nächste|nächsten|offene|offenen|neue|neuer|neues)(?![A-Za-zÀ-ž])/i;

function looksGerman(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const words = t.split(' ').filter((w) => /[A-Za-zÀ-ž]{2,}/.test(w));
  if (words.length < 2) return false;          // a lone token is a value, not prose
  if (GERMAN_WORD.test(t)) return true;
  return /[äöüßÄÖÜ]/.test(t);
}

function verifyFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(
    filePath, source, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineNo = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const squash = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 90);

  // Excluded ranges: tx('…')/tx`…` (source text is SUPPOSED to be the build
  // language there), legacy makeT tables and {de,en} locale pairs.
  const ranges = [];
  const rows = {};
  const collect = (n) => {
    if (
      (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'tx') ||
      (ts.isTaggedTemplateExpression(n) && ts.isIdentifier(n.tag) && n.tag.text === 'tx')
    ) {
      // Only the KEY is exempt — slot expressions may hide unmarked prose.
      const key = ts.isCallExpression(n) ? n.arguments[0] : n.template;
      if (key) ranges.push([key.getStart(sf), key.getEnd()]);
    }
    const localeKey = (pr) => pr.name.getText(sf).replace(/['"]/g, '');
    const isLocaleTable =
      ts.isObjectLiteralExpression(n) &&
      ['de', 'en'].every((l) => n.properties.some(
        (pr) => ts.isPropertyAssignment(pr) && localeKey(pr) === l &&
          ts.isObjectLiteralExpression(pr.initializer),
      ));
    const isLocalePair =
      ts.isObjectLiteralExpression(n) && n.properties.length > 0 &&
      n.properties.every((pr) =>
        ts.isPropertyAssignment(pr) && /^(de|en|cs)$/.test(localeKey(pr)) &&
        (ts.isStringLiteral(pr.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(pr.initializer))) &&
      ['de', 'en'].every((l) => n.properties.some((pr) => localeKey(pr) === l));
    if (isLocalePair) ranges.push([n.getStart(sf), n.getEnd()]);
    if (isLocaleTable) {
      ranges.push([n.getStart(sf), n.getEnd()]);
      for (const langProp of n.properties) {
        if (!ts.isPropertyAssignment(langProp) || !ts.isObjectLiteralExpression(langProp.initializer)) continue;
        const lang = localeKey(langProp);
        const row = rows[lang] ?? (rows[lang] = new Map());
        for (const e of langProp.initializer.properties) {
          if (
            ts.isPropertyAssignment(e) &&
            (ts.isStringLiteral(e.initializer) || ts.isNoSubstitutionTemplateLiteral(e.initializer))
          ) row.set(e.name.getText(sf).replace(/['"]/g, ''), e.initializer.text);
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const excluded = (pos) => ranges.some(([a, b]) => pos >= a && pos < b);

  const leftover = [];
  const visit = (n) => {
    let text = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isTemplateExpression(n)) {
      text = [n.head.text, ...n.templateSpans.map((sp) => sp.literal.text)].join(' ');
    } else if (ts.isJsxText(n)) text = n.text;
    if (
      text != null && looksGerman(text) && !excluded(n.getStart(sf)) &&
      !inClassNameContext(n, sf) && !lineOf(source, n.getStart(sf)).includes('i18n-exempt')
    ) {
      leftover.push({
        line: lineNo(n.getStart(sf)), text: squash(text),
        src: lineOf(source, n.getStart(sf)).trim().slice(0, 200),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // Legacy tables only: a row that merely copies the source language is a
  // failed translation, structurally invisible to every gate.
  const untranslated = [];
  const langs = Object.keys(rows);
  if (langs.length >= 2) {
    const [first, ...rest] = langs;
    for (const [key, val] of rows[first]) {
      for (const other of rest) {
        if (rows[other].get(key) === val && looksGerman(val)) {
          untranslated.push({ key, text: squash(val), langs: `${first}=${other}` });
        }
      }
    }
  }
  return { leftover, untranslated };
}

// ── CLI ─────────────────────────────────────────────────────────────

// The default candidate set — the same globs the pipeline's finalize uses
// (agent-owned pages; the three generated public files are scaffold and
// already runtime-localized). Lets `wrap` run WITHOUT a file list as part
// of the standard build command, so every build the agent makes is already
// wrapped and the finalize never needs a rebuild of its own.
function defaultCandidates() {
  const out = [];
  if (existsSync('src/pages/DashboardOverview.tsx')) out.push('src/pages/DashboardOverview.tsx');
  const scaffoldPublic = new Set(['PublicPage.tsx', 'PublicFormPage.tsx', 'registry.tsx']);
  // src/components/custom: fan-out components carry agent-written UI text too.
  // A live run proved the cost of missing them: two unwrapped tooltip literals
  // survived the agent's pre-build wrap and forced the finalize into an 18s
  // rebuild — exactly the rebuild this default set exists to prevent.
  for (const [dir, skip] of [['src/pages/intents', null], ['src/pages/public', scaffoldPublic], ['src/components/custom', null]]) {
    let entries = [];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const f of entries) {
      if (f.endsWith('.tsx') && !(skip && skip.has(f))) out.push(`${dir}/${f}`);
    }
  }
  return out;
}

let [mode, ...files] = process.argv.slice(2);
if (mode === 'wrap' && files.length === 0) {
  files = defaultCandidates();
  if (files.length === 0) { console.log('[]'); process.exit(0); }
}
if (!mode || files.length === 0) {
  console.error('usage: i18n-tx.mjs wrap|extract|intents|verify <files...> (wrap without files = default candidate pages)');
  process.exit(1);
}

if (mode === 'wrap') {
  const results = files.map((f) => {
    try {
      return wrapFile(f);
    } catch (e) {
      return { file: f, error: String(e.message ?? e).slice(0, 160) };
    }
  });
  console.log(JSON.stringify(results));
} else if (mode === 'extract') {
  const perFile = {};
  const texts = new Set();
  const residues = {};
  for (const f of files) {
    let r;
    try {
      r = scan(f);
    } catch (e) {
      perFile[f] = { error: String(e.message ?? e).slice(0, 160) };
      continue;
    }
    for (const key of r.txKeys) if (key.trim()) texts.add(key);
    // Legacy intents labels need translating too (the `intents` mode
    // rewrites them into {de,en} pairs from the same map).
    for (const s of r.intentSpans) texts.add(s.text);
    perFile[f] = {
      texts: r.txKeys.length + r.intentSpans.length,
      unwrapped: r.edits.length,
      residue: r.residues.length,
    };
    if (r.residues.length) {
      residues[f] = r.residues.map(({ kind, line, text, src }) => ({ kind, line, text, src }));
    }
  }
  writeFileSync(TEXTS_FILE, JSON.stringify({ files: perFile, texts: [...texts], residues }, null, 2));
  const residueCount = Object.values(residues).reduce((a, b) => a + b.length, 0);
  console.log(JSON.stringify({ files: perFile, uniqueTexts: texts.size, residue: residueCount }));
} else if (mode === 'intents') {
  const { source, map } = JSON.parse(readFileSync(TRANSLATIONS_FILE, 'utf8'));
  const other = source === 'en' ? 'de' : 'en';
  const results = files.map((f) => {
    try {
      const r = scan(f);
      let out = r.source;
      for (const s of [...r.intentSpans].sort((a, b) => b.start - a.start)) {
        const tr = map[s.text] ?? s.text;
        out = out.slice(0, s.start) +
          `{ ${source}: '${esc(s.text)}', ${other}: '${esc(tr)}' }` +
          out.slice(s.end);
      }
      if (out !== readFileSync(f, 'utf8')) {
        verifyParses(out, f);
        writeFileSync(f, out);
      }
      return { file: f, replaced: r.intentSpans.length };
    } catch (e) {
      return { file: f, error: String(e.message ?? e).slice(0, 160) };
    }
  });
  console.log(JSON.stringify(results));
} else if (mode === 'verify') {
  const out = {};
  for (const f of files) {
    try {
      const r = verifyFile(f);
      if (r.leftover.length || r.untranslated.length) out[f] = r;
    } catch (e) {
      out[f] = { error: String(e && e.message ? e.message : e) };
    }
  }
  console.log(JSON.stringify(out));
} else {
  console.error(`unknown mode '${mode}'`);
  process.exit(1);
}
