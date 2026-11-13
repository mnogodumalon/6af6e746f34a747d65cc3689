import { useEffect, useState } from 'react';
import { onPolicyChange, policyVersion } from './policy';

/**
 * Re-render when the owner's field policy arrives — the page config loads
 * after the first render, so a form or a Field mounted before it must pick
 * the rules up. The store itself (policy.ts) stays React-free so the
 * generated rules module can read labels from it without a React import.
 */
export function usePolicyVersion(): number {
  const [v, setV] = useState(policyVersion());
  useEffect(() => {
    const sync = () => setV(policyVersion());
    const off = onPolicyChange(sync);
    sync();
    return off;
  }, []);
  return v;
}
