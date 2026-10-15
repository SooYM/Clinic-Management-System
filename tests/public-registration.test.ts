import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicRegistrationInput } from '../src/server/public-registration-validation';
import { DemoClinic } from '../src/client/demo-store';
class Storage {
  entries = new Map<string, string>();
  getItem(k: string) {
    return this.entries.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.entries.set(k, v);
  }
  removeItem(k: string) {
    this.entries.delete(k);
  }
}
const body = () => ({
  submissionKey: crypto.randomUUID(),
  consent: true,
  patient: {
    firstName: 'Synthetic',
    lastName: 'QR Patient',
    nationality: 'NON_MALAYSIAN',
    countryCode: 'SG',
    nationalId: String(crypto.randomUUID()),
    dateOfBirth: '1990-01-01',
    sex: 'OTHER',
    phone: '+65 8123 4567',
  },
});
const login = (clinic: DemoClinic, alias = 'admin') =>
  clinic.request('/auth/login', 'POST', { email: alias + '@example.test', password: 'demo' });
async function ready() {
  const storage = new Storage(),
    clinic = new DemoClinic(storage);
  await login(clinic);
  await clinic.request('/admin/registration-settings', 'PUT', { enabled: true, version: 1 });
  return { clinic, storage };
}
afterEach(() => vi.useRealTimers());
describe('public registration input boundary', () => {
  it('keeps demographic fields and applies existing identity normalization', () => {
    const input = body();
    input.patient.nationality = 'MALAYSIAN';
    input.patient.countryCode = 'MY';
    input.patient.nationalId = '900101145567';
    delete (input.patient as any).dateOfBirth;
    delete (input.patient as any).sex;
    const parsed = publicRegistrationInput.parse(input);
    expect(parsed.patient).toMatchObject({
      nationalId: '900101-14-5567',
      sex: 'MALE',
      dateOfBirth: '1990-01-01',
    });
    expect(parsed.patient).not.toHaveProperty('allergies');
  });
  it('rejects clinical injection, missing consent, record identifiers and missing nationality country', () => {
    const input = body();
    for (const invalid of [
      { ...input, consent: false },
      { ...input, patientId: 1 },
      { ...input, patient: { ...input.patient, conditions: ['fake'] } },
      { ...input, patient: { ...input.patient, version: 1 } },
      { ...input, patient: { ...input.patient, countryCode: null } },
      { ...input, patient: { ...input.patient, nationality: undefined } },
    ])
      expect(publicRegistrationInput.safeParse(invalid).success).toBe(false);
  });
});
describe('browser-only QR registration simulation', () => {
  it('returns pending ticket immediately and only activates it after reception confirmation', async () => {
    const { clinic, storage } = await ready();
    await clinic.request('/auth/logout', 'POST');
    const input = body(),
      receipt = await clinic.request('/public/registration/branches/1', 'POST', input);
    expect(receipt.status).toBe('PENDING');
    expect(receipt.ticketNumber).toMatch(/^Q-\d+$/);
    expect(await clinic.request('/public/registration/branches/1', 'POST', input)).toEqual(receipt);
    expect(
      Object.keys(
        await clinic.request('/public/registration/receipts/' + receipt.receiptToken),
      ).sort(),
    ).toEqual(
      ['reference', 'ticketNumber', 'status', 'expiresAt', 'branchName', 'simulated'].sort(),
    );
    await login(clinic);
    const before = (await clinic.request('/queue')).data;
    expect(before.some((row: any) => row.ticketNumber === receipt.ticketNumber)).toBe(false);
    const pending = (await clinic.request('/registrations')).data.find(
      (row: any) => row.reference === receipt.reference,
    );
    const approved = await clinic.request('/registrations/' + pending.id + '/confirm', 'POST', {
      version: pending.version,
      identityVerified: true,
    });
    expect(approved.ticketNumber).toBe(receipt.ticketNumber);
    expect(
      (await clinic.request('/queue')).data.some(
        (row: any) => row.ticketNumber === receipt.ticketNumber,
      ),
    ).toBe(true);
    const reloaded = new DemoClinic(storage);
    expect(
      (await reloaded.request('/public/registration/receipts/' + receipt.receiptToken)).status,
    ).toBe('ACCEPTED');
    expect(
      [...storage.entries.values()].some((raw) =>
        JSON.parse(raw).rows.registrations.some(
          (row: any) => row.id === pending.id && row.payload === null,
        ),
      ),
    ).toBe(true);
  });
  it('retains pending numbers without reuse and resets only next Malaysian day', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T15:59:00Z'));
    const { clinic, storage } = await ready();
    const first = await clinic.request('/public/registration/branches/1', 'POST', body());
    expect(first.expiresAt).toBe('2026-10-15T16:00:00.000Z');
    await login(clinic);
    const pending = (await clinic.request('/registrations')).data[0];
    await clinic.request('/registrations/' + pending.id + '/reject', 'POST', {
      version: pending.version,
    });
    const second = await clinic.request('/public/registration/branches/1', 'POST', body());
    expect(Number(second.ticketNumber.slice(2))).toBeGreaterThan(
      Number(first.ticketNumber.slice(2)),
    );
    vi.setSystemTime(new Date('2026-10-15T16:00:01Z'));
    expect(
      (await clinic.request('/public/registration/receipts/' + second.receiptToken)).status,
    ).toBe('EXPIRED');
    const next = await clinic.request('/public/registration/branches/1', 'POST', body());
    expect(next.ticketNumber).toBe('Q-001');
    const state = JSON.parse([...storage.entries.values()][0]);
    expect(
      state.rows.registrations.find((row: any) => row.receiptToken === second.receiptToken).payload,
    ).toBeNull();
  });
});
