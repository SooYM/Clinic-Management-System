import 'dotenv/config';
import { NotificationDispatcher } from './notifications.js';
import { pool } from './db.js';
import { validateDeploymentConfig } from './deployment-config.js';
validateDeploymentConfig(process.env);
let stopping = false;
process.on('SIGINT', () => {
  stopping = true;
});
process.on('SIGTERM', () => {
  stopping = true;
});
const dispatcher = new NotificationDispatcher();
try {
  do {
    const count = await dispatcher.runOnce();
    if (count) console.log(`Notification worker processed ${count} record(s).`);
    if (process.argv.includes('--once') || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, 15000));
  } while (!stopping);
} catch {
  console.error('Notification worker failed. Check database and provider configuration.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
