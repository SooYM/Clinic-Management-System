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
async function calledPatient(clinic: DemoClinic, patientId = 4) {
  const ticket = await clinic.request('/queue', 'POST', { patientId, priority: 'NORMAL' });
  return clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
    status: 'CALLED_TO_ROOM',
    version: ticket.version,
    practitionerId: 2,
    roomId: 1,
  });
}
describe('demo draft consultation removal', () => {
  it('retains removed drafts and audit history without changing queue or stock, and permits a fresh linked chart', async () => {
    const { clinic, storage } = await ready();
    const ticket = await calledPatient(clinic);
    const draft = await clinic.request('/encounters', 'POST', {
      patientId: 4,
      queueTicketId: ticket.id,
      assessment: 'Fictional discarded draft',
      prescriptions: [rx(2)],
    });
    const queueBefore = (await clinic.request('/queue')).data.find(
      (row: any) => row.id === ticket.id,
    );
    const stockBefore = await clinic.request('/inventory');
    const auditBefore = JSON.parse([...storage.entries.values()][0]).rows.audit.length;
    const result = await clinic.request(`/encounters/${draft.id}`, 'DELETE', {
      version: draft.version,
    });
    expect(result).toMatchObject({ id: draft.id, version: draft.version + 1 });
    expect(result.deletedAt).toBeTruthy();
    expect((await clinic.request('/encounters')).data.some((row: any) => row.id === draft.id)).toBe(
      false,
    );
    expect(
      (await clinic.request('/patients/4/encounters')).data.some((row: any) => row.id === draft.id),
    ).toBe(false);
    expect(
      (await clinic.request('/dispensary/history')).data.some((row: any) => row.id === draft.id),
    ).toBe(false);
    expect((await clinic.request('/clinical/queue-suggestions')).data[0].encounterId).toBeNull();
    expect((await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id)).toEqual(
      queueBefore,
    );
    expect(await clinic.request('/inventory')).toEqual(stockBefore);
    for (const path of [
      `/encounters/${draft.id}`,
      `/encounters/${draft.id}/prescription-log`,
      `/encounters/${draft.id}/medication-doses`,
    ])
      await expect(clinic.request(path)).rejects.toMatchObject({ status: 404 });
    await expect(
      clinic.request(`/encounters/${draft.id}`, 'PUT', {
        patientId: 4,
        queueTicketId: ticket.id,
        status: 'SIGNED',
        assessment: 'Fictional removed draft must remain unavailable',
        prescriptions: [],
        version: result.version,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      clinic.request(`/encounters/${draft.id}`, 'DELETE', { version: result.version }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      clinic.request('/dispenses', 'POST', {
        encounterId: draft.id,
        idempotencyKey: 'removed-demo-draft',
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      clinic.request('/documents', 'POST', {
        encounterId: draft.id,
        kind: 'MC',
        startDate: '2026-10-14',
        days: 1,
      }),
    ).rejects.toMatchObject({ status: 404 });
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.encounters.find((row: any) => row.id === draft.id)).toMatchObject({
      deletedAt: result.deletedAt,
      status: 'DRAFT',
      prescriptions: draft.prescriptions,
    });
    expect(state.rows.audit.slice(auditBefore)).toHaveLength(1);
    expect(state.rows.audit.at(-1)).toMatchObject({ action: 'REMOVE', entityId: draft.id });
    const replacement = await clinic.request('/encounters', 'POST', {
      patientId: 4,
      queueTicketId: ticket.id,
      assessment: 'Fictional replacement draft',
      prescriptions: [],
    });
    expect(replacement.id).not.toBe(draft.id);
    expect((await clinic.request('/clinical/queue-suggestions')).data[0].encounterId).toBe(
      replacement.id,
    );
  });
  it('requires the attending doctor, current version, clinical permission and scoped branch', async () => {
    const { clinic, storage } = await ready();
    const draft = await clinic.request('/encounters', 'POST', { patientId: 4, prescriptions: [] });
    const before = [...storage.entries.values()][0];
    await expect(
      clinic.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version + 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      clinic.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version }, 2),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      clinic.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version, extra: true }),
    ).rejects.toThrow();
    expect([...storage.entries.values()][0]).toBe(before);
    const [storageKey, raw] = [...storage.entries.entries()][0];
    const state = JSON.parse(raw);
    state.rows.encounters.find((row: any) => row.id === draft.id).practitionerId = 5;
    storage.setItem(storageKey, JSON.stringify(state));
    const changedOwner = new DemoClinic(storage);
    await expect(
      changedOwner.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version }),
    ).rejects.toMatchObject({ status: 403 });
    await changedOwner.request('/auth/logout', 'POST');
    await changedOwner.request('/auth/login', 'POST', {
      email: 'admin@example.test',
      password: 'demo',
    });
    await expect(
      changedOwner.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version }),
    ).rejects.toMatchObject({ status: 403 });
    await changedOwner.request('/auth/logout', 'POST');
    await changedOwner.request('/auth/login', 'POST', {
      email: 'reception@example.test',
      password: 'demo',
    });
    await expect(
      changedOwner.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('never removes signed consultations or drafts with unexpected recorded stock history', async () => {
    const { clinic, storage } = await ready();
    const before = [...storage.entries.values()][0];
    await expect(clinic.request('/encounters/1', 'DELETE', { version: 1 })).rejects.toMatchObject({
      status: 409,
    });
    expect([...storage.entries.values()][0]).toBe(before);
    const draft = await clinic.request('/encounters', 'POST', { patientId: 4, prescriptions: [] });
    const [storageKey, raw] = [...storage.entries.entries()][0];
    const state = JSON.parse(raw);
    state.rows.reservations[0].encounterId = draft.id;
    storage.setItem(storageKey, JSON.stringify(state));
    const withHistory = new DemoClinic(storage);
    await expect(
      withHistory.request(`/encounters/${draft.id}`, 'DELETE', { version: draft.version }),
    ).rejects.toThrow('recorded clinical or stock history');
    expect([...storage.entries.values()][0]).toBe(JSON.stringify(state));
  });
});
describe('demo signed consultation queue handoff', () => {
  it('moves a linked signed consultation with no medicines directly to payment waiting', async () => {
    const { clinic } = await ready();
    const ticket = await calledPatient(clinic);
    await clinic.request('/encounters', 'POST', {
      patientId: 4,
      queueTicketId: ticket.id,
      prescriptions: [],
      assessment: 'Fictional consultation without medicines',
      status: 'SIGNED',
    });
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id).status,
    ).toBe('PAYMENT_WAITING');
  });
  it.each(['create', 'draft'])(
    'moves a %s signed multi-medicine consultation to dispensing after all holds succeed',
    async (mode) => {
      const { clinic, storage } = await ready();
      const ticket = await calledPatient(clinic);
      const prescriptions = [rx(2), { ...rx(3), itemId: 2 }];
      const body = {
        patientId: 4,
        queueTicketId: ticket.id,
        prescriptions,
        assessment: 'Fictional multi-medicine review',
      };
      const draft =
        mode === 'draft' ? await clinic.request('/encounters', 'POST', body) : undefined;
      const signed = await clinic.request(
        draft ? `/encounters/${draft.id}` : '/encounters',
        draft ? 'PUT' : 'POST',
        {
          ...body,
          queueTicketId: draft ? undefined : ticket.id,
          status: 'SIGNED',
          version: draft?.version,
        },
      );
      const state = JSON.parse([...storage.entries.values()][0]);
      expect(state.rows.queue.find((row: any) => row.id === ticket.id)).toMatchObject({
        status: 'DISPENSARY_WAITING',
        expiredAt: null,
      });
      expect(
        state.rows.reservations
          .filter((row: any) => row.encounterId === signed.id)
          .map((row: any) => [row.itemId, row.quantity]),
      ).toEqual([
        [1, 2],
        [2, 3],
      ]);
      expect(
        (await clinic.request('/dispensary/encounters')).data.find(
          (row: any) => row.id === signed.id,
        ).prescriptions,
      ).toHaveLength(2);
      expect((await clinic.request('/clinical/queue-suggestions')).data).toEqual([]);
    },
  );
  it.each(['create', 'draft'])(
    'rolls back the %s chart, first medicine hold and queue when second medicine stock is insufficient',
    async (mode) => {
      const { clinic, storage } = await ready();
      const ticket = await calledPatient(clinic);
      const body = {
        patientId: 4,
        queueTicketId: ticket.id,
        prescriptions: [rx(2), { ...rx(999), itemId: 2 }],
        assessment: 'Fictional rollback review',
      };
      const draft =
        mode === 'draft' ? await clinic.request('/encounters', 'POST', body) : undefined;
      const before = [...storage.entries.values()][0];
      await expect(
        clinic.request(draft ? `/encounters/${draft.id}` : '/encounters', draft ? 'PUT' : 'POST', {
          ...body,
          status: 'SIGNED',
          version: draft?.version,
        }),
      ).rejects.toThrow('Insufficient');
      expect([...storage.entries.values()][0]).toBe(before);
      expect(
        (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id).status,
      ).toBe(draft ? 'IN_CONSULTATION' : 'CALLED_TO_ROOM');
      if (draft)
        expect(await clinic.request(`/encounters/${draft.id}`)).toMatchObject({
          status: 'DRAFT',
          version: draft.version,
        });
    },
  );
  it.each(['expired', 'DISPENSARY_WAITING', 'PAYMENT_WAITING', 'COMPLETED'])(
    'signs an existing chart without reviving or regressing its %s queue ticket',
    async (state) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
      const { clinic, storage } = await ready();
      const ticket = await calledPatient(clinic);
      const draft = await clinic.request('/encounters', 'POST', {
        patientId: 4,
        queueTicketId: ticket.id,
        prescriptions: [],
        assessment: 'Fictional historic review',
      });
      if (state === 'expired') vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
      else {
        const active = (await clinic.request('/queue')).data.find(
          (row: any) => row.id === ticket.id,
        );
        const payment = await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
          status: state === 'DISPENSARY_WAITING' ? 'DISPENSARY_WAITING' : 'PAYMENT_WAITING',
          version: active.version,
        });
        if (state === 'COMPLETED')
          await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
            status: 'COMPLETED',
            version: payment.version,
          });
      }
      await clinic.request(`/encounters/${draft.id}`, 'PUT', {
        patientId: 4,
        prescriptions: [],
        assessment: 'Fictional historic review',
        status: 'SIGNED',
        version: draft.version,
      });
      const saved = JSON.parse([...storage.entries.values()][0]).rows.queue.find(
        (row: any) => row.id === ticket.id,
      );
      expect(saved.status).toBe(state === 'expired' ? 'IN_CONSULTATION' : state);
      expect(Boolean(saved.expiredAt)).toBe(state === 'expired');
    },
  );
  it('does not associate a manual signed chart with another active patient ticket', async () => {
    const { clinic } = await ready();
    const ticket = await calledPatient(clinic);
    await clinic.request('/encounters', 'POST', {
      patientId: 4,
      prescriptions: [],
      assessment: 'Fictional manual chart',
      status: 'SIGNED',
    });
    expect(
      (await clinic.request('/queue')).data.find((row: any) => row.id === ticket.id),
    ).toMatchObject({ status: 'CALLED_TO_ROOM', version: ticket.version });
  });
});
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
  it('expires unfinished visits at Malaysia midnight and starts a fresh daily queue without deleting history', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-13T15:30:00Z'));
    const { clinic, storage } = await ready();
    const ticket = await calledPatient(clinic, 1);
    expect((await clinic.request('/clinical/queue-suggestions')).data[0].expiresAt).toBe(
      '2026-10-13T16:00:00.000Z',
    );
    expect((await clinic.request('/queue')).data).toHaveLength(2);
    vi.setSystemTime(new Date('2026-10-13T16:00:00Z'));
    expect((await clinic.request('/queue')).data).toEqual([]);
    expect((await clinic.request('/queue/display')).data).toEqual([]);
    expect((await clinic.request('/clinical/queue-suggestions')).data).toEqual([]);
    await expect(
      clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
        status: 'IN_CONSULTATION',
        version: ticket.version,
      }),
    ).rejects.toThrow('clinic midnight');
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.queue.find((row: any) => row.id === ticket.id)).toMatchObject({
      status: 'CALLED_TO_ROOM',
      expiredAt: '2026-10-13T16:00:00.000Z',
      version: 3,
    });
    const replacement = await calledPatient(clinic, 1);
    expect(replacement.id).toBeGreaterThan(ticket.id);
    expect(replacement.ticketNumber).toBe('Q-001');
    expect(replacement.expiredAt).toBeNull();
    expect((await clinic.request('/queue')).data).toHaveLength(1);
  });
  it('retains every today visit in the daily list while operational displays exclude expired and final visits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T00:00:00Z'));
    const { clinic, storage } = await ready();
    const ticket = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
    await clinic.request(`/queue/${ticket.id}/transition`, 'POST', {
      status: 'SKIPPED',
      version: ticket.version,
    });
    for (let visit = 0; visit < 8; visit++) {
      const repeat = await clinic.request('/queue', 'POST', { patientId: 1, priority: 'NORMAL' });
      await clinic.request(`/queue/${repeat.id}/transition`, 'POST', {
        status: 'SKIPPED',
        version: repeat.version,
      });
    }
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    const rows = (await clinic.request('/queue')).data;
    expect(rows).toHaveLength(10);
    expect(rows.find((row: any) => row.id === ticket.id).status).toBe('SKIPPED');
    expect(rows.find((row: any) => row.status === 'REGISTERED').expiredAt).toBeTruthy();
    expect((await clinic.request('/queue/display')).data).toEqual([]);
    expect((await clinic.request('/queue/estimate')).waiting).toBe(0);
    expect((await clinic.request('/queue/estimate')).visitsToday).toBe(10);
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(state.rows.queue).toHaveLength(10);
    expect(state.rows.audit.some((row: any) => row.action === 'EXPIRE')).toBe(true);
    vi.setSystemTime(new Date('2026-10-14T16:00:00Z'));
    expect((await clinic.request('/queue')).data).toEqual([]);
    expect((await clinic.request('/queue/estimate')).visitsToday).toBe(0);
    expect(JSON.parse([...storage.entries.values()][0]).rows.queue).toHaveLength(10);
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
