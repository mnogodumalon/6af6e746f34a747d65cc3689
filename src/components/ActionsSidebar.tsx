import { useEffect, useRef } from 'react';
import { t } from '@/i18n';

/**
 * ActionsSidebar — drawer nav entry that opens the assistant's Werkzeuge.
 *
 * The assistant itself (chat, actions drawer, code viewer) is platform chrome
 * inside the <la-klar-assistant> element (mounted in Layout). This entry is
 * only glue: set an attribute instead of calling a method — attributes are
 * plain DOM and survive the custom element's upgrade race. The element
 * reflects its open state back onto `actions-open`; a MutationObserver
 * re-sets data-nav on close (setAttribute fires even with the same value),
 * which resets la-nav's internal highlight.
 */
export function ActionsSidebar() {
  const navRef = useRef<HTMLElement>(null);

  // Always visible — an empty list shows the drawer's empty state with its
  // create-in-chat CTA instead of hiding the entry point entirely.
  const itemsJson = JSON.stringify([{ title: t('tools_label') }]);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const handler = () => {
      const assistant = document.querySelector('la-klar-assistant');
      assistant?.setAttribute('actions-open', '');
      // On mobile, collapse the nav overlay so the actions drawer doesn't
      // open underneath the fullscreen nav (select mode = no auto-collapse).
      if (window.matchMedia('(max-width: 767.98px)').matches) {
        el.closest('la-drawer')?.setAttribute('collapsed', '');
      }
      // Embed absent (E2B preview: embed.js 404s by design) or very slow:
      // the attribute tolerates the upgrade race for a moment, but an inert
      // element must not keep a stuck nav highlight — or pop the drawer open
      // minutes later when a stalled embed finally arrives.
      window.setTimeout(() => {
        if (!customElements.get('la-klar-assistant')) {
          assistant?.removeAttribute('actions-open');
          navRef.current?.setAttribute('data-nav', itemsJson);
        }
      }, 3000);
    };
    el.addEventListener('nav:select', handler);
    return () => el.removeEventListener('nav:select', handler);
  }, [itemsJson]);

  useEffect(() => {
    const assistant = document.querySelector('la-klar-assistant');
    if (!assistant) return;
    const observer = new MutationObserver(() => {
      if (!assistant.hasAttribute('actions-open')) {
        navRef.current?.setAttribute('data-nav', itemsJson);
      }
    });
    observer.observe(assistant, { attributes: true, attributeFilter: ['actions-open'] });
    return () => observer.disconnect();
  }, [itemsJson]);

  return <la-nav ref={navRef} mode="select" data-nav={itemsJson} />;
}
