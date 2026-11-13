/**
 * flowLinks — where a `#/intents/<slug>` link really goes.
 *
 * Flow pages are written by parallel lanes; a lane knows its own slug and
 * guesses its neighbour's ("#/intents/neue-rechnung" for the flow registered
 * as "rechnung-erstellen" — live, the success screen's follow-up led to
 * "Diese Seite gibt es nicht"). The registry is the truth at runtime, so a
 * link to an unknown flow is redirected to the ONE registered flow that
 * shares a meaningful token, else dropped. Pure: the caller passes the paths.
 */
const FLOW_STOPWORDS = new Set([
  'neu', 'neue', 'neuer', 'neues', 'new', 'create', 'erstellen', 'anlegen', 'stellen',
  'erfassen', 'starten', 'start', 'add', 'hinzufuegen', 'hinzufügen', 'melden', 'planen',
]);

export function flowTokens(pathOrSlug: string): string[] {
  return pathOrSlug
    .toLowerCase()
    .replace(/^#?\/?intents\//, '')
    .split(/[^a-z0-9äöüß]+/)
    .filter(t => t.length > 1 && !FLOW_STOPWORDS.has(t));
}

/** `href` unchanged when it is not a flow link or the flow exists; the unique
 *  token match as a rewritten link; null when nothing fits (drop the action). */
export function resolveFlowHref(href: string, paths: readonly string[]): string | null {
  const m = /^#(\/intents\/[^?#]+)/.exec(href);
  if (!m) return href;
  const wanted = m[1];
  if (paths.includes(wanted)) return href;
  const want = new Set(flowTokens(wanted));
  const hits = paths.filter(p => flowTokens(p).some(t => want.has(t)));
  if (hits.length === 1) return `#${hits[0]}${href.slice(m[0].length)}`;
  return null;
}
