import { afterEach, describe, expect, it, vi } from 'vitest';
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T02:00:00Z'));
  const storage = new Storage(),
    clinic = new DemoClinic(storage);
  await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
  return { clinic, storage };
}
const booking = (
  patientId = 1,
  startsAt = '2026-10-14T01:00:00Z',
  endsAt = '2026-10-14T01:30:00Z',
) => ({ patientId, practitionerId: 2, startsAt, endsAt, reason: 'Fictional appointment arrival' });
afterEach(() => vi.useRealTimers());
describe('demo due appointment arrivals', () => {
  it('detects doctor overlaps across different equivalent timezone offsets', async () => {
    const { clinic } = await ready();
    await clinic.request(
      '/appointments',
      'POST',
      booking(1, '2026-10-14T09:00:00+08:00', '2026-10-14T09:30:00+08:00'),
    );
    await expect(
      clinic.request(
        '/appointments',
        'POST',
        booking(4, '2026-10-14T01:15:00Z', '2026-10-14T01:45:00Z'),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('books without a room, suggests when due and checks in once with the booked GP', async () => {
    const { clinic } = await ready();
    const due = await clinic.request('/appointments', 'POST', booking());
    const future = await clinic.request(
      '/appointments',
      'POST',
      booking(4, '2026-10-14T03:00:00Z', '2026-10-14T03:30:00Z'),
    );
    expect(due.roomId).toBeNull();
    expect(
      (await clinic.request('/queue/appointment-arrivals')).data.map((a: any) => a.id),
    ).toEqual([due.id]);
    const queueInput = {
      patientId: 1,
      priority: 'NORMAL',
      appointmentId: due.id,
      appointmentVersion: due.version,
    };
    const ticket = await clinic.request('/queue', 'POST', queueInput);
    expect(ticket).toMatchObject({
      status: 'REGISTERED',
      appointmentId: due.id,
      practitionerId: 2,
      roomId: null,
    });
    await expect(
      clinic.request(
        '/appointments',
        'POST',
        booking(4, '2026-10-14T01:15:00Z', '2026-10-14T01:45:00Z'),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await clinic.request('/appointments')).data.find((a: any) => a.id === due.id),
    ).toMatchObject({ status: 'CHECKED_IN', version: due.version + 1 });
    await expect(clinic.request('/queue', 'POST', queueInput)).rejects.toMatchObject({
      status: 409,
    });
    expect((await clinic.request('/queue/appointment-arrivals')).data).toEqual([]);
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    expect(
      (await clinic.request('/queue/appointment-arrivals')).data.map((a: any) => a.id),
    ).toEqual([future.id]);
  });
  it('rejects stale, premature and mismatched arrivals without adding a queue ticket', async () => {
    const { clinic, storage } = await ready();
    const future = await clinic.request(
      '/appointments',
      'POST',
      booking(1, '2026-10-14T03:00:00Z', '2026-10-14T03:30:00Z'),
    );
    const before = JSON.parse([...storage.entries.values()][0]).rows.queue.length;
    const input = {
      patientId: 1,
      priority: 'NORMAL',
      appointmentId: future.id,
      appointmentVersion: future.version,
    };
    await expect(clinic.request('/queue', 'POST', input)).rejects.toMatchObject({ status: 409 });
    vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
    await expect(
      clinic.request('/queue', 'POST', { ...input, appointmentVersion: 99 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      clinic.request('/queue', 'POST', { ...input, patientId: 4 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(JSON.parse([...storage.entries.values()][0]).rows.queue).toHaveLength(before);
    expect(
      (await clinic.request('/appointments')).data.find((a: any) => a.id === future.id).status,
    ).toBe('BOOKED');
  });
  it('uses Malaysia dates and real instants for offset times; allows queue-only staff suggestions', async () => {
    const { clinic, storage } = await ready();
    const due = await clinic.request(
      '/appointments',
      'POST',
      booking(1, '2026-10-14T09:00:00+08:00', '2026-10-14T09:30:00+08:00'),
    );
    await clinic.request('/auth/login', 'POST', {
      email: 'reception@example.test',
      password: 'demo',
    });
    const [key, raw] = [...storage.entries.entries()][0],
      state = JSON.parse(raw);
    state.grants.RECEPTIONIST = ['queue'];
    storage.setItem(key, JSON.stringify(state));
    const limited = new DemoClinic(storage);
    await expect(limited.request('/appointments')).rejects.toMatchObject({ status: 403 });
    expect((await limited.request('/queue/appointment-arrivals')).data[0]).toMatchObject({
      id: due.id,
      patientId: 1,
    });
    expect(
      (await limited.request('/queue/appointment-arrivals', 'GET', undefined, 2)).data,
    ).toEqual([]);
    await limited.request('/queue', 'POST', {
      patientId: 1,
      priority: 'NORMAL',
      appointmentId: due.id,
      appointmentVersion: due.version,
    });
    vi.setSystemTime(new Date('2026-10-15T02:00:00Z'));
    expect(
      (await limited.request('/queue/appointment-arrivals')).data.some(
        (row: any) => row.id === due.id,
      ),
    ).toBe(false);
  });
});
describe('demo deposit retirement', () => {
  it('retires deposit endpoints and rejects new deposit tender', async () => {
    const { clinic, storage } = await ready();
    const before = [...storage.entries.values()][0];
    await expect(
      clinic.request('/deposits', 'POST', {
        patientId: 1,
        amountCents: 100,
        reference: 'Fictional',
      }),
    ).rejects.toMatchObject({ status: 410 });
    await expect(clinic.request('/patients/1/deposit-balance')).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      clinic.request('/invoices', 'POST', {
        patientId: 1,
        practitionerId: 2,
        lines: [
          { description: 'Fictional', quantity: 1, unitPriceCents: 100, category: 'SERVICE' },
        ],
        payments: [{ method: 'DEPOSIT', amountCents: 100 }],
        idempotencyKey: 'retired-deposit-test',
      }),
    ).rejects.toThrow();
    expect([...storage.entries.values()][0]).toBe(before);
  });
  it('keeps historical deposit balances and old receipt tender readable', async () => {
    const { storage } = await ready();
    const [key, raw] = [...storage.entries.entries()][0],
      state = JSON.parse(raw);
    state.rows.deposits.push({
      id: 1,
      tenantId: 1,
      branchId: 1,
      patientId: 2,
      amountCents: 100,
      reference: 'Historical fictional deposit',
    });
    state.counters.deposits = 1;
    state.rows.invoices[0].payments[0].method = 'DEPOSIT';
    storage.setItem(key, JSON.stringify(state));
    const clinic = new DemoClinic(storage);
    const receipt = await clinic.request('/invoices/1/receipt-view');
    expect(receipt.payments[0].method).toBe('DEPOSIT');
    expect(JSON.parse([...storage.entries.values()][0]).rows.deposits).toHaveLength(1);
  });
});
