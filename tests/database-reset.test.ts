import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import mysql from 'mysql2/promise';
import type { Server } from 'node:http';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { testDatabaseUrl } from './database-safety';

describe.skipIf(!process.env.TEST_DATABASE_URL)('guarded entire-database reset', () => {
  const database = `qa_${randomUUID().replaceAll('-', '')}_test`,
    password = 'QA-Owner-Password-2026',
    csrf = randomUUID();
  let root: mysql.Connection,
    sql: mysql.Connection,
    pool: any,
    server: Server,
    base: string,
    reset: any,
    ctx: any;
  let owner: any, ordinary: any, gp: any, originalHash: string;
  const tokens = { owner: randomUUID(), ordinary: randomUUID(), gp: randomUUID() };
  const payload = {
    confirmationPhrase: 'RESET ALL CLINIC DATA',
    currentPassword: password,
    acknowledge: true,
  };
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    token = tokens.owner,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/api${path}`, {
      method,
      headers: {
        Cookie: `cms_session=${token}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrf,
        Origin: 'http://reset.example.invalid',
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const rows = async (query: string, values: any[] = []) =>
    (await sql.query(query, values))[0] as any[];
  const fingerprint = async () => {
    const { RESET_TABLES } = await import('../src/server/database-reset');
    const result: Record<string, unknown> = {};
    for (const table of RESET_TABLES) result[table] = await rows(`SELECT * FROM \`${table}\``);
    return result;
  };
  beforeAll(async () => {
    const url = new URL(testDatabaseUrl());
    root = await mysql.createConnection(url.toString());
    await root.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    url.pathname = '/' + database;
    process.env.DATABASE_URL = url.toString();
    process.env.BOOTSTRAP_EMAIL = 'reset-owner@example.invalid';
    process.env.BOOTSTRAP_PASSWORD = 'QA-Restore-Password-2026';
    process.env.CLINIC_NAME = 'QA Reset Clinic';
    process.env.APP_ORIGIN = 'http://reset.example.invalid';
    process.env.DOCUMENT_SIGNING_KEY = 'QA-reset-document-signing-key-long-enough';
    sql = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
    await (await import('../src/server/db/migrate')).migrate();
    pool = (await import('../src/server/db')).pool;
    originalHash = await (await import('../src/server/security')).hashPassword(password);
    const seed = async (role: string, email: string, superAdmin = false) => {
      const [t]: any = await sql.query('INSERT INTO tenants(name) VALUES(?)', [
        'QA Tenant ' + role,
      ]);
      const [b]: any = await sql.query(
        'INSERT INTO branches(tenant_id,name,address) VALUES(?,?,?)',
        [t.insertId, 'QA Branch', 'QA Address'],
      );
      const [u]: any = await sql.query(
        'INSERT INTO users(tenant_id,branch_id,email,name,password_hash,role,is_super_admin,license_number) VALUES(?,?,?,?,?,?,?,?)',
        [
          t.insertId,
          b.insertId,
          email,
          'QA ' + role,
          originalHash,
          role,
          superAdmin,
          role === 'DOCTOR' ? 'QA-LICENSE' : null,
        ],
      );
      await sql.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [
        u.insertId,
        b.insertId,
      ]);
      return {
        id: u.insertId,
        tenantId: t.insertId,
        branchId: b.insertId,
        name: 'QA ' + role,
        email,
        role,
        licenseNumber: null,
        isSuperAdmin: superAdmin,
      };
    };
    owner = await seed('ADMIN', 'reset-owner@example.invalid', true);
    ordinary = await seed('ADMIN', 'ordinary@example.invalid');
    gp = await seed('DOCTOR', 'gp-reset@example.invalid');
    for (const key of ['owner', 'ordinary', 'gp'] as const)
      await sql.query(
        'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
        [
          createHash('sha256').update(tokens[key]).digest('hex'),
          { owner, ordinary, gp }[key].id,
          csrf,
          '2035-01-01',
        ],
      );
    ctx = { actor: owner, branchId: owner.branchId, requestId: 'QA-reset', csrfToken: csrf };
    // Historical signed records in multiple tenants verify the explicitly authorized global reset scope.
    for (const actor of [owner, ordinary]) {
      const [p]: any = await sql.query(
        'INSERT INTO patients(tenant_id,branch_id,name,national_id,date_of_birth,sex) VALUES(?,?,?,?,?,?)',
        [
          actor.tenantId,
          actor.branchId,
          'QA Historical Patient',
          randomUUID(),
          '1990-01-01',
          'OTHER',
        ],
      );
      await sql.query(
        "INSERT INTO encounters(tenant_id,branch_id,patient_id,practitioner_id,subjective,objective,assessment,plan,procedure_notes,status,signed_at) VALUES(?,?,?,?,'QA','QA','QA Signed History','QA','QA','SIGNED',UTC_TIMESTAMP(3))",
        [actor.tenantId, actor.branchId, p.insertId, actor.id],
      );
    }
    reset = new (await import('../src/server/database-reset')).DatabaseResetService();
    server = (await import('../src/server/app')).createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  }, 30000);
  afterAll(async () => {
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    if (pool) await pool.end();
    if (sql) await sql.end();
    if (root) {
      if (!/^qa_[a-f0-9]{32}_test$/.test(database)) throw new Error('Unsafe cleanup target');
      await root.query(`DROP DATABASE \`${database}\``);
      await root.end();
    }
  });
  it('denies ordinary staff and unsafe confirmations without changing any table', async () => {
    const before = await fingerprint();
    expect(
      (await request('/admin/database-reset/preview', 'GET', undefined, tokens.ordinary)).status,
    ).toBe(403);
    expect((await request('/admin/database-reset', 'POST', payload, tokens.ordinary)).status).toBe(
      403,
    );
    expect((await request('/admin/database-reset', 'POST', payload, tokens.gp)).status).toBe(403);
    expect(
      (
        await request('/admin/database-reset', 'POST', payload, tokens.owner, {
          'X-CSRF-Token': 'wrong',
        })
      ).status,
    ).toBe(403);
    expect(
      (await request('/admin/database-reset', 'POST', { ...payload, confirmationPhrase: 'reset' }))
        .status,
    ).toBe(400);
    expect(
      (await request('/admin/database-reset', 'POST', { ...payload, acknowledge: false })).status,
    ).toBe(400);
    expect(
      (
        await request('/admin/database-reset', 'POST', {
          ...payload,
          currentPassword: 'wrong-password',
        })
      ).status,
    ).toBe(403);
    expect(await fingerprint()).toEqual(before);
    const preview = await (await request('/admin/database-reset/preview')).json();
    expect(preview.scope).toBe('ENTIRE_DATABASE');
    expect(preview.counts.find((v: any) => v.table === 'encounters').rowCount).toBe(2);
    expect(preview.defaults.administratorEmail).toBe('reset-owner@example.invalid');
    expect(JSON.stringify(preview)).not.toContain('QA-Restore-Password');
    expect(
      (
        await request('/admin/users', 'POST', {
          email: 'invalid-flag@example.invalid',
          name: 'QA Invalid privilege',
          role: 'ADMIN',
          branchId: owner.branchId,
          password,
          isSuperAdmin: true,
        })
      ).status,
    ).toBe(400);
  });
  it('rejects unknown schema and invalid defaults, and rolls back a failure after default recreation starts', async () => {
    const before = await fingerprint();
    await sql.query('CREATE TABLE unexpected_records(id BIGINT PRIMARY KEY) ENGINE=InnoDB');
    try {
      await expect(reset.reset(ctx, payload)).rejects.toMatchObject({
        code: 'RESET_SCHEMA_MISMATCH',
      });
    } finally {
      await sql.query('DROP TABLE unexpected_records');
    }
    const original = process.env.BOOTSTRAP_PASSWORD;
    process.env.BOOTSTRAP_PASSWORD = 'short';
    try {
      await expect(reset.reset(ctx, payload)).rejects.toThrow();
    } finally {
      process.env.BOOTSTRAP_PASSWORD = original;
    }
    const failing = new (await import('../src/server/database-reset')).DatabaseResetService(
      pool,
      (await import('../src/server/db')).transaction,
      async (db: any) => {
        await db.query('INSERT INTO tenants(name) VALUES($1)', ['QA Failure Tenant']);
        throw new Error('QA injected bootstrap failure');
      },
    );
    await expect(failing.reset(ctx, payload)).rejects.toThrow('QA injected bootstrap failure');
    expect(await fingerprint()).toEqual(before);
  });
  it('grants capability only through the explicit operator CLI without resetting records', async () => {
    const { grantSuperAdmin } = await import('../src/server/db/grant-super-admin');
    await expect(grantSuperAdmin(['--bootstrap'])).rejects.toThrow('GRANT SUPER ADMIN');
    const original = process.env.BOOTSTRAP_EMAIL;
    process.env.BOOTSTRAP_EMAIL = ordinary.email;
    try {
      await grantSuperAdmin(['--bootstrap', '--confirm', 'GRANT SUPER ADMIN']);
      expect(
        (await rows('SELECT is_super_admin FROM users WHERE id=?', [ordinary.id]))[0]
          .is_super_admin,
      ).toBe(1);
    } finally {
      process.env.BOOTSTRAP_EMAIL = original;
      await sql.query('UPDATE users SET is_super_admin=FALSE WHERE id=?', [ordinary.id]);
    }
    expect(await rows('SELECT id FROM encounters')).toHaveLength(2);
  });
  it('atomically clears all tenants, preserves migrations and monotonic IDs, and recreates only default SuperAdmin', async () => {
    const metadata = await rows('SELECT * FROM schema_migrations ORDER BY name'),
      maxTenant = Math.max(owner.tenantId, ordinary.tenantId, gp.tenantId),
      maxUser = Math.max(owner.id, ordinary.id, gp.id);
    const response = await request('/admin/database-reset', 'POST', payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      requiresLogin: true,
      bootstrapEmail: 'reset-owner@example.invalid',
    });
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await rows('SELECT * FROM schema_migrations ORDER BY name')).toEqual(metadata);
    const users = await rows(
      'SELECT id,tenant_id,branch_id,email,role,is_super_admin,password_hash FROM users',
    );
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      email: 'reset-owner@example.invalid',
      role: 'ADMIN',
      is_super_admin: 1,
    });
    expect(users[0].id).toBeGreaterThan(maxUser);
    expect(users[0].tenant_id).toBeGreaterThan(maxTenant);
    expect(
      await (
        await import('../src/server/security')
      ).verifyPassword('QA-Restore-Password-2026', users[0].password_hash),
    ).toBe(true);
    const { RESET_TABLES } = await import('../src/server/database-reset');
    for (const table of RESET_TABLES)
      if (!['tenants', 'branches', 'users', 'user_branches', 'rooms', 'audit_logs'].includes(table))
        expect(await rows(`SELECT COUNT(*) n FROM \`${table}\``)).toEqual([{ n: 0 }]);
    expect(await rows('SELECT name FROM rooms ORDER BY id')).toEqual([
      { name: 'Room 01' },
      { name: 'Room 02' },
      { name: 'Treatment Room' },
    ]);
    const audit = await rows('SELECT action,actor_id,metadata FROM audit_logs');
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('DATABASE_RESET');
    expect(audit[0].actor_id).toBe(users[0].id);
    expect((await request('/bootstrap')).status).toBe(401);
    // An authenticated request captured before reset cannot target newly allocated entities through old IDs.
    expect(await rows('SELECT id FROM users WHERE id=?', [owner.id])).toHaveLength(0);
  }, 15000);
});
