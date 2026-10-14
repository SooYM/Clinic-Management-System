import 'dotenv/config';
import { transaction, pool } from '../db.js';
import { hashPassword } from '../security.js';
import { bootstrapConfiguration, createBootstrapDefaults } from './bootstrap-defaults.js';
export async function bootstrap() {
  const configuration = bootstrapConfiguration();
  const hash = await hashPassword(configuration.password);
  return transaction(async (db) => {
    const existing = await db.query('SELECT id FROM users LIMIT 1');
    if (existing.rowCount) throw new Error('Bootstrap requires empty users table.');
    const result = await createBootstrapDefaults(db, configuration.defaults, hash);
    console.log('Clinic and administrator created. Credentials were not logged.');
    return result;
  });
}
if (process.argv[1]?.endsWith('bootstrap.ts'))
  bootstrap()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error(e.message);
      await pool.end();
      process.exitCode = 1;
    });
