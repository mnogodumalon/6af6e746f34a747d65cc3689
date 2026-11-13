/// <reference types="react" />

// Ambient-JSX-Typen für die LivingApps Web Components (Chrome der SPA:
// Header-Bar, Drawer, Nav). Die Widgets kommen über den loader.js in
// index.html und registrieren sich selbst als Custom Elements.
//
// React 18+ hält JSX unter React.JSX — `declare global { namespace JSX }`
// wäre ein stilles No-op, daher liegt die Deklaration unter dem
// React-Namespace (gleiches Muster wie altcha.d.ts).
type LaWidgetProps<T = object> = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement> & T,
  HTMLElement
>;

declare namespace React {
  namespace JSX {
    interface IntrinsicElements {
      'la-header-bar-widget': LaWidgetProps<{
        title?: string;
        'app-id'?: string;
        'profile-initials'?: string;
      }>;
      'la-apps-menu-widget': LaWidgetProps<{ open?: boolean; 'app-id'?: string }>;
      'la-profile-menu-widget': LaWidgetProps<{ open?: boolean }>;
      'la-feedback-form-widget': LaWidgetProps<{ open?: boolean; type?: string }>;
      'la-app-group-nav-widget': LaWidgetProps<{
        'group-id'?: string;
        'app-id'?: string;
        'show-dashboard'?: string;
      }>;
      'la-dashboard-link-widget': LaWidgetProps<{ 'app-id'?: string }>;
      /** Sidebar list of the app group's public pages — the platform's own
       *  widget (UL4 sidebar): reads /objects/<group>/public-pages.json, one
       *  row per published page, then 'Seiten verwalten'. */
      'la-public-pages-widget': LaWidgetProps<{ 'group-id'?: string; 'app-id'?: string }>;
      /** Sidebar list of the app group's actions (actions-agent): run, code,
       *  description per row, 'Alle Aktionen' last. */
      'la-actions-widget': LaWidgetProps<{ 'group-id'?: string; 'app-id'?: string; 'max-items'?: string }>;
      /** Files produced by actions; hides itself while there are none. */
      'la-action-files-widget': LaWidgetProps<{ 'group-id'?: string; 'app-id'?: string; 'max-items'?: string }>;
      'la-app-group-copy-widget': LaWidgetProps<{
        open?: boolean;
        'data-grp-id'?: string;
      }>;
      'la-user-profile-widget': LaWidgetProps<{ open?: boolean }>;
      'la-security-widget': LaWidgetProps<{ open?: boolean }>;
      'la-drawer': LaWidgetProps<{
        'fixed-width'?: string;
        toggle?: string;
        collapsed?: boolean;
      }>;
      'la-nav': LaWidgetProps<{
        mode?: 'navigate' | 'select';
        'data-nav'?: string;
      }>;
      /** Klar assistant (chat + Werkzeuge + code viewer) — platform chrome,
       *  loaded via /actions-agent/embed/embed.js. `actions-open` is a state
       *  attribute: setting it opens the actions drawer, the element reflects
       *  it back on open/close. Events: dispatches assistant:data-changed
       *  (bubbles + composed) after every mutation. */
      'la-klar-assistant': LaWidgetProps<{
        'appgroup-id'?: string;
        'actions-open'?: boolean;
      }>;
      'la-nav-section': LaWidgetProps<{
        type?: 'primary' | 'secondary';
        label?: string;
        icon?: string;
        /** Kleinere Unterpunkt-Schrift: setzt --la-nav-text-size im Shadow. */
        dense?: string;
        foldable?: string;
        divider?: string;
        scroll?: boolean;
        'max-height'?: string;
        collapsed?: boolean;
      }>;
    }
  }
}
