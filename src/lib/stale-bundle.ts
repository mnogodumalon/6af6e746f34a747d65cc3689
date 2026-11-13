/**
 * stale-bundle.ts — turns a dead lazy chunk into exactly one reload.
 *
 * WHY THIS EXISTS
 * Every deploy archives the previous build and DELETES its files from the live
 * prefix. Flow pages and public pages are lazy chunks with hashed names, so a tab
 * that was open across a deploy asks for a file that no longer exists:
 * "Failed to fetch dynamically imported module: …/AuftragAnlegenPage-8gCJtkh9.js".
 * React surfaces that through Suspense, the ErrorBoundary replaces the whole
 * dashboard, and the session is over — for something a reload fixes. Live case:
 * a tab open 99 minutes, one click into a flow, dead.
 *
 * Before the flows were code-split this could not happen: a stale tab kept
 * working on its own single bundle. The blast radius grew with the splitting.
 *
 * THE DECISION MUST BE SYNCHRONOUS
 * Vite dispatches a cancelable `vite:preloadError` and rethrows only if nobody
 * called `preventDefault()`. So `preventDefault()` has to fall inside the event
 * handler — there is no awaiting a `fetch` first, and preventing the throw
 * WITHOUT then reloading would leave React resolving a lazy component to
 * `undefined`, which is a worse error than the one we caught.
 *
 * That is why the live version is polled AHEAD of time and cached: at error time
 * the choice is a string comparison.
 *
 *   version differs, or unknown  →  we may be stale. preventDefault + reload.
 *                                   HashRouter keeps the route, so the user
 *                                   lands where they clicked.
 *   version provably the SAME    →  the asset is genuinely gone, i.e. a broken
 *                                   deploy. Do NOTHING: a reload cannot help,
 *                                   and a reload loop would hide the defect.
 *                                   The error takes its normal path to the
 *                                   ErrorBoundary and to Sentry.
 *
 * The one-shot flag is per TAB and not per URL on purpose: after a reload we run
 * the NEW index, so a second dead chunk can only mean a broken deploy — which
 * must surface rather than loop.
 */
import { BUNDLE_VERSION } from '@/lib/sentry';

const RELOADED_FLAG = 'klar:stale-bundle-reloaded';

/** Live deployment version, as last seen. `null` = not known (never fetched, or
 *  version.json unreachable) — treated as "may be stale". */
let liveVersion: string | null = null;

async function refreshLiveVersion(): Promise<void> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data: unknown = await res.json();
    const v = (data as { version?: unknown } | null)?.version;
    if (typeof v === 'string' && v) liveVersion = v;
  } catch {
    // Offline or blocked — keep whatever we had; unknown means "may be stale".
  }
}

void refreshLiveVersion();

// A tab the user returns to is exactly the tab that is about to click something,
// and it is the one most likely to have slept through a deploy. Refreshing here
// (rather than on a timer) keeps the cache warm when it matters and costs nothing
// while the tab is hidden.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshLiveVersion();
});

window.addEventListener('vite:preloadError', ((event: Event) => {
  const provablyCurrent = !!liveVersion && !!BUNDLE_VERSION && liveVersion === BUNDLE_VERSION;
  if (provablyCurrent) return;                              // broken deploy — let it surface
  if (sessionStorage.getItem(RELOADED_FLAG)) return;        // already tried in this tab

  event.preventDefault();
  try {
    sessionStorage.setItem(RELOADED_FLAG, String(Date.now()));
  } catch {
    // Private mode without storage: the reload below still runs, and the worst
    // case is one extra reload per click instead of per tab.
  }
  window.location.reload();
}) as EventListener);
