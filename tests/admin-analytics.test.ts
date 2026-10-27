import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsRangeSchema,
  analyticsUtcBounds,
  defaultAnalyticsRange,
  expenseInput,
  expenseAmountCents,
} from '../src/shared/admin-analytics';
import { readAdminAnalytics } from '../src/server/admin-analytics';
afterEach(() => vi.useRealTimers());

describe('admin cash-basis reporting', () => {
  it('uses Malaysia civil days, inclusive end dates, and bounded valid report periods', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T17:00:00Z'));
    expect(defaultAnalyticsRange()).toEqual({ from: '2026-11-01', to: '2026-11-01' });
    expect(analyticsUtcBounds({ from: '2026-10-01', to: '2026-10-31' })).toEqual({
      start: '2026-09-30 16:00:00.000',
      end: '2026-10-31 16:00:00.000',
    });
    for (const range of [
      { from: '0000-01-01', to: '0000-01-02' },
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-10-02', to: '2026-10-01' },
      { from: '2025-01-01', to: '2026-01-02' },
    ])
      expect(analyticsRangeSchema.safeParse(range).success).toBe(false);
    expect(analyticsRangeSchema.safeParse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(
      true,
    );
  });
  it('keeps paid expenses positive exact cents and rejects future/invalid or fractional-cent amounts', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
    expect(expenseAmountCents('12345678.91')).toBe(1234567891);
    expect(expenseAmountCents('0.01')).toBe(1);
    for (const value of ['1.001', '0', '-1', 'NaN', '1e3', '20000000.01'])
      expect(() => expenseAmountCents(value)).toThrow();
    const base = {
      paidOn: '2026-10-27',
      category: 'STOCK_PURCHASE',
      description: 'Supplier invoice',
      amountCents: 12345,
      reference: 'REF-1',
    };
    expect(expenseInput.parse(base)).toEqual(base);
    expect(expenseInput.safeParse({ ...base, paidOn: '2026-10-28' }).success).toBe(false);
    expect(expenseInput.safeParse({ ...base, amountCents: 1.5 }).success).toBe(false);
  });
  it('requires administrator authority before reading financial data', async () => {
    const query = vi.fn();
    await expect(
      readAdminAnalytics({ query }, { actor: { role: 'RECEPTIONIST' } } as any, {
        from: '2026-10-01',
        to: '2026-10-27',
      }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    expect(query).not.toHaveBeenCalled();
  });
});
