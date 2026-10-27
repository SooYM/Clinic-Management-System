import { describe, expect, it } from 'vitest';
import { DemoClinic } from '../src/client/demo-store';
import { schemas } from '../src/server/validation';
import { publicRegistrationInput } from '../src/server/public-registration-validation';

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
  name: 'Fictional Patient',
  nationalId: 'GROUP-TEST',
  dateOfBirth: '1990-01-01',
  sex: 'OTHER',
};
describe('patient groups', () => {
  it('accepts numeric group IDs and rejects public group assignment', () => {
    expect(schemas.patient.parse({ ...input, patientGroupId: 1 }).patientGroupId).toBe(1);
    expect(schemas.patient.safeParse({ ...input, patientGroupId: 'Insurance' }).success).toBe(
      false,
    );
    expect(
      publicRegistrationInput.safeParse({
        submissionKey: crypto.randomUUID(),
        consent: true,
        patient: { ...input, patientGroupId: 1 },
      }).success,
    ).toBe(false);
  });
  it('persists assignment through renames, archive and reload while enforcing branch/module/admin scope', async () => {
    const storage = new Storage();
    let clinic = new DemoClinic(storage);
    await clinic.request('/auth/login', 'POST', { email: 'admin@example.test', password: 'demo' });
    const choices = (await clinic.request('/references/catalogs?kind=PATIENT_GROUP')).data;
    const insurance = choices.find((group: any) => group.label === 'Insurance');
    expect(insurance).toBeDefined();
    const patient = await clinic.request('/patients', 'POST', {
      ...input,
      patientGroupId: insurance.id,
    });
    expect(patient).toMatchObject({ patientGroupId: insurance.id, patientGroupLabel: 'Insurance' });
    await clinic.request('/admin/catalogs/' + insurance.id, 'PUT', {
      label: 'Panel insurance',
      active: false,
      sortOrder: 0,
      version: insurance.version,
    });
    clinic = new DemoClinic(storage);
    expect(await clinic.request('/patients/' + patient.id)).toMatchObject({
      patientGroupId: insurance.id,
      patientGroupLabel: 'Panel insurance',
    });
    const updated = await clinic.request('/patients/' + patient.id, 'PUT', {
      ...input,
      version: patient.version,
    });
    expect(updated.patientGroupId).toBe(insurance.id);
    await expect(
      clinic.request('/patients', 'POST', {
        ...input,
        nationalId: 'ARCHIVED-GROUP',
        patientGroupId: insurance.id,
      }),
    ).rejects.toBeDefined();
    const foreign = (
      await clinic.request('/references/catalogs?kind=PATIENT_GROUP', 'GET', undefined, 2)
    ).data[0];
    await expect(
      clinic.request('/patients', 'POST', {
        ...input,
        nationalId: 'FOREIGN-GROUP',
        patientGroupId: foreign.id,
      }),
    ).rejects.toBeDefined();
    await clinic.request('/admin/role-modules', 'PUT', {
      role: 'RECEPTIONIST',
      modules: ['patients'],
    });
    await clinic.request('/auth/login', 'POST', {
      email: 'reception@example.test',
      password: 'demo',
    });
    expect(
      (await clinic.request('/references/catalogs?kind=PATIENT_GROUP')).data.length,
    ).toBeGreaterThan(0);
    await expect(
      clinic.request('/admin/catalogs', 'POST', { kind: 'PATIENT_GROUP', label: 'Forbidden' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(clinic.request('/references/catalogs?kind=LAB_PANEL')).rejects.toMatchObject({
      status: 403,
    });
  });
});
