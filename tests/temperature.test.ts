import { describe, expect, it } from 'vitest';
import { schemas } from '../src/server/validation';
describe('consultation temperature format', () => {
  it.each([undefined, '', 28, '28', 36.5, '36.5', 40, '40', 27.9, '27.9', 40.1, '40.1', -5, 1000])(
    'accepts optional or finite temperature %s',
    (temperature) => {
      expect(
        schemas.encounter.safeParse({
          patientId: 1,
          vitals: { ...(temperature === undefined ? {} : { temperature }) },
        }).success,
      ).toBe(true);
    },
  );
  it.each([NaN, Infinity, 'not a temperature'])('rejects invalid temperature %s', (temperature) => {
    const parsed = schemas.encounter.safeParse({ patientId: 1, vitals: { temperature } });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues.some((issue) => issue.path[0] === 'vitals')).toBe(true);
  });
});
