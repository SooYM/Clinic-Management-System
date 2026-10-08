import { afterEach, describe, expect, it, vi } from 'vitest';
import { schemas } from '../src/server/validation';
import { DemoClinic } from '../src/client/demo-store';
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
async function ready() {
  const clinic = new DemoClinic(new Storage());
  await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
  return clinic;
}
afterEach(() => vi.useRealTimers());
describe('booking and clinic settings', () => {
  it('validates Malaysian calendar dates, allowing earlier times today and rejecting prior days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-02T05:00:00Z'));
    const base = {
      patientId: 1,
      practitionerId: 2,
      startsAt: '2030-01-02T00:01:00+08:00',
      endsAt: '2030-01-02T00:31:00+08:00',
    };
    expect(schemas.appointment.parse(base)).toMatchObject(base);
    expect(() =>
      schemas.appointment.parse({
        ...base,
        startsAt: '2030-01-01T23:00:00+08:00',
        endsAt: '2030-01-01T23:30:00+08:00',
      }),
    ).toThrow('today or later');
    expect(() => schemas.appointment.parse({ ...base, endsAt: base.startsAt })).toThrow(
      'End must follow start',
    );
  });
  it('demo removal preserves history, hides row, releases slot and rejects stale or foreign branch removal', async () => {
    const clinic = await ready(),
      payload = {
        patientId: 1,
        practitionerId: 2,
        startsAt: '2038-04-01T01:00:00Z',
        endsAt: '2038-04-01T02:00:00Z',
      };
    const saved = await clinic.request('/appointments', 'POST', payload);
    await expect(
      clinic.request('/appointments/' + saved.id, 'DELETE', { version: saved.version + 1 }),
    ).rejects.toThrow();
    await expect(
      clinic.request('/appointments/' + saved.id, 'DELETE', { version: saved.version }, 2),
    ).rejects.toThrow();
    const removed = await clinic.request('/appointments/' + saved.id, 'DELETE', {
      version: saved.version,
    });
    expect(removed).toMatchObject({ status: 'CANCELLED', deletedAt: expect.any(String) });
    expect((await clinic.request('/appointments')).data.some((a: any) => a.id === saved.id)).toBe(
      false,
    );
    expect((await clinic.request('/appointments', 'POST', payload)).id).toBeGreaterThan(saved.id);
  });
  it('demo clinic name changes require admin and current name, and encounter detail remains scoped', async () => {
    const clinic = await ready(),
      before = await clinic.request('/admin/clinic');
    expect(
      (
        await clinic.request('/admin/clinic', 'PUT', {
          name: 'Fictional updated clinic',
          expectedName: before.name,
        })
      ).name,
    ).toBe('Fictional updated clinic');
    expect((await clinic.request('/bootstrap')).tenant.name).toBe('Fictional updated clinic');
    await expect(
      clinic.request('/admin/clinic', 'PUT', { name: 'Stale', expectedName: before.name }),
    ).rejects.toThrow();
    await clinic.request('/auth/login', 'POST', { email: 'gp@example.test', password: 'demo' });
    await expect(
      clinic.request('/admin/clinic', 'PUT', {
        name: 'Denied',
        expectedName: 'Fictional updated clinic',
      }),
    ).rejects.toThrow();
    expect((await clinic.request('/encounters/1')).status).toBe('SIGNED');
    await expect(clinic.request('/encounters/1', 'GET', undefined, 2)).rejects.toThrow();
  });
  it('demo stock ingredients are optional for supplies and retail, required for medicine', async () => {
    const clinic = await ready();
    for (const category of ['CONSUMABLE', 'RETAIL'])
      expect(
        (
          await clinic.request('/inventory', 'POST', {
            name: 'Fictional item',
            sku: category,
            category,
            priceCents: 0,
          })
        ).ingredient,
      ).toBe('');
    await expect(
      clinic.request('/inventory', 'POST', {
        name: 'Medicine',
        sku: 'NO-INGREDIENT',
        category: 'MEDICATION',
        priceCents: 0,
      }),
    ).rejects.toThrow('ingredient');
  });
});
