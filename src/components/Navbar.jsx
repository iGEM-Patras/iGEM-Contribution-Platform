import { useState } from 'react';
import Link from './Link';
import { ROUTES, useRoute } from '../utils/router';

const LINKS = [
  { to: ROUTES.gallery, label: 'View Games' },
  { to: ROUTES.upload, label: 'Upload Game' },
];

/**
 * Sticky top navigation, shown on both pages.
 *
 * The mobile menu is a plain disclosure rather than an overlay: with two links
 * there is nothing to justify trapping focus or hiding the page behind a
 * full-screen sheet.
 */
export default function Navbar() {
  const route = useRoute();

  // The route is stored alongside the open flag so that navigating — by link,
  // by back button, by typed hash — closes the panel. Adjusting state during
  // render is React's own answer to "derive from a prop change"; an effect
  // would paint the menu open over the new page for a frame first.
  const [menu, setMenu] = useState({ open: false, route });
  if (menu.route !== route) {
    // React restarts the render with the new state before committing, so the
    // read below already sees the closed menu.
    setMenu({ open: false, route });
  }

  const toggleMenu = () => setMenu(current => ({ open: !current.open, route }));

  const linkClass = (to, { block = false } = {}) => {
    const base = block
      ? 'block w-full text-center px-4 py-3 rounded-lg font-medium transition'
      : 'px-4 py-2 rounded-lg font-medium transition';

    return route === to
      ? `${base} bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-sm`
      : `${base} text-gray-700 hover:text-purple-700 hover:bg-purple-50`;
  };

  return (
    // backdrop-blur keeps the bar legible while cards scroll under it.
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200">
      <nav className="max-w-7xl mx-auto px-4" aria-label="Main">
        <div className="flex items-center justify-between h-16">
          {/* Logo / title */}
          <Link
            to={ROUTES.gallery}
            className="flex items-center gap-3 group"
            aria-label="iGEM Game Gallery — home"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 text-white font-bold">
              iG
            </span>
            <span className="leading-tight">
              <span className="block font-bold text-gray-900 group-hover:text-purple-700 transition">
                iGEM Game Gallery
              </span>
              <span className="block text-xs text-gray-500">iGEM Patras 2026</span>
            </span>
          </Link>

          {/* Desktop links */}
          <div className="hidden sm:flex items-center gap-2">
            {LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                className={linkClass(link.to)}
                aria-current={route === link.to ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Hamburger */}
          <button
            type="button"
            onClick={toggleMenu}
            className="sm:hidden p-2 -mr-2 rounded-lg text-gray-700 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
            aria-expanded={menu.open}
            aria-controls="mobile-menu"
            aria-label={menu.open ? 'Close menu' : 'Open menu'}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              {menu.open ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {menu.open && (
          <div id="mobile-menu" className="sm:hidden pb-4 space-y-2">
            {LINKS.map(link => (
              <Link
                key={link.to}
                to={link.to}
                // Tapping the page you are already on fires no hashchange, so
                // the route-based close above never runs. Close it here too.
                onClick={() => setMenu({ open: false, route })}
                className={linkClass(link.to, { block: true })}
                aria-current={route === link.to ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
