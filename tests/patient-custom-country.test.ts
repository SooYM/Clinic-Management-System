import { describe, expect, it } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
import { countryName, countryOptions } from '../src/shared/countries';
import { schemas } from '../src/server/validation';
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
const input = {
  firstName: 'Fictional',
  lastName: 'Country',
  nationality: 'NON_MALAYSIAN' as const,
  nationalId: 'COUNTRY-FICTIONAL',
  dateOfBirth: '1990-01-01',
  sex: 'OTHER' as const,
  countryCode: 'OTHER',
  countryName: '  Fictional territory  ',
};
const request = (record: any, extra: any = {}) => ({
  ...input,
  countryCode: record.countryCode,
  countryName: record.countryName,
  version: record.version,
  ...extra,
});
describe('custom nationality country', () => {
  it('provides Others and renders the saved name without changing ISO labels', () => {
    expect(countryOptions.at(-1)).toEqual({ code: 'OTHER', name: 'Others' });
    expect(countryName('OTHER', ' Fictional territory ')).toBe('Fictional territory');
    expect(countryName('SG', 'stale name')).toBe('Singapore');
    expect(schemas.patient.parse(input).countryName).toBe('Fictional territory');
    expect(schemas.patient.parse({ ...input, countryCode: 'SG' }).countryName).toBeNull();
  });
  it.each([undefined, null, '', '   ', 'x'.repeat(101)])(
    'rejects an absent, blank or excessive Others name: %s',
    (name) => {
      expect(schemas.patient.safeParse({ ...input, countryName: name }).success).toBe(false);
    },
  );
  it('requires foreign nationality and keeps legacy missing-country intake valid', () => {
    expect(schemas.patient.safeParse({ ...input, nationality: undefined }).success).toBe(false);
    expect(
      schemas.patient.parse({ ...input, countryCode: undefined, countryName: undefined })
        .countryCode,
    ).toBeUndefined();
    expect(
      schemas.patient.parse({
        ...input,
        nationality: 'MALAYSIAN',
        nationalId: '900101145566',
        countryCode: 'MY',
        countryName: 'stale',
        sex: 'FEMALE',
      }).countryName,
    ).toBeNull();
  });
  it('roundtrips custom country through demo editing, reload and ISO replacement', async () => {
    const storage = new Storage();
    let clinic = new DemoClinic(storage);
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const saved = await clinic.request('/patients', 'POST', input);
    expect(saved).toMatchObject({ countryCode: 'OTHER', countryName: 'Fictional territory' });
    const { countryCode, countryName: omitted, ...legacy } = request(saved);
    const preserved = await clinic.request(`/patients/${saved.id}`, 'PUT', legacy);
    expect(preserved.countryName).toBe('Fictional territory');
    clinic = new DemoClinic(storage);
    expect(await clinic.request(`/patients/${saved.id}`)).toMatchObject({
      countryCode: 'OTHER',
      countryName: 'Fictional territory',
    });
    await expect(
      clinic.request('/patients', 'POST', {
        ...input,
        nationalId: 'INVALID-FICTIONAL',
        countryName: '',
      }),
    ).rejects.toThrow();
    const changed = await clinic.request(
      `/patients/${saved.id}`,
      'PUT',
      request(preserved, { countryCode: 'GB', countryName: 'stale' }),
    );
    expect(changed).toMatchObject({ countryCode: 'GB', countryName: null });
  });
});
