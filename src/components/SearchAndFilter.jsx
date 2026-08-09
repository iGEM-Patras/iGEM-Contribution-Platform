import { ALL_YEARS, SORT_OPTIONS } from '../utils/games';

const selectClass =
  'w-full px-4 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none ' +
  'focus:ring-2 focus:ring-purple-500';

/**
 * Search, year filter and sort for the gallery.
 *
 * Fully controlled: the Gallery owns the three values and applies them, so the
 * controls compose there rather than each keeping its own copy of the list.
 *
 * @param {{
 *   search: string, onSearchChange: (value: string) => void,
 *   year: string, onYearChange: (value: string) => void, years: number[],
 *   sort: string, onSortChange: (value: string) => void,
 *   resultCount: number, totalCount: number, onReset: () => void,
 * }} props
 */
export default function SearchAndFilter({
  search,
  onSearchChange,
  year,
  onYearChange,
  years,
  sort,
  onSortChange,
  resultCount,
  totalCount,
  onReset,
}) {
  const filtersActive = search.trim() !== '' || year !== ALL_YEARS;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        {/* Search */}
        <div className="sm:col-span-2 lg:col-span-1">
          <label htmlFor="game-search" className="block text-sm font-medium text-gray-700 mb-2">
            Search by team
          </label>
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              id="game-search"
              type="search"
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              placeholder="e.g. MIT iGEM 2024"
              autoComplete="off"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Year filter */}
        <div>
          <label htmlFor="year-filter" className="block text-sm font-medium text-gray-700 mb-2">
            Year
          </label>
          <select
            id="year-filter"
            value={year}
            onChange={event => onYearChange(event.target.value)}
            className={selectClass}
          >
            <option value={ALL_YEARS}>All years</option>
            {years.map(value => (
              <option key={value} value={String(value)}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {/* Sort */}
        <div>
          <label htmlFor="sort-order" className="block text-sm font-medium text-gray-700 mb-2">
            Sort by
          </label>
          <select
            id="sort-order"
            value={sort}
            onChange={event => onSortChange(event.target.value)}
            className={selectClass}
          >
            {SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
        {/* aria-live: the count is the only feedback that typing did anything,
            so a screen reader has to hear it change. */}
        <p className="text-sm text-gray-600" aria-live="polite">
          <span className="font-semibold text-gray-900">{resultCount}</span>{' '}
          {resultCount === 1 ? 'game' : 'games'} found
          {filtersActive && totalCount > 0 && (
            <span className="text-gray-400"> of {totalCount}</span>
          )}
        </p>

        {filtersActive && (
          <button
            type="button"
            onClick={onReset}
            className="text-sm font-medium text-purple-700 hover:text-purple-900 underline"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
