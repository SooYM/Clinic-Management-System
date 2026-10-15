import { describe, expect, it } from 'vitest';
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
const login = (clinic: DemoClinic, alias = 'admin') =>
  clinic.request('/auth/login', 'POST', { email: alias + '@example.test', password: 'demo' });
const invoice = (category: string, key = crypto.randomUUID()) => ({
  patientId: 1,
  practitionerId: 2,
  lines: [{ description: 'Fictional fee', quantity: 1, unitPriceCents: 100, category }],
  payments: [{ method: 'CASH', amountCents: 100, reference: '' }],
  idempotencyKey: key,
});
describe('demo billing categories', () => {
  it('persists rename, immutable default marker and historical receipt replay after archive', async () => {
    const storage = new Storage();
    let clinic = new DemoClinic(storage);
    await login(clinic);
    const choices = (await clinic.request('/references/catalogs?kind=BILLING_CATEGORY')).data;
    expect(choices.map((c: any) => c.label)).toEqual(['SERVICE', 'PRODUCT']);
    const service = choices.find((c: any) => c.label === 'SERVICE');
    const edit = {
      label: 'Consultation fees',
      sortOrder: 0,
      active: true,
      version: service.version,
    };
    await clinic.request('/admin/catalogs/' + service.id, 'PUT', edit);
    clinic = new DemoClinic(storage);
    const renamed = (await clinic.request('/references/catalogs?kind=BILLING_CATEGORY')).data.find(
      (c: any) => c.id === service.id,
    );
    expect(renamed).toMatchObject({ label: 'Consultation fees', billingDefault: 'SERVICE' });
    const request = invoice('Consultation fees'),
      saved = await clinic.request('/invoices', 'POST', request);
    await clinic.request('/admin/catalogs/' + service.id, 'PUT', {
      ...edit,
      active: false,
      version: renamed.version,
    });
    expect((await clinic.request('/invoices', 'POST', request)).id).toBe(saved.id);
    await expect(
      clinic.request('/invoices', 'POST', invoice('Consultation fees')),
    ).rejects.toBeDefined();
    await expect(clinic.request('/invoices', 'POST', invoice('SERVICE'))).rejects.toBeDefined();
    const reloaded = new DemoClinic(storage);
    expect(
      (await reloaded.request('/admin/catalogs?kind=BILLING_CATEGORY')).data.find(
        (c: any) => c.id === service.id,
      ).active,
    ).toBe(false);
    expect(
      (await reloaded.request('/invoices')).data.find((row: any) => row.id === saved.id).lines[0]
        .category,
    ).toBe('Consultation fees');
  });
  it('initializes new branches and permits billing-only references without admin writes', async () => {
    const clinic = new DemoClinic(new Storage());
    await login(clinic);
    const branch = await clinic.request('/admin/branches', 'POST', {
      name: 'Fictional branch',
      address: '',
    });
    expect(
      (
        await clinic.request(
          '/references/catalogs?kind=BILLING_CATEGORY',
          'GET',
          undefined,
          branch.id,
        )
      ).data.map((c: any) => c.billingDefault),
    ).toEqual(['SERVICE', 'PRODUCT']);
    await clinic.request('/admin/role-modules', 'PUT', {
      role: 'RECEPTIONIST',
      modules: ['billing'],
    });
    await login(clinic, 'reception');
    expect((await clinic.request('/references/catalogs?kind=BILLING_CATEGORY')).data).toHaveLength(
      2,
    );
    await expect(clinic.request('/references/catalogs?kind=LAB_PANEL')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      clinic.request('/admin/catalogs', 'POST', { kind: 'BILLING_CATEGORY', label: 'Forbidden' }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
