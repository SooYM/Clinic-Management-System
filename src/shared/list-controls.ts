export type ListValue = string | number | null | undefined;
export interface ListFilter<T> {
  key: string;
  label: string;
  value: (row: T) => string;
  options?: { value: string; label: string }[];
}
export interface ListSort<T> {
  key: string;
  label: string;
  value: (row: T) => ListValue;
}
export interface ListConfig<T> {
  search: (row: T) => string;
  filters?: ListFilter<T>[];
  sorts: ListSort<T>[];
  defaultSort?: string;
  label?: string;
}
export function applyListControls<T>(
  rows: readonly T[],
  config: ListConfig<T>,
  state: { search: string; filters: Record<string, string>; sort: string; descending: boolean },
): T[] {
  const query = state.search.trim().toLocaleLowerCase();
  const result = rows.filter(
    (row) =>
      (!query || config.search(row).toLocaleLowerCase().includes(query)) &&
      (config.filters || []).every(
        (filter) => !state.filters[filter.key] || filter.value(row) === state.filters[filter.key],
      ),
  );
  const sort = config.sorts.find((entry) => entry.key === state.sort);
  if (!sort) return result;
  return result.sort((a, b) => {
    const left = sort.value(a);
    const right = sort.value(b);
    const leftBlank = left === null || left === undefined || left === '';
    const rightBlank = right === null || right === undefined || right === '';
    if (leftBlank || rightBlank) return Number(leftBlank) - Number(rightBlank);
    const comparison =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            sensitivity: 'base',
            numeric: true,
          });
    return state.descending ? -comparison : comparison;
  });
}
