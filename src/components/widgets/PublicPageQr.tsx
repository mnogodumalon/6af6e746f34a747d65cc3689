/**
 * widgets/PublicPageQr.tsx — the QR code and link of a public page about ONE record.
 *
 * @since 2026-11-04 (Abnahme 5: the beamer QR encoded a record's seeded link field)
 *
 *   <PublicPageQr entity="veranstaltungen" recordId={v.record_id} size="34vh" />
 *   const { link } = usePublicPageLink('veranstaltungen', v.record_id);
 *
 * The link is BUILT from the published page whose `link_param` names the entity
 * (public-pages.json — a kept or renamed slug cannot drift): `{origin}{path}
 * #/public/<slug>?<param>=<record id>`, the link the page admin's QR dialog
 * hands out. Never read it from a record's field (check-dashboard gate 27).
 */
import { useEffect, useMemo, useState } from 'react';
import { forgetPublicPagesConfig, loadPublicPagesConfig, type PublicPagesConfig } from '@/lib/publicClient';
import { tx } from '@/i18n';
import { QrCode, type QrCodeProps } from '@/components/widgets/QrCode';

let pagesPromise: Promise<PublicPagesConfig | null> | null = null;

/** The join link for ONE record of `entity`: the published page whose link_param
 *  is that entity (or `page` when several are). null while loading, or when no
 *  such page is published yet. */
export function usePublicPageLink(entity: string, recordId: string | null | undefined, page?: string): { link: string | null; loading: boolean } {
  const [cfg, setCfg] = useState<PublicPagesConfig | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    pagesPromise ??= loadPublicPagesConfig().catch(() => null);
    void pagesPromise.then(c => { if (alive) setCfg(c); });
    return () => { alive = false; };
  }, [tick]);
  const link = useMemo(() => {
    if (!cfg || !recordId) return null;
    const hit = Object.entries(cfg.pages ?? {}).find(([slug, p]) =>
      p.link_param?.entity === entity && (page === undefined || slug === page));
    if (!hit) return null;
    const [slug, p] = hit;
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}#/public/${slug}?${encodeURIComponent(p.link_param!.name)}=${encodeURIComponent(recordId)}`;
  }, [cfg, entity, recordId, page]);
  // a page published while the beamer is already open (Abnahme 7): look again every 30 s until it is there
  useEffect(() => {
    if (link || cfg === undefined) return;
    // both caches go: this hook's and publicClient's page-load cache (S-24: the second kept `{pages: {}}`)
    const t = window.setInterval(() => { pagesPromise = null; forgetPublicPagesConfig(); setTick(n => n + 1); }, 30_000);
    return () => window.clearInterval(t);
  }, [link, cfg]);
  return { link, loading: cfg === undefined };
}

export interface PublicPageQrProps extends Omit<QrCodeProps, 'value'> {
  /** The entity the public page is about (its link_param), e.g. 'veranstaltungen'. */
  entity: string;
  /** The record the link names. */
  recordId: string | null | undefined;
  /** The page's slug when several published pages name the same entity. */
  page?: string;
  /** The link as text under the symbol (default true — a phone that cannot scan still gets in). */
  showLink?: boolean;
  linkClassName?: string;
}

/** A QR code of the join link for one record — never of a record's own link field. */
export function PublicPageQr({ entity, recordId, page, showLink = true, linkClassName, ...qr }: PublicPageQrProps) {
  const { link, loading } = usePublicPageLink(entity, recordId, page);
  if (loading) return null;
  if (!link) {
    return <p data-public-qr-missing className={`text-sm text-muted-foreground ${linkClassName ?? ''}`}>{tx('Die Teilnahmeseite ist noch nicht veröffentlicht.')}</p>;
  }
  return (
    <div className="flex flex-col items-center gap-3" data-public-qr data-public-link={link}>
      <QrCode value={link} {...qr} />
      {showLink ? <p className={`break-all text-center ${linkClassName ?? 'text-sm text-muted-foreground'}`}>{tx('Oder öffne:')} {link}</p> : null}
    </div>
  );
}
