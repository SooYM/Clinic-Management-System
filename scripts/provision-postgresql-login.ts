import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";

loadEnvConfig(process.cwd());
const { hashPostgresPassword } = await import("../lib/server/postgres-auth");
if (!process.argv.includes("--import-local-staff")) {
  throw new Error("Pass --import-local-staff to migrate existing local login credentials only.");
}
if (!process.env.DATABASE_URL) throw new Error("Configure DATABASE_URL before provisioning PostgreSQL logins.");
const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
const database = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/clinic-database.json"), "utf8")) as {
  staff: Array<{ auth_user_id: string; username: string; email: string; password: string }>;
};
let migrated = 0;
let skipped = 0;
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const account of database.staff) {
      const result = await client.query<{ auth_user_id: string }>(
        `SELECT DISTINCT s.auth_user_id FROM public.staff_members s JOIN auth.users u ON u.id = s.auth_user_id
         WHERE s.auth_user_id = $1 OR lower(u.email) = $2`,
        [account.auth_user_id, account.email.trim().toLowerCase()],
      );
      if (result.rows.length !== 1 || !account.password) { skipped++; continue; }
      const passwordHash = await hashPostgresPassword(account.password);
      const inserted = await client.query(
        `INSERT INTO clinic_auth.credentials (auth_user_id, identifier, password_hash) VALUES ($1, $2, $3)
         ON CONFLICT (auth_user_id) DO NOTHING`,
        [result.rows[0].auth_user_id, account.username.trim().toLowerCase(), passwordHash],
      );
      migrated += inserted.rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  console.log(JSON.stringify({ migratedLogins: migrated, skippedUnmatchedLogins: skipped }));
} finally { await pool.end(); }
