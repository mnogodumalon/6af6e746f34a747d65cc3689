import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FieldPolicyEditor } from '@/components/FieldPolicyEditor';
import {
  listPublicPages, getPolicy, updatePolicy,
  type PublicPageSummary, type PolicyCatalog, type PagePolicy,
} from '@/lib/publicPagesAdmin';
import { t } from '@/i18n';

// "Felder anpassen" for ONE public page — a page of its own (route
// verwaltung/oeffentliche-seiten/:slug/felder), not a dialog: the first live
// test put five columns into an overlay that was too narrow, and the
// overlay's exit animation locked the page. The editor is shared with the
// flows (FieldPolicyEditor); this wrapper supplies the page's catalog, its
// title, status and share link.
export default function PublicPageFields() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPageSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPublicPages().then(pages => { if (!cancelled) setPage(pages[slug] ?? null); }).catch(() => { /* the editor reports its own load error */ });
    return () => { cancelled = true; };
  }, [slug]);

  const load = useCallback(() => getPolicy(slug), [slug]);
  const save = useCallback((policy: PagePolicy) => updatePolicy(slug, policy), [slug]);
  const onLoaded = useCallback((cat: PolicyCatalog) => { if (cat.page) setPage(cat.page); }, []);

  return (
    <FieldPolicyEditor
      load={load}
      save={save}
      onLoaded={onLoaded}
      heading={page?.title ?? slug}
      intro={t('ppa_policy_intro')}
      badge={page ? (
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${page.published ? 'bg-primary/10 text-primary' : 'bg-secondary text-secondary-foreground'}`}>
          {page.published ? t('ppa_status_published') : t('ppa_status_draft')}
        </span>
      ) : null}
      backTo="/verwaltung/oeffentliche-seiten"
      backLabel={t('ppa_back_to_pages')}
      view={page ? { href: page.share_url, label: t('ppa_view_page') } : undefined}
      showTexts
      savedText={t('ppa_policy_saved')}
      who={t('ppa_who_visitor')}
    />
  );
}
