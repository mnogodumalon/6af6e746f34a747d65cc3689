#!/usr/bin/env node
// Gate: the Rules of Hooks — a hook called conditionally crashes the page.
//
// React error #310 ("Rendered more hooks than during the previous render")
// takes the WHOLE page down: the ErrorBoundary catches it and the user can do
// nothing. It happens when a hook sits after an early return — the first
// render (loading) runs fewer hooks than the second. Live-proven: a dashboard
// overview whose author even wrote "Early returns AFTER all hooks" above the
// returns, then declared three useCallback below them.
//
// tsc does not see this (it is legal TypeScript), and no hand-written regex
// gets it right — a `return` inside a useMemo callback is not an early return.
// eslint-plugin-react-hooks does it properly on the AST, and ships with the
// base template already.
//
// ONLY `rules-of-hooks` is enabled. The plugin's other rules (exhaustive-deps,
// set-state-in-effect, immutability, …) report >100 findings on the
// generator's own working output — useful advice, but not a build gate.

import { ESLint } from 'eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const eslint = new ESLint({
  // Ignore the project's eslint.config.js: it enables the full recommended
  // set, which would fail every build for style reasons.
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
      },
      plugins: { 'react-hooks': reactHooks },
      rules: { 'react-hooks/rules-of-hooks': 'error' },
    },
  ],
});

// `node scripts/check-hooks.mjs .intents-staging/Page.tsx` lints ONE file —
// check-staging runs it per lane; a conditional useEffect used to pass the lane
// and fail the integration gate (live 07.09.2026, a public page). No argument: src/.
const targets = process.argv.slice(2).filter(a => !a.startsWith('--'));
const results = await eslint.lintFiles(targets.length ? targets : ['src']);
const problems = results.flatMap(r =>
  r.messages
    .filter(m => m.ruleId === 'react-hooks/rules-of-hooks')
    .map(m => ({ file: r.filePath.replace(`${process.cwd()}/`, ''), line: m.line, message: m.message })),
);

if (problems.length > 0) {
  for (const p of problems) {
    console.error(`ERROR: ${p.file}:${p.line}: ${p.message}`);
  }
  console.error(
    '\nMove every hook ABOVE the early returns (or drop the hook — a plain ' +
    'function works when the value is not passed to a memoized child).' +
    '\nMove the HOOK up — never the early returns down. The `if (loading)` / ' +
    '`if (error)` pair is fixed page furniture: a live build "fixed" this by ' +
    'deleting both lines, and needed two more edits to get them back.' +
    '\nFix this with a TARGETED Edit on the flagged lines. Do NOT rewrite the ' +
    'whole file: re-generating a large page to relocate one hook costs a ' +
    'minute and risks losing work that already passed the other gates.',
  );
  process.exit(1);
}
console.log(`check-hooks: OK (${results.length} files)`);
