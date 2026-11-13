/**
 * The owner's field policy for flows (Abläufe) — the app-side counterpart of
 * the public pages' policy.
 *
 * A flow has no grant, so nothing enforces the owner's rules server-side; the
 * journey layer keeps them in the app: the same registry (policy.ts) that a
 * public page fills from public-pages.json is filled here from
 * ./intent-policies.json, which the Klar service writes next to the bundle
 * whenever the owner saves the flow's field table (no rebuild) and again
 * after every deploy. IntentPolicyLoader (App.tsx) calls applyIntentPolicy
 * for the flow on screen and clears the registry when the user leaves it, so
 * a rule for one flow never leaks into another — or into a public page.
 *
 * Deliberately NOT re-exported from the journey barrel: page code never
 * calls this — the loader and the admin pages import the module directly.
 */
import { setFieldPolicy, setPickPolicy, type FieldPolicy, type PickPolicy } from './policy';

export interface IntentPoliciesArtifact {
  version: number;
  flows: Record<string, { fields?: FieldPolicy; picks?: PickPolicy }>;
}

let cache: Promise<IntentPoliciesArtifact | null> | null = null;

/** ./intent-policies.json, fetched once per page load (force = again). */
export function loadIntentPolicies(force = false): Promise<IntentPoliciesArtifact | null> {
  if (!cache || force) {
    const base = window.location.href.split('#')[0];
    cache = fetch(new URL('intent-policies.json', base).toString(), { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(cfg => (cfg && typeof cfg === 'object' && cfg.flows && typeof cfg.flows === 'object' ? cfg as IntentPoliciesArtifact : null))
      .catch(() => null);
  }
  return cache;
}

/** The slug of the flow a location shows, or null off the flow routes. */
export function intentSlugOf(pathname: string): string | null {
  const m = /^\/intents\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Register the owner's rules for one flow (none registered when it has none). */
export async function applyIntentPolicy(slug: string): Promise<void> {
  const artifact = await loadIntentPolicies();
  setFieldPolicy(artifact?.flows?.[slug]?.fields ?? null);
  setPickPolicy(artifact?.flows?.[slug]?.picks ?? null);
}

export function clearFieldPolicy(): void {
  setFieldPolicy(null);
  setPickPolicy(null);
}

/** How many rules a flow's policy carries — the badge on the flows' admin row. */
export function intentPolicyCount(artifact: IntentPoliciesArtifact | null, slug: string): number {
  const fields = artifact?.flows?.[slug]?.fields ?? {};
  return Object.values(fields).reduce((n, rules) => n + Object.keys(rules ?? {}).length, 0);
}
