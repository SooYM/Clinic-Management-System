import { describe, expect, it } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
import { encounterBillingLines } from '../src/shared/encounter-billing';

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
async function login(clinic: DemoClinic, role: 'admin' | 'gp') {
  await clinic.request('/auth/login', 'POST', { email: `${role}@example.test`, password: 'demo' });
}
const chart = (extra = {}) => ({
  patientId: 4,
  assessment: 'Fictional regression only',
  status: 'SIGNED',
  consultationFeeCents: 1000,
  procedureFeeCents: 500,
  ...extra,
});
const bill = (encounter: any, key = 'pricing-regression-key') => {
  const lines = encounterBillingLines(encounter)!;
  return {
    patientId: 4,
    practitionerId: 2,
    encounterId: encounter.id,
    lines,
    payments: [
      {
        method: 'CASH',
        amountCents: lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
      },
    ],
    idempotencyKey: key,
  };
};

describe('demo clinical pricing and persistent document parity', () => {
  it('requires explicit fees on new signatures and completes approved no-charge visits without payments', async () => {
    const clinic = new DemoClinic(new Storage());
    await login(clinic, 'gp');
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 4,
        assessment: 'Regression',
        status: 'SIGNED',
      }),
    ).rejects.toThrow('fees before signing');
    const encounter = await clinic.request(
      '/encounters',
      'POST',
      chart({ consultationFeeCents: 0, procedureFeeCents: 0 }),
    );
    await login(clinic, 'admin');
    const invoice = await clinic.request('/invoices', 'POST', { ...bill(encounter), payments: [] });
    expect(invoice).toMatchObject({ totalCents: 0, payments: [] });
    expect(
      (await clinic.request('/billing/suggestions')).data.some(
        (row: any) => row.id === encounter.id,
      ),
    ).toBe(false);
    await expect(
      clinic.request('/invoices', 'POST', {
        ...bill(encounter, 'manual-no-charge-key'),
        encounterId: undefined,
        payments: [],
      }),
    ).rejects.toThrow('Payment total');
  });
  it('restricts letterhead to admin and retains immutable document and receipt snapshots', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await login(clinic, 'gp');
    await expect(clinic.request('/admin/letterhead')).rejects.toThrow();
    await login(clinic, 'admin');
    const original = await clinic.request('/admin/letterhead');
    const branding = {
      ...original,
      logoDataUrl: '',
      header: 'Regression clinic',
      address: 'Regression address',
      footer: 'Regression footer',
    };
    const saved = await clinic.request('/admin/letterhead', 'PUT', branding);
    expect(saved.version).toBe(original.version + 1);
    await expect(clinic.request('/admin/letterhead', 'PUT', branding)).rejects.toThrow('changed');
    await login(clinic, 'gp');
    const encounter = await clinic.request('/encounters', 'POST', chart());
    const document = await clinic.request('/documents', 'POST', {
      encounterId: encounter.id,
      kind: 'MC',
      startDate: '2033-01-01',
      days: 1,
    });
    await login(clinic, 'admin');
    const invoice = await clinic.request('/invoices', 'POST', bill(encounter));
    await clinic.request('/admin/letterhead', 'PUT', {
      ...saved,
      header: 'Changed clinic',
      address: 'Changed address',
      footer: 'Changed footer',
    });
    expect(await clinic.request(`/invoices/${invoice.id}/receipt-view`)).toMatchObject({
      header: branding.header,
      clinicAddress: branding.address,
      footer: branding.footer,
    });
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.documents.find((row: any) => row.id === document.id).payload).toMatchObject({
      header: branding.header,
      branchAddress: branding.address,
      footer: branding.footer,
    });
    expect((await new DemoClinic(storage).request('/admin/letterhead')).header).toBe(
      'Changed clinic',
    );
  });

  it('rejects checkout tampering and preserves nonpill serving directions on labels', async () => {
    const clinic = new DemoClinic(new Storage());
    await login(clinic, 'gp');
    const encounter = await clinic.request(
      '/encounters',
      'POST',
      chart({
        prescriptions: [
          {
            itemId: 1,
            quantity: 1,
            quantityPerDose: 2.5,
            form: 'SYRUP',
            instructions: 'Fictional instruction',
            dosage: 'Fictional direction',
            frequencyPerDay: 2,
            durationDays: 3,
            unitPriceCents: 250,
          },
        ],
      }),
    );
    await login(clinic, 'admin');
    await clinic.request('/dispenses', 'POST', {
      encounterId: encounter.id,
      idempotencyKey: 'pricing-dispense-key',
    });
    const labels = await clinic.request(`/encounters/${encounter.id}/medicine-labels`);
    expect(labels.prescriptions[0]).toMatchObject({
      quantity: 1,
      quantityPerDose: 2.5,
      form: 'SYRUP',
      instructions: 'Fictional instruction',
    });
    const suggestion = (await clinic.request('/billing/suggestions')).data.find(
      (row: any) => row.id === encounter.id,
    );
    expect(suggestion).toMatchObject({ consultationFeeCents: 1000, procedureFeeCents: 500 });
    const input = bill(encounter);
    await expect(
      clinic.request('/invoices', 'POST', {
        ...input,
        lines: input.lines.map((line, index) =>
          index === 0 ? { ...line, unitPriceCents: 1 } : line,
        ),
      }),
    ).rejects.toThrow('approved');
    const receipt = await clinic.request('/invoices', 'POST', input);
    expect(receipt.totalCents).toBe(1750);
    expect(receipt.lines).toEqual(input.lines);
    expect(await clinic.request('/invoices', 'POST', input)).toEqual(receipt);
  });

  it('updates stock prices with version guards and snapshots default prescription prices', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await login(clinic, 'admin');
    const medicine = (await clinic.request('/inventory')).data.find((row: any) => row.id === 1);
    await clinic.request('/inventory/batches', 'POST', {
      itemId: 1,
      quantity: 2,
      expiresOn: '2099-01-01',
      priceCents: 275,
      itemVersion: medicine.version,
    });
    const before = [...storage.entries.values()][0];
    await expect(
      clinic.request('/inventory/batches', 'POST', {
        itemId: 1,
        quantity: 1,
        expiresOn: '2099-01-01',
        priceCents: 999,
        itemVersion: medicine.version,
      }),
    ).rejects.toThrow('changed');
    expect([...storage.entries.values()][0]).toBe(before);
    await login(clinic, 'gp');
    const encounter = await clinic.request(
      '/encounters',
      'POST',
      chart({ prescriptions: [{ itemId: 1, quantity: 1, dosage: 'Regression', durationDays: 1 }] }),
    );
    expect(encounter.prescriptions[0].unitPriceCents).toBe(275);
  });

  it('rolls back consumed supplies if later prescription reservation fails', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await login(clinic, 'admin');
    const supply = await clinic.request('/inventory', 'POST', {
      name: 'Regression gauze',
      sku: 'REGRESSION-GAUZE',
      category: 'CONSUMABLE',
      unit: 'piece',
      priceCents: 0,
    });
    await clinic.request('/inventory/batches', 'POST', { itemId: supply.id, quantity: 5 });
    await login(clinic, 'gp');
    const before = [...storage.entries.values()][0];
    await expect(
      clinic.request(
        '/encounters',
        'POST',
        chart({
          consumables: [{ itemId: supply.id, quantity: 2, reason: 'Regression surgery' }],
          prescriptions: [{ itemId: 1, quantity: 100000, dosage: 'Regression', durationDays: 1 }],
        }),
      ),
    ).rejects.toThrow('Insufficient');
    expect([...storage.entries.values()][0]).toBe(before);
    const result = await clinic.request(
      '/encounters',
      'POST',
      chart({
        procedureNotes: 'Regression minor surgery',
        consumables: [{ itemId: supply.id, quantity: 2, reason: 'Regression surgery' }],
      }),
    );
    expect(
      (await clinic.request('/references/consumables')).data.find(
        (row: any) => row.id === supply.id,
      ).stockQuantity,
    ).toBe(3);
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.usages.filter((row: any) => row.encounterId === result.id)).toHaveLength(1);
  });
});
