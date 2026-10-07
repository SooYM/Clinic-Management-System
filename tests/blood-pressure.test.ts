import { describe, expect, it } from 'vitest';
import { parseBloodPressure } from '../src/shared/blood-pressure';
import { schemas } from '../src/server/validation';

describe('blood pressure format and non-diagnostic monitor flags', () => {
  it.each(['', '   ', undefined, null])('allows optional blank %s', (value) => {
    expect(parseBloodPressure(value)).toBeNull();
  });
  it.each(['120/80', ' 120 / 80 ', '260/215'])('accepts common monitor range %s', (value) => {
    expect(parseBloodPressure(value)?.unusual).toBe(false);
  });
  it.each(['300/220', '59/39', '1000/1'])('accepts unusual readings with warning %s', (value) => {
    expect(parseBloodPressure(value)?.unusual).toBe(true);
  });
  it.each([
    '80/120',
    '80/80',
    '0/0',
    '-120/80',
    '120.5/80',
    '1e3/80',
    '120/80/70',
    '120',
    120,
    true,
    {},
  ])('rejects invalid reading %s', (value) => {
    expect(() => parseBloodPressure(value)).toThrow();
  });
  it('validates only bloodPressure and preserves other vitals', () => {
    const vitals = {
      bloodPressure: '300/220',
      pulse: 79,
      note: 'manual reading',
      custom: 'anything',
    };
    expect(schemas.encounter.parse({ patientId: 1, vitals }).vitals).toEqual(vitals);
    expect(
      schemas.encounter.safeParse({ patientId: 1, vitals: { bloodPressure: '80/120' } }).success,
    ).toBe(false);
  });
});
