import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from 'react';
import { IconMapPin, IconSearch, IconLoader2 } from '@tabler/icons-react';
import { Input } from '@/components/ui/input';
import { t } from '@/i18n';

// Address type-ahead for the geo field. Uses Photon (Komoot) — an OSM-based
// geocoder BUILT for autocomplete/search-as-you-type (unlike Nominatim, whose
// usage policy forbids per-keystroke queries). No API key; same OSM data family
// as our map tiles. The user can ONLY commit an address that was actually found
// (selecting a result fires onSelect); typing free text never sets coordinates.
const PHOTON_URL = 'https://photon.komoot.io/api/';

type PhotonFeature = {
  geometry: { coordinates: [number, number] };   // GeoJSON [long, lat]
  properties: {
    name?: string; housenumber?: string; street?: string;
    postcode?: string; city?: string; state?: string; country?: string;
  };
};

export type AddressResult = { lat: number; long: number; label: string };

interface AddressAutocompleteProps {
  /** Fires ONLY when the user picks a found result — never on free text. */
  onSelect: (result: AddressResult) => void;
  placeholder?: string;
}

/** Human-readable one-line label from Photon's structured properties. */
function formatLabel(p: PhotonFeature['properties']): string {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const line1 = street || p.name || '';
  const line2 = [p.postcode, p.city].filter(Boolean).join(' ');
  return [line1, line2, p.country].filter(Boolean).join(', ');
}

export function AddressAutocomplete({ onSelect, placeholder }: AddressAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PhotonFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Set right before we write a chosen label back into the input, so the
  // resulting query-change does NOT trigger a fresh search (no flicker loop).
  const skipRef = useRef(false);

  // Debounced type-ahead. Min 3 chars; a new keystroke aborts the in-flight
  // request so only the latest query resolves. ~300ms keeps Photon happy.
  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    const q = query.trim();
    if (q.length < 3) { setResults([]); setOpen(false); return; }
    const t = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      const lang = navigator.language.slice(0, 2);
      fetch(`${PHOTON_URL}?q=${encodeURIComponent(q)}&limit=5&lang=${lang}`, { signal: ac.signal })
        .then(res => res.json())
        .then((data: { features?: PhotonFeature[] }) => {
          const feats = Array.isArray(data?.features) ? data.features : [];
          setResults(feats);
          setActive(feats.length ? 0 : -1);
          setOpen(true);
        })
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name === 'AbortError') return;
          setResults([]);
          setOpen(true);
        })
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Abort any in-flight request on unmount.
  useEffect(() => () => abortRef.current?.abort(), []);

  function choose(f: PhotonFeature) {
    const [long, lat] = f.geometry.coordinates;   // GeoJSON order is [long, lat]
    const label = formatLabel(f.properties);
    onSelect({ lat, long, label });
    skipRef.current = true;      // reflect the picked address without re-searching
    setQuery(label);
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % results.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i - 1 + results.length) % results.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0 && results[active]) choose(results[active]); }
    else if (e.key === 'Escape') { setOpen(false); }
  }

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder ?? t('address_search')}
          className="pl-8 max-sm:h-11"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
        />
        {loading && <IconLoader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && (
        <ul className="absolute z-[1100] mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg" role="listbox">
          {results.length === 0 && !loading && (
            <li className="px-3 py-2 text-sm text-muted-foreground">{t('address_none')}</li>
          )}
          {results.map((f, i) => (
            <li key={i}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(f)}
                onMouseEnter={() => setActive(i)}
                aria-selected={i === active}
                role="option"
                className={`flex w-full items-start gap-2 px-3 py-2 max-sm:py-3 text-left text-sm transition-colors hover:bg-secondary ${i === active ? 'bg-secondary' : ''}`}
              >
                <IconMapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 break-words">{formatLabel(f.properties)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
