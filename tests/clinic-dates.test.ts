import { describe, expect, it } from 'vitest';
import { defaultMcStartDate, malaysiaDate } from '../src/shared/clinic-dates';
describe('Malaysia clinical date defaults', () => {
  it('uses Malaysia day across UTC midnight boundaries', () => {
    expect(malaysiaDate(new Date('2026-10-06T16:30:00Z'))).toBe('2026-10-07');
  });
  it('defaults to today immediately before 17:00 MYT', () => {
    expect(defaultMcStartDate(new Date('2026-10-07T08:59:59Z'))).toBe('2026-10-07');
  });
  it('defaults to tomorrow at exactly 17:00 MYT and later', () => {
    expect(defaultMcStartDate(new Date('2026-10-07T09:00:00Z'))).toBe('2026-10-08');
    expect(defaultMcStartDate(new Date('2026-10-07T15:59:59Z'))).toBe('2026-10-08');
  });
  it('handles year and leap-day rollover', () => {
    expect(defaultMcStartDate(new Date('2026-12-31T09:00:00Z'))).toBe('2027-01-01');
    expect(defaultMcStartDate(new Date('2028-02-28T09:00:00Z'))).toBe('2028-02-29');
    expect(defaultMcStartDate(new Date('2028-02-29T09:00:00Z'))).toBe('2028-03-01');
  });
});
