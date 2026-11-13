import { useState, type ReactNode } from 'react';
import { IconLoader2, IconEye } from '@tabler/icons-react';
import { t } from '@/i18n';
import { isPreviewMode } from '@/lib/publicClient';
import { PublicColumnContext } from '@/lib/journey/publicColumn';

// Layout shell for public (anonymous) pages — the public counterpart to
// IntentWizardShell. Owns the page chrome every public page shares: centered
// mobile-first column, the hosted-page card (accent strip, title block),
// powered-by footer, and the loading / unavailable states. In the default
// column mode the shell wraps children in that card — pages bring only their
// content (fields, lists, success views) and must NOT add a card of their
// own. `plain` opts out for pages that compose their own surfaces.
//
// Used by agent-built bespoke pages (see the public-builder skill); the
// generic PublicFormPage predates it and renders its own matching chrome.

interface PublicShellProps {
  title?: string;
  description?: string;
  /** Wider column for list layouts (max-w-2xl instead of the 640px default).
   *  A wizard needs no flag: IntentWizardShell registers itself and the shell
   *  widens to the intent pages' column (max-w-4xl) on its own. */
  wide?: boolean;
  /** Landing mode: children own the FULL page width — build full-bleed
   *  sections (hero bands, card grids) with their own inner max-w
   *  containers. The form columns above are far too narrow for that.
   *  Loading/unavailable states still render centered.
   *  In this mode `title`/`description` are IGNORED: the page brings its own
   *  hero, and a shell header would both duplicate it and escape the page's
   *  container. */
  fullBleed?: boolean;
  /** Opt out of the shell's card in column mode: children render on the bare
   *  page background (header above them, as before the card existed). RARE
   *  escape hatch for a page composing several SEPARATE top-level surfaces —
   *  it sacrifices the standardized hosted look. NEVER for wizards:
   *  IntentWizardShell fits inside the card (check-public enforces this). */
  plain?: boolean;
  loading?: boolean;
  /** Renders the friendly "not available" card instead of children. */
  unavailable?: boolean;
  children?: ReactNode;
}

export function PublicShell({ title, description, wide, fullBleed, plain, loading, unavailable, children }: PublicShellProps) {
  // A wizard inside the card asks for the wizard column (see publicColumn.ts):
  // two calendar months need ~672px of container, the 640px form column gave
  // one month and clipped record cards (live).
  const [wizard, setWizard] = useState(false);
  const column = wizard ? 'max-w-4xl' : wide ? 'max-w-2xl' : 'max-w-[640px]';
  let body: ReactNode;
  if (loading) {
    body = (
      <div className="flex justify-center pt-16" data-public-loading="">
        <IconLoader2 size={28} stroke={1.5} className="animate-spin text-muted-foreground" />
      </div>
    );
  } else if (unavailable) {
    body = (
      <div className="rounded-[27px] bg-card shadow-lg p-6 sm:p-8 text-center" data-public-unavailable="">
        <h1 className="text-xl font-medium mb-2">{t('pf_unavailable_title')}</h1>
        <p className="text-muted-foreground">{t('pps_unavailable_message')}</p>
      </div>
    );
  } else if (fullBleed || plain) {
    body = (
      <>
        {/* The shell's own header is for the CENTERED column only. In
            full-bleed mode the page owns the whole width and brings its own
            hero band — a second <h1> here would print the title twice AND
            sit outside the page's inner container (the shell's <main> has no
            max-width in that mode), so it lands flush against the viewport
            edge. A live landing page shipped exactly that: "Weekly Class
            Schedule" unstyled at the top-left, the real hero right below it.
            Passing `title` alongside `fullBleed` is now simply ignored
            instead of being a rule the page has to remember. */}
        {title && !fullBleed ? (
          <header className="mb-6">
            <h1 className="text-2xl font-normal">{title}</h1>
            {description ? <p className="text-base text-[var(--text-subtle)] mt-1">{description}</p> : null}
          </header>
        ) : null}
        {children}
      </>
    );
  } else {
    // Hosted-page card — the anatomy every major form host shares (tinted
    // page, white card, accent strip, title block). The shell provides it so
    // a bespoke page looks finished with zero layout work; pages must not
    // nest another card inside (use `plain` to opt out instead).
    body = (
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
        <div className="h-2 bg-primary" aria-hidden="true" />
        <div className="p-6 sm:p-8">
          {title ? (
            <header className="mb-6 pb-5 border-b border-border">
              <h1 className="text-2xl font-semibold">{title}</h1>
              {description ? <p className="text-base text-[var(--text-subtle)] mt-1">{description}</p> : null}
            </header>
          ) : null}
          {children}
        </div>
      </div>
    );
  }

  // States always render in the centered column; full-bleed applies only
  // to real page content.
  const constrained = !fullBleed || loading || unavailable;
  // Owner preview of a draft. Deliberately loud and sticky: a submit from
  // here creates a REAL record, and the page otherwise looks exactly like the
  // live one — which is the point, and the risk.
  const preview = isPreviewMode();
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {preview ? (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
          <IconEye size={14} stroke={1.5} className="shrink-0" />
          <span>{t('ps_preview_banner')}</span>
        </div>
      ) : null}
      <main className={`flex-1 w-full ${constrained ? `${column} mx-auto px-4 py-8 sm:py-12` : ''}`}>
        <PublicColumnContext.Provider value={setWizard}>{body}</PublicColumnContext.Provider>
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        {t('pf_powered_by_text')}
      </footer>
    </div>
  );
}
