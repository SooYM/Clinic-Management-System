import { expirePublicRegistrations } from './public-registration-service.js';
import 'dotenv/config';
import { createApp } from './app.js';
import { pool } from './db.js';
import { validateDeploymentConfig } from './deployment-config.js';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const config = validateDeploymentConfig(process.env);
await pool.query('SELECT 1');
if (process.env.NODE_ENV === 'production') {
  if (!existsSync(join(process.cwd(), 'dist/index.html')))
    throw new Error('Production frontend build is missing. Run npm run build.');
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  );
  const pending = readdirSync(join(process.cwd(), 'db/migrations')).filter(
    (name) => name.endsWith('.sql') && !applied.has(name),
  );
  if (pending.length)
    throw new Error(`Apply pending database migrations before starting API: ${pending.join(', ')}`);
}
// Expired anonymous form payloads are removed even when nobody opens a registration page.
let expiryRunning = false;
async function cleanupRegistrationPayloads() {
  if (expiryRunning) return;
  expiryRunning = true;
  try {
    await expirePublicRegistrations();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'registration_expiry_failed',
        code: (error as { code?: string }).code || 'INTERNAL',
      }),
    );
  } finally {
    expiryRunning = false;
  }
}
await cleanupRegistrationPayloads();
const registrationExpiryTimer = setInterval(
  () => void cleanupRegistrationPayloads(),
  5 * 60 * 1000,
);
registrationExpiryTimer.unref();
const server = createApp().listen(config.port, config.host, () =>
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'server_started',
      port: config.port,
    }),
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(registrationExpiryTimer);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
