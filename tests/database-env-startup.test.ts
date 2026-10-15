import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
const run = promisify(execFile);
/** Capture real mysql2 pool options in a clean process before any socket can open. */
async function poolConfiguration(entry: string, inheritedDatabaseUrl?: string) {
  const directoryRoot = join(process.cwd(), '.local');
  await mkdir(directoryRoot, { recursive: true });
  const directory = await mkdtemp(join(directoryRoot, 'startup-env-test-'));
  const envFile = join(directory, '.env'),
    probe = join(directory, 'probe.mjs');
  try {
    await writeFile(
      envFile,
      'DATABASE_URL=mysql://fixture:synthetic-password@127.0.0.1:3310/clinic_fixture_test\nNODE_ENV=test\n',
    );
    await writeFile(
      probe,
      `
      import mysql from 'mysql2/promise';
      const captured=new Error('QA_STOP_BEFORE_NETWORK');
      mysql.createPool=(options)=>{process.stdout.write(JSON.stringify({host:options.host,port:options.port,database:options.database}));throw captured;};
      try {await import(${JSON.stringify(pathToFileURL(join(process.cwd(), entry)).href)});process.exitCode=2;}
      catch(error) {if(error!==captured){process.stderr.write('Unexpected startup failure.');process.exitCode=1;}}
    `,
    );
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DOTENV_CONFIG_PATH: envFile,
      NODE_ENV: 'test',
    };
    delete env.DOTENV_CONFIG_OVERRIDE;
    delete env.DATABASE_URL;
    delete env.NODE_OPTIONS;
    delete env.DOTENV_KEY;
    if (inheritedDatabaseUrl) env.DATABASE_URL = inheritedDatabaseUrl;
    const { stdout } = await run(process.execPath, ['--import', 'tsx', probe], {
      cwd: process.cwd(),
      env,
      timeout: 10000,
      windowsHide: true,
    });
    return JSON.parse(stdout);
  } finally {
    await Promise.all([unlink(probe).catch(() => {}), unlink(envFile).catch(() => {})]);
    await rmdir(directory);
  }
}
describe('database environment initialization', () => {
  it.each(['src/server/index.ts', 'src/server/public-registration-service.ts', 'src/server/db.ts'])(
    'loads fixture .env before creating the MySQL pool through %s',
    async (entry) => {
      expect(await poolConfiguration(entry)).toEqual({
        host: '127.0.0.1',
        port: 3310,
        database: 'clinic_fixture_test',
      });
    },
  );
  it('preserves an explicitly supplied integration-test database instead of overriding it from .env', async () => {
    expect(
      await poolConfiguration(
        'src/server/db.ts',
        'mysql://fixture:synthetic-password@127.0.0.1:3310/explicit_fixture_test',
      ),
    ).toEqual({ host: '127.0.0.1', port: 3310, database: 'explicit_fixture_test' });
  });
});
