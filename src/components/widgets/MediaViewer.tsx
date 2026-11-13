/**
 * MediaViewer — pre-generated media/asset viewer widget set (Archetype A).
 *
 * The "enlarge / zoom / preview a file" UX ships here as composable pieces:
 * images zoom & pan, PDFs render in an iframe, other files get an open/
 * download affordance. Compose; never reimplement. Building a custom
 * `<div className="fixed inset-0">` lightbox for an image or file is forbidden
 * — THIS file is the lightbox. Customize via props, never by replacing it.
 *
 * ─── HARD RULES (read first) ───────────────────────────────────────────
 *  1. Never hand-roll a fixed-inset-0 image/file modal — use <MediaLightbox>.
 *  2. Zoom belongs on a DETAIL surface, NOT on a clickable list/gallery tile.
 *     A tile is ONE click target → it opens the <RecordOverlay>; its image is
 *     a passive `<img className="object-cover">`. Put the <MediaThumbnail> on
 *     the overlay/header `media` slot instead.
 *  3. Never edit this file. If a capability is missing: unblock via the
 *     component props/children + // TODO(widget-gap). Never fork, never leave
 *     the build red.
 *
 * ─── API at a glance (exact prop names — NEVER guess) ──────────────────
 *
 *  type MediaKind = 'image' | 'pdf' | 'file';
 *  type MediaItem = { url: string; title?: string; kind?: MediaKind };
 *
 *  <MediaThumbnail src alt?(default '') kind?: MediaKind fit?: 'cover'|'contain'
 *                  (default 'cover') className? onClick?>
 *    Clickable preview. With NO `onClick` it is self-contained: clicking opens
 *    its own full-screen <MediaLightbox> for that single asset — the drop-in
 *    "make this image zoomable" piece. Pass `onClick` to drive a SHARED
 *    gallery lightbox instead (see useMediaViewer). `fit='cover'` = square
 *    tiles; `'contain'` = full asset, width-driven.
 *
 *  <MediaLightbox open items: MediaItem[] index onClose onIndexChange?(index)>
 *    Full-screen viewer. Image: wheel / buttons / double-click to zoom, drag
 *    to pan. PDF: iframe. Other: download card. Prev/next arrows + counter +
 *    ←/→ keys when `items.length > 1`. Esc closes. Pass `onIndexChange` for
 *    controlled paging, else it self-manages its index.
 *
 *  useMediaViewer() -> { open, items: MediaItem[], index, openWith(items, index?),
 *                        setIndex(index), close() }
 *    One shared <MediaLightbox> for a gallery of thumbnails. `openWith` seeds
 *    the item list + starting index; `setIndex` is the paging callback.
 *
 *  inferMediaKind(url) -> MediaKind
 *    Optimistic: only `.pdf` → 'pdf' and known doc/archive extensions → 'file';
 *    everything else (incl. extension-less REST URLs — the LA norm) → 'image',
 *    with an `<img onError>` fallback to a file tile. Real images on
 *    extension-less URLs still render & zoom.
 *
 * ─── ❌ COMMON MISTAKES (real build failures) ──────────────────────────
 *  ❌ A <MediaThumbnail> inside a clickable tile → two click targets fight
 *     (tile-open vs. its own lightbox). Tiles use a passive <img>; zoom lives
 *     on the overlay's `media` slot.
 *  ❌ Expecting video to zoom/play: the closed lightbox set is image|pdf|file
 *     (no renderItem escape) → video files land as plain file tiles (download
 *     card). Don't pass `kind:'image'` for an .mp4.
 *  ❌ A hand-rolled `fixed inset-0` lightbox → compose <MediaLightbox>.
 *  ❌ Gating "is this an image?" on a positive extension match → LA file URLs
 *     have NO extension. Trust inferMediaKind's optimistic default.
 *
 * Full compiling example: ./MediaViewer.example.tsx
 *
 * @version 1.0.0
 * @since 2026-06-03
 */
import { type ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  IconX, IconChevronLeft, IconChevronRight, IconZoomIn, IconZoomOut,
  IconZoomReset, IconDownload, IconFile, IconFileTypePdf,
} from '@tabler/icons-react';
import { coreLocale as i18nLocale, type CoreLocale as Locale } from '@/i18n';

// The widget's OWN chrome strings — indexed at RENDER time (`MV[i18nLocale]`),
// never hoisted into a module constant.
const MV: Record<Locale, {
  file: string; openPreview: string; zoomOut: string; zoomReset: string;
  zoomIn: string; close: string; prev: string; next: string;
}> = {
  de: {
    file: 'Datei', openPreview: 'Vorschau öffnen', zoomOut: 'Verkleinern',
    zoomReset: 'Zoom zurücksetzen', zoomIn: 'Vergrößern', close: 'Schließen',
    prev: 'Vorheriges', next: 'Nächstes',
  },
  en: {
    file: 'File', openPreview: 'Open preview', zoomOut: 'Zoom out',
    zoomReset: 'Reset zoom', zoomIn: 'Zoom in', close: 'Close',
    prev: 'Previous', next: 'Next',
  },
};

export type MediaKind = 'image' | 'pdf' | 'file';
export type MediaItem = { url: string; title?: string; kind?: MediaKind };

const PDF_EXT = /\.pdf(\?|#|$)/i;
// Extensions that are definitely NOT viewable as an <img>. Everything else —
// including extension-less REST file URLs (the Living Apps norm) — is treated
// as an image OPTIMISTICALLY and falls back to a file tile on load error.
// Never gate "is this an image?" on a positive image-extension match: LA file
// URLs look like `…/rest/…/files/<id>` with no extension.
const NON_IMAGE_EXT = /\.(docx?|xlsx?|pptx?|csv|txt|rtf|zip|rar|7z|tar|gz|mp3|wav|mp4|mov|avi|mkv|json|xml)(\?|#|$)/i;

export function inferMediaKind(url: string): MediaKind {
  if (!url) return 'file';
  if (PDF_EXT.test(url) || url.startsWith('data:application/pdf')) return 'pdf';
  if (NON_IMAGE_EXT.test(url)) return 'file';
  return 'image'; // optimistic — <img> onError degrades to a file tile
}

function fileName(url: string): string {
  try {
    const clean = url.split(/[?#]/)[0];
    return decodeURIComponent(clean.substring(clean.lastIndexOf('/') + 1)) || MV[i18nLocale].file;
  } catch {
    return MV[i18nLocale].file;
  }
}

type MediaThumbnailProps = {
  src: string;
  alt?: string;
  kind?: MediaKind;
  /** 'cover' = square-fillable tile (default); 'contain' = full asset, width-driven. */
  fit?: 'cover' | 'contain';
  className?: string;
  /** Override the default self-contained open behaviour (e.g. open a shared gallery lightbox). */
  onClick?: () => void;
};

export function MediaThumbnail({ src, alt = '', kind, fit = 'cover', className, onClick }: MediaThumbnailProps) {
  const [open, setOpen] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const k = kind ?? inferMediaKind(src);
  const handleClick = onClick ?? (() => setOpen(true));

  // Try to render as an image whenever it isn't a known non-image; fall back
  // to a file tile if the image fails to load (handles mislabelled URLs).
  const inner = k === 'image' && !imgFailed ? (
    <img
      src={src}
      alt={alt}
      onError={() => setImgFailed(true)}
      className={fit === 'cover' ? 'w-full h-full object-cover' : 'w-full h-auto object-contain'}
    />
  ) : (
    <div className="flex flex-col items-center justify-center gap-1.5 p-4 text-muted-foreground">
      {k === 'pdf' ? <IconFileTypePdf size={28} stroke={1.5} /> : <IconFile size={28} stroke={1.5} />}
      <span className="text-xs truncate max-w-full">{alt || fileName(src)}</span>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`group relative block overflow-hidden bg-muted text-left ${className ?? ''}`}
        aria-label={alt || MV[i18nLocale].openPreview}
      >
        {inner}
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
          <IconZoomIn size={22} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
        </span>
      </button>
      {!onClick && (
        <MediaLightbox open={open} items={[{ url: src, title: alt || undefined, kind: k }]} index={0} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

type MediaLightboxProps = {
  open: boolean;
  items: MediaItem[];
  index: number;
  onClose: () => void;
  /** Provide for controlled paging; omit to let the lightbox manage its own index. */
  onIndexChange?: (index: number) => void;
};

export function MediaLightbox({ open, items, index, onClose, onIndexChange }: MediaLightboxProps) {
  const [internalIdx, setInternalIdx] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const idx = onIndexChange ? index : internalIdx;
  const setIdx = onIndexChange ?? setInternalIdx;

  const resetZoom = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);
  const goPrev = useCallback(() => { if (idx > 0) { setIdx(idx - 1); resetZoom(); } }, [idx, setIdx, resetZoom]);
  const goNext = useCallback(() => { if (idx < items.length - 1) { setIdx(idx + 1); resetZoom(); } }, [idx, items.length, setIdx, resetZoom]);

  useEffect(() => { setInternalIdx(index); }, [index, open]);
  useEffect(() => { resetZoom(); setImgFailed(false); }, [idx, open, resetZoom]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, goPrev, goNext]);

  if (!open || items.length === 0) return null;
  const item = items[Math.max(0, Math.min(idx, items.length - 1))];
  if (!item) return null;
  const kind = item.kind ?? inferMediaKind(item.url);
  // If an optimistic image fails to load, degrade to the download card.
  const effectiveKind: MediaKind = kind === 'image' && imgFailed ? 'file' : kind;
  const canZoom = effectiveKind === 'image';

  const zoomIn = () => setScale(s => Math.min(s + 0.5, 5));
  const zoomOut = () => setScale(s => {
    const n = Math.max(s - 0.5, 1);
    if (n === 1) { setTx(0); setTy(0); }
    return n;
  });

  let body: ReactNode;
  if (effectiveKind === 'image') {
    body = (
      <img
        src={item.url}
        alt={item.title ?? ''}
        draggable={false}
        onError={() => setImgFailed(true)}
        onDoubleClick={() => (scale === 1 ? setScale(2.5) : resetZoom())}
        onPointerDown={e => {
          if (scale === 1) return;
          dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          if (!dragRef.current) return;
          setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
          setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
        }}
        onPointerUp={() => { dragRef.current = null; }}
        onWheel={e => setScale(s => Math.min(Math.max(s + (e.deltaY < 0 ? 0.25 : -0.25), 1), 5))}
        style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, cursor: scale > 1 ? 'grab' : 'zoom-in' }}
        className="max-w-[92vw] max-h-[88vh] object-contain select-none transition-transform duration-75"
      />
    );
  } else if (effectiveKind === 'pdf') {
    body = (
      <iframe
        src={item.url}
        title={item.title ?? 'PDF'}
        className="w-[92vw] h-[88vh] rounded-lg bg-white shadow-2xl"
      />
    );
  } else {
    body = (
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-background p-10 shadow-2xl">
        <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
          <IconFile size={32} stroke={1.5} />
        </div>
        <p className="text-sm text-foreground max-w-xs truncate">{item.title ?? fileName(item.url)}</p>
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          download
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <IconDownload size={16} />
          Öffnen / Herunterladen
        </a>
      </div>
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-lightbox)] flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={typeof item.title === 'string' ? item.title : 'Vorschau'}
    >
      {/* Top bar */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between gap-3 p-3" onClick={e => e.stopPropagation()}>
        <div className="text-sm text-white/80 tabular-nums px-2">
          {items.length > 1 ? `${idx + 1} / ${items.length}` : ''}
        </div>
        <div className="flex items-center gap-1">
          {canZoom && (
            <>
              <LightboxBtn onClick={zoomOut} label={MV[i18nLocale].zoomOut}><IconZoomOut size={18} /></LightboxBtn>
              <LightboxBtn onClick={resetZoom} label={MV[i18nLocale].zoomReset}><IconZoomReset size={18} /></LightboxBtn>
              <LightboxBtn onClick={zoomIn} label={MV[i18nLocale].zoomIn}><IconZoomIn size={18} /></LightboxBtn>
            </>
          )}
          <LightboxBtn onClick={onClose} label={MV[i18nLocale].close}><IconX size={18} /></LightboxBtn>
        </div>
      </div>

      {/* Prev / next */}
      {idx > 0 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); goPrev(); }}
          aria-label={MV[i18nLocale].prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <IconChevronLeft size={24} />
        </button>
      )}
      {idx < items.length - 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); goNext(); }}
          aria-label={MV[i18nLocale].next}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        >
          <IconChevronRight size={24} />
        </button>
      )}

      {/* Content */}
      <div className="flex items-center justify-center" onClick={e => e.stopPropagation()}>
        {body}
      </div>
    </div>,
    document.body,
  );
}

function LightboxBtn({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      aria-label={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/15 transition-colors"
    >
      {children}
    </button>
  );
}

// ── Gallery hook ────────────────────────────────────────────────────────
// One shared <MediaLightbox> for many <MediaThumbnail>s. `openWith` seeds the
// item list + starting index; `setIndex` is the paging callback.
export function useMediaViewer() {
  const [state, setState] = useState<{ items: MediaItem[]; index: number } | null>(null);
  const openWith = useCallback((items: MediaItem[], index = 0) => setState({ items, index }), []);
  const setIndex = useCallback((index: number) => setState(s => (s ? { ...s, index } : s)), []);
  const close = useCallback(() => setState(null), []);
  return {
    open: state !== null,
    items: state?.items ?? [],
    index: state?.index ?? 0,
    openWith,
    setIndex,
    close,
  };
}
