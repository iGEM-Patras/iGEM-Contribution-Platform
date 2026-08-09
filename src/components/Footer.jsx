/** Team branding, shown under every page. */
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-white/70">
      <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm font-semibold text-gray-700">
          iGEM Patras 2026 — Game Gallery
        </p>

        <a
          href="https://igem.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-purple-700 hover:text-purple-900"
        >
          iGEM.org
        </a>
      </div>
    </footer>
  );
}
