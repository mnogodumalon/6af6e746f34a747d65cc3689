/**
 * visitorKey — recognise the DEVICE, not the person (J-4, 04.11.2026).
 *
 * A public page cannot tell visitors apart (no login). What it can do: give
 * this browser a key once and keep it in its storage, so a visitor finds
 * their own entries again on the same device — the contributions they sent,
 * the slot they booked. The plan says `derived:visitor_key` on a text field
 * of the entity; the page fills it from `useVisitorKey()` and never shows a
 * control for it. `rememberOwnRecord` / `ownRecordIds` keep the ids of the
 * records this device created (`picked:own_earlier` in the plan).
 *
 *   const key = useVisitorKey();                  // 'K7M2P'…, stable per device
 *   values: () => ({ besucher: key })             // the plan step's preset
 *   rememberOwnRecord('beitraege', result.id);    // after a successful create
 *   ownRecordIds('beitraege')                     // → the pick's `where` / its items
 *
 * Private mode, a cleared storage or a second browser mean a NEW key — that
 * is the honest limit, and the reason the plan's limit `no_visitor_identity`
 * still stands for anything across devices.
 */
import { useMemo } from 'react';

export const VISITOR_KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I
export const VISITOR_KEY_LENGTH = 6;

export interface VisitorKeyOptions {
  alphabet?: string;
  length?: number;
  /** IGNORED for the key's storage since 0.0.518 — ONE key per device across all public pages
   *  of the dashboard (A9: the feedback page used `name: 'feedback-kuerzel'`, the e-mail page
   *  the default, and one visitor got two codes; the e-mail landed with neither's feedback).
   *  A key stored under an earlier name is taken over once. */
  name?: string;
}

function storageKey(name: string): string {
  return `${typeof window !== 'undefined' ? window.location.pathname : ''}#${name}`;
}

function makeKey(alphabet: string, length: number): string {
  const out: string[] = [];
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (let i = 0; i < length; i++) out.push(alphabet[bytes[i] % alphabet.length]);
  return out.join('');
}

/** The device's key — created once, then read back. Never throws. */
export function visitorKey(opts: VisitorKeyOptions = {}): string {
  const alphabet = opts.alphabet || VISITOR_KEY_ALPHABET;
  const length = opts.length || VISITOR_KEY_LENGTH;
  const shared = storageKey('visitor-key');
  try {
    // a key a page kept under its own name is the one its records already carry — it becomes
    // the device's key (once), so the next page reads the same code
    if (opts.name && opts.name !== 'visitor-key') {
      const named = window.localStorage.getItem(storageKey(opts.name));
      if (named && window.localStorage.getItem(shared) !== named) {
        window.localStorage.setItem(shared, named);
        window.localStorage.removeItem(storageKey(opts.name));
        return named;
      }
    }
    const have = window.localStorage.getItem(shared);
    if (have) return have;
    const fresh = makeKey(alphabet, length);
    window.localStorage.setItem(shared, fresh);
    return fresh;
  } catch {
    return makeKey(alphabet, length);        // no storage: a key for this page view only
  }
}

export function useVisitorKey(opts: VisitorKeyOptions = {}): string {
  const { alphabet, length, name } = opts;
  return useMemo(() => visitorKey({ alphabet, length, name }), [alphabet, length, name]);
}

/** Remember a record THIS device created (after a successful create). */
export function rememberOwnRecord(entity: string, recordId: string): void {
  try {
    const k = storageKey(`own:${entity}`);
    const ids = ownRecordIds(entity);
    if (!ids.includes(recordId)) window.localStorage.setItem(k, JSON.stringify([...ids, recordId].slice(-200)));
  } catch {
    /* ignore */
  }
}

/** The ids of the records this device created for `entity` — oldest first. */
export function ownRecordIds(entity: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(`own:${entity}`));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
