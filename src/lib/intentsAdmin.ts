// Owner-facing client for the flows' field policy (same-origin /claude/intents).
// The rows have the public catalog's shape (PolicyCatalog), so FieldPolicyEditor
// renders both; `flow` names the flow, `legacy` marks a page without bindings.
import type { PolicyCatalog, PagePolicy } from '@/lib/publicPagesAdmin';

const APPGROUP_ID = '6af6e746f34a747d65cc3689';
const BASE = '/claude/intents';

export interface IntentPolicyCatalog extends PolicyCatalog {
  legacy?: boolean;
  flow?: { slug: string; label: string; component: string; description: string };
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const detail = body?.detail;
    if (detail && typeof detail === 'object') {
      const errs = detail.policy_errors;
      if (errs && typeof errs === 'object') return Object.entries(errs).map(([k, v]) => `${k}: ${v}`).join('; ');
      if (detail.message) return String(detail.message);
    }
    if (typeof detail === 'string') return detail;
  } catch { /* not JSON */ }
  return `${res.status} ${res.statusText}`;
}

export async function getIntentPolicy(slug: string): Promise<IntentPolicyCatalog> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/${encodeURIComponent(slug)}/policy`, { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function updateIntentPolicy(slug: string, policy: PagePolicy): Promise<IntentPolicyCatalog> {
  const res = await fetch(`${BASE}/${encodeURIComponent(APPGROUP_ID)}/${encodeURIComponent(slug)}/policy`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: policy.fields || {} }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}
