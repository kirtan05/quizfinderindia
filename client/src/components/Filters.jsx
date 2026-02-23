import { useState } from 'react';

const ELIGIBILITY_GROUPS = {
  'Age-based': ['U18', 'U23', 'U25', 'U30'],
  'Open': ['Open'],
  'University': ['DU Only'],
  'Degree': ['UG', 'PG', 'Research'],
};

export default function Filters({ filters, onFilterChange, onClear }) {
  const [expanded, setExpanded] = useState(false);

  function handleSearch(e) {
    onFilterChange({ ...filters, search: e.target.value });
  }

  function handleOrg(e) {
    onFilterChange({ ...filters, org: e.target.value });
  }

  function handleUpcoming(e) {
    onFilterChange({ ...filters, upcoming: e.target.checked });
  }

  function handleMode(e) {
    onFilterChange({ ...filters, mode: e.target.value || '' });
  }

  function handleEligibility(tag, checked) {
    const current = filters.eligibility || [];
    const next = checked
      ? [...current, tag]
      : current.filter(t => t !== tag);
    onFilterChange({ ...filters, eligibility: next });
  }

  const activeCount = [
    filters.search,
    filters.org,
    filters.mode,
    (filters.eligibility || []).length > 0,
    !filters.upcoming,
  ].filter(Boolean).length;

  return (
    <aside className="filters">
      <button
        className="filters__toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-controls="filters-panel"
      >
        <span className="filters__toggle-icon">{expanded ? '[-]' : '[+]'}</span>
        <span>Filters</span>
        {activeCount > 0 && (
          <span className="filters__badge">{activeCount}</span>
        )}
      </button>

      <div
        id="filters-panel"
        className={`filters__panel ${expanded ? 'filters__panel--open' : ''}`}
      >
        <div className="filters__field">
          <label className="filters__label" htmlFor="filter-search">
            <span className="filters__label-icon">/</span> Search
          </label>
          <input
            id="filter-search"
            className="filters__input"
            type="text"
            placeholder="quiz name, topic..."
            value={filters.search || ''}
            onChange={handleSearch}
          />
        </div>

        <div className="filters__field">
          <label className="filters__label" htmlFor="filter-org">
            <span className="filters__label-icon">@</span> Organisation
          </label>
          <input
            id="filter-org"
            className="filters__input"
            type="text"
            placeholder="hosting org..."
            value={filters.org || ''}
            onChange={handleOrg}
          />
        </div>

        <div className="filters__field">
          <label className="filters__checkbox-row">
            <input
              type="checkbox"
              checked={filters.upcoming !== false}
              onChange={handleUpcoming}
            />
            <span className="filters__checkbox-label">Upcoming only</span>
          </label>
        </div>

        <div className="filters__field">
          <label className="filters__label" htmlFor="filter-mode">
            <span className="filters__label-icon">~</span> Mode
          </label>
          <select
            id="filter-mode"
            className="filters__input"
            value={filters.mode || ''}
            onChange={handleMode}
          >
            <option value="">All</option>
            <option value="offline">Offline</option>
            <option value="online">Online</option>
            <option value="hybrid">Hybrid</option>
          </select>
        </div>

        <fieldset className="filters__fieldset">
          <legend className="filters__legend">Eligibility</legend>
          {Object.entries(ELIGIBILITY_GROUPS).map(([group, tags]) => (
            <div key={group} className="filters__group">
              <span className="filters__group-name">{group}</span>
              <div className="filters__group-tags">
                {tags.map(tag => (
                  <label key={tag} className="filters__checkbox-row filters__checkbox-row--tag">
                    <input
                      type="checkbox"
                      checked={(filters.eligibility || []).includes(tag)}
                      onChange={e => handleEligibility(tag, e.target.checked)}
                    />
                    <span className="filters__checkbox-label">{tag}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </fieldset>

        <button className="filters__clear" onClick={onClear}>
          x Clear all filters
        </button>
      </div>
    </aside>
  );
}
