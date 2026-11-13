import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyIntentPolicy, clearFieldPolicy, intentSlugOf } from '@/lib/journey/intentPolicy';

// Mounted once inside the router (App.tsx): follows the location and keeps
// the journey layer's policy registry in step with the flow on screen.
//   /intents/<slug>  → the owner's rules for that flow (intent-policies.json)
//   /public/…        → hands off: publicClient registers the page's own policy
//   anything else    → registry cleared, so no rule outlives its flow
// The registry is a module singleton (policy.ts); without this reset a rule
// set on one route would still apply on the next one in the same SPA session.
export function IntentPolicyLoader() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname.startsWith('/public')) return;
    const slug = intentSlugOf(pathname);
    if (!slug) { clearFieldPolicy(); return; }
    let cancelled = false;
    void applyIntentPolicy(slug).then(() => { if (cancelled) clearFieldPolicy(); });
    return () => { cancelled = true; clearFieldPolicy(); };
  }, [pathname]);
  return null;
}
