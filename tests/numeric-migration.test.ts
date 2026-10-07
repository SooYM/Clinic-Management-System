import 'dotenv/config';
import { randomUUID, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDatabaseUrl } from './database-safety';
import { migrateNumericIds } from '../src/server/db/numeric-ids';
const canonical = (value: any): string =>
  Array.isArray(value)
    ? '[' + value.map(canonical).join(',') + ']'
    : value && typeof value === 'object'
      ? '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
      : JSON.stringify(value);
const signing = 'qa-migration-original-signing-secret-at-least-32';
const photoKey = '22'.repeat(32);
describe.skipIf(!process.env.TEST_DATABASE_URL)('real MySQL UUID to numeric backfill', () => {
  let admin: mysql.Connection, db: mysql.Connection, database: string;
  let ids: Record<string, string>, payload: any, photo: Buffer;
  const rows = async (query: string, values: any[] = []) =>
    (await db.query(query, values))[0] as any[];
  beforeEach(async () => {
    database = 'qa_' + randomUUID().replaceAll('-', '') + '_test';
    const url = new URL(testDatabaseUrl());
    admin = await mysql.createConnection(url.toString());
    await admin.query(
      'CREATE DATABASE `' + database + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
    );
    url.pathname = '/' + database;
    db = await mysql.createConnection({ uri: url.toString(), multipleStatements: true });
    for (const name of (await readdir(new URL('../db/migrations/', import.meta.url)))
      .filter((name) => name.endsWith('.sql') && name < '009')
      .sort())
      await db.query(await readFile(new URL('../db/migrations/' + name, import.meta.url), 'utf8'));
    process.env.DOCUMENT_SIGNING_KEY = signing;
    process.env.PHOTO_ENCRYPTION_KEY = photoKey;
    ids = Object.fromEntries(
      [
        'tenant',
        'branch',
        'doctor',
        'patient',
        'room',
        'queue',
        'item',
        'encounter',
        'document',
        'photo',
        'notification',
        'appointment',
      ].map((key) => [key, randomUUID()]),
    );
    await db.query('INSERT INTO tenants(id,name) VALUES(?,?)', [ids.tenant, 'Historical tenant']);
    await db.query('INSERT INTO branches(id,tenant_id,name) VALUES(?,?,?)', [
      ids.branch,
      ids.tenant,
      'Historical branch',
    ]);
    await db.query(
      "INSERT INTO users(id,tenant_id,branch_id,name,email,password_hash,role,license_number) VALUES(?,?,?,?,?,?,'DOCTOR',?)",
      [
        ids.doctor,
        ids.tenant,
        ids.branch,
        'Historical doctor',
        'historical@example.invalid',
        'not-used',
        'LICENSE',
      ],
    );
    await db.query('INSERT INTO user_branches(user_id,branch_id) VALUES(?,?)', [
      ids.doctor,
      ids.branch,
    ]);
    await db.query(
      "INSERT INTO patients(id,tenant_id,branch_id,name,national_id,date_of_birth,sex,city) VALUES(?,?,?,?,?,'1990-01-01','OTHER','Kajang')",
      [ids.patient, ids.tenant, ids.branch, 'Historical patient', 'PASSPORT'],
    );
    await db.query('INSERT INTO rooms(id,tenant_id,branch_id,name) VALUES(?,?,?,?)', [
      ids.room,
      ids.tenant,
      ids.branch,
      'Historical room',
    ]);
    await db.query(
      "INSERT INTO queue_tickets(id,tenant_id,branch_id,patient_id,ticket_number,service_date,status,room_id,practitioner_id) VALUES(?,?,?,?,?,'2030-01-01','IN_CONSULTATION',?,?)",
      [ids.queue, ids.tenant, ids.branch, ids.patient, 'OLD-1', ids.room, ids.doctor],
    );
    await db.query(
      'INSERT INTO inventory_items(id,tenant_id,branch_id,name,sku,price_cents) VALUES(?,?,?,?,?,100)',
      [ids.item, ids.tenant, ids.branch, 'Historical drug', 'HISTORICAL'],
    );
    const prescriptions = [
      {
        itemId: ids.item,
        quantity: 2,
        dosage: 'One tablet',
        durationDays: 5,
        frequencyPerDay: 2,
        mealTiming: 'AFTER_MEAL',
      },
    ];
    await db.query(
      "INSERT INTO encounters(id,tenant_id,branch_id,patient_id,practitioner_id,queue_ticket_id,subjective,objective,assessment,plan,procedure_notes,prescriptions,vitals,status) VALUES(?,?,?,?,?,?,'History','Stable','Assessment','Review','',?,?,'SIGNED')",
      [
        ids.encounter,
        ids.tenant,
        ids.branch,
        ids.patient,
        ids.doctor,
        ids.queue,
        JSON.stringify(prescriptions),
        JSON.stringify({ patientId: 'free-text vital key', resp_rate: 18 }),
      ],
    );
    payload = {
      kind: 'MC',
      diagnosisRedacted: true,
      encounterId: ids.encounter,
      patientId: ids.patient,
      practitionerId: ids.doctor,
      branchId: ids.branch,
      patientName: 'Historical patient',
      documentNumber: 'MC-HISTORY',
      startDate: '2030-01-01',
      endDate: '2030-01-01',
      issuedAt: '2030-01-01T00:00:00.000Z',
      prescriptions,
      vitals: { patientId: 'free-text vital key', resp_rate: 18 },
    };
    await db.query(
      "INSERT INTO clinical_documents(id,tenant_id,branch_id,encounter_id,patient_id,practitioner_id,kind,document_number,payload,start_date,end_date,verification_hash,signature_hash,created_at) VALUES(?,?,?,?,?,?,'MC','MC-HISTORY',?,'2030-01-01','2030-01-01',?,?,'2030-01-01 00:00:00.000')",
      [
        ids.document,
        ids.tenant,
        ids.branch,
        ids.encounter,
        ids.patient,
        ids.doctor,
        JSON.stringify(payload),
        'verify-historical',
        createHmac('sha256', signing).update(canonical(payload)).digest('hex'),
      ],
    );
    photo = Buffer.from('89504e470d0a1a0a', 'hex');
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', Buffer.from(photoKey, 'hex'), iv);
    cipher.setAAD(Buffer.from([ids.tenant, ids.branch, ids.encounter, ids.photo].join(':')));
    const encrypted = Buffer.concat([cipher.update(photo), cipher.final()]);
    await db.query(
      "INSERT INTO clinical_photos(id,tenant_id,branch_id,encounter_id,patient_id,actor_id,stage,mime_type,encrypted_data,iv,auth_tag,consent_recorded) VALUES(?,?,?,?,?,?,'BEFORE','image/png',?,?,?,1)",
      [
        ids.photo,
        ids.tenant,
        ids.branch,
        ids.encounter,
        ids.patient,
        ids.doctor,
        encrypted,
        iv,
        cipher.getAuthTag(),
      ],
    );
    await db.query(
      "INSERT INTO appointments(id,tenant_id,branch_id,patient_id,practitioner_id,room_id,starts_at,ends_at) VALUES(?,?,?,?,?,?,'2030-01-01 00:00:00','2030-01-01 00:30:00')",
      [ids.appointment, ids.tenant, ids.branch, ids.patient, ids.doctor, ids.room],
    );
    await db.query(
      "INSERT INTO notification_outbox(id,tenant_id,branch_id,patient_id,channel,template,recipient,payload,deduplication_key) VALUES(?,?,?,?,'EMAIL','BOOKING','historical@example.invalid',?,?)",
      [
        ids.notification,
        ids.tenant,
        ids.branch,
        ids.patient,
        JSON.stringify({ patientId: ids.patient, practitionerId: ids.doctor, roomId: ids.room }),
        `booking:${ids.appointment}:EMAIL`,
      ],
    );
    for (const [template, key] of [
      ['QUEUE_NEAR', `queue-near:${ids.queue}:EMAIL`],
      ['REFILL', `refill:${ids.encounter}:${ids.item}:2030-01-01:EMAIL`],
    ])
      await db.query(
        "INSERT INTO notification_outbox(id,tenant_id,branch_id,patient_id,channel,template,recipient,payload,deduplication_key) VALUES(?,?,?,?,'EMAIL',?,'historical@example.invalid','{}',?)",
        [randomUUID(), ids.tenant, ids.branch, ids.patient, template, key],
      );
    await db.query(
      "INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id) VALUES(?,?,?,'PHOTO_CREATED','clinical_photo',?,'historical-request')",
      [ids.tenant, ids.branch, ids.doctor, ids.photo],
    );
    await db.query(
      "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES('old-secret',?,'old-csrf','2035-01-01')",
      [ids.doctor],
    );
    await db.query("INSERT INTO resource_locks(lock_key) VALUES('old-lock')");
  });
  afterEach(async () => {
    if (db) await db.end();
    if (admin) {
      try {
        if (!/^qa_[a-f0-9]{32}_test$/.test(database)) throw new Error('Unsafe cleanup');
        await admin.query('DROP DATABASE `' + database + '`');
      } finally {
        await admin.end();
      }
    }
  });
  it('maps historical rows JSON signed documents and encrypted photos without losing relationships', async () => {
    await migrateNumericIds(db);
    const e = (await rows('SELECT * FROM encounters'))[0],
      p = (await rows('SELECT * FROM patients'))[0],
      d = (await rows('SELECT * FROM clinical_documents'))[0],
      image = (await rows('SELECT * FROM clinical_photos'))[0],
      item = (await rows('SELECT * FROM inventory_items'))[0];
    expect(typeof p.id).toBe('number');
    expect(e.patient_id).toBe(p.id);
    expect(p.city).toBe('Kajang');
    expect(e.prescriptions[0].itemId).toBe(item.id);
    expect(e.vitals).toEqual(payload.vitals);
    expect(d.payload).toMatchObject({
      patientId: p.id,
      encounterId: e.id,
      practitionerId: e.practitioner_id,
      branchId: e.branch_id,
      patientName: 'Historical patient',
      documentNumber: 'MC-HISTORY',
      vitals: payload.vitals,
    });
    expect(d.signature_hash).toBe(
      createHmac('sha256', signing).update(canonical(d.payload)).digest('hex'),
    );
    expect(d.verification_hash).toBe('verify-historical');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(photoKey, 'hex'), image.iv);
    decipher.setAAD(
      Buffer.from([image.tenant_id, image.branch_id, image.encounter_id, image.id].join(':')),
    );
    decipher.setAuthTag(image.auth_tag);
    expect(Buffer.concat([decipher.update(image.encrypted_data), decipher.final()])).toEqual(photo);
    const dedup = (await rows('SELECT deduplication_key FROM notification_outbox')).map(
      (r) => r.deduplication_key,
    );
    const appointment = (await rows('SELECT id FROM appointments'))[0];
    const queue = (await rows('SELECT id FROM queue_tickets'))[0];
    expect(dedup).toEqual(
      expect.arrayContaining([
        `booking:${appointment.id}:EMAIL`,
        `queue-near:${queue.id}:EMAIL`,
        `refill:${e.id}:${item.id}:2030-01-01:EMAIL`,
      ]),
    );
    const outbox = (
      await rows("SELECT payload FROM notification_outbox WHERE template='BOOKING'")
    )[0].payload;
    expect(outbox.patientId).toBe(p.id);
    expect(typeof outbox.roomId).toBe('number');
    const audit = (await rows('SELECT entity_id,metadata FROM audit_logs'))[0];
    expect(audit.entity_id).toBe(image.id);
    expect(audit.metadata.legacyEntityId).toBe(ids.photo);
    expect(await rows('SELECT * FROM sessions')).toHaveLength(0);
    expect(await rows('SELECT * FROM resource_locks')).toHaveLength(0);
    expect(Number((await rows('SELECT @@FOREIGN_KEY_CHECKS n'))[0].n)).toBe(1);
    await expect(
      db.query('INSERT INTO user_branches(user_id,branch_id) VALUES(999999,999999)'),
    ).rejects.toMatchObject({ code: 'ER_NO_REFERENCED_ROW_2' });
    const columns = await rows(
      "SELECT DATA_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='queue_tickets' AND COLUMN_NAME IN ('active_patient_id','occupied_room_id')",
    );
    expect(columns).toHaveLength(2);
    expect(columns.every((c) => c.type === 'bigint')).toBe(true);
  });
  it('rejects tampered documents before changing schema or data', async () => {
    await db.query("UPDATE clinical_documents SET signature_hash='tampered'");
    await expect(migrateNumericIds(db)).rejects.toThrow('Document integrity');
    expect((await rows('SELECT id FROM patients'))[0].id).toBe(ids.patient);
    expect(
      (
        await rows(
          "SELECT DATA_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='patients' AND COLUMN_NAME='id'",
        )
      )[0].type,
    ).toBe('char');
    expect(await rows('SELECT * FROM sessions')).toHaveLength(1);
    expect(await rows("SHOW TABLES LIKE '_numeric_map_%'")).toHaveLength(0);
  });
  it('rejects wrong photo key before any schema mutation', async () => {
    process.env.PHOTO_ENCRYPTION_KEY = '33'.repeat(32);
    await expect(migrateNumericIds(db)).rejects.toThrow();
    expect((await rows('SELECT id FROM patients'))[0].id).toBe(ids.patient);
    expect(await rows("SHOW TABLES LIKE '_numeric_map_%'")).toHaveLength(0);
    expect(await rows('SELECT * FROM sessions')).toHaveLength(1);
  });
  it('rejects unsigned date-column tampering before conversion', async () => {
    await db.query("UPDATE clinical_documents SET end_date='2030-01-02'");
    await expect(migrateNumericIds(db)).rejects.toThrow('Document integrity');
    expect((await rows('SELECT id FROM patients'))[0].id).toBe(ids.patient);
    expect(await rows("SHOW TABLES LIKE '_numeric_map_%'")).toHaveLength(0);
  });
});
