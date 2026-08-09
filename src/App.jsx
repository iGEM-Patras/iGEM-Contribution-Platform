import { useEffect } from 'react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Gallery from './pages/Gallery';
import UploadForm from './pages/UploadForm';
import { ROUTES, useRoute } from './utils/router';

/**
 * Page shell: navigation and branding on every route, one page in the middle.
 *
 * Unknown routes fall through to the gallery rather than rendering a 404. With
 * exactly two pages, a stale link is far more likely to be a typo in the hash
 * than a page someone expects to be missing.
 */
const PAGES = {
  [ROUTES.gallery]: { title: 'Game Gallery — iGEM Patras 2026', Component: Gallery },
  [ROUTES.upload]: { title: 'Upload a Game — iGEM Patras 2026', Component: UploadForm },
};

export default function App() {
  const route = useRoute();
  const page = PAGES[route] ?? PAGES[ROUTES.gallery];
  const { Component } = page;

  useEffect(() => {
    document.title = page.title;
    // Hash navigation keeps the scroll position, which lands you halfway down
    // the new page when you jump from the bottom of the gallery to the form.
    window.scrollTo(0, 0);
  }, [page]);

  return (
    // flex column + flex-1 main: the footer sits at the bottom of short pages
    // (the empty gallery) instead of floating under the header.
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-purple-50 to-blue-50">
      <Navbar />
      <main className="flex-1">
        <Component />
      </main>
      <Footer />
    </div>
  );
}
