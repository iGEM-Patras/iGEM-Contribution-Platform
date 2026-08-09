/**
 * Shared vocabulary for the gallery's search, filter and sort.
 *
 * These live outside the components so that SearchAndFilter (which renders the
 * controls) and Gallery (which applies them) cannot drift apart — and so that
 * neither .jsx file exports a non-component, which is what keeps Fast Refresh
 * working on both.
 */

/** Sentinel for "no year filter". A string, because <select> values are strings. */
export const ALL_YEARS = 'all';

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
];

export const DEFAULT_SORT = SORT_OPTIONS[0].value;

/**
 * The iGEM year a game belongs to.
 *
 * The competition year the team entered on the form is authoritative. Rows
 * submitted before that field existed fall back to the year the record was
 * created — wrong for an older game, but better than dropping it out of the
 * filter entirely.
 */
function gameYear(game) {
  if (Number.isInteger(game.competitionYear)) return game.competitionYear;
  if (!game.createdTime) return null;

  const year = new Date(game.createdTime).getFullYear();
  return Number.isNaN(year) ? null : year;
}

/** A short, locale-formatted submission date, or null if there isn't one. */
export function formatSubmittedDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Every year present in the data, newest first. No hardcoded range to age out. */
export function availableYears(games) {
  const found = new Set();
  for (const game of games) {
    const year = gameYear(game);
    if (year !== null) found.add(year);
  }
  return [...found].sort((a, b) => b - a);
}

/**
 * Search, filter and sort in one pass, so the three compose instead of
 * competing: narrowing by year still searches, and sorting applies to whatever
 * survived both.
 *
 * @param {Array<object>} games
 * @param {{search: string, year: string, sort: string}} criteria
 */
export function selectGames(games, { search, year, sort }) {
  const needle = search.trim().toLowerCase();

  const filtered = games.filter(game => {
    // Case-insensitive substring: teams type "mit", not "MIT iGEM 2024".
    const matchesSearch = !needle || (game.teamName ?? '').toLowerCase().includes(needle);
    const matchesYear = year === ALL_YEARS || String(gameYear(game)) === year;
    return matchesSearch && matchesYear;
  });

  // Sorting a copy: `filtered` is fresh here, but sorting in place is a habit
  // that silently mutates state the day this stops being a new array.
  return [...filtered].sort((a, b) =>
    sort === 'alphabetical'
      ? (a.teamName ?? '').localeCompare(b.teamName ?? '', undefined, { sensitivity: 'base' })
      : // ISO-8601 timestamps sort correctly as plain strings, newest first.
        (b.createdTime ?? '').localeCompare(a.createdTime ?? '')
  );
}
