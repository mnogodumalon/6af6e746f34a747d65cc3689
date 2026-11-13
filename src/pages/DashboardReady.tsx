// Generator-owned FIRST-LOAD gate (the "Ready-Wrapper") — regenerated on every
// update, never edited by the agent.
//
// Runs the data hook, shows the pre-generated Skeleton/Error surfaces until
// the first fetch succeeded, then mounts DashboardOverview with loaded data —
// and never unmounts it again: useDashboardData() flips `loading` exactly
// once, later fetchAll() calls are silent refreshes, and an error from one of
// those does not tear the page down to the error card (local state such as
// filters and open dialogs survives). The page therefore has no loading/error
// early-return to keep its hooks above — the React #310 class this file
// exists to remove.
import { useRef, useState } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import DashboardOverview from '@/pages/DashboardOverview';

export default function DashboardReady() {
  const data = useDashboardData();
  const [retrying, setRetrying] = useState(false);
  // Latched on the first successful load; a later failed refresh (fetchAll in
  // a catch path sets `error`) leaves the mounted page alone.
  const loadedOnce = useRef(false);
  if (!data.loading && !retrying && !data.error) loadedOnce.current = true;

  if (!loadedOnce.current) {
    if (data.loading || retrying) return <DashboardSkeleton />;
    if (data.error) {
      return (
        <DashboardError
          error={data.error}
          onRetry={() => {
            // The hook only sets loading=true on mount; hold the skeleton
            // ourselves until the retry settles instead of flashing an empty page.
            setRetrying(true);
            void data.fetchAll().finally(() => setRetrying(false));
          }}
        />
      );
    }
  }
  return <DashboardOverview data={data} />;
}
