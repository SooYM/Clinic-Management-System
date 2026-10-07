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
async function ready() {
  const storage = new Storage(),
    clinic = new DemoClinic(storage);
  await clinic.request('/auth/login', 'POST', { email: 'gp@example.test', password: 'demo' });
  return { clinic, storage };
}
const rx = (quantity: number) => ({
  itemId: 1,
  quantity,
  dosage: 'Simulation only',
  durationDays: 1,
});
describe('demo reservation and supplies workflows', () => {
  it('reserves on sign, leaves physical unchanged, and dispenses once', async () => {
    const { clinic } = await ready();
    const draft = await clinic.request('/encounters', 'POST', {
      patientId: 2,
      prescriptions: [rx(4)],
      assessment: 'Fictional assessment',
    });
    expect((await clinic.request('/inventory')).data[0].stockQuantity).toBe(97);
    const signed = await clinic.request('/encounters/' + draft.id, 'PUT', {
      patientId: 2,
      prescriptions: [rx(4)],
      assessment: 'Fictional assessment',
      status: 'SIGNED',
      version: draft.version,
    });
    const item = (await clinic.request('/inventory')).data[0];
    expect([item.stockQuantity, item.onHandQuantity, item.reservedQuantity]).toEqual([93, 100, 7]);
    const body = { encounterId: signed.id, idempotencyKey: 'reservation-retry' };
    await clinic.request('/dispenses', 'POST', body);
    await clinic.request('/dispenses', 'POST', body);
    const after = (await clinic.request('/inventory')).data[0];
    expect([after.stockQuantity, after.onHandQuantity, after.reservedQuantity]).toEqual([
      93, 96, 3,
    ]);
  });
  it('rolls back insufficient signing without reserving or creating encounters', async () => {
    const { clinic } = await ready(),
      before = (await clinic.request('/encounters')).data.length;
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 2,
        prescriptions: [rx(98)],
        assessment: 'Fictional',
        status: 'SIGNED',
      }),
    ).rejects.toThrow('Insufficient');
    expect((await clinic.request('/encounters')).data).toHaveLength(before);
    expect((await clinic.request('/inventory')).data[0].stockQuantity).toBe(97);
  });
  it('receives and issues non-expiring supplies idempotently, rejects medicine bypass', async () => {
    const { clinic } = await ready();
    await clinic.request('/auth/logout', 'POST');
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const item = await clinic.request('/inventory', 'POST', {
      name: 'Lab coat',
      sku: 'COAT',
      category: 'CONSUMABLE',
      priceCents: 0,
    });
    await clinic.request('/auth/logout', 'POST');
    await clinic.request('/auth/login', 'POST', { email: 'gp@example.test', password: 'demo' });
    await clinic.request('/inventory/batches', 'POST', {
      itemId: item.id,
      batchNumber: 'COAT-1',
      quantity: 5,
      expiresOn: null,
    });
    const body = {
      itemId: item.id,
      quantity: 2,
      reason: 'Issued to treatment team',
      idempotencyKey: 'coat-issue-0001',
    };
    await clinic.request('/inventory/usage', 'POST', body);
    await clinic.request('/inventory/usage', 'POST', body);
    expect(
      (await clinic.request('/inventory?search=COAT&category=CONSUMABLE')).data[0].stockQuantity,
    ).toBe(3);
    await expect(
      clinic.request('/inventory/usage', 'POST', {
        ...body,
        itemId: 1,
        idempotencyKey: 'medicine-bypass',
      }),
    ).rejects.toThrow('Medication');
    await expect(
      clinic.request('/inventory/batches', 'POST', {
        itemId: 1,
        batchNumber: 'NO-EXPIRY',
        quantity: 1,
      }),
    ).rejects.toThrow('expiry');
  });
  it('creates an inclusive simulated MC and rejects overlapping leave', async () => {
    const { clinic } = await ready();
    const body = { encounterId: 1, kind: 'MC', startDate: '2030-02-01', days: 2 };
    const doc = await clinic.request('/documents', 'POST', body);
    expect(doc.endDate).toBe('2030-02-02');
    expect(doc.verificationUrl).toBe('/demo-unavailable');
    await expect(
      clinic.request('/documents', 'POST', { ...body, startDate: '2030-02-02' }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('reallocates an expired hold to fresh stock without reviving expired quantities', async () => {
    const { storage } = await ready();
    const [key, raw] = [...storage.entries.entries()][0];
    const state = JSON.parse(raw);
    state.rows.batches[0].expiresOn = '2000-01-01';
    storage.setItem(key, JSON.stringify(state));
    const clinic = new DemoClinic(storage);
    await expect(
      clinic.request('/dispenses', 'POST', { encounterId: 1, idempotencyKey: 'expired-rollback' }),
    ).rejects.toThrow('Insufficient');
    await clinic.request('/inventory/batches', 'POST', {
      itemId: 1,
      batchNumber: 'FRESH',
      expiresOn: '2099-01-01',
      quantity: 5,
    });
    await clinic.request('/dispenses', 'POST', {
      encounterId: 1,
      idempotencyKey: 'expired-rollback',
    });
    const item = (await clinic.request('/inventory')).data[0];
    expect([item.stockQuantity, item.onHandQuantity, item.reservedQuantity]).toEqual([2, 2, 0]);
    expect(item.batches.find((b: any) => b.id === 1).quantity).toBe(100);
  });
});
