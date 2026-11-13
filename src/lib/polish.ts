/**
 * polish.ts — pre-generated dashboard polish helpers (the "finished dashboard" layer).
 *
 *   useClock(ms?)          minute-ticking Date — derive ALL today/now values from it,
 *                          never from a Date captured once (frozen "today").
 *                          EVERY time string from `clock` is LOCAL via date-fns format —
 *                          toISOString() is banned in the overview (UTC flips the day at
 *                          the wrong hour; gate-enforced), for datetime values too:
 *                            ❌ clock.toISOString()
 *                            ✓ format(clock, 'yyyy-MM-dd')           // day key
 *                            ✓ format(clock, "yyyy-MM-dd'T'HH:mm")   // datetime
 *   gruss(d)               time-of-day greeting, personalized by itself when the
 *                          logged-in profile has a first name ("Guten Abend, Anna!",
 *                          fallback "Guten Abend!") — never append the name yourself
 *   namen(xs, max?)        "Anna & Ben +2" — the first names, cleanly shortened
 *   ENTRANCE               staggered-entrance className (motion-safe, ~700ms)
 *   entranceDelay(ms)      per-block delay style — stagger blocks 0/120/240/360ms
 *   undoToast(msg, undo?)  success toast via the global Toaster; with `undo` it renders
 *                          a "Rückgängig" action — pass the counter-write (revert state
 *                          snapshot + counter-PATCH).
 *
 * These helpers ARE the polish layer described in CLAUDE.md — import them,
 * do not re-derive them by hand.
 */
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { toast } from 'sonner';
import { t, profileFirstname, onProfileFirstname } from '@/i18n';

export function useClock(ms = 60_000): Date {
  const [d, setD] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setD(new Date()), ms);
    // /user usually resolves after the first paint — one extra tick so a
    // rendered gruss(clock) picks up the profile name without a full minute wait.
    const off = onProfileFirstname(() => setD(new Date()));
    return () => {
      clearInterval(t);
      off();
    };
  }, [ms]);
  return d;
}

export function gruss(d: Date): string {
  const h = d.getHours();
  const name = profileFirstname();
  if (name) {
    return h < 11
      ? t('polish_greeting_morning_named', { name })
      : h < 18
        ? t('polish_greeting_day_named', { name })
        : t('polish_greeting_evening_named', { name });
  }
  return h < 11 ? t('polish_greeting_morning') : h < 18 ? t('polish_greeting_day') : t('polish_greeting_evening');
}

export function namen(xs: string[], max = 2): string {
  return xs.slice(0, max).join(' & ') + (xs.length > max ? ` +${xs.length - max}` : '');
}

export const ENTRANCE =
  'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-700';

export function entranceDelay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms`, animationFillMode: 'backwards' };
}

export function undoToast(msg: string, undo?: () => void): void {
  toast.success(
    msg,
    undo
      ? { action: { label: t('polish_undo'), onClick: undo }, duration: 6000 }
      : { duration: 6000 },
  );
}
