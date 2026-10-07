import { describe, expect, it } from 'vitest';
import { formatMalaysianIc, parseMalaysianIc } from '../src/shared/patient-identity';

describe('Malaysian IC intake rules', () => {
  it('canonicalizes twelve digits and derives birth date and odd-digit male sex', () => {
    expect(parseMalaysianIc('991231145567', 2026)).toEqual({
      nationalId: '991231-14-5567',
      dateOfBirth: '1999-12-31',
      sex: 'MALE',
    });
  });
  it('accepts formatted IC and derives leap-day birth date and even-digit female sex', () => {
    expect(parseMalaysianIc('000229-14-5568', 2026)).toEqual({
      nationalId: '000229-14-5568',
      dateOfBirth: '2000-02-29',
      sex: 'FEMALE',
    });
  });
  it('infers latest century whose year is not in the future', () => {
    expect(parseMalaysianIc('270101145567', 2026).dateOfBirth).toBe('1927-01-01');
    expect(parseMalaysianIc('260101145567', 2026).dateOfBirth).toBe('2026-01-01');
  });
  it.each(['99123114556', '9912311455678', '99123114556A', '991231/14/5567', '991231--14-5567'])(
    'rejects malformed identity %s',
    (value) => expect(() => parseMalaysianIc(value, 2026)).toThrow(),
  );
  it.each(['900231145567', '010229145567', '900000145567', '901301145567'])(
    'rejects impossible encoded date %s',
    (value) => expect(() => parseMalaysianIc(value, 2026)).toThrow('birth date'),
  );
  it('formats progressively without treating formatting as validation', () => {
    expect(formatMalaysianIc('991231')).toBe('991231');
    expect(formatMalaysianIc('9912311')).toBe('991231-1');
    expect(formatMalaysianIc('991231145567')).toBe('991231-14-5567');
  });
});
