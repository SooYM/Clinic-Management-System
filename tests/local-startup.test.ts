import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const directory = mkdtempSync(join(tmpdir(), 'clinic-startup-test-'));
const emptyEnv = join(directory, 'empty.env');
writeFileSync(emptyEnv, '');
const environment = {
  ...process.env,
  DOTENV_CONFIG_PATH: emptyEnv,
  CODEX_HOME: directory,
  DATABASE_URL: 'mysql://test:fixture@127.0.0.1:3310/clinic_test',
  PORT: '3101',
  APP_ORIGIN: 'http://127.0.0.1:3100',
  PUBLIC_URL: 'http://127.0.0.1:3100',
  DB_VIEWER_DATABASE_URL: '',
  DB_VIEWER_PORT: '3102',
  VITE_API_TARGET: '',
  NODE_ENV: 'development',
};
function check(overrides: NodeJS.ProcessEnv = {}) {
  return spawnSync(process.execPath, ['scripts/check-local-config.mjs'], {
    env: { ...environment, ...overrides },
    encoding: 'utf8',
    timeout: 10000,
  });
}
afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe('local startup reservations', () => {
  it('checks configuration without requiring or starting a database', () => {
    expect(check().status).toBe(0);
  });
  it('rejects Progress Tracker API port without exposing database credentials', () => {
    const result = check({ PORT: '3001' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('3101');
    expect(result.stderr).not.toContain('fixture');
  });
  it('rejects stale database, viewer and origin configuration', () => {
    for (const overrides of [
      { DATABASE_URL: 'mysql://test:fixture@127.0.0.1:33079/clinic_test' },
      { DB_VIEWER_DATABASE_URL: 'mysql://test:fixture@127.0.0.1:33079/clinic_test' },
      { APP_ORIGIN: 'http://127.0.0.1:5173' },
      { VITE_API_TARGET: 'http://127.0.0.1:3001' },
    ])
      expect(check(overrides).status).toBe(1);
  });
  it('refuses conflicting registry ownership and accepts matching reservations', () => {
    const harness = join(directory, 'harness');
    mkdirSync(harness);
    const reservations = Object.entries({
      web: 3100,
      api: 3101,
      mysql: 3310,
      viewer: 3102,
      demo: 3103,
    }).map(([service, port]) => ({
      owner: 'clinic',
      service,
      port,
      status: 'reserved',
      projectPath: process.cwd(),
    }));
    const file = join(harness, 'ports.json');
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, reservations }));
    expect(check().status).toBe(0);
    reservations[0].owner = 'another-app';
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, reservations }));
    expect(check().status).toBe(1);
  });
});
