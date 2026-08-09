import { useEffect, useMemo, useState } from 'react';
import ImageCarousel from '../components/ImageCarousel';
import SearchAndFilter from '../components/SearchAndFilter';
import Link from '../components/Link';
import { fetchApprovedGames } from '../utils/api';
import { ROUTES } from '../utils/router';
import {
  ALL_YEARS,
  DEFAULT_SORT,
  availableYears,
  formatSubmittedDate,
  selectGames,
} from '../utils/games';

/**
 * One definition for the card grid, shared by the skeleton and the real list so
 * the placeholders cannot drift out of step with what replaces them.
 *
 * Three across on desktop, two on tablets, one on phones.
 */
const GRID_CLASS = 'grid gap-8 sm:grid-cols-2 lg:grid-cols-3';

/** Grey placeholders while the Worker answers — steadier than a lone spinner. */
function GallerySkeleton() {
  return (
    <div className={GRID_CLASS} aria-hidden="true">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden animate-pulse">
          <div className="aspect-[4/3] w-full bg-gray-200" />
          <div className="p-5 space-y-3">
            <div className="h-5 w-2/3 rounded bg-gray-200" />
            <div className="h-3 w-1/3 rounded bg-gray-100" />
            <div className="h-9 w-full rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

function GameCard({ game }) {
  const teamName = game.teamName || 'Untitled game';
  const submitted = formatSubmittedDate(game.createdTime);

  return (
    <article className="flex flex-col bg-white rounded-xl shadow-lg overflow-hidden transition hover:shadow-xl">
      <ImageCarousel
        mainImage={game.mainImageUrl}
        images={game.secondaryImageUrls}
        teamName={teamName}
      />

      <div className="flex flex-1 flex-col p-5">
        <h2 className="text-lg font-bold text-gray-900">{teamName}</h2>

        {submitted && <p className="mt-1 text-xs text-gray-500">Submitted {submitted}</p>}

        {/* mt-auto pins the actions to the bottom, so cards in a row line up
            even when one team's name wraps to two lines. */}
        <div className="mt-auto pt-4 flex flex-wrap gap-2">
          {game.rulesPdfUrl ? (
            <a
              href={game.rulesPdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:from-purple-700 hover:to-blue-700"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download Rules
              <span className="sr-only"> for {teamName} (opens in a new tab)</span>
            </a>
          ) : (
            <span className="inline-flex items-center rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-400">
              Rules unavailable
            </span>
          )}

          {game.instagram && (
            <a
              href={game.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-purple-200 px-4 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-50"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.2c3.2 0 3.6 0 4.9.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.41 2.23.06 1.27.07 1.65.07 4.86s0 3.6-.07 4.86c-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.23.41-1.27.06-1.65.07-4.9.07s-3.6 0-4.86-.07c-1.17-.05-1.8-.25-2.23-.41a3.8 3.8 0 01-1.38-.9 3.8 3.8 0 01-.9-1.38c-.16-.42-.36-1.06-.41-2.23C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.86c.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.23-.41C8.4 2.2 8.8 2.2 12 2.2m0 6.6a3.2 3.2 0 100 6.4 3.2 3.2 0 000-6.4m0 5.28a2.08 2.08 0 110-4.16 2.08 2.08 0 010 4.16m4.1-5.4a.75.75 0 11-1.5 0 .75.75 0 011.5 0" />
              </svg>
              Instagram
              <span className="sr-only"> profile for {teamName} (opens in a new tab)</span>
            </a>
          )}
        </div>

        {game.submittedBy && (
          <p className="mt-3 text-xs text-gray-400">Submitted by: {game.submittedBy}</p>
        )}
      </div>
    </article>
  );
}

export default function Gallery() {
  const [games, setGames] = useState([]);
  // 'loading' | 'ready' | 'error'
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  // Bumping this re-runs the fetch effect; that is all "Try again" needs to do.
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState('');
  const [year, setYear] = useState(ALL_YEARS);
  const [sort, setSort] = useState(DEFAULT_SORT);

  useEffect(() => {
    // StrictMode runs effects twice in development, and a slow first response
    // could otherwise land after the second one and overwrite it.
    let active = true;

    fetchApprovedGames()
      .then(result => {
        if (!active) return;
        setGames(result);
        setStatus('ready');
      })
      .catch(cause => {
        if (!active) return;
        console.error('Gallery load failed:', cause);
        setError(cause.message || 'Could not load the gallery.');
        setStatus('error');
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const retry = () => {
    setStatus('loading');
    setError('');
    setReloadToken(token => token + 1);
  };

  const years = useMemo(() => availableYears(games), [games]);

  const visibleGames = useMemo(
    () => selectGames(games, { search, year, sort }),
    [games, search, year, sort]
  );

  const resetFilters = () => {
    setSearch('');
    setYear(ALL_YEARS);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Game Gallery</h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Games built by iGEM teams around the world, collected by iGEM Patras 2026.
          Browse the images, read the rules, and get in touch with the teams.
        </p>
      </div>

      {status === 'loading' && <GallerySkeleton />}

      {status === 'error' && (
        <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center" role="alert">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Could not load the gallery</h2>
          <p className="text-sm text-red-700 mb-5">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && games.length === 0 && (
        <div className="mx-auto max-w-lg rounded-xl bg-white p-10 text-center shadow-sm">
          <svg className="mx-auto mb-4 h-12 w-12 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5" />
            <circle cx="9" cy="9" r="1.5" strokeWidth={1.5} />
          </svg>
          <h2 className="text-xl font-bold text-gray-900 mb-2">No games published yet</h2>
          <p className="text-gray-600 mb-6">
            Approved submissions appear here automatically. Be the first team in the gallery.
          </p>
          <Link
            to={ROUTES.upload}
            className="inline-block rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-6 py-3 font-bold text-white transition hover:from-purple-700 hover:to-blue-700"
          >
            Upload your game
          </Link>
        </div>
      )}

      {status === 'ready' && games.length > 0 && (
        <>
          <SearchAndFilter
            search={search}
            onSearchChange={setSearch}
            year={year}
            onYearChange={setYear}
            years={years}
            sort={sort}
            onSortChange={setSort}
            resultCount={visibleGames.length}
            totalCount={games.length}
            onReset={resetFilters}
          />

          {visibleGames.length === 0 ? (
            <div className="rounded-xl bg-white p-10 text-center shadow-sm">
              <h2 className="text-lg font-bold text-gray-900 mb-2">No games match your filters</h2>
              <p className="text-gray-600 mb-5">
                Try a different team name, or widen the year filter.
              </p>
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-lg border border-purple-200 px-5 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-50"
              >
                Clear filters
              </button>
            </div>
          ) : (
            <div className={GRID_CLASS}>
              {visibleGames.map(game => (
                <GameCard key={game.id} game={game} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
