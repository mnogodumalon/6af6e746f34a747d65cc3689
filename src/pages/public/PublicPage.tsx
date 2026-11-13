import { lazy, Suspense, useEffect } from 'react';
import { useParams } from 'react-router-dom';
// Lazy: the generic form renderer (and the DatePicker it carries) only loads
// when a config-driven page needs it — a bespoke page never pays for it (P-2).
const PublicFormPage = lazy(() => import('@/pages/public/PublicFormPage'));
import { PUBLIC_PAGES } from '@/pages/public/registry';
import { loadPublicPagesConfig, type PublicPagesConfig } from '@/lib/publicClient';
import { initPublicLocale } from '@/i18n';

const APP_TITLE = 'Terminabstimmung';

// One config read per SPA session is enough for tab titles — the page
// components below do their own fresh read for the actual content.
let configForTitle: Promise<PublicPagesConfig | null> | undefined;

// Route target for /#/public/:slug. Resolution order: a bespoke page from
// the registry wins; otherwise the generic config-driven form renderer
// takes over. Both read the same runtime config, so upgrading a page never
// changes its shared link.
export default function PublicPage() {
  // Anonymous visitors have no dashboard profile and no stored preference —
  // public chrome follows the BROWSER language. Synchronous and first in the
  // body, so every localized string below (and in every child page) already
  // renders in the visitor's language on the first paint. Never persisted:
  // a visitor must not pin the owner's dashboard locale.
  initPublicLocale();

  const { slug } = useParams<{ slug: string }>();

  // Public pages mount outside <Layout>, so its document.title effect never
  // runs here — without this one the tab keeps the static shell's default.
  useEffect(() => {
    let cancelled = false;
    document.title = APP_TITLE;
    configForTitle ??= loadPublicPagesConfig(slug);
    configForTitle.then((cfg) => {
      const title = slug ? cfg?.pages[slug]?.title : undefined;
      if (!cancelled && title) document.title = `${title} – ${APP_TITLE}`;
    });
    return () => { cancelled = true; };
  }, [slug]);

  const Custom = slug ? PUBLIC_PAGES[slug] : undefined;
  if (Custom) {
    return (
      <Suspense fallback={null}>
        <Custom />
      </Suspense>
    );
  }
  return <Suspense fallback={null}><PublicFormPage /></Suspense>;
}
