/**
 * RecordView — pre-generated record-detail widget set (Archetype A).
 *
 * The whole detail-view UX (route pages, drawers, modals, lightboxes) ships as
 * composable primitives here. You feed records into compound components; the
 * file owns the shells, the layout, the overlay stack. Compose; never
 * reimplement. Building a custom <Dialog>/<Sheet>/<Drawer> or a
 * `<div className="fixed inset-0">` modal for record details is forbidden —
 * THIS file is the detail surface. Customize via slots, never by editing it.
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. EVERY detail surface MUST include <RecordAttachments appId recordId/>.
 *     Leave it out and the record's files/notes silently disappear.
 *  2. NEVER fork the shell: no custom <Dialog>/<Sheet>/<Drawer>/`fixed
 *     inset-0` for record details. Compose <RecordView>/<RecordOverlay>.
 *  3. In <RecordOverlay>, NEVER navigate away from a <RecordRelation> — push
 *     onto the overlay stack (useRecordOverlayStack) instead. The user opened
 *     a preview; don't rip them out.
 *  4. Zoom belongs on a DETAIL surface (an overlay/header `media` slot): use
 *     <MediaThumbnail> there, never a raw <img> the user can't enlarge. A
 *     clickable list/gallery TILE is ONE click target — it opens the overlay;
 *     its image is a passive `<img className="object-cover">`.
 *  5. Never edit this file. If a slot is missing: unblock via children/render-
 *     prop + // TODO(widget-gap). Never fork, never leave the build red.
 *
 * ─── API at a glance (exact prop / return names — NEVER guess) ─────────
 *
 *  useRecordOverlayStack<T = RecordOverlayStackItem>(initial?: T[]) ->
 *    { stack: T[], top: T|null, current: T|null, open: boolean,
 *      canGoBack: boolean, push(item), pop(), close(), replace(item) }
 *    `current` aliases `top` (the visible item). push/pop drill the stack;
 *    replace opens from outside the overlay; close empties it. T is
 *    UNCONSTRAINED — for ONE entity use its record type
 *    (`useRecordOverlayStack<Buchung>()`, then `replace(b)` / read `top`); a
 *    MULTI-type stack uses a `{ type, id }` union (see the example).
 *
 *  <RecordView        onBack? onEdit? editLabel? backLabel? aside? className?
 *                     children>
 *  <RecordOverlay     open onClose onEdit? onBack?
 *                     placement?: 'side'|'center'   (default 'side')
 *                     size?: 'sm'|'md'|'lg'|'xl'    (default 'md')
 *                     media? footer?(ReactNode OR { label, onClick })
 *                     counter? onPrev? onNext? ariaLabel?
 *                     closeOnBackdropClick?(default true) onBeforeClose?
 *                     editLabel? closeLabel? backLabel? prevLabel? nextLabel?
 *                     className? children>
 *  <RecordOverlayHost overlay={stack}                 — THE one shell per page:
 *                     render:  (top) => ReactNode      the whole stack renders in ONE
 *                     footer?: (top) => ReactNode      <RecordOverlay>, so push/pop swaps
 *                              OR { label, onClick }   the body without a remount blink.
 *                     onEdit?: (top) => void           Back appears from depth 2 on.
 *                     placement? size? className?>     Prefer this over open-flag overlays.
 *  <RecordHeader      title subtitle? media? badges? meta? actions? className?>
 *  <RecordKeyFacts    items: { label, value, icon? }[]   className?>
 *  <RecordSection     title? icon? cols?: 1|2|3 (default 1)  className? children>
 *  <RecordField       label value? format? empty?(default '—') emphasis?
 *                     hideEmpty? className? children?>
 *      format: 'text'|'longtext'|'date'|'datetime'|'currency'|'bool'|'email'|'url'|'pill'
 *               (default 'text')
 *  <RecordRelation    label? name meta? icon? href? onClick? className?>
 *  <RecordTimeline    items: { id?, when?, who?, text, icon?, actions? }[]
 *                     renderItem?(item, index) empty? className?>
 *  <RecordAttachments appId recordId readOnly?>
 *  <RecordViewSkeleton/>
 *  <RecordViewEmpty   icon? title? description? action? className?/>
 *  <RecordViewError   error onRetry? title? retryLabel? className?/>
 *
 *  Every `icon` prop is a COMPONENT reference — `icon={IconBed}`, NOT
 *  `icon={<IconBed/>}`. The `media` slots take a RENDERED element instead:
 *  `media={<img …/>}`.
 *
 *  `format="pill"` reads `.label` off a {key,label} lookup object. For an
 *  APPLOOKUP, pass the resolved display name (an inline helper that maps the
 *  stored URL → label by id; see the example), not the raw field. For
 *  anything the formats don't cover (progress bar, map, rating) pass
 *  `children` instead of `value` — they render under the label; `value`/
 *  `format` are then ignored.
 *
 *  <RecordOverlay> paging vs. stack — distinct: `onPrev`/`onNext` (+`counter`,
 *  ←/→ keys) STEP THROUGH SIBLING records (a gallery); the overlay stack
 *  DRILLS INTO RELATED records. Don't conflate them.
 *
 * ─── ❌ COMMON MISTAKES (real build failures) ──────────────────────────
 *  ❌ <RecordHeader media> / overlay `media` with a raw <img> the user can't
 *     enlarge → use <MediaThumbnail> for a zoomable detail asset.
 *  ❌ Nesting <MediaThumbnail> inside a clickable tile → two click targets
 *     fight (tile-open vs. its own lightbox). Tiles use a passive <img>.
 *  ❌ navigate() from a <RecordRelation> inside a <RecordOverlay> → use
 *     overlay.push(); navigation only on a <RecordView> route page.
 *  ❌ icon={<IconBed/>} → pass the component: icon={IconBed}.
 *  ❌ badges={[{ label: '…' }]} — `badges`/`meta`/`actions` are ReactNode SLOTS
 *     (TS2322): pass RENDERED elements, e.g. badges={<Badge>…</Badge>}. Only
 *     <RecordKeyFacts items> and <RecordTimeline items> take config arrays.
 *     Exception by design: <RecordOverlay footer> ALSO accepts the family
 *     action object { label, onClick } (WorkList/HeroBanner idiom) and
 *     renders the standard full-width primary button from it.
 *  ❌ Forgetting <RecordAttachments> → files/notes silently vanish.
 *  ❌ A hand-rolled `fixed inset-0` modal for details → compose <RecordOverlay>.
 *
 * Full compiling example: ./RecordView.example.tsx
 *
 * @version 1.1.0
 * @since 2026-07-27  (1.1.0: `footer` is shape-tolerant — ReactNode OR the
 *                     family action object { label, onClick } (the WorkList/
 *                     HeroBanner idiom); the object renders the standard
 *                     full-width primary button. Two independent sessions
 *                     inferred exactly that idiom on `footer` and hit TS2322 —
 *                     the family generalization is now correct by design.
 *                     New exports: RecordOverlayAction, RecordOverlayFooter;
 *                     RecordOverlayHost's `footer` return type widened too.)
 * @since 2026-06-03  (1.0.0: first release.)
 */
import { type ReactNode, type ComponentType, isValidElement, useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconArrowLeft, IconPencil, IconX, IconAlertCircle, IconRefresh, IconFileOff, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/formatters';
import { coreLocale as i18nLocale, type CoreLocale as Locale } from '@/i18n';

// The widget's OWN chrome labels. They are prop DEFAULTS, and a destructuring
// default is evaluated per render — so `L()[...]` here stays language-fresh
// while a hoisted `const label = ...` would not.
const LABELS: Record<Locale, {
  edit: string; close: string; back: string; prev: string; next: string;
  notFound: string; loadError: string; retry: string; timelineEmpty: string;
}> = {
  de: {
    edit: 'Bearbeiten', close: 'Schließen', back: 'Zurück',
    prev: 'Vorheriges', next: 'Nächstes',
    notFound: 'Eintrag nicht gefunden', loadError: 'Fehler beim Laden',
    retry: 'Erneut versuchen', timelineEmpty: 'Noch keine Einträge',
  },
  en: {
    edit: 'Edit', close: 'Close', back: 'Back',
    prev: 'Previous', next: 'Next',
    notFound: 'Entry not found', loadError: 'Failed to load',
    retry: 'Try again', timelineEmpty: 'No entries yet',
  },
};
const L = () => LABELS[i18nLocale];

// RecordAttachments — exported under the widget namespace so the agent has a
// single import path for every record-detail building block. The underlying
// component (upload, list, view) is the pre-generated AttachmentsSection.
export { AttachmentsSection as RecordAttachments } from '@/components/AttachmentsSection';

type RecordViewProps = {
  onBack?: () => void;
  onEdit?: () => void;
  editLabel?: string;
  backLabel?: string;
  /**
   * Optional sidebar slot. When provided the layout switches to a 2-column
   * grid on `lg+` (primary content left, sidebar right); on smaller screens
   * the sidebar stacks below the primary content.
   */
  aside?: ReactNode;
  className?: string;
  children?: ReactNode;
};

export function RecordView({ onBack, onEdit, editLabel = L().edit, backLabel = L().back, aside, className, children }: RecordViewProps) {
  const topbar = (onBack || onEdit) ? (
    <div className="flex items-center justify-between gap-3">
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 text-muted-foreground hover:text-foreground">
          <IconArrowLeft className="h-4 w-4 mr-1.5" />
          {backLabel}
        </Button>
      ) : <span />}
      {onEdit && (
        <Button size="sm" onClick={onEdit} className="rounded-full">
          <IconPencil className="h-3.5 w-3.5 mr-1.5" />
          {editLabel}
        </Button>
      )}
    </div>
  ) : null;

  if (aside) {
    return (
      <div className={`flex flex-col gap-6${className ? ` ${className}` : ''}`}>
        {topbar}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
          <div className="flex flex-col gap-6 min-w-0">{children}</div>
          <aside className="flex flex-col gap-6 min-w-0">{aside}</aside>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-6${className ? ` ${className}` : ''}`}>
      {topbar}
      <div className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  );
}

// ── State wrappers ─────────────────────────────────────────────────────
// Drop-in replacements for hand-rolled loading/empty/error states. Use them
// in every record-detail page (route or custom) so the visual idiom stays
// consistent and the agent doesn't reinvent skeletons each time.

export function RecordViewSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" aria-busy="true">
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden p-6 md:p-8 flex flex-col gap-4">
        <div className="h-8 w-2/3 max-w-md rounded-lg bg-muted" />
        <div className="h-4 w-1/3 max-w-xs rounded-lg bg-muted" />
        <div className="flex gap-2 pt-2">
          <div className="h-6 w-20 rounded-full bg-muted" />
          <div className="h-6 w-24 rounded-full bg-muted" />
        </div>
      </div>
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden p-6 md:p-8 flex flex-col gap-5">
        <div className="h-3 w-20 rounded-md bg-muted" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex flex-col gap-2 min-w-0">
              <div className="h-3 w-24 rounded-md bg-muted" />
              <div className="h-5 w-full rounded-md bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type RecordViewEmptyProps = {
  icon?: ComponentType<{ size?: number | string; className?: string; stroke?: number | string }>;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export function RecordViewEmpty({ icon: Icon = IconFileOff, title = L().notFound, description, action, className }: RecordViewEmptyProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-24 gap-4 text-center${className ? ` ${className}` : ''}`}>
      <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
        <Icon size={22} stroke={1.75} />
      </div>
      <div className="flex flex-col gap-1 max-w-md">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

type RecordViewErrorProps = {
  error: Error | string;
  title?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
};

export function RecordViewError({ error, title = L().loadError, onRetry, retryLabel = L().retry, className }: RecordViewErrorProps) {
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div className={`flex flex-col items-center justify-center py-24 gap-4 text-center${className ? ` ${className}` : ''}`}>
      <div className="h-12 w-12 rounded-2xl bg-destructive/10 flex items-center justify-center text-destructive">
        <IconAlertCircle size={22} />
      </div>
      <div className="flex flex-col gap-1 max-w-md">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground break-words">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <IconRefresh className="h-4 w-4 mr-1.5" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

type RecordHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  media?: ReactNode;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function RecordHeader({ title, subtitle, media, badges, meta, actions, className }: RecordHeaderProps) {
  const hasMedia = !!media;
  return (
    <div className={`rounded-[27px] bg-card shadow-lg overflow-hidden ${hasMedia ? 'grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}${className ? ` ${className}` : ''}`}>
      {hasMedia && (
        <div className="bg-muted/40 min-h-[200px] md:min-h-[280px] flex items-center justify-center overflow-hidden">
          {media}
        </div>
      )}
      <div className="flex flex-col gap-3 p-6 md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col gap-1">
            <h1 className="text-2xl md:text-3xl font-semibold leading-tight text-foreground break-words">{title}</h1>
            {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
          </div>
          {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
        {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
        {meta && <div className="text-sm text-foreground/80">{meta}</div>}
      </div>
    </div>
  );
}

type RecordSectionProps = {
  title?: ReactNode;
  icon?: ComponentType<{ size?: number | string; className?: string; stroke?: number | string }>;
  cols?: 1 | 2 | 3;
  /**
   * Extra classes for the outer `<section>` card — e.g. `md:col-span-2` to
   * span both columns of an aside grid, or spacing overrides. Appended to the
   * card's own classes; it never replaces them.
   */
  className?: string;
  children?: ReactNode;
};

export function RecordSection({ title, icon: Icon, cols = 1, className, children }: RecordSectionProps) {
  const gridCols = cols === 3 ? 'md:grid-cols-3' : cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-1';
  return (
    <section className={`rounded-[27px] bg-card shadow-lg overflow-hidden p-6 md:p-8 flex flex-col gap-5${className ? ` ${className}` : ''}`}>
      {title && (
        <div className="flex items-center gap-2">
          {Icon && <Icon size={18} stroke={1.75} className="text-muted-foreground" />}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-secondary-foreground">{title}</h2>
        </div>
      )}
      <div className={`grid grid-cols-1 ${gridCols} gap-x-8 gap-y-5`}>
        {children}
      </div>
    </section>
  );
}

// Exported as the SINGLE source of truth for the shared 9-value format
// vocabulary of the widget family. Keep these literals in sync only HERE.
export type RecordFieldFormat = 'text' | 'longtext' | 'date' | 'datetime' | 'currency' | 'bool' | 'email' | 'url' | 'pill';

type RecordFieldProps = {
  label: ReactNode;
  value?: unknown;
  format?: RecordFieldFormat;
  empty?: string;
  className?: string;
  /**
   * Render-override escape hatch. When provided, `children` replace the
   * formatted value entirely — render any JSX (progress bar, map, star-rating,
   * chart) while keeping the field's label and grid placement. `value` and
   * `format` are ignored when `children` is set.
   */
  children?: ReactNode;
  /**
   * Highlight a KEY field: renders the value larger & bolder. Use for the 1–3
   * fields that describe the record at a glance (a total, a status, a due
   * date). Do NOT emphasise everything — then nothing stands out.
   */
  emphasis?: boolean;
  /**
   * Render nothing at all when the value is empty (and no `children`). Use it
   * on optional fields so sparse records don't become a wall of "—". (Default
   * keeps the "—" placeholder, which the pre-generated pages rely on.)
   */
  hideEmpty?: boolean;
};

function isEmptyFieldValue(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function RecordField({ label, value, format = 'text', empty = '—', className, children, emphasis, hideEmpty }: RecordFieldProps) {
  if (hideEmpty && children === undefined && isEmptyFieldValue(value)) return null;
  return (
    <div className={`flex flex-col gap-1 min-w-0 ${className ?? ''}`}>
      <Label>{label}</Label>
      {children !== undefined ? children : renderFieldValue(value, format, empty, emphasis)}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function renderFieldValue(value: unknown, format: RecordFieldFormat, empty: string, emphasis = false): ReactNode {
  if (value == null || value === '') return <div className="text-base text-muted-foreground">{empty}</div>;
  const vcls = emphasis ? 'text-2xl font-semibold' : 'text-base';

  if (format === 'longtext') {
    return <div className={`${vcls} text-foreground whitespace-pre-wrap break-words`}>{String(value)}</div>;
  }
  if (format === 'date') {
    return <div className={`${vcls} text-foreground`}>{formatDate(String(value))}</div>;
  }
  if (format === 'datetime') {
    return <div className={`${vcls} text-foreground`}>{formatDateTime(String(value))}</div>;
  }
  if (format === 'currency') {
    const n = typeof value === 'number' ? value : Number(value);
    return <div className={`${vcls} text-foreground tabular-nums`}>{Number.isFinite(n) ? formatCurrency(n) : empty}</div>;
  }
  if (format === 'bool') {
    return <div className={`${vcls} text-foreground`}>{value ? '✓' : '—'}</div>;
  }
  if (format === 'email') {
    return <a href={`mailto:${value}`} className={`${vcls} text-primary hover:underline break-all`}>{String(value)}</a>;
  }
  if (format === 'url') {
    const s = String(value);
    return <a href={s} target="_blank" rel="noreferrer" className={`${vcls} text-primary hover:underline break-all`}>{s}</a>;
  }
  if (format === 'pill') {
    const label = typeof value === 'object' && value !== null && 'label' in value
      ? String((value as { label: unknown }).label)
      : String(value);
    return (
      <div>
        <span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">
          {label}
        </span>
      </div>
    );
  }
  return <div className={`${vcls} text-foreground break-words`}>{String(value)}</div>;
}

export type RecordKeyFact = {
  label: ReactNode;
  value: ReactNode;
  icon?: ComponentType<{ size?: number | string; className?: string; stroke?: number | string }>;
};

type RecordKeyFactsProps = {
  /** 2–4 at-a-glance values for the top of a detail surface. */
  items: RecordKeyFact[];
  className?: string;
};

/**
 * RecordKeyFacts — a prominent strip of the record's most important values,
 * placed right under <RecordHeader>. Each fact is a small highlight tile
 * (label + big value). Keep it to 2–4 facts; everything else goes into the
 * normal <RecordSection> grid below.
 */
export function RecordKeyFacts({ items, className }: RecordKeyFactsProps) {
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-3 ${className ?? ''}`}>
      {items.map((f, i) => {
        const Icon = f.icon;
        return (
          <div key={i} className="flex-1 min-w-[8rem] rounded-2xl bg-secondary px-4 py-3 flex flex-col gap-0.5">
            <span className="text-xs font-medium uppercase tracking-wider text-secondary-foreground/70 flex items-center gap-1">
              {Icon && <Icon size={13} stroke={1.75} />}
              {f.label}
            </span>
            <span className="text-xl font-semibold text-foreground tabular-nums break-words">{f.value}</span>
          </div>
        );
      })}
    </div>
  );
}

type RecordRelationProps = {
  label?: ReactNode;
  name: ReactNode;
  meta?: ReactNode;
  icon?: ComponentType<{ size?: number | string; className?: string; stroke?: number | string }>;
  href?: string;
  onClick?: () => void;
  className?: string;
};

export function RecordRelation({ label, name, meta, icon: Icon, href, onClick, className }: RecordRelationProps) {
  const isClickable = !!(href || onClick);
  const extra = className ? ` ${className}` : '';
  const Inner = (
    <div className="flex items-center gap-3 min-w-0">
      {Icon && (
        <div className="shrink-0 h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-[#2563eb]">
          <Icon size={20} stroke={1.75} />
        </div>
      )}
      <div className="min-w-0 flex flex-col">
        {label && <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>}
        <div className="text-base font-medium text-foreground truncate">{name}</div>
        {meta && <div className="text-sm text-muted-foreground truncate">{meta}</div>}
      </div>
    </div>
  );
  if (href) {
    return <a href={href} className={`block rounded-2xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors${extra}`}>{Inner}</a>;
  }
  if (onClick) {
    return <button type="button" onClick={onClick} className={`block w-full text-left rounded-2xl border border-border bg-card p-4 hover:bg-muted/50 transition-colors${extra}`}>{Inner}</button>;
  }
  return <div className={`rounded-2xl border border-border bg-card p-4 ${isClickable ? 'cursor-pointer' : ''}${extra}`}>{Inner}</div>;
}

export type RecordTimelineItem = {
  id?: string;
  when?: ReactNode;
  who?: ReactNode;
  text: ReactNode;
  icon?: ComponentType<{ size?: number | string; className?: string; stroke?: number | string }>;
  /** Optional right-aligned actions for the default item layout (e.g. a button). */
  actions?: ReactNode;
};

type RecordTimelineProps = {
  items: RecordTimelineItem[];
  empty?: ReactNode;
  /**
   * Per-item render-override. When provided you control each item's markup
   * entirely (the widget only supplies the `<li>` wrapper + key). Use for
   * timelines that don't fit the default avatar / when-who / text layout.
   */
  renderItem?: (item: RecordTimelineItem, index: number) => ReactNode;
  className?: string;
};

type RecordOverlayProps = {
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  /**
   * Optional "back" affordance. When set, a back arrow appears in the header
   * next to the close button. Use this for overlay-stack navigation: clicking
   * a `<RecordRelation>` inside an overlay can push a new record onto the stack
   * (via `useRecordOverlayStack`) and `onBack` pops back to the previous one.
   * Do NOT use this to navigate to a different route — full close + navigate
   * loses the user's preview context. Stay in the overlay.
   */
  onBack?: () => void;
  /**
   * Changes → the body scroll resets to top. The Host passes the stack DEPTH
   * so a drill/back lands at the top of the new record (the shell itself
   * stays mounted — no backdrop re-fade, no re-slide).
   */
  scrollKey?: string | number;
  editLabel?: string;
  closeLabel?: string;
  backLabel?: string;
  ariaLabel?: string;
  /**
   * Where the overlay anchors. 'side' = slides in from the right (full-height
   * sheet). 'center' = centered modal (lightbox-style). Default 'side'.
   */
  placement?: 'side' | 'center';
  /**
   * Max width on `sm+` viewports. Mobile is always full-screen for 'side',
   * full-width minus padding for 'center'. Default 'md'.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Optional big-media slot — pass an `<img>` / `<video>` / `<iframe>` / map
   * for gallery- or document-style previews. With `placement='center'` the
   * media lays out side-by-side with the content on `lg+`. With
   * `placement='side'` it renders as a hero strip at the top of the sheet.
   */
  media?: ReactNode;
  /**
   * Sticky footer slot, rendered OUTSIDE the scrollable content area so it
   * stays pinned to the bottom of the overlay. Use for primary actions that
   * must not scroll away — "Jetzt buchen", "Speichern", a confirm bar.
   * Shape-tolerant: a rendered ReactNode, OR the family action object
   * `{ label, onClick }` — the object renders the standard full-width
   * primary button.
   */
  footer?: RecordOverlayFooter;
  /**
   * Whether a backdrop click closes the overlay. Default `true`. Set `false`
   * for flows where an accidental outside-click would lose unsaved work.
   */
  closeOnBackdropClick?: boolean;
  /**
   * Guard run before any close (Escape, close button, backdrop). Return
   * `false` to abort the close — e.g. after confirming unsaved changes.
   * Returning anything else (or nothing) lets the close proceed.
   */
  onBeforeClose?: () => boolean | void;
  /**
   * Gallery paging. When set, edge arrows appear (and ArrowLeft/ArrowRight
   * keys fire them) so the user steps through SIBLING records — e.g. an image
   * lightbox — without closing the overlay. Omit a direction to disable that
   * arrow at the start/end. This is distinct from the overlay stack
   * (`useRecordOverlayStack`), which drills into RELATED records: use paging
   * to move along a list, the stack to dive into a reference.
   */
  onPrev?: () => void;
  onNext?: () => void;
  /** Optional position indicator (e.g. `3 / 12`) shown in the header. */
  counter?: ReactNode;
  prevLabel?: string;
  nextLabel?: string;
  /** Extra classes for the dialog panel (both placements). */
  className?: string;
  children?: ReactNode;
};

/** The family action object (WorkList/HeroBanner idiom) — accepted by `footer`. */
/** The footer's action. `onClick` may RETURN a sentence — the reason the step was
 *  not taken; the footer shows it under the button (S-10, acceptance 4). */
export type RecordOverlayAction = { label: ReactNode; onClick: () => void | string | Promise<void | string> };
export type RecordOverlayFooter = ReactNode | RecordOverlayAction;

// ReactElements and arrays ARE ReactNodes — only a plain object carrying
// label+onClick is the action shape.
/** The footer's button. A helper that REFUSES the step returns its reason as a
 *  string („Es ist schon „Ideen 1“ geöffnet — bitte erst schließen.“); the
 *  Kanban shows such a text as its banner, the footer used to swallow it
 *  (acceptance 4, L-17…21). Now it stands under the button until the next click. */
function FooterAction({ action }: { action: RecordOverlayAction }) {
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setHint(null); setBusy(true);
    try {
      const r = await action.onClick();
      if (typeof r === 'string' && r.trim()) setHint(r);
    } catch (e) {
      setHint(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2">
      <Button className="w-full" onClick={() => void run()} disabled={busy}>{action.label}</Button>
      {hint && <p role="alert" className="text-sm text-destructive" data-overlay-hint="">{hint}</p>}
    </div>
  );
}

function isFooterAction(f: RecordOverlayFooter): f is RecordOverlayAction {
  return (
    typeof f === 'object' && f !== null && !Array.isArray(f) &&
    !isValidElement(f) && 'label' in f && 'onClick' in f
  );
}

const RECORD_OVERLAY_SIDE_SIZE: Record<NonNullable<RecordOverlayProps['size']>, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-2xl',
  lg: 'sm:max-w-4xl',
  xl: 'sm:max-w-5xl',
};

const RECORD_OVERLAY_CENTER_SIZE: Record<NonNullable<RecordOverlayProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-5xl',
};

// When `placement='center'` AND `media` is set, the modal stays at the same
// overall width as the no-media center-modal (so a lightbox isn't suddenly
// huge). The content column on the right scales modestly with `size` — wider
// than the old fixed 384px (long pills like "Creative Commons CC BY" wrapped),
// but never as wide as a full side-sheet (the media is the primary content
// in lightbox-mode; the right column is supplementary info).
const RECORD_OVERLAY_CENTER_MEDIA_CONTENT: Record<NonNullable<RecordOverlayProps['size']>, string> = {
  sm: 'lg:w-72',         // 288px — modal 448px total, media ~160px
  md: 'lg:w-80',         // 320px — modal 672px total, media ~352px
  lg: 'lg:w-96',         // 384px — modal 896px total, media ~512px
  xl: 'lg:w-[28rem]',    // 448px — modal 1024px total, media ~576px
};

/**
 * RecordOverlay — single overlay shell for the RecordView composition.
 *
 * One shell, many layouts. Compose with `<RecordHeader>`, `<RecordSection>`,
 * `<RecordField>`, `<RecordRelation>`, `<RecordTimeline>` inside. Adjust the
 * outer shape via the layout hints (`placement`, `size`, `media`) and the
 * `footer` slot — never by editing this file. `footer` pins a bar to the
 * bottom (outside the scroll area) and accepts a ReactNode OR the family
 * action object `{ label, onClick }`. For unsaved-changes flows, set
 * `closeOnBackdropClick={false}` and/or `onBeforeClose={() => confirm(…)}`.
 * For a gallery, add `onPrev`/`onNext` (+ `counter`) for edge-arrow paging —
 * NEVER hand-roll a `fixed inset-0` lightbox; this shell IS the lightbox.
 *
 *   // Form-style quick preview (Ticket, Booking, Customer)
 *   <RecordOverlay open onClose={...} onEdit={...}>
 *     <RecordHeader title="..." />
 *     <RecordSection ...>...</RecordSection>
 *   </RecordOverlay>
 *
 *   // Gallery / lightbox with prev-next paging (Image, PDF, Map preview)
 *   // onPrev/onNext page through SIBLING records (← → keys too); the overlay
 *   // stack is for drilling into RELATED records — don't conflate them.
 *   <RecordOverlay open onClose={...} onEdit={...}
 *     placement="center" size="xl" media={<img src={...} className="w-full h-full object-contain" />}
 *     onPrev={i > 0 ? () => setI(i - 1) : undefined}
 *     onNext={i < list.length - 1 ? () => setI(i + 1) : undefined}
 *     counter={`${i + 1} / ${list.length}`}>
 *     <RecordHeader title={...} />
 *     <RecordSection ...>...</RecordSection>
 *     <RecordTimeline items={...} />
 *   </RecordOverlay>
 *
 * Escape closes; backdrop-click closes unless `closeOnBackdropClick={false}`.
 * `onBeforeClose` can veto any close. Body scroll locked while open.
 */
export function RecordOverlay({
  open,
  onClose,
  onEdit,
  onBack,
  editLabel = L().edit,
  closeLabel = L().close,
  backLabel = L().back,
  ariaLabel,
  placement = 'side',
  size = 'md',
  media,
  footer,
  closeOnBackdropClick = true,
  onBeforeClose,
  onPrev,
  onNext,
  counter,
  prevLabel = L().prev,
  nextLabel = L().next,
  className,
  scrollKey,
  children,
}: RecordOverlayProps) {
  const requestClose = useCallback(() => {
    if (onBeforeClose && onBeforeClose() === false) return;
    onClose();
  }, [onBeforeClose, onClose]);

  // footer is shape-tolerant — normalize the action object ONCE, here.
  const footerNode: ReactNode = footer != null && isFooterAction(footer)
    ? <FooterAction action={footer} />
    : (footer as ReactNode);

  // Scroll-reset on stack navigation: the Host keeps ONE shell mounted while
  // the body swaps — without this, the next record opens mid-scroll.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
      else if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, requestClose, onPrev, onNext]);

  if (!open) return null;

  const hasMedia = !!media;
  const arrows = (onPrev || onNext) ? (
    <>
      {onPrev && (
        <button
          type="button"
          onClick={onPrev}
          aria-label={prevLabel}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        >
          <IconChevronLeft size={22} />
        </button>
      )}
      {onNext && (
        <button
          type="button"
          onClick={onNext}
          aria-label={nextLabel}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
        >
          <IconChevronRight size={22} />
        </button>
      )}
    </>
  ) : null;
  const header = (
    <header className="shrink-0 flex items-center justify-between gap-3 px-6 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-lg max-sm:rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors max-sm:border max-sm:border-border max-sm:bg-card max-sm:shadow-sm"
            aria-label={backLabel}
          >
            <IconArrowLeft size={18} />
          </button>
        )}
        <button
          type="button"
          onClick={requestClose}
          className="inline-flex h-9 w-9 max-sm:h-11 max-sm:w-11 items-center justify-center rounded-lg max-sm:rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors max-sm:border max-sm:border-border max-sm:bg-card max-sm:shadow-sm"
          aria-label={closeLabel}
        >
          <IconX size={18} />
        </button>
      </div>
      {counter != null
        ? <div className="flex-1 text-center text-sm text-muted-foreground tabular-nums">{counter}</div>
        : <div className="flex-1" />}
      {onEdit && (
        <Button size="sm" onClick={onEdit} className="rounded-full">
          <IconPencil className="h-3.5 w-3.5 mr-1.5" />
          {editLabel}
        </Button>
      )}
    </header>
  );

  if (placement === 'center') {
    // Modal width is the same regardless of media — only the right-side
    // content column shrinks to make room for the media tile on the left.
    const containerSize = RECORD_OVERLAY_CENTER_SIZE[size];
    const contentColumn = hasMedia
      ? `${RECORD_OVERLAY_CENTER_MEDIA_CONTENT[size]} lg:shrink-0`
      : 'w-full';
    return createPortal(
      <div
        className="fixed inset-0 z-[var(--z-overlay)] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        onClick={closeOnBackdropClick ? requestClose : undefined}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          onClick={e => e.stopPropagation()}
          className={`relative bg-background rounded-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 ${containerSize} ${hasMedia ? 'lg:flex-row' : ''}${className ? ` ${className}` : ''}`}
        >
          {arrows}
          {hasMedia && (
            <div className="bg-black flex items-center justify-center min-h-[240px] lg:min-h-0 lg:flex-1 overflow-hidden">
              {media}
            </div>
          )}
          <div className={`flex flex-col min-h-0 overflow-hidden ${contentColumn}`}>
            {header}
            <div ref={bodyRef} className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col gap-6">
                {children}
              </div>
            </div>
            {footerNode && <div className="shrink-0 border-t border-border bg-card px-6 py-4">{footerNode}</div>}
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // placement === 'side'
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[var(--z-overlay)] bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={closeOnBackdropClick ? requestClose : undefined}
      />
      <aside
        role="dialog"
        aria-label={ariaLabel}
        aria-modal="true"
        className={`fixed top-0 right-0 z-[var(--z-overlay)] h-full w-full ${RECORD_OVERLAY_SIDE_SIZE[size]} bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200${className ? ` ${className}` : ''}`}
      >
        {arrows}
        {header}
        {hasMedia && (
          <div className="shrink-0 bg-muted/40 flex items-center justify-center overflow-hidden h-48 sm:h-64">
            {media}
          </div>
        )}
        <div ref={bodyRef} className="flex-1 overflow-y-auto p-6 md:p-8">
          <div className="flex flex-col gap-6">
            {children}
          </div>
        </div>
        {footerNode && <div className="shrink-0 border-t border-border bg-card px-6 md:px-8 py-4">{footerNode}</div>}
      </aside>
    </>,
    document.body,
  );
}

export function RecordTimeline({ items, empty = L().timelineEmpty, renderItem, className }: RecordTimelineProps) {
  if (!items.length) return <div className="text-sm text-muted-foreground">{empty}</div>;
  if (renderItem) {
    return (
      <ol className={`relative flex flex-col gap-5${className ? ` ${className}` : ''}`}>
        {items.map((it, idx) => <li key={it.id ?? idx}>{renderItem(it, idx)}</li>)}
      </ol>
    );
  }
  return (
    <ol className={`relative flex flex-col gap-5${className ? ` ${className}` : ''}`}>
      {items.map((it, idx) => {
        const Icon = it.icon;
        return (
          <li key={it.id ?? idx} className="flex gap-4">
            <div className="shrink-0 flex flex-col items-center">
              <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center text-[#2563eb]">
                {Icon ? <Icon size={16} stroke={1.75} /> : <span className="h-2 w-2 rounded-full bg-[#2563eb]" />}
              </div>
              {idx !== items.length - 1 && <div className="flex-1 w-px bg-border mt-1" />}
            </div>
            <div className="flex flex-col gap-1 pb-2 min-w-0">
              {(it.when || it.who) && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  {it.who && <span className="font-medium text-foreground">{it.who}</span>}
                  {it.when && <span>{it.when}</span>}
                </div>
              )}
              <div className="text-sm text-foreground whitespace-pre-wrap break-words">{it.text}</div>
            </div>
            {it.actions && <div className="shrink-0 ml-auto">{it.actions}</div>}
          </li>
        );
      })}
    </ol>
  );
}

// ── Overlay-Stack helper ────────────────────────────────────────────────
// Manages a stack of preview items for `RecordOverlay`. Use when clicking a
// `<RecordRelation>` inside an overlay should push the related record onto
// the same overlay (instead of navigating to a route). The top of the stack
// is the currently visible record; pop returns to the previous one.
//
//   type Item = { type: 'buchung' | 'kunde' | 'katze'; id: string };
//   const overlay = useRecordOverlayStack<Item>();
//
//   // Open from a list:
//   <button onClick={() => overlay.replace({ type: 'buchung', id: b.record_id })} />
//
//   // Render the overlay:
//   <RecordOverlay
//     open={overlay.open}
//     onClose={overlay.close}
//     onBack={overlay.canGoBack ? overlay.pop : undefined}
//   >
//     {overlay.top?.type === 'buchung' && <BuchungContent item={overlay.top} push={overlay.push} />}
//     {overlay.top?.type === 'kunde'   && <KundeContent   item={overlay.top} push={overlay.push} />}
//     {overlay.top?.type === 'katze'   && <KatzeContent   item={overlay.top} push={overlay.push} />}
//   </RecordOverlay>
//
//   // Inside BuchungContent — relation pushes a new layer:
//   <RecordRelation
//     label="Kunde" name={kundeName}
//     onClick={() => push({ type: 'kunde', id: kundeId })}
//   />
// Suggested item shape for a MULTI-type stack (discriminate on `type`). Not a
// constraint — `useRecordOverlayStack<T>()` accepts any T, so a single-entity
// overlay can just use its own record type (e.g. `<EnrichedBilder>`).
export type RecordOverlayStackItem = { type: string; id: string; [extra: string]: unknown };

export type RecordOverlayStack<T = RecordOverlayStackItem> = {
  stack: T[];
  top: T | null;
  /** Alias of `top` — the currently visible item. */
  current: T | null;
  open: boolean;
  canGoBack: boolean;
  push: (item: T) => void;
  pop: () => void;
  close: () => void;
  /** Reset the stack to a single item (use when opening from outside the overlay). */
  replace: (item: T) => void;
};

export function useRecordOverlayStack<T = RecordOverlayStackItem>(
  initial: T[] = [],
): RecordOverlayStack<T> {
  const [stack, setStack] = useState<T[]>(initial);
  const push = useCallback((item: T) => setStack(s => [...s, item]), []);
  const pop = useCallback(() => setStack(s => s.slice(0, -1)), []);
  const close = useCallback(() => setStack([]), []);
  const replace = useCallback((item: T) => setStack([item]), []);
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  return {
    stack,
    top,
    current: top,
    open: stack.length > 0,
    canGoBack: stack.length > 1,
    push,
    pop,
    close,
    replace,
  };
}

export interface RecordOverlayHostProps<T> {
  /** Der Stack aus useRecordOverlayStack — der Host rendert dessen `top`. */
  overlay: RecordOverlayStack<T>;
  /** Body für den obersten Eintrag — die EINE semantische Verzweigung (switch über top.type). */
  render: (top: T) => ReactNode;
  /** Footer (Advance-Aktion) für den obersten Eintrag — ReactNode oder das
   *  Familien-Aktions-Objekt { label, onClick } (rendert den Standard-Button). */
  footer?: (top: T) => RecordOverlayFooter;
  /** Bearbeiten-Pfad für den obersten Eintrag. */
  onEdit?: (top: T) => void;
  /** Darf der oberste Eintrag bearbeitet werden? (die Rechte der Plattform —
   *  ohne Schreibrecht kein Bearbeiten-Knopf). Fehlt = ja. */
  canEdit?: (top: T) => boolean;
  placement?: RecordOverlayProps['placement'];
  size?: RecordOverlayProps['size'];
  className?: string;
}

/**
 * DIE eine Overlay-Shell pro Seite. Rendert den gesamten Stack in EINEM
 * <RecordOverlay>: bei push/pop bleibt die Shell gemountet und nur der Body
 * wechselt — Backdrop-Fade und Panel-Slide spielen NUR beim ersten Öffnen
 * (ein <RecordOverlay> pro Record-TYP mit open-Flags remountet die Shell bei
 * jedem Drill und blinkt). Back erscheint automatisch ab Stack-Tiefe 2;
 * der Body-Scroll startet bei jedem Navigationsschritt oben.
 */
export function RecordOverlayHost<T>({ overlay, render, footer, onEdit, canEdit, placement, size, className }: RecordOverlayHostProps<T>) {
  const top = overlay.top;
  return (
    <RecordOverlay
      open={overlay.open && top != null}
      onClose={overlay.close}
      onBack={overlay.canGoBack ? overlay.pop : undefined}
      onEdit={top != null && onEdit && (!canEdit || canEdit(top)) ? () => onEdit(top) : undefined}
      footer={top != null ? footer?.(top) : undefined}
      scrollKey={overlay.stack.length}
      placement={placement}
      size={size}
      className={className}
    >
      {top != null ? render(top) : null}
    </RecordOverlay>
  );
}
