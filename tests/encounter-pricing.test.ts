import { describe, expect, it } from 'vitest';
import { schemas } from '../src/server/validation';
import { encounterBillingLines } from '../src/shared/encounter-billing';

const prescription = { itemId: 1, quantity: 1, dosage: 'Apply', durationDays: 3 };
describe('doctor-approved clinical checkout contract', () => {
  it('rejects duplicate medicines before persistence', () => {
    expect(() =>
      schemas.encounter.parse({ patientId: 1, prescriptions: [prescription, prescription] }),
    ).toThrow('only once');
  });
  it.each(['PASTE', 'SYRUP', 'OTHER'])(
    'preserves fractional %s serving and separate stock units',
    (form) => {
      const parsed = schemas.encounter.parse({
        patientId: 1,
        prescriptions: [
          {
            ...prescription,
            form,
            quantityPerDose: 2.5,
            instructions: 'External use',
            unitPriceCents: 300,
          },
        ],
      });
      expect(parsed.prescriptions[0]).toMatchObject({
        quantity: 1,
        quantityPerDose: 2.5,
        form,
        instructions: 'External use',
        unitPriceCents: 300,
      });
    },
  );
  it('requires both fee values and distinct supplies', () => {
    expect(schemas.encounter.safeParse({ patientId: 1, consultationFeeCents: 100 }).success).toBe(
      false,
    );
    expect(
      schemas.encounter.safeParse({
        patientId: 1,
        consumables: [
          { itemId: 2, quantity: 1, reason: 'Dressing' },
          { itemId: 2, quantity: 2, reason: 'Dressing' },
        ],
      }).success,
    ).toBe(false);
  });
  it('itemizes doctor fee and medication snapshots, preserving legacy pricing', () => {
    expect(encounterBillingLines({ prescriptions: [] })).toBeNull();
    expect(
      encounterBillingLines(
        {
          consultationFeeCents: 1000,
          procedureFeeCents: 2000,
          prescriptions: [{ itemName: 'Ointment', quantity: 2, unitPriceCents: 300 }],
        },
        { service: 'Treatment', product: 'Medicine' },
      ),
    ).toEqual([
      { description: 'Consultation fee', quantity: 1, unitPriceCents: 1000, category: 'Treatment' },
      { description: 'Procedure fee', quantity: 1, unitPriceCents: 2000, category: 'Treatment' },
      { description: 'Ointment', quantity: 2, unitPriceCents: 300, category: 'Medicine' },
    ]);
  });
});
