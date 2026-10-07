import 'dotenv/config';
import { transaction, pool } from '../db.js';
import { hashPassword } from '../security.js';
import { PASSWORD_MIN_LENGTH } from '../../shared/password-policy.js';
export async function bootstrap() {
  const email = process.env.BOOTSTRAP_EMAIL,
    password = process.env.BOOTSTRAP_PASSWORD;
  if (!email || !password || password.length < PASSWORD_MIN_LENGTH)
    throw new Error(
      `Set BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD (at least ${PASSWORD_MIN_LENGTH} characters).`,
    );
  const hash = await hashPassword(password);
  return transaction(async (db) => {
    const existing = await db.query('SELECT id FROM users LIMIT 1');
    if (existing.rowCount) throw new Error('Bootstrap requires empty users table.');
    const tenantId = (
      await db.query('INSERT INTO tenants(name) VALUES($1)', [
        process.env.CLINIC_NAME || 'Meridian Clinic',
      ])
    ).insertId!;
    const branchId = (
      await db.query('INSERT INTO branches(tenant_id,name,address) VALUES($1,$2,$3)', [
        tenantId,
        'Main Branch',
        'Kuala Lumpur, Malaysia',
      ])
    ).insertId!;
    const id = (
      await db.query(
        "INSERT INTO users(tenant_id,branch_id,email,name,password_hash,role) VALUES($1,$2,$3,$4,$5,'ADMIN')",
        [tenantId, branchId, email.toLowerCase(), 'Clinic Administrator', hash],
      )
    ).insertId!;
    await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES($1,$2)', [id, branchId]);
    for (const name of ['Room 01', 'Room 02', 'Treatment Room'])
      await db.query('INSERT INTO rooms(tenant_id,branch_id,name) VALUES($1,$2,$3)', [
        tenantId,
        branchId,
        name,
      ]);
    console.log('Clinic and administrator created. Credentials were not logged.');
    return { tenantId, branchId, id };
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
