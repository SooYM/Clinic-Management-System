import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDemoServer } from '../scripts/demo-server';
import { describe, expect, it, vi } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
import { parseMalaysianIc } from '../src/shared/patient-identity';
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
    password: 'demo',
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
  it('uses demo for every default demo account and rejects the former fourteen-zero password', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    for (const role of ['admin', 'gp', 'reception', 'nurse', 'therapist']) {
      const signedIn = await login(clinic, role);
      expect(signedIn.user.email).toBe(role + '@example.test');
      await request(clinic, '/auth/logout', 'POST');
      await expect(
        request(clinic, '/auth/login', 'POST', {
          email: role + '@example.test',
          password: '00000000000000',
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
    for (const user of legacy.rows.users) user.password = '00000000000000';
    legacy.rows.users[0].email = 'admin@demo.clinic';
    legacy.rows.patients[0].name = 'Prior session record';
    legacy.rows.users.find((user: any) => user.email === 'gp@example.test').password =
      'custom-password-unchanged';
    storage.setItem(storedKey, JSON.stringify(legacy));
    const upgraded = new DemoClinic(storage);
    await login(upgraded);
    expect(await request(upgraded, '/patients/' + patient.id)).toMatchObject({
      nationalId: 'PASSWORD-UPGRADE-RECORD',
    });
    expect(await request(upgraded, '/patients/1')).toMatchObject({ name: 'Prior session record' });
    await request(upgraded, '/auth/logout', 'POST');
    await expect(
      request(upgraded, '/auth/login', 'POST', {
        email: 'admin@example.test',
        password: '00000000000000',
      }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      request(upgraded, '/auth/login', 'POST', {
        email: 'gp@example.test',
        password: 'demo',
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
    expect(persisted.rows.users.find((user: any) => user.id === 1).password).toBe('demo');
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
    const storage = new MemoryStorage();
    let clinic = new DemoClinic(storage);
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
    const expiringBatch = await request(clinic, '/inventory/batches', 'POST', {
      itemId: b.id,
      batchNumber: 'BATCH-B-EXPIRES',
      expiresOn: '2035-12-31',
      quantity: 3,
    });
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic, 'gp');
    const prescriptions = [rx(a.id, 3), rx(b.id, 3)],
      chart = await request(clinic, '/encounters', 'POST', chartPayload(p.id, prescriptions));
    expect(chart.prescriptions).toEqual(
      prescriptions.map((prescription) => expect.objectContaining(prescription)),
    );
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic);
    // Simulate elapsed time after signing; dispensing must retain holds on failure.
    const stateKey = [...storage.entries.keys()][0];
    const stored = JSON.parse(storage.getItem(stateKey)!);
    stored.rows.batches.find((batch: any) => batch.id === expiringBatch.id).expiresOn =
      '2020-01-01';
    storage.setItem(stateKey, JSON.stringify(stored));
    clinic = new DemoClinic(storage);
    await expect(
      request(clinic, '/dispenses', 'POST', {
        encounterId: chart.id,
        idempotencyKey: 'demo-failed-dispense',
      }),
    ).rejects.toBeDefined();
    expect(
      (await request(clinic, '/inventory')).data.find((i: any) => i.id === a.id).stockQuantity,
    ).toBe(2);
    expect(
      (await request(clinic, '/inventory')).data.find((i: any) => i.id === a.id),
    ).toMatchObject({ onHandQuantity: 5, reservedQuantity: 3 });
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
  it('does not simulate medication reservations for supply or retail prescriptions', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const p = await request(clinic, '/patients', 'POST', patientPayload('NON-MED-RX'));
    const supplies = [];
    for (const category of ['CONSUMABLE', 'RETAIL']) {
      const supply = await request(clinic, '/inventory', 'POST', {
        ...itemPayload('NON-MED-' + category),
        category,
      });
      await request(clinic, '/inventory/batches', 'POST', {
        itemId: supply.id,
        batchNumber: 'DATED-SUPPLY',
        expiresOn: '2035-12-31',
        quantity: 5,
      });
      supplies.push(supply);
    }
    await request(clinic, '/auth/logout', 'POST');
    await login(clinic, 'gp');
    const before = (await request(clinic, '/encounters')).data.length;
    for (const supply of supplies) {
      await expect(
        request(clinic, '/encounters', 'POST', chartPayload(p.id, [rx(supply.id, 3)])),
      ).rejects.toThrow('Prescriptions require medication items.');
      expect(
        (await request(clinic, '/inventory')).data.find((item: any) => item.id === supply.id),
      ).toMatchObject({ stockQuantity: 5, reservedQuantity: 0 });
    }
    expect((await request(clinic, '/encounters')).data).toHaveLength(before);
  });
  it('previews an unsigned redacted document from immutable fictional snapshots and marks revocation', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic, 'gp');
    const chart = await request(clinic, '/encounters', 'POST', {
      ...chartPayload(2, []),
      assessment: 'PRIVATE-DEMO-DIAGNOSIS',
    });
    const doc = await request(clinic, '/documents', 'POST', {
      encounterId: chart.id,
      kind: 'MC',
      startDate: '2035-01-01',
      days: 2,
      diagnosisRedacted: true,
      employer: 'Fictional QA Employer',
    });
    const before = await request(clinic, '/documents/' + doc.id);
    expect(before).toMatchObject({
      patientName: 'Mei Lin Tan',
      diagnosis: null,
      diagnosisRedacted: true,
      kind: 'MC',
    });
    expect(before.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Employer', value: 'Fictional QA Employer' }),
      ]),
    );
    expect(JSON.stringify(before)).not.toContain('PRIVATE-DEMO-DIAGNOSIS');
    expect(before).not.toHaveProperty('payload');
    expect(before).not.toHaveProperty('verificationUrl');
    const patient = await request(clinic, '/patients/2');
    await request(clinic, '/patients/2', 'PUT', {
      ...patientPayload(patient.nationalId),
      firstName: 'Changed Fictional',
      lastName: 'Identity',
      version: patient.version,
    });
    expect((await request(clinic, '/documents/' + doc.id)).patientName).toBe('Mei Lin Tan');
    await expect(clinic.request('/documents/' + doc.id, 'GET', undefined, 2)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(request(clinic, '/documents/' + doc.id + '/pdf')).rejects.toBeDefined();
    await request(clinic, '/documents/' + doc.id + '/revoke', 'POST', {
      reason: 'Fictional correction',
    });
    expect((await request(clinic, '/documents/' + doc.id)).revoked).toBe(true);
  });
  it('preserves custom frequency and records signed reservation/dispense activity without draft events', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic, 'gp');
    const prescriptions = [
        { ...rx(1, 4), frequencyPerDay: 23, mealTiming: 'BEFORE_MEAL', durationDays: 2 },
      ],
      draft = await request(clinic, '/encounters', 'POST', {
        ...chartPayload(2, prescriptions),
        status: 'DRAFT',
      });
    expect((await request(clinic, '/encounters/' + draft.id + '/prescription-log')).events).toEqual(
      [],
    );
    const signed = await request(clinic, '/encounters/' + draft.id, 'PUT', {
      ...chartPayload(2, prescriptions),
      version: draft.version,
    });
    const before = await request(clinic, '/encounters/' + signed.id + '/prescription-log');
    expect(before.events.map((event: any) => event.type)).toEqual(['PRESCRIBED', 'RESERVED']);
    expect(before.events.find((event: any) => event.type === 'PRESCRIBED').at).toBe(
      signed.signedAt,
    );
    expect(
      before.events.every(
        (event: any) =>
          event.frequencyPerDay === 23 &&
          event.mealTiming === 'BEFORE_MEAL' &&
          event.quantity === 4,
      ),
    ).toBe(true);
    const key = 'QA-DEMO-ACTIVITY-KEY';
    await request(clinic, '/dispenses', 'POST', { encounterId: signed.id, idempotencyKey: key });
    await request(clinic, '/dispenses', 'POST', { encounterId: signed.id, idempotencyKey: key });
    const after = await request(clinic, '/encounters/' + signed.id + '/prescription-log');
    expect(after.events.filter((event: any) => event.type === 'DISPENSED')).toHaveLength(1);
    expect(after.events.find((event: any) => event.type === 'DISPENSED')).toMatchObject({
      quantity: 4,
      batchId: 1,
      frequencyPerDay: 23,
      actorName: 'Dr. Aiman Hafiz',
    });
    const history = (await request(clinic, '/dispensary/history?search=Mei')).data;
    expect(history.find((row: any) => row.id === signed.id)).toMatchObject({ dispensed: true });
    expect(after).not.toHaveProperty('subjective');
  });
  it('stores patient-taking reports separately from stock and preserves them across reload', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic, 'gp');
    const before = (await request(clinic, '/inventory')).data,
      path = '/encounters/1/medication-doses';
    const input = {
      itemId: 1,
      outcome: 'TAKEN',
      source: 'PATIENT_REPORTED',
      occurredAt: '2026-01-01T10:00:00+08:00',
      amount: 0.5,
      notes: 'Fictional report',
      idempotencyKey: 'DEMO-DOSE-REPORT',
    };
    const saved = await request(clinic, path, 'POST', input);
    expect(saved).toMatchObject({
      amount: 0.5,
      occurredAt: '2026-01-01T02:00:00.000Z',
      actorName: 'Dr. Aiman Hafiz',
    });
    expect((await request(clinic, path, 'POST', input)).id).toBe(saved.id);
    await expect(request(clinic, path, 'POST', { ...input, amount: 1 })).rejects.toBeDefined();
    await request(clinic, path, 'POST', {
      ...input,
      outcome: 'MISSED',
      amount: null,
      source: 'STAFF_OBSERVED',
      occurredAt: '2026-01-02T00:00:00Z',
      idempotencyKey: 'DEMO-MISSED-REPORT',
    });
    const restored = new DemoClinic(storage),
      log = await request(restored, path);
    expect(log.entries.map((v: any) => v.outcome)).toEqual(['MISSED', 'TAKEN']);
    expect(log).not.toHaveProperty('data');
    expect(log.entries[0]).not.toHaveProperty('requestHash');
    expect((await request(restored, '/inventory')).data).toEqual(before);
    for (const changed of [
      { source: undefined },
      { amount: 0 },
      { amount: 0.0001 },
      { outcome: 'MISSED', amount: 1 },
      { occurredAt: '2099-01-01T00:00:00Z' },
      { itemId: 2 },
    ])
      await expect(
        request(restored, path, 'POST', {
          ...input,
          ...changed,
          idempotencyKey: 'INVALID-DEMO-DOSE',
        }),
      ).rejects.toBeDefined();
    await expect(request(restored, path, 'GET', undefined, 2)).rejects.toBeDefined();
    await login(restored, 'reception');
    await expect(request(restored, path)).rejects.toBeDefined();
  });
  it('retains prior-session records and fills only missing legacy document snapshot fields', async () => {
    const storage = new MemoryStorage();
    let clinic = new DemoClinic(storage);
    await login(clinic, 'gp');
    const patient = await request(
        clinic,
        '/patients',
        'POST',
        patientPayload('LEGACY-DOCUMENT-ROW'),
      ),
      chart = await request(clinic, '/encounters', 'POST', chartPayload(patient.id, [])),
      doc = await request(clinic, '/documents', 'POST', {
        encounterId: chart.id,
        kind: 'MC',
        startDate: '2035-01-01',
        days: 1,
      });
    const stateKey = [...storage.entries.keys()][0],
      state = JSON.parse(storage.getItem(stateKey)!);
    state.rows.documents.find((row: any) => row.id === doc.id).payload = {
      encounterId: chart.id,
      kind: 'MC',
      startDate: '2035-01-01',
      days: 1,
      demo: true,
    };
    storage.setItem(stateKey, JSON.stringify(state));
    clinic = new DemoClinic(storage);
    const preview = await request(clinic, '/documents/' + doc.id);
    expect(preview).toMatchObject({
      patientName: patient.name,
      nationalId: patient.nationalId,
      practitionerName: 'Dr. Aiman Hafiz',
    });
    expect(preview.clinicName).not.toBe('');
    expect((await request(clinic, '/patients')).data).toHaveLength(5);
    expect(
      (await request(clinic, '/encounters')).data.some((row: any) => row.id === chart.id),
    ).toBe(true);
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
  it('renames, archives and restores branches with active context and staff-home safeguards', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const branch = (await request(clinic, '/admin/branches')).data.find((b: any) => b.id === 2);
    const renamed = await request(clinic, '/admin/branches/2', 'PUT', {
      name: 'QA Kajang Renamed',
      address: 'Fictional branch address',
      active: true,
      version: branch.version,
    });
    expect(renamed).toMatchObject({ id: 2, name: 'QA Kajang Renamed', active: true, version: 2 });
    await expect(
      request(clinic, '/admin/branches/2', 'PUT', {
        name: 'Stale',
        address: '',
        active: true,
        version: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    const staff = await request(clinic, '/admin/users', 'POST', {
      email: 'branchstaff@example.test',
      name: 'QA Branch Staff',
      role: 'NURSE',
      password: 'test-password-long',
      branchId: 2,
    });
    await expect(
      request(clinic, '/admin/branches/2', 'PUT', {
        name: renamed.name,
        address: renamed.address,
        active: false,
        version: 2,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await request(clinic, '/admin/users/' + staff.id, 'PUT', { active: false });
    const archived = await request(clinic, '/admin/branches/2', 'PUT', {
      name: renamed.name,
      address: renamed.address,
      active: false,
      version: 2,
    });
    expect(archived).toMatchObject({ active: false, version: 3 });
    expect(
      (await request(clinic, '/admin/branches')).data.find((b: any) => b.id === 2).active,
    ).toBe(false);
    expect((await request(clinic, '/bootstrap')).branches.map((b: any) => b.id)).toEqual([1]);
    expect((await request(clinic, '/references/branches')).data.map((b: any) => b.id)).toEqual([1]);
    await expect(request(clinic, '/patients', 'GET', undefined, 2)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      request(clinic, '/admin/rooms', 'POST', { name: 'Archived branch room', branchId: 2 }),
    ).rejects.toBeDefined();
    await expect(
      request(clinic, '/admin/users', 'POST', {
        email: 'inactivebranch@example.test',
        name: 'Inactive Branch Staff',
        role: 'NURSE',
        password: 'test-password-long',
        branchId: 2,
      }),
    ).rejects.toBeDefined();
    await expect(
      request(clinic, '/admin/users/' + staff.id, 'PUT', { active: true }),
    ).rejects.toMatchObject({ status: 409 });
    await request(clinic, '/admin/branches/2', 'PUT', {
      name: renamed.name,
      address: renamed.address,
      active: true,
      version: 3,
    });
    await request(clinic, '/admin/users/' + staff.id, 'PUT', { active: true });
    const current = (await request(clinic, '/admin/branches')).data.find((b: any) => b.id === 1);
    await expect(
      request(clinic, '/admin/branches/1', 'PUT', {
        name: current.name,
        address: current.address,
        active: false,
        version: current.version,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await request(clinic, '/bootstrap')).branches.map((b: any) => b.id)).toEqual([1, 2]);
    await login(clinic, 'gp');
    await expect(
      request(clinic, '/admin/branches/2', 'PUT', {
        name: 'Unauthorized',
        address: '',
        active: true,
        version: 4,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('upgrades prior-session branch defaults without resetting records or authentication', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic);
    const patient = await request(
      clinic,
      '/patients',
      'POST',
      patientPayload('BRANCH-UPGRADE-PATIENT'),
    );
    const [key, raw] = [...storage.entries][0],
      state = JSON.parse(raw);
    for (const b of state.rows.branches) {
      delete b.active;
      delete b.version;
    }
    storage.setItem(key, JSON.stringify(state));
    const restored = new DemoClinic(storage),
      bootstrap = await request(restored, '/bootstrap');
    expect(bootstrap.user.id).toBe(1);
    expect(bootstrap.branches.every((b: any) => b.active === true && b.version === 1)).toBe(true);
    expect((await request(restored, '/patients')).data.some((p: any) => p.id === patient.id)).toBe(
      true,
    );
    await expect(request(restored, '/patients', 'GET', undefined, 0)).rejects.toBeDefined();
  });
  it('renames staff without status, role or credential changes and protects self-deactivation', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const self = await request(clinic, '/admin/users/1', 'PUT', {
      name: 'QA Administrator Renamed',
    });
    expect(self).toEqual({ id: 1, name: 'QA Administrator Renamed', active: true });
    await expect(request(clinic, '/admin/users/1', 'PUT', { active: false })).rejects.toMatchObject(
      { status: 409 },
    );
    await expect(request(clinic, '/admin/users/2', 'PUT', { role: 'ADMIN' })).rejects.toBeDefined();
    await expect(request(clinic, '/admin/users/2', 'PUT', {})).rejects.toBeDefined();
    await request(clinic, '/admin/users/2', 'PUT', { name: 'QA GP Renamed' });
    const gp = (await request(clinic, '/admin/users')).data.find((u: any) => u.id === 2);
    expect(gp).toMatchObject({
      name: 'QA GP Renamed',
      active: true,
      role: 'DOCTOR',
      licenseNumber: 'DEMO-NOT-A-LICENSE',
    });
    expect(gp).not.toHaveProperty('password');
    await login(clinic, 'gp');
    expect((await request(clinic, '/auth/me')).user.name).toBe('QA GP Renamed');
    await expect(
      request(clinic, '/admin/users/3', 'PUT', { name: 'Unauthorized' }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('deletes unused rooms but archives historical rooms without losing appointments', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const unused = await request(clinic, '/admin/rooms', 'POST', {
      name: 'Unused QA Room',
      branchId: 1,
    });
    expect(await request(clinic, '/admin/rooms/' + unused.id, 'DELETE')).toEqual({
      id: unused.id,
      removed: 'deleted',
    });
    await expect(
      request(clinic, '/admin/rooms/' + unused.id, 'PUT', { active: true }),
    ).rejects.toMatchObject({ status: 404 });
    const historic = await request(clinic, '/admin/rooms', 'POST', {
      name: 'Historical QA Room',
      branchId: 1,
    });
    const visit = await request(clinic, '/appointments', 'POST', {
      patientId: 1,
      practitionerId: 2,
      roomId: historic.id,
      startsAt: '2020-01-01T01:00:00Z',
      endsAt: '2020-01-01T01:30:00Z',
      reason: 'Fictional historical visit',
    });
    expect(await request(clinic, '/admin/rooms/' + historic.id, 'DELETE')).toEqual({
      id: historic.id,
      removed: 'archived',
    });
    expect(
      (await request(clinic, '/admin/rooms')).data.find((r: any) => r.id === historic.id),
    ).toMatchObject({ active: false });
    expect(
      (await request(clinic, '/appointments')).data.find((a: any) => a.id === visit.id),
    ).toMatchObject({ roomId: historic.id, roomName: 'Historical QA Room' });
    expect((await request(clinic, '/bootstrap')).rooms.some((r: any) => r.id === historic.id)).toBe(
      false,
    );
    await request(clinic, '/admin/rooms/' + historic.id, 'PUT', { active: true });
    expect((await request(clinic, '/bootstrap')).rooms.some((r: any) => r.id === historic.id)).toBe(
      true,
    );
    await expect(request(clinic, '/admin/rooms/3', 'DELETE')).rejects.toMatchObject({
      status: 404,
    });
  });
  it('rejects removing booked or occupied rooms without changing history', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    await request(clinic, '/appointments', 'POST', {
      patientId: 1,
      practitionerId: 2,
      roomId: 1,
      startsAt: '2035-02-01T01:00:00Z',
      endsAt: '2035-02-01T01:30:00Z',
      reason: 'Fictional future room booking',
    });
    await expect(request(clinic, '/admin/rooms/1', 'DELETE')).rejects.toMatchObject({
      status: 409,
    });
    const ticket = (await request(clinic, '/queue')).data[0];
    await request(clinic, '/queue/' + ticket.id + '/transition', 'POST', {
      status: 'CALLED_TO_ROOM',
      roomId: 2,
      practitionerId: 2,
      version: ticket.version,
    });
    await expect(request(clinic, '/admin/rooms/2', 'DELETE')).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      request(clinic, '/admin/rooms/2', 'PUT', { name: 'Busy Rename' }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await request(clinic, '/admin/rooms')).data.find((r: any) => r.id === 2)).toMatchObject(
      { name: 'Room 02', active: true },
    );
  });
  it('keeps receipt snapshots after metadata edits and branch removal/restoration', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await login(clinic);
    const patient = await request(
      clinic,
      '/patients',
      'POST',
      patientPayload('RECEIPT-PASSPORT'),
      2,
    );
    const invoice = await request(
      clinic,
      '/invoices',
      'POST',
      {
        patientId: patient.id,
        practitionerId: 2,
        lines: [
          {
            description: 'Fictional consultation',
            quantity: 2,
            unitPriceCents: 1250,
            category: 'SERVICE',
          },
        ],
        payments: [
          { method: 'CASH', amountCents: 1000, reference: '' },
          { method: 'CARD', amountCents: 1500, reference: 'FICTIONAL-CARD' },
        ],
        idempotencyKey: 'demo-receipt-snapshot',
      },
      2,
    );
    const path = '/invoices/' + invoice.id + '/receipt-view',
      before = await request(clinic, path, 'GET', undefined, 2);
    expect(before).toMatchObject({
      id: invoice.id,
      patientName: patient.name,
      nationalId: 'RECEIPT-PASSPORT',
      totalCents: 2500,
      simulated: true,
    });
    expect(before.lines[0].amountCents).toBe(2500);
    expect(before.payments.reduce((sum: number, p: any) => sum + p.amountCents, 0)).toBe(2500);
    for (const field of [
      'requestHash',
      'idempotencyKey',
      'receiptSnapshot',
      'tenantId',
      'branchId',
    ])
      expect(before).not.toHaveProperty(field);
    await request(
      clinic,
      '/patients/' + patient.id,
      'PUT',
      { ...patientPayload('RECEIPT-PASSPORT'), firstName: 'Changed', version: patient.version },
      2,
    );
    await request(clinic, '/admin/users/1', 'PUT', { name: 'Changed Administrator' });
    const branch = (await request(clinic, '/admin/branches')).data.find((b: any) => b.id === 2);
    await request(clinic, '/admin/branches/2', 'PUT', {
      name: 'Changed Branch',
      address: 'Changed address',
      active: false,
      version: branch.version,
    });
    await expect(request(clinic, path, 'GET', undefined, 2)).rejects.toMatchObject({ status: 403 });
    await request(clinic, '/admin/branches/2', 'PUT', {
      name: 'Changed Branch',
      address: 'Changed address',
      active: true,
      version: branch.version + 1,
    });
    expect(await request(new DemoClinic(storage), path, 'GET', undefined, 2)).toEqual(before);
    await expect(request(clinic, path)).rejects.toMatchObject({ status: 404 });
    await login(clinic, 'gp');
    await expect(request(clinic, path, 'GET', undefined, 2)).rejects.toMatchObject({ status: 403 });
  });
  it('renders legacy receipts without mutating stored invoices and requires login', async () => {
    const storage = new MemoryStorage(),
      clinic = new DemoClinic(storage);
    await expect(request(clinic, '/invoices/1/receipt-view')).rejects.toMatchObject({
      status: 401,
    });
    await login(clinic);
    const rawBefore = [...storage.entries][0][1],
      view = await request(clinic, '/invoices/1/receipt-view');
    expect(view).toMatchObject({ receivedBy: 'Not recorded', simulated: true, totalCents: 12000 });
    expect(view.clinicName).toBe('Klinik Seri Harmoni');
    expect([...storage.entries][0][1]).toBe(rawBefore);
    expect(view.issuedTime).toMatch(/ MYT$/);
  });
  it('admin catalog edits govern new lab choices while issued snapshots stay unchanged', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const entry = await request(clinic, '/admin/catalogs', 'POST', {
      kind: 'LAB_PANEL',
      label: 'QA Demo Panel',
    });
    await login(clinic, 'gp');
    await expect(
      request(clinic, '/admin/catalogs', 'POST', { kind: 'LAB_PANEL', label: 'Unauthorized' }),
    ).rejects.toBeDefined();
    expect(
      (await request(clinic, '/references/catalogs?kind=LAB_PANEL')).data.some(
        (v: any) => v.id === entry.id,
      ),
    ).toBe(true);
    const issued = await request(clinic, '/documents', 'POST', {
      encounterId: 1,
      kind: 'LAB',
      panels: ['QA Demo Panel'],
      specimenType: 'Blood',
      clinicalNotes: 'Fictional request',
    });
    const before = await request(clinic, '/documents/' + issued.id);
    expect(JSON.stringify(before.fields)).toContain('QA Demo Panel');
    await login(clinic);
    await expect(
      request(
        clinic,
        '/admin/catalogs/' + entry.id,
        'PUT',
        { label: 'Other branch', active: true, sortOrder: 0, version: entry.version },
        2,
      ),
    ).rejects.toBeDefined();
    await request(clinic, '/admin/catalogs/' + entry.id, 'PUT', {
      label: 'QA Demo Panel Updated',
      active: false,
      sortOrder: 0,
      version: entry.version,
    });
    await expect(
      request(clinic, '/admin/catalogs/' + entry.id, 'PUT', {
        label: 'Stale',
        active: true,
        sortOrder: 0,
        version: entry.version,
      }),
    ).rejects.toBeDefined();
    expect(
      (await request(clinic, '/references/catalogs?kind=LAB_PANEL')).data.some(
        (v: any) => v.id === entry.id,
      ),
    ).toBe(false);
    expect(await request(clinic, '/documents/' + issued.id)).toEqual(before);
    await login(clinic, 'gp');
    await expect(
      request(clinic, '/documents', 'POST', {
        encounterId: 1,
        kind: 'LAB',
        panels: ['QA Demo Panel Updated'],
        specimenType: 'Blood',
        clinicalNotes: '',
      }),
    ).rejects.toBeDefined();
  });
  it('archives medicines without losing signed stock work or trusting client snapshots', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const input = itemPayload('DEMO-ARCHIVE'),
      i = await request(clinic, '/inventory', 'POST', input);
    await request(clinic, '/inventory/batches', 'POST', {
      itemId: i.id,
      batchNumber: 'DEMO-ARCHIVE',
      expiresOn: '2035-01-01',
      quantity: 5,
    });
    await login(clinic, 'gp');
    const e = await request(
      clinic,
      '/encounters',
      'POST',
      chartPayload(2, [
        { ...rx(i.id, 3), itemName: 'FORGED', ingredient: 'FORGED', unit: 'FORGED' },
      ]),
    );
    expect(e.prescriptions[0]).toMatchObject({
      itemName: i.name,
      ingredient: i.ingredient,
      unit: i.unit,
    });
    await login(clinic);
    await expect(
      request(clinic, '/admin/inventory/' + i.id, 'PUT', {
        ...input,
        ingredient: 'changed',
        active: true,
        version: i.version,
      }),
    ).rejects.toBeDefined();
    await request(clinic, '/admin/inventory/' + i.id, 'PUT', {
      ...input,
      active: false,
      version: i.version,
    });
    expect((await request(clinic, '/references/medications?search=DEMO-ARCHIVE')).data).toEqual([]);
    await login(clinic, 'gp');
    await expect(
      request(clinic, '/encounters', 'POST', chartPayload(2, [rx(i.id, 1)])),
    ).rejects.toBeDefined();
    await request(clinic, '/dispenses', 'POST', {
      encounterId: e.id,
      idempotencyKey: 'DEMO-ARCHIVED-DISPENSE',
    });
    expect(
      (await request(clinic, '/encounters/' + e.id + '/prescription-log')).events.find(
        (v: any) => v.type === 'DISPENSED',
      ),
    ).toMatchObject({ quantity: 3, itemName: i.name });
  });
  it('retains foreign passport addresses and international formatted phone numbers', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const input = {
      ...patientPayload('QA-FOREIGN-PASSPORT'),
      addressLine1: 'Fictional overseas address',
      postcode: 'SW1A 1AA',
      city: 'London',
      state: 'London',
      phone: '+44 (0)20 7946 0999 ext 123',
    };
    const saved = await request(clinic, '/patients', 'POST', input);
    expect(saved).toMatchObject(input);
    expect(await request(clinic, '/patients/' + saved.id)).toMatchObject(input);
    const updated = await request(clinic, '/patients/' + saved.id, 'PUT', {
      ...input,
      phone: '+64 9 555 0100',
      version: saved.version,
    });
    expect(updated.phone).toBe('+64 9 555 0100');
    await expect(
      request(clinic, '/patients', 'POST', {
        ...input,
        nationalId: 'TOO-LONG-PHONE',
        phone: '+'.padEnd(51, '1'),
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
  it('preloads plausible fictional identities with coherent related records and safe contact markers', async () => {
    const clinic = new DemoClinic(new MemoryStorage());
    await login(clinic);
    const patients = (await request(clinic, '/patients')).data;
    expect(patients.map((p: any) => p.name)).toEqual([
      'Arjun Nair',
      'Mei Lin Tan',
      'Amir Hakimi',
      'Aisyah Rahman',
    ]);
    for (const patient of patients) {
      expect(patient.name).toBe([patient.firstName, patient.lastName].filter(Boolean).join(' '));
      expect(patient.email).toMatch(/@example\.test$/);
      expect(patient.phone).toBe('');
      expect(patient.notificationConsent).toBe(false);
      expect(patient.addressLine1).not.toBe('');
      if (patient.nationality === 'MALAYSIAN') {
        expect(patient.nationalId.split('-')[1]).toBe('00');
        expect(parseMalaysianIc(patient.nationalId)).toMatchObject({
          dateOfBirth: patient.dateOfBirth,
          sex: patient.sex,
        });
      } else expect(patient.nationalId).toMatch(/^DEMO-PASSPORT-/);
    }
    const bootstrap = await request(clinic, '/bootstrap');
    expect(bootstrap.practitioners[0]).toMatchObject({
      id: 2,
      name: 'Dr. Aiman Hafiz',
      licenseNumber: 'DEMO-NOT-A-LICENSE',
    });
    const [appointment] = (await request(clinic, '/appointments')).data;
    expect(appointment.patientId).toBe(3);
    expect(appointment.patientName).toBe('Amir Hakimi');
    expect(new Date(appointment.startsAt).getTime()).toBeGreaterThan(Date.now());
    expect(new Date(appointment.endsAt).getTime() - new Date(appointment.startsAt).getTime()).toBe(
      30 * 60 * 1000,
    );
    const [pending] = (await request(clinic, '/dispensary/encounters')).data;
    expect(pending).toMatchObject({
      id: 1,
      patientId: 2,
      patientName: 'Mei Lin Tan',
      practitionerId: 2,
    });
    expect(pending.prescriptions[0]).toMatchObject({ itemId: 1, quantity: 3 });
    const [invoice] = (await request(clinic, '/invoices')).data;
    expect(invoice).toMatchObject({
      id: 1,
      patientId: 1,
      patientName: 'Arjun Nair',
      practitionerId: 2,
      status: 'PAID',
    });
    expect(invoice.payments.reduce((sum: number, p: any) => sum + p.amountCents, 0)).toBe(
      invoice.totalCents,
    );
    expect((await request(clinic, '/inventory')).data.map((i: any) => i.name)).toEqual([
      'Paracetamol 500mg',
      'Amoxicillin 500mg',
    ]);
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
