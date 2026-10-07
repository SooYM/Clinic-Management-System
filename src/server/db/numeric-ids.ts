import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Connection, PoolConnection } from 'mysql2/promise';

const quote = (name: string) => '`' + name.replace(/`/g, '``') + '`';
const canonical = (value: any): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value);
const json = (value: any) => (typeof value === 'string' ? JSON.parse(value) : value);
const references: Record<string, string> = {
  tenantId: 'tenants',
  branchId: 'branches',
  patientId: 'patients',
  userId: 'users',
  practitionerId: 'users',
  actorId: 'users',
  roomId: 'rooms',
  encounterId: 'encounters',
  queueTicketId: 'queue_tickets',
  itemId: 'inventory_items',
  batchId: 'inventory_batches',
  dispenseId: 'dispenses',
  invoiceId: 'invoices',
  packageId: 'treatment_packages',
};

/** Version 009. MySQL DDL commits implicitly: restore the backup after an interrupted upgrade.
 * Mapping tables remain on failure for diagnosis. Never rerun against a partially converted schema.
 */
export async function migrateNumericIds(db: Connection | PoolConnection) {
  const [columns]: any = await db.query(
    'SELECT TABLE_NAME t,COLUMN_NAME c,DATA_TYPE type,IS_NULLABLE nullable,GENERATION_EXPRESSION expression FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()',
  );
  if (columns.some((c: any) => c.t.startsWith('_numeric_map_')))
    throw new Error(
      'Incomplete numeric migration. Restore the pre-upgrade backup before retrying.',
    );
  const entities = columns
    .filter((c: any) => c.c === 'id' && c.type === 'char')
    .map((c: any) => c.t) as string[];
  if (!entities.length) throw new Error('Numeric migration expects the complete pre-009 schema.');
  const [keys]: any = await db.query(
    `SELECT k.TABLE_NAME t,k.CONSTRAINT_NAME name,k.COLUMN_NAME c,k.REFERENCED_TABLE_NAME rt,k.REFERENCED_COLUMN_NAME rc,k.ORDINAL_POSITION position,r.UPDATE_RULE updateRule,r.DELETE_RULE deleteRule FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME WHERE k.TABLE_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION`,
  );
  const maps = new Map<string, Map<string, number>>();
  for (const table of entities) {
    const numberColumn = (
      { tenants: 'tenant_number', branches: 'branch_number', patients: 'patient_number' } as Record<
        string,
        string
      >
    )[table];
    const [rows]: any = await db.query(
      `SELECT id${numberColumn ? ',' + quote(numberColumn) + ' n' : ''} FROM ${quote(table)} ORDER BY ${columns.some((c: any) => c.t === table && c.c === 'created_at') ? 'created_at,' : ''}id`,
    );
    maps.set(
      table,
      new Map(
        rows.map((row: any, i: number) => [String(row.id), numberColumn ? Number(row.n) : i + 1]),
      ),
    );
  }
  const mapped = (table: string, old: any) => {
    if (old === null || old === undefined) return old;
    const result = maps.get(table)?.get(String(old));
    if (!Number.isSafeInteger(result) || !result || result < 1)
      throw new Error(`Unmapped ${table} identifier; upgrade aborted.`);
    return result;
  };
  const rewrite = (value: any): any => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          references[key] && child != null
            ? mapped(references[key], child)
            : ['vitals', 'allergies', 'conditions'].includes(key)
              ? child
              : rewrite(child),
        ]),
      );
    return value;
  };
  // Validate all protected records before the first schema mutation.
  const [documents]: any = await db.query(
    "SELECT *, DATE_FORMAT(start_date,'%Y-%m-%d') original_start, DATE_FORMAT(end_date,'%Y-%m-%d') original_end, CONCAT(DATE_FORMAT(created_at,'%Y-%m-%dT%H:%i:%s.'),LPAD(FLOOR(MICROSECOND(created_at)/1000),3,'0'),'Z') original_issued FROM clinical_documents",
  );
  const signingKey = process.env.DOCUMENT_SIGNING_KEY || '';
  if (documents.length && signingKey.length < 32)
    throw new Error('Existing documents require their original DOCUMENT_SIGNING_KEY.');
  for (const row of documents) {
    row.payload = json(row.payload);
    if (
      createHmac('sha256', signingKey).update(canonical(row.payload)).digest('hex') !==
        row.signature_hash ||
      ['patient', 'practitioner', 'branch', 'encounter'].some(
        (key) => row.payload[key + 'Id'] !== row[key + '_id'],
      ) ||
      row.payload.kind !== row.kind ||
      row.payload.documentNumber !== row.document_number ||
      (row.payload.startDate || null) !== row.original_start ||
      row.payload.endDate !== row.original_end ||
      row.payload.issuedAt !== row.original_issued ||
      Boolean(row.payload.diagnosisRedacted) !== Boolean(row.diagnosis_redacted)
    )
      throw new Error('Document integrity check failed; upgrade aborted.');
    row.updatedPayload = rewrite(row.payload);
  }
  const [photos]: any = await db.query('SELECT * FROM clinical_photos');
  const photoKey = process.env.PHOTO_ENCRYPTION_KEY || '';
  if (photos.length && !/^[a-f0-9]{64}$/i.test(photoKey))
    throw new Error('Historical photos require their original PHOTO_ENCRYPTION_KEY.');
  for (const row of photos) {
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(photoKey, 'hex'), row.iv);
    decipher.setAAD(Buffer.from(`${row.tenant_id}:${row.branch_id}:${row.encounter_id}:${row.id}`));
    decipher.setAuthTag(row.auth_tag);
    const plaintext = Buffer.concat([decipher.update(row.encrypted_data), decipher.final()]);
    row.newIv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(photoKey, 'hex'), row.newIv);
    cipher.setAAD(
      Buffer.from(
        `${mapped('tenants', row.tenant_id)}:${mapped('branches', row.branch_id)}:${mapped('encounters', row.encounter_id)}:${mapped('clinical_photos', row.id)}`,
      ),
    );
    row.newData = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    row.newTag = cipher.getAuthTag();
    plaintext.fill(0);
  }
  const jsonUpdates: { table: string; column: string; id: string; value: any }[] = [];
  for (const [table, column] of [
    ['encounters', 'prescriptions'],
    ['notification_outbox', 'payload'],
    ['invoices', 'lines'],
  ]) {
    const [rows]: any = await db.query(`SELECT id,${quote(column)} value FROM ${quote(table)}`);
    for (const row of rows)
      jsonUpdates.push({ table, column, id: row.id, value: rewrite(json(row.value)) });
  }
  const [notifications]: any = await db.query(
    'SELECT id,deduplication_key FROM notification_outbox',
  );
  const dedupUpdates = notifications.map((row: any) => {
    const parts = row.deduplication_key.split(':');
    const table = (
      {
        booking: 'appointments',
        queue: 'queue_tickets',
        'queue-near': 'queue_tickets',
        refill: 'encounters',
      } as Record<string, string>
    )[parts[0]];
    if (table) {
      parts[1] = String(mapped(table, parts[1]));
      if (parts[0] === 'refill') parts[2] = String(mapped('inventory_items', parts[2]));
    }
    return { id: row.id, key: parts.join(':') };
  });
  const resolve = (table: string, column: string, visited = new Set<string>()): string => {
    if (column === 'id' && maps.has(table)) return table;
    const tag = `${table}.${column}`;
    if (visited.has(tag)) throw new Error('Unresolved foreign key: ' + tag);
    visited.add(tag);
    const key = keys.find((k: any) => k.t === table && k.c === column);
    if (!key) throw new Error('Unresolved foreign key: ' + tag);
    return resolve(key.rt, key.rc, visited);
  };
  const foreignColumns = new Map<string, { t: string; c: string; target: string }>();
  for (const key of keys)
    foreignColumns.set(`${key.t}.${key.c}`, {
      t: key.t,
      c: key.c,
      target: resolve(key.rt, key.rc),
    });
  const constraints = new Map<string, any[]>();
  for (const key of keys) {
    const tag = `${key.t}.${key.name}`;
    constraints.set(tag, [...(constraints.get(tag) || []), key]);
  }
  for (const group of constraints.values()) {
    const condition = group.map((k) => `child.${quote(k.c)}=parent.${quote(k.rc)}`).join(' AND ');
    const present = group.map((k) => `child.${quote(k.c)} IS NOT NULL`).join(' AND ');
    const [orphans]: any = await db.query(
      `SELECT COUNT(*) n FROM ${quote(group[0].t)} child LEFT JOIN ${quote(group[0].rt)} parent ON ${condition} WHERE ${present} AND parent.${quote(group[0].rc)} IS NULL`,
    );
    if (Number(orphans[0].n))
      throw new Error('Pre-upgrade foreign key integrity failed: ' + group[0].name);
  }
  await db.query('SET FOREIGN_KEY_CHECKS=0');
  try {
    for (const table of entities) {
      await db.query(
        `CREATE TABLE ${quote('_numeric_map_' + table)} (old_id CHAR(36) PRIMARY KEY,new_id BIGINT UNSIGNED NOT NULL UNIQUE) ENGINE=InnoDB`,
      );
      for (const [oldId, newId] of maps.get(table)!)
        await db.query(`INSERT INTO ${quote('_numeric_map_' + table)} VALUES (?,?)`, [
          oldId,
          newId,
        ]);
    }
    for (const group of constraints.values())
      await db.query(`ALTER TABLE ${quote(group[0].t)} DROP FOREIGN KEY ${quote(group[0].name)}`);
    await db.query('DELETE FROM sessions');
    await db.query('DELETE FROM resource_locks');
    for (const row of dedupUpdates)
      await db.query('UPDATE notification_outbox SET deduplication_key=? WHERE id=?', [
        row.key,
        row.id,
      ]);
    for (const update of jsonUpdates)
      await db.query(`UPDATE ${quote(update.table)} SET ${quote(update.column)}=? WHERE id=?`, [
        JSON.stringify(update.value),
        update.id,
      ]);
    for (const row of documents)
      await db.query('UPDATE clinical_documents SET payload=?,signature_hash=? WHERE id=?', [
        JSON.stringify(row.updatedPayload),
        createHmac('sha256', signingKey).update(canonical(row.updatedPayload)).digest('hex'),
        row.id,
      ]);
    for (const row of photos)
      await db.query('UPDATE clinical_photos SET encrypted_data=?,iv=?,auth_tag=? WHERE id=?', [
        row.newData,
        row.newIv,
        row.newTag,
        row.id,
      ]);
    // Audit IDs may refer to deleted records. Retain their original reference in metadata.
    const auditTypes: Record<string, string> = {
      patient: 'patients',
      user: 'users',
      branch: 'branches',
      room: 'rooms',
      appointment: 'appointments',
      queue: 'queue_tickets',
      encounter: 'encounters',
      inventory: 'inventory_items',
      batch: 'inventory_batches',
      dispense: 'dispenses',
      package: 'treatment_packages',
      invoice: 'invoices',
      document: 'clinical_documents',
      photo: 'clinical_photos',
      clinical_photo: 'clinical_photos',
      notification: 'notification_outbox',
    };
    const [audits]: any = await db.query(
      'SELECT id,entity_type,entity_id,metadata FROM audit_logs WHERE entity_id IS NOT NULL',
    );
    for (const row of audits) {
      const newId = maps.get(auditTypes[row.entity_type])?.get(String(row.entity_id));
      await db.query('UPDATE audit_logs SET entity_id=?,metadata=? WHERE id=?', [
        newId ?? null,
        JSON.stringify({ ...json(row.metadata), legacyEntityId: row.entity_id }),
        row.id,
      ]);
    }
    for (const { t, c, target } of foreignColumns.values())
      await db.query(
        `UPDATE ${quote(t)} child JOIN ${quote('_numeric_map_' + target)} mapping ON child.${quote(c)}=mapping.old_id SET child.${quote(c)}=CAST(mapping.new_id AS CHAR)`,
      );
    for (const table of entities)
      await db.query(
        `UPDATE ${quote(table)} child JOIN ${quote('_numeric_map_' + table)} mapping ON child.id=mapping.old_id SET child.id=CAST(mapping.new_id AS CHAR)`,
      );
    for (const table of entities) {
      const oldNumber = (
        {
          tenants: 'tenant_number',
          branches: 'branch_number',
          patients: 'patient_number',
        } as Record<string, string>
      )[table];
      if (oldNumber) await db.query(`ALTER TABLE ${quote(table)} DROP COLUMN ${quote(oldNumber)}`);
    }
    const changes = new Map<string, string[]>();
    const add = (table: string, change: string) =>
      changes.set(table, [...(changes.get(table) || []), change]);
    for (const { t, c } of foreignColumns.values())
      add(
        t,
        `MODIFY ${quote(c)} BIGINT UNSIGNED ${columns.find((col: any) => col.t === t && col.c === c).nullable === 'YES' ? 'NULL' : 'NOT NULL'}`,
      );
    for (const table of entities) add(table, 'MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
    add('audit_logs', 'MODIFY id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
    add('audit_logs', 'MODIFY entity_id BIGINT UNSIGNED NULL');
    for (const col of columns.filter((c: any) => c.expression && c.t === 'queue_tickets'))
      add(
        col.t,
        `MODIFY ${quote(col.c)} BIGINT UNSIGNED GENERATED ALWAYS AS (${col.c === 'active_patient_id' ? "CASE WHEN status NOT IN ('COMPLETED','SKIPPED') THEN patient_id ELSE NULL END" : "CASE WHEN status IN ('CALLED_TO_ROOM','IN_CONSULTATION') THEN room_id ELSE NULL END"}) STORED`,
      );
    for (const [table, parts] of changes)
      await db.query(`ALTER TABLE ${quote(table)} ${parts.join(',')}`);
    // Check all components together before restoring tenant/branch foreign keys.
    for (const group of constraints.values()) {
      const condition = group.map((k) => `child.${quote(k.c)}=parent.${quote(k.rc)}`).join(' AND ');
      const present = group.map((k) => `child.${quote(k.c)} IS NOT NULL`).join(' AND ');
      const [orphans]: any = await db.query(
        `SELECT COUNT(*) n FROM ${quote(group[0].t)} child LEFT JOIN ${quote(group[0].rt)} parent ON ${condition} WHERE ${present} AND parent.${quote(group[0].rc)} IS NULL`,
      );
      if (Number(orphans[0].n)) throw new Error('Foreign key integrity failed: ' + group[0].name);
      await db.query(
        `ALTER TABLE ${quote(group[0].t)} ADD CONSTRAINT ${quote(group[0].name)} FOREIGN KEY (${group.map((k) => quote(k.c)).join(',')}) REFERENCES ${quote(group[0].rt)} (${group.map((k) => quote(k.rc)).join(',')}) ON UPDATE ${group[0].updateRule} ON DELETE ${group[0].deleteRule}`,
      );
    }
    for (const table of entities) await db.query(`DROP TABLE ${quote('_numeric_map_' + table)}`);
  } finally {
    await db.query('SET FOREIGN_KEY_CHECKS=1');
  }
}
