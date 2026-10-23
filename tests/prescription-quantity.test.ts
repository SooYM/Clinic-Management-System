import { describe, expect, it } from 'vitest';
import { schemas } from '../src/server/validation';
import { defaultRoleModules } from '../src/shared/module-permissions';

const encounter = {
  patientId: 1,
  specialty: 'GP',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
  vitals: {},
  procedureNotes: '',
  prescriptions: [
    {
      itemId: 1,
      quantity: 12,
      quantityPerDose: 2,
      dosage: 'Take with water',
      indication: ' Fever ',
      frequencyPerDay: 3,
      durationDays: 2,
    },
  ],
};
describe('prescription supply and dose contract', () => {
  it('preserves dose and purpose and rejects an inconsistent total stock quantity', () => {
    expect(schemas.encounter.parse(encounter).prescriptions[0]).toMatchObject({
      quantity: 12,
      quantityPerDose: 2,
      indication: 'Fever',
    });
    expect(() =>
      schemas.encounter.parse({
        ...encounter,
        prescriptions: [{ ...encounter.prescriptions[0], quantity: 11 }],
      }),
    ).toThrow('Total quantity');
  });
  it('keeps historical prescriptions compatible and rejects fractional pieces', () => {
    const { quantityPerDose: _, ...legacy } = encounter.prescriptions[0];
    expect(
      schemas.encounter.parse({ ...encounter, prescriptions: [legacy] }).prescriptions[0].quantity,
    ).toBe(12);
    expect(() =>
      schemas.encounter.parse({
        ...encounter,
        prescriptions: [{ ...encounter.prescriptions[0], quantityPerDose: 0.5 }],
      }),
    ).toThrow();
  });
  it('accepts absent manufacturer batch numbers without inventing identifiers', () => {
    expect(schemas.batch.parse({ itemId: 1, quantity: 4 })).toMatchObject({
      batchNumber: null,
      expiresOn: null,
    });
    expect(() => schemas.batch.parse({ itemId: 1, quantity: 4, batchNumber: '' })).toThrow();
  });
  it('grants cashier payment and chart access without dispensary or administrator privileges', () => {
    expect(defaultRoleModules.CASHIER).toEqual(['queue', 'patients', 'clinical', 'billing']);
    expect(defaultRoleModules.NURSE).toContain('clinical');
  });
});
