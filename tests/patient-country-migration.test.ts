import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database-safety';

describe.skipIf(!process.env.TEST_DATABASE_URL)('patient country migration preservation', () => {
  it('backfills only explicit Malaysian nationality and preserves patient IDs and unknown historical countries', async () => {
    const url = new URL(testDatabaseUrl()),
      database = 'qa_' + randomUUID().replaceAll('-', '') + '_test';
    const admin = await mysql.createConnection(url.toString());
    let db: mysql.Connection | undefined;
    try {
      await admin.query(
        'CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
      );
      url.pathname = '/' + database;
      db = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
      await db.query(
        "CREATE TABLE patients(id BIGINT PRIMARY KEY, name VARCHAR(200), nationality VARCHAR(30)); INSERT INTO patients VALUES(1,'Fictional local','MALAYSIAN'),(2,'Fictional overseas','NON_MALAYSIAN'),(3,'Fictional legacy',NULL)",
      );
      await db.query(
        await readFile(
          new URL('../db/migrations/016_patient_country.sql', import.meta.url),
          'utf8',
        ),
      );
      expect((await db.query('SELECT * FROM patients ORDER BY id'))[0]).toEqual([
        { id: 1, name: 'Fictional local', nationality: 'MALAYSIAN', country_code: 'MY' },
        { id: 2, name: 'Fictional overseas', nationality: 'NON_MALAYSIAN', country_code: null },
        { id: 3, name: 'Fictional legacy', nationality: null, country_code: null },
      ]);
      await expect(db.query("UPDATE patients SET country_code='sg' WHERE id=2")).rejects.toThrow();
      await db.query("UPDATE patients SET country_code='SG' WHERE id=2");
    } finally {
      await db?.end();
      try {
        if (!/^qa_[a-f0-9]{32}_test$/.test(database)) throw new Error('Unsafe cleanup target');
        await admin.query('DROP DATABASE `' + database + '`');
      } finally {
        await admin.end();
      }
    }
  });
});
