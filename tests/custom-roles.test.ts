import { describe, expect, it } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
import { customRoleInput } from '../src/shared/custom-roles';
import { effectiveModules } from '../src/server/module-access';

class Storage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
describe('custom module roles', () => {
  it('validates names/modules and keeps missing or foreign roles denied', async () => {
    expect(customRoleInput.safeParse({ name: ' ', modules: [] }).success).toBe(false);
    expect(customRoleInput.safeParse({ name: 'Desk', modules: ['admin'] }).success).toBe(false);
    const db = { query: async () => ({ rows: [], rowCount: 0 }) };
    expect(await effectiveModules(db, 1, 'RECEPTIONIST', 123)).toEqual([]);
    expect(await effectiveModules(db, 1, 'ADMIN', 123)).toContain('billing');
  });
  it('persists custom roles, supports assignment/revocation and preserves professional/admin restrictions', async () => {
    const storage = new Storage();
    let clinic = new DemoClinic(storage);
    const login = (email: string) =>
      clinic.request('/auth/login', 'POST', { email, password: 'demo' });
    await login('admin@example.test');
    const role = await clinic.request('/admin/custom-roles', 'POST', {
      name: 'Patient desk',
      modules: ['patients'],
    });
    await clinic.request('/admin/users/3', 'PUT', { customRoleId: role.id });
    await expect(
      clinic.request('/admin/users/1', 'PUT', { customRoleId: role.id }),
    ).rejects.toThrow();
    await login('reception@example.test');
    expect((await clinic.request('/bootstrap')).modules).toEqual(['patients']);
    await expect(clinic.request('/inventory')).rejects.toThrow();
    await expect(clinic.request('/admin/custom-roles')).rejects.toThrow();
    await login('admin@example.test');
    await clinic.request('/admin/custom-roles/' + role.id, 'PUT', {
      name: 'Patient desk',
      modules: [],
      version: role.version,
    });
    await expect(
      clinic.request('/admin/custom-roles/' + role.id, 'PUT', {
        name: 'Stale',
        modules: ['queue'],
        version: role.version,
      }),
    ).rejects.toThrow();
    clinic = new DemoClinic(storage);
    await login('reception@example.test');
    expect((await clinic.request('/bootstrap')).modules).toEqual([]);
    await login('admin@example.test');
    await clinic.request('/admin/users/3', 'PUT', { customRoleId: null });
    await login('reception@example.test');
    expect((await clinic.request('/bootstrap')).modules).toContain('queue');
  });
});
