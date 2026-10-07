import { describe, expect, it } from 'vitest';
import { idSchema } from '../src/shared/identifiers';

describe('numeric entity identifiers', () => {
  it.each([1, 12345, Number.MAX_SAFE_INTEGER])('accepts safe positive number %s', (value) =>
    expect(idSchema.parse(value)).toBe(value),
  );
  it.each(['1', '12345', String(Number.MAX_SAFE_INTEGER)])(
    'accepts decimal route identifier %s',
    (value) => expect(idSchema.parse(value)).toBe(Number(value)),
  );
  it.each([
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
    '',
    ' ',
    '0',
    '-1',
    '1.5',
    '1e3',
    '0x10',
    'abc',
    '9007199254740992',
    true,
    false,
    null,
    undefined,
    {},
    [],
  ])('rejects malformed identifier %s', (value) =>
    expect(idSchema.safeParse(value).success).toBe(false),
  );
});
