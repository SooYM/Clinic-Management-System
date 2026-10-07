import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { migrationChecksums } from '../src/server/db/migration-checksum';
const hash = (source: string, helper = '') =>
  createHash('sha256').update(source).update(helper).digest('hex');
const sql = 'CREATE TABLE fixture(id BIGINT);\n-- SQL comment\n';
const helper = 'export function migrate() {\n  return 1;\n}\n';
const crlf = (value: string) => value.replace(/\n/g, '\r\n');
describe('portable immutable migration checksums', () => {
  it('uses identical canonical hash for Windows and Linux SQL', () => {
    expect(migrationChecksums(crlf(sql)).canonical).toBe(migrationChecksums(sql).canonical);
    expect(migrationChecksums(sql).canonical).toBe(hash(sql));
  });
  it('accepts every legacy SQL and helper newline combination', () => {
    const checksums = migrationChecksums(sql, helper);
    for (const source of [sql, crlf(sql)])
      for (const implementation of [helper, crlf(helper)])
        expect(checksums.candidates.has(hash(source, implementation))).toBe(true);
    expect(migrationChecksums(crlf(sql), crlf(helper)).canonical).toBe(hash(sql, helper));
  });
  it('retains exact legacy mixed-newline candidates without changing canonical identity', () => {
    const mixedSql = sql.replace(');\n', ');\r\n'),
      mixedHelper = helper.replace('1;\n', '1;\r\n');
    const checksums = migrationChecksums(mixedSql, mixedHelper);
    expect(checksums.candidates.has(hash(mixedSql, mixedHelper))).toBe(true);
    expect(checksums.canonical).toBe(hash(sql, helper));
  });
  it('rejects SQL content edits despite newline portability', () => {
    const changed = migrationChecksums(sql.replace('BIGINT', 'VARCHAR(100)'), helper);
    for (const old of migrationChecksums(sql, helper).candidates)
      expect(changed.candidates.has(old)).toBe(false);
  });
  it('rejects numeric helper content edits as an applied migration change', () => {
    const changed = migrationChecksums(sql, helper.replace('return 1', 'return 2'));
    for (const old of migrationChecksums(sql, helper).candidates)
      expect(changed.candidates.has(old)).toBe(false);
  });
});
