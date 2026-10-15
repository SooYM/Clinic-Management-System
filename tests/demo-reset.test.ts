import { describe, expect, it } from 'vitest';
import { DemoClinic, type DemoStorage } from '../src/client/demo-store';

class Storage implements DemoStorage {
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
  state() {
    return JSON.parse([...this.entries.values()][0]);
  }
}
async function ready() {
  const storage = new Storage();
  const clinic = new DemoClinic(storage);
  const login = await clinic.request('/auth/login', 'POST', {
    email: 'admin@example.test',
    password: 'demo',
  });
  return { clinic, storage, login };
}
const consent = {
  confirmationPhrase: 'RESET ALL CLINIC DATA',
  currentPassword: 'demo',
  acknowledge: true,
};

describe('fictional demo entire database reset', () => {
  it('keeps a valid SuperAdmin session active after an incorrect reset password', async () => {
    const { clinic, storage, login } = await ready();
    const before = [...storage.entries.values()][0];
    await expect(
      clinic.request('/admin/database-reset', 'POST', { ...consent, currentPassword: 'incorrect' }),
    ).rejects.toMatchObject({ status: 403 });
    expect([...storage.entries.values()][0]).toBe(before);
    expect((await clinic.request('/auth/me')).user.id).toBe(login.user.id);
    expect((await clinic.request('/bootstrap')).user.isSuperAdmin).toBe(true);
  });
  it('projects distinct SuperAdmin capability and previews all rows without changing data', async () => {
    const { clinic, storage, login } = await ready();
    expect(login.user.isSuperAdmin).toBe(true);
    expect((await clinic.request('/bootstrap')).user.isSuperAdmin).toBe(true);
    const before = [...storage.entries.values()][0];
    const preview = await clinic.request('/admin/database-reset/preview');
    expect(preview).toMatchObject({
      scope: 'ENTIRE_DATABASE',
      confirmationPhrase: consent.confirmationPhrase,
      requiresPassword: true,
      preserves: ['schema_migrations', 'auto_increment_sequences'],
      defaults: {
        branchName: 'Main Branch',
        administratorEmail: 'admin@example.test',
        rooms: ['Room 01', 'Room 02', 'Treatment Room'],
        catalogs: {
          LAB_PANEL: [],
          SPECIMEN_TYPE: [],
          INVENTORY_UNIT: [],
          REFERRAL_DESTINATION: [],
        },
      },
    });
    expect(preview.counts.find((row: any) => row.table === 'encounters').rowCount).toBeGreaterThan(
      0,
    );
    expect(preview.counts).toEqual(
      Object.entries(storage.state().rows).map(([table, rows]) => ({
        table,
        rowCount: (rows as any[]).length,
      })),
    );
    expect([...storage.entries.values()][0]).toBe(before);
    expect(JSON.stringify(preview)).not.toContain('currentPassword');
  });
  it.each([
    { ...consent, confirmationPhrase: 'RESET' },
    { ...consent, acknowledge: false },
    { ...consent, currentPassword: 'incorrect' },
    { ...consent, extra: true },
    { confirmationPhrase: consent.confirmationPhrase, acknowledge: true },
  ])('rejects invalid consent or reauthentication with no stored changes: %j', async (body) => {
    const { clinic, storage } = await ready();
    const before = [...storage.entries.values()][0];
    await expect(clinic.request('/admin/database-reset', 'POST', body)).rejects.toThrow();
    expect([...storage.entries.values()][0]).toBe(before);
  });
  it('never lets an ordinary Administrator grant SuperAdmin or reset data', async () => {
    const { clinic, storage } = await ready();
    const ordinary = await clinic.request('/admin/users', 'POST', {
      name: 'Fictional Ordinary Administrator',
      email: 'ordinary@example.test',
      password: '12345678901234',
      role: 'ADMIN',
      branchId: 1,
    });
    expect(ordinary.isSuperAdmin).toBe(false);
    await clinic.request('/auth/logout', 'POST');
    const login = await clinic.request('/auth/login', 'POST', {
      email: 'ordinary@example.test',
      password: '12345678901234',
    });
    expect(login.user.isSuperAdmin).toBe(false);
    const before = [...storage.entries.values()][0];
    await expect(clinic.request('/admin/database-reset/preview')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      clinic.request('/admin/database-reset', 'POST', {
        ...consent,
        currentPassword: '12345678901234',
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      clinic.request('/admin/users', 'POST', {
        name: 'Fictional Escalation Attempt',
        email: 'elevated@example.test',
        password: '12345678901234',
        role: 'ADMIN',
        branchId: 1,
        isSuperAdmin: true,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      clinic.request(`/admin/users/${ordinary.id}`, 'PUT', { isSuperAdmin: true }),
    ).rejects.toThrow();
    expect([...storage.entries.values()][0]).toBe(before);
  });
  it('requires a live active SuperAdmin rather than a formerly privileged session', async () => {
    const { storage } = await ready();
    const [key, raw] = [...storage.entries.entries()][0];
    const state = JSON.parse(raw);
    state.rows.users[0].active = false;
    storage.setItem(key, JSON.stringify(state));
    await expect(
      new DemoClinic(storage).request('/admin/database-reset', 'POST', consent),
    ).rejects.toMatchObject({ status: 401 });
    expect([...storage.entries.values()][0]).toBe(JSON.stringify(state));
  });
  it('clears the whole simulated database including signed history, restores only defaults, keeps IDs increasing and logs out', async () => {
    const { clinic, storage } = await ready();
    await clinic.request('/admin/rooms', 'POST', { name: 'Fictional temporary room', branchId: 1 });
    const before = storage.state();
    const signed = before.rows.encounters.find((row: any) => row.status === 'SIGNED');
    await clinic.request('/auth/logout', 'POST');
    await clinic.request('/auth/login', 'POST', { email: 'gp@example.test', password: 'demo' });
    await expect(
      clinic.request(`/encounters/${signed.id}`, 'DELETE', { version: signed.version }),
    ).rejects.toMatchObject({ status: 409 });
    await clinic.request('/auth/logout', 'POST');
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const result = await clinic.request('/admin/database-reset', 'POST', consent);
    expect(result).toEqual({ requiresLogin: true, bootstrapEmail: 'admin@example.test' });
    expect(JSON.stringify(result)).not.toContain('password');
    const after = storage.state();
    expect(after.userId).toBeNull();
    expect(after.grants).toEqual({});
    const expectedCounts: Record<string, number> = {
      tenants: 1,
      branches: 1,
      users: 1,
      rooms: 3,
      catalogs: 2,
      audit: 1,
    };
    for (const [table, rows] of Object.entries(after.rows))
      expect((rows as any[]).length, table).toBe(expectedCounts[table] || 0);
    for (const table of ['tenants', 'branches', 'users', 'rooms', 'audit'])
      for (const row of after.rows[table]) expect(row.id).toBeGreaterThan(before.counters[table]);
    expect(after.rows.users[0]).toMatchObject({
      email: 'admin@example.test',
      role: 'ADMIN',
      isSuperAdmin: true,
      active: true,
    });
    expect(after.rows.audit[0]).toMatchObject({
      action: 'DATABASE_RESET',
      actorId: after.rows.users[0].id,
      metadata: { scope: 'ENTIRE_DATABASE', resetActor: { id: before.rows.users[0].id } },
    });
    await expect(clinic.request('/bootstrap')).rejects.toMatchObject({ status: 401 });
    await expect(
      clinic.request('/auth/login', 'POST', { email: 'gp@example.test', password: 'demo' }),
    ).rejects.toMatchObject({ status: 401 });
    const fresh = new DemoClinic(storage);
    const login = await fresh.request('/auth/login', 'POST', {
      email: 'admin@example.test',
      password: 'demo',
    });
    expect(login.user.id).toBe(after.rows.users[0].id);
    expect((await fresh.request('/bootstrap')).branches).toHaveLength(1);
    expect((await fresh.request('/references/catalogs?kind=INVENTORY_UNIT')).data).toEqual([]);
    const patient = await fresh.request('/patients', 'POST', {
      firstName: 'Fictional',
      lastName: 'Reset Patient',
      nationality: 'NON_MALAYSIAN',
      countryCode: 'SG',
      nationalId: 'FICTIONAL-RESET-01',
      dateOfBirth: '1990-01-01',
      sex: 'MALE',
      phone: '+60123456789',
    });
    expect(patient.id).toBeGreaterThan(before.counters.patients);
    expect(patient.tenantId).toBe(after.rows.tenants[0].id);
    expect((await fresh.request('/patients')).data.map((row: any) => row.id)).toEqual([patient.id]);
  });
});
