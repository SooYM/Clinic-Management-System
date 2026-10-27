import { z } from 'zod';
import { malaysiaDate } from './clinic-dates';

export const expenseCategories = [
  'STOCK_PURCHASE',
  'RENT',
  'SALARY',
  'UTILITIES',
  'OTHER',
] as const;
const civilDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => value >= '1000-01-01', 'Choose a date from year 1000 onward.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Choose a valid date.');
export function defaultAnalyticsRange() {
  const to = malaysiaDate();
  return { from: `${to.slice(0, 7)}-01`, to };
}
export const analyticsRangeSchema = z
  .object({ from: civilDate, to: civilDate })
  .strict()
  .refine((value) => value.from <= value.to, 'End date must follow start date.')
  .refine(
    (value) => (new Date(value.to).getTime() - new Date(value.from).getTime()) / 86400000 <= 365,
    'Choose at most 366 days.',
  );
export function parseAnalyticsRange(value: Record<string, unknown>) {
  return analyticsRangeSchema.parse({ ...defaultAnalyticsRange(), ...value });
}
export function analyticsUtcBounds(range: { from: string; to: string }) {
  const start = new Date(`${range.from}T00:00:00+08:00`);
  const end = new Date(`${range.to}T00:00:00+08:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return {
    start: start.toISOString().slice(0, 23).replace('T', ' '),
    end: end.toISOString().slice(0, 23).replace('T', ' '),
  };
}
export const expenseInput = z
  .object({
    paidOn: civilDate.refine(
      (value) => value <= malaysiaDate(),
      'Paid date cannot be in the future.',
    ),
    category: z.enum(expenseCategories),
    description: z.string().trim().min(1).max(500),
    amountCents: z.number().int().positive().max(2_000_000_000),
    reference: z.string().trim().max(200).default(''),
  })
  .strict();
export const expenseCreateInput = expenseInput.extend({
  idempotencyKey: z.string().min(8).max(100),
});
export function expenseAmountCents(value: string) {
  const result = z
    .string()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'Enter an amount with at most two decimal places.')
    .safeParse(value.trim());
  if (!result.success) throw new Error(result.error.issues[0].message);
  const [whole, fraction = ''] = result.data.split('.');
  const amount = expenseInput.shape.amountCents.safeParse(
    Number(whole) * 100 + Number(fraction.padEnd(2, '0')),
  );
  if (!amount.success) throw new Error('Enter an amount from RM 0.01 to RM 20,000,000.00.');
  return amount.data;
}
export interface ExpenseRecord {
  id: number;
  paidOn: string;
  category: (typeof expenseCategories)[number];
  description: string;
  amountCents: number;
  reference: string;
  version: number;
  voidedAt: string | null;
}
export interface AdminAnalytics {
  from: string;
  to: string;
  collectedCents: number;
  stockPurchaseCents: number;
  operatingExpenseCents: number;
  totalExpenseCents: number;
  netCashIncomeCents: number;
  paidInvoiceCount: number;
  patientGroups: { patientGroupId: number | null; label: string; patients: number }[];
  topUsage: {
    itemId: number;
    name: string;
    category: string;
    unit: string;
    dispensedQuantity: number;
    usedQuantity: number;
    totalQuantity: number;
  }[];
}
