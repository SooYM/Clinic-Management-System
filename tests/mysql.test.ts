import 'dotenv/config';
import { randomUUID, createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import mysql from 'mysql2/promise';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database-safety';

/** Decode actual PDFKit standard-font text streams, retaining kerning-split words. */
function pdfText(bytes: Buffer) {
  const blocks: string[] = [];
  for (const stream of bytes.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(stream[1], 'latin1')).toString('latin1');
    } catch {
      content = stream[1];
    }
    for (const text of content.matchAll(/BT([\s\S]*?)ET/g)) {
      blocks.push(
        [...text[1].matchAll(/<([a-f0-9]+)>/gi)]
          .map((chunk) => Buffer.from(chunk[1], 'hex').toString('latin1'))
          .join(''),
      );
    }
  }
  return blocks.join('\n');
}

describe.skipIf(!process.env.TEST_DATABASE_URL)('real MySQL clinic workflows', () => {
  const database = `qa_${randomUUID().replaceAll('-', '')}_test`;
  let admin: mysql.Connection, sql: mysql.Connection, service: any, applicationPool: any;
  let server: Server, baseUrl: string, legacyServer: Server, legacyBaseUrl: string;
  let fixtureSequence = 1_000_000;
  const fixtureId = () => ++fixtureSequence;
  const receptionist = 2,
    cookieToken = randomUUID(),
    csrfToken = randomUUID();
  const administrator = 3,
    adminToken = randomUUID(),
    doctorToken = randomUUID();
  const tenant = 1,
    branch = 1,
    otherBranch = 2,
    doctor = 1,
    room = 1;
  const ctx: any = {
    actor: {
      id: doctor,
      tenantId: tenant,
      branchId: branch,
      email: 'qa@example.invalid',
      name: 'QA Doctor',
      role: 'DOCTOR',
      licenseNumber: 'QA-LICENSE',
    },
    branchId: branch,
    requestId: 'qa',
    csrfToken: 'qa',
  };
  const otherCtx = { ...ctx, branchId: otherBranch };
  beforeAll(async () => {
    const base = new URL(testDatabaseUrl());
    admin = await mysql.createConnection(base.toString());
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    base.pathname = `/${database}`;
    process.env.DATABASE_URL = base.toString();
    process.env.DOCUMENT_SIGNING_KEY = 'qa-document-signing-key-at-least-32-characters';
    process.env.PHOTO_ENCRYPTION_KEY = '11'.repeat(32);
    sql = await mysql.createConnection({ uri: base.toString(), multipleStatements: true });
    const migrations = await readdir(new URL('../db/migrations/', import.meta.url));
    for (const migration of migrations.filter((name) => name.endsWith('.sql')).sort()) {
      if (migration === '009_numeric_identifiers.sql')
        await (await import('../src/server/db/numeric-ids')).migrateNumericIds(sql);
      else
        await sql.query(
          await readFile(new URL(`../db/migrations/${migration}`, import.meta.url), 'utf8'),
        );
    }
    await sql.query('INSERT INTO tenants(id,name) VALUES(?,?)', [tenant, 'QA Tenant']);
    await sql.query('INSERT INTO branches(id,tenant_id,name) VALUES(?,?,?),(?,?,?)', [
      branch,
      tenant,
      'QA Main',
      otherBranch,
      tenant,
      'QA Other',
    ]);
    await sql.query(
      'INSERT INTO users(id,tenant_id,branch_id,email,name,password_hash,role,license_number) VALUES(?,?,?,?,?,?,?,?)',
      [
        doctor,
        tenant,
        branch,
        'qa@example.invalid',
        'QA Doctor',
        'test-only',
        'DOCTOR',
        'QA-LICENSE',
      ],
    );
    await sql.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [doctor, branch]);
    await sql.query('INSERT INTO rooms(id,tenant_id,branch_id,name) VALUES(?,?,?,?)', [
      room,
      tenant,
      branch,
      'QA Room',
    ]);
    applicationPool = (await import('../src/server/db')).pool;
    service = new (await import('../src/server/service')).ClinicService();
    const password = await (
      await import('../src/server/security')
    ).hashPassword('QA-Strong-Password-2026');
    await sql.query('UPDATE users SET password_hash=? WHERE id=?', [password, doctor]);
    await sql.query(
      'INSERT INTO users(id,tenant_id,branch_id,email,name,password_hash,role) VALUES(?,?,?,?,?,?,?)',
      [
        receptionist,
        tenant,
        branch,
        'reception@example.invalid',
        'QA Reception',
        password,
        'RECEPTIONIST',
      ],
    );
    await sql.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [
      receptionist,
      branch,
    ]);
    await sql.query(
      'INSERT INTO users(id,tenant_id,branch_id,email,name,password_hash,role) VALUES(?,?,?,?,?,?,?)',
      [
        administrator,
        tenant,
        branch,
        'admin@example.invalid',
        'QA Administrator',
        password,
        'ADMIN',
      ],
    );
    await sql.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [
      administrator,
      branch,
    ]);
    await sql.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [
      administrator,
      otherBranch,
    ]);
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      [
        createHash('sha256').update(cookieToken).digest('hex'),
        receptionist,
        csrfToken,
        '2035-01-01 00:00:00',
      ],
    );
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      [
        createHash('sha256').update(adminToken).digest('hex'),
        administrator,
        csrfToken,
        '2035-01-01 00:00:00',
      ],
    );
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      [
        createHash('sha256').update(doctorToken).digest('hex'),
        doctor,
        csrfToken,
        '2035-01-01 00:00:00',
      ],
    );
    process.env.APP_ORIGIN = 'http://clinic.example.invalid';
    server = (await import('../src/server/app')).createApp().listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
    // Retained adapters are exercised only in this isolated historical test harness.
    // The deployed createApp must keep these modules retired.
    const legacyApp = express();
    legacyApp.use(express.json({ limit: '256kb' }));
    legacyApp.use((_req, res, next) => {
      res.locals.requestId = 'historical-qa';
      next();
    });
    legacyApp.use(
      '/api',
      (await import('../src/server/security')).authenticate,
      (await import('../src/server/photo-router')).photoRouter(),
      (await import('../src/server/commission-router')).commissionRouter(),
    );
    legacyApp.use((error: any, _req: any, res: any, _next: any) =>
      res
        .status(error.status || (error.name === 'ZodError' ? 400 : 500))
        .json({ error: error.message }),
    );
    legacyServer = legacyApp.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => legacyServer.once('listening', resolve));
    legacyBaseUrl = `http://127.0.0.1:${(legacyServer.address() as any).port}`;
  });
  afterAll(async () => {
    if (legacyServer) {
      legacyServer.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        legacyServer.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    if (applicationPool) await applicationPool.end();
    if (sql) await sql.end();
    if (admin) {
      try {
        if (!/^qa_[a-f0-9]{32}_test$/.test(database)) throw new Error('Unsafe cleanup target');
        await admin.query(`DROP DATABASE \`${database}\``);
      } finally {
        await admin.end();
      }
    }
  });
  const patient = (extra: any = {}) =>
    service.savePatient(ctx, {
      name: 'QA Patient',
      nationalId: randomUUID(),
      dateOfBirth: '1990-01-01',
      sex: 'OTHER',
      phone: '',
      email: '',
      bloodGroup: '',
      allergies: [],
      conditions: [],
      notificationConsent: false,
      ...extra,
    });
  const item = (extra: any = {}) =>
    service.addItem(
      { ...ctx, actor: { ...ctx.actor, id: administrator, role: 'ADMIN' } },
      {
        name: 'Paracetamol',
        sku: randomUUID(),
        ingredient: 'paracetamol',
        category: 'MEDICATION',
        unit: 'tablet',
        priceCents: 100,
        reorderLevel: 2,
        ...extra,
      },
    );
  const encounter = (patientId: number, prescriptions: any[] = [], extra: any = {}) =>
    service.saveEncounter(ctx, {
      patientId,
      specialty: 'GP',
      subjective: 'Cough',
      objective: 'Stable',
      assessment: 'QA assessment',
      plan: 'Review',
      vitals: {},
      prescriptions,
      procedureNotes: '',
      status: 'SIGNED',
      ...extra,
    });
  const rx = (itemId: number, quantity = 3) => ({
    itemId,
    quantity,
    dosage: 'One tablet daily',
    durationDays: 5,
  });
  const invoice = (patientId: number, key = randomUUID(), extra: any = {}) => ({
    patientId,
    practitionerId: doctor,
    lines: [
      { description: 'Consultation', quantity: 1, unitPriceCents: 1000, category: 'SERVICE' },
    ],
    payments: [
      { method: 'CASH', amountCents: 400, reference: '' },
      { method: 'QR', amountCents: 600, reference: 'QA' },
    ],
    idempotencyKey: key,
    ...extra,
  });
  const rows = async (query: string, values: any[] = []) =>
    (await sql.query(query, values))[0] as any[];
  const http = (
    path: string,
    method = 'GET',
    body?: any,
    extra: Record<string, string> = {},
    apiBase = baseUrl,
  ) =>
    fetch(`${apiBase}/api${path}`, {
      method,
      headers: {
        Cookie: `cms_session=${cookieToken}`,
        'Content-Type': 'application/json',
        'X-CSRF-Token': csrfToken,
        Origin: 'http://clinic.example.invalid',
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const adminHttp = (path: string, method = 'GET', body?: any) =>
    http(path, method, body, { Cookie: `cms_session=${adminToken}` });
  const legacyHttp = (
    path: string,
    method = 'GET',
    body?: any,
    extra: Record<string, string> = {},
  ) => http(path, method, body, extra, legacyBaseUrl);
  const legacyAdminHttp = (path: string, method = 'GET', body?: any) =>
    legacyHttp(path, method, body, { Cookie: `cms_session=${adminToken}` });
  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
  const photoInput = {
    stage: 'BEFORE',
    caption: 'QA synthetic image',
    consent: true,
    mimeType: 'image/png',
    dataBase64: png,
  };
  it('historical adapter: roundtrips clinical photo while database retains authenticated ciphertext', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    const response = await legacyAdminHttp(`/encounters/${e.id}/photos`, 'POST', photoInput);
    expect(response.status).toBe(201);
    const photo = await response.json();
    const stored = (
      await rows('SELECT encrypted_data,iv,auth_tag FROM clinical_photos WHERE id=?', [photo.id])
    )[0];
    expect(Buffer.isBuffer(stored.encrypted_data)).toBe(true);
    expect(stored.encrypted_data.equals(Buffer.from(png, 'base64'))).toBe(false);
    expect(stored.iv.length).toBe(12);
    expect(stored.auth_tag.length).toBe(16);
    const image = await legacyAdminHttp(`/photos/${photo.id}/image`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toContain('image/png');
    expect(Buffer.from(await image.arrayBuffer()).equals(Buffer.from(png, 'base64'))).toBe(true);
  });
  it('historical adapter: rejects reception photo upload and viewing', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    expect((await legacyHttp(`/encounters/${e.id}/photos`, 'POST', photoInput)).status).toBe(403);
    expect((await legacyHttp(`/photos/${fixtureId()}/image`)).status).toBe(403);
  });
  it('historical adapter: rejects invalid image signature and missing photo consent', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    expect(
      (
        await legacyAdminHttp(`/encounters/${e.id}/photos`, 'POST', {
          ...photoInput,
          dataBase64: Buffer.from('not an image').toString('base64'),
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await legacyAdminHttp(`/encounters/${e.id}/photos`, 'POST', {
          ...photoInput,
          consent: false,
        })
      ).status,
    ).toBe(400);
    expect((await rows('SELECT id FROM clinical_photos WHERE encounter_id=?', [e.id])).length).toBe(
      0,
    );
  });
  it('historical adapter: blocks photo lookup from another authorized branch', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    const response = await legacyAdminHttp(`/encounters/${e.id}/photos`, 'POST', photoInput);
    expect(response.status).toBe(201);
    const photo = await response.json();
    expect(
      (
        await legacyHttp(`/photos/${photo.id}/image`, 'GET', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-Branch-ID': String(otherBranch),
        })
      ).status,
    ).toBe(404);
  });
  it('historical adapter: rejects unauthenticated image disclosure', async () =>
    expect((await fetch(`${legacyBaseUrl}/api/photos/${fixtureId()}/image`)).status).toBe(401));
  it('denies reception staff administration', async () =>
    expect((await http('/admin/users')).status).toBe(403));
  it('omits password hashes from administrative listings', async () => {
    const response = await adminHttp('/admin/users');
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain('passwordHash');
  });
  it('protects administrator from self deactivation', async () => {
    const response = await adminHttp(`/admin/users/${administrator}`, 'PUT', { active: false });
    expect(response.status).toBe(409);
    expect((await rows('SELECT active FROM users WHERE id=?', [administrator]))[0].active).toBe(1);
  });
  it('rejects room creation outside tenant', async () =>
    expect(
      (
        await adminHttp('/admin/rooms', 'POST', {
          name: 'Invalid Branch Room',
          branchId: fixtureId(),
        })
      ).status,
    ).toBe(422));
  it('requires doctor registration when provisioning account', async () =>
    expect(
      (
        await adminHttp('/admin/users', 'POST', {
          name: 'No License',
          email: 'unlicensed@example.invalid',
          password: 'QA-Strong-Password-2026',
          role: 'DOCTOR',
          branchId: branch,
        })
      ).status,
    ).toBe(400));
  it('creates staff and branch assignment atomically then revokes sessions on deactivation', async () => {
    const response = await adminHttp('/admin/users', 'POST', {
      name: 'New Staff',
      email: 'newstaff@example.invalid',
      password: 'QA-Strong-Password-2026',
      role: 'NURSE',
      branchId: branch,
    });
    expect(response.status).toBe(201);
    const user = await response.json();
    expect(
      (
        await rows('SELECT user_id FROM user_branches WHERE user_id=? AND branch_id=?', [
          user.id,
          branch,
        ])
      ).length,
    ).toBe(1);
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      [randomUUID(), user.id, csrfToken, '2035-01-01 00:00:00'],
    );
    expect((await adminHttp(`/admin/users/${user.id}`, 'PUT', { active: false })).status).toBe(200);
    expect((await rows('SELECT token_hash FROM sessions WHERE user_id=?', [user.id])).length).toBe(
      0,
    );
  });
  it('enforces tenant foreign keys against direct invalid writes', async () => {
    await expect(
      sql.query('INSERT INTO rooms(id,tenant_id,branch_id,name) VALUES(?,?,?,?)', [
        fixtureId(),
        fixtureId(),
        branch,
        'Invalid Room',
      ]),
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
  });
  it('enforces stock nonnegative constraint', async () => {
    const i = await item();
    await expect(
      sql.query(
        'INSERT INTO inventory_batches(id,tenant_id,branch_id,item_id,batch_number,expires_on,quantity) VALUES(?,?,?,?,?,?,?)',
        [fixtureId(), tenant, branch, i.id, 'NEGATIVE', '2030-01-01', -1],
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });
  it('rejects null end date for MC at database boundary', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    await expect(
      sql.query(
        'INSERT INTO clinical_documents(id,tenant_id,branch_id,encounter_id,patient_id,practitioner_id,kind,document_number,payload,start_date,end_date,verification_hash,signature_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          fixtureId(),
          tenant,
          branch,
          e.id,
          p.id,
          doctor,
          'MC',
          randomUUID(),
          '{}',
          '2030-01-01',
          null,
          randomUUID(),
          'QA',
        ],
      ),
    ).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
  });
  it('rejects anonymous clinical API access', async () =>
    expect((await fetch(`${baseUrl}/api/patients`)).status).toBe(401));
  it('rejects expired session', async () => {
    const token = randomUUID();
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      [
        createHash('sha256').update(token).digest('hex'),
        receptionist,
        csrfToken,
        '2020-01-01 00:00:00',
      ],
    );
    expect(
      (await http('/patients', 'GET', undefined, { Cookie: `cms_session=${token}` })).status,
    ).toBe(401);
  });
  it('rejects unauthorized selected branch', async () =>
    expect(
      (await http('/patients', 'GET', undefined, { 'X-Branch-ID': String(otherBranch) })).status,
    ).toBe(403));
  it('rejects missing CSRF on mutations', async () =>
    expect(
      (await http('/queue', 'POST', { patientId: fixtureId() }, { 'X-CSRF-Token': '' })).status,
    ).toBe(403));
  it('rejects reception chart creation', async () =>
    expect((await http('/encounters', 'POST', { patientId: fixtureId() })).status).toBe(403));
  it('rejects active commission access after retirement', async () =>
    expect((await http('/commissions')).status).toBe(410));
  it('rejects reception clinical PDF disclosure', async () =>
    expect((await http(`/documents/${fixtureId()}/pdf`)).status).toBe(403));
  it('rejects malicious origin on authenticated writes', async () =>
    expect(
      (
        await http(
          '/queue',
          'POST',
          { patientId: fixtureId() },
          { Origin: 'https://attacker.example.invalid' },
        )
      ).status,
    ).toBe(403));
  it('rejects invalid dates at API boundary', async () =>
    expect(
      (
        await http('/patients', 'POST', {
          name: 'QA',
          nationalId: randomUUID(),
          dateOfBirth: '2026-02-31',
          sex: 'OTHER',
        })
      ).status,
    ).toBe(400));
  it('rejects malicious-origin login', async () =>
    expect(
      (
        await http(
          '/auth/login',
          'POST',
          { email: 'reception@example.invalid', password: 'QA-Strong-Password-2026' },
          { Origin: 'https://attacker.example.invalid' },
        )
      ).status,
    ).toBe(403));
  it('issues secure session attributes and CSRF on valid login', async () => {
    const response = await http('/auth/login', 'POST', {
      email: 'reception@example.invalid',
      password: 'QA-Strong-Password-2026',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).toContain('SameSite=Strict');
    expect((await response.json()).csrfToken).toBeTruthy();
  });
  it('excludes patient identity from queue display', async () => {
    const p = await patient({ name: 'PRIVATE PATIENT NAME' });
    await service.checkIn(ctx, { patientId: p.id, priority: 'NORMAL' });
    const response = await http('/queue/display');
    expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('PRIVATE PATIENT NAME');
    expect(body).not.toContain('patientId');
    expect(body).not.toContain('nationalId');
  });
  it('prevents cross-branch patient access', async () => {
    const p = await patient();
    await expect(service.getPatient(otherCtx, p.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('rejects stale demographic edits', async () => {
    const p = await patient();
    const input = {
      name: p.name,
      nationalId: p.nationalId,
      dateOfBirth: p.dateOfBirth,
      sex: p.sex,
      version: p.version,
    };
    await service.savePatient(ctx, input, p.id);
    await expect(service.savePatient(ctx, input, p.id)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
  });
  it('serializes concurrent overlapping bookings', async () => {
    const p = await patient();
    const request = {
      patientId: p.id,
      practitionerId: doctor,
      roomId: room,
      startsAt: '2030-01-01T10:00:00Z',
      endsAt: '2030-01-01T11:00:00Z',
      reason: 'QA',
    };
    const results = await Promise.allSettled([
      service.schedule(ctx, request),
      service.schedule(ctx, request),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('allows adjacent appointments and returns UTC timestamps', async () => {
    const p = await patient();
    const booked = await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      roomId: room,
      startsAt: '2030-01-01T11:00:00Z',
      endsAt: '2030-01-01T12:00:00Z',
      reason: 'QA',
    });
    expect(booked.id).toBeTruthy();
    expect(booked.startsAt).toBe('2030-01-01T11:00:00.000Z');
  });
  it('cancels appointment and frees its slot', async () => {
    const p = await patient();
    const input = {
      patientId: p.id,
      practitionerId: doctor,
      startsAt: '2030-01-05T10:00:00Z',
      endsAt: '2030-01-05T11:00:00Z',
      reason: 'QA',
    };
    const booked = await service.schedule(ctx, input);
    const cancelled = await service.cancelAppointment(ctx, booked.id, booked.version);
    expect(cancelled.status).toBe('CANCELLED');
    expect((await service.schedule(ctx, input)).id).not.toBe(booked.id);
    await expect(service.cancelAppointment(ctx, booked.id, booked.version)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    });
  });
  it('rejects duplicate active check-in', async () => {
    const p = await patient();
    await service.checkIn(ctx, { patientId: p.id, priority: 'NORMAL' });
    await expect(
      service.checkIn(ctx, { patientId: p.id, priority: 'NORMAL' }),
    ).rejects.toBeTruthy();
  });
  it('assigns distinct ticket numbers to concurrent different patients', async () => {
    const a = await patient(),
      b = await patient();
    const tickets = await Promise.all([
      service.checkIn(ctx, { patientId: a.id, priority: 'NORMAL' }),
      service.checkIn(ctx, { patientId: b.id, priority: 'NORMAL' }),
    ]);
    expect(tickets[0].ticketNumber).not.toBe(tickets[1].ticketNumber);
  });
  it('enforces queue lifecycle and room allocation', async () => {
    const p = await patient();
    const q = await service.checkIn(ctx, { patientId: p.id, priority: 'NORMAL' });
    await expect(
      service.transitionQueue(ctx, q.id, { version: q.version, status: 'COMPLETED' }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    const triage = await service.transitionQueue(ctx, q.id, {
      version: q.version,
      status: 'TRIAGE_WAITING',
    });
    const called = await service.transitionQueue(ctx, q.id, {
      version: triage.version,
      status: 'CALLED_TO_ROOM',
      roomId: room,
      practitionerId: doctor,
    });
    expect(called.roomId).toBe(room);
  });
  it('blocks allergy conflicts before chart commit', async () => {
    const p = await patient({ allergies: ['penicillin'] });
    const i = await item({ ingredient: 'penicillin' });
    await expect(encounter(p.id, [rx(i.id)])).rejects.toMatchObject({ code: 'ALLERGY_CONFLICT' });
    expect((await rows('SELECT id FROM encounters WHERE patient_id=?', [p.id])).length).toBe(0);
  });
  it('keeps signed encounter immutable', async () => {
    const p = await patient();
    const e = await encounter(p.id);
    await expect(
      service.saveEncounter(
        ctx,
        {
          patientId: p.id,
          assessment: 'Changed',
          prescriptions: [],
          status: 'SIGNED',
          version: e.version,
        },
        e.id,
      ),
    ).rejects.toMatchObject({ code: 'ENCOUNTER_SIGNED' });
  });
  it('dispenses FEFO and retries without double depletion', async () => {
    const p = await patient(),
      i = await item();
    const early = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'EARLY',
      expiresOn: '2030-01-01',
      quantity: 2,
    });
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'LATE',
      expiresOn: '2031-01-01',
      quantity: 4,
    });
    const e = await encounter(p.id, [rx(i.id)]),
      key = randomUUID();
    const d = await service.dispense(ctx, { encounterId: e.id, idempotencyKey: key });
    expect(d.allocations[0].batchId).toBe(early.id);
    await service.dispense(ctx, { encounterId: e.id, idempotencyKey: key });
    expect(
      Number(
        (await rows('SELECT SUM(quantity) n FROM inventory_batches WHERE item_id=?', [i.id]))[0].n,
      ),
    ).toBe(3);
  });
  it('refuses expired inventory and keeps its quantity intact', async () => {
    const p = await patient(),
      i = await item();
    await sql.query(
      'INSERT INTO inventory_batches(id,tenant_id,branch_id,item_id,batch_number,expires_on,quantity) VALUES(?,?,?,?,?,?,?)',
      [fixtureId(), tenant, branch, i.id, 'EXPIRED', '2020-01-01', 10],
    );
    await expect(encounter(p.id, [rx(i.id)])).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    // Historical signed charts predate reservations and still require safe dispensing.
    const e = await encounter(p.id, [rx(i.id)], { status: 'DRAFT' });
    await sql.query("UPDATE encounters SET status='SIGNED',signed_at=NOW() WHERE id=?", [e.id]);
    await expect(
      service.dispense(ctx, { encounterId: e.id, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(
      Number(
        (await rows('SELECT SUM(quantity) n FROM inventory_batches WHERE item_id=?', [i.id]))[0].n,
      ),
    ).toBe(10);
  });
  it('rolls back all stock when one prescription is unavailable', async () => {
    const p = await patient(),
      a = await item(),
      b = await item();
    await service.receiveBatch(ctx, {
      itemId: a.id,
      batchNumber: 'STOCK',
      expiresOn: '2030-01-01',
      quantity: 5,
    });
    const batchB = await service.receiveBatch(ctx, {
      itemId: b.id,
      batchNumber: 'B-TO-EXPIRE',
      expiresOn: '2030-01-01',
      quantity: 3,
    });
    const e = await encounter(p.id, [rx(a.id), rx(b.id)]);
    await sql.query("UPDATE inventory_batches SET expires_on='2020-01-01' WHERE id=?", [batchB.id]);
    await expect(
      service.dispense(ctx, { encounterId: e.id, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(
      Number(
        (await rows('SELECT SUM(quantity) n FROM inventory_batches WHERE item_id=?', [a.id]))[0].n,
      ),
    ).toBe(5);
    expect((await rows('SELECT id FROM dispenses WHERE encounter_id=?', [e.id])).length).toBe(0);
  });
  it('serializes competing dispenses for final stock', async () => {
    const p = await patient(),
      i = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'LAST',
      expiresOn: '2030-01-01',
      quantity: 3,
    });
    // Imported historical signed prescriptions have no reservation rows.
    const first = await encounter(p.id, [rx(i.id)], { status: 'DRAFT' }),
      second = await encounter(p.id, [rx(i.id)], { status: 'DRAFT' });
    await sql.query("UPDATE encounters SET status='SIGNED',signed_at=NOW() WHERE id IN (?,?)", [
      first.id,
      second.id,
    ]);
    const results = await Promise.allSettled([
      service.dispense(ctx, { encounterId: first.id, idempotencyKey: randomUUID() }),
      service.dispense(ctx, { encounterId: second.id, idempotencyKey: randomUUID() }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      Number(
        (await rows('SELECT SUM(quantity) n FROM inventory_batches WHERE item_id=?', [i.id]))[0].n,
      ),
    ).toBe(0);
  });
  it('records exact split payment once across concurrent retries', async () => {
    const p = await patient(),
      request = invoice(p.id);
    const results = await Promise.all([
      service.createInvoice(ctx, request),
      service.createInvoice(ctx, request),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect((await rows('SELECT id FROM payments WHERE invoice_id=?', [results[0].id])).length).toBe(
      2,
    );
  });
  it('rejects changed payment retry payload', async () => {
    const p = await patient(),
      request = invoice(p.id);
    await service.createInvoice(ctx, request);
    await expect(
      service.createInvoice(ctx, {
        ...request,
        lines: [{ ...request.lines[0], description: 'Changed' }],
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  });
  it('rejects tender mismatch without invoice writes', async () => {
    const p = await patient();
    await expect(
      service.createInvoice(
        ctx,
        invoice(p.id, randomUUID(), {
          payments: [{ method: 'CASH', amountCents: 999, reference: '' }],
        }),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    expect((await rows('SELECT id FROM invoices WHERE patient_id=?', [p.id])).length).toBe(0);
  });
  it('prevents concurrent overspending of deposit', async () => {
    const p = await patient();
    await service.addDeposit(ctx, { patientId: p.id, amountCents: 1000, reference: 'QA' });
    const request = () =>
      invoice(p.id, randomUUID(), {
        payments: [{ method: 'DEPOSIT', amountCents: 1000, reference: '' }],
      });
    const results = await Promise.allSettled([
      service.createInvoice(ctx, request()),
      service.createInvoice(ctx, request()),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      Number(
        (
          await rows('SELECT SUM(amount_cents) n FROM patient_deposits WHERE patient_id=?', [p.id])
        )[0].n,
      ),
    ).toBe(0);
  });
  it('allows only one final package session under concurrency', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    const pack = await service.sellPackage(ctx, {
      patientId: p.id,
      name: 'QA Package',
      totalSessions: 1,
      priceCents: 1000,
      expiresOn: '2030-01-01',
      practitionerId: doctor,
      payments: [{ method: 'CASH', amountCents: 1000, reference: '' }],
      idempotencyKey: randomUUID(),
    });
    const request = { encounterId: e.id, version: pack.version, notes: 'QA sign-off' };
    const results = await Promise.allSettled([
      service.redeemPackage(ctx, pack.id, request),
      service.redeemPackage(ctx, pack.id, request),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      Number(
        (await rows('SELECT used_sessions FROM treatment_packages WHERE id=?', [pack.id]))[0]
          .used_sessions,
      ),
    ).toBe(1);
  });
  it('rolls back package entitlement when tender does not match purchase', async () => {
    const p = await patient();
    await expect(
      service.sellPackage(ctx, {
        patientId: p.id,
        name: 'QA Package',
        totalSessions: 2,
        priceCents: 1000,
        expiresOn: '2030-01-01',
        practitionerId: doctor,
        payments: [{ method: 'CASH', amountCents: 999, reference: '' }],
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_MISMATCH' });
    expect(
      (await rows('SELECT id FROM treatment_packages WHERE patient_id=?', [p.id])).length,
    ).toBe(0);
    expect((await rows('SELECT id FROM invoices WHERE patient_id=?', [p.id])).length).toBe(0);
  });
  it('creates package invoice and entitlement only once across retries', async () => {
    const p = await patient();
    const request = {
      patientId: p.id,
      name: 'QA Package',
      totalSessions: 2,
      priceCents: 1000,
      expiresOn: '2030-01-01',
      practitionerId: doctor,
      payments: [{ method: 'CASH', amountCents: 1000, reference: '' }],
      idempotencyKey: randomUUID(),
    };
    const result = await Promise.all([
      service.sellPackage(ctx, request),
      service.sellPackage(ctx, request),
    ]);
    expect(result[0].id).toBe(result[1].id);
    expect(
      (await rows('SELECT id FROM treatment_packages WHERE patient_id=?', [p.id])).length,
    ).toBe(1);
    expect((await rows('SELECT id FROM invoices WHERE patient_id=?', [p.id])).length).toBe(1);
  });
  it('issues valid redacted MC and prevents overlap across encounters', async () => {
    const p = await patient(),
      e = await encounter(p.id),
      second = await encounter(p.id);
    const request = {
      encounterId: e.id,
      kind: 'MC',
      startDate: '2030-02-01',
      days: 2,
      diagnosisRedacted: true,
      lightDuty: false,
    };
    const results = await Promise.allSettled([
      service.issueDocument(ctx, request),
      service.issueDocument(ctx, { ...request, encounterId: second.id }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const issued = (results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>)
      .value;
    const token = issued.verificationUrl.split('/').pop();
    const verified = await service.verifyDocument(token);
    expect(verified.valid).toBe(true);
    expect(JSON.stringify(verified)).not.toContain('QA assessment');
    expect(verified).not.toHaveProperty('nationalId');
    await service.revokeDocument(ctx, issued.id, 'QA correction');
    expect((await service.verifyDocument(token)).valid).toBe(false);
  });
  it('detects tampered certificate payload', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    const issued = await service.issueDocument(ctx, {
      encounterId: e.id,
      kind: 'MC',
      startDate: '2030-03-01',
      days: 1,
      diagnosisRedacted: true,
    });
    await sql.query(
      "UPDATE clinical_documents SET payload=JSON_SET(payload,'$.assessment','Tampered') WHERE id=?",
      [issued.id],
    );
    expect((await service.verifyDocument(issued.verificationUrl.split('/').pop())).valid).toBe(
      false,
    );
  });
  it('does not enqueue notifications without consent', async () => {
    const p = await patient({ email: 'patient@example.invalid' });
    await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      startsAt: '2030-04-01T10:00:00Z',
      endsAt: '2030-04-01T11:00:00Z',
      reason: 'QA',
    });
    expect(
      (await rows('SELECT id FROM notification_outbox WHERE patient_id=?', [p.id])).length,
    ).toBe(0);
  });
  it('marks provider unconfigured without claiming message sent', async () => {
    const p = await patient({ email: 'consented@example.invalid', notificationConsent: true });
    await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      startsAt: '2030-04-02T10:00:00Z',
      endsAt: '2030-04-02T11:00:00Z',
      reason: 'QA',
    });
    const dispatcher = new (await import('../src/server/notifications')).NotificationDispatcher({
      EMAIL: {
        configured: () => false,
        send: async () => {
          throw new Error('Unconfigured provider must not run');
        },
      },
      WHATSAPP: {
        configured: () => false,
        send: async () => {
          throw new Error('Unconfigured provider must not run');
        },
      },
    });
    expect(await dispatcher.runOnce()).toBe(1);
    const record = (
      await rows('SELECT status,provider_reference FROM notification_outbox WHERE patient_id=?', [
        p.id,
      ])
    )[0];
    expect(record.status).toBe('UNCONFIGURED');
    expect(record.provider_reference).toBeNull();
  });
  it('honors withdrawn consent at outbox delivery time', async () => {
    const p = await patient({ email: 'withdrawn@example.invalid', notificationConsent: true });
    await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      startsAt: '2030-04-03T10:00:00Z',
      endsAt: '2030-04-03T11:00:00Z',
      reason: 'QA',
    });
    await sql.query('UPDATE patients SET notification_consent=0 WHERE id=?', [p.id]);
    let calls = 0;
    const channel = {
      configured: () => true,
      send: async () => {
        calls++;
        return 'unexpected';
      },
    };
    const dispatcher = new (await import('../src/server/notifications')).NotificationDispatcher({
      EMAIL: channel,
      WHATSAPP: channel,
    });
    expect(await dispatcher.runOnce()).toBe(0);
    expect(calls).toBe(0);
    expect(
      (await rows('SELECT status FROM notification_outbox WHERE patient_id=?', [p.id]))[0].status,
    ).toBe('PENDING');
  });
  it('renders escaped calendar facts with UTC times and ignores nonbooking templates', async () => {
    const { appointmentCalendar } = await import('../src/server/notifications');
    const message: any = {
      id: 1,
      channel: 'EMAIL',
      template: 'BOOKING',
      recipient: 'qa@example.invalid',
      attempts: 0,
      payload: {
        startsAt: '2030-01-01T18:00:00+08:00',
        endsAt: '2030-01-01T19:00:00+08:00',
        branchName: 'Clinic, A; B\nNew line',
        branchAddress: 'Road\\Street',
      },
    };
    const calendar = appointmentCalendar(message)!;
    expect(calendar).toContain('DTSTART:20300101T100000Z\r\n');
    expect(calendar).toContain('DTEND:20300101T110000Z\r\n');
    expect(calendar).toContain('SUMMARY:Clinic\\, A\\; B\\nNew line\r\n');
    expect(calendar).toContain('LOCATION:Road\\\\Street\r\n');
    expect(appointmentCalendar({ ...message, template: 'REFILL' })).toBeNull();
    expect(
      appointmentCalendar({ ...message, payload: { startsAt: 'bad', endsAt: 'bad' } }),
    ).toBeNull();
  });
  it('snapshots clinic practitioner and map facts in booking notification', async () => {
    const p = await patient({ email: 'booking@example.invalid', notificationConsent: true });
    await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      startsAt: '2030-04-04T10:00:00Z',
      endsAt: '2030-04-04T11:00:00Z',
      reason: 'QA',
    });
    const payload = (
      await rows('SELECT payload FROM notification_outbox WHERE patient_id=?', [p.id])
    )[0].payload;
    expect(payload.practitionerName).toBe('QA Doctor');
    expect(payload.branchName).toBe('QA Main');
    expect(payload.mapUrl).toMatch(/^https:\/\/www.google.com\/maps\//);
  });
  it('delivers booking to current consented contact rather than stale recipient', async () => {
    const p = await patient({ email: 'old@example.invalid', notificationConsent: true });
    await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      startsAt: '2030-04-05T10:00:00Z',
      endsAt: '2030-04-05T11:00:00Z',
      reason: 'QA',
    });
    await sql.query('UPDATE patients SET email=? WHERE id=?', ['current@example.invalid', p.id]);
    const recipients: string[] = [];
    const channel = {
      configured: () => true,
      send: async (message: any) => {
        recipients.push(message.recipient);
        return 'provider-accepted';
      },
    };
    const dispatcher = new (await import('../src/server/notifications')).NotificationDispatcher({
      EMAIL: channel,
      WHATSAPP: channel,
    });
    await dispatcher.runOnce();
    expect(recipients).toContain('current@example.invalid');
    expect(recipients).not.toContain('old@example.invalid');
  });
  it('deduplicates approaching alerts by branch queue rank and consent', async () => {
    const firstBranch = fixtureId(),
      secondBranch = fixtureId();
    await sql.query('INSERT INTO branches(id,tenant_id,name) VALUES(?,?,?),(?,?,?)', [
      firstBranch,
      tenant,
      'Alert A',
      secondBranch,
      tenant,
      'Alert B',
    ]);
    const ids: number[] = [];
    for (let index = 0; index < 5; index++) {
      const patientId = fixtureId(),
        ticketId = fixtureId(),
        target = index === 4 ? secondBranch : firstBranch;
      ids.push(patientId);
      await sql.query(
        'INSERT INTO patients(id,tenant_id,branch_id,name,national_id,date_of_birth,sex,email,notification_consent) VALUES(?,?,?,?,?,?,?,?,?)',
        [
          patientId,
          tenant,
          target,
          `Alert ${index}`,
          randomUUID(),
          '1990-01-01',
          'OTHER',
          `alert${index}@example.invalid`,
          index !== 1,
        ],
      );
      await sql.query(
        "INSERT INTO queue_tickets(id,tenant_id,branch_id,patient_id,ticket_number,status,service_date,created_at) VALUES(?,?,?,?,?,'TRIAGE_WAITING',DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)),DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND))",
        [ticketId, tenant, target, patientId, `ALERT-${index}`, index],
      );
    }
    const channel = { configured: () => false, send: async () => '' };
    const dispatcher = new (await import('../src/server/notifications')).NotificationDispatcher({
      EMAIL: channel,
      WHATSAPP: channel,
    });
    await dispatcher.runOnce(0);
    await dispatcher.runOnce(0);
    const alerts = await rows(
      "SELECT patient_id,branch_id FROM notification_outbox WHERE template='QUEUE_NEAR' AND branch_id IN (?,?)",
      [firstBranch, secondBranch],
    );
    expect(alerts).toHaveLength(3);
    expect(alerts.map((a) => a.patient_id).sort()).toEqual([ids[0], ids[2], ids[4]].sort());
  });
  it('requires five observations before estimating branch queue clearance', async () => {
    const insufficient = await http('/queue/estimate');
    expect(insufficient.status).toBe(200);
    expect((await insufficient.json()).estimatedMinutes).toBeNull();
    const p = await patient();
    for (let index = 0; index < 5; index++) {
      const observation = await encounter(p.id);
      await sql.query(
        'UPDATE encounters SET created_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 10 MINUTE),signed_at=UTC_TIMESTAMP() WHERE id=?',
        [observation.id],
      );
    }
    const estimate = await (await http('/queue/estimate')).json();
    expect(estimate.sampleCount).toBe(5);
    expect(estimate.practitionerCount).toBe(1);
    expect(estimate.estimatedMinutes).toBe(estimate.waiting * 10);
    expect(
      (
        await (
          await http('/queue/estimate', 'GET', undefined, {
            'X-Branch-ID': String(otherBranch),
            Cookie: `cms_session=${adminToken}`,
          })
        ).json()
      ).estimatedMinutes,
    ).toBeNull();
  });
  it('detects MC date-column tampering independently of JSON payload', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    const issued = await service.issueDocument(ctx, {
      encounterId: e.id,
      kind: 'MC',
      startDate: '2030-06-01',
      days: 1,
      diagnosisRedacted: true,
    });
    await sql.query('UPDATE clinical_documents SET end_date=? WHERE id=?', [
      '2030-06-02',
      issued.id,
    ]);
    expect((await service.verifyDocument(issued.verificationUrl.split('/').pop())).valid).toBe(
      false,
    );
  });
  it('historical adapter: persists branch commission policy while retaining historical ledger rates', async () => {
    const policy = {
      serviceBaseBps: 2500,
      serviceThresholdCents: 50000,
      serviceHighBps: 4500,
      productBps: 700,
    };
    expect((await legacyAdminHttp('/admin/commission-policy', 'PUT', policy)).status).toBe(200);
    expect(await (await legacyAdminHttp('/admin/commission-policy')).json()).toMatchObject(policy);
    const p = await patient(),
      first = await service.createInvoice(ctx, invoice(p.id));
    expect(
      await rows('SELECT id FROM commission_ledger WHERE invoice_id=?', [first.id]),
    ).toHaveLength(0);
    // Seed retained historical ledger evidence; active GP billing must not generate commissions.
    await sql.query(
      'INSERT INTO commission_ledger(id,tenant_id,branch_id,invoice_id,practitioner_id,base_cents,rate_basis_points,amount_cents,category) VALUES(?,?,?,?,?,?,?,?,?)',
      [fixtureId(), tenant, branch, first.id, doctor, 1000, 2500, 250, 'SERVICE'],
    );
    expect(
      (await legacyAdminHttp('/admin/commission-policy', 'PUT', { ...policy, serviceBaseBps: 500 }))
        .status,
    ).toBe(200);
    const second = await service.createInvoice(ctx, invoice(p.id));
    expect(
      await rows('SELECT id FROM commission_ledger WHERE invoice_id=?', [second.id]),
    ).toHaveLength(0);
    const original = (
      await rows(
        'SELECT rate_basis_points,amount_cents FROM commission_ledger WHERE invoice_id=?',
        [first.id],
      )
    )[0];
    expect(Number(original.rate_basis_points)).toBe(2500);
    expect(Number(original.amount_cents)).toBe(250);
  });
  it('historical adapter: rejects invalid commission rates and unauthorized policy mutation', async () => {
    const policy = {
      serviceBaseBps: 10001,
      serviceThresholdCents: 50000,
      serviceHighBps: 1500,
      productBps: 500,
    };
    expect((await legacyAdminHttp('/admin/commission-policy', 'PUT', policy)).status).toBe(400);
    expect(
      (await legacyHttp('/admin/commission-policy', 'PUT', { ...policy, serviceBaseBps: 1000 }))
        .status,
    ).toBe(403);
  });
  it('historical adapter: quotes CSV cells and neutralizes formula prefixes', async () => {
    const { csvCell } = await import('../src/server/commission-router');
    for (const value of ['=SUM(1,1)', '+1', '-1', '@SUM(1)', '\t=1', '\r=1'])
      expect(csvCell(value)).toBe(`"'${value}"`);
    expect(csvCell('Dr "A", B')).toBe('"Dr ""A"", B"');
  });
  it('historical adapter: exports branch-scoped payroll CSV only to admin and rejects invalid dates', async () => {
    const path = '/commissions/export?from=2020-01-01&to=2040-01-01';
    expect((await legacyHttp(path)).status).toBe(403);
    expect(
      (await legacyAdminHttp('/commissions/export?from=2026-02-31&to=2026-03-01')).status,
    ).toBe(400);
    await sql.query('UPDATE users SET name=? WHERE id=?', ['=SUM(1,1)', doctor]);
    try {
      const response = await legacyAdminHttp(path);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/csv');
      const csv = await response.text();
      expect(csv).toContain('"\'=SUM(1,1)"');
      expect(
        csv
          .split('\r\n')
          .slice(1)
          .some((line) => line.startsWith('"' + doctor + '",')),
      ).toBe(true);
      const other = await legacyHttp(path, 'GET', undefined, {
        Cookie: `cms_session=${adminToken}`,
        'X-Branch-ID': String(otherBranch),
      });
      expect(other.status).toBe(200);
      expect(
        (await other.text())
          .split('\r\n')
          .slice(1)
          .some((line) => line.startsWith('"' + doctor + '",')),
      ).toBe(false);
    } finally {
      await sql.query('UPDATE users SET name=? WHERE id=?', ['QA Doctor', doctor]);
    }
  });
  it('paginates complete patient history across tied timestamps without duplicates or disclosure', async () => {
    const p = await patient(),
      other = await patient();
    const ids: number[] = [];
    for (let index = 0; index < 51; index++)
      ids.push((await encounter(p.id, [], { assessment: `History ${index}` })).id);
    const otherEncounter = await encounter(other.id);
    await sql.query('UPDATE encounters SET created_at=? WHERE patient_id=?', [
      '2030-01-01 10:00:00',
      p.id,
    ]);
    const path = `/patients/${p.id}/encounters`;
    const response = await adminHttp(path);
    expect(response.status).toBe(200);
    const first = await response.json();
    expect(first.data).toHaveLength(50);
    expect(first.nextCursor).toEqual({
      before: '2030-01-01T10:00:00.000Z',
      beforeId: first.data.at(-1).id,
    });
    const secondResponse = await adminHttp(`${path}?${new URLSearchParams(first.nextCursor)}`);
    expect(secondResponse.status).toBe(200);
    const second = await secondResponse.json();
    expect(second.data).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const combined = [...first.data, ...second.data].map((e: any) => e.id);
    expect(new Set(combined).size).toBe(51);
    expect(combined).toEqual([...ids].sort((a, b) => b - a));
    expect(combined).not.toContain(otherEncounter.id);
    expect((await http(path)).status).toBe(403);
    expect(
      (
        await http(path, 'GET', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-Branch-ID': String(otherBranch),
        })
      ).status,
    ).toBe(404);
    expect((await adminHttp(`${path}?before=2030-01-01T10:00:00.000Z`)).status).toBe(400);
  });
  it('preserves timestamp-like SOAP text and arbitrary vitals JSON keys verbatim', async () => {
    const p = await patient();
    const subjective = '2026-10-07T09:00 patient said symptoms began yesterday';
    const objective = '2026-10-07T09:00:00Z';
    const vitals = { resp_rate: 18, custom_timestamp: '2026-10-07T09:00:00Z' };
    const saved = await encounter(p.id, [], { subjective, objective, vitals });
    expect(saved.subjective).toBe(subjective);
    expect(saved.objective).toBe(objective);
    expect(saved.vitals).toEqual(vitals);
    const persisted = (
      await rows('SELECT subjective,objective,vitals FROM encounters WHERE id=?', [saved.id])
    )[0];
    expect(persisted.subjective).toBe(subjective);
    expect(persisted.objective).toBe(objective);
    expect(persisted.vitals).toEqual(vitals);
    const listed = (await service.list(ctx, 'encounters')).find((e: any) => e.id === saved.id);
    expect(listed.subjective).toBe(subjective);
    expect(listed.objective).toBe(objective);
    expect(listed.vitals).toEqual(vitals);
  });
  it('canonicalizes Malaysian IC identity and rejects conflicting demographics', async () => {
    const input = {
      firstName: 'Nur',
      lastName: 'Amin',
      nationality: 'MALAYSIAN',
      nationalId: '991231145568',
      addressLine1: '12 Jalan Klinik',
      addressLine2: 'Unit 2',
      postcode: '50000',
      state: 'Kuala Lumpur',
    };
    const response = await http('/patients', 'POST', input);
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved).toMatchObject({
      ...input,
      name: 'Nur Amin',
      nationalId: '991231-14-5568',
      dateOfBirth: '1999-12-31',
      sex: 'FEMALE',
    });
    expect(await (await http('/patients/' + saved.id)).json()).toMatchObject({
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2,
      postcode: '50000',
      state: 'Kuala Lumpur',
    });
    for (const bad of [
      { nationalId: '990231145568' },
      { nationalId: '99123114556' },
      { nationalId: '99123114556X' },
      { sex: 'MALE' },
      { dateOfBirth: '1999-12-30' },
      { postcode: '123' },
    ])
      expect((await http('/patients', 'POST', { ...input, ...bad })).status).toBe(400);
  });
  it('roundtrips passport demographics and requires explicit birth date and gender', async () => {
    const input = {
      firstName: 'Alex',
      lastName: 'Ng',
      nationality: 'NON_MALAYSIAN',
      nationalId: 'P' + randomUUID().slice(0, 8),
      dateOfBirth: '1988-02-29',
      sex: 'OTHER',
      addressLine1: 'Overseas Road',
      addressLine2: 'Apartment 4',
      postcode: 'AB12 3CD',
      state: 'London',
      city: 'London',
      phone: '+44 (0)20 7946 0999 ext 123',
    };
    const response = await http('/patients', 'POST', input);
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved).toMatchObject({ ...input, name: 'Alex Ng' });
    expect(await (await http('/patients/' + saved.id)).json()).toMatchObject(input);
    const changedPhone = '+64 9 555 0100';
    expect(
      (
        await http('/patients/' + saved.id, 'PUT', {
          ...input,
          phone: changedPhone,
          version: saved.version,
        })
      ).status,
    ).toBe(200);
    expect(await (await http('/patients/' + saved.id)).json()).toMatchObject({
      ...input,
      phone: changedPhone,
    });
    expect(
      (
        await http('/patients', 'POST', {
          ...input,
          nationalId: 'PHONE-TOO-LONG-' + randomUUID(),
          phone: '+'.padEnd(51, '1'),
        })
      ).status,
    ).toBe(400);
    const { dateOfBirth, ...withoutDate } = input;
    expect((await http('/patients', 'POST', withoutDate)).status).toBe(400);
    const { sex, ...withoutSex } = input;
    expect((await http('/patients', 'POST', withoutSex)).status).toBe(400);
  });
  it('retires package commission and image endpoints without enabling historical adapters', async () => {
    for (const [path, method] of [
      ['/packages', 'GET'],
      ['/packages', 'POST'],
      ['/packages/' + fixtureId() + '/redeem', 'POST'],
      ['/commissions', 'GET'],
      ['/commissions/export', 'GET'],
      ['/admin/commission-policy', 'PUT'],
      ['/encounters/' + fixtureId() + '/photos', 'POST'],
      ['/photos/' + fixtureId() + '/image', 'GET'],
    ]) {
      const response = await adminHttp(path, method, method === 'GET' ? undefined : {});
      expect(response.status, path).toBe(410);
      expect(await response.json()).toMatchObject({ code: 'FEATURE_RETIRED' });
    }
    const p = await patient();
    const created = await service.createInvoice(ctx, invoice(p.id));
    expect(
      await rows('SELECT id FROM commission_ledger WHERE invoice_id=?', [created.id]),
    ).toHaveLength(0);
  });
  it('admin creates GP practitioners visible immediately to branch bookings', async () => {
    const response = await adminHttp('/admin/users', 'POST', {
      name: 'New GP Doctor',
      email: randomUUID() + '@example.invalid',
      password: 'QA-Strong-New-Password-2026',
      role: 'DOCTOR',
      branchId: branch,
      licenseNumber: 'NEW-GP',
    });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect((await (await http('/bootstrap')).json()).practitioners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: created.id, role: 'DOCTOR', licenseNumber: 'NEW-GP' }),
      ]),
    );
    expect(
      (
        await (
          await http('/bootstrap', 'GET', undefined, {
            Cookie: 'cms_session=' + adminToken,
            'X-Branch-ID': String(otherBranch),
          })
        ).json()
      ).practitioners.map((p: any) => p.id),
    ).not.toContain(created.id);
    const p = await patient();
    expect(
      (
        await http('/appointments', 'POST', {
          patientId: p.id,
          practitionerId: created.id,
          startsAt: '2034-05-01T01:00:00Z',
          endsAt: '2034-05-01T01:30:00Z',
        })
      ).status,
    ).toBe(201);
  });
  it('room rename and archive preserve busy bookings and branch isolation', async () => {
    const created = await (
      await adminHttp('/admin/rooms', 'POST', { name: 'Rename me', branchId: branch })
    ).json();
    const path = '/admin/rooms/' + created.id;
    expect((await adminHttp(path, 'PUT', { name: 'GP Room A' })).status).toBe(200);
    expect((await http('/bootstrap')).status).toBe(200);
    expect((await (await http('/bootstrap')).json()).rooms).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, name: 'GP Room A' })]),
    );
    const p = await patient();
    const booking = await service.schedule(ctx, {
      patientId: p.id,
      practitionerId: doctor,
      roomId: created.id,
      startsAt: '2034-07-01T01:00:00Z',
      endsAt: '2034-07-01T01:30:00Z',
      reason: '',
    });
    expect((await adminHttp(path, 'PUT', { active: false })).status).toBe(409);
    expect(
      (
        await http(
          path,
          'PUT',
          { name: 'Wrong branch' },
          { Cookie: 'cms_session=' + adminToken, 'X-Branch-ID': String(otherBranch) },
        )
      ).status,
    ).toBe(404);
    expect(
      (await http('/appointments/' + booking.id + '/cancel', 'POST', { version: booking.version }))
        .status,
    ).toBe(200);
    expect((await adminHttp(path, 'PUT', { active: false })).status).toBe(200);
    expect((await (await http('/bootstrap')).json()).rooms.map((r: any) => r.id)).not.toContain(
      created.id,
    );
    await expect(
      service.schedule(ctx, {
        patientId: p.id,
        practitionerId: doctor,
        roomId: created.id,
        startsAt: '2034-07-02T01:00:00Z',
        endsAt: '2034-07-02T01:30:00Z',
        reason: '',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ROOM' });
  });
  it('persists structured prescriptions and exposes only eligible signed dispensing work', async () => {
    const { schemas } = await import('../src/server/validation');
    const p = await patient(),
      i = await item();
    const received = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'GP-RECEIPT',
      expiresOn: '2035-12-31',
      quantity: 17,
    });
    expect(received.stockQuantity).toBe(17);
    const prescription = { ...rx(i.id, 2), frequencyPerDay: 3, mealTiming: 'AFTER_MEAL' };
    const signed = await encounter(p.id, [prescription]),
      draft = await encounter(p.id, [prescription], { status: 'DRAFT' }),
      empty = await encounter(p.id);
    expect(signed.prescriptions).toEqual([expect.objectContaining(prescription)]);
    for (const bad of [
      { frequencyPerDay: 0 },
      { frequencyPerDay: 25 },
      { mealTiming: 'WITH_UNKNOWN_MEAL' },
    ])
      expect(
        schemas.encounter.safeParse({
          patientId: p.id,
          assessment: 'GP',
          status: 'SIGNED',
          prescriptions: [{ ...prescription, ...bad }],
        }).success,
      ).toBe(false);
    const response = await adminHttp('/dispensary/encounters');
    expect(response.status).toBe(200);
    const pending = (await response.json()).data;
    const selected = pending.find((e: any) => e.id === signed.id);
    expect(selected).toBeDefined();
    expect(selected).not.toHaveProperty('subjective');
    expect(selected).not.toHaveProperty('assessment');
    expect(selected.prescriptions).toEqual([expect.objectContaining(prescription)]);
    expect(pending.map((e: any) => e.id)).not.toContain(draft.id);
    expect(pending.map((e: any) => e.id)).not.toContain(empty.id);
    expect(
      (
        await (
          await http('/dispensary/encounters', 'GET', undefined, {
            Cookie: 'cms_session=' + adminToken,
            'X-Branch-ID': String(otherBranch),
          })
        ).json()
      ).data.map((e: any) => e.id),
    ).not.toContain(signed.id);
    await service.dispense(ctx, { encounterId: signed.id, idempotencyKey: randomUUID() });
    expect(
      (await (await adminHttp('/dispensary/encounters')).json()).data.map((e: any) => e.id),
    ).not.toContain(signed.id);
    expect(
      Number(
        (await rows('SELECT SUM(quantity) n FROM inventory_batches WHERE item_id=?', [i.id]))[0].n,
      ),
    ).toBe(15);
    await expect(
      service.receiveBatch(ctx, {
        itemId: i.id,
        batchNumber: 'PAST',
        expiresOn: '2020-01-01',
        quantity: 1,
      }),
    ).rejects.toBeDefined();
  });

  it('changes role modules immediately while keeping admin and branch safeguards', async () => {
    const original = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (r: any) => r.role === 'RECEPTIONIST',
    ).modules;
    try {
      expect(
        (await http('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: [] })).status,
      ).toBe(403);
      expect(
        (await adminHttp('/admin/role-modules', 'PUT', { role: 'ADMIN', modules: [] })).status,
      ).toBe(400);
      expect(
        (
          await adminHttp('/admin/role-modules', 'PUT', {
            role: 'RECEPTIONIST',
            modules: ['photos'],
          })
        ).status,
      ).toBe(400);
      expect(
        (await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: [] }))
          .status,
      ).toBe(200);
      expect((await (await http('/bootstrap')).json()).modules).toEqual([]);
      for (const path of [
        '/patients',
        '/appointments',
        '/inventory',
        '/encounters',
        '/invoices',
        '/queue',
        '/references/patients',
        '/references/medications',
      ])
        expect((await http(path)).status, path).toBe(403);
      expect((await adminHttp('/patients')).status).toBe(200);
      await adminHttp('/admin/role-modules', 'PUT', {
        role: 'RECEPTIONIST',
        modules: ['patients'],
      });
      expect((await http('/patients')).status).toBe(200);
      expect(
        (await http('/patients', 'GET', undefined, { 'X-Branch-ID': String(otherBranch) })).status,
      ).toBe(403);
      const grants = await (await adminHttp('/admin/role-modules')).json();
      expect(grants.roles.find((r: any) => r.role === 'ADMIN').modules).toHaveLength(7);
      expect(grants.roles.find((r: any) => r.role === 'RECEPTIONIST').modules).toEqual([
        'patients',
      ]);
      expect(
        await rows(
          "SELECT id FROM audit_logs WHERE tenant_id=? AND action='ROLE_MODULES_CHANGED'",
          [tenant],
        ),
      ).not.toHaveLength(0);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: original });
    }
  });
  it('appointments-only and billing-only roles use minimal references without full patient records', async () => {
    const original = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (r: any) => r.role === 'RECEPTIONIST',
    ).modules;
    const p = await patient({
      name: 'Dependency Patient ' + randomUUID(),
      allergies: ['penicillin'],
      conditions: ['sensitive history'],
    });
    try {
      await adminHttp('/admin/role-modules', 'PUT', {
        role: 'RECEPTIONIST',
        modules: ['appointments'],
      });
      expect((await http('/patients')).status).toBe(403);
      const refs = await (
        await http('/references/patients?search=' + encodeURIComponent(p.name))
      ).json();
      expect(refs.data).toHaveLength(1);
      expect(Object.keys(refs.data[0]).sort()).toEqual(
        ['id', 'patientNumber', 'name', 'nationalId', 'phone'].sort(),
      );
      expect(
        (
          await http('/appointments', 'POST', {
            patientId: p.id,
            practitionerId: doctor,
            startsAt: '2034-08-01T01:00:00Z',
            endsAt: '2034-08-01T01:30:00Z',
          })
        ).status,
      ).toBe(201);
      expect((await http('/clinical/patients/' + p.id)).status).toBe(403);
      expect((await http('/references/medications')).status).toBe(403);
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: ['billing'] });
      expect((await http('/patients/' + p.id)).status).toBe(403);
      expect((await http('/references/patients?search=' + encodeURIComponent(p.name))).status).toBe(
        200,
      );
      expect((await http('/invoices', 'POST', invoice(p.id))).status).toBe(201);
      expect((await http('/clinical/patients/' + p.id)).status).toBe(403);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: original });
    }
  });
  it('clinical-only access exposes selected safety banner and medications but prevents non-doctor signing', async () => {
    const original = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (r: any) => r.role === 'RECEPTIONIST',
    ).modules;
    const p = await patient({ allergies: ['penicillin'] }),
      i = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'CLINICAL',
      expiresOn: '2030-01-01',
      quantity: 3,
    });
    try {
      await adminHttp('/admin/role-modules', 'PUT', {
        role: 'RECEPTIONIST',
        modules: ['clinical'],
      });
      expect((await http('/patients')).status).toBe(403);
      expect((await http('/inventory')).status).toBe(403);
      const refs = (await (await http('/references/medications')).json()).data;
      expect(refs).toEqual(expect.arrayContaining([expect.objectContaining({ id: i.id })]));
      expect(refs.find((r: any) => r.id === i.id)).not.toHaveProperty('stockQuantity');
      expect(refs.find((r: any) => r.id === i.id)).not.toHaveProperty('batches');
      const banner = await (await http('/clinical/patients/' + p.id)).json();
      expect(banner.allergies).toEqual(['penicillin']);
      expect(banner).not.toHaveProperty('addressLine1');
      expect(banner).not.toHaveProperty('notificationConsent');
      expect(banner).not.toHaveProperty('subjective');
      const payload = {
        patientId: p.id,
        specialty: 'GP',
        assessment: 'Clinical',
        prescriptions: [{ ...rx(i.id), frequencyPerDay: 2, mealTiming: 'BEFORE_MEAL' }],
        status: 'SIGNED',
      };
      expect((await http('/encounters', 'POST', payload)).status).toBe(403);
      const response = await http('/encounters', 'POST', payload, {
        Cookie: 'cms_session=' + doctorToken,
      });
      expect(response.status).toBe(201);
      expect((await response.json()).prescriptions[0]).toMatchObject({
        frequencyPerDay: 2,
        mealTiming: 'BEFORE_MEAL',
      });
      expect(
        (
          await http('/clinical/patients/' + p.id, 'GET', undefined, {
            Cookie: 'cms_session=' + adminToken,
            'X-Branch-ID': String(otherBranch),
          })
        ).status,
      ).toBe(404);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: original });
    }
  });
  it('accepts explicit alternate-century Malaysian IC dates with matching digits', async () => {
    const response = await http('/patients', 'POST', {
      firstName: 'Century',
      lastName: 'Regression',
      nationality: 'MALAYSIAN',
      nationalId: '261231145569',
      dateOfBirth: '1926-12-31',
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      dateOfBirth: '1926-12-31',
      nationalId: '261231-14-5569',
      sex: 'MALE',
    });
  });

  it('blocks room rename and archive during an active call or consultation', async () => {
    const created = await (
        await adminHttp('/admin/rooms', 'POST', { name: 'Occupied GP', branchId: branch })
      ).json(),
      p = await patient();
    const ticket = await service.checkIn(ctx, { patientId: p.id, priority: 'NORMAL' });
    const triage = await service.transitionQueue(ctx, ticket.id, {
      version: ticket.version,
      status: 'TRIAGE_WAITING',
    });
    const called = await service.transitionQueue(ctx, ticket.id, {
      version: triage.version,
      status: 'CALLED_TO_ROOM',
      roomId: created.id,
      practitionerId: doctor,
    });
    for (const input of [{ name: 'Changed' }, { active: false }]) {
      const response = await adminHttp('/admin/rooms/' + created.id, 'PUT', input);
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: 'ROOM_BUSY' });
    }
    const consultation = await service.transitionQueue(ctx, ticket.id, {
      version: called.version,
      status: 'IN_CONSULTATION',
    });
    expect((await adminHttp('/admin/rooms/' + created.id, 'PUT', { active: false })).status).toBe(
      409,
    );
    await service.transitionQueue(ctx, ticket.id, {
      version: consultation.version,
      status: 'PAYMENT_WAITING',
    });
    expect((await adminHttp('/admin/rooms/' + created.id, 'PUT', { active: false })).status).toBe(
      200,
    );
  });
  it('persists patient city without changing selected locality or explicit address', async () => {
    const input = {
      firstName: 'Postcode',
      lastName: 'QA',
      nationality: 'NON_MALAYSIAN',
      nationalId: 'POST' + randomUUID().slice(0, 8),
      dateOfBirth: '1990-01-01',
      sex: 'OTHER',
      addressLine1: '8 Jalan QA',
      addressLine2: 'Floor 2',
      postcode: '43000',
      city: 'Kajang',
      state: 'Selangor',
    };
    const response = await http('/patients', 'POST', input);
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved).toMatchObject({
      postcode: '43000',
      city: 'Kajang',
      state: 'Selangor',
      addressLine1: '8 Jalan QA',
    });
    const read = await (await http('/patients/' + saved.id)).json();
    expect(read).toMatchObject(input);
    const edited = await http('/patients/' + saved.id, 'PUT', {
      ...input,
      city: 'Selected locality',
      version: saved.version,
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({
      city: 'Selected locality',
      postcode: '43000',
      state: 'Selangor',
    });
    expect((await rows('SELECT city FROM patients WHERE id=?', [saved.id]))[0].city).toBe(
      'Selected locality',
    );
    expect(
      (
        await http('/patients', 'POST', {
          ...input,
          nationalId: 'LONG' + randomUUID().slice(0, 8),
          city: 'X'.repeat(101),
        })
      ).status,
    ).toBe(400);
  });

  it('looks up known Malaysian postcodes and returns every locality without guessing', async () => {
    for (const [postcode, city, state] of [
      ['43000', 'Kajang', 'Selangor'],
      ['50000', 'Kuala Lumpur', 'Wilayah Persekutuan Kuala Lumpur'],
      ['01000', 'Kangar', 'Perlis'],
    ]) {
      const response = await http('/references/postcodes/' + postcode);
      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ postcode, city, state })]),
      );
    }
    const multi = await (await http('/references/postcodes/84300')).json();
    expect(multi.data.map((r: any) => r.city).sort()).toEqual(['Bukit Pasir', 'Muar']);
    expect(multi.data.every((r: any) => r.state === 'Johor' && r.postcode === '84300')).toBe(true);
    expect(await (await http('/references/postcodes/99999')).json()).toEqual({ data: [] });
    for (const bad of ['4300', '430000', '43abc'])
      expect((await http('/references/postcodes/' + bad)).status).toBe(400);
  });
  it('denies postcode lookup without patient module or valid session', async () => {
    const original = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (r: any) => r.role === 'RECEPTIONIST',
    ).modules;
    try {
      await adminHttp('/admin/role-modules', 'PUT', {
        role: 'RECEPTIONIST',
        modules: ['appointments'],
      });
      expect((await http('/references/postcodes/43000')).status).toBe(403);
      expect((await adminHttp('/references/postcodes/43000')).status).toBe(200);
      expect(
        (await http('/references/postcodes/43000', 'GET', undefined, { Cookie: '' })).status,
      ).toBe(401);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: original });
    }
  });
  it('fills only an unambiguous missing postcode locality and preserves manual choices', async () => {
    const base = {
      firstName: 'Auto',
      lastName: 'Locality',
      nationality: 'NON_MALAYSIAN',
      dateOfBirth: '1990-01-01',
      sex: 'OTHER',
    };
    const create = async (extra: any) => {
      const response = await http('/patients', 'POST', {
        ...base,
        nationalId: 'AUTO' + randomUUID().slice(0, 8),
        ...extra,
      });
      expect(response.status).toBe(201);
      return response.json();
    };
    expect(await create({ postcode: '43000' })).toMatchObject({
      postcode: '43000',
      city: 'Kajang',
      state: 'Selangor',
    });
    expect(await create({ postcode: '50000' })).toMatchObject({
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan Kuala Lumpur',
    });
    expect(await create({ postcode: '43000', state: 'Selangor' })).toMatchObject({
      city: 'Kajang',
      state: 'Selangor',
    });
    expect(await create({ postcode: '84300', city: 'Muar', state: 'Johor' })).toMatchObject({
      city: 'Muar',
      state: 'Johor',
    });
    expect(await create({ postcode: '84300' })).toMatchObject({ city: '', state: '' });
    expect(await create({ postcode: '99999' })).toMatchObject({ city: '', state: '' });
    expect(
      await create({ postcode: '43000', city: 'Manual City', state: 'Manual State' }),
    ).toMatchObject({ city: 'Manual City', state: 'Manual State' });
    expect(await create({ postcode: '43000', state: 'Manual State' })).toMatchObject({
      city: '',
      state: 'Manual State',
    });
  });
  it('signing reserves FEFO without physically consuming stock; dispensing and retries consume once', async () => {
    const p = await patient(),
      i = await item();
    const batch = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'RESERVE',
      expiresOn: '2035-01-01',
      quantity: 100,
    });
    const e = await encounter(p.id, [rx(i.id)]);
    expect(
      (await service.list(ctx, 'inventory')).find((row: any) => row.id === i.id),
    ).toMatchObject({ stockQuantity: 97, onHandQuantity: 100, reservedQuantity: 3 });
    expect(
      (
        await rows(
          'SELECT quantity,status,consumed_at FROM prescription_reservations WHERE encounter_id=?',
          [e.id],
        )
      )[0],
    ).toMatchObject({ quantity: 3, status: 'RESERVED', consumed_at: null });
    expect(
      (await rows('SELECT quantity FROM inventory_batches WHERE id=?', [batch.id]))[0].quantity,
    ).toBe(100);
    const key = randomUUID();
    const results = await Promise.all([
      service.dispense(ctx, { encounterId: e.id, idempotencyKey: key }),
      service.dispense(ctx, { encounterId: e.id, idempotencyKey: key }),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await service.list(ctx, 'inventory')).find((row: any) => row.id === i.id),
    ).toMatchObject({ stockQuantity: 97, onHandQuantity: 97, reservedQuantity: 0 });
    expect(
      (await rows('SELECT quantity FROM inventory_batches WHERE id=?', [batch.id]))[0].quantity,
    ).toBe(97);
    expect(
      await rows('SELECT id FROM stock_movements WHERE dispense_id=?', [results[0].id]),
    ).toHaveLength(1);
  });
  it('draft Rx creates no holds and failed multi-item signing rolls back chart, holds and notifications', async () => {
    const p = await patient({ notificationConsent: true, email: 'reservation@example.invalid' }),
      a = await item(),
      b = await item();
    await service.receiveBatch(ctx, {
      itemId: a.id,
      batchNumber: 'SIGN-A',
      expiresOn: '2035-01-01',
      quantity: 3,
    });
    const draft = await encounter(p.id, [rx(a.id), rx(b.id)], { status: 'DRAFT' });
    expect(
      await rows('SELECT id FROM prescription_reservations WHERE encounter_id=?', [draft.id]),
    ).toHaveLength(0);
    await expect(
      service.saveEncounter(
        ctx,
        {
          patientId: p.id,
          specialty: 'GP',
          subjective: 'Cough',
          objective: 'Stable',
          assessment: 'QA assessment',
          plan: 'Review',
          vitals: {},
          prescriptions: [rx(a.id), rx(b.id)],
          procedureNotes: '',
          status: 'SIGNED',
          version: draft.version,
        },
        draft.id,
      ),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await rows('SELECT id FROM encounters WHERE patient_id=?', [p.id])).toHaveLength(1);
    expect(
      await rows('SELECT id FROM prescription_reservations WHERE item_id IN (?,?)', [a.id, b.id]),
    ).toHaveLength(0);
    expect(
      await rows("SELECT id FROM notification_outbox WHERE patient_id=? AND template='REFILL'", [
        p.id,
      ]),
    ).toHaveLength(0);
    expect((await rows('SELECT status FROM encounters WHERE id=?', [draft.id]))[0].status).toBe(
      'DRAFT',
    );
  });
  it('concurrent signing of competing prescriptions reserves final stock for exactly one chart', async () => {
    const p = await patient(),
      i = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'SIGN-RACE',
      expiresOn: '2035-01-01',
      quantity: 3,
    });
    const results = await Promise.allSettled([
      encounter(p.id, [rx(i.id)]),
      encounter(p.id, [rx(i.id)]),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(await rows('SELECT id FROM encounters WHERE patient_id=?', [p.id])).toHaveLength(1);
    expect(
      (
        await rows(
          'SELECT SUM(quantity) quantity FROM prescription_reservations WHERE item_id=? AND consumed_at IS NULL',
          [i.id],
        )
      )[0].quantity,
    ).toBe('3');
    expect(
      (await service.list(ctx, 'inventory')).find((row: any) => row.id === i.id),
    ).toMatchObject({ stockQuantity: 0, onHandQuantity: 3, reservedQuantity: 3 });
  });
  it('expired own hold survives failed dispensing and reallocates to a fresh batch without touching expired stock', async () => {
    const p = await patient(),
      i = await item();
    const old = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'HELD-EXPIRES',
      expiresOn: '2035-01-01',
      quantity: 3,
    });
    const e = await encounter(p.id, [rx(i.id)]);
    await sql.query("UPDATE inventory_batches SET expires_on='2020-01-01' WHERE id=?", [old.id]);
    const key = randomUUID();
    await expect(
      service.dispense(ctx, { encounterId: e.id, idempotencyKey: key }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
    expect(
      (
        await rows(
          'SELECT status,consumed_at FROM prescription_reservations WHERE encounter_id=?',
          [e.id],
        )
      )[0],
    ).toEqual({ status: 'RESERVED', consumed_at: null });
    expect(await rows('SELECT id FROM dispenses WHERE encounter_id=?', [e.id])).toHaveLength(0);
    const fresh = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'FRESH',
      expiresOn: '2036-01-01',
      quantity: 3,
    });
    const d = await service.dispense(ctx, { encounterId: e.id, idempotencyKey: key });
    expect(d.allocations[0].batchId).toBe(fresh.id);
    expect(
      (await rows('SELECT quantity FROM inventory_batches WHERE id=?', [old.id]))[0].quantity,
    ).toBe(3);
    expect(
      (await rows('SELECT status FROM prescription_reservations WHERE encounter_id=?', [e.id]))[0]
        .status,
    ).toBe('RELEASED');
  });
  it('non-expiring supplies support atomic idempotent usage but medication cannot bypass dispensing', async () => {
    const supply = await item({ name: 'QA Gauze', category: 'CONSUMABLE' });
    const batch = await service.receiveBatch(ctx, {
      itemId: supply.id,
      batchNumber: 'NO-EXPIRY',
      quantity: 10,
    });
    expect(batch.expiresOn).toBeNull();
    const input = {
      itemId: supply.id,
      quantity: 4,
      reason: 'Dressing',
      idempotencyKey: randomUUID(),
    };
    const results = await Promise.all([
      service.useInventory(ctx, input),
      service.useInventory(ctx, input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await rows('SELECT quantity FROM inventory_batches WHERE id=?', [batch.id]))[0].quantity,
    ).toBe(6);
    await expect(service.useInventory(ctx, { ...input, quantity: 5 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(
      service.useInventory(otherCtx, { ...input, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const medicine = await item();
    await expect(
      service.receiveBatch(ctx, {
        itemId: medicine.id,
        batchNumber: 'NO-MED-EXPIRY',
        quantity: 10,
      }),
    ).rejects.toMatchObject({ code: 'EXPIRY_REQUIRED' });
    await expect(
      service.useInventory(ctx, { ...input, itemId: medicine.id, idempotencyKey: randomUUID() }),
    ).rejects.toMatchObject({ code: 'MEDICATION_DISPENSE_REQUIRED' });
  });
  it('rejects supply or retail items as medication even when eligible dated stock exists', async () => {
    const p = await patient();
    for (const category of ['CONSUMABLE', 'RETAIL']) {
      const supply = await item({ category });
      await service.receiveBatch(ctx, {
        itemId: supply.id,
        batchNumber: 'NOT-MEDICATION',
        expiresOn: '2035-01-01',
        quantity: 5,
      });
      await expect(encounter(p.id, [rx(supply.id)])).rejects.toMatchObject({
        code: 'INVALID_MEDICATION',
      });
      expect(
        await rows('SELECT id FROM prescription_reservations WHERE item_id=?', [supply.id]),
      ).toHaveLength(0);
    }
    expect(await rows('SELECT id FROM encounters WHERE patient_id=?', [p.id])).toHaveLength(0);
  });
  it('inventory search and category filters apply server-side and retain branch isolation', async () => {
    const target = await item({
      name: 'Unique Surgical Dressing',
      category: 'CONSUMABLE',
      ingredient: 'QA search fibre',
    });
    expect(
      (await service.list(ctx, 'inventory', 'QA search fibre', 'CONSUMABLE')).map(
        (row: any) => row.id,
      ),
    ).toEqual([target.id]);
    expect(await service.list(ctx, 'inventory', 'QA search fibre', 'MEDICATION')).toEqual([]);
    expect(await service.list(otherCtx, 'inventory', 'QA search fibre')).toEqual([]);
    expect((await adminHttp('/inventory?category=UNSUPPORTED')).status).toBe(400);
  });
  it('consultation and medicine-name pending search find scoped older rows beyond the recent 200 limit', async () => {
    const p = await patient({ name: 'Old Search Needle' }),
      i = await item({ name: 'Distinct Search Medicine' });
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'SEARCH',
      expiresOn: '2035-01-01',
      quantity: 3,
    });
    const target = await encounter(p.id, [rx(i.id)], { assessment: 'old-search-assessment' });
    const filler = await patient({ name: 'Search filler' });
    for (let n = 0; n < 201; n++) {
      await sql.query(
        "INSERT INTO patients(tenant_id,branch_id,name,national_id,date_of_birth,sex,created_at) VALUES(?,?,?,?,'1990-01-01','OTHER',DATE_ADD(NOW(),INTERVAL 1 DAY))",
        [tenant, branch, 'Recent search filler ' + n, randomUUID()],
      );
      await sql.query(
        "INSERT INTO encounters(tenant_id,branch_id,patient_id,practitioner_id,specialty,subjective,objective,assessment,plan,procedure_notes,status,prescriptions,vitals,created_at) VALUES(?,?,?,?,?,'','','','','','DRAFT','[]','{}',DATE_ADD(NOW(),INTERVAL 1 DAY))",
        [tenant, branch, filler.id, doctor, 'GP'],
      );
    }
    expect((await service.list(ctx, 'patients')).some((row: any) => row.id === p.id)).toBe(false);
    expect(
      (await service.list(ctx, 'patients', 'Old Search Needle')).map((row: any) => row.id),
    ).toEqual([p.id]);
    const patientRefs = await (
      await adminHttp('/references/patients?search=Old%20Search%20Needle')
    ).json();
    expect(patientRefs.data.map((row: any) => row.id)).toEqual([p.id]);
    expect((await service.list(ctx, 'encounters')).some((row: any) => row.id === target.id)).toBe(
      false,
    );
    expect(
      (await service.list(ctx, 'encounters', 'old-search-assessment')).map((row: any) => row.id),
    ).toEqual([target.id]);
    expect(await service.list(otherCtx, 'encounters', 'old-search-assessment')).toEqual([]);
    const pending = await (
      await adminHttp('/dispensary/encounters?search=Distinct%20Search%20Medicine')
    ).json();
    expect(pending.data.map((row: any) => row.id)).toEqual([target.id]);
    expect(pending.data[0]).not.toHaveProperty('subjective');
    const other = await (
      await http('/dispensary/encounters?search=Distinct%20Search%20Medicine', 'GET', undefined, {
        Cookie: 'cms_session=' + adminToken,
        'X-Branch-ID': String(otherBranch),
      })
    ).json();
    expect(other.data).toEqual([]);
  });
  it('HTTP rejects unsigned MC and malformed blood pressure while retaining unusual ordered readings', async () => {
    const p = await patient(),
      draft = await encounter(p.id, [], { status: 'DRAFT' });
    const auth = { Cookie: 'cms_session=' + doctorToken };
    const denied = await http(
      '/documents',
      'POST',
      { encounterId: draft.id, kind: 'MC', startDate: '2033-01-01', days: 1 },
      auth,
    );
    expect(denied.status).toBe(422);
    expect(
      await rows('SELECT id FROM clinical_documents WHERE encounter_id=?', [draft.id]),
    ).toHaveLength(0);
    expect(
      (
        await http(
          '/encounters',
          'POST',
          {
            patientId: p.id,
            specialty: 'GP',
            status: 'DRAFT',
            vitals: { bloodPressure: '80/120' },
          },
          auth,
        )
      ).status,
    ).toBe(400);
    const valid = await http(
      '/encounters',
      'POST',
      {
        patientId: p.id,
        specialty: 'GP',
        status: 'SIGNED',
        vitals: { bloodPressure: '270/220', resp_rate: 18 },
        assessment: 'QA assessment for signed certificate',
      },
      auth,
    );
    expect(valid.status, JSON.stringify(await valid.clone().json())).toBe(201);
    const chart = await valid.json();
    expect(chart.vitals).toEqual({ bloodPressure: '270/220', resp_rate: 18 });
    const issued = await http(
      '/documents',
      'POST',
      { encounterId: chart.id, kind: 'MC', startDate: '2033-01-01', days: 3 },
      auth,
    );
    expect(issued.status).toBe(201);
    expect(
      (
        await rows(
          "SELECT DATE_FORMAT(end_date,'%Y-%m-%d') end_date FROM clinical_documents WHERE encounter_id=?",
          [chart.id],
        )
      )[0].end_date,
    ).toBe('2033-01-03');
  });
  it('records taken and missed reports without stock effects, with scoped access and idempotency', async () => {
    const p = await patient(),
      i = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'DOSE-REPORT',
      expiresOn: '2035-01-01',
      quantity: 10,
    });
    const e = await encounter(p.id, [rx(i.id, 3)]),
      path = '/encounters/' + e.id + '/medication-doses';
    const before = await rows('SELECT quantity FROM inventory_batches WHERE item_id=?', [i.id]);
    const movementsBefore = await rows(
      'SELECT id FROM stock_movements WHERE batch_id IN (SELECT id FROM inventory_batches WHERE item_id=?)',
      [i.id],
    );
    const headers = { Cookie: `cms_session=${doctorToken}` };
    const taken = {
      itemId: i.id,
      outcome: 'TAKEN',
      source: 'PATIENT_REPORTED',
      occurredAt: '2026-01-01T10:00:00+08:00',
      amount: 0.5,
      notes: 'Fictional report',
      idempotencyKey: randomUUID(),
    };
    const response = await http(path, 'POST', taken, headers);
    expect(response.status).toBe(201);
    const saved = await response.json();
    expect(saved).toMatchObject({
      amount: 0.5,
      actorId: doctor,
      actorName: 'QA Doctor',
      medicineName: i.name,
      unit: 'tablet',
      occurredAt: '2026-01-01T02:00:00.000Z',
    });
    expect(saved).not.toHaveProperty('requestHash');
    expect((await (await http(path, 'POST', taken, headers)).json()).id).toBe(saved.id);
    expect((await http(path, 'POST', { ...taken, amount: 1 }, headers)).status).toBe(409);
    const missed = await http(
      path,
      'POST',
      {
        ...taken,
        outcome: 'MISSED',
        source: 'STAFF_OBSERVED',
        amount: null,
        occurredAt: '2026-01-02T02:00:00Z',
        idempotencyKey: randomUUID(),
      },
      headers,
    );
    expect(missed.status).toBe(201);
    const log = await (await adminHttp(path)).json();
    expect(log.entries.map((v: any) => v.outcome)).toEqual(['MISSED', 'TAKEN']);
    expect(log).not.toHaveProperty('data');
    expect(JSON.stringify(log)).not.toMatch(/requestHash|passwordHash|subjective|assessment/);
    expect(await rows('SELECT quantity FROM inventory_batches WHERE item_id=?', [i.id])).toEqual(
      before,
    );
    expect(
      await rows(
        'SELECT id FROM stock_movements WHERE batch_id IN (SELECT id FROM inventory_batches WHERE item_id=?)',
        [i.id],
      ),
    ).toEqual(movementsBefore);
    expect(
      (await rows('SELECT status FROM prescription_reservations WHERE encounter_id=?', [e.id]))[0]
        .status,
    ).toBe('RESERVED');
    expect((await http(path)).status).toBe(403);
    expect((await adminHttp(path, 'POST', taken)).status).toBe(403);
    expect((await http(path, 'GET', undefined, { Cookie: '' })).status).toBe(401);
    expect(
      (
        await http(path, 'GET', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-Branch-ID': String(otherBranch),
        })
      ).status,
    ).toBe(404);
  });
  it('rejects invalid, unsigned and unprescribed patient doses and denies inventory-only access', async () => {
    const p = await patient(),
      i = await item(),
      other = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'DOSE-INVALID',
      expiresOn: '2035-01-01',
      quantity: 10,
    });
    const draft = await encounter(p.id, [rx(i.id)], { status: 'DRAFT' }),
      e = await encounter(p.id, [rx(i.id)]);
    const path = '/encounters/' + e.id + '/medication-doses',
      headers = { Cookie: `cms_session=${doctorToken}` };
    const input = {
      itemId: i.id,
      outcome: 'TAKEN',
      source: 'PATIENT_REPORTED',
      occurredAt: '2026-01-01T00:00:00Z',
      amount: 1,
      idempotencyKey: randomUUID(),
    };
    for (const changed of [
      { source: undefined },
      { amount: null },
      { amount: 0 },
      { amount: 0.0001 },
      { amount: 1000001 },
      { outcome: 'MISSED', amount: 1 },
      { occurredAt: 'bad' },
      { occurredAt: '2099-01-01T00:00:00Z' },
    ])
      expect((await http(path, 'POST', { ...input, ...changed }, headers)).status).toBe(400);
    expect(
      (await http('/encounters/' + draft.id + '/medication-doses', 'POST', input, headers)).status,
    ).toBe(422);
    expect((await http(path, 'POST', { ...input, itemId: other.id }, headers)).status).toBe(422);
    const original = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (v: any) => v.role === 'RECEPTIONIST',
    ).modules;
    try {
      await adminHttp('/admin/role-modules', 'PUT', {
        role: 'RECEPTIONIST',
        modules: ['inventory'],
      });
      expect((await http(path)).status).toBe(403);
      expect((await http(path, 'POST', input)).status).toBe(403);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: original });
    }
    expect(
      await rows('SELECT id FROM prescription_dose_logs WHERE encounter_id=?', [e.id]),
    ).toHaveLength(0);
    const nurseId = fixtureId(),
      nurseToken = randomUUID();
    const nurseModules = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (v: any) => v.role === 'NURSE',
    ).modules;
    await sql.query(
      'INSERT INTO users(id,tenant_id,branch_id,email,name,password_hash,role) VALUES(?,?,?,?,?,?,?)',
      [
        nurseId,
        tenant,
        branch,
        'dose-nurse@example.invalid',
        'QA Dose Nurse',
        'test-only',
        'NURSE',
      ],
    );
    await sql.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [nurseId, branch]);
    await sql.query(
      'INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES(?,?,?,?)',
      [
        createHash('sha256').update(nurseToken).digest('hex'),
        nurseId,
        csrfToken,
        '2035-01-01 00:00:00',
      ],
    );
    const nurseHeaders = { Cookie: `cms_session=${nurseToken}` };
    try {
      expect((await http(path, 'POST', input, nurseHeaders)).status).toBe(403);
      await adminHttp('/admin/role-modules', 'PUT', { role: 'NURSE', modules: ['clinical'] });
      const written = await http(
        path,
        'POST',
        { ...input, source: 'STAFF_OBSERVED' },
        nurseHeaders,
      );
      expect(written.status).toBe(201);
      expect(await written.json()).toMatchObject({
        actorId: nurseId,
        actorName: 'QA Dose Nurse',
        source: 'STAFF_OBSERVED',
      });
      expect(
        (await (await http(path, 'GET', undefined, nurseHeaders)).json()).entries,
      ).toHaveLength(1);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'NURSE', modules: nurseModules });
    }
  });
  it('previews redacted MC safely and serves real PDF inline or explicit attachment with scoped access', async () => {
    const p = await patient({
      name: 'Fictional QA Letter Patient',
      nationalId: 'QA-FICTIONAL-PASSPORT',
      conditions: ['SECRET-CONDITION-LETTER'],
    });
    const e = await encounter(p.id, [], { assessment: 'SECRET-DIAGNOSIS-LETTER' });
    const issued = await service.issueDocument(ctx, {
      encounterId: e.id,
      kind: 'MC',
      startDate: '2035-01-01',
      days: 3,
      diagnosisRedacted: true,
      lightDuty: false,
      employer: 'Fictional Employer ' + 'W'.repeat(170),
      clinicalNotes: '',
    });
    const auth = { Cookie: 'cms_session=' + doctorToken };
    const previewResponse = await http('/documents/' + issued.id, 'GET', undefined, auth);
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview).toMatchObject({
      id: issued.id,
      kind: 'MC',
      patientName: p.name,
      diagnosis: null,
      diagnosisRedacted: true,
      clinicName: 'QA Main',
      practitionerName: 'QA Doctor',
    });
    expect(preview.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Leave days', value: '3' }),
        expect.objectContaining({ label: 'To', value: '03/01/2035' }),
      ]),
    );
    expect(Object.keys(preview).sort()).toEqual(
      [
        'id',
        'kind',
        'documentNumber',
        'clinicName',
        'clinicAddress',
        'patientName',
        'nationalId',
        'practitionerName',
        'licenseNumber',
        'issuedAt',
        'issuedDate',
        'issuedTime',
        'revoked',
        'diagnosisRedacted',
        'fields',
        'diagnosis',
      ].sort(),
    );
    expect(JSON.stringify(preview)).not.toContain('SECRET-');
    const list = await (await http('/documents', 'GET', undefined, auth)).json();
    expect(JSON.stringify(list.data.find((d: any) => d.id === issued.id))).not.toContain('SECRET-');
    const inline = await http('/documents/' + issued.id + '/pdf', 'GET', undefined, auth);
    expect(inline.status).toBe(200);
    expect(inline.headers.get('content-disposition')).toMatch(/^inline; filename="MC-/);
    expect(inline.headers.get('cache-control')).toBe('no-store');
    const bytes = Buffer.from(await inline.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    const text = pdfText(bytes);
    expect(text).toContain('MEDICAL CERTIFICATE');
    expect(text).toContain(p.name);
    expect(text).toContain('Withheld');
    expect(text).not.toContain('SECRET-');
    const stored = (
      await rows('SELECT signature_hash,verification_hash FROM clinical_documents WHERE id=?', [
        issued.id,
      ])
    )[0];
    expect(text).not.toContain(stored.signature_hash);
    expect(text).not.toContain(process.env.DOCUMENT_SIGNING_KEY);
    expect(JSON.stringify(preview)).not.toContain(stored.verification_hash);
    const attachment = await http(
      '/documents/' + issued.id + '/pdf?download=1',
      'GET',
      undefined,
      auth,
    );
    expect(attachment.status).toBe(200);
    expect(attachment.headers.get('content-disposition')).toMatch(/^attachment;/);
    await attachment.arrayBuffer();
    expect(
      (await http('/documents/' + issued.id + '/pdf?download=invalid', 'GET', undefined, auth))
        .status,
    ).toBe(400);
    for (const path of ['/documents/' + issued.id, '/documents/' + issued.id + '/pdf']) {
      expect((await http(path)).status).toBe(403);
      expect((await http(path, 'GET', undefined, { Cookie: '' })).status).toBe(401);
      expect(
        (
          await http(path, 'GET', undefined, {
            Cookie: 'cms_session=' + adminToken,
            'X-Branch-ID': String(otherBranch),
          })
        ).status,
      ).toBe(404);
    }
    if (process.env.QA_DOCUMENT_ARTIFACTS === '1')
      await writeFile(new URL('../.local/qa-mc-letter.pdf', import.meta.url), bytes);
  });
  it('explicit diagnosis permission is retained in preview/PDF and tampered snapshots are blocked', async () => {
    const p = await patient(),
      e = await encounter(p.id, [], { assessment: 'VISIBLE-DIAGNOSIS-CHOICE' });
    const issued = await service.issueDocument(ctx, {
      encounterId: e.id,
      kind: 'MC',
      startDate: '2035-02-01',
      days: 1,
      diagnosisRedacted: false,
      clinicalNotes: '',
    });
    const preview = await service.documentPreview(ctx, issued.id);
    expect(preview.diagnosis).toBe('VISIBLE-DIAGNOSIS-CHOICE');
    const pdf = await http('/documents/' + issued.id + '/pdf', 'GET', undefined, {
      Cookie: 'cms_session=' + doctorToken,
    });
    expect(pdfText(Buffer.from(await pdf.arrayBuffer()))).toContain('VISIBLE-DIAGNOSIS-CHOICE');
    await sql.query(
      "UPDATE clinical_documents SET payload=JSON_SET(payload,'$.patientName','ALTERED SNAPSHOT') WHERE id=?",
      [issued.id],
    );
    for (const path of ['/documents/' + issued.id, '/documents/' + issued.id + '/pdf']) {
      const rejected = await adminHttp(path);
      expect(rejected.status).toBe(409);
      expect(await rejected.json()).toMatchObject({ code: 'DOCUMENT_INTEGRITY_FAILED' });
    }
  });
  it('prescription activity reports actual quantities, batches, timestamps and frequency before/after dispense', async () => {
    const p = await patient(),
      i = await item({ name: 'QA Frequency Medicine' });
    const early = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'LOG-EARLY',
      expiresOn: '2035-01-01',
      quantity: 2,
    });
    const late = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'LOG-LATE',
      expiresOn: '2036-01-01',
      quantity: 6,
    });
    const e = await encounter(p.id, [
      { ...rx(i.id, 5), frequencyPerDay: 3, mealTiming: 'BEFORE_MEAL', durationDays: 2 },
    ]);
    const before = await (await adminHttp('/encounters/' + e.id + '/prescription-log')).json();
    expect(before).toMatchObject({ encounterId: e.id, patientId: p.id, patientName: p.name });
    expect(before.events.filter((event: any) => event.type === 'PRESCRIBED')).toHaveLength(1);
    expect(
      before.events
        .filter((event: any) => event.type === 'RESERVED')
        .map((event: any) => [event.batchId, event.quantity]),
    ).toEqual([
      [early.id, 2],
      [late.id, 3],
    ]);
    expect(
      before.events.every(
        (event: any) =>
          event.frequencyPerDay === 3 &&
          event.mealTiming === 'BEFORE_MEAL' &&
          event.durationDays === 2 &&
          event.actorName === 'QA Doctor' &&
          Number.isFinite(Date.parse(event.at)),
      ),
    ).toBe(true);
    const key = randomUUID();
    await service.dispense(ctx, { encounterId: e.id, idempotencyKey: key });
    await service.dispense(ctx, { encounterId: e.id, idempotencyKey: key });
    const after = await (await adminHttp('/encounters/' + e.id + '/prescription-log')).json();
    const dispensing = after.events.filter((event: any) => event.type === 'DISPENSED');
    expect(dispensing.map((event: any) => [event.batchNumber, event.quantity])).toEqual([
      ['LOG-EARLY', 2],
      ['LOG-LATE', 3],
    ]);
    expect(
      dispensing.every(
        (event: any) => event.frequencyPerDay === 3 && event.actorName === 'QA Doctor',
      ),
    ).toBe(true);
    expect(after.events.map((event: any) => event.at)).toEqual(
      [...after.events.map((event: any) => event.at)].sort(),
    );
    expect(after).not.toHaveProperty('subjective');
    expect(after).not.toHaveProperty('assessment');
    expect(JSON.stringify(after)).not.toContain('password');
    expect((await http('/encounters/' + e.id + '/prescription-log')).status).toBe(403);
    expect(
      (await http('/encounters/' + e.id + '/prescription-log', 'GET', undefined, { Cookie: '' }))
        .status,
    ).toBe(401);
    expect(
      (
        await http('/encounters/' + e.id + '/prescription-log', 'GET', undefined, {
          Cookie: 'cms_session=' + adminToken,
          'X-Branch-ID': String(otherBranch),
        })
      ).status,
    ).toBe(404);
    const history = await (
      await adminHttp('/dispensary/history?search=QA%20Frequency%20Medicine')
    ).json();
    expect(history.data.find((row: any) => row.id === e.id)).toMatchObject({ dispensed: true });
    expect(history.data.find((row: any) => row.id === e.id)).not.toHaveProperty('prescriptions');
  });
  it('inventory-only activity access is allowed without SOAP or document access', async () => {
    const p = await patient(),
      e = await encounter(p.id);
    const original = (await (await adminHttp('/admin/role-modules')).json()).roles.find(
      (row: any) => row.role === 'RECEPTIONIST',
    ).modules;
    try {
      await adminHttp('/admin/role-modules', 'PUT', {
        role: 'RECEPTIONIST',
        modules: ['inventory'],
      });
      expect((await http('/encounters/' + e.id + '/prescription-log')).status).toBe(200);
      expect((await http('/dispensary/history')).status).toBe(200);
      expect((await http('/encounters')).status).toBe(403);
      expect((await http('/documents/' + fixtureId())).status).toBe(403);
    } finally {
      await adminHttp('/admin/role-modules', 'PUT', { role: 'RECEPTIONIST', modules: original });
    }
  });
  it('historical unreserved Rx and draft charts produce accurate read-only activity', async () => {
    const p = await patient(),
      i = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'HISTORICAL-LOG',
      expiresOn: '2035-01-01',
      quantity: 3,
    });
    const e = await encounter(p.id, [rx(i.id)], { status: 'DRAFT' });
    expect((await service.prescriptionLog(ctx, e.id)).events).toEqual([]);
    await sql.query("UPDATE encounters SET status='SIGNED',signed_at=NOW() WHERE id=?", [e.id]);
    expect(
      (await service.prescriptionLog(ctx, e.id)).events.map((event: any) => event.type),
    ).toEqual(['PRESCRIBED']);
    await service.dispense(ctx, { encounterId: e.id, idempotencyKey: randomUUID() });
    const events = (await service.prescriptionLog(ctx, e.id)).events;
    expect(events.map((event: any) => event.type)).toEqual(['PRESCRIBED', 'DISPENSED']);
    expect(events.at(-1)).toMatchObject({ quantity: 3, batchNumber: 'HISTORICAL-LOG' });
    expect(
      await rows('SELECT id FROM prescription_reservations WHERE encounter_id=?', [e.id]),
    ).toHaveLength(0);
  });
  it('released expired reservation remains in activity beside actual fresh-batch dispensing', async () => {
    const p = await patient(),
      i = await item();
    const old = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'LOG-EXPIRED',
      expiresOn: '2035-01-01',
      quantity: 3,
    });
    const e = await encounter(p.id, [rx(i.id)]);
    await sql.query("UPDATE inventory_batches SET expires_on='2020-01-01' WHERE id=?", [old.id]);
    const fresh = await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'LOG-FRESH',
      expiresOn: '2036-01-01',
      quantity: 3,
    });
    await service.dispense(ctx, { encounterId: e.id, idempotencyKey: randomUUID() });
    const events = (await service.prescriptionLog(ctx, e.id)).events;
    expect(events.find((event: any) => event.type === 'RELEASED')).toMatchObject({
      batchId: old.id,
      quantity: 3,
      batchNumber: 'LOG-EXPIRED',
    });
    expect(events.find((event: any) => event.type === 'DISPENSED')).toMatchObject({
      batchId: fresh.id,
      quantity: 3,
      batchNumber: 'LOG-FRESH',
    });
  });
  it('renders long referral content across pages without leaking redacted diagnosis', async () => {
    const p = await patient({ name: 'Fictional QA Long Letter' }),
      e = await encounter(p.id, [], { assessment: 'SECRET-LONG-DIAGNOSIS' });
    const issued = await service.issueDocument(ctx, {
      encounterId: e.id,
      kind: 'REFERRAL',
      target: 'Fictional Specialist',
      reason: 'LONGWORD'.repeat(900),
      diagnosisRedacted: true,
      clinicalNotes: '',
    });
    const response = await adminHttp('/documents/' + issued.id + '/pdf');
    expect(response.status).toBe(200);
    const bytes = Buffer.from(await response.arrayBuffer()),
      text = pdfText(bytes);
    expect(text).toContain('REFERRAL LETTER');
    expect(text).toContain('Fictional Specialist');
    expect(text).not.toContain('SECRET-LONG-DIAGNOSIS');
    expect([...bytes.toString('latin1').matchAll(/\/Type \/Page\b/g)].length).toBeGreaterThan(1);
    if (process.env.QA_DOCUMENT_ARTIFACTS === '1')
      await writeFile(new URL('../.local/qa-referral-long.pdf', import.meta.url), bytes);
  });
  it('assigns unique increasing numeric patient primary keys and foreign-key relations', async () => {
    const first = await patient({ name: 'Numbered patient ' + randomUUID() }),
      second = await patient();
    expect(Number.isSafeInteger(first.patientNumber)).toBe(true);
    expect(first.patientNumber).toBeGreaterThan(0);
    expect(second.patientNumber).toBeGreaterThan(first.patientNumber);
    expect(Number.isSafeInteger(first.id)).toBe(true);
    expect(first.id).toBeGreaterThan(0);
    expect(second.id).toBeGreaterThan(first.id);
    expect((await (await http('/patients/' + first.id)).json()).patientNumber).toBe(
      first.patientNumber,
    );
    const ref = (
      await (await http('/references/patients?search=' + encodeURIComponent(first.name))).json()
    ).data[0];
    expect(ref).toMatchObject({ id: first.id, patientNumber: first.patientNumber });
    const banner = await (await adminHttp('/clinical/patients/' + first.id)).json();
    expect(banner.patientNumber).toBe(first.patientNumber);
    const i = await item();
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'ID-FK',
      expiresOn: '2030-01-01',
      quantity: 3,
    });
    const chart = await encounter(first.id, [rx(i.id)]);
    const pending = (await (await adminHttp('/dispensary/encounters')).json()).data.find(
      (e: any) => e.id === chart.id,
    );
    expect(pending).toMatchObject({ patientId: first.id, patientNumber: first.patientNumber });
    const persisted = (
      await rows(
        'SELECT e.patient_id,p.id patient_number FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE e.id=?',
        [chart.id],
      )
    )[0];
    expect(persisted.patient_id).toBe(first.id);
    expect(Number(persisted.patient_number)).toBe(first.patientNumber);
  });
  it('retains numeric tenant branch and patient identities through name changes', async () => {
    const before = await (await adminHttp('/bootstrap')).json();
    expect(before.tenant).toMatchObject({ id: tenant });
    expect(Number.isSafeInteger(before.tenant.tenantNumber)).toBe(true);
    expect(before.tenant.tenantNumber).toBeGreaterThan(0);
    expect(
      before.branches.every((b: any) => Number.isSafeInteger(b.branchNumber) && b.branchNumber > 0),
    ).toBe(true);
    expect(new Set(before.branches.map((b: any) => b.branchNumber)).size).toBe(
      before.branches.length,
    );
    const p = await patient();
    const updated = await service.savePatient(
      ctx,
      {
        name: 'Renamed patient',
        nationalId: p.nationalId,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        version: p.version,
      },
      p.id,
    );
    expect(updated.patientNumber).toBe(p.patientNumber);
    expect(updated.id).toBe(p.id);
    await sql.query('UPDATE tenants SET name=? WHERE id=?', ['Renamed QA tenant', tenant]);
    await sql.query('UPDATE branches SET name=? WHERE id=?', ['Renamed QA Main', branch]);
    try {
      const after = await (await adminHttp('/bootstrap')).json();
      expect(after.tenant.tenantNumber).toBe(before.tenant.tenantNumber);
      expect(after.branches.find((b: any) => b.id === branch).branchNumber).toBe(
        before.branches.find((b: any) => b.id === branch).branchNumber,
      );
    } finally {
      await sql.query('UPDATE tenants SET name=? WHERE id=?', ['QA Tenant', tenant]);
      await sql.query('UPDATE branches SET name=? WHERE id=?', ['QA Main', branch]);
    }
    const primary = await rows(
      "SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=? AND CONSTRAINT_NAME='PRIMARY' AND TABLE_NAME IN ('tenants','branches','patients')",
      [database],
    );
    expect(primary).toHaveLength(3);
    expect(primary.every((r: any) => r.COLUMN_NAME === 'id')).toBe(true);
  });
  it('rejects nonpositive malformed and unsafe numeric resource identifiers', async () => {
    for (const value of ['0', '-1', '1.5', 'abc', '1e3', '9007199254740992']) {
      const response = await adminHttp('/patients/' + value);
      expect(response.status, value).toBe(400);
    }
    for (const patientId of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'abc', '1e3'])
      expect((await http('/queue', 'POST', { patientId })).status).toBe(400);
    expect((await adminHttp('/patients/999999999')).status).toBe(404);
    const p = await patient();
    expect((await http('/patients/' + p.id)).status).toBe(200);
  });
  it('uses auto-increment numeric primary keys consistently across all entity tables', async () => {
    const entities = [
      'tenants',
      'branches',
      'users',
      'rooms',
      'patients',
      'appointments',
      'queue_tickets',
      'encounters',
      'inventory_items',
      'inventory_batches',
      'dispenses',
      'stock_movements',
      'treatment_packages',
      'package_redemptions',
      'invoices',
      'payments',
      'patient_deposits',
      'commission_ledger',
      'clinical_documents',
      'clinical_photos',
      'notification_outbox',
      'audit_logs',
    ];
    const columns = await rows(
      "SELECT TABLE_NAME,DATA_TYPE,COLUMN_TYPE,EXTRA,COLUMN_KEY FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND COLUMN_NAME='id'",
      [database],
    );
    for (const name of entities) {
      const column = columns.find((c: any) => c.TABLE_NAME === name);
      expect(column, name).toBeDefined();
      expect(column.DATA_TYPE, name).toBe('bigint');
      expect(column.COLUMN_TYPE, name).toContain('unsigned');
      expect(column.EXTRA, name).toContain('auto_increment');
      expect(column.COLUMN_KEY, name).toBe('PRI');
    }
    const references = await rows(
      "SELECT k.TABLE_NAME,k.COLUMN_NAME,c.DATA_TYPE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=k.TABLE_SCHEMA AND c.TABLE_NAME=k.TABLE_NAME AND c.COLUMN_NAME=k.COLUMN_NAME WHERE k.TABLE_SCHEMA=? AND k.REFERENCED_COLUMN_NAME='id'",
      [database],
    );
    expect(references.length).toBeGreaterThan(30);
    expect(references.every((r: any) => r.DATA_TYPE === 'bigint')).toBe(true);
    const p = await patient(),
      e = await encounter(p.id),
      bill = await service.createInvoice(ctx, invoice(p.id));
    expect([p.id, e.id, bill.id].every(Number.isSafeInteger)).toBe(true);
    expect(
      (await rows('SELECT patient_id,practitioner_id FROM encounters WHERE id=?', [e.id]))[0],
    ).toEqual({ patient_id: p.id, practitioner_id: doctor });
    expect(
      (await rows('SELECT patient_id FROM invoices WHERE id=?', [bill.id]))[0].patient_id,
    ).toBe(p.id);
  });
  it('admin catalogs enforce branch, CSRF, active references and optimistic versions', async () => {
    const input = { kind: 'LAB_PANEL', label: 'QA Catalog Panel', sortOrder: 3 };
    for (const [kind, length] of [
      ['INVENTORY_UNIT', 51],
      ['SPECIMEN_TYPE', 101],
      ['LAB_PANEL', 201],
    ] as const)
      expect(
        (await adminHttp('/admin/catalogs', 'POST', { kind, label: 'x'.repeat(length) })).status,
      ).toBe(400);
    expect((await http('/admin/catalogs', 'POST', input)).status).toBe(403);
    expect(
      (await http('/admin/catalogs', 'POST', input, { Cookie: `cms_session=${doctorToken}` }))
        .status,
    ).toBe(403);
    expect(
      (
        await http('/admin/catalogs', 'POST', input, {
          Cookie: `cms_session=${adminToken}`,
          'X-CSRF-Token': '',
        })
      ).status,
    ).toBe(403);
    const createdResponse = await adminHttp('/admin/catalogs', 'POST', input);
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    try {
      expect(created).toMatchObject({ ...input, active: true, version: 1 });
      expect(Number.isSafeInteger(created.id) && created.id > 0).toBe(true);
      expect(
        (
          await adminHttp('/admin/catalogs/' + created.id, 'PUT', {
            label: input.label,
            version: 1,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await http(
            '/admin/catalogs/' + created.id,
            'PUT',
            { label: input.label, active: false, sortOrder: 3, version: 1 },
            { Cookie: `cms_session=${adminToken}`, 'X-Branch-ID': String(otherBranch) },
          )
        ).status,
      ).toBe(404);
      expect((await (await adminHttp('/references/catalogs?kind=LAB_PANEL')).json()).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.id, label: input.label })]),
      );
      expect((await http('/references/catalogs?kind=LAB_PANEL')).status).toBe(403);
      const archived = await (
        await adminHttp('/admin/catalogs/' + created.id, 'PUT', {
          label: input.label,
          active: false,
          sortOrder: 3,
          version: 1,
        })
      ).json();
      expect(archived).toMatchObject({ version: 2, active: false });
      expect(
        (
          await adminHttp('/admin/catalogs/' + created.id, 'PUT', {
            label: input.label,
            active: true,
            sortOrder: 3,
            version: 1,
          })
        ).status,
      ).toBe(409);
      expect(
        (await (await adminHttp('/references/catalogs?kind=LAB_PANEL')).json()).data.some(
          (v: any) => v.id === created.id,
        ),
      ).toBe(false);
      expect((await (await adminHttp('/admin/catalogs?kind=LAB_PANEL')).json()).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: created.id, active: false })]),
      );
    } finally {
      await sql.query('DELETE FROM reference_catalogs WHERE id=?', [created.id]);
    }
  });
  it('lab choices use active branch labels and preserve issued snapshots after catalog edits', async () => {
    const panel = await (
      await adminHttp('/admin/catalogs', 'POST', { kind: 'LAB_PANEL', label: 'QA Renal Panel' })
    ).json();
    const specimen = await (
      await adminHttp('/admin/catalogs', 'POST', { kind: 'SPECIMEN_TYPE', label: 'QA Blood' })
    ).json();
    try {
      const p = await patient(),
        e = await encounter(p.id),
        input = {
          encounterId: e.id,
          kind: 'LAB',
          panels: ['QA Renal Panel'],
          specimenType: 'QA Blood',
          clinicalNotes: 'Fictional lab request',
        };
      expect(
        (
          await http(
            '/documents',
            'POST',
            { ...input, panels: ['ARBITRARY'] },
            { Cookie: `cms_session=${doctorToken}` },
          )
        ).status,
      ).toBe(422);
      const issuedResponse = await http('/documents', 'POST', input, {
        Cookie: `cms_session=${doctorToken}`,
      });
      expect(issuedResponse.status).toBe(201);
      const issued = await issuedResponse.json();
      const before = await (await adminHttp('/documents/' + issued.id)).json();
      expect(JSON.stringify(before.fields)).toContain('QA Renal Panel');
      expect(JSON.stringify(before.fields)).toContain('QA Blood');
      await adminHttp('/admin/catalogs/' + panel.id, 'PUT', {
        label: 'QA Renal Panel V2',
        active: true,
        sortOrder: 0,
        version: panel.version,
      });
      expect(
        (await http('/documents', 'POST', input, { Cookie: `cms_session=${doctorToken}` })).status,
      ).toBe(422);
      const changed = await http(
        '/documents',
        'POST',
        { ...input, panels: ['QA Renal Panel V2'] },
        { Cookie: `cms_session=${doctorToken}` },
      );
      expect(changed.status).toBe(201);
      expect(await (await adminHttp('/documents/' + issued.id)).json()).toEqual(before);
      await adminHttp('/admin/catalogs/' + panel.id, 'PUT', {
        label: 'QA Renal Panel V2',
        active: false,
        sortOrder: 0,
        version: 2,
      });
      expect(
        (
          await http(
            '/documents',
            'POST',
            { ...input, panels: ['QA Renal Panel V2'] },
            { Cookie: `cms_session=${doctorToken}` },
          )
        ).status,
      ).toBe(422);
    } finally {
      await sql.query('DELETE FROM reference_catalogs WHERE id IN (?,?)', [panel.id, specimen.id]);
    }
  });
  it('archived medication blocks new prescriptions but retains signed dispensing and authoritative snapshots', async () => {
    const p = await patient(),
      i = await item({ name: 'QA Historical Medicine' });
    await service.receiveBatch(ctx, {
      itemId: i.id,
      batchNumber: 'ARCHIVE-RX',
      expiresOn: '2035-01-01',
      quantity: 5,
    });
    const e = await encounter(p.id, [
      {
        ...rx(i.id, 3),
        itemName: 'FORGED NAME',
        ingredient: 'FORGED INGREDIENT',
        unit: 'FORGED UNIT',
      },
    ]);
    expect(e.prescriptions[0]).toMatchObject({
      itemName: i.name,
      ingredient: i.ingredient,
      unit: i.unit,
    });
    const input = {
      name: 'QA Renamed Catalog Medicine',
      sku: i.sku,
      ingredient: i.ingredient,
      category: i.category,
      unit: i.unit,
      priceCents: i.priceCents,
      reorderLevel: i.reorderLevel,
      active: false,
      version: i.version,
    };
    expect(
      (
        await http('/admin/inventory/' + i.id, 'PUT', input, {
          Cookie: `cms_session=${doctorToken}`,
        })
      ).status,
    ).toBe(403);
    expect(
      (await adminHttp('/admin/inventory/' + i.id, 'PUT', { ...input, unit: 'bottle' })).status,
    ).toBe(409);
    expect(
      (await adminHttp('/admin/inventory/' + i.id, 'PUT', { ...input, ingredient: 'changed' }))
        .status,
    ).toBe(409);
    const archivedResponse = await adminHttp('/admin/inventory/' + i.id, 'PUT', input);
    expect(archivedResponse.status).toBe(200);
    expect(await archivedResponse.json()).toMatchObject({ active: false, version: i.version + 1 });
    expect((await adminHttp('/admin/inventory/' + i.id, 'PUT', input)).status).toBe(409);
    expect(
      (await (await adminHttp('/references/medications?search=QA%20Historical%20Medicine')).json())
        .data,
    ).toEqual([]);
    await expect(encounter(p.id, [rx(i.id)])).rejects.toMatchObject({
      code: 'INACTIVE_MEDICATION',
    });
    await service.dispense(ctx, { encounterId: e.id, idempotencyKey: randomUUID() });
    expect(
      (await service.prescriptionLog(ctx, e.id)).events.find((v: any) => v.type === 'DISPENSED'),
    ).toMatchObject({ itemName: 'QA Historical Medicine', quantity: 3 });
    expect(
      (await rows('SELECT quantity FROM inventory_batches WHERE item_id=?', [i.id]))[0].quantity,
    ).toBe(2);
    expect(
      (await rows('SELECT prescriptions FROM encounters WHERE id=?', [e.id]))[0].prescriptions[0],
    ).toMatchObject({ itemName: i.name, ingredient: i.ingredient, unit: i.unit });
    const dose = await service.recordMedicationDose(ctx, e.id, {
      itemId: i.id,
      outcome: 'TAKEN',
      source: 'PATIENT_REPORTED',
      occurredAt: '2026-01-01T00:00:00Z',
      amount: 0.5,
      idempotencyKey: randomUUID(),
    });
    expect(dose).toMatchObject({ medicineName: 'QA Historical Medicine', unit: 'tablet' });
  });
  it('medication references search before the cap and separate active choices from historical lookup', async () => {
    const target = await item({ name: 'ZZZ QA Catalog Search Needle' });
    const values = Array.from({ length: 201 }, (_, index) => [
      fixtureId(),
      tenant,
      branch,
      'AAA QA Choice ' + index,
      'QA-CHOICE-' + randomUUID(),
      'qa',
      'MEDICATION',
      'tablet',
      100,
      2,
    ]);
    await sql.query(
      'INSERT INTO inventory_items(id,tenant_id,branch_id,name,sku,ingredient,category,unit,price_cents,reorder_level) VALUES ?',
      [values],
    );
    try {
      expect((await (await adminHttp('/references/medications')).json()).data).toHaveLength(200);
      const found = (
        await (
          await adminHttp('/references/medications?search=ZZZ%20QA%20Catalog%20Search%20Needle')
        ).json()
      ).data;
      expect(found).toEqual([expect.objectContaining({ id: target.id, active: true })]);
      await sql.query('UPDATE inventory_items SET active=0 WHERE id=?', [target.id]);
      expect(
        (
          await (
            await adminHttp('/references/medications?search=ZZZ%20QA%20Catalog%20Search%20Needle')
          ).json()
        ).data,
      ).toEqual([]);
      expect(
        (
          await (
            await adminHttp(
              '/references/medications?includeInactive=1&search=ZZZ%20QA%20Catalog%20Search%20Needle',
            )
          ).json()
        ).data,
      ).toEqual([expect.objectContaining({ id: target.id, active: false })]);
      expect(
        (
          await (
            await http(
              '/references/medications?search=ZZZ%20QA%20Catalog%20Search%20Needle',
              'GET',
              undefined,
              { Cookie: `cms_session=${adminToken}`, 'X-Branch-ID': String(otherBranch) },
            )
          ).json()
        ).data,
      ).toEqual([]);
    } finally {
      await sql.query('DELETE FROM inventory_items WHERE id IN (?)', [values.map((v) => v[0])]);
    }
  });
  it('renames branches with version and CSRF guards and archives without deleting history', async () => {
    const b = await (
      await adminHttp('/admin/branches', 'POST', {
        name: 'QA Settings Branch',
        address: 'QA Address',
      })
    ).json();
    const edit = { name: 'QA Renamed Branch', address: 'QA New Address', active: true, version: 1 };
    expect((await http(`/admin/branches/${b.id}`, 'PUT', edit)).status).toBe(403);
    expect(
      (
        await http(`/admin/branches/${b.id}`, 'PUT', edit, {
          Cookie: `cms_session=${adminToken}`,
          'X-CSRF-Token': 'wrong',
        })
      ).status,
    ).toBe(403);
    expect(await (await adminHttp(`/admin/branches/${b.id}`, 'PUT', edit)).json()).toMatchObject({
      ...edit,
      version: 2,
      id: b.id,
    });
    expect((await adminHttp(`/admin/branches/${b.id}`, 'PUT', edit)).status).toBe(409);
    expect((await adminHttp(`/admin/branches/${fixtureId()}`, 'PUT', edit)).status).toBe(404);
    expect(
      (
        await adminHttp(`/admin/branches/${branch}`, 'PUT', {
          name: 'QA Main',
          address: '',
          active: false,
          version: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (await adminHttp(`/admin/branches/${b.id}`, 'PUT', { ...edit, active: false, version: 2 }))
        .status,
    ).toBe(200);
    expect((await rows('SELECT active,version FROM branches WHERE id=?', [b.id]))[0]).toMatchObject(
      { active: 0, version: 3 },
    );
    expect(
      (await (await adminHttp('/bootstrap')).json()).branches.some((v: any) => v.id === b.id),
    ).toBe(false);
    expect(
      (
        await http('/bootstrap', 'GET', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-Branch-ID': String(b.id),
        })
      ).status,
    ).toBe(403);
  });
  it('protects active home staff during archive and requires branch restoration before staff activation', async () => {
    const b = await (
        await adminHttp('/admin/branches', 'POST', { name: 'QA Staff Home', address: '' })
      ).json(),
      userId = fixtureId();
    await sql.query(
      'INSERT INTO users(id,tenant_id,branch_id,email,name,password_hash,role) VALUES(?,?,?,?,?,?,?)',
      [userId, tenant, b.id, randomUUID() + '@example.invalid', 'QA Staff', 'test-only', 'NURSE'],
    );
    const input = { name: b.name, address: '', active: false, version: 1 };
    const denied = await adminHttp(`/admin/branches/${b.id}`, 'PUT', input);
    expect(denied.status).toBe(409);
    expect((await denied.json()).code).toBe('BRANCH_HAS_ACTIVE_STAFF');
    expect(
      await (await adminHttp(`/admin/users/${userId}`, 'PUT', { name: 'QA Renamed Staff' })).json(),
    ).toMatchObject({ id: userId, name: 'QA Renamed Staff', active: true });
    expect((await adminHttp(`/admin/users/${userId}`, 'PUT', {})).status).toBe(400);
    expect((await adminHttp(`/admin/users/${userId}`, 'PUT', { active: false })).status).toBe(200);
    expect((await adminHttp(`/admin/branches/${b.id}`, 'PUT', input)).status).toBe(200);
    const deniedActivation = await adminHttp(`/admin/users/${userId}`, 'PUT', { active: true });
    expect(deniedActivation.status).toBe(409);
    expect((await deniedActivation.json()).code).toBe('INACTIVE_BRANCH');
  });
  it('deletes unused rooms, archives referenced rooms, and protects busy or future-booked rooms', async () => {
    const create = async (name: string) =>
      (await (await adminHttp('/admin/rooms', 'POST', { name, branchId: branch })).json()).id;
    const unused = await create('QA Unused Removal');
    expect((await http(`/admin/rooms/${unused}`, 'DELETE')).status).toBe(403);
    expect(
      (
        await http(`/admin/rooms/${unused}`, 'DELETE', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-CSRF-Token': 'wrong',
        })
      ).status,
    ).toBe(403);
    expect(await (await adminHttp(`/admin/rooms/${unused}`, 'DELETE')).json()).toEqual({
      id: unused,
      removed: 'deleted',
    });
    expect(await rows('SELECT id FROM rooms WHERE id=?', [unused])).toEqual([]);
    const used = await create('QA Used Removal'),
      p = await patient();
    await sql.query(
      "INSERT INTO appointments(tenant_id,branch_id,patient_id,practitioner_id,room_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,'COMPLETED')",
      [tenant, branch, p.id, doctor, used, '2020-01-01 10:00:00', '2020-01-01 11:00:00'],
    );
    expect(await (await adminHttp(`/admin/rooms/${used}`, 'DELETE')).json()).toEqual({
      id: used,
      removed: 'archived',
    });
    expect((await rows('SELECT active FROM rooms WHERE id=?', [used]))[0].active).toBe(0);
    const booked = await create('QA Booked Removal');
    await sql.query(
      "INSERT INTO appointments(tenant_id,branch_id,patient_id,practitioner_id,room_id,starts_at,ends_at,status) VALUES(?,?,?,?,?,?,?,'BOOKED')",
      [tenant, branch, p.id, doctor, booked, '2090-01-01 10:00:00', '2090-01-01 11:00:00'],
    );
    expect((await adminHttp(`/admin/rooms/${booked}`, 'DELETE')).status).toBe(409);
    const busy = await create('QA Busy Removal'),
      ticket = await service.checkIn(ctx, { patientId: p.id, priority: 'NORMAL' });
    await sql.query("UPDATE queue_tickets SET room_id=?,status='CALLED_TO_ROOM' WHERE id=?", [
      busy,
      ticket.id,
    ]);
    expect((await adminHttp(`/admin/rooms/${busy}`, 'DELETE')).status).toBe(409);
    await sql.query("UPDATE queue_tickets SET status='COMPLETED' WHERE id=?", [ticket.id]);
    expect(
      (
        await http(`/admin/rooms/${busy}`, 'DELETE', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-Branch-ID': String(otherBranch),
        })
      ).status,
    ).toBe(404);
  });
  it('keeps receipt snapshots immutable, exact split tender totals and scoped private-field-free previews', async () => {
    const p = await patient({ name: 'QA Receipt Patient', nationalId: '900615-00-0001' }),
      bill = await service.createInvoice(ctx, invoice(p.id));
    expect(bill.receiptSnapshot).toMatchObject({
      clinicName: 'QA Tenant',
      branchName: 'QA Main',
      patientName: 'QA Receipt Patient',
      nationalId: '900615-00-0001',
      receivedBy: 'QA Doctor',
    });
    await sql.query('UPDATE patients SET name=? WHERE id=?', ['QA Later Name', p.id]);
    const response = await adminHttp(`/invoices/${bill.id}/receipt-view`);
    expect(response.status).toBe(200);
    const view = await response.json();
    expect(view).toMatchObject({
      id: bill.id,
      clinicName: 'QA Tenant',
      patientName: 'QA Receipt Patient',
      nationalId: '900615-00-0001',
      receivedBy: 'QA Doctor',
      totalCents: 1000,
      simulated: false,
    });
    expect(view.lines[0].amountCents).toBe(1000);
    expect(view.payments.reduce((sum: number, p: any) => sum + p.amountCents, 0)).toBe(1000);
    expect(JSON.stringify(view)).not.toMatch(/requestHash|idempotencyKey|password|tenantId/);
    expect(
      (await http(`/invoices/${bill.id}/receipt-view`, 'GET', undefined, { Cookie: '' })).status,
    ).toBe(401);
    expect(
      (
        await http(`/invoices/${bill.id}/receipt-view`, 'GET', undefined, {
          Cookie: `cms_session=${adminToken}`,
          'X-Branch-ID': String(otherBranch),
        })
      ).status,
    ).toBe(404);
    await sql.query(
      "INSERT INTO role_module_permissions(tenant_id,role,modules) VALUES(?,'RECEPTIONIST',?) ON DUPLICATE KEY UPDATE modules=VALUES(modules)",
      [tenant, JSON.stringify(['patients'])],
    );
    try {
      expect((await http(`/invoices/${bill.id}/receipt-view`)).status).toBe(403);
    } finally {
      await sql.query(
        "DELETE FROM role_module_permissions WHERE tenant_id=? AND role='RECEPTIONIST'",
        [tenant],
      );
    }
  });
  it('renders receipt PDF inline or explicit attachment with actual receipt text', async () => {
    const p = await patient({ name: 'QA PDF Receipt Patient', nationalId: 'QA-PASSPORT' }),
      bill = await service.createInvoice(ctx, invoice(p.id));
    const response = await http(`/invoices/${bill.id}/receipt`, 'GET', undefined, {
      Cookie: `cms_session=${adminToken}`,
      'X-CSRF-Token': '',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toContain('inline;');
    expect(response.headers.get('content-type')).toContain('application/pdf');
    const text = pdfText(Buffer.from(await response.arrayBuffer()));
    expect(text).toContain('OFFICIAL RECEIPT');
    expect(text).toContain('QA PDF Receipt Patient');
    expect(text).toContain('QA-PASSPORT');
    expect(text).toContain('RM');
    const download = await adminHttp(`/invoices/${bill.id}/receipt?download=1`);
    expect(download.status).toBe(200);
    expect(download.headers.get('content-disposition')).toContain('attachment;');
    await download.arrayBuffer();
  });
});
