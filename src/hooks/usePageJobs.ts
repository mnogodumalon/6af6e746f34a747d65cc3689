import { useCallback, useEffect, useRef, useState } from 'react';
import { listPageJobs, PAGE_JOBS_EVENT, type PageJobRecord, type PageKind } from '@/lib/pageJobs';

/**
 * usePageJobs — the page jobs of one kind (flows or public pages), kept fresh.
 *
 * One polling loop: every RUNNING_POLL_MS while a job of this kind runs (a
 * list row says "Wird erstellt · 02:14"), else every idle interval, so a job
 * started from another tab shows up too. A hidden tab skips the request and
 * refreshes the moment it is visible again. A failed request keeps the last
 * known list — a hiccup must not blank the badges — and the loop goes on.
 * `refresh()` fetches now AND re-arms the loop, so a job started from the
 * dialog switches to the fast cadence at once. The dialog also fires
 * PAGE_JOBS_EVENT on start and end — every instance in this tab (sidebar,
 * admin list) kicks immediately, not only the one that opened the dialog.
 */
const RUNNING_POLL_MS = 5000;
const IDLE_POLL_MS = 45000;

export function usePageJobs(kind: PageKind, options: { idleMs?: number } = {}) {
  const [jobs, setJobs] = useState<PageJobRecord[]>([]);
  const runningRef = useRef(false);
  const kickRef = useRef<() => void>(() => undefined);
  const idleMs = options.idleMs ?? IDLE_POLL_MS;

  const fetchOnce = useCallback(async () => {
    try {
      const mine = (await listPageJobs()).filter(j => j.kind === kind);
      runningRef.current = mine.some(j => j.status === 'running');
      setJobs(mine);
    } catch {
      // keep the last known list
    }
  }, [kind]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    const loop = async () => {
      if (cancelled) return;
      if (!document.hidden) await fetchOnce();
      if (cancelled) return;
      timer = window.setTimeout(() => void loop(), runningRef.current ? RUNNING_POLL_MS : idleMs);
    };
    const kick = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      void loop();
    };
    kickRef.current = kick;
    const onVisible = () => {
      if (!document.hidden) kick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PAGE_JOBS_EVENT, kick);
    void loop();
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PAGE_JOBS_EVENT, kick);
    };
  }, [fetchOnce, idleMs]);

  const refresh = useCallback(() => {
    kickRef.current();
  }, []);

  return { jobs, refresh };
}
