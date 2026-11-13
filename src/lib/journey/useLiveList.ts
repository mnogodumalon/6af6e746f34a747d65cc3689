/**
 * useLiveList — records that keep up with the platform, on EITHER door.
 *
 * The internal flow page and the public page (a beamer view, a public
 * counter) both read through a JourneyPort; this hook polls `port.list`,
 * pauses while the tab is hidden, never toasts a failed poll (the rows stay,
 * `stale` says so) and refreshes at once on the assistant's
 * `assistant:data-changed` (S-1, 03.11.2026). The dashboard's typed sibling is
 * `useLiveRecords` in `@/hooks/useLiveRecords` (internal door only, with a
 * pending-write overlay); this one is door-agnostic and deliberately plain.
 *
 *   const live = useLiveList(port, 'beitraege', { intervalMs: 10000, list: { filter: "r.v_freigabe == 'ja'" } });
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { reportReadFailure } from './readFailures';
import type { EntityKey } from './rules';
import type { JourneyPort, JourneyRecord, ListOptions } from './port';

export { useFailingLists } from './readFailures';

/** The slowest poll a PUBLIC page may run (EF-20, Bau 14: two lists at 3 s on one open form
 *  sent 66 requests a minute, every read with its own proof-of-work challenge; 9 got 429 and a
 *  send in such a phase failed). Correctness at send time is freshRef's job, not the poll's. */
export const PUBLIC_MIN_INTERVAL_MS = 20_000;
/** EF-42: random start offset of a public poll, so a hall full of phones does not poll in lockstep. */
export const POLL_JITTER_MS = 5_000;

export interface LiveListOptions {
  /** Poll every … ms (default 15 000; 0 = first load + events only). */
  intervalMs?: number;
  /** Skip polls while the tab is hidden, fetch once on return (default true). */
  pauseHidden?: boolean;
  /** Keep the last rows when a poll fails and mark them stale (default true). */
  keepOnError?: boolean;
  /** The port's list options (filter, limit, …). */
  list?: ListOptions;
  enabled?: boolean;
}

export interface LiveListState {
  records: JourneyRecord[];
  loading: boolean;
  error: Error | null;
  /** A load has SUCCEEDED at least once. A page says „unknown link“ only when this is
   *  true — before it, empty rows mean „not loaded“ (P-17, Abnahme 8: a 429 read as
   *  „Dieser Link passt zu keiner Veranstaltung“, with no way to try again). */
  loaded: boolean;
  stale: boolean;
  lastSync: Date | null;
  reload: () => Promise<void>;
}

export function useLiveList(port: JourneyPort | null | undefined, entity: EntityKey, options: LiveListOptions = {}): LiveListState {
  const { intervalMs = 15_000, pauseHidden = true, keepOnError = true, enabled = true } = options;
  const listKey = JSON.stringify(options.list ?? {});
  const [records, setRecords] = useState<JourneyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stale, setStale] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [failures, setFailures] = useState(0);
  const pauseUntil = useRef(0);
  const backoffN = useRef(0);
  const alive = useRef(true);
  const seq = useRef(0);

  const fetchOnce = useCallback(async () => {
    if (!enabled || !port) return;
    const my = ++seq.current;
    try {
      const rows = await port.list(entity, JSON.parse(listKey) as ListOptions);
      if (!alive.current || my !== seq.current) return;   // a newer fetch answered already
      setRecords(rows); setError(null); setStale(false); setLastSync(new Date()); setLoaded(true); setFailures(0); backoffN.current = 0; pauseUntil.current = 0;
    } catch (err) {
      if (!alive.current || my !== seq.current) return;
      // a failing public read backs off (20 s, 40 s, 80 s, at most 2 min) — the rows stay on screen;
      // a 429 that names its Retry-After is waited out at least that long (EF-42)
      if (port?.door === 'public') {
        backoffN.current += 1;
        const after = (err as { retryAfterMs?: number | null } | null)?.retryAfterMs ?? 0;
        pauseUntil.current = Date.now() + Math.max(Math.min(PUBLIC_MIN_INTERVAL_MS * 2 ** (backoffN.current - 1), 120_000), Math.min(after, 120_000));
      }
      setError(err instanceof Error ? err : new Error(String(err)));
      setStale(true);
      setFailures(n => n + 1);
      if (!keepOnError) setRecords([]);
    } finally {
      if (alive.current && my === seq.current) setLoading(false);
    }
  }, [port, entity, listKey, enabled, keepOnError]);

  useEffect(() => {
    alive.current = true;
    void fetchOnce();
    return () => { alive.current = false; };
  }, [fetchOnce]);

  useEffect(() => {
    if (!enabled) return;
    const every = intervalMs > 0 && port?.door === 'public' ? Math.max(intervalMs, PUBLIC_MIN_INTERVAL_MS) : intervalMs;
    const tick = () => {
      if (pauseHidden && typeof document !== 'undefined' && document.hidden) return;
      if (Date.now() < pauseUntil.current) return;
      void fetchOnce();
    };
    // EF-42: the interval starts 0–5 s late at random — 30 phones that scanned the same QR
    // used to poll in lockstep and meet the platform's per-minute limit together
    let timer: number | null = null;
    const starter = every > 0
      ? window.setTimeout(() => { timer = window.setInterval(tick, every); }, port?.door === 'public' ? Math.floor(Math.random() * POLL_JITTER_MS) : 0)
      : null;
    const onVisible = () => { if (!document.hidden) void fetchOnce(); };
    const onChanged = () => { void fetchOnce(); };
    if (pauseHidden) document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('assistant:data-changed', onChanged);
    return () => {
      if (starter !== null) window.clearTimeout(starter);
      if (timer !== null) window.clearInterval(timer);
      if (pauseHidden) document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('assistant:data-changed', onChanged);
    };
  }, [fetchOnce, intervalMs, pauseHidden, enabled, port]);

  // until the FIRST load succeeds, try again by itself — 2 s, 5 s, 10 s, then every 15 s —
  // even when the list never polls (intervalMs 0): a 429/503 or a dropped connection on
  // opening the page must not leave it empty for good
  useEffect(() => {
    if (!enabled || loaded || failures === 0) return;
    const wait = Math.max([2000, 5000, 10_000][failures - 1] ?? 15_000, pauseUntil.current - Date.now());
    const t = window.setTimeout(() => { void fetchOnce(); }, wait);
    return () => window.clearTimeout(t);
  }, [failures, loaded, enabled, fetchOnce]);

  const listId = useId();
  useEffect(() => {
    reportReadFailure(listId, error && !loaded ? String(entity) : null);
  }, [listId, error, loaded, entity]);
  useEffect(() => () => reportReadFailure(listId, null), [listId]);
  return { records, loading, error, loaded, stale, lastSync, reload: fetchOnce };
}
