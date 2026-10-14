import { useEffect, useId, useRef, useState } from 'react';
import './SearchBox.css';

export default SearchBox;

export interface SearchSuggestion {
  id: string | number;
  label: string;
  description?: string;
}

/** Search keeps input focus; choosing a result never submits its surrounding form. */
export function SearchBox({
  value,
  onChange,
  suggestions,
  onSelect,
  ariaLabel,
  placeholder,
  loading = false,
  error,
  emptyMessage = 'No matches found.',
  name,
  disabled = false,
  filterSuggestions = true,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly SearchSuggestion[];
  onSelect: (suggestion: SearchSuggestion) => void;
  ariaLabel: string;
  placeholder?: string;
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  name?: string;
  disabled?: boolean;
  filterSuggestions?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const query = value.trim().toLocaleLowerCase();
  const matches = filterSuggestions
    ? suggestions.filter((suggestion) =>
        `${suggestion.label} ${suggestion.description || ''}`.toLocaleLowerCase().includes(query),
      )
    : suggestions;
  const visible = matches.slice(0, 8);
  const expanded = open && !!query && !disabled;
  useEffect(() => {
    setActive(-1);
  }, [value, loading, error]);
  useEffect(() => {
    if (active >= 0) optionRefs.current[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  function choose(suggestion: SearchSuggestion) {
    setOpen(false);
    setActive(-1);
    onChange(suggestion.label);
    onSelect(suggestion);
  }
  return (
    <div className="search-box">
      <input
        type="search"
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={`${id}-results`}
        aria-activedescendant={
          expanded && !loading && !error && visible[active] ? `${id}-option-${active}` : undefined
        }
        value={value}
        name={name}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            setActive(-1);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!query || loading || error || !visible.length) return;
            event.preventDefault();
            setOpen(true);
            setActive((current) =>
              event.key === 'ArrowDown'
                ? (current + 1) % visible.length
                : (current <= 0 ? visible.length : current) - 1,
            );
          } else if (event.key === 'Enter') {
            event.preventDefault();
            if (expanded && !loading && !error && active >= 0 && visible[active]) {
              choose(visible[active]);
            }
          }
        }}
      />
      {expanded && (
        <div
          className="search-box-dropdown"
          id={`${id}-results`}
          role="listbox"
          aria-label={`${ariaLabel} matches`}
        >
          {loading || error || !visible.length ? (
            <p className="search-box-message" role="status">
              {loading ? 'Searching…' : error || emptyMessage}
            </p>
          ) : (
            <>
              <div role="presentation">
                {visible.map((suggestion, index) => (
                  <div
                    key={suggestion.id}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={active === index}
                    className="search-box-option"
                    ref={(element) => (optionRefs.current[index] = element)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(suggestion)}
                  >
                    <strong>{suggestion.label}</strong>
                    {suggestion.description && <span>{suggestion.description}</span>}
                  </div>
                ))}
              </div>
              {matches.length > visible.length && (
                <p className="search-box-message">More matches available. Refine your search.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
