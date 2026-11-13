import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  IconWorld, IconCheck, IconLink, IconExternalLink, IconLoader2, IconAlertTriangle,
  IconAdjustments, IconEye, IconTicket, IconPencil, IconTrash, IconPlus, IconQrcode,
} from '@tabler/icons-react';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  listPublicPages, setPublished, getShareLinks,
  type PublicPageSummary, type ShareLink,
} from '@/lib/publicPagesAdmin';
import { PageJobDialog, type PageJobTarget } from '@/components/PageJobDialog';
import { JobStateBadge, JobStateRow } from '@/components/PageJobStatus';
import { usePageJobs } from '@/hooks/usePageJobs';
import { dismissPageJob, type PageOp, type PageJobRecord } from '@/lib/pageJobs';
import { t } from '@/i18n';
import { QrCode, qrSvgString } from '@/components/widgets/QrCode';

// Owner-facing management of the dashboard's public pages. Same-origin fetch
// to /claude carries the LA session automatically. Anonymous visitors never
// reach this — it lives inside the authenticated Layout.
//
// All text resolves through t() at render time — a module-scope map of
// translated strings would go stale on a language switch.

function originLabel(o: string): string {
  return o === 'auto' ? t('ppa_origin_auto') : o === 'agent' ? t('ppa_origin_agent') : t('ppa_origin_user');
}

// Plain-language summary of what a page's link grants — the owner confirms
// THIS, never the underlying policy. Built from the field/endpoint config.
// EVERY endpoint, not the first of each kind: a live page created three
// entities and read all order numbers, and the dialog named one entity's
// fields plus "nobody can see existing data". The owner consents to what the
// link grants — this list has to be complete.
function capabilities(page: PublicPageSummary): { submit: string[]; view: string[] } {
  const submit: string[] = [];
  const view: string[] = [];
  if (page.type === 'custom' && page.endpoints && page.endpoints.length > 0) {
    for (const e of page.endpoints) {
      const labels = e.fields.map(f => f.label).join(', ');
      if (e.op === 'create') submit.push(labels);
      else if (e.op === 'list') view.push(e.scope_description ? `${e.scope_description} — ${labels}` : labels);
    }
  } else {
    submit.push(page.fields.map(f => f.label).join(', '));
  }
  return { submit, view };
}

export default function PublicPagesAdmin() {
  const navigate = useNavigate();
  const [pages, setPages] = useState<Record<string, PublicPageSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [confirmSlug, setConfirmSlug] = useState<string | null>(null);
  // Per-record links: a page declaring a link_param is unusable through its
  // bare URL, so the owner picks the record here and copies THAT link.
  const [linksSlug, setLinksSlug] = useState<string | null>(null);
  const [links, setLinks] = useState<ShareLink[]>([]);
  // Agent jobs: a new page from a prompt, a change to an existing one, a removal.
  const [job, setJob] = useState<{ op: PageOp; target?: PageJobTarget; initialPrompt?: string } | null>(null);
  const { jobs, refresh: refreshJobs } = usePageJobs('public');
  const createJobs = jobs.filter(j => !j.target && j.status !== 'done');
  const jobFor = (slug: string) => jobs.find(j => j.target === slug && j.status !== 'done');
  const retryJob = (j: PageJobRecord) => {
    const target = j.target ? { slug: j.target, title: pages[j.target]?.title ?? j.target } : undefined;
    setJob({ op: j.op, target, initialPrompt: j.prompt });
    dismissPageJob(j.id).catch(() => undefined).then(() => void refreshJobs());
  };
  const [linksLoading, setLinksLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  // The QR of a link (S-7): a poster, a beamer, a flyer — scanning beats typing
  // ~110 characters. One dialog for the page's own link and for a per-record link.
  const [qr, setQr] = useState<{ url: string; label: string; file: string } | null>(null);
  const downloadQr = () => {
    if (!qr) return;
    const blob = new Blob([qrSvgString(qr.url, { margin: 4 })], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `qr-${qr.file}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const load = async () => {
    try {
      setPages(await listPublicPages());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const applyPublished = async (slug: string, published: boolean) => {
    setBusySlug(slug);
    setConfirmSlug(null);
    try {
      const updated = await setPublished(slug, published);
      setPages(prev => ({ ...prev, [slug]: updated }));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusySlug(null);
    }
  };

  const copy = async (page: PublicPageSummary) => {
    try {
      await navigator.clipboard.writeText(page.share_url);
      setCopiedSlug(page.slug);
      setTimeout(() => setCopiedSlug(c => (c === page.slug ? null : c)), 1500);
    } catch {
      // clipboard unavailable — the open link still works
    }
  };

  const openLinks = async (slug: string) => {
    setLinksSlug(slug);
    setLinksLoading(true);
    try {
      setLinks((await getShareLinks(slug)).links);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLinksSlug(null);
    } finally {
      setLinksLoading(false);
    }
  };

  const copyLink = async (link: ShareLink) => {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedLink(link.record_id);
      setTimeout(() => setCopiedLink(c => (c === link.record_id ? null : c)), 1500);
    } catch {
      // clipboard unavailable — the link stays selectable in the list
    }
  };

  const policyCount = (page: PublicPageSummary): number => {
    const pol = page.policy;
    if (!pol) return 0;
    const fields = Object.values(pol.fields || {}).reduce((n, rules) => n + Object.keys(rules).length, 0);
    const lists = Object.values(pol.lists || {}).reduce((n, l) => n + (l.hidden?.length ?? 0), 0);
    return fields + lists + Object.keys(pol.texts || {}).length;
  };

  const entries = Object.values(pages).sort((a, b) => a.title.localeCompare(b.title));
  const confirmPage = confirmSlug ? pages[confirmSlug] : null;
  const caps: { submit: string[]; view: string[] } = confirmPage ? capabilities(confirmPage) : { submit: [], view: [] };

  return (
    <PageShell
      title={t('ppa_title')}
      subtitle={t('ppa_subtitle')}
      action={(
        <Button onClick={() => setJob({ op: 'create' })}>
          <IconPlus size={16} stroke={1.5} className="mr-1" />
          {t('ppa_new_agent')}
        </Button>
      )}
    >
      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          <IconAlertTriangle size={18} stroke={1.5} className="shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <IconLoader2 size={28} stroke={1.5} className="animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 && createJobs.length === 0 ? (
        <div className="rounded-[27px] bg-card shadow-lg p-8 text-center text-muted-foreground">
          {t('ppa_empty')}
        </div>
      ) : (
        <div className="rounded-[27px] bg-card shadow-lg overflow-hidden divide-y divide-border">
          {createJobs.map(j => (
            <JobStateRow key={j.id} job={j} onRetry={retryJob} onDismissed={() => void refreshJobs()} />
          ))}
          {entries.map(page => (
            <div key={page.slug} className="flex items-center gap-4 px-6 py-4 min-w-0">
              <IconWorld size={20} stroke={1.5} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">{page.title}</span>
                  <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
                    {originLabel(page.origin)}
                  </span>
                  {policyCount(page) > 0 ? (
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t('ppa_policy_changed', { n: policyCount(page) })}
                    </span>
                  ) : null}
                  {jobFor(page.slug) ? <JobStateBadge job={jobFor(page.slug)!} /> : null}
                  {jobFor(page.slug)?.status === 'failed' ? (
                    <button type="button" onClick={() => retryJob(jobFor(page.slug)!)} className="shrink-0 text-xs text-primary underline underline-offset-2">{t('pj_retry')}</button>
                  ) : null}
                </div>
                <span className={`text-xs ${page.published ? 'text-primary' : 'text-muted-foreground'}`}>
                  {page.published ? t('ppa_status_published') : t('ppa_status_draft')}
                  {!page.published && page.republish ? <span className="ml-2 text-destructive">{t('ppa_republish')}</span> : null}
                </span>
              </div>

              {/* Opening works for a DRAFT too — the page then renders as the
                  owner's preview (see publicClient). There is deliberately no
                  separate preview button: a page reached with a record
                  parameter has no meaningful URL of its own, so a second entry
                  point would hand out broken links. Copying, however, stays
                  published-only — a draft link is worthless to a visitor. */}
              <div className="flex items-center gap-1 shrink-0">
                <a
                  href={page.share_url}
                  target="_blank"
                  rel="noreferrer"
                  title={page.published ? t('ppa_open') : t('ppa_preview')}
                  aria-label={page.published ? t('ppa_open') : t('ppa_preview')}
                  className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {page.published
                    ? <IconExternalLink size={18} stroke={1.5} />
                    : <IconEye size={18} stroke={1.5} />}
                </a>
                {page.published ? (
                  <button
                    type="button"
                    title={copiedSlug === page.slug ? t('ppa_copied') : t('ppa_copy')}
                    aria-label={t('ppa_copy')}
                    onClick={() => copy(page)}
                    className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {copiedSlug === page.slug ? <IconCheck size={18} stroke={1.5} /> : <IconLink size={18} stroke={1.5} />}
                  </button>
                ) : null}
                {page.published && !page.link_param ? (
                  <button
                    type="button"
                    title={t('ppa_qr')}
                    aria-label={t('ppa_qr')}
                    onClick={() => setQr({ url: page.share_url, label: page.title, file: page.slug })}
                    className="p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <IconQrcode size={18} stroke={1.5} />
                  </button>
                ) : null}
              </div>

              {page.link_param ? (
                <button
                  type="button"
                  title={t('ppa_links')}
                  aria-label={t('ppa_links')}
                  onClick={() => openLinks(page.slug)}
                  className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <IconTicket size={18} stroke={1.5} />
                </button>
              ) : null}

              <button
                type="button"
                title={t('ppa_edit_agent')}
                aria-label={t('ppa_edit_agent')}
                onClick={() => setJob({ op: 'edit', target: { slug: page.slug, title: page.title } })}
                className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <IconPencil size={18} stroke={1.5} />
              </button>
              <button
                type="button"
                title={t('ppa_delete')}
                aria-label={t('ppa_delete')}
                onClick={() => setJob({ op: 'delete', target: { slug: page.slug, title: page.title } })}
                className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              >
                <IconTrash size={18} stroke={1.5} />
              </button>

              <button
                type="button"
                title={t('ppa_policy_title')}
                aria-label={t('ppa_policy_title')}
                onClick={() => navigate(`/verwaltung/oeffentliche-seiten/${encodeURIComponent(page.slug)}/felder`)}
                className={`shrink-0 p-2 rounded-xl transition-colors ${policyCount(page) > 0 ? 'text-primary hover:bg-primary/10' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}
              >
                <IconAdjustments size={18} stroke={1.5} />
              </button>

              <Button
                variant={page.published ? 'outline' : 'default'}
                size="sm"
                className="shrink-0"
                disabled={busySlug === page.slug}
                onClick={() =>
                  page.published ? applyPublished(page.slug, false) : setConfirmSlug(page.slug)
                }
              >
                {busySlug === page.slug ? (
                  <IconLoader2 size={16} stroke={1.5} className="animate-spin" />
                ) : page.published ? (
                  t('ppa_pause')
                ) : (
                  t('ppa_publish')
                )}
              </Button>
            </div>
          ))}
        </div>
      )}

      <PageJobDialog
        open={job !== null}
        onOpenChange={v => !v && setJob(null)}
        kind="public"
        op={job?.op ?? 'create'}
        target={job?.target}
        initialPrompt={job?.initialPrompt}
        onStarted={() => void refreshJobs()}
        onDone={() => { void load(); void refreshJobs(); }}
      />

      <Dialog open={!!confirmPage} onOpenChange={v => !v && setConfirmSlug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ppa_confirm_title')}</DialogTitle>
            <DialogDescription>{confirmPage?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            {confirmPage?.link_param ? (
              <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground">{t('ppa_link_param_note')}</p>
            ) : null}
            {caps.submit.map((line, i) => (
              <p key={`s${i}`}><span className="font-medium">{t('ppa_can_do')}</span> {t('ppa_can_submit')} <span className="text-muted-foreground">({line})</span></p>
            ))}
            {caps.view.map((line, i) => (
              <p key={`v${i}`}><span className="font-medium">{t('ppa_can_do')}</span> {t('ppa_can_view')} <span className="text-muted-foreground">({line})</span></p>
            ))}
            <p><span className="font-medium">{t('ppa_cannot_do')}</span> {caps.view.length > 0 ? t('ppa_cannot_change_line') : t('ppa_cannot_line')}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSlug(null)}>{t('ppa_cancel')}</Button>
            <Button onClick={() => confirmPage && applyPublished(confirmPage.slug, true)}>
              {t('ppa_confirm_publish')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!linksSlug} onOpenChange={v => !v && setLinksSlug(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ppa_links_title')}</DialogTitle>
            <DialogDescription>{t('ppa_links_intro')}</DialogDescription>
          </DialogHeader>
          {linksLoading ? (
            <div className="flex justify-center py-8">
              <IconLoader2 size={22} stroke={1.5} className="animate-spin text-muted-foreground" />
            </div>
          ) : links.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">{t('ppa_links_empty')}</p>
          ) : (
            <div className="max-h-[60vh] space-y-1 overflow-y-auto">
              {links.map(link => (
                <div
                  key={link.record_id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-accent/50 transition-colors min-w-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{link.label}</div>
                    {link.secondary ? (
                      <div className="truncate text-xs text-muted-foreground">{link.secondary}</div>
                    ) : null}
                  </div>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    title={t('ppa_open')}
                    aria-label={t('ppa_open')}
                    className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <IconExternalLink size={16} stroke={1.5} />
                  </a>
                  <button
                    type="button"
                    title={t('ppa_qr')}
                    aria-label={t('ppa_qr')}
                    onClick={() => setQr({ url: link.url, label: link.label, file: `${linksSlug ?? 'seite'}-${link.record_id}` })}
                    className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <IconQrcode size={16} stroke={1.5} />
                  </button>
                  <button
                    type="button"
                    title={copiedLink === link.record_id ? t('ppa_copied') : t('ppa_copy')}
                    aria-label={t('ppa_copy')}
                    onClick={() => copyLink(link)}
                    className="shrink-0 p-2 rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    {copiedLink === link.record_id
                      ? <IconCheck size={16} stroke={1.5} />
                      : <IconLink size={16} stroke={1.5} />}
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="pt-2 text-xs text-muted-foreground">{t('ppa_links_hint')}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qr} onOpenChange={v => !v && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ppa_qr_title')}</DialogTitle>
            <DialogDescription>{qr?.label}</DialogDescription>
          </DialogHeader>
          {qr ? (
            <div className="flex flex-col items-center gap-3">
              <QrCode value={qr.url} size={240} title={qr.label} />
              <p className="break-all text-center text-xs text-muted-foreground">{qr.url}</p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">{t('ppa_qr_intro')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={downloadQr}>{t('ppa_qr_download')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
