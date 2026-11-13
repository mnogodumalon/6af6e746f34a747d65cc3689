import '@/lib/sentry';
import '@/lib/stale-bundle';
import { Fragment, lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { locale, onLocaleChange, syncProfileLocale, t } from '@/i18n';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { IntentPolicyLoader } from '@/components/IntentPolicyLoader';
// Lazy: the dashboard's chrome and pages load only when a dashboard route is
// opened. A visitor on #/public/:slug paid for all of it (header, drawer,
// overview, admin pages — 1068 KB main chunk, 3,8 s on a slow phone; P-2,
// 03.11.2026) although the public page needs none of it.
const Layout = lazy(() => import('@/components/Layout').then(m => ({ default: m.Layout })));
const DashboardReady = lazy(() => import('@/pages/DashboardReady'));
const PublicPagesAdmin = lazy(() => import('@/pages/PublicPagesAdmin'));
const PublicPageFields = lazy(() => import('@/pages/PublicPageFields'));
const IntentFields = lazy(() => import('@/pages/IntentFields'));
const IntentsAdmin = lazy(() => import('@/pages/IntentsAdmin'));
const AppMap = lazy(() => import('@/pages/AppMap'));
// <custom:imports>
const IntentUmfrageAnlegenPage = lazy(() => import('@/pages/intents/UmfrageAnlegenPage'));
import { DashboardSkeleton } from '@/components/DashboardStates';
const IntentUmfrageAbschliessenPage = lazy(() => import('@/pages/intents/UmfrageAbschliessenPage'));
// </custom:imports>

// Lazy: public pages live outside <Layout> and only load on /#/public/:slug —
// dashboard users never pay for them, anonymous visitors skip the dashboard.
const PublicPage = lazy(() => import('@/pages/public/PublicPage'));

function RouteNotFound() {
  const { pathname } = useLocation();
  return (
    <div className="max-w-xl mx-auto mt-16 rounded-[27px] bg-card shadow-lg p-8 space-y-3" role="alert">
      <h1 className="text-xl font-semibold tracking-tight">{t('nf_title')}</h1>
      <p className="text-sm text-muted-foreground break-all">{t('nf_message', { path: pathname })}</p>
      <a href="#/" className="inline-flex text-sm font-medium text-primary hover:underline">{t('nf_back')}</a>
    </div>
  );
}

// Language switch = full remount below the router: every t()/label lookup
// re-evaluates, the la-* widgets re-read <html lang>. Sits inside HashRouter
// so the current route survives (it re-reads the URL hash).
function LocaleGate({ children }: { children: React.ReactNode }) {
  // The i18n layer notifies for locale CHANGES and for catalog/overlay
  // ARRIVALS (same locale, new data). `setCurrent(locale)` bailed out on
  // the arrivals — when locales/pages.json lost the race against the first
  // paint, the page stayed frozen in the build language until the next
  // locale switch. A generation counter accepts every notification; the
  // key must include it because `children` is the same element object on
  // every gate render (React would bail out without the remount).
  const [gen, setGen] = useState(0);
  useEffect(() => onLocaleChange(() => setGen((g) => g + 1)), []);
  // Adopt the LA profile language (SSOT) — but never on public routes,
  // where the visitor's browser language governs (initPublicLocale).
  useEffect(() => {
    if (!window.location.hash.startsWith('#/public')) void syncProfileLocale();
  }, []);
  return <Fragment key={`${locale}:${gen}`}>{children}</Fragment>;
}

const APPGROUP_ID = '6af6e746f34a747d65cc3689';

// The assistant (chat + Werkzeuge + code viewer) is platform chrome:
// <la-klar-assistant>, loaded via /actions-agent/embed/embed.js (appended
// dynamically in index.html). Own shadow DOM, own styling. Mounted OUTSIDE
// LocaleGate on purpose — its keyed remounts (locale switch, catalog
// arrival) must not tear the element down mid-chat; the element follows
// <html lang> itself. Hidden on anonymous public routes; its 401 guard is
// the backstop, not the mechanism.
function AssistantMount() {
  const location = useLocation();
  if (location.pathname.startsWith('/public')) return null;
  return <la-klar-assistant appgroup-id={APPGROUP_ID} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
            <AssistantMount />
            <IntentPolicyLoader />
            <LocaleGate>
            <Routes>
              <Route path="public/:slug" element={<Suspense fallback={null}><PublicPage /></Suspense>} />
              {/* Routes WITHOUT the dashboard chrome (a beamer view, a kiosk page, a print
                  sheet): header, drawer and assistant stay away, the route still runs inside
                  the app (locale, error boundary, Sentry). Wired by
                  `node scripts/wire-intent.mjs --bare`, kept across updates (S-2). */}
              {/* <custom:bare-routes> */}
              {/* </custom:bare-routes> */}
              <Route element={<Suspense fallback={null}><Layout /></Suspense>}>
                <Route index element={<DashboardReady />} />
                <Route path="verwaltung/ablaeufe" element={<IntentsAdmin />} />
                <Route path="verwaltung/anwendung" element={<AppMap />} />
                <Route path="verwaltung/ablaeufe/:slug/felder" element={<IntentFields />} />
                <Route path="verwaltung/oeffentliche-seiten" element={<PublicPagesAdmin />} />
                <Route path="verwaltung/oeffentliche-seiten/:slug/felder" element={<PublicPageFields />} />
                {/* <custom:routes> */}
                <Route path="intents/umfrage-anlegen" element={<Suspense fallback={<DashboardSkeleton />}><IntentUmfrageAnlegenPage /></Suspense>} />
                <Route path="intents/umfrage-abschliessen" element={<Suspense fallback={<DashboardSkeleton />}><IntentUmfrageAbschliessenPage /></Suspense>} />
                {/* </custom:routes> */}
                {/* An unknown hash (a bookmark from before a rebuild renamed the
                    flows, a mistyped link) must not be a blank page. */}
                <Route path="*" element={<RouteNotFound />} />
              </Route>
            </Routes>
            </LocaleGate>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
