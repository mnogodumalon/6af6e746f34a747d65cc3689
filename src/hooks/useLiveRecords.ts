/**
 * src/hooks/useLiveRecords.ts — the LIVE building block (generated, never edit).
 *
 * A display surface (the overview's board, a beamer page, a counter) needs
 * records that keep up with the platform without a person pressing anything.
 * Until now (S-1, 03.11.2026) useDashboardData loaded once and refreshed only
 * on `assistant:data-changed`, so every live view rebuilt its own polling —
 * and every network hiccup of such a poll was an error toast (S-9).
 *
 *   const live = useLiveRecords('buchungen', { intervalMs: 15000 });
 *   live.records     // the rows, typed for the entity
 *   live.stale       // true while the last poll failed — the rows are the last good state
 *   live.lastSync    // when the rows last came from the platform
 *   live.apply(id, { status: 'freigegeben' })   // a write of your own, shown at once (S-8)
 *   live.reload()    // one immediate fetch
 *
 * A read that fails sets `error` and goes to Sentry ONCE per entity and reason
 * (0.0.502 beamer: an invalid filter answered 400 on every tick, `keepOnError`
 * kept the empty list and the view showed „Pause“ for good — nobody heard of it).
 * Show `error` when there are no rows; never render the empty state over it.
 *
 * Rules the hook keeps for you: reads are SILENT (no toast; `stale` says it),
 * polling pauses while the tab is hidden and resumes on return, the assistant's
 * `assistant:data-changed` triggers an immediate fetch, and a pending write of
 * yours (`apply`) stays visible until the platform returns the same values —
 * or for 60 s at most — so „Freigeben“ no longer jumps back on the next poll.
 *
 *   useLiveRecord('buchungen', id)   // ONE record the same way (null while unknown)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Umfragen, Terminvorschlaege, Antworten } from '@/types/app';
import { LivingAppsService, type RecordQuery } from '@/services/livingAppsService';
import { Sentry } from '@/lib/sentry';

// one Sentry event per entity + reason for the page's lifetime — a poll repeats its error every tick
const REPORTED = new Set<string>();

function reportLiveError(entity: string, query: string, err: Error): void {
  const status = (err as { status?: number }).status;
  // a network hiccup is `stale`, not a defect; a refused request (4xx) is
  if (!status || status >= 500) return;
  const key = `${entity}|${status}|${err.message}`;
  if (REPORTED.has(key)) return;
  REPORTED.add(key);
  console.error(`[useLiveRecords] ${entity}: ${err.message}`);
  try {
    Sentry.captureException(new Error(`useLiveRecords read refused on '${entity}': ${err.message}`), {
      tags: { live_entity: entity, live_status: String(status) }, extra: { query },
    });
  } catch { /* reporting never breaks the view */ }
}

export type LiveEntity = 'umfragen' | 'terminvorschlaege' | 'antworten';

/** The row type of an entity — the same types useDashboardData hands out. */
export type LiveRow<E extends LiveEntity> =
  E extends 'umfragen' ? Umfragen :
  E extends 'terminvorschlaege' ? Terminvorschlaege :
  E extends 'antworten' ? Antworten :
  never;

type Loader = (q: RecordQuery) => Promise<{ record_id: string; fields: Record<string, unknown>; updatedat?: string | null }[]>;
const LOADERS: Record<LiveEntity, Loader> = {
  'umfragen': q => LivingAppsService.queryUmfragen(q) as unknown as ReturnType<Loader>,
  'terminvorschlaege': q => LivingAppsService.queryTerminvorschlaege(q) as unknown as ReturnType<Loader>,
  'antworten': q => LivingAppsService.queryAntworten(q) as unknown as ReturnType<Loader>,
};

export interface LiveOptions {
  /** Poll every … ms (default 15 000; 0 = no polling, only the first load and the assistant's events). */
  intervalMs?: number;
  /** Skip polls while the tab is hidden and fetch once when it comes back (default true). */
  pauseHidden?: boolean;
  /** On a failed poll keep the last rows and mark them stale (default true); false empties them. */
  keepOnError?: boolean;
  /** The platform query (filter, orderby, limit, fields) — vSQL as everywhere else. */
  query?: Omit<RecordQuery, 'signal' | 'silent'>;
  /** false = do nothing yet (the id is not known, the surface is collapsed). */
  enabled?: boolean;
}

export interface LiveState<R extends { record_id: string; fields: Record<string, unknown> }> {
  records: R[];
  loading: boolean;
  error: Error | null;
  /** The read was refused for want of a login (401) — a bare view asks to sign in, never „connection lost“ (S-26). */
  unauthorized: boolean;
  stale: boolean;
  lastSync: Date | null;
  reload: () => Promise<void>;
  /** A write of your own: shown at once and kept until the platform returns it (S-8). */
  apply: (recordId: string, patch: Partial<R['fields']>) => void;
}

const PENDING_MAX_MS = 60_000;

interface Pending { fields: Record<string, unknown>; at: number }

function overlay<R extends { record_id: string; fields: Record<string, unknown> }>(rows: R[], pending: Map<string, Pending>, now: number): R[] {
  if (pending.size === 0) return rows;
  return rows.map(row => {
    const p = pending.get(row.record_id);
    if (!p) return row;
    const confirmed = Object.entries(p.fields).every(([k, v]) => JSON.stringify(row.fields[k]) === JSON.stringify(v));
    if (confirmed || now - p.at > PENDING_MAX_MS) { pending.delete(row.record_id); return row; }
    return { ...row, fields: { ...row.fields, ...p.fields } };
  });
}

export function useLiveRecords<E extends LiveEntity>(entity: E, options: LiveOptions = {}): LiveState<LiveRow<E>> {
  type R = LiveRow<E>;
  const { intervalMs = 15_000, pauseHidden = true, keepOnError = true, enabled = true } = options;
  // a string key, not the object: an inline `query={{ … }}` is new on every render
  const queryKey = JSON.stringify(options.query ?? {});
  const [records, setRecords] = useState<R[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [stale, setStale] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const inflight = useRef<AbortController | null>(null);

  const fetchOnce = useCallback(async () => {
    if (!enabled) return;
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    try {
      const rows = (await LOADERS[entity]({ ...(JSON.parse(queryKey) as RecordQuery), signal: ctl.signal, silent: true })) as unknown as R[];
      if (ctl.signal.aborted) return;
      setRecords(overlay(rows, pending.current, Date.now()));
      setError(null); setStale(false); setLastSync(new Date());
    } catch (err) {
      if (ctl.signal.aborted || (err instanceof Error && err.name === 'AbortError')) return;
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setStale(true);
      reportLiveError(entity, queryKey, e);
      if (!keepOnError) setRecords([]);
    } finally {
      if (!ctl.signal.aborted) setLoading(false);
    }
  }, [entity, queryKey, enabled, keepOnError]);

  useEffect(() => {
    void fetchOnce();
    return () => inflight.current?.abort();
  }, [fetchOnce]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => { if (!(pauseHidden && typeof document !== 'undefined' && document.hidden)) void fetchOnce(); };
    const timer = intervalMs > 0 ? window.setInterval(tick, intervalMs) : null;
    const onVisible = () => { if (!document.hidden) void fetchOnce(); };
    const onChanged = () => { void fetchOnce(); };
    if (pauseHidden) document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('assistant:data-changed', onChanged);
    return () => {
      if (timer !== null) window.clearInterval(timer);
      if (pauseHidden) document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('assistant:data-changed', onChanged);
    };
  }, [fetchOnce, intervalMs, pauseHidden, enabled]);

  const apply = useCallback((recordId: string, patch: Partial<R['fields']>) => {
    const fields = patch as Record<string, unknown>;
    pending.current.set(recordId, { fields, at: Date.now() });
    setRecords(prev => prev.map(r => (r.record_id === recordId ? { ...r, fields: { ...r.fields, ...fields } } : r)));
  }, []);

  const unauthorized = (error as { status?: number } | null)?.status === 401;
  return { records, loading, error, unauthorized, stale, lastSync, reload: fetchOnce, apply };
}

/** ONE record, live: null until it arrived (or when it does not exist). */
export function useLiveRecord<E extends LiveEntity>(entity: E, recordId: string | null | undefined, options: Omit<LiveOptions, 'query'> = {}): Omit<LiveState<LiveRow<E>>, 'records'> & { record: LiveRow<E> | null } {
  const id = recordId ? String(recordId).replace(/["\\]/g, '') : '';
  const live = useLiveRecords(entity, { ...options, enabled: (options.enabled ?? true) && id !== '', query: { filter: `r.id == "${id}"`, limit: 1 } });
  const { records, ...rest } = live;
  return { ...rest, record: records[0] ?? null };
}
