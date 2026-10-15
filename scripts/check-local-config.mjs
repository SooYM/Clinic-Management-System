import 'dotenv/config';
import mysql from 'mysql2/promise';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Never print connection URLs or credentials in startup diagnostics.
try {
  const registryFile = join(
    process.env.CODEX_HOME || join(homedir(), '.codex'),
    'harness',
    'ports.json',
  );
  if (existsSync(registryFile)) {
    const registry = JSON.parse(readFileSync(registryFile, 'utf8').replace(/^\uFEFF/, ''));
    for (const [service, port] of Object.entries({
      web: 3100,
      api: 3101,
      mysql: 3310,
      viewer: 3102,
      demo: 3103,
    })) {
      const matches = registry.reservations?.filter((item) => item.port === port) || [];
      if (
        matches.length !== 1 ||
        matches[0].owner !== 'clinic' ||
        matches[0].service !== service ||
        matches[0].status !== 'reserved' ||
        resolve(matches[0].projectPath).toLowerCase() !== resolve(process.cwd()).toLowerCase()
      )
        throw new Error(`Global port registry does not reserve ${port} for Clinic ${service}.`);
    }
  }
  const database = new URL(process.env.DATABASE_URL || '');
  if (
    database.protocol !== 'mysql:' ||
    database.hostname !== '127.0.0.1' ||
    database.port !== '3310'
  )
    throw new Error('Local DATABASE_URL must use MySQL at 127.0.0.1:3310.');
  if ((process.env.PORT || '3101') !== '3101')
    throw new Error('Clinic API port is reserved as 3101. Update local PORT.');
  for (const name of ['APP_ORIGIN', 'PUBLIC_URL']) {
    if (process.env[name] !== 'http://127.0.0.1:3100')
      throw new Error(`${name} must be http://127.0.0.1:3100 for local startup.`);
  }
  if (process.env.VITE_API_TARGET && process.env.VITE_API_TARGET !== 'http://127.0.0.1:3101')
    throw new Error('VITE_API_TARGET must use http://127.0.0.1:3101.');
  if ((process.env.DB_VIEWER_PORT || '3102') !== '3102')
    throw new Error('Clinic database viewer port is reserved as 3102.');
  if (process.env.DB_VIEWER_DATABASE_URL) {
    const viewerDatabase = new URL(process.env.DB_VIEWER_DATABASE_URL);
    if (
      viewerDatabase.protocol !== 'mysql:' ||
      viewerDatabase.hostname !== '127.0.0.1' ||
      viewerDatabase.port !== '3310'
    )
      throw new Error('Local DB_VIEWER_DATABASE_URL must use MySQL at 127.0.0.1:3310.');
  }
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development')
    throw new Error('start.ps1 is for NODE_ENV=development only.');
  if (process.argv.includes('--database-ready') || process.argv.includes('--database-stop')) {
    const connection = await mysql.createConnection({ uri: database.href, connectTimeout: 1500 });
    try {
      const [identity] = await connection.query(
        'SELECT @@port AS port, @@datadir AS dataDirectory',
      );
      const expectedDirectory = realpathSync(
        join(process.cwd(), '.local', 'mysql-data'),
      ).toLowerCase();
      const actualDirectory = realpathSync(identity[0].dataDirectory).toLowerCase();
      if (Number(identity[0].port) !== 3310 || actualDirectory !== expectedDirectory)
        throw new Error(
          'Clinic MySQL identity does not match port 3310 and the existing project data directory.',
        );
      if (process.argv.includes('--database-stop')) await connection.query('SHUTDOWN');
    } finally {
      await connection.end().catch(() => {});
    }
  }
} catch (error) {
  console.error(
    error instanceof Error && !('code' in error)
      ? error.message
      : 'Local MySQL connection is not ready.',
  );
  process.exitCode = 1;
}
