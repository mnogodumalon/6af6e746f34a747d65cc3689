import { createContext, useContext, useLayoutEffect } from 'react';

/**
 * The public page's column width is the SHELL's decision, but only the
 * content knows what it is: a form with a few fields reads best at 640px, a
 * wizard (stepper, record cards, a two-month calendar) is built for the
 * intent pages' 896px and was crushed in the form column (live: one calendar
 * month instead of two, cards with truncated names). A block that needs the
 * wide column registers here; PublicShell listens. Outside a PublicShell the
 * context is null and the hook is a no-op — the same block runs unchanged on
 * an internal route.
 */
export const PublicColumnContext = createContext<((wide: boolean) => void) | null>(null);

/** Called by IntentWizardShell: "I am a wizard, give me the wizard column". */
export function usePublicWizardColumn(): void {
  const request = useContext(PublicColumnContext);
  useLayoutEffect(() => {
    if (!request) return;
    request(true);
    return () => request(false);
  }, [request]);
}
