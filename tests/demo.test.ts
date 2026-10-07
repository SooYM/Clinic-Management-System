import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoServer } from '../scripts/demo-server';
import { describe, expect, it, vi } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
class MemoryStorage {
  readonly entries = new Map<string, string>();
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, String(value));
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
}
const request = async (
  clinic: DemoClinic,
  path: string,
  method = 'GET',
  body?: any,
  branchId = 1,
) => await clinic.request(path, method, body, branchId);
const login = async (clinic: DemoClinic, role = 'admin') =>
  request(clinic, '/auth/login', 'POST', {
    email: role + '@demo.clinic',
    password: '00000000000000',
  });
const patientPayload = (nationalId = 'DEMO-PASSPORT') => ({
  firstName: 'Demo',
  lastName: 'Patient',
  nationality: 'NON_MALAYSIAN',
  nationalId,
  dateOfBirth: '1990-01-01',
  sex: 'OTHER',
  addressLine1: 'Synthetic address',
  city: 'Kajang',
  postcode: '43000',
  state: 'Selangor',
  allergies: [],
  conditions: [],
  notificationConsent: false,
});
const itemPayload = (sku: string) => ({
  name: 'Synthetic drug ' + sku,
  sku,
  ingredient: sku,
  category: 'MEDICATION',
  unit: 'tablet',
  priceCents: 100,
  reorderLevel: 2,
});
const chartPayload = (patientId: number, prescriptions: any[]) => ({
  patientId,
  specialty: 'GP',
  subjective: 'Synthetic complaint',
  objective: 'Stable',
  assessment: 'Synthetic assessment',
  plan: 'Review',
  procedureNotes: '',
  vitals: { resp_rate: 18 },
  status: 'SIGNED',
  prescriptions,
});
const rx = (itemId: number, quantity: number) => ({
  itemId,
  quantity,
  dosage: 'One tablet',
  durationDays: 3,
  frequencyPerDay: 2,
  mealTiming: 'AFTER_MEAL',
});

describe('browser-session demo simulation', () => {
  it('uses exactly fourteen zeros for every default demo account and rejects the old password', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    for (const role of ['admin', 'gp', 'reception', 'nurse', 'therapist']) {
      const signedIn = await login(clinic, role);
      expect(signedIn.user.email).toBe(role + '@example.test');
      await request(clinic, '/auth/logout', 'POST');
      await expect(
        request(clinic, '/auth/login', 'POST', {
          email: role + '@example.test',
          password: 'demo',
        }),
      ).rejects.toMatchObject({ status: 401 });
    }
  });
  it('upgrades unchanged stored demo defaults while preserving records and changed passwords', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic);
    const patient = await request(
      clinic,
      '/patients',
      'POST',
      patientPayload('PASSWORD-UPGRADE-RECORD'),
    );
    const storedKey = [...storage.entries.keys()][0];
    const legacy = JSON.parse(storage.getItem(storedKey)!);
    for (const user of legacy.rows.users) user.password = 'demo';
    legacy.rows.users.find((user: any) => user.email === 'gp@example.test').password =
      'custom-password-unchanged';
    storage.setItem(storedKey, JSON.stringify(legacy));
    const upgraded = new DemoClinic(storage);
    await login(upgraded);
    expect(await request(upgraded, '/patients/' + patient.id)).toMatchObject({
      nationalId: 'PASSWORD-UPGRADE-RECORD',
    });
    await request(upgraded, '/auth/logout', 'POST');
    await expect(
      request(upgraded, '/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      request(upgraded, '/auth/login', 'POST', {
        email: 'gp@example.test',
        password: '00000000000000',
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(
      (
        await request(upgraded, '/auth/login', 'POST', {
          email: 'gp@example.test',
          password: 'custom-password-unchanged',
        })
      ).user.role,
    ).toBe('DOCTOR');
    const persisted = JSON.parse(storage.getItem(storedKey)!);
    expect(
      persisted.rows.users.find((user: any) => user.email === 'admin@example.test').password,
    ).toBe('00000000000000');
    expect(
      persisted.rows.users.find((user: any) => user.email === 'gp@example.test').password,
    ).toBe('custom-password-unchanged');
  });
  it('keeps independent browser session stores isolated', async () => {
    const first = new DemoClinic(new MemoryStorage()),
      second = new DemoClinic(new MemoryStorage());
    await login(first);
    await login(second);
    const p = await request(first, '/patients', 'POST', patientPayload('SESSION-A'));
    expect(
      (await request(first, '/patients')).data.some(
        (row: any) => row.id === p.id && row.nationalId === 'SESSION-A',
      ),
    ).toBe(true);
    expect(
      (await request(second, '/patients')).data.some((row: any) => row.nationalId === 'SESSION-A'),
    ).toBe(false);
  });
  it('persists changes only in its injected session storage and reset clears them', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic);
    await request(clinic, '/patients', 'POST', patientPayload('RESET-ME'));
    const reopened = new DemoClinic(storage);
    expect(
      (await request(reopened, '/patients')).data.some((row: any) => row.nationalId === 'RESET-ME'),
    ).toBe(true);
    reopened.reset();
    await expect(request(reopened, '/patients')).rejects.toBeDefined();
    await login(reopened);
    expect(
      (await request(reopened, '/patients')).data.some((row: any) => row.nationalId === 'RESET-ME'),
    ).toBe(false);
  });
  it('recovers malformed stored JSON without retaining prior authentication', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic);
    expect(storage.entries.size).toBeGreaterThan(0);
    for (const key of storage.entries.keys()) storage.setItem(key, '{invalid JSON');
    const restored = new DemoClinic(storage);
    await expect(request(restored, '/patients')).rejects.toBeDefined();
    await login(restored);
    expect((await request(restored, '/bootstrap')).user.role).toBe('ADMIN');
  });
  it('rejects wrong login and prevents unauthenticated simulated access', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await expect(request(clinic, '/patients')).rejects.toBeDefined();
    await expect(
      request(clinic, '/auth/login', 'POST', { email: 'admin@demo.clinic', password: 'wrong' }),
    ).rejects.toBeDefined();
    await expect(request(clinic, '/patients')).rejects.toBeDefined();
    await login(clinic);
    await request(clinic, '/auth/logout', 'POST');
    await expect(request(clinic, '/patients')).rejects.toBeDefined();
  });
  it('allocates increasing numeric patient IDs and roundtrips demographics with version conflicts', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const first = await request(clinic, '/patients', 'POST', patientPayload('ID-FIRST')),
      second = await request(clinic, '/patients', 'POST', patientPayload('ID-SECOND'));
    expect(Number.isSafeInteger(first.id)).toBe(true);
    expect(first.id).toBeGreaterThan(0);
    expect(second.id).toBeGreaterThan(first.id);
    expect(await request(clinic, '/patients/' + first.id)).toMatchObject({
      nationalId: 'ID-FIRST',
      city: 'Kajang',
      sex: 'OTHER',
    });
    const updated = await request(clinic, '/patients/' + first.id, 'PUT', {
      ...patientPayload('ID-FIRST'),
      city: 'Manual City',
      version: first.version,
    });
    expect(updated.city).toBe('Manual City');
    expect(updated.id).toBe(first.id);
    await expect(
      request(clinic, '/patients/' + first.id, 'PUT', {
        ...patientPayload('ID-FIRST'),
        version: first.version,
      }),
    ).rejects.toBeDefined();
  });
  it('simulates booking overlap cancellation and branch-scoped patient reads', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const p = await request(clinic, '/patients', 'POST', patientPayload('BOOKING'));
    const boot = await request(clinic, '/bootstrap');
    const payload = {
      patientId: p.id,
      practitionerId: boot.practitioners[0].id,
      startsAt: '2035-01-01T01:00:00Z',
      endsAt: '2035-01-01T01:30:00Z',
      reason: 'Synthetic visit',
    };
    const booked = await request(clinic, '/appointments', 'POST', payload);
    expect(Number.isSafeInteger(booked.id)).toBe(true);
    await expect(request(clinic, '/appointments', 'POST', payload)).rejects.toBeDefined();
    await expect(request(clinic, '/patients/' + p.id, 'GET', undefined, 2)).rejects.toBeDefined();
    await request(clinic, '/appointments/' + booked.id + '/cancel', 'POST', {
      version: booked.version,
    });
    expect((await request(clinic, '/appointments', 'POST', payload)).id).not.toBe(booked.id);
  });
  it('applies module grants on subsequent simulated requests while preserving admin access', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    await request(clinic, '/admin/role-modules', 'PUT', {
      role: 'RECEPTIONIST',
      modules: ['appointments'],
    });
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic, 'reception');
    expect((await request(clinic, '/bootstrap')).modules).toEqual(['appointments']);
    await expect(request(clinic, '/patients')).rejects.toBeDefined();
    expect((await request(clinic, '/references/patients')).data).toBeDefined();
    await expect(request(clinic, '/admin/users')).rejects.toBeDefined();
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic);
    expect((await request(clinic, '/bootstrap')).modules.length).toBe(7);
  });
  it('preserves structured Rx and rolls back all simulated stock on failed dispensing', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const p = await request(clinic, '/patients', 'POST', patientPayload('RX'));
    const a = await request(clinic, '/inventory', 'POST', itemPayload('RX-A')),
      b = await request(clinic, '/inventory', 'POST', itemPayload('RX-B'));
    await request(clinic, '/inventory/batches', 'POST', {
      itemId: a.id,
      batchNumber: 'BATCH-A',
      expiresOn: '2035-12-31',
      quantity: 5,
    });
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic, 'gp');
    const prescriptions = [rx(a.id, 3), rx(b.id, 3)],
      chart = await request(clinic, '/encounters', 'POST', chartPayload(p.id, prescriptions));
    expect(chart.prescriptions).toEqual(prescriptions);
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic);
    await expect(
      request(clinic, '/dispenses', 'POST', {
        encounterId: chart.id,
        idempotencyKey: 'demo-failed-dispense',
      }),
    ).rejects.toBeDefined();
    expect(
      (await request(clinic, '/inventory')).data.find((i: any) => i.id === a.id).stockQuantity,
    ).toBe(5);
    expect(
      (await request(clinic, '/dispensary/encounters')).data.some((e: any) => e.id === chart.id),
    ).toBe(true);
    await request(clinic, '/inventory/batches', 'POST', {
      itemId: b.id,
      batchNumber: 'BATCH-B',
      expiresOn: '2035-12-31',
      quantity: 3,
    });
    await request(clinic, '/dispenses', 'POST', {
      encounterId: chart.id,
      idempotencyKey: 'demo-good-dispense',
    });
    await request(clinic, '/dispenses', 'POST', {
      encounterId: chart.id,
      idempotencyKey: 'demo-good-dispense',
    });
    expect(
      (await request(clinic, '/inventory')).data.find((i: any) => i.id === a.id).stockQuantity,
    ).toBe(2);
    expect(
      (await request(clinic, '/dispensary/encounters')).data.some((e: any) => e.id === chart.id),
    ).toBe(false);
  });
  it('keeps simulated signed records immutable and rejects non-doctor signing', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const p = await request(clinic, '/patients', 'POST', patientPayload('SIGNED'));
    await expect(
      request(clinic, '/encounters', 'POST', chartPayload(p.id, [])),
    ).rejects.toBeDefined();
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic, 'gp');
    const chart = await request(clinic, '/encounters', 'POST', chartPayload(p.id, []));
    await expect(
      request(clinic, '/encounters/' + chart.id, 'PUT', {
        ...chartPayload(p.id, []),
        version: chart.version,
        assessment: 'Changed',
      }),
    ).rejects.toBeDefined();
  });
  it('rejects mismatched simulated payments without committing an invoice', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const p = await request(clinic, '/patients', 'POST', patientPayload('INVOICE')),
      boot = await request(clinic, '/bootstrap'),
      before = (await request(clinic, '/invoices')).data.length;
    const payload = {
      patientId: p.id,
      practitionerId: boot.practitioners[0].id,
      lines: [
        {
          description: 'Demo consultation',
          quantity: 1,
          unitPriceCents: 1000,
          category: 'SERVICE',
        },
      ],
      payments: [{ method: 'CASH', amountCents: 999, reference: '' }],
      idempotencyKey: 'demo-payment-mismatch',
    };
    await expect(request(clinic, '/invoices', 'POST', payload)).rejects.toBeDefined();
    expect((await request(clinic, '/invoices')).data).toHaveLength(before);
    const valid = {
      ...payload,
      payments: [{ method: 'CASH', amountCents: 1000, reference: '' }],
      idempotencyKey: 'demo-payment-valid',
    };
    const first = await request(clinic, '/invoices', 'POST', valid),
      retry = await request(clinic, '/invoices', 'POST', valid);
    expect(retry.id).toBe(first.id);
    expect((await request(clinic, '/invoices')).data).toHaveLength(before + 1);
  });
  it('keeps retired real integrations unavailable in the public browser simulation', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    for (const path of [
      '/packages',
      '/commissions',
      '/documents/1/pdf',
      '/invoices/1/receipt',
      '/photos/1/image',
    ])
      await expect(request(clinic, path)).rejects.toBeDefined();
  });
  it('recovers valid JSON with incomplete demo state instead of trapping sign-in', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic);
    for (const key of storage.entries.keys())
      storage.setItem(
        key,
        JSON.stringify({ version: 1, rows: { users: [] }, counters: {}, grants: {} }),
      );
    const restored = new DemoClinic(storage);
    await login(restored);
    expect((await request(restored, '/bootstrap')).user.role).toBe('ADMIN');
    expect((await request(restored, '/patients')).data.length).toBeGreaterThan(0);
  });
  it('maps postcode state labels and canonical IC intake in simulated registration', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const postcode = (await request(clinic, '/references/postcodes/50000')).data;
    expect(postcode).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city: 'Kuala Lumpur',
          state: 'Wilayah Persekutuan Kuala Lumpur',
        }),
      ]),
    );
    const p = await request(clinic, '/patients', 'POST', {
      firstName: 'Synthetic',
      lastName: 'IC',
      nationality: 'MALAYSIAN',
      nationalId: '991231145568',
      postcode: '43000',
    });
    expect(p).toMatchObject({
      nationalId: '991231-14-5568',
      dateOfBirth: '1999-12-31',
      sex: 'FEMALE',
      city: 'Kajang',
      state: 'Selangor',
    });
    await expect(
      request(clinic, '/patients', 'POST', {
        firstName: 'Invalid',
        nationality: 'MALAYSIAN',
        nationalId: '990231145568',
      }),
    ).rejects.toBeDefined();
  });
  it('starts with fictional walkthrough fixtures and reset restores them', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const paths = [
      '/patients',
      '/appointments',
      '/queue',
      '/encounters',
      '/inventory',
      '/invoices',
    ];
    const counts = new Map<string, number>();
    for (const path of paths) {
      const data = (await request(clinic, path)).data;
      expect(data.length, path).toBeGreaterThan(0);
      counts.set(path, data.length);
    }
    await request(clinic, '/patients', 'POST', patientPayload('RESTORE-FIXTURES'));
    clinic.reset();
    await login(clinic);
    for (const path of paths)
      expect((await request(clinic, path)).data.length, path).toBe(counts.get(path));
    expect(
      (await request(clinic, '/patients')).data.some(
        (p: any) => p.nationalId === 'RESTORE-FIXTURES',
      ),
    ).toBe(false);
  });
  it('keeps normal API mode on real fetch rather than browser demo storage', async () => {
    const { api, isDemo } = await import('../src/client/api');
    expect(isDemo).toBe(false);
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    try {
      expect(await api.get('/patients')).toEqual([]);
      expect(fetcher).toHaveBeenCalledWith(
        '/api/patients',
        expect.objectContaining({ credentials: 'same-origin' }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('serves static demo health while refusing every real clinical API and PDF request', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'clinic-demo-test-'));
    await writeFile(
      join(directory, 'index.html'),
      '<!doctype html><title>Synthetic demo fixture</title>',
    );
    const server = createDemoServer(directory).listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const origin = 'http://127.0.0.1:' + (server.address() as any).port;
    try {
      const health = await fetch(origin + '/healthz');
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({
        status: 'ok',
        mode: 'browser-session-demo',
        database: false,
      });
      expect(health.headers.get('x-powered-by')).toBeNull();
      expect(health.headers.get('content-security-policy')).toContain("object-src 'none'");
      for (const path of ['/api/patients', '/api/documents/1/pdf', '/api/auth/login']) {
        const response = await fetch(origin + path);
        expect(response.status).toBe(503);
        expect((await response.json()).error.code).toBe('DEMO_BACKEND_UNAVAILABLE');
      }
      const disabled = await fetch(origin + '/demo-unavailable');
      expect(disabled.status).toBe(200);
      expect(await disabled.text()).toContain('cannot issue real medical certificates');
      expect(await (await fetch(origin + '/')).text()).toContain('Synthetic demo fixture');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      await unlink(join(directory, 'index.html'));
      await rmdir(directory);
    }
  });
});
