import type { ComponentType, LazyExoticComponent } from 'react';
// <public:imports>
// </public:imports>

// Registry for agent-built (bespoke) public pages. A slug registered here
// REPLACES the generic config-driven form renderer for that slug — the
// shared link (/#/public/<slug>) stays identical, which is exactly the
// upgrade path: a generic form can become a custom page without a new URL.
//
// To register a page: add a `lazy` react import inside the <public:imports>
// markers, then inside <public:pages> map a slug to a lazily-loaded page
// component under @/pages/public/ — e.g. slug 'buchung' loads a Booking
// component. (Example kept prose-only so it is not read as a real import.)
export const PUBLIC_PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  // <public:pages>
  // </public:pages>
};
