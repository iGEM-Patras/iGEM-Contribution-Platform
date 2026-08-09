/**
 * A two-page hash router, in about forty lines.
 *
 * Hash routing rather than history routing because this site is served by
 * GitHub Pages, which has no server to rewrite unknown paths back to
 * index.html. With `/upload` as a real path, a refresh or a shared link would
 * hit Pages' 404 page instead of the app. Everything after `#` never reaches
 * the server, so `#/upload` survives a reload, a bookmark and a back button —
 * and it costs no dependency.
 *
 * The <Link> that goes with this lives in components/Link.jsx: keeping JSX out
 * of this file is what lets Fast Refresh treat it as a plain module.
 */

import { useSyncExternalStore } from 'react';

export const ROUTES = {
  gallery: '/',
  upload: '/upload',
};

/** Read the current route out of `location.hash`, normalised. */
function readRoute() {
  const raw = window.location.hash.replace(/^#/, '').split('?')[0];
  if (!raw) return ROUTES.gallery;

  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  // Trailing slashes are a hand-typed variant of the same route.
  return withSlash.replace(/\/+$/, '') || ROUTES.gallery;
}

function subscribe(onChange) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/**
 * The current route path, e.g. '/' or '/upload'. Re-renders on navigation.
 *
 * useSyncExternalStore rather than useState + useEffect: it reads the hash
 * during render, so the first paint is already on the right page instead of
 * flashing the gallery for one frame when someone opens `#/upload` directly.
 */
export function useRoute() {
  return useSyncExternalStore(subscribe, readRoute, () => ROUTES.gallery);
}
