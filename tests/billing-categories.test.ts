import { describe, expect, it } from 'vitest';
import { schemas } from '../src/server/validation';
import { validateCatalogChoices } from '../src/server/catalog-service';
const ctx: any = { actor: { tenantId: 1 }, branchId: 2 };
const db = (rows: any[]) => ({ query: async () => ({ rows }) }) as any;
const invoice = (category: string) => ({
  patientId: 1,
  practitionerId: 2,
  lines: [{ description: 'Visit', quantity: 1, unitPriceCents: 100, category }],
  payments: [{ method: 'CASH', amountCents: 100, reference: '' }],
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
});
describe('billing category validation', () => {
  it('accepts trimmed custom labels and rejects empty or oversized labels', () => {
    expect(schemas.invoice.parse(invoice('  Consultation fees  ')).lines[0].category).toBe(
      'Consultation fees',
    );
    expect(schemas.invoice.safeParse(invoice(' ')).success).toBe(false);
    expect(schemas.invoice.safeParse(invoice('x'.repeat(201))).success).toBe(false);
  });
  it('restricts manually provisioned legacy branches to original choices', async () => {
    await expect(
      validateCatalogChoices(db([]), ctx, 'BILLING_CATEGORY', ['SERVICE', 'PRODUCT']),
    ).resolves.toBeUndefined();
    await expect(
      validateCatalogChoices(db([]), ctx, 'BILLING_CATEGORY', ['Unknown']),
    ).rejects.toMatchObject({ code: 'INACTIVE_CATALOG_CHOICE' });
  });
  it('never falls back when all configured choices are archived', async () => {
    await expect(
      validateCatalogChoices(db([{ label: 'SERVICE', active: 0 }]), ctx, 'BILLING_CATEGORY', [
        'SERVICE',
      ]),
    ).rejects.toMatchObject({ code: 'INACTIVE_CATALOG_CHOICE' });
  });
});
