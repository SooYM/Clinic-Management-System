import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database-safety';

describe('integration database safety', () => {
  it.each([
    'mysql://localhost/clinic',
    'mysql://localhost/mysql',
    'mysql://localhost/contest',
    'https://localhost/clinic_test',
    'postgres://localhost/clinic_test',
  ])('rejects unsafe URL %s', (url) => {
    expect(() => testDatabaseUrl(url)).toThrow();
  });
  it.each(['mysql://localhost/clinic_test', 'mysql://localhost/test_clinic'])(
    'accepts explicitly isolated URL %s',
    (url) => {
      expect(testDatabaseUrl(url)).toBe(url);
    },
  );
  it('rejects absent configuration without consulting DATABASE_URL', () => {
    const previous = process.env.TEST_DATABASE_URL;
    delete process.env.TEST_DATABASE_URL;
    try {
      expect(() => testDatabaseUrl()).toThrow('TEST_DATABASE_URL is required');
    } finally {
      if (previous !== undefined) process.env.TEST_DATABASE_URL = previous;
    }
  });
});
