import { allocateQueueNumber } from './queue-numbering.js';
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
import { schemas, validateItemIngredient } from './validation.js';
import { effectiveModules } from './module-access.js';
import { lookupPostcode } from './data/postcodes.js';
import {
  buildDocumentView,
  type PrescriptionLog,
  type PrescriptionLogEvent,
} from '../shared/document-view.js';
import type { MedicationDose, MedicationDoseLog } from '../shared/medication-doses.js';
import type { MedicineLabelPrescription } from '../shared/medicine-labels.js';
import { validateCatalogChoices } from './catalog-service.js';
import { expireQueue } from './queue-lifecycle.js';
import { encounterBillingLines } from '../shared/encounter-billing.js';
import { readLetterhead } from './letterhead.js';

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
  async list(ctx: Context, kind: string, search = '', category = '') {
    if (kind === 'queue')
      return this.transact(async (db) => {
        await expireQueue(db, ctx);
        return camel(
          (
            await db.query(
              `SELECT q.*,LEAST(DATE_ADD(q.created_at,INTERVAL 12 HOUR),DATE_SUB(DATE_ADD(q.service_date,INTERVAL 1 DAY),INTERVAL 8 HOUR)) expires_at,p.id patient_number,p.name patient_name,u.name practitioner_name,r.name room_name FROM queue_tickets q JOIN patients p ON p.id=q.patient_id LEFT JOIN users u ON u.id=q.practitioner_id LEFT JOIN rooms r ON r.id=q.room_id WHERE q.tenant_id=$1 AND q.branch_id=$2 AND q.service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) ORDER BY CASE WHEN q.priority='URGENT' THEN 0 ELSE 1 END,q.created_at LIMIT 200`,
              [ctx.actor.tenantId, ctx.branchId],
            )
          ).rows,
        );
      });
    const t = ctx.actor.tenantId,
      b = ctx.branchId;
    const queries: Record<string, string> = {
      patients: `SELECT p.*,p.id patient_number,(SELECT c.label FROM reference_catalogs c WHERE c.id=p.patient_group_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id) patient_group_label FROM patients p WHERE p.tenant_id=$1 AND p.branch_id=$2 AND (p.name LIKE $3 OR p.national_id LIKE $3 OR p.phone LIKE $3) ORDER BY p.id LIMIT 200`,
      appointments: `SELECT a.*,p.id patient_number,p.name patient_name,u.name practitioner_name,r.name room_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.practitioner_id LEFT JOIN rooms r ON r.id=a.room_id WHERE a.tenant_id=$1 AND a.branch_id=$2 AND a.deleted_at IS NULL ORDER BY a.starts_at DESC LIMIT 200`,
      encounters: `SELECT e.*,p.id patient_number,p.name patient_name,u.name practitioner_name FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=e.practitioner_id WHERE e.tenant_id=$1 AND e.branch_id=$2 AND e.deleted_at IS NULL AND (p.name LIKE $3 OR p.national_id LIKE $3 OR CAST(p.id AS CHAR) LIKE $3 OR CAST(e.id AS CHAR) LIKE $3 OR e.assessment LIKE $3 OR u.name LIKE $3) ORDER BY e.created_at DESC LIMIT 200`,
      inventory: `SELECT i.*,
        (SELECT COALESCE(SUM(b.quantity),0) FROM inventory_batches b
          WHERE b.item_id=i.id AND b.tenant_id=i.tenant_id AND b.branch_id=i.branch_id
          AND (b.expires_on>DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) OR (b.expires_on IS NULL AND i.category<>'MEDICATION'))) on_hand_quantity,
        (SELECT COALESCE(SUM(r.quantity),0) FROM prescription_reservations r JOIN inventory_batches b ON b.id=r.batch_id AND b.item_id=r.item_id AND b.tenant_id=r.tenant_id AND b.branch_id=r.branch_id
          WHERE r.item_id=i.id AND r.tenant_id=i.tenant_id AND r.branch_id=i.branch_id AND r.consumed_at IS NULL
          AND (b.expires_on>DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) OR (b.expires_on IS NULL AND i.category<>'MEDICATION'))) reserved_quantity
        FROM inventory_items i WHERE i.tenant_id=$1 AND i.branch_id=$2
        AND (i.name LIKE $3 OR i.sku LIKE $3 OR i.ingredient LIKE $3 OR i.category LIKE $3) AND ($4='' OR i.category=$4) ORDER BY i.id LIMIT 200`,
      packages: `SELECT t.*,p.name patient_name FROM treatment_packages t JOIN patients p ON p.id=t.patient_id WHERE t.tenant_id=$1 AND t.branch_id=$2 ORDER BY t.created_at DESC LIMIT 200`,
      invoices: `SELECT i.*,p.id patient_number,p.name patient_name,u.name practitioner_name FROM invoices i JOIN patients p ON p.id=i.patient_id JOIN users u ON u.id=i.practitioner_id WHERE i.tenant_id=$1 AND i.branch_id=$2 ORDER BY i.created_at DESC LIMIT 200`,
      documents: `SELECT d.id,d.encounter_id,d.patient_id,d.practitioner_id,d.kind,d.document_number,d.payload,d.start_date,d.end_date,d.diagnosis_redacted,d.revoked_at,d.created_at,p.name patient_name,u.name practitioner_name FROM clinical_documents d JOIN patients p ON p.id=d.patient_id JOIN users u ON u.id=d.practitioner_id WHERE d.tenant_id=$1 AND d.branch_id=$2 ORDER BY d.created_at DESC LIMIT 200`,
      notifications: `SELECT id,patient_id,channel,template,status,attempts,available_at,last_error,provider_reference,created_at FROM notification_outbox WHERE tenant_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 200`,
      commissions: `SELECT c.*,u.name practitioner_name,i.invoice_number FROM commission_ledger c JOIN users u ON u.id=c.practitioner_id JOIN invoices i ON i.id=c.invoice_id WHERE c.tenant_id=$1 AND c.branch_id=$2 ORDER BY c.created_at DESC LIMIT 200`,
    };
    const rows = (
      await this.db.query(queries[kind], [
        t,
        b,
        ...(['patients', 'encounters', 'inventory'].includes(kind)
          ? [`%${search.slice(0, 200)}%`]
          : []),
        ...(kind === 'inventory' ? [category] : []),
      ])
    ).rows;
    if (kind === 'inventory')
      for (const row of rows) {
        row.active = Boolean(row.active);
        row.batches = (
          await this.db.query(
            'SELECT * FROM inventory_batches WHERE item_id=$1 ORDER BY expires_on',
            [row.id],
          )
        ).rows;
        row.on_hand_quantity = Number(row.on_hand_quantity);
        row.reserved_quantity = Number(row.reserved_quantity);
        row.stock_quantity = row.on_hand_quantity - row.reserved_quantity;
      }
    if (kind === 'invoices')
      for (const row of rows)
        row.payments = (
          await this.db.query('SELECT * FROM payments WHERE invoice_id=$1', [row.id])
        ).rows;
    if (['patients', 'encounters', 'documents'].includes(kind))
      await this.audit(this.db, ctx, 'READ_LIST', kind, null, { count: rows.length });
    if (kind === 'documents')
      for (const row of rows)
        if (row.diagnosis_redacted) {
          const { assessment, conditions, ...safePayload } = row.payload;
          row.payload = safePayload;
        }
    return camel(rows);
  }
  async bootstrap(ctx: Context) {
    const branches = await this.db.query(
      `SELECT b.id,b.id branch_number,b.name,b.address,b.active,b.version FROM branches b JOIN user_branches ub ON ub.branch_id=b.id WHERE ub.user_id=$1 AND b.tenant_id=$2 AND b.active=1 ORDER BY b.name`,
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
      modules:
        ctx.modules ||
        (await effectiveModules(
          this.db,
          ctx.actor.tenantId,
          ctx.actor.role,
          ctx.actor.customRoleId,
        )),
    });
  }
  async queueSuggestions(ctx: Context) {
    if (ctx.actor.role !== 'DOCTOR')
      throw new DomainError('DOCTOR_REQUIRED', 'Assigned queue suggestions require a GP.', 403);
    return this.transact(async (db) => {
      await expireQueue(db, ctx);
      const rows = (
        await db.query(
          `SELECT q.id queue_ticket_id,q.patient_id,p.id patient_number,p.name patient_name,q.ticket_number,q.room_id,r.name room_name,q.status,q.version,q.created_at,q.called_at,LEAST(DATE_ADD(q.created_at,INTERVAL 12 HOUR),DATE_SUB(DATE_ADD(q.service_date,INTERVAL 1 DAY),INTERVAL 8 HOUR)) expires_at,
        (SELECT e.id FROM encounters e WHERE e.tenant_id=q.tenant_id AND e.branch_id=q.branch_id AND e.queue_ticket_id=q.id AND e.deleted_at IS NULL ORDER BY e.id LIMIT 1) encounter_id
        FROM queue_tickets q JOIN patients p ON p.id=q.patient_id LEFT JOIN rooms r ON r.id=q.room_id
        WHERE q.tenant_id=$1 AND q.branch_id=$2 AND q.practitioner_id=$3 AND q.expired_at IS NULL AND q.created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) AND q.service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) AND q.status IN ('CALLED_TO_ROOM','IN_CONSULTATION') ORDER BY q.called_at,q.id LIMIT 200`,
          [ctx.actor.tenantId, ctx.branchId, ctx.actor.id],
        )
      ).rows;
      return { data: camel(rows) };
    });
  }
  async dashboard(ctx: Context) {
    await this.transact((db) => expireQueue(db, ctx));
    const { rows } = await this.db.query(
      `SELECT (SELECT count(*) FROM patients WHERE tenant_id=$1 AND branch_id=$2) patients,(SELECT count(*) FROM queue_tickets WHERE tenant_id=$1 AND branch_id=$2 AND expired_at IS NULL AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) AND status NOT IN ('COMPLETED','SKIPPED')) waiting,(SELECT count(*) FROM encounters WHERE tenant_id=$1 AND branch_id=$2 AND deleted_at IS NULL AND created_at>DATE(UTC_TIMESTAMP())) encounters_today,(SELECT coalesce(sum(total_cents),0) FROM invoices WHERE tenant_id=$1 AND branch_id=$2 AND status='PAID' AND created_at>DATE(UTC_TIMESTAMP())) revenue_cents`,
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
      `SELECT p.*,p.id patient_number,(SELECT c.label FROM reference_catalogs c WHERE c.id=p.patient_group_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id) patient_group_label FROM patients p WHERE p.id=$1 AND p.tenant_id=$2 AND p.branch_id=$3`,
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
      let previousGroup: number | null = null;
      let previousCountry: string | null = null;
      let previousCountryName: string | null = null;
      if (id) {
        const previous = await this.patient(db, ctx, id);
        previousGroup = previous.patient_group_id ?? null;
        previousCountry = previous.country_code;
        previousCountryName = previous.country_name;
        if (previous.version !== input.version)
          throw new DomainError('VERSION_CONFLICT', 'Patient changed. Refresh before saving.', 409);
      }
      const {
        id: recordId,
        patientNumber,
        patientGroupLabel,
        tenantId,
        branchId,
        createdAt,
        updatedAt,
        ...payload
      } = input;
      input = schemas.patient.parse({
        ...payload,
        patientGroupId:
          payload.patientGroupId === undefined ? previousGroup : payload.patientGroupId,
        nationality: payload.nationality ?? undefined,
        countryCode:
          payload.countryCode === undefined
            ? payload.nationality === 'NON_MALAYSIAN' && previousCountry === 'MY'
              ? null
              : previousCountry
            : payload.countryCode,
        countryName:
          payload.countryCode === undefined && payload.countryName === undefined
            ? previousCountryName
            : payload.countryName,
        notificationConsent:
          typeof payload.notificationConsent === 'number'
            ? Boolean(payload.notificationConsent)
            : payload.notificationConsent,
      });
      if (input.countryCode === undefined)
        input.countryCode =
          input.nationality === 'NON_MALAYSIAN' && previousCountry === 'MY'
            ? null
            : previousCountry;
      if (input.patientGroupId !== null && input.patientGroupId !== undefined) {
        const group = (
          await db.query(
            "SELECT id,active FROM reference_catalogs WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND kind='PATIENT_GROUP' FOR SHARE",
            [input.patientGroupId, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (!group || (!group.active && input.patientGroupId !== previousGroup))
          throw new DomainError(
            'INVALID_PATIENT_GROUP',
            'Choose an active patient group from this branch.',
          );
      }
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
        input.countryCode ?? null,
        input.countryName ?? null,
        input.patientGroupId ?? null,
      ];
      let rows;
      if (id) {
        await this.patient(db, ctx, id);
        ({ rows } = await db.query(
          `UPDATE patients SET name=$3,national_id=$4,date_of_birth=$5,sex=$6,phone=$7,email=$8,blood_group=$9,allergies=$10,conditions=$11,notification_consent=$12,first_name=$13,last_name=$14,nationality=$15,address_line1=$16,address_line2=$17,postcode=$18,state=$19,city=$20,country_code=$21,country_name=$22,patient_group_id=$23,version=version+1,updated_at=now() WHERE tenant_id=$1 AND branch_id=$2 AND id=$24 AND version=$25 RETURNING *`,
          [...values, id, input.version],
        ));
        if (!rows[0])
          throw new DomainError('VERSION_CONFLICT', 'Patient changed. Refresh before saving.', 409);
      } else
        ({ rows } = await db.query(
          `INSERT INTO patients(tenant_id,branch_id,name,national_id,date_of_birth,sex,phone,email,blood_group,allergies,conditions,notification_consent,first_name,last_name,nationality,address_line1,address_line2,postcode,state,city,country_code,country_name,patient_group_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING *`,
          values,
        ));
      await this.audit(db, ctx, id ? 'UPDATE' : 'CREATE', 'patient', rows[0].id);
      return camel(await this.patient(db, ctx, rows[0].id));
    });
  }
  async schedule(ctx: Context, input: any) {
    input = schemas.appointment.parse(input);
    return this.transact(async (db) => {
      await this.patient(db, ctx, input.patientId);
      const practitioner = await this.practitioner(db, ctx, input.practitionerId);
      await lock(db, [`appointment:practitioner:${input.practitionerId}`]);
      const overlap = await db.query(
        `SELECT id FROM appointments WHERE deleted_at IS NULL AND status IN ('BOOKED','CHECKED_IN') AND practitioner_id=$1 AND starts_at<$3 AND ends_at>$2 LIMIT 1 FOR UPDATE`,
        [input.practitionerId, new Date(input.startsAt), new Date(input.endsAt)],
      );
      if (overlap.rowCount)
        throw new DomainError('OVERLAP', 'Practitioner already booked for this time.', 409);
      const { rows } = await db.query(
        `INSERT INTO appointments(tenant_id,branch_id,patient_id,practitioner_id,room_id,starts_at,ends_at,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.patientId,
          input.practitionerId,
          null,
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
        'SELECT * FROM appointments WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE',
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
  async removeAppointment(ctx: Context, id: number, version: number) {
    return this.transact(async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM appointments WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE',
        [id, ctx.actor.tenantId, ctx.branchId],
      );
      const existing = rows[0];
      if (!existing) throw missing();
      if (existing.version !== version || !['BOOKED', 'CANCELLED'].includes(existing.status))
        throw new DomainError(
          'VERSION_CONFLICT',
          'Appointment changed or has clinical attendance; it cannot be removed.',
          409,
        );
      const result = await db.query(
        "UPDATE appointments SET status='CANCELLED',deleted_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=$1 RETURNING *",
        [id],
      );
      await this.audit(db, ctx, 'REMOVE', 'appointment', id);
      return camel(result.rows[0]);
    });
  }
  async appointmentArrivals(ctx: Context) {
    return this.transact(async (db) => {
      await expireQueue(db, ctx);
      const { rows } = await db.query(
        `SELECT a.id,a.patient_id,p.name patient_name,a.practitioner_id,u.name practitioner_name,a.starts_at,a.reason,a.version
         FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=a.practitioner_id
         WHERE a.tenant_id=$1 AND a.branch_id=$2 AND a.deleted_at IS NULL AND a.status='BOOKED'
         AND a.starts_at>=DATE_SUB(DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)),INTERVAL 8 HOUR)
         AND a.starts_at<=UTC_TIMESTAMP(3)
         AND NOT EXISTS(SELECT 1 FROM queue_tickets q WHERE q.tenant_id=a.tenant_id AND q.branch_id=a.branch_id AND q.patient_id=a.patient_id AND q.expired_at IS NULL AND q.status NOT IN ('COMPLETED','SKIPPED'))
         AND NOT EXISTS(SELECT 1 FROM queue_tickets q WHERE q.appointment_id=a.id)
         ORDER BY a.starts_at,a.id LIMIT 200`,
        [ctx.actor.tenantId, ctx.branchId],
      );
      return camel(rows);
    });
  }
  async checkIn(ctx: Context, input: any, registrationId?: number) {
    input = schemas.queue.parse(input);
    return this.transact(async (db) => {
      await expireQueue(db, ctx);
      await this.patient(db, ctx, input.patientId);
      await lock(db, [`queue:patient:${ctx.branchId}:${input.patientId}`]);
      let appointment;
      if (input.appointmentId) {
        appointment = (
          await db.query(
            `SELECT *,starts_at<=UTC_TIMESTAMP(3) is_due,DATE(DATE_ADD(starts_at,INTERVAL 8 HOUR))=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) is_today FROM appointments WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND deleted_at IS NULL FOR UPDATE`,
            [input.appointmentId, ctx.actor.tenantId, ctx.branchId, input.patientId],
          )
        ).rows[0];
        if (!appointment) throw missing();
        if (appointment.version !== input.appointmentVersion || appointment.status !== 'BOOKED')
          throw new DomainError(
            'VERSION_CONFLICT',
            'Appointment changed or was already checked in. Refresh arrivals.',
            409,
          );
        if (!appointment.is_due || !appointment.is_today)
          throw new DomainError(
            'APPOINTMENT_NOT_DUE',
            'Appointment check-in is available on its scheduled date and time.',
            409,
          );
      }
      const active = (
        await db.query(
          "SELECT id,ticket_number FROM queue_tickets WHERE tenant_id=$1 AND branch_id=$2 AND patient_id=$3 AND expired_at IS NULL AND status NOT IN ('COMPLETED','SKIPPED') FOR UPDATE",
          [ctx.actor.tenantId, ctx.branchId, input.patientId],
        )
      ).rows[0];
      if (active)
        throw new DomainError(
          'PATIENT_ALREADY_CHECKED_IN',
          `Patient already checked in. Use existing ticket ${active.ticket_number} (ID ${active.id}).`,
          409,
        );
      let allocation: { ticketNumber: string; serviceDate: string };
      if (registrationId) {
        const reservation = (
          await db.query(
            "SELECT ticket_number,service_date FROM pending_registrations WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND status='PENDING' AND expires_at>UTC_TIMESTAMP(3) AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) FOR UPDATE",
            [registrationId, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (!reservation)
          throw new DomainError(
            'REGISTRATION_EXPIRED',
            'Registration ticket is no longer available.',
            409,
          );
        allocation = {
          ticketNumber: reservation.ticket_number,
          serviceDate: reservation.service_date,
        };
      } else allocation = await allocateQueueNumber(db, ctx.branchId);
      const { rows } = await db.query(
        `INSERT INTO queue_tickets(tenant_id,branch_id,patient_id,ticket_number,priority,service_date,appointment_id,practitioner_id) SELECT $1,$2,$3,$4,$5,$8,$6,$7 FROM DUAL WHERE $8=DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)) RETURNING *`,
        [
          ctx.actor.tenantId,
          ctx.branchId,
          input.patientId,
          allocation.ticketNumber,
          input.priority,
          appointment?.id || null,
          appointment?.practitioner_id || null,
          allocation.serviceDate,
        ],
      );
      if (!rows[0])
        throw new DomainError(
          'SERVICE_DAY_CHANGED',
          'Clinic day changed. Refresh and check in again.',
          409,
        );
      if (appointment)
        await db.query(
          "UPDATE appointments SET status='CHECKED_IN',version=version+1 WHERE id=$1",
          [appointment.id],
        );
      await this.audit(db, ctx, 'CHECK_IN', 'queue', rows[0].id);
      return camel(rows[0]);
    });
  }
  async transitionQueue(ctx: Context, id: number, input: any) {
    // Commit expired markers even when an attempt to operate on an old ticket is rejected.
    await this.transact((db) => expireQueue(db, ctx));
    return this.transact(async (db) => {
      await expireQueue(db, ctx);
      const { rows } = await db.query(
        `SELECT *,(created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) OR service_date<DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))) lifetime_elapsed FROM queue_tickets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
        [id, ctx.actor.tenantId, ctx.branchId],
      );
      const ticket = rows[0];
      if (!ticket) throw missing();
      if (ticket.expired_at || ticket.lifetime_elapsed)
        throw new DomainError(
          'QUEUE_EXPIRED',
          'Queue ticket expired after 12 hours or at midnight Malaysia time. Check in a new visit.',
          409,
        );
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
          "SELECT id FROM queue_tickets WHERE room_id=$1 AND expired_at IS NULL AND status IN ('CALLED_TO_ROOM','IN_CONSULTATION') AND id<>$2 FOR UPDATE",
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
    allowInactive = false,
  ) {
    if (!prescriptions.length) return [];
    const { rows } = await db.query(
      `SELECT * FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND id IN ($3) ORDER BY id FOR UPDATE`,
      [ctx.actor.tenantId, ctx.branchId, prescriptions.map((p) => p.itemId)],
    );
    if (rows.length !== prescriptions.length)
      throw new DomainError(
        'INVALID_MEDICATION',
        'Each prescription must reference a distinct inventory item in this branch.',
      );
    if (rows.some((item) => item.category !== 'MEDICATION'))
      throw new DomainError(
        'INVALID_MEDICATION',
        'Prescriptions require medication items; use supply usage for non-medication stock.',
      );
    if (!allowInactive && rows.some((item) => !item.active))
      throw new DomainError(
        'INACTIVE_MEDICATION',
        'Archived medication cannot be newly prescribed.',
      );
    ClinicalEncounter.assertAllergySafety(
      patient.allergies,
      rows.map((item) => {
        const rx = prescriptions.find((rx) => rx.itemId === item.id);
        return allowInactive
          ? {
              ...item,
              name: rx.itemName || item.name,
              ingredient: rx.ingredient ?? item.ingredient,
            }
          : item;
      }),
    );
    return rows;
  }
  async getEncounter(ctx: Context, id: number) {
    const { rows } = await this.db.query(
      'SELECT e.*,p.id patient_number,p.name patient_name,u.name practitioner_name FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=e.practitioner_id WHERE e.id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 AND e.deleted_at IS NULL',
      [id, ctx.actor.tenantId, ctx.branchId],
    );
    if (!rows[0]) throw missing();
    await this.audit(this.db, ctx, 'READ_ENCOUNTER', 'encounter', id);
    return camel(rows[0]);
  }
  async removeEncounter(ctx: Context, id: number, version: number) {
    if (ctx.actor.role !== 'DOCTOR')
      throw new DomainError(
        'DOCTOR_REQUIRED',
        'Only attending GP can remove an unsigned draft.',
        403,
      );
    return this.transact(async (db) => {
      await lock(db, [`queue-lifecycle:${ctx.actor.tenantId}:${ctx.branchId}`]);
      const existing = (
        await db.query(
          'SELECT id,practitioner_id,status,version FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE',
          [id, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!existing) throw missing();
      if (existing.practitioner_id !== ctx.actor.id)
        throw new DomainError('FORBIDDEN', 'Only attending GP can remove this draft.', 403);
      if (existing.status !== 'DRAFT')
        throw new DomainError(
          'ENCOUNTER_SIGNED',
          'Signed clinical encounters are permanent and cannot be removed.',
          409,
        );
      if (existing.version !== version)
        throw new DomainError(
          'VERSION_CONFLICT',
          'Encounter changed. Reload before removing.',
          409,
        );
      const history = (
        await db.query(
          `SELECT EXISTS(SELECT 1 FROM dispenses WHERE encounter_id=$1) OR EXISTS(SELECT 1 FROM prescription_reservations WHERE encounter_id=$1) OR EXISTS(SELECT 1 FROM clinical_documents WHERE encounter_id=$1) OR EXISTS(SELECT 1 FROM prescription_dose_logs WHERE encounter_id=$1) OR EXISTS(SELECT 1 FROM package_redemptions WHERE encounter_id=$1) OR EXISTS(SELECT 1 FROM clinical_photos WHERE encounter_id=$1) protected`,
          [id],
        )
      ).rows[0];
      if (history.protected)
        throw new DomainError(
          'DRAFT_HAS_HISTORY',
          'Draft has protected clinical or stock history and cannot be removed.',
          409,
        );
      const result = (
        await db.query(
          'UPDATE encounters SET deleted_at=UTC_TIMESTAMP(3),updated_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=$1 RETURNING *',
          [id],
        )
      ).rows[0];
      await this.audit(db, ctx, 'REMOVE', 'encounter', id, { status: 'DRAFT', version });
      return { id, deletedAt: camel(result).deletedAt, version: result.version };
    });
  }
  async saveEncounter(ctx: Context, input: any, id?: number) {
    if (ctx.actor.role !== 'DOCTOR')
      throw new DomainError(
        'DOCTOR_REQUIRED',
        'Only a GP can write or sign a clinical encounter.',
        403,
      );
    if (!id && input.queueTicketId) await this.transact((db) => expireQueue(db, ctx));
    return this.transact(async (db) => {
      if (!id && input.queueTicketId) await expireQueue(db, ctx);
      // Take lifecycle lock before encounter/item locks; linked signing and room calls use the same order.
      if (id) await lock(db, [`queue-lifecycle:${ctx.actor.tenantId}:${ctx.branchId}`]);
      let existingQueueId: number | null = null;
      if (id) {
        const existing = await db.query(
          'SELECT status,queue_ticket_id FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE',
          [id, ctx.actor.tenantId, ctx.branchId],
        );
        if (!existing.rows[0]) throw missing();
        if (existing.rows[0].status === 'SIGNED')
          throw new DomainError('ENCOUNTER_SIGNED', 'Signed encounters are immutable.', 409);
        existingQueueId = existing.rows[0].queue_ticket_id;
      }
      input = schemas.encounter.parse(input);
      if (id && input.queueTicketId && input.queueTicketId !== existingQueueId)
        throw new DomainError('QUEUE_IMMUTABLE', 'Encounter queue association cannot change.', 409);
      const patient = await this.patient(db, ctx, input.patientId);
      const medicationItems = await this.validatePrescriptions(
        db,
        ctx,
        patient,
        input.prescriptions,
      );
      input.prescriptions = input.prescriptions.map((rx: any) => {
        const item = medicationItems.find((item) => item.id === rx.itemId)!;
        return {
          ...rx,
          itemName: item.name,
          ingredient: item.ingredient,
          unit: item.unit,
          unitPriceCents: rx.unitPriceCents ?? item.price_cents,
        };
      });
      for (const supply of [...input.consumables].sort((a: any, b: any) => a.itemId - b.itemId)) {
        const item = (
          await db.query(
            'SELECT category,active FROM inventory_items WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
            [supply.itemId, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (!item || item.category !== 'CONSUMABLE' || !item.active)
          throw new DomainError(
            'INVALID_CONSUMABLE',
            'Choose an active consumable from this branch.',
          );
      }
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
          `SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE`,
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
            `SELECT id,status,expired_at,created_at,(created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) OR service_date<DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))) lifetime_elapsed FROM queue_tickets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND practitioner_id=$5 FOR UPDATE`,
            [input.queueTicketId, ctx.actor.tenantId, ctx.branchId, input.patientId, ctx.actor.id],
          );
          if (!q.rowCount)
            throw new DomainError(
              'INVALID_QUEUE',
              'Encounter requires this doctor’s active consultation ticket.',
            );
          if (q.rows[0].expired_at || q.rows[0].lifetime_elapsed)
            throw new DomainError(
              'QUEUE_EXPIRED',
              'Queue ticket expired after 12 hours or at midnight Malaysia time. Check in a new visit.',
              409,
            );
          if (!['CALLED_TO_ROOM', 'IN_CONSULTATION'].includes(q.rows[0].status))
            throw new DomainError(
              'INVALID_QUEUE',
              'Encounter requires this doctor’s active consultation ticket.',
            );
          const associated = (
            await db.query(
              'SELECT id FROM encounters WHERE tenant_id=$1 AND branch_id=$2 AND queue_ticket_id=$3 AND deleted_at IS NULL LIMIT 1',
              [ctx.actor.tenantId, ctx.branchId, input.queueTicketId],
            )
          ).rows[0];
          if (associated)
            throw new DomainError(
              'ENCOUNTER_EXISTS',
              `Consultation already exists for this queue ticket. Open encounter ${associated.id}.`,
              409,
            );
          if (q.rows[0].status === 'CALLED_TO_ROOM') {
            await db.query(
              "UPDATE queue_tickets SET status='IN_CONSULTATION',version=version+1 WHERE id=$1",
              [input.queueTicketId],
            );
            await this.audit(db, ctx, 'TRANSITION', 'queue', input.queueTicketId, {
              from: 'CALLED_TO_ROOM',
              to: 'IN_CONSULTATION',
            });
          }
        }
        ({ rows } = await db.query(
          `INSERT INTO encounters(tenant_id,branch_id,patient_id,practitioner_id,queue_ticket_id,specialty,subjective,objective,assessment,plan,vitals,prescriptions,procedure_notes,status,signed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,CASE WHEN $14='SIGNED' THEN now() ELSE NULL END) RETURNING *`,
          values,
        ));
      }
      const clinicalDetails = (
        await db.query(
          'UPDATE encounters SET consultation_fee_cents=$4,procedure_fee_cents=$5,consumables=$6 WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 RETURNING *',
          [
            rows[0].id,
            ctx.actor.tenantId,
            ctx.branchId,
            input.consultationFeeCents ?? null,
            input.procedureFeeCents ?? null,
            JSON.stringify(input.consumables),
          ],
        )
      ).rows[0];
      rows[0] = clinicalDetails;
      if (input.status === 'SIGNED') {
        const scopedService = new ClinicService(db, (work) => work(db));
        for (const supply of [...input.consumables].sort((a: any, b: any) => a.itemId - b.itemId))
          await scopedService.useInventory(ctx, {
            ...supply,
            reason: `Encounter ${rows[0].id}: ${supply.reason}`.slice(0, 500),
            idempotencyKey: `encounter:${rows[0].id}:supply:${supply.itemId}`,
          });
      }
      if (input.status === 'SIGNED')
        await this.reservePrescription(db, ctx, rows[0].id, input.prescriptions);
      if (input.status === 'SIGNED' && rows[0].queue_ticket_id) {
        const linked = (
          await db.query(
            "SELECT id FROM queue_tickets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND practitioner_id=$5 AND expired_at IS NULL AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) AND status='IN_CONSULTATION' FOR UPDATE",
            [rows[0].queue_ticket_id, ctx.actor.tenantId, ctx.branchId, patient.id, ctx.actor.id],
          )
        ).rows[0];
        if (linked) {
          const next = input.prescriptions.length ? 'DISPENSARY_WAITING' : 'PAYMENT_WAITING';
          new QueueTicket('IN_CONSULTATION').transition(next);
          await db.query('UPDATE queue_tickets SET status=$2,version=version+1 WHERE id=$1', [
            linked.id,
            next,
          ]);
          await this.audit(db, ctx, 'TRANSITION', 'queue', linked.id, {
            from: 'IN_CONSULTATION',
            to: next,
          });
        }
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
  private async availableBatches(db: Database, ctx: Context, itemId: number) {
    await db.query(
      'SELECT id FROM inventory_items WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
      [itemId, ctx.actor.tenantId, ctx.branchId],
    );
    const rows = (
      await db.query(
        "SELECT id,quantity,DATE_FORMAT(expires_on,'%Y-%m-%d') expires_on FROM inventory_batches WHERE tenant_id=$1 AND branch_id=$2 AND item_id=$3 AND quantity>0 ORDER BY expires_on IS NULL,expires_on,received_at,id FOR UPDATE",
        [ctx.actor.tenantId, ctx.branchId, itemId],
      )
    ).rows;
    for (const row of rows) {
      const held = (
        await db.query(
          'SELECT COALESCE(SUM(quantity),0) quantity FROM prescription_reservations WHERE tenant_id=$1 AND branch_id=$2 AND batch_id=$3 AND consumed_at IS NULL',
          [ctx.actor.tenantId, ctx.branchId, row.id],
        )
      ).rows[0];
      row.quantity -= Number(held.quantity);
    }
    return rows;
  }
  private async reservePrescription(
    db: Database,
    ctx: Context,
    encounterId: number,
    prescriptions: any[],
  ) {
    for (const rx of [...prescriptions].sort((a, b) => a.itemId - b.itemId)) {
      const allocations = FefoAllocator.allocate(
        await this.availableBatches(db, ctx, rx.itemId),
        rx.quantity,
        today(),
      );
      for (const allocation of allocations)
        await db.query(
          'INSERT INTO prescription_reservations(tenant_id,branch_id,encounter_id,item_id,batch_id,quantity) VALUES($1,$2,$3,$4,$5,$6)',
          [
            ctx.actor.tenantId,
            ctx.branchId,
            encounterId,
            rx.itemId,
            allocation.batchId,
            allocation.quantity,
          ],
        );
    }
  }
  async addItem(ctx: Context, input: any) {
    if (ctx.actor.role !== 'ADMIN')
      throw new DomainError(
        'FORBIDDEN',
        'Inventory catalog management requires an administrator.',
        403,
      );
    input = schemas.item.parse(input);
    validateItemIngredient(input);
    return this.transact(async (db) => {
      await validateCatalogChoices(db, ctx, 'INVENTORY_UNIT', [input.unit]);
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
      return camel({ ...rows[0], active: Boolean(rows[0].active) });
    });
  }
  async receiveBatch(ctx: Context, input: any) {
    input = schemas.batch.parse(input);
    if (input.expiresOn && input.expiresOn <= today())
      throw new DomainError(
        'BATCH_EXPIRED',
        'Expiry date must be after today. Stock expiring today or earlier cannot be received for dispensing.',
      );
    return this.transact(async (db) => {
      const item = (
        await db.query(
          'SELECT category,version FROM inventory_items WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
          [input.itemId, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!item) throw missing();
      if (item.category === 'MEDICATION' && !input.expiresOn)
        throw new DomainError('EXPIRY_REQUIRED', 'Medication batches require an expiry date.');
      if (input.priceCents !== undefined) {
        if (input.itemVersion !== undefined && item.version !== input.itemVersion)
          throw new DomainError(
            'VERSION_CONFLICT',
            'Item price changed. Reload before receiving stock.',
            409,
          );
        await db.query(
          'UPDATE inventory_items SET price_cents=$4,version=version+1 WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
          [input.itemId, ctx.actor.tenantId, ctx.branchId, input.priceCents],
        );
        await this.audit(db, ctx, 'UPDATE_STOCK_PRICE', 'inventory', input.itemId, {
          priceCents: input.priceCents,
        });
      }
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
          'SELECT coalesce(sum(quantity),0) stock_quantity FROM inventory_batches WHERE tenant_id=$1 AND branch_id=$2 AND item_id=$3 AND (expires_on IS NULL OR expires_on>$4)',
          [ctx.actor.tenantId, ctx.branchId, input.itemId, today()],
        )
      ).rows[0];
      const reserved = Number(
        (
          await db.query(
            'SELECT COALESCE(SUM(r.quantity),0) quantity FROM prescription_reservations r JOIN inventory_batches b ON b.id=r.batch_id WHERE r.tenant_id=$1 AND r.branch_id=$2 AND r.item_id=$3 AND r.consumed_at IS NULL AND b.expires_on>$4',
            [ctx.actor.tenantId, ctx.branchId, input.itemId, today()],
          )
        ).rows[0].quantity,
      );
      return {
        ...camel(rows[0]),
        stockQuantity: Number(stock.stock_quantity) - reserved,
        onHandQuantity: Number(stock.stock_quantity),
        reservedQuantity: reserved,
      };
    });
  }
  async useInventory(ctx: Context, input: unknown) {
    const v = schemas.inventoryUsage.parse(input);
    return this.transact(async (db) => {
      await lock(db, [`inventory-usage:${ctx.branchId}:${v.idempotencyKey}`]);
      const prior = (
        await db.query(
          'SELECT * FROM inventory_usages WHERE tenant_id=$1 AND branch_id=$2 AND idempotency_key=$3',
          [ctx.actor.tenantId, ctx.branchId, v.idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (
          prior.item_id !== v.itemId ||
          prior.quantity !== v.quantity ||
          prior.reason !== v.reason
        )
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Usage key already has different details.',
            409,
          );
        return camel(prior);
      }
      const item = (
        await db.query(
          'SELECT category FROM inventory_items WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
          [v.itemId, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!item) throw missing();
      if (item.category === 'MEDICATION')
        throw new DomainError(
          'MEDICATION_DISPENSE_REQUIRED',
          'Medication must use signed prescription dispensing.',
        );
      const batches = (
        await db.query(
          "SELECT id,quantity,DATE_FORMAT(expires_on,'%Y-%m-%d') expires_on FROM inventory_batches WHERE tenant_id=$1 AND branch_id=$2 AND item_id=$3 AND quantity>0 ORDER BY expires_on IS NULL,expires_on,received_at,id FOR UPDATE",
          [ctx.actor.tenantId, ctx.branchId, v.itemId],
        )
      ).rows;
      const allocations = FefoAllocator.allocate(batches, v.quantity, today(), true);
      const usage = (
        await db.query(
          'INSERT INTO inventory_usages(tenant_id,branch_id,item_id,quantity,reason,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            ctx.actor.tenantId,
            ctx.branchId,
            v.itemId,
            v.quantity,
            v.reason,
            ctx.actor.id,
            v.idempotencyKey,
          ],
        )
      ).rows[0];
      for (const allocation of allocations) {
        await db.query('UPDATE inventory_batches SET quantity=quantity-$2 WHERE id=$1', [
          allocation.batchId,
          allocation.quantity,
        ]);
        await db.query(
          "INSERT INTO stock_movements(tenant_id,branch_id,batch_id,usage_id,quantity_delta,reason,actor_id) VALUES($1,$2,$3,$4,$5,'SUPPLY_USAGE',$6)",
          [
            ctx.actor.tenantId,
            ctx.branchId,
            allocation.batchId,
            usage.id,
            -allocation.quantity,
            ctx.actor.id,
          ],
        );
      }
      await this.audit(db, ctx, 'USE_SUPPLY', 'inventory_usage', usage.id, {
        itemId: v.itemId,
        quantity: v.quantity,
      });
      return camel(usage);
    });
  }
  private async advanceVisit(
    db: Database,
    ctx: Context,
    encounter: any,
    from: QueueStatus,
    to: QueueStatus,
  ) {
    if (!encounter.queue_ticket_id) return;
    const ticket = (
      await db.query(
        'SELECT id FROM queue_tickets WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND practitioner_id=$5 AND status=$6 AND expired_at IS NULL AND created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) AND service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) FOR UPDATE',
        [
          encounter.queue_ticket_id,
          ctx.actor.tenantId,
          ctx.branchId,
          encounter.patient_id,
          encounter.practitioner_id,
          from,
        ],
      )
    ).rows[0];
    if (!ticket) return;
    new QueueTicket(from).transition(to);
    await db.query(
      "UPDATE queue_tickets SET status=$2,version=version+1,completed_at=CASE WHEN $2='COMPLETED' THEN now() ELSE completed_at END WHERE id=$1",
      [ticket.id, to],
    );
    await this.audit(db, ctx, 'TRANSITION', 'queue', ticket.id, { from, to });
  }
  async dispense(ctx: Context, input: any) {
    return this.transact(async (db) => {
      await lock(db, [`queue-lifecycle:${ctx.actor.tenantId}:${ctx.branchId}`]);
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
        `SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE`,
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
      await this.validatePrescriptions(db, ctx, patient, e.prescriptions, true);
      const record = await db.query(
        `INSERT INTO dispenses(tenant_id,branch_id,patient_id,encounter_id,actor_id,idempotency_key) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [ctx.actor.tenantId, ctx.branchId, e.patient_id, e.id, ctx.actor.id, input.idempotencyKey],
      );
      // Close this encounter's holds inside the same transaction before reallocating.
      // This permits fresh FEFO allocation when originally reserved batches expired.
      const held = (
        await db.query(
          'SELECT * FROM prescription_reservations WHERE tenant_id=$1 AND branch_id=$2 AND encounter_id=$3 AND consumed_at IS NULL FOR UPDATE',
          [ctx.actor.tenantId, ctx.branchId, e.id],
        )
      ).rows;
      await db.query(
        "UPDATE prescription_reservations SET consumed_at=now(),status='RELEASED' WHERE tenant_id=$1 AND branch_id=$2 AND encounter_id=$3 AND consumed_at IS NULL",
        [ctx.actor.tenantId, ctx.branchId, e.id],
      );
      const allocations = [];
      for (const rx of [...e.prescriptions].sort((a, b) => a.itemId - b.itemId)) {
        const batches = await this.availableBatches(db, ctx, rx.itemId);
        for (const allocation of FefoAllocator.allocate(batches, rx.quantity, today())) {
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
          const original = held.find(
            (h) => h.batch_id === allocation.batchId && h.quantity === allocation.quantity,
          );
          if (original)
            await db.query("UPDATE prescription_reservations SET status='FULFILLED' WHERE id=$1", [
              original.id,
            ]);
        }
      }
      await this.advanceVisit(db, ctx, e, 'DISPENSARY_WAITING', 'PAYMENT_WAITING');
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
        `SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND patient_id=$4 AND status='SIGNED' AND deleted_at IS NULL`,
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
    if (input.payments.some((payment: any) => payment.method === 'DEPOSIT'))
      throw new DomainError('FEATURE_RETIRED', 'Deposit payments are no longer supported.', 410);
    const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.transact(async (db) => {
      if (input.encounterId)
        await lock(db, [`queue-lifecycle:${ctx.actor.tenantId}:${ctx.branchId}`]);
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
      await validateCatalogChoices(
        db,
        ctx,
        'BILLING_CATEGORY',
        input.lines.map((line: any) => line.category),
      );
      let checkoutEncounter: any;
      if (input.encounterId) {
        checkoutEncounter = (
          await db.query(
            'SELECT * FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE',
            [input.encounterId, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (!checkoutEncounter) throw missing();
        if (
          checkoutEncounter.patient_id !== input.patientId ||
          checkoutEncounter.practitioner_id !== input.practitionerId
        )
          throw new DomainError(
            'CHECKOUT_PATIENT_MISMATCH',
            'Checkout must use the consultation patient and practitioner.',
            409,
          );
        if (
          checkoutEncounter.status !== 'SIGNED' ||
          (checkoutEncounter.prescriptions.length &&
            !(
              await db.query('SELECT id FROM dispenses WHERE encounter_id=$1', [
                checkoutEncounter.id,
              ])
            ).rowCount)
        )
          throw new DomainError(
            'CHECKOUT_NOT_READY',
            'Sign consultation and dispense its medicines before checkout.',
            409,
          );
        if (
          (await db.query('SELECT id FROM invoices WHERE encounter_id=$1', [checkoutEncounter.id]))
            .rowCount
        )
          throw new DomainError('ALREADY_BILLED', 'Consultation already has a receipt.', 409);
        const categories = (
          await db.query(
            "SELECT label,billing_default FROM reference_catalogs WHERE tenant_id=$1 AND branch_id=$2 AND kind='BILLING_CATEGORY' AND active=1 AND billing_default IS NOT NULL",
            [ctx.actor.tenantId, ctx.branchId],
          )
        ).rows;
        const approvedLines = encounterBillingLines(camel(checkoutEncounter), {
          service:
            categories.find((entry) => entry.billing_default === 'SERVICE')?.label || 'SERVICE',
          product:
            categories.find((entry) => entry.billing_default === 'PRODUCT')?.label || 'PRODUCT',
        });
        if (
          approvedLines &&
          (approvedLines.length !== input.lines.length ||
            approvedLines.some((line, index) => {
              const actual = input.lines[index];
              return (
                line.description !== actual.description ||
                line.quantity !== actual.quantity ||
                line.unitPriceCents !== actual.unitPriceCents ||
                line.category !== actual.category
              );
            }))
        )
          throw new DomainError(
            'DOCTOR_PRICE_REQUIRED',
            'Checkout must match the signed doctor-approved itemized prices.',
            409,
          );
      }
      const patient = await this.patient(db, ctx, input.patientId);
      await this.practitioner(db, ctx, input.practitionerId);
      const branding = (
        await db.query(
          'SELECT t.name clinic_name,b.name branch_name,b.address FROM tenants t JOIN branches b ON b.tenant_id=t.id WHERE t.id=$1 AND b.id=$2',
          [ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!branding) throw missing();
      const letterhead = await readLetterhead(db, ctx.actor.tenantId);
      const receiptSnapshot = {
        ...letterhead,
        clinicName: branding.clinic_name,
        branchName: branding.branch_name,
        clinicAddress: letterhead.address || branding.address,
        patientName: patient.name,
        nationalId: patient.national_id,
        receivedBy: ctx.actor.name,
      };
      const total = input.lines.reduce(
        (sum: Money, l: any) => sum.add(new Money(l.unitPriceCents).multiply(l.quantity)),
        new Money(0),
      ).cents;
      if (
        (!total &&
          (!checkoutEncounter ||
            checkoutEncounter.consultation_fee_cents == null ||
            checkoutEncounter.procedure_fee_cents == null)) ||
        input.payments.reduce((sum: number, p: any) => sum + p.amountCents, 0) !== total
      )
        throw new DomainError(
          'PAYMENT_MISMATCH',
          'Split payment total must match invoice total exactly.',
        );
      const { rows } = await db.query(
        `INSERT INTO invoices(tenant_id,branch_id,patient_id,practitioner_id,invoice_number,\`lines\`,total_cents,idempotency_key,request_hash,receipt_snapshot,encounter_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
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
          JSON.stringify(receiptSnapshot),
          input.encounterId || null,
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
      if (checkoutEncounter)
        await this.advanceVisit(db, ctx, checkoutEncounter, 'PAYMENT_WAITING', 'COMPLETED');
      await this.audit(db, ctx, 'CHECKOUT', 'invoice', rows[0].id);
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
        `SELECT e.*,p.name patient_name,p.national_id,p.allergies,p.conditions,u.name practitioner_name,u.license_number,b.name branch_name,b.address FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=e.practitioner_id JOIN branches b ON b.id=e.branch_id WHERE e.id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 AND e.deleted_at IS NULL FOR UPDATE`,
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
      if (input.kind === 'REFERRAL')
        await validateCatalogChoices(db, ctx, 'REFERRAL_DESTINATION', [input.target]);
      if (input.kind === 'LAB' && !input.panels?.length)
        throw new DomainError('LAB_PANELS_REQUIRED', 'Select at least one investigation panel.');
      if (input.kind === 'LAB') {
        await validateCatalogChoices(db, ctx, 'LAB_PANEL', input.panels);
        await validateCatalogChoices(db, ctx, 'SPECIMEN_TYPE', [input.specimenType || 'BLOOD']);
      }
      const issuedAt = new Date().toISOString();
      const medicationNames = e.prescriptions.length
        ? new Map(
            (
              await db.query(
                'SELECT id,name FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND id IN ($3)',
                [ctx.actor.tenantId, ctx.branchId, e.prescriptions.map((rx: any) => rx.itemId)],
              )
            ).rows.map((item) => [item.id, item.name]),
          )
        : new Map();
      const letterhead = await readLetterhead(db, ctx.actor.tenantId);
      const payload = {
        ...letterhead,
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
        branchAddress: letterhead.address || e.address,
        assessment: e.assessment,
        vitals: e.vitals,
        allergies: e.allergies,
        conditions: e.conditions,
        prescriptions: e.prescriptions.map((rx: any) => ({
          ...rx,
          itemName: rx.itemName || medicationNames.get(rx.itemId) || 'Medication ID ' + rx.itemId,
        })),
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
        verificationUrl: `${process.env.PUBLIC_URL || 'http://127.0.0.1:3100'}/verify/${token}`,
      };
    });
  }
  private doseView(row: any): MedicationDose {
    return camel({
      id: row.id,
      encounter_id: row.encounter_id,
      item_id: row.item_id,
      medicine_name: row.medicine_name,
      unit: row.unit,
      outcome: row.outcome,
      source: row.source,
      occurred_at: row.occurred_at,
      amount: row.amount === null ? null : Number(row.amount),
      notes: row.notes,
      actor_id: row.actor_id,
      actor_name: row.actor_name,
      created_at: row.created_at,
      idempotency_key: row.idempotency_key,
    });
  }
  async medicationDoses(ctx: Context, id: number): Promise<MedicationDoseLog> {
    if (ctx.modules && !ctx.modules.includes('clinical'))
      throw new DomainError(
        'MODULE_FORBIDDEN',
        'Clinical access required for patient medication-taking records.',
        403,
      );
    const e = (
      await this.db.query(
        'SELECT e.id,e.patient_id,p.name patient_name FROM encounters e JOIN patients p ON p.id=e.patient_id WHERE e.id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 AND e.deleted_at IS NULL',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows[0];
    if (!e) throw missing();
    const rows = (
      await this.db.query(
        'SELECT d.*,u.name actor_name FROM prescription_dose_logs d JOIN users u ON u.id=d.actor_id AND u.tenant_id=d.tenant_id WHERE d.encounter_id=$1 AND d.tenant_id=$2 AND d.branch_id=$3 ORDER BY d.occurred_at DESC,d.id DESC LIMIT 500',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows;
    await this.audit(this.db, ctx, 'READ_MEDICATION_DOSES', 'encounter', id, {
      count: rows.length,
    });
    return {
      encounterId: id,
      patientId: e.patient_id,
      patientName: e.patient_name,
      entries: rows.map((row) => this.doseView(row)),
    };
  }
  async recordMedicationDose(ctx: Context, id: number, input: unknown): Promise<MedicationDose> {
    if (!['DOCTOR', 'NURSE'].includes(ctx.actor.role))
      throw new DomainError(
        'PROFESSIONAL_REQUIRED',
        'Only a GP or nurse may record patient medication taking.',
        403,
      );
    if (ctx.modules && !ctx.modules.includes('clinical'))
      throw new DomainError(
        'MODULE_FORBIDDEN',
        'Clinical access required for patient medication-taking records.',
        403,
      );
    const value = schemas.medicationDose.parse(input);
    const hash = createHash('sha256')
      .update(canonicalJson({ encounterId: id, ...value }))
      .digest('hex');
    return this.transact(async (db) => {
      await lock(db, [`medication-dose:${ctx.branchId}:${value.idempotencyKey}`]);
      const prior = (
        await db.query(
          'SELECT d.*,u.name actor_name FROM prescription_dose_logs d JOIN users u ON u.id=d.actor_id WHERE d.tenant_id=$1 AND d.branch_id=$2 AND d.idempotency_key=$3',
          [ctx.actor.tenantId, ctx.branchId, value.idempotencyKey],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== hash)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Medication report key already has different details.',
            409,
          );
        return this.doseView(prior);
      }
      const e = (
        await db.query(
          'SELECT status,prescriptions FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND deleted_at IS NULL FOR UPDATE',
          [id, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!e) throw missing();
      if (e.status !== 'SIGNED')
        throw new DomainError(
          'UNSIGNED_PRESCRIPTION',
          'Sign prescription before recording patient medication taking.',
        );
      const prescribedRx = e.prescriptions.find((rx: any) => rx.itemId === value.itemId);
      if (!prescribedRx)
        throw new DomainError('NOT_PRESCRIBED', 'Medication is not prescribed in this encounter.');
      const item = (
        await db.query(
          'SELECT name,unit,category FROM inventory_items WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
          [value.itemId, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!item || item.category !== 'MEDICATION')
        throw new DomainError(
          'INVALID_MEDICATION',
          'Patient taking records require a prescribed medication.',
        );
      const row = (
        await db.query(
          'INSERT INTO prescription_dose_logs(tenant_id,branch_id,encounter_id,item_id,medicine_name,unit,outcome,source,occurred_at,amount,notes,actor_id,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',
          [
            ctx.actor.tenantId,
            ctx.branchId,
            id,
            value.itemId,
            prescribedRx.itemName || item.name,
            prescribedRx.unit || item.unit,
            value.outcome,
            value.source,
            new Date(value.occurredAt),
            value.amount,
            value.notes,
            ctx.actor.id,
            value.idempotencyKey,
            hash,
          ],
        )
      ).rows[0];
      await this.audit(db, ctx, 'RECORD_MEDICATION_DOSE', 'prescription_dose_log', row.id, {
        encounterId: id,
        itemId: value.itemId,
        outcome: value.outcome,
        source: value.source,
      });
      return this.doseView({ ...row, actor_name: ctx.actor.name });
    });
  }
  async medicineLabels(ctx: Context, id: number): Promise<MedicineLabelPrescription> {
    const row = (
      await this.db.query(
        "SELECT e.id,e.patient_id,e.prescriptions,p.name patient_name,u.name practitioner_name,d.created_at dispensed_at FROM encounters e JOIN dispenses d ON d.encounter_id=e.id AND d.tenant_id=e.tenant_id AND d.branch_id=e.branch_id JOIN patients p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id AND p.branch_id=e.branch_id JOIN users u ON u.id=e.practitioner_id AND u.tenant_id=e.tenant_id WHERE e.id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 AND e.deleted_at IS NULL AND e.status='SIGNED'",
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows[0];
    if (!row) throw missing();
    const missingSnapshots = row.prescriptions.filter((rx: any) => !rx.itemName || !rx.unit);
    const items = missingSnapshots.length
      ? (
          await this.db.query(
            'SELECT id,name,unit FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND id IN ($3)',
            [ctx.actor.tenantId, ctx.branchId, missingSnapshots.map((rx: any) => rx.itemId)],
          )
        ).rows
      : [];
    const catalog = new Map(items.map((item) => [item.id, item]));
    return {
      id: row.id,
      patientId: row.patient_id,
      patientName: row.patient_name,
      practitionerName: row.practitioner_name,
      dispensedAt: camel({ dispensed_at: row.dispensed_at }).dispensedAt,
      prescriptions: row.prescriptions.map((rx: any) => ({
        itemId: rx.itemId,
        itemName: rx.itemName || catalog.get(rx.itemId)?.name || `Medication ID ${rx.itemId}`,
        unit: rx.unit || catalog.get(rx.itemId)?.unit,
        quantity: rx.quantity,
        quantityPerDose: rx.quantityPerDose,
        form: rx.form,
        instructions: rx.instructions,
        indication: rx.indication,
        dosage: rx.dosage,
        durationDays: rx.durationDays,
        frequencyPerDay: rx.frequencyPerDay || 1,
        mealTiming: rx.mealTiming || 'ANY_TIME',
      })),
    };
  }
  async prescriptionLog(ctx: Context, id: number): Promise<PrescriptionLog> {
    const e = (
      await this.db.query(
        'SELECT e.id,e.patient_id,e.prescriptions,e.status,e.signed_at,e.created_at,u.name practitioner_name,p.name patient_name FROM encounters e JOIN patients p ON p.id=e.patient_id JOIN users u ON u.id=e.practitioner_id WHERE e.id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 AND e.deleted_at IS NULL',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows[0];
    if (!e) throw missing();
    const items = e.prescriptions.length
      ? (
          await this.db.query(
            'SELECT id,name FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND id IN ($3)',
            [ctx.actor.tenantId, ctx.branchId, e.prescriptions.map((rx: any) => rx.itemId)],
          )
        ).rows
      : [];
    const names = new Map(items.map((i) => [i.id, i.name]));
    const events: PrescriptionLogEvent[] = [];
    const event = (
      type: PrescriptionLogEvent['type'],
      rx: any,
      quantity: number,
      at: string,
      actorName: string,
      batchId?: number,
      batchNumber?: string | null,
    ) =>
      events.push({
        type,
        itemId: rx.itemId,
        itemName: String(rx.itemName || names.get(rx.itemId) || 'Medication'),
        quantity,
        at: camel({ created_at: at }).createdAt,
        actorName,
        frequencyPerDay: rx.frequencyPerDay || 1,
        mealTiming: rx.mealTiming || 'ANY_TIME',
        dosage: rx.dosage,
        quantityPerDose: rx.quantityPerDose,
        form: rx.form,
        instructions: rx.instructions,
        indication: rx.indication,
        durationDays: rx.durationDays,
        ...(batchId ? { batchId, batchNumber } : {}),
      });
    if (e.status === 'SIGNED')
      for (const rx of e.prescriptions)
        event('PRESCRIBED', rx, rx.quantity, e.signed_at || e.created_at, e.practitioner_name);
    const holds = (
      await this.db.query(
        'SELECT r.*,b.batch_number,u.name actor_name FROM prescription_reservations r JOIN inventory_batches b ON b.id=r.batch_id JOIN encounters e ON e.id=r.encounter_id JOIN users u ON u.id=e.practitioner_id WHERE r.encounter_id=$1 AND r.tenant_id=$2 AND r.branch_id=$3',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows;
    const dispenses = (
      await this.db.query(
        'SELECT d.id,u.name actor_name FROM dispenses d JOIN users u ON u.id=d.actor_id WHERE d.encounter_id=$1 AND d.tenant_id=$2 AND d.branch_id=$3',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows;
    for (const h of holds) {
      const rx = e.prescriptions.find((r: any) => r.itemId === h.item_id);
      if (!rx) continue;
      event('RESERVED', rx, h.quantity, h.created_at, h.actor_name, h.batch_id, h.batch_number);
      if (h.status === 'RELEASED' && h.consumed_at)
        event(
          'RELEASED',
          rx,
          h.quantity,
          h.consumed_at,
          dispenses[0]?.actor_name || h.actor_name,
          h.batch_id,
          h.batch_number,
        );
    }
    const movements = (
      await this.db.query(
        'SELECT m.*,b.item_id,b.batch_number,u.name actor_name FROM stock_movements m JOIN dispenses d ON d.id=m.dispense_id JOIN inventory_batches b ON b.id=m.batch_id JOIN users u ON u.id=m.actor_id WHERE d.encounter_id=$1 AND m.tenant_id=$2 AND m.branch_id=$3 AND m.quantity_delta<0',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows;
    for (const m of movements) {
      const rx = e.prescriptions.find((r: any) => r.itemId === m.item_id);
      if (rx)
        event(
          'DISPENSED',
          rx,
          -m.quantity_delta,
          m.created_at,
          m.actor_name,
          m.batch_id,
          m.batch_number,
        );
    }
    const order = { PRESCRIBED: 0, RESERVED: 1, RELEASED: 2, DISPENSED: 3 };
    events.sort((a, b) => a.at.localeCompare(b.at) || order[a.type] - order[b.type]);
    await this.audit(this.db, ctx, 'READ_PRESCRIPTION_LOG', 'encounter', id, {
      count: events.length,
    });
    return { encounterId: id, patientId: e.patient_id, patientName: e.patient_name, events };
  }
  async document(ctx: Context, id: number, requireIntegrity = false) {
    const { rows } = await this.db.query(
      `SELECT * FROM clinical_documents WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`,
      [id, ctx.actor.tenantId, ctx.branchId],
    );
    if (!rows[0]) throw missing();
    if (requireIntegrity && !this.documentIntact(rows[0]))
      throw new DomainError(
        'DOCUMENT_INTEGRITY_FAILED',
        'Document integrity check failed; contact clinic administrator.',
        409,
      );
    await this.audit(this.db, ctx, 'READ_DOCUMENT', 'document', id);
    return rows[0];
  }
  async documentPreview(ctx: Context, id: number) {
    const d = await this.document(ctx, id, true);
    return buildDocumentView({
      id: d.id,
      kind: d.kind,
      documentNumber: d.document_number,
      payload: d.payload,
      createdAt: d.created_at,
      startDate: d.start_date,
      endDate: d.end_date,
      diagnosisRedacted: Boolean(d.diagnosis_redacted),
      revokedAt: d.revoked_at,
    });
  }
  private documentIntact(d: any) {
    const key = process.env.DOCUMENT_SIGNING_KEY || '';
    if (key.length < 32 || !d.payload || typeof d.payload !== 'object' || Array.isArray(d.payload))
      return false;
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
    return intact && metadataIntact;
  }
  async verifyDocument(token: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM clinical_documents WHERE verification_hash=$1`,
      [token],
    );
    const d = rows[0];
    if (!d) throw missing();
    return {
      valid: !d.revoked_at && this.documentIntact(d),
      documentNumber: d.document_number,
      kind: d.kind,
      clinicName: d.payload?.branchName,
      practitionerName: d.payload?.practitionerName,
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
