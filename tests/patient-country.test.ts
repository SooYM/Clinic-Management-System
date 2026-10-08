import { describe, expect, it } from 'vitest';
import { schemas } from '../src/server/validation';
import { DemoClinic } from '../src/client/demo-store';

const input = {
  firstName: 'Fictional',
  lastName: 'Traveller',
  nationality: 'NON_MALAYSIAN',
  nationalId: 'QA-PASSPORT',
  dateOfBirth: '1990-01-01',
  sex: 'OTHER',
};
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
describe('patient nationality country', () => {
  it('accepts ISO countries and retains legacy unknown nationality', () => {
    expect(schemas.patient.parse({ ...input, countryCode: 'SG' }).countryCode).toBe('SG');
    expect(schemas.patient.parse(input).countryCode).toBeUndefined();
    expect(
      schemas.patient.parse({
        nationality: 'MALAYSIAN',
        firstName: 'Fictional',
        nationalId: '900101145567',
      }).countryCode,
    ).toBe('MY');
  });
  it.each(['XX', 'sg', 'SINGAPORE', 'MY'])('rejects nonMalaysian country %s', (countryCode) => {
    expect(() => schemas.patient.parse({ ...input, countryCode })).toThrow();
  });
  it('rejects conflicting Malaysian country', () => {
    expect(() =>
      schemas.patient.parse({
        nationality: 'MALAYSIAN',
        firstName: 'Fictional',
        nationalId: '900101145567',
        countryCode: 'SG',
      }),
    ).toThrow();
  });
  it('demo persists selected country, edits it, retains omitted legacy country and keeps branch scope', async () => {
    const storage = new Storage(),
      clinic = new DemoClinic(storage);
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const saved = await clinic.request('/patients', 'POST', { ...input, countryCode: 'SG' });
    expect(saved.countryCode).toBe('SG');
    const edited = await clinic.request('/patients/' + saved.id, 'PUT', {
      ...input,
      countryCode: 'GB',
      version: saved.version,
    });
    expect(edited.countryCode).toBe('GB');
    const unchanged = await clinic.request('/patients/' + saved.id, 'PUT', {
      ...input,
      version: edited.version,
    });
    expect(unchanged.countryCode).toBe('GB');
    expect((await new DemoClinic(storage).request('/patients/' + saved.id)).countryCode).toBe('GB');
    await expect(clinic.request('/patients/' + saved.id, 'GET', undefined, 2)).rejects.toThrow();
    const legacy = await clinic.request('/patients', 'POST', {
      ...input,
      nationalId: 'LEGACY-UNKNOWN',
    });
    expect(legacy.countryCode).toBeNull();
    await expect(
      clinic.request('/patients', 'POST', {
        ...input,
        nationalId: 'BAD-COUNTRY',
        countryCode: 'XX',
      }),
    ).rejects.toThrow();
  });
});
