import { describe, expect, it } from 'vitest';
import { applyListControls, type ListConfig } from '../src/shared/list-controls';

const rows = [
  { id: 10, name: 'Alpha', status: 'active' },
  { id: 2, name: 'alpha', status: 'removed' },
  { id: 1, name: '', status: 'active' },
];
const config: ListConfig<(typeof rows)[number]> = {
  search: (row) => row.name,
  filters: [{ key: 'status', label: 'Status', value: (row) => row.status }],
  sorts: [
    { key: 'id', label: 'ID', value: (row) => row.id },
    { key: 'name', label: 'Name', value: (row) => row.name },
  ],
};
const state = { search: '', filters: {}, sort: '', descending: false };
describe('loaded list controls', () => {
  it('preserves original order and never mutates backing records', () => {
    expect(applyListControls(rows, config, state)).toEqual(rows);
    expect(applyListControls(rows, config, { ...state, sort: 'id' }).map((row) => row.id)).toEqual([
      1, 2, 10,
    ]);
    expect(rows.map((row) => row.id)).toEqual([10, 2, 1]);
  });
  it('combines case-insensitive search with exact filters', () => {
    expect(
      applyListControls(rows, config, {
        ...state,
        search: ' ALPHA ',
        filters: { status: 'active' },
      }).map((row) => row.id),
    ).toEqual([10]);
    expect(applyListControls(rows, config, { ...state, search: 'missing' })).toEqual([]);
  });
  it('sorts numeric IDs numerically and reverses direction', () => {
    expect(
      applyListControls(rows, config, { ...state, sort: 'id', descending: true }).map(
        (row) => row.id,
      ),
    ).toEqual([10, 2, 1]);
  });
  it('keeps blank values last and stable case-insensitive ties in either direction', () => {
    for (const descending of [false, true]) {
      expect(
        applyListControls(rows, config, { ...state, sort: 'name', descending }).map(
          (row) => row.id,
        ),
      ).toEqual([10, 2, 1]);
    }
  });
  it('combines multiple filters and treats missing sort values as blank', () => {
    const records = [
      { id: 1, name: 'Item 10', group: 'A', active: true },
      { id: 2, name: 'Item 2', group: 'A', active: false },
      { id: 3, name: undefined, group: 'B', active: true },
      { id: 4, name: null, group: 'A', active: true },
    ];
    const settings: ListConfig<(typeof records)[number]> = {
      search: (row) => row.name || '',
      filters: [
        { key: 'group', label: 'Group', value: (row) => row.group },
        { key: 'active', label: 'Status', value: (row) => String(row.active) },
      ],
      sorts: [{ key: 'name', label: 'Name', value: (row) => row.name }],
    };
    expect(
      applyListControls(records, settings, { ...state, sort: 'name' }).map((row) => row.id),
    ).toEqual([2, 1, 3, 4]);
    expect(
      applyListControls(records, settings, {
        ...state,
        filters: { group: 'A', active: 'true' },
      }).map((row) => row.id),
    ).toEqual([1, 4]);
  });
});
