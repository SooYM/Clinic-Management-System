import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { createServer, type RequestListener, type Server } from 'node:http';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { afterAll } from 'vitest';

const closingLogs: Promise<void>[] = [];
afterAll(async () => {
  await Promise.all(closingLogs);
});

/** Fixed, reserved listeners: collisions fail instead of silently choosing another port. */
export const testPorts = {
  main: 3110,
  settings: 3111,
  legacy: 3112,
  reset: 3113,
  demo: 3114,
} as const;

export async function startTestServer(handler: RequestListener, service: keyof typeof testPorts) {
  const port = testPorts[service];
  const registry = join(homedir(), '.codex', 'harness', 'ports.json');
  if (existsSync(registry)) {
    const { reservations } = JSON.parse(readFileSync(registry, 'utf8'));
    const matches = reservations.filter(
      (entry: { port: number; status: string }) =>
        entry.port === port && entry.status === 'reserved',
    );
    const reservation = matches[0];
    const normalized = (path: string) => {
      const absolute = resolve(path);
      return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
    };
    if (
      matches.length !== 1 ||
      reservation.owner !== 'clinic' ||
      reservation.service !== `qa-${service}` ||
      typeof reservation.projectPath !== 'string' ||
      normalized(reservation.projectPath) !== normalized(process.cwd())
    )
      throw new Error(`QA port ${port} lacks a unique matching Clinic reservation.`);
  }
  const localDirectory = join(process.cwd(), '.local');
  mkdirSync(localDirectory, { recursive: true });
  const logs = [join(localDirectory, 'port-events.jsonl')];
  const globalLog = join(homedir(), '.codex', 'harness', 'port-events.jsonl');
  if (existsSync(globalLog)) logs.push(globalLog);
  const record = async (event: string, code?: string) => {
    const entry = JSON.stringify({
      at: new Date().toISOString(),
      event,
      owner: 'clinic',
      service: `qa-${service}`,
      port,
      host: '127.0.0.1',
      processId: process.pid,
      projectPath: process.cwd(),
      ...(code ? { code } : {}),
    });
    for (const log of logs) {
      for (let attempt = 0; ; attempt++) {
        try {
          await appendFile(log, entry + '\n');
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (attempt === 19 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error;
          await setImmediate();
        }
      }
    }
  };
  const server = createServer(handler);
  server.once('close', () => closingLogs.push(record('closed')));
  await record('listen-start');
  return new Promise<Server>((resolve, reject) => {
    const failed = (error: NodeJS.ErrnoException) => {
      record('listen-failed', error.code).then(() => reject(error), reject);
    };
    server.once('error', failed);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', failed);
      record('listening').then(
        () => resolve(server),
        (error) => {
          server.close(() => reject(error));
        },
      );
    });
  });
}
