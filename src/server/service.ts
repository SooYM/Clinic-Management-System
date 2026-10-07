import { randomBytes, createHash, createHmac } from 'node:crypto';
import { pool, transaction, lock, camel, type Database } from './db.js';
import {
  ClinicalEncounter,
  DomainError,
  FefoAllocator,
  Money,
  QueueTicket,
  type QueueStatus,
} from '../domain/models.js';
import type { Context } from './security.js';
import { schemas } from './validation.js';
import { effectiveModules } from './module-access.js';
import { lookupPostcode } from './data/postcodes.js';

const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const missing = () => new DomainError('NOT_FOUND', 'Record was not found in this branch.', 404);
export class ClinicService {
  constructor(
    private readonly db: Database = pool,
    private readonly transact: typeof transaction = transaction,
  ) {}
  async list(ctx: Context, kind: string, search = '') {
    const t = ctx.actor.tenantId,
      b = ctx.branchId;
    const queries: Record<string, string> = {
      patients: `SELECT p.*,p.id patient_number FROM patients p WHERE p.tenant_id=$1 AND p.branch_id=$2 AND (p.name LIKE $3 OR p.national_id LIKE $3 OR p.phone LIKE $3) ORDER BY p.created_at DESC LIMIT 200`,
      appointments: `SELECT a.*,p.id patient_number,p.name patient_name,u.name practitioner_name,r.name room_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.practitioner_id LEFT JOIN rooms r ON r.id=a.room_id WHERE a.tenant_id=$1 AND a.branch_id=$2 ORDER BY a.starts_at DESC LIMIT 200`,
      queue: `SELECT q.*,p.id patient_number,p.name patient_name,u.name practitioner_name,r.name room_name FROM queue_tickets q JOIN patients p ON p.id=q.patient_id LEFT JOIN users u ON u.id=q.practitioner_id LEFT JOIN rooms r ON r.id=q.room_id WHERE q.tenant_id=$1 AND q.branch_id=$2 AND q.service_date=DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) ORDER BY CASE WHEN q.priority='URGENT' THEN 0 ELSE 1 END,q.created_at LIMIT 200`,
      encounters: `SELECT e.*,p.id patient_number,p.name patient_name,u.name practitioner_name FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=e.practitioner_id WHERE e.tenant_id=$1 AND e.branch_id=$2 ORDER BY e.created_at DESC LIMIT 200`,
      inventory: `SELECT i.*,coalesce(sum(CASE WHEN b.expires_on>DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) THEN b.quantity ELSE 0 END),0) stock_quantity FROM inventory_items i LEFT JOIN inventory_batches b ON b.item_id=i.id WHERE i.tenant_id=$1 AND i.branch_id=$2 GROUP BY i.id ORDER BY i.name LIMIT 200`,
      packages: `SELECT t.*,p.name patient_name FROM treatment_packages t JOIN patients p ON p.id=t.patient_id WHERE t.tenant_id=$1 AND t.branch_id=$2 ORDER BY t.created_at DESC LIMIT 200`,
      invoices: `SELECT i.*,p.id patient_number,p.name patient_name,u.name practitioner_name FROM invoices i JOIN patients p ON p.id=i.patient_id JOIN users u ON u.id=i.practitioner_id WHERE i.tenant_id=$1 AND i.branch_id=$2 ORDER BY i.created_at DESC LIMIT 200`,
      documents: `SELECT d.id,d.encounter_id,d.patient_id,d.practitioner_id,d.kind,d.document_number,d.payload,d.start_date,d.end_date,d.diagnosis_redacted,d.revoked_at,d.created_at,p.name patient_name,u.name practitioner_name FROM clinical_documents d JOIN patients p ON p.id=d.patient_id JOIN users u ON u.id=d.practitioner_id WHERE d.tenant_id=$1 AND d.branch_id=$2 ORDER BY d.created_at DESC LIMIT 200`,
      notifications: `SELECT id,patient_id,channel,template,status,attempts,available_at,last_error,provider_reference,created_at FROM notification_outbox WHERE tenant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 200`,
      commissions: `SELECT c.*,u.name practitioner_name,i.invoice_number FROM commission_ledger c JOIN users u ON u.id=c.practitioner_id JOIN invoices i ON i.id=c.invoice_id WHERE c.tenant_id=$1 AND c.branch_id=$2 ORDER BY c.created_at DESC LIMIT 200`,
    };
    const rows = (
      await this.db.query(queries[kind], [t, b, ...(kind === 'patients' ? [`%${search}%`] : [])])
    ).rows;
    if (kind === 'inventory')
      for (const row of rows) {
        row.batches = (
          await this.db.query(
            'SELECT * FROM inventory_batches WHERE item_id=$1 ORDER BY expires_on',
            [row.id],
          )
        ).rows;
        row.stock_quantity = Number(row.stock_quantity);
      }
    if (kind === 'invoices')
      for (const row of rows)
        row.payments = (
          await this.db.query('SELECT * FROM payments WHERE invoice_id=$1', [row.id])
        ).rows;
    if (['patients', 'encounters', 'documents'].includes(kind))
      await this.audit(this.db, ctx, 'READ_LIST', kind, null, { count: rows.length });
    return camel(rows);
  }
  async bootstrap(ctx: Context) {
    const branches = await this.db.query(
      `SELECT b.id,b.id branch_number,b.name,b.address FROM branches b JOIN user_branches ub ON ub.branch_id=b.id WHERE ub.user_id=$1 AND b.tenant_id=$2 ORDER BY b.name`,
      [ctx.actor.id, ctx.actor.tenantId],
    );
    const rooms = await this.db.query(
      `SELECT id,name,active FROM rooms WHERE tenant_id=$1 AND branch_id=$2 AND active=1 ORDER BY name`,
      [ctx.actor.tenantId, ctx.branchId],
    );
    const practitioners = await this.db.query(
      `SELECT u.id,u.name,u.role,u.license_number FROM users u JOIN user_branches ub ON ub.user_id=u.id WHERE u.tenant_id=$1 AND ub.branch_id=$2 AND u.active AND u.role='DOCTOR' ORDER BY u.name`,
      [ctx.actor.tenantId, ctx.branchId],
    );
    const tenant = (
      await this.db.query('SELECT id,id tenant_number,name FROM tenants WHERE id=$1', [
        ctx.actor.tenantId,
      ])
    ).rows[0];
    return camel({
      tenant,
      user: ctx.actor,
      branches: branches.rows,
      rooms: rooms.rows.map((room) => ({ ...room, active: Boolean(room.active) })),
      practitioners: practitioners.rows,
      branchId: ctx.branchId,
      modules: ctx.modules || (await effectiveModules(this.db, ctx.actor.tenantId, ctx.actor.role)),
    });
  }
  async dashboard(ctx: Context) {
    const { rows } = await this.db.query(
      `SELECT (SELECT count(*) FROM patients WHERE tenant_id=$1 AND branch_id=$2) patients,(SELECT count(*) FROM queue_tickets WHERE tenant_id=$1 AND branch_id=$2 AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) AND status NOT IN ('COMPLETED','SKIPPED')) waiting,(SELECT count(*) FROM encounters WHERE tenant_id=$1 AND branch_id=$2 AND created_at>DATE(UTC_TIMESTAMP())) encounters_today,(SELECT coalesce(sum(total_cents),0) FROM invoices WHERE tenant_id=$1 AND branch_id=$2 AND status='PAID' AND created_at>DATE(UTC_TIMESTAMP())) revenue_cents`,
      [ctx.actor.tenantId, ctx.branchId],
    );
    return { ...camel(rows[0]), revenueCents: Number(rows[0].revenue_cents) };
  }
  async audit(
    db: Database,
    ctx: Context,
    action: string,
    entityType: string,
    entityId: number | null,
    metadata = {},
  ) {
    await db.query(
      `INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        ctx.actor.tenantId,
        ctx.branchId,
        ctx.actor.id,
        action,
        entityType,
        entityId,
        ctx.requestId,
        JSON.stringify(metadata),
      ],
    );
  }
  private async patient(db: Database, ctx: Context, id: number) {
    const { rows } = await db.query(
      `SELECT *,id patient_number FROM patients WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`,
      [id, ctx.actor.tenantId, ctx.branchId],
    );
    if (!rows[0]) throw missing();
    return rows[0];
  }
  private async practitioner(db: Database, ctx: Context, id: number) {
    const { rows } = await db.query(
      `SELECT u.* FROM users u JOIN user_branches ub ON ub.user_id=u.id WHERE u.id=$1 AND u.tenant_id=$2 AND ub.branch_id=$3 AND u.active AND u.role IN ('DOCTOR','THERAPIST')`,
      [id, ctx.actor.tenantId, ctx.branchId],
    );
    if (!rows[0])
      throw new DomainError(
        'INVALID_PRACTITIONER',
        'Choose a practitioner assigned to this branch.',
      );
    return rows[0];
  }
  async getPatient(ctx: Context, id: number) {
    const patient = await this.patient(this.db, ctx, id);
    await this.audit(this.db, ctx, 'READ_PATIENT', 'patient', id);
    return camel(patient);
  }
  async savePatient(ctx: Context, input: any, id?: number) {
    return this.transact(async (db) => {
      if (id) {
        const previous = await this.patient(db, ctx, id);
        if (previous.version !== input.version)
          throw new DomainError('VERSION_CONFLICT', 'Patient changed. Refresh before saving.', 409);
      }
      const {
        id: recordId,
        patientNumber,
        tenantId,
        branchId,
        createdAt,
        updatedAt,
        ...payload
      } = input;
      input = schemas.patient.parse({
        ...payload,
        nationality: payload.nationality ?? undefined,
        notificationConsent:
          typeof payload.notificationConsent === 'number'
            ? Boolean(payload.notificationConsent)
            : payload.notificationConsent,
      });
      const locations = lookupPostcode(input.postcode);
      if (locations.length === 1) {
        const location = locations[0];
        if (
          (!input.city || input.city.toLowerCase() === location.city.toLowerCase()) &&
          (!input.state || input.state.toLowerCase() === location.state.toLowerCase())
        ) {
          input.city = input.city || location.city;
          input.state = input.state || location.state;
        }
      }
      const values = [
        ctx.actor.tenantId,
        ctx.branchId,
        input.name,
        input.nationalId,
        input.dateOfBirth,
        input.sex,
        input.phone,
        input.email,
        input.bloodGroup,
        JSON.stringify(input.allergies),
        JSON.stringify(input.conditions),
        input.notificationConsent,
        input.firstName,
        input.lastName,
        input.nationality || null,
        input.addressLine1,
        input.addressLine2,
        input.postcode,
        input.state,
        input.city,
      ];
      let rows;
      if (id) {
        await this.patient(db, ctx, id);
        ({ rows } = await db.query(
          `UPDATE patients SET name=$3,national_id=$4,date_of_birth=$5,sex=$6,phone=$7,email=$8,blood_group=$9,allergies=$10,conditions=$11,notification_consent=$12,first_name=$13,last_name=$14,nationality=$15,address_line1=$16,address_line2=$17,postcode=$18,state=$19,city=$20,version=version+1,updated_at=now() WHERE tenant_id=$1 AND branch_id=$2 AND id=$21 AND version=$22 RETURNING *`,
          [...values, id, input.version],
        ));
        if (!rows[0])
          throw new DomainError('VERSION_CONFLICT', 'Patient changed. Refresh before saving.', 409);
      } else
        ({ rows } = await db.query(
          `INSERT INTO patients(tenant_id,branch_id,name,national_id,date_of_birth,sex,phone,email,blood_group,allergies,conditions,notification_consent,first_name,last_name,nationality,address_line1,address_line2,postcode,state,city) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
          values,
        ));
      await this.audit(db, ctx, id ? 'UPDATE' : 'CREATE', 'patient', rows[0].id);
      return camel({ ...rows[0], patient_number: rows[0].id });
    });
  }
  async schedule(ctx: Context, input: any) {
    return this.transact(async (db) => {
      await this.patient(db, ctx, input.patientId);
      const practitioner = await this.practitioner(db, ctx, input.practitionerId);
      await lock(db, [
        `appointment:practitioner:${input.practitionerId}`,
        ...(input.roomId ? [`appointment:room:${input.roomId}`] : []),
      ]);
      if (input.roomId) {
        const room = await db.query(
          'SELECT id FROM rooms WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND active=1 FOR UPDATE',
          [input.roomId, ctx.actor.tenantId, ctx.branchId],
        );
        if (!room.rowCount)
          throw new DomainError('INVALID_ROOM', 'Choose an active room in this branch.');
      }
      const overlap = await db.query(
        `SELECT id FROM appointments WHERE status IN ('BOOKED','CHECKED_IN') AND (practitioner_id=$1 OR room_id=$2) AND starts_at<$4 AND ends_at>$3 LIMIT 1 FOR UPDATE`,
        [
          input.practitionerId,
          input.roomId || null,
          new Date(input.startsAt),
          new Date(input.endsAt),
        ],
      );
      if (overlap.rowCount)
        throw new DomainError('OVERLAP', 'Practitioner or room already booked for this time.', 409);
      const { rows } = await db.query(
        `INSERT INTO appointments(tenant_id,branch_id,patient_id,practitioner_id,room_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.patientId,
          input.practitionerId,
          input.roomId || null,
          new Date(input.startsAt),
          new Date(input.endsAt),
          input.reason,
        ],
      );
      const branch = (
        await db.query('SELECT name,address FROM branches WHERE id=$1', [ctx.branchId])
      ).rows[0];
      await this.notify(db, ctx, input.patientId, 'BOOKING', `booking:${rows[0].id}`, {
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        practitionerId: input.practitionerId,
        practitionerName: practitioner.name,
        branchName: branch.name,
        branchAddress: branch.address,
        mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branch.address || branch.name)}`,
      });
      await this.audit(db, ctx, 'BOOK', 'appointment', rows[0].id);
      return camel(rows[0]);
    });
  }
  async cancelAppointment(ctx: Context, id: number, version: number) {
    return this.transact(async (db) => {
      const existing = await db.query(
        'SELECT * FROM appointments WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
        [id, ctx.actor.tenantId, ctx.branchId],
      );
      const appointment = existing.rows[0];
      if (!appointment) throw missing();
      if (appointment.version !== version || appointment.status !== 'BOOKED')
        throw new DomainError(
          'VERSION_CONFLICT',
          'Appointment changed or is not cancellable.',
          409,
        );
      const { rows } = await db.query(
        `UPDATE appointments SET status='CANCELLED',version=version+1 WHERE id=$1 RETURNING *`,
        [id],
      );
      await this.audit(db, ctx, 'CANCEL', 'appointment', id);
      return camel(rows[0]);
    });
  }
  async checkIn(ctx: Context, input: any) {
    return this.transact(async (db) => {
      await this.patient(db, ctx, input.patientId);
      await lock(db, [`queue:${ctx.branchId}:${today()}`]);
      const { rows: counts } = await db.query(
        `SELECT count(*) n FROM queue_tickets WHERE branch_id=$1 AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))`,
        [ctx.branchId],
      );
      const { rows } = await db.query(
        `INSERT INTO queue_tickets(tenant_id,branch_id,patient_id,ticket_number,priority,service_date) VALUES($1,$2,$3,$4,$5,DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.patientId,
          `Q-${String(counts[0].n + 1).padStart(3, '0')}`,
          input.priority,
        ],
      );
      await this.audit(db, ctx, 'CHECK_IN', 'queue', rows[0].id);
      return camel(rows[0]);
    });
  }
  async transitionQueue(ctx: Context, id: number, input: any) {
    return this.transact(async (db) => {
      const { rows } = await db.query(
        `SELECT * FROM queue_tickets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
        [id, ctx.actor.tenantId, ctx.branchId],
      );
      const ticket = rows[0];
      if (!ticket) throw missing();
      if (ticket.version !== input.version)
        throw new DomainError('VERSION_CONFLICT', 'Queue changed. Refresh before retrying.', 409);
      if (
        ctx.actor.role === 'DOCTOR' &&
        ticket.practitioner_id &&
        ticket.practitioner_id !== ctx.actor.id
      )
        throw new DomainError(
          'FORBIDDEN',
          'Doctors can only manage their assigned consultation.',
          403,
        );
      new QueueTicket(ticket.status).transition(input.status as QueueStatus);
      let roomId = ticket.room_id,
        practitionerId = ticket.practitioner_id;
      if (input.status === 'CALLED_TO_ROOM') {
        if (!input.roomId || !input.practitionerId)
          throw new DomainError('ROOM_REQUIRED', 'Choose room and practitioner before calling.');
        await this.practitioner(db, ctx, input.practitionerId);
        roomId = input.roomId;
        practitionerId = input.practitionerId;
        const room = await db.query(
          'SELECT id FROM rooms WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND active=1 FOR UPDATE',
          [roomId, ctx.actor.tenantId, ctx.branchId],
        );
        if (!room.rowCount)
          throw new DomainError('INVALID_ROOM', 'Choose a room from this branch.');
        const occupied = await db.query(
          "SELECT id FROM queue_tickets WHERE room_id=$1 AND status IN ('CALLED_TO_ROOM','IN_CONSULTATION') AND id<>$2 FOR UPDATE",
          [roomId, id],
        );
        if (occupied.rowCount)
          throw new DomainError('ROOM_OCCUPIED', 'Room already occupied.', 409);
        if (ctx.actor.role === 'DOCTOR' && practitionerId !== ctx.actor.id)
          throw new DomainError('FORBIDDEN', 'Doctors can only call their own patients.', 403);
      }
      if (input.status === 'TRIAGE_WAITING') roomId = null;
      const updated = await db.query(
        `UPDATE queue_tickets SET status=$4,room_id=$5,practitioner_id=$6,called_at=CASE WHEN $4='CALLED_TO_ROOM' THEN now() ELSE called_at END,completed_at=CASE WHEN $4='COMPLETED' THEN now() ELSE completed_at END,version=version+1 WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 RETURNING *`,
        [id, ctx.actor.tenantId, ctx.branchId, input.status, roomId, practitionerId],
      );
      if (input.status === 'CALLED_TO_ROOM')
        await this.notify(
          db,
          ctx,
          ticket.patient_id,
          'ROOM_CALL',
          `queue:${id}:${ticket.version}`,
          { roomId },
        );
      await this.audit(db, ctx, 'TRANSITION', 'queue', id, {
        from: ticket.status,
        to: input.status,
      });
      return camel(updated.rows[0]);
    });
  }
  private async validatePrescriptions(
    db: Database,
    ctx: Context,
    patient: any,
    prescriptions: any[],
  ) {
    if (!prescriptions.length) return;
    const { rows } = await db.query(
      `SELECT * FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND id IN ($3)`,
      [ctx.actor.tenantId, ctx.branchId, prescriptions.map((p) => p.itemId)],
    );
    if (rows.length !== prescriptions.length)
      throw new DomainError(
        'INVALID_MEDICATION',
        'Each prescription must reference a distinct inventory item in this branch.',
      );
    ClinicalEncounter.assertAllergySafety(patient.allergies, rows);
  }
  async saveEncounter(ctx: Context, input: any, id?: number) {
    if (ctx.actor.role !== 'DOCTOR')
      throw new DomainError(
        'DOCTOR_REQUIRED',
        'Only a GP can write or sign a clinical encounter.',
        403,
      );
    return this.transact(async (db) => {
      if (id) {
        const existing = await db.query(
          'SELECT status FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
          [id, ctx.actor.tenantId, ctx.branchId],
        );
        if (!existing.rows[0]) throw missing();
        if (existing.rows[0].status === 'SIGNED')
          throw new DomainError('ENCOUNTER_SIGNED', 'Signed encounters are immutable.', 409);
      }
      input = schemas.encounter.parse(input);
      const patient = await this.patient(db, ctx, input.patientId);
      await this.validatePrescriptions(db, ctx, patient, input.prescriptions);
      const values = [
        ctx.actor.tenantId,
        ctx.branchId,
        input.patientId,
        ctx.actor.id,
        input.queueTicketId || null,
        input.specialty,
        input.subjective,
        input.objective,
        input.assessment,
        input.plan,
        JSON.stringify(input.vitals),
        JSON.stringify(input.prescriptions),
        input.procedureNotes,
        input.status,
      ];
      let rows;
      if (id) {
        const existing = await db.query(
          `SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
          [id, ctx.actor.tenantId, ctx.branchId],
        );
        if (!existing.rows[0]) throw missing();
        if (existing.rows[0].practitioner_id !== ctx.actor.id && ctx.actor.role !== 'ADMIN')
          throw new DomainError('FORBIDDEN', 'Only author can edit encounter.', 403);
        if (existing.rows[0].status === 'SIGNED')
          throw new DomainError('ENCOUNTER_SIGNED', 'Signed encounters are immutable.', 409);
        if (existing.rows[0].patient_id !== input.patientId)
          throw new DomainError('PATIENT_IMMUTABLE', 'Encounter patient cannot change.');
        ({ rows } = await db.query(
          `UPDATE encounters SET subjective=$7,objective=$8,assessment=$9,plan=$10,vitals=$11,prescriptions=$12,procedure_notes=$13,status=$14,signed_at=CASE WHEN $14='SIGNED' THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE tenant_id=$1 AND branch_id=$2 AND id=$15 AND version=$16 RETURNING *`,
          [...values, id, input.version],
        ));
        if (!rows[0])
          throw new DomainError(
            'VERSION_CONFLICT',
            'Encounter changed. Reload before saving.',
            409,
          );
      } else {
        if (input.queueTicketId) {
          const q = await db.query(
            `SELECT 1 FROM queue_tickets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND practitioner_id=$5 AND status='IN_CONSULTATION'`,
            [input.queueTicketId, ctx.actor.tenantId, ctx.branchId, input.patientId, ctx.actor.id],
          );
          if (!q.rowCount)
            throw new DomainError(
              'INVALID_QUEUE',
              'Encounter requires this doctor’s active consultation ticket.',
            );
        }
        ({ rows } = await db.query(
          `INSERT INTO encounters(tenant_id,branch_id,patient_id,practitioner_id,queue_ticket_id,specialty,subjective,objective,assessment,plan,vitals,prescriptions,procedure_notes,status,signed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CASE WHEN $14='SIGNED' THEN now() ELSE NULL END) RETURNING *`,
          values,
        ));
      }
      if (input.status === 'SIGNED')
        for (const rx of input.prescriptions) {
          const due = new Date();
          due.setUTCDate(due.getUTCDate() + Math.max(0, rx.durationDays - 3));
          await this.notify(
            db,
            ctx,
            patient.id,
            'REFILL',
            `refill:${rows[0].id}:${rx.itemId}`,
            { itemId: rx.itemId, durationDays: rx.durationDays },
            due.toISOString(),
          );
        }
      await this.audit(
        db,
        ctx,
        input.status === 'SIGNED' ? 'SIGN' : 'SAVE',
        'encounter',
        rows[0].id,
      );
      return camel(rows[0]);
    });
  }
  async addItem(ctx: Context, input: any) {
    return this.transact(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO inventory_items(tenant_id,branch_id,name,sku,ingredient,category,unit,price_cents,reorder_level) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.name,
          input.sku,
          input.ingredient,
          input.category,
          input.unit,
          input.priceCents,
          input.reorderLevel,
        ],
      );
      await this.audit(db, ctx, 'CREATE', 'inventory', rows[0].id);
      return camel(rows[0]);
    });
  }
  async receiveBatch(ctx: Context, input: any) {
    input = schemas.batch.parse(input);
    if (input.expiresOn <= today())
      throw new DomainError(
        'BATCH_EXPIRED',
        'Expiry date must be after today. Stock expiring today or earlier cannot be received for dispensing.',
      );
    return this.transact(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO inventory_batches(tenant_id,branch_id,item_id,batch_number,expires_on,quantity) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.itemId,
          input.batchNumber,
          input.expiresOn,
          input.quantity,
        ],
      );
      await db.query(
        `INSERT INTO stock_movements(tenant_id,branch_id,batch_id,quantity_delta,reason,actor_id) VALUES($1,$2,$3,$4,'RECEIVED',$5)`,
        [ctx.actor.tenantId, ctx.branchId, rows[0].id, input.quantity, ctx.actor.id],
      );
      await this.audit(db, ctx, 'RECEIVE', 'batch', rows[0].id);
      const stock = (
        await db.query(
          'SELECT coalesce(sum(quantity),0) stock_quantity FROM inventory_batches WHERE tenant_id=$1 AND branch_id=$2 AND item_id=$3 AND expires_on>$4',
          [ctx.actor.tenantId, ctx.branchId, input.itemId, today()],
        )
      ).rows[0];
      return { ...camel(rows[0]), stockQuantity: Number(stock.stock_quantity) };
    });
  }
  async dispense(ctx: Context, input: any) {
    return this.transact(async (db) => {
      await lock(db, [`dispense:${ctx.branchId}:${input.idempotencyKey}`]);
      const prior = await db.query(
        `SELECT * FROM dispenses WHERE branch_id=$1 AND idempotency_key=$2`,
        [ctx.branchId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].encounter_id !== input.encounterId)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Key already used for another encounter.',
            409,
          );
        return camel(prior.rows[0]);
      }
      const { rows } = await db.query(
        `SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
        [input.encounterId, ctx.actor.tenantId, ctx.branchId],
      );
      const e = rows[0];
      if (!e) throw missing();
      if (e.status !== 'SIGNED')
        throw new DomainError(
          'UNSIGNED_PRESCRIPTION',
          'Doctor must sign prescription before dispensing.',
        );
      const already = await db.query(`SELECT 1 FROM dispenses WHERE encounter_id=$1`, [e.id]);
      if (already.rowCount)
        throw new DomainError('ALREADY_DISPENSED', 'Encounter already dispensed.', 409);
      if (!e.prescriptions.length)
        throw new DomainError('NO_PRESCRIPTION', 'Encounter has no medication to dispense.');
      const patient = await this.patient(db, ctx, e.patient_id);
      await this.validatePrescriptions(db, ctx, patient, e.prescriptions);
      const record = await db.query(
        `INSERT INTO dispenses(tenant_id,branch_id,patient_id,encounter_id,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [ctx.actor.tenantId, ctx.branchId, e.patient_id, e.id, ctx.actor.id, input.idempotencyKey],
      );
      const allocations = [];
      for (const rx of [...e.prescriptions].sort((a, b) => a.itemId - b.itemId)) {
        const batches = await db.query(
          `SELECT id,quantity,DATE_FORMAT(expires_on,'%Y-%m-%d') expires_on FROM inventory_batches WHERE tenant_id=$1 AND branch_id=$2 AND item_id=$3 AND quantity>0 ORDER BY expires_on,received_at,id FOR UPDATE`,
          [ctx.actor.tenantId, ctx.branchId, rx.itemId],
        );
        for (const allocation of FefoAllocator.allocate(batches.rows, rx.quantity, today())) {
          await db.query(`UPDATE inventory_batches SET quantity=quantity-$2 WHERE id=$1`, [
            allocation.batchId,
            allocation.quantity,
          ]);
          await db.query(
            `INSERT INTO stock_movements(tenant_id,branch_id,batch_id,dispense_id,quantity_delta,reason,actor_id) VALUES($1,$2,$3,$4,$5,'DISPENSED',$6)`,
            [
              ctx.actor.tenantId,
              ctx.branchId,
              allocation.batchId,
              record.rows[0].id,
              -allocation.quantity,
              ctx.actor.id,
            ],
          );
          allocations.push({ ...allocation, itemId: rx.itemId });
        }
      }
      await this.audit(db, ctx, 'DISPENSE', 'dispense', record.rows[0].id);
      return { ...camel(record.rows[0]), allocations };
    });
  }
  async sellPackage(ctx: Context, input: any) {
    return this.transact(async (db) => {
      const scopedService = new ClinicService(db, (work) => work(db));
      const invoice = await scopedService.createInvoice(ctx, {
        patientId: input.patientId,
        practitionerId: input.practitionerId,
        lines: [
          {
            description: `${input.name} (${input.totalSessions} sessions, expires ${input.expiresOn})`,
            quantity: 1,
            unitPriceCents: input.priceCents,
            category: 'SERVICE',
          },
        ],
        payments: input.payments,
        idempotencyKey: input.idempotencyKey,
      });
      const existing = await db.query('SELECT * FROM treatment_packages WHERE sale_invoice_id=$1', [
        invoice.id,
      ]);
      if (existing.rows[0]) return camel(existing.rows[0]);
      const { rows } = await db.query(
        `INSERT INTO treatment_packages(tenant_id,branch_id,patient_id,name,total_sessions,price_cents,expires_on,sale_invoice_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.patientId,
          input.name,
          input.totalSessions,
          input.priceCents,
          input.expiresOn,
          invoice.id,
        ],
      );
      await this.audit(db, ctx, 'SELL', 'package', rows[0].id);
      return camel(rows[0]);
    });
  }
  async redeemPackage(ctx: Context, id: number, input: any) {
    return this.transact(async (db) => {
      const { rows } = await db.query(
        `SELECT *,DATE_FORMAT(expires_on,'%Y-%m-%d') expiry FROM treatment_packages WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
        [id, ctx.actor.tenantId, ctx.branchId],
      );
      const p = rows[0];
      if (!p) throw missing();
      if (p.version !== input.version)
        throw new DomainError('VERSION_CONFLICT', 'Package changed. Refresh.', 409);
      if (p.used_sessions >= p.total_sessions || p.expiry < today())
        throw new DomainError(
          'PACKAGE_UNAVAILABLE',
          'Package expired or has no sessions remaining.',
        );
      const encounter = await db.query(
        `SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND status='SIGNED'`,
        [input.encounterId, ctx.actor.tenantId, ctx.branchId, p.patient_id],
      );
      if (!encounter.rows[0])
        throw new DomainError('INVALID_SIGNOFF', 'Signed encounter for this patient is required.');
      if (ctx.actor.role !== 'ADMIN' && encounter.rows[0].practitioner_id !== ctx.actor.id)
        throw new DomainError(
          'FORBIDDEN',
          'Only attending practitioner can sign off package session.',
          403,
        );
      await db.query(
        `INSERT INTO package_redemptions(tenant_id,branch_id,package_id,practitioner_id,encounter_id,notes) VALUES($1,$2,$3,$4,$5,$6)`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          id,
          encounter.rows[0].practitioner_id,
          input.encounterId,
          input.notes,
        ],
      );
      const updated = await db.query(
        `UPDATE treatment_packages SET used_sessions=used_sessions+1,version=version+1 WHERE id=$1 RETURNING *`,
        [id],
      );
      await this.audit(db, ctx, 'REDEEM', 'package', id);
      return camel(updated.rows[0]);
    });
  }
  async createInvoice(ctx: Context, input: any) {
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.transact(async (db) => {
      await lock(db, [`invoice:${ctx.branchId}:${input.idempotencyKey}`]);
      const prior = await db.query(
        `SELECT * FROM invoices WHERE branch_id=$1 AND idempotency_key=$2`,
        [ctx.branchId, input.idempotencyKey],
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Payment key already used with different details.',
            409,
          );
        return camel(prior.rows[0]);
      }
      await this.patient(db, ctx, input.patientId);
      await this.practitioner(db, ctx, input.practitionerId);
      const total = input.lines.reduce(
        (sum: Money, l: any) => sum.add(new Money(l.unitPriceCents).multiply(l.quantity)),
        new Money(0),
      ).cents;
      if (
        !total ||
        input.payments.reduce((sum: number, p: any) => sum + p.amountCents, 0) !== total
      )
        throw new DomainError(
          'PAYMENT_MISMATCH',
          'Split payment total must match invoice total exactly.',
        );
      const depositUsed = input.payments
        .filter((p: any) => p.method === 'DEPOSIT')
        .reduce((s: number, p: any) => s + p.amountCents, 0);
      if (depositUsed) {
        await lock(db, [`deposit:${ctx.branchId}:${input.patientId}`]);
        const balance = await db.query(
          `SELECT coalesce(sum(amount_cents),0) balance FROM patient_deposits WHERE tenant_id=$1 AND branch_id=$2 AND patient_id=$3`,
          [ctx.actor.tenantId, ctx.branchId, input.patientId],
        );
        if (Number(balance.rows[0].balance) < depositUsed)
          throw new DomainError('INSUFFICIENT_DEPOSIT', 'Patient deposit balance is insufficient.');
      }
      const { rows } = await db.query(
        `INSERT INTO invoices(tenant_id,branch_id,patient_id,practitioner_id,invoice_number,\`lines\`,total_cents,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.patientId,
          input.practitionerId,
          `INV-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`,
          JSON.stringify(input.lines),
          total,
          input.idempotencyKey,
          requestHash,
        ],
      );
      for (const payment of input.payments)
        await db.query(
          `INSERT INTO payments(tenant_id,branch_id,invoice_id,method,amount_cents,reference) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            ctx.actor.tenantId,
            ctx.branchId,
            rows[0].id,
            payment.method,
            payment.amountCents,
            payment.reference,
          ],
        );
      if (depositUsed)
        await db.query(
          `INSERT INTO patient_deposits(tenant_id,branch_id,patient_id,amount_cents,reference) VALUES($1,$2,$3,$4,$5)`,
          [ctx.actor.tenantId, ctx.branchId, input.patientId, -depositUsed, rows[0].invoice_number],
        );
      await this.audit(db, ctx, 'CHECKOUT', 'invoice', rows[0].id);
      return camel(rows[0]);
    });
  }
  async addDeposit(ctx: Context, input: any) {
    return this.transact(async (db) => {
      await this.patient(db, ctx, input.patientId);
      const { rows } = await db.query(
        `INSERT INTO patient_deposits(tenant_id,branch_id,patient_id,amount_cents,reference) VALUES($1,$2,$3,$4,$5) RETURNING *`,
        [ctx.actor.tenantId, ctx.branchId, input.patientId, input.amountCents, input.reference],
      );
      await this.audit(db, ctx, 'DEPOSIT', 'patient', input.patientId);
      return camel(rows[0]);
    });
  }
  async issueDocument(ctx: Context, input: any) {
    if (ctx.actor.role !== 'DOCTOR')
      throw new DomainError(
        'DOCTOR_REQUIRED',
        'Only attending GP can issue a clinical document.',
        403,
      );
    return this.transact(async (db) => {
      const { rows } = await db.query(
        `SELECT e.*,p.name patient_name,p.national_id,p.allergies,p.conditions,u.name practitioner_name,u.license_number,b.name branch_name,b.address FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=e.practitioner_id JOIN branches b ON b.id=e.branch_id WHERE e.id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 FOR UPDATE`,
        [input.encounterId, ctx.actor.tenantId, ctx.branchId],
      );
      const e = rows[0];
      if (!e) throw missing();
      if (e.status !== 'SIGNED')
        throw new DomainError(
          'UNSIGNED_ENCOUNTER',
          'Sign encounter before issuing clinical document.',
        );
      if (e.practitioner_id !== ctx.actor.id && ctx.actor.role !== 'ADMIN')
        throw new DomainError('FORBIDDEN', 'Only attending doctor can issue document.', 403);
      const doctor = await db.query(`SELECT role FROM users WHERE id=$1`, [e.practitioner_id]);
      if (doctor.rows[0]?.role !== 'DOCTOR')
        throw new DomainError('DOCTOR_REQUIRED', 'Clinical documents require attending doctor.');
      const token = randomBytes(32).toString('hex'),
        number = `${input.kind}-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`;
      let endDate: string | null = null;
      if (input.kind === 'MC') {
        if (!input.startDate || !input.days)
          throw new DomainError('INVALID_MC', 'Start date and number of days required.');
        const end = new Date(`${input.startDate}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() + input.days - 1);
        endDate = end.toISOString().slice(0, 10);
      }
      if (input.kind === 'MC') {
        await lock(db, [`mc:${e.patient_id}`]);
        const overlap = await db.query(
          "SELECT id FROM clinical_documents WHERE patient_id=$1 AND kind='MC' AND revoked_at IS NULL AND start_date<=$3 AND end_date>=$2 FOR UPDATE",
          [e.patient_id, input.startDate, endDate],
        );
        if (overlap.rowCount)
          throw new DomainError(
            'OVERLAP',
            'Sick leave dates overlap an existing active certificate.',
            409,
          );
      }
      if (input.kind === 'REFERRAL' && (!input.target || !input.reason))
        throw new DomainError(
          'REFERRAL_TARGET_REQUIRED',
          'Target hospital or specialty and referral reason required.',
        );
      if (input.kind === 'LAB' && !input.panels?.length)
        throw new DomainError('LAB_PANELS_REQUIRED', 'Select at least one investigation panel.');
      const issuedAt = new Date().toISOString();
      const payload = {
        ...input,
        patientId: e.patient_id,
        practitionerId: e.practitioner_id,
        branchId: e.branch_id,
        issuedAt,
        endDate,
        patientName: e.patient_name,
        nationalId: e.national_id,
        practitionerName: e.practitioner_name,
        licenseNumber: e.license_number,
        branchName: e.branch_name,
        branchAddress: e.address,
        assessment: e.assessment,
        vitals: e.vitals,
        allergies: e.allergies,
        conditions: e.conditions,
        prescriptions: e.prescriptions,
        documentNumber: number,
      };
      const key = process.env.DOCUMENT_SIGNING_KEY;
      if (!key || key.length < 32)
        throw new DomainError(
          'SIGNING_NOT_CONFIGURED',
          'Document signing key is not configured.',
          503,
        );
      const signature = createHmac('sha256', key).update(canonicalJson(payload)).digest('hex');
      const inserted = await db.query(
        `INSERT INTO clinical_documents(tenant_id,branch_id,encounter_id,patient_id,practitioner_id,kind,document_number,payload,start_date,end_date,diagnosis_redacted,verification_hash,signature_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id,document_number,kind,created_at`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          e.id,
          e.patient_id,
          e.practitioner_id,
          input.kind,
          number,
          JSON.stringify(payload),
          input.startDate || null,
          endDate,
          input.diagnosisRedacted,
          token,
          signature,
          new Date(issuedAt),
        ],
      );
      await this.audit(db, ctx, 'ISSUE', 'document', inserted.rows[0].id);
      return {
        ...camel(inserted.rows[0]),
        verificationUrl: `${process.env.PUBLIC_URL || 'http://localhost:5173'}/verify/${token}`,
      };
    });
  }
  async document(ctx: Context, id: number) {
    const { rows } = await this.db.query(
      `SELECT * FROM clinical_documents WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`,
      [id, ctx.actor.tenantId, ctx.branchId],
    );
    if (!rows[0]) throw missing();
    await this.audit(this.db, ctx, 'READ_DOCUMENT', 'document', id);
    return rows[0];
  }
  async verifyDocument(token: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM clinical_documents WHERE verification_hash=$1`,
      [token],
    );
    const d = rows[0];
    if (!d) throw missing();
    const key = process.env.DOCUMENT_SIGNING_KEY || '';
    const intact =
      createHmac('sha256', key).update(canonicalJson(d.payload)).digest('hex') === d.signature_hash;
    const metadataIntact =
      d.payload.documentNumber === d.document_number &&
      d.payload.kind === d.kind &&
      d.payload.encounterId === d.encounter_id &&
      d.payload.patientId === d.patient_id &&
      d.payload.practitionerId === d.practitioner_id &&
      d.payload.branchId === d.branch_id &&
      (d.payload.startDate || null) === d.start_date &&
      d.payload.endDate === d.end_date &&
      d.payload.issuedAt === camel({ created_at: d.created_at }).createdAt &&
      Boolean(d.payload.diagnosisRedacted) === Boolean(d.diagnosis_redacted);
    return {
      valid: !d.revoked_at && intact && metadataIntact,
      documentNumber: d.document_number,
      kind: d.kind,
      clinicName: d.payload.branchName,
      practitionerName: d.payload.practitionerName,
      startDate: d.start_date,
      endDate: d.end_date,
      issuedAt: d.created_at,
      revoked: Boolean(d.revoked_at),
    };
  }
  async revokeDocument(ctx: Context, id: number, reason: string) {
    return this.transact(async (db) => {
      const document = await this.document(ctx, id);
      if (document.practitioner_id !== ctx.actor.id && ctx.actor.role !== 'ADMIN')
        throw new DomainError('FORBIDDEN', 'Only issuer can revoke document.', 403);
      await db.query(
        `UPDATE clinical_documents SET revoked_at=now(),revoke_reason=$2 WHERE id=$1 AND revoked_at IS NULL`,
        [id, reason],
      );
      await this.audit(db, ctx, 'REVOKE', 'document', id, { reason });
      return { id, revoked: true };
    });
  }
  private async notify(
    db: Database,
    ctx: Context,
    patientId: number,
    template: string,
    key: string,
    payload: any,
    availableAt = new Date().toISOString(),
  ) {
    const patient = await this.patient(db, ctx, patientId);
    if (!patient.notification_consent) return;
    for (const [channel, recipient] of [
      ['EMAIL', patient.email],
      ['WHATSAPP', patient.phone],
    ])
      if (recipient)
        await db.query(
          `INSERT INTO notification_outbox(tenant_id,branch_id,patient_id,channel,template,recipient,payload,deduplication_key,available_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON DUPLICATE KEY UPDATE deduplication_key=deduplication_key`,
          [
            ctx.actor.tenantId,
            ctx.branchId,
            patientId,
            channel,
            template,
            recipient,
            JSON.stringify(payload),
            `${key}:${channel}`,
            new Date(availableAt),
          ],
        );
  }
}
export function canonicalJson(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
