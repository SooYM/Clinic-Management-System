import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { rawPool } from '../db.js';
import { migrationChecksums } from './migration-checksum.js';
import { migrateNumericIds } from './numeric-ids.js';
export async function migrate() {
  const db = await rawPool.getConnection();
  try {
    const [lock]: any = await db.query("SELECT GET_LOCK('clinic_schema_migration',30) acquired");
    if (!lock[0].acquired) throw new Error('Migration lock unavailable.');
    await db.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations(name varchar(200) PRIMARY KEY,checksum char(64) NOT NULL,applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB',
    );
    const files = (await readdir(join(process.cwd(), 'db/migrations')))
      .filter((n) => n.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const source = await readFile(join(process.cwd(), 'db/migrations', file), 'utf8');
      const checksum = migrationChecksums(
        source,
        file === '009_numeric_identifiers.sql'
          ? await readFile(join(process.cwd(), 'src/server/db/numeric-ids.ts'), 'utf8')
          : '',
      );
      const [existing]: any = await db.query(
        'SELECT checksum FROM schema_migrations WHERE name=?',
        [file],
      );
      if (existing.length) {
        if (!checksum.candidates.has(existing[0].checksum))
          throw new Error(`Applied migration ${file} was modified.`);
        continue;
      }
      // MySQL DDL auto-commits. Failed initial setup must be restored/recreated before retry; never erase existing data automatically.
      if (file === '009_numeric_identifiers.sql') await migrateNumericIds(db);
      else
        for (const statement of source
          .replace(/^\s*--.*$/gm, '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean))
          await db.query(statement);
      await db.query('INSERT INTO schema_migrations(name,checksum) VALUES(?,?)', [
        file,
        checksum.canonical,
      ]);
      console.log(`Applied ${file}`);
    }
  } finally {
    await db.query("SELECT RELEASE_LOCK('clinic_schema_migration')");
    db.release();
  }
}
if (process.argv[1]?.endsWith('migrate.ts'))
  migrate()
    .then(() => rawPool.end())
    .catch(async (e) => {
      console.error(e.message);
      await rawPool.end();
      process.exitCode = 1;
    });
