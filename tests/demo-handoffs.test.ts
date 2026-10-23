import { describe, expect, it, vi, afterEach } from 'vitest';
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
const medicine = { itemId: 1, quantity: 3, dosage: 'Fictional test only', durationDays: 1 };
async function ready(medicines = true) {
  const storage = new Storage(),
    clinic = new DemoClinic(storage);
  await clinic.request('/auth/login', 'POST', { email: 'gp@example.test', password: 'demo' });
  const ticket = await clinic.request('/queue', 'POST', { patientId: 4, priority: 'NORMAL' });
  await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
    status: 'CALLED_TO_ROOM',
    version: ticket.version,
    practitionerId: 2,
    roomId: 1,
  });
  const consultation = {
    patientId: 4,
    queueTicketId: ticket.id,
    assessment: 'Fictional workflow test',
    prescriptions: medicines ? [medicine] : [],
    status: 'SIGNED',
    consultationFeeCents: 100,
    procedureFeeCents: 0,
  };
  return { clinic, storage, ticket, consultation };
}
async function admin(clinic: DemoClinic) {
  await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
}
const checkout = (encounter: any, key = 'checkout-test-key') => ({
  encounterId: encounter.id,
  patientId: 4,
  practitionerId: 2,
  lines: encounterBillingLines(encounter)!,
  payments: [
    {
      method: 'CASH',
      amountCents: encounterBillingLines(encounter)!.reduce(
        (sum, line) => sum + line.quantity * line.unitPriceCents,
        0,
      ),
    },
  ],
  idempotencyKey: key,
});
afterEach(() => vi.useRealTimers());
describe('demo synchronized visit handoffs', () => {
  it('reserves on sign, dispenses once, suggests billing and completes the linked visit once', async () => {
    const { clinic, ticket, consultation } = await ready();
    expect((await clinic.request('/clinical/queue-suggestions')).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ queueTicketId: ticket.id, patientId: 4 })]),
    );
    const before = (await clinic.request('/references/medications')).data.find(
      (row: any) => row.id === 1,
    );
    const encounter = await clinic.request('/encounters', 'POST', consultation);
    const reserved = (await clinic.request('/references/medications')).data.find(
      (row: any) => row.id === 1,
    );
    expect(reserved).toMatchObject({
      onHandQuantity: before.onHandQuantity,
      stockQuantity: before.stockQuantity - 3,
      reservedQuantity: before.reservedQuantity + 3,
    });
    expect(
      (await clinic.request('/dispensary/encounters')).data.some(
        (row: any) => row.id === encounter.id,
      ),
    ).toBe(true);
    await admin(clinic);
    expect(
      (await clinic.request('/billing/suggestions')).data.some(
        (row: any) => row.id === encounter.id,
      ),
    ).toBe(false);
    await expect(clinic.request('/invoices', 'POST', checkout(encounter))).rejects.toThrow(
      'Dispense',
    );
    const dispenseBody = { encounterId: encounter.id, idempotencyKey: 'dispense-handoff-test' };
    const dispense = await clinic.request('/dispenses', 'POST', dispenseBody);
    const queue = (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id);
    expect(queue.status).toBe('PAYMENT_WAITING');
    expect(await clinic.request('/dispenses', 'POST', dispenseBody)).toEqual(dispense);
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id).version,
    ).toBe(queue.version);
    const stock = (await clinic.request('/references/medications')).data.find(
      (row: any) => row.id === 1,
    );
    expect(stock.onHandQuantity).toBe(before.onHandQuantity - 3);
    expect(stock.stockQuantity).toBe(before.stockQuantity - 3);
    const suggestion = (await clinic.request('/billing/suggestions')).data.find(
      (row: any) => row.id === encounter.id,
    );
    expect(suggestion).toMatchObject({
      encounterId: encounter.id,
      patientId: 4,
      practitionerId: 2,
    });
    expect(suggestion.prescriptions[0].unitPriceCents).toBeTypeOf('number');
    const invoice = await clinic.request('/invoices', 'POST', checkout(encounter));
    expect(await clinic.request('/invoices', 'POST', checkout(encounter))).toEqual(invoice);
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id).status,
    ).toBe('COMPLETED');
    expect(
      (await clinic.request('/billing/suggestions')).data.some(
        (row: any) => row.id === encounter.id,
      ),
    ).toBe(false);
    await expect(
      clinic.request('/invoices', 'POST', checkout(encounter, 'second-checkout-key')),
    ).rejects.toThrow('already checked out');
  });
  it('routes signed visits without medicines directly to billing', async () => {
    const { clinic, ticket, consultation } = await ready(false);
    const encounter = await clinic.request('/encounters', 'POST', consultation);
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id).status,
    ).toBe('PAYMENT_WAITING');
    await admin(clinic);
    expect((await clinic.request('/billing/suggestions')).data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ encounterId: encounter.id, patientId: 4, prescriptions: [] }),
      ]),
    );
    await clinic.request('/invoices', 'POST', checkout(encounter));
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id).status,
    ).toBe('COMPLETED');
  });
  it('keeps stock readable to a clinical-only GP while protecting billing and dispensary', async () => {
    const { clinic, storage } = await ready();
    const [key, raw] = [...storage.entries.entries()][0],
      state = JSON.parse(raw);
    state.grants.DOCTOR = ['clinical'];
    storage.setItem(key, JSON.stringify(state));
    const limited = new DemoClinic(storage);
    expect((await limited.request('/references/medications')).data[0].stockQuantity).toBeTypeOf(
      'number',
    );
    await expect(limited.request('/inventory')).rejects.toThrow('no access');
    await expect(limited.request('/billing/suggestions')).rejects.toThrow('no access');
  });
  it('rejects mismatched checkout without changing billing readiness', async () => {
    const { clinic, consultation } = await ready(false);
    const encounter = await clinic.request('/encounters', 'POST', consultation);
    await admin(clinic);
    await expect(
      clinic.request('/invoices', 'POST', { ...checkout(encounter), patientId: 3 }),
    ).rejects.toThrow('this patient');
    expect(
      (await clinic.request('/billing/suggestions')).data.some(
        (row: any) => row.id === encounter.id,
      ),
    ).toBe(true);
    expect(
      (await clinic.request('/billing/suggestions', 'GET', undefined, 2)).data.some(
        (row: any) => row.id === encounter.id,
      ),
    ).toBe(false);
  });
  it('does not revive expired queue tickets while dispensing and checkout still complete', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T01:00:00Z'));
    const { clinic, ticket, consultation } = await ready();
    const encounter = await clinic.request('/encounters', 'POST', consultation);
    vi.setSystemTime(new Date('2026-10-14T14:00:00Z'));
    await admin(clinic);
    await clinic.request('/dispenses', 'POST', {
      encounterId: encounter.id,
      idempotencyKey: 'expired-handoff-test',
    });
    await clinic.request('/invoices', 'POST', checkout(encounter));
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id),
    ).toMatchObject({
      status: 'DISPENSARY_WAITING',
      expiredAt: '2026-10-14T14:00:00.000Z',
    });
    expect((await clinic.request('/queue/display')).data).toEqual([]);
    vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
    expect((await clinic.request('/queue')).data).toEqual([]);
    expect(
      (await clinic.request('/invoices')).data.some((row: any) => row.encounterId === encounter.id),
    ).toBe(true);
  });
});
