/**
 * MediaViewer.example.tsx — the single copyable wiring truth for MediaViewer.
 *
 * This file is STATIC (no Jinja2, no conditional emission) and is compiled by
 * the contract tsc-gate against the frozen hotel fixture (entity `Buchung`
 * carrying a `foto` file field). It shows the two real shapes the agent wires:
 * a SELF-CONTAINED zoomable thumbnail (drop-in, no state) and a SHARED gallery
 * lightbox driven by `useMediaViewer`. Every import resolves; `MediaItem`
 * values are real; no hand-rolled fixed-inset-0 modal anywhere.
 *
 * Service / type names are exactly what the generators derive for the hotel
 * fixture: interface `Buchung`, method `getBuchung()`.
 */
import { useEffect, useState } from 'react';
import { LivingAppsService } from '@/services/livingAppsService';
import type { Buchung } from '@/types/app';
import {
  MediaThumbnail,
  MediaLightbox,
  useMediaViewer,
  inferMediaKind,
  type MediaItem,
} from './MediaViewer';

// ─────────────────────────────────────────────────────────────────────────
// SHAPE 1 — Self-contained thumbnail. No `onClick`, no state: clicking opens
// its own full-screen lightbox for that single asset. The drop-in "make this
// image zoomable" piece — e.g. inside a <RecordOverlay> `media` slot.
// ─────────────────────────────────────────────────────────────────────────

export function SingleThumbnailExample({ url }: { url: string }) {
  return <MediaThumbnail src={url} alt="Foto" className="h-40 w-40 rounded-2xl" fit="cover" />;
}

// ─────────────────────────────────────────────────────────────────────────
// SHAPE 2 — Shared gallery: many thumbnails, ONE lightbox. `openWith` seeds
// the item list + starting index; paging (← →, arrows, counter) is built in.
// Pass `onClick` so the thumbnails drive the shared lightbox instead of each
// opening its own.
// ─────────────────────────────────────────────────────────────────────────

export function BuchungGalleryExample() {
  const [buchungen, setBuchungen] = useState<Buchung[]>([]);
  const mv = useMediaViewer();

  useEffect(() => {
    LivingAppsService.getBuchung().then(setBuchungen);
  }, []);

  // One MediaItem per booking that carries a photo. `kind` is optional —
  // inferMediaKind degrades extension-less / mislabelled URLs gracefully.
  const items: MediaItem[] = buchungen
    .map(b => b.fields.foto)
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
    .map(url => ({ url, title: undefined, kind: inferMediaKind(url) }));

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {items.map((it, i) => (
          <MediaThumbnail
            key={it.url}
            src={it.url}
            alt={typeof it.title === 'string' ? it.title : ''}
            className="aspect-square rounded-xl"
            onClick={() => mv.openWith(items, i)}
          />
        ))}
      </div>

      <MediaLightbox
        open={mv.open}
        items={mv.items}
        index={mv.index}
        onClose={mv.close}
        onIndexChange={mv.setIndex}
      />
    </>
  );
}
