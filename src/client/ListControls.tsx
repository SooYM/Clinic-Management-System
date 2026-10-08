import { useState } from 'react';
import { applyListControls, type ListConfig } from '../shared/list-controls';

export function useListControls<T>(rows: readonly T[], config: ListConfig<T>) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(config.defaultSort || '');
  const [descending, setDescending] = useState(false);
  const items = applyListControls(rows, config, { search, filters, sort, descending });
  const label = config.label || 'List';
  return {
    items,
    controls: (
      <div className="list-controls" role="group" aria-label={`${label} controls`}>
        <label>
          Search loaded records
          <input
            type="search"
            aria-label={`${label} search`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {(config.filters || []).map((filter) => {
          const options =
            filter.options ||
            [...new Set(rows.map(filter.value).filter(Boolean))]
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
              .map((value) => ({ value, label: value.replaceAll('_', ' ') }));
          return (
            <label key={filter.key}>
              {filter.label}
              <select
                aria-label={`${label} ${filter.label}`}
                value={filters[filter.key] || ''}
                onChange={(e) => setFilters({ ...filters, [filter.key]: e.target.value })}
              >
                <option value="">All</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        <label>
          Sort by
          <select
            aria-label={`${label} sort`}
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="">Original order</option>
            {config.sorts.map((entry) => (
              <option key={entry.key} value={entry.key}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select
            aria-label={`${label} direction`}
            value={descending ? 'desc' : 'asc'}
            disabled={!sort}
            onChange={(e) => setDescending(e.target.value === 'desc')}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            setSearch('');
            setFilters({});
            setSort(config.defaultSort || '');
            setDescending(false);
          }}
        >
          Clear filters
        </button>
        <small className="list-controls-count" role="status">
          {items.length} of {rows.length} loaded records
        </small>
        {!items.length && !!rows.length && (
          <p className="form-help">No loaded records match these filters.</p>
        )}
      </div>
    ),
  };
}
