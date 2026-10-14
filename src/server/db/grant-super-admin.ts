import 'dotenv/config';
import { pool, transaction } from '../db.js';
import { bootstrapConfiguration } from './bootstrap-defaults.js';
export async function grantSuperAdmin(args: string[]) {
  if (
    args.length !== 3 ||
    args[0] !== '--bootstrap' ||
    args[1] !== '--confirm' ||
    args[2] !== 'GRANT SUPER ADMIN'
  )
    throw new Error(
      'Use --bootstrap --confirm "GRANT SUPER ADMIN". This grants capability only; it never resets data.',
    );
  const { defaults } = bootstrapConfiguration();
  await transaction(async (db) => {
    const user = (
      await db.query(
        "SELECT id,tenant_id,branch_id FROM users WHERE email=$1 AND role='ADMIN' AND active=1 FOR UPDATE",
        [defaults.administratorEmail],
      )
    ).rows[0];
    if (!user) throw new Error('Configured BOOTSTRAP_EMAIL must identify an active administrator.');
    await db.query('UPDATE users SET is_super_admin=TRUE WHERE id=$1', [user.id]);
    await db.query(
      "INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,'SUPER_ADMIN_GRANTED','user',$3,'cli-super-admin-grant',$4)",
      [user.tenant_id, user.branch_id, user.id, JSON.stringify({ source: 'operator_cli' })],
    );
  });
  console.log(
    'SuperAdmin capability granted to configured bootstrap administrator. No data was reset.',
  );
}
if (process.argv[1]?.endsWith('grant-super-admin.ts'))
  grantSuperAdmin(process.argv.slice(2))
    .then(() => pool.end())
    .catch(async (error) => {
      console.error(error.message);
      await pool.end();
      process.exitCode = 1;
    });
