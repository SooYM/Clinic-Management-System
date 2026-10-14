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
afterEach(() => vi.useRealTimers());
describe('demo queue expiry and doctor handoff', () => {
  it('allows a clinical-only GP to use assigned suggestions without queue module access', async () => {
    const { clinic, storage } = await ready();
    const ticket = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
    await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
      status: 'CALLED_TO_ROOM',
      version: ticket.version,
      practitionerId: 2,
      roomId: 1,
    });
    const [storageKey, raw] = [...storage.entries.entries()][0];
    const state = JSON.parse(raw);
    state.grants.DOCTOR = ['clinical'];
    storage.setItem(storageKey, JSON.stringify(state));
    const limited = new DemoClinic(storage);
    await expect(limited.request('/queue')).rejects.toThrow('no access');
    expect((await limited.request('/clinical/queue-suggestions')).data[0]).toMatchObject({
      queueTicketId: ticket.id,
      encounterId: null,
    });
    const draft = await limited.request('/encounters', 'POST', {
      patientId: 1,
      queueTicketId: ticket.id,
      prescriptions: [],
      assessment: 'Fictional clinical-only review',
    });
    expect((await limited.request('/clinical/queue-suggestions')).data[0]).toMatchObject({
      encounterId: draft.id,
      status: 'IN_CONSULTATION',
    });
  });
  it('keeps previous-day active tickets until 12 hours and persists expiry when stale transitions fail', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T15:30:00Z'));
    const { clinic, storage } = await ready();
    const ticket = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
    vi.setSystemTime(new Date('2026-10-13T16:30:00Z'));
    expect((await clinic.request('/queue')).data.some((row: any) => row.id === ticket.id)).toBe(
      true,
    );
    await expect(
      clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' }),
    ).rejects.toThrow('already checked in');
    vi.setSystemTime(new Date('2026-10-14T03:30:00Z'));
    await expect(
      clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
        status: 'TRIAGE_WAITING',
        version: ticket.version,
      }),
    ).rejects.toThrow('expired after 12 hours');
    expect((await clinic.request('/queue')).data.some((row: any) => row.id === ticket.id)).toBe(
      false,
    );
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.queue.find((row: any) => row.id === ticket.id)).toMatchObject({
      status: 'REGISTERED',
      expiredAt: '2026-10-14T03:30:00.000Z',
      version: 2,
    });
    const replacement = await clinic.request('/queue', 'POST', {
      patientId: 1,
      priority: 'NORMAL',
    });
    expect(replacement.id).not.toBe(ticket.id);
    expect(replacement.expiredAt).toBeNull();
  });
  it('releases rooms occupied by expired tickets without removing their recorded history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
    const { clinic } = await ready();
    const ticket = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
    await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
      status: 'CALLED_TO_ROOM',
      version: ticket.version,
      practitionerId: 2,
      roomId: 1,
    });
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    const next = await clinic.request('/queue', 'POST', { patientId: 4, priority: 'NORMAL' });
    expect(
      await clinic.request(`/queue/${next.id}/transition`, 'POST', {
        status: 'CALLED_TO_ROOM',
        version: next.version,
        practitionerId: 2,
        roomId: 1,
      }),
    ).toMatchObject({ roomId: 1, status: 'CALLED_TO_ROOM' });
    expect(
      (await clinic.request('/clinical/queue-suggestions')).data.map(
        (row: any) => row.queueTicketId,
      ),
    ).toEqual([next.id]);
  });
  it('offers only assigned doctor work and atomically links one consultation per active ticket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
    const { clinic } = await ready();
    const ticket = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 1,
        queueTicketId: ticket.id,
        prescriptions: [],
      }),
    ).rejects.toThrow('assigned to another GP');
    const called = await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
      status: 'CALLED_TO_ROOM',
      version: ticket.version,
      practitionerId: 2,
      roomId: 1,
    });
    expect((await clinic.request('/clinical/queue-suggestions')).data[0]).toMatchObject({
      queueTicketId: ticket.id,
      patientId: 1,
      encounterId: null,
      status: 'CALLED_TO_ROOM',
      expiresAt: '2026-10-14T12:00:00.000Z',
    });
    expect((await clinic.request('/clinical/queue-suggestions', 'GET', undefined, 2)).data).toEqual(
      [],
    );
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 4,
        queueTicketId: ticket.id,
        prescriptions: [],
      }),
    ).rejects.toThrow('different patient');
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 1,
        queueTicketId: ticket.id,
        prescriptions: [rx(999)],
        assessment: 'Fictional',
        status: 'SIGNED',
      }),
    ).rejects.toThrow('Insufficient');
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id),
    ).toMatchObject({ status: 'CALLED_TO_ROOM', version: called.version });
    const draft = await clinic.request('/encounters', 'POST', {
      patientId: 1,
      queueTicketId: ticket.id,
      prescriptions: [],
      assessment: 'Fictional review',
    });
    expect((await clinic.request('/clinical/queue-suggestions')).data[0]).toMatchObject({
      encounterId: draft.id,
      status: 'IN_CONSULTATION',
    });
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 1,
        queueTicketId: ticket.id,
        prescriptions: [],
      }),
    ).rejects.toThrow('already exists');
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    expect((await clinic.request('/clinical/queue-suggestions')).data).toEqual([]);
    expect(
      await clinic.request(`/encounters/${draft.id}`, 'PUT', {
        patientId: 1,
        queueTicketId: ticket.id,
        prescriptions: [],
        assessment: 'Updated fictional review',
        version: draft.version,
      }),
    ).toMatchObject({ assessment: 'Updated fictional review' });
    await expect(
      clinic.request('/encounters', 'POST', {
        patientId: 1,
        queueTicketId: ticket.id,
        prescriptions: [],
      }),
    ).rejects.toThrow('expired after 12 hours');
    await clinic.request('/auth/logout', 'POST');
    await clinic.request('/auth/login', 'POST', {
      email: 'reception@example.test',
      password: 'demo',
    });
    await expect(clinic.request('/clinical/queue-suggestions')).rejects.toThrow();
  });
});
describe('demo reservation and supplies workflows', () => {
  it('checks in as registered and directly calls only a valid free scoped room and GP', async () => {
    const { clinic } = await ready();
    const q = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
    expect(q.status).toBe('REGISTERED');
    const call = { version: q.version, status: 'CALLED_TO_ROOM', roomId: 1, practitionerId: 2 };
    await expect(
      clinic.request(`/queue/${q.id}/transition`, 'POST', { ...call, roomId: undefined }),
    ).rejects.toThrow('Choose room');
    await expect(
      clinic.request(`/queue/${q.id}/transition`, 'POST', { ...call, practitionerId: undefined }),
    ).rejects.toThrow('Choose room');
    await expect(
      clinic.request(`/queue/${q.id}/transition`, 'POST', { ...call, practitionerId: 3 }),
    ).rejects.toThrow();
    await expect(clinic.request(`/queue/${q.id}/transition`, 'POST', call, 2)).rejects.toThrow();
    const called = await clinic.request(`/queue/${q.id}/transition`, 'POST', call);
    expect(called).toMatchObject({
      status: 'CALLED_TO_ROOM',
      roomId: 1,
      practitionerId: 2,
      version: 2,
    });
    await expect(clinic.request(`/queue/${q.id}/transition`, 'POST', call)).rejects.toThrow(
      'Ticket changed',
    );
    const second = await clinic.request('/queue', 'POST', { patientId: 4, priority: 'NORMAL' });
    await expect(
      clinic.request(`/queue/${second.id}/transition`, 'POST', {
        ...call,
        version: second.version,
      }),
    ).rejects.toThrow('occupied');
    expect(
      (await clinic.request('/queue')).data.find((entry: any) => entry.id === second.id),
    ).toMatchObject({ status: 'REGISTERED', version: 1 });
  });
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
