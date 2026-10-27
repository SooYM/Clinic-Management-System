import { describe, expect, it, vi, afterEach } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
class Storage {
  entries = new Map<string, string>();
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
}
const login = (clinic: DemoClinic, email = 'admin@example.test') =>
  clinic.request('/auth/login', 'POST', { email, password: 'demo' });
afterEach(() => vi.useRealTimers());
describe('demo admin financial workflows', () => {
  it('records paid expenses exactly once, retains corrections, scopes branches and calculates net cash income', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'));
    const storage = new Storage();
    let clinic = new DemoClinic(storage);
    await login(clinic);
    const report = await clinic.request('/admin/analytics');
    expect(report).toMatchObject({
      collectedCents: 12000,
      totalExpenseCents: 0,
      netCashIncomeCents: 12000,
    });
    expect(report.patientGroups).toEqual([
      { patientGroupId: null, label: 'No group assigned', patients: 4 },
    ]);
    const retail = await clinic.request('/inventory', 'POST', {
      name: 'Fictional retail item',
      sku: 'DEMO-ANALYTICS-RETAIL',
      category: 'RETAIL',
      ingredient: '',
      unit: 'piece',
      priceCents: 100,
      reorderLevel: 0,
    });
    await clinic.request('/inventory/batches', 'POST', {
      itemId: retail.id,
      quantity: 20,
      batchNumber: null,
      expiresOn: null,
    });
    await clinic.request('/inventory/usage', 'POST', {
      itemId: retail.id,
      quantity: 10,
      reason: 'Fictional retail use',
      idempotencyKey: crypto.randomUUID(),
    });
    expect((await clinic.request('/admin/analytics')).topUsage).toHaveLength(0);
    await clinic.request('/dispenses', 'POST', {
      encounterId: 1,
      idempotencyKey: crypto.randomUUID(),
    });
    expect((await clinic.request('/admin/analytics')).topUsage).toEqual([
      expect.objectContaining({ itemId: 1, dispensedQuantity: 3, totalQuantity: 3 }),
    ]);
    const input = {
      paidOn: '2026-10-27',
      category: 'STOCK_PURCHASE',
      description: 'Fictional supplier',
      reference: 'DEMO-COST',
      amountCents: 15000,
      idempotencyKey: crypto.randomUUID(),
    };
    const expense = await clinic.request('/admin/expenses', 'POST', input);
    expect(await clinic.request('/admin/expenses', 'POST', input)).toEqual(expense);
    expect(expense).not.toHaveProperty('requestHash');
    await expect(
      clinic.request('/admin/expenses', 'POST', { ...input, amountCents: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await clinic.request('/admin/analytics')).toMatchObject({
      collectedCents: 12000,
      stockPurchaseCents: 15000,
      totalExpenseCents: 15000,
      netCashIncomeCents: -3000,
    });
    expect((await clinic.request('/admin/analytics', 'GET', undefined, 2)).totalExpenseCents).toBe(
      0,
    );
    await expect(
      clinic.request(
        '/admin/expenses/' + expense.id,
        'PUT',
        { ...input, version: expense.version },
        2,
      ),
    ).rejects.toThrow();
    const { idempotencyKey, ...edit } = input;
    const updated = await clinic.request('/admin/expenses/' + expense.id, 'PUT', {
      ...edit,
      amountCents: 1000,
      category: 'RENT',
      version: expense.version,
    });
    await expect(
      clinic.request('/admin/expenses/' + expense.id, 'PUT', { ...edit, version: expense.version }),
    ).rejects.toMatchObject({ status: 409 });
    clinic = new DemoClinic(storage);
    expect(await clinic.request('/admin/analytics')).toMatchObject({
      stockPurchaseCents: 0,
      operatingExpenseCents: 1000,
      netCashIncomeCents: 11000,
    });
    await clinic.request('/admin/expenses/' + expense.id, 'DELETE', { version: updated.version });
    expect((await clinic.request('/admin/expenses')).data).toHaveLength(0);
    expect((await clinic.request('/admin/analytics')).netCashIncomeCents).toBe(12000);
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.audit.filter((row: any) => row.action === 'EXPENSE_CREATED')).toHaveLength(1);
    expect(
      state.rows.audit.find((row: any) => row.action === 'EXPENSE_UPDATED').metadata.before
        .amountCents,
    ).toBe(15000);
    await clinic.request('/auth/logout', 'POST');
    await login(clinic, 'reception@example.test');
    await expect(clinic.request('/admin/analytics')).rejects.toMatchObject({ status: 403 });
    await expect(clinic.request('/admin/expenses')).rejects.toMatchObject({ status: 403 });
  });
  it('shows checkout group membership and preserves recorded receipt groups after reassignment', async () => {
    const clinic = new DemoClinic(new Storage());
    await login(clinic);
    const groups = (await clinic.request('/references/catalogs?kind=PATIENT_GROUP')).data;
    const insurance = groups.find((row: any) => row.label === 'Insurance');
    const patient = await clinic.request('/patients/1');
    const fields = (row: any) => {
      const {
        id,
        patientNumber,
        tenantId,
        branchId,
        createdAt,
        updatedAt,
        patientGroupLabel,
        ...input
      } = row;
      return input;
    };
    await clinic.request('/patients/1', 'PUT', {
      ...fields(patient),
      patientGroupId: insurance.id,
    });
    expect(
      (await clinic.request('/references/patients')).data.find((row: any) => row.id === 1),
    ).toMatchObject({ patientGroupId: insurance.id, patientGroupLabel: 'Insurance' });
    const receipt = await clinic.request('/invoices', 'POST', {
      patientId: 1,
      practitionerId: 2,
      lines: [
        {
          description: 'Fictional consultation',
          quantity: 1,
          unitPriceCents: 1000,
          category: 'SERVICE',
        },
      ],
      payments: [{ method: 'CASH', amountCents: 1000, reference: '' }],
      idempotencyKey: crypto.randomUUID(),
    });
    expect(
      (await clinic.request('/invoices/' + receipt.id + '/receipt-view')).patientGroupLabel,
    ).toBe('Insurance');
    const saved = await clinic.request('/patients/1');
    await clinic.request('/patients/1', 'PUT', { ...fields(saved), patientGroupId: null });
    expect(
      (await clinic.request('/invoices/' + receipt.id + '/receipt-view')).patientGroupLabel,
    ).toBe('Insurance');
  });
});
