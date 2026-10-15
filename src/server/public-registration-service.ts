import { createHash, createHmac, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction, lock, camel, type Database } from './db.js';
import { type Context, hashToken } from './security.js';
import { DomainError } from '../domain/models.js';
import { publicRegistrationInput } from './public-registration-validation.js';
import { ClinicService } from './service.js';
import { allocateQueueNumber } from './queue-numbering.js';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const confirmationInput = z
  .object({
    version: z.number().int().positive(),
    identityVerified: z.literal(true),
    existingPatientId: z.number().int().positive().optional(),
  })
  .strict();
const rejectionInput = z
  .object({ version: z.number().int().positive(), reason: z.string().trim().max(500).optional() })
  .strict();
export async function expirePublicRegistrations(db: Database = pool) {
  await db.query(
    "UPDATE pending_registrations SET status='EXPIRED',payload=NULL,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE status='PENDING' AND expires_at<=UTC_TIMESTAMP(3)",
  );
}
function receipt(row: any) {
  return camel({
    reference: row.reference,
    ticket_number: row.ticket_number,
    status: row.status,
    expires_at: row.expires_at,
    branch_name: row.branch_name,
  });
}
function staff(ctx: Context) {
  if (!ctx.modules?.includes('patients') || !ctx.modules?.includes('queue'))
    throw new DomainError(
      'MODULE_FORBIDDEN',
      'Registration review requires patient and queue access.',
      403,
    );
}
export class PublicRegistrationService {
  constructor(
    private db: Database = pool,
    private transact: typeof transaction = transaction,
  ) {}
  async branch(branchId: number, db: Database = this.db, locked = false) {
    const row = (
      await db.query(
        'SELECT b.id,b.tenant_id,b.name,t.name clinic_name,b.public_registration_enabled enabled,b.public_registration_version version FROM branches b JOIN tenants t ON t.id=b.tenant_id WHERE b.id=$1 AND b.active=1' +
          (locked ? ' FOR SHARE' : ''),
        [branchId],
      )
    ).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Registration branch not found.', 404);
    return row;
  }
  async metadata(branchId: number) {
    const b = await this.branch(branchId);
    return {
      branch: { id: b.id, name: b.name, clinicName: b.clinic_name },
      enabled: Boolean(b.enabled),
    };
  }
  async submit(branchId: number, body: unknown) {
    const input = publicRegistrationInput.parse(body);
    const signingKey = process.env.DOCUMENT_SIGNING_KEY;
    if (!signingKey || signingKey.length < 32)
      throw new DomainError(
        'UNAVAILABLE',
        'Registration service configuration is unavailable.',
        503,
      );
    const token = createHmac('sha256', signingKey)
      .update(`public-registration:${branchId}:${input.submissionKey}`)
      .digest('hex');
    await expirePublicRegistrations(this.db);
    return this.transact(async (db) => {
      const branch = await this.branch(branchId, db, true);
      if (!branch.enabled)
        throw new DomainError(
          'NOT_FOUND',
          'Public registration is unavailable for this branch.',
          404,
        );
      await lock(db, [`registration-submit:${branchId}:${input.submissionKey}`]);
      const prior = (
        await db.query(
          'SELECT * FROM pending_registrations WHERE branch_id=$1 AND submission_key=$2 FOR UPDATE',
          [branchId, input.submissionKey],
        )
      ).rows[0];
      if (prior) {
        if (prior.request_hash !== hash(input) || prior.receipt_token_hash !== hashToken(token))
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'Submission key has already been used. Start a new submission.',
            409,
          );
        return { ...receipt({ ...prior, branch_name: branch.name }), receiptToken: token };
      }
      const allocation = await allocateQueueNumber(db, branchId);
      const count = (
        await db.query(
          "SELECT COUNT(*) n FROM pending_registrations WHERE branch_id=$1 AND status='PENDING'",
          [branchId],
        )
      ).rows[0].n;
      if (Number(count) >= 1000)
        throw new DomainError(
          'REGISTRATION_BUSY',
          'Registration is busy. Please speak to reception.',
          429,
        );

      const row = (
        await db.query(
          `INSERT INTO pending_registrations(tenant_id,branch_id,reference,submission_key,request_hash,receipt_token_hash,ticket_number,service_date,payload,expires_at)
        SELECT $1,$2,$3,$4,$5,$6,$7,$9,$8,
        LEAST(DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 12 HOUR),DATE_SUB(DATE_ADD($9,INTERVAL 1 DAY),INTERVAL 8 HOUR)) FROM DUAL WHERE $9=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) RETURNING *`,
          [
            branch.tenant_id,
            branchId,
            'REG-' + randomBytes(6).toString('hex').toUpperCase(),
            input.submissionKey,
            hash(input),
            hashToken(token),
            allocation.ticketNumber,
            JSON.stringify(input.patient),
            allocation.serviceDate,
          ],
        )
      ).rows[0];
      if (!row)
        throw new DomainError(
          'SERVICE_DAY_CHANGED',
          'Clinic day changed. Submit the registration again.',
          409,
        );
      return { ...receipt({ ...row, branch_name: branch.name }), receiptToken: token };
    });
  }
  async status(token: string) {
    z.string()
      .regex(/^[a-f0-9]{64}$/)
      .parse(token);
    await expirePublicRegistrations(this.db);
    const row = (
      await this.db.query(
        'SELECT r.reference,r.ticket_number,r.status,r.expires_at,b.name branch_name FROM pending_registrations r JOIN branches b ON b.id=r.branch_id WHERE r.receipt_token_hash=$1 AND b.active=1',
        [hashToken(token)],
      )
    ).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Registration receipt not found.', 404);
    return receipt(row);
  }
  async list(ctx: Context) {
    staff(ctx);
    await expirePublicRegistrations(this.db);
    const rows = (
      await this.db.query(
        "SELECT id,reference,ticket_number,payload,version,created_at,expires_at FROM pending_registrations WHERE tenant_id=$1 AND branch_id=$2 AND status='PENDING' ORDER BY id LIMIT 200",
        [ctx.actor.tenantId, ctx.branchId],
      )
    ).rows;
    const result = [];
    for (const row of rows) {
      const matches = (
        await this.db.query(
          'SELECT id,name,national_id,phone,branch_id FROM patients WHERE tenant_id=$1 AND national_id=$2',
          [ctx.actor.tenantId, row.payload.nationalId],
        )
      ).rows;
      const same = matches.find((match) => match.branch_id === ctx.branchId);
      const { payload, ...safe } = row;
      result.push({
        ...camel(safe),
        patient: payload,
        possibleMatch: same
          ? camel({
              id: same.id,
              name: same.name,
              national_id: same.national_id,
              phone: same.phone,
            })
          : null,
        identityConflict: matches.length > 0 && !same,
      });
    }
    return result;
  }
  private async pending(db: Database, ctx: Context, id: number) {
    const row = (
      await db.query(
        'SELECT * FROM pending_registrations WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
        [id, ctx.actor.tenantId, ctx.branchId],
      )
    ).rows[0];
    if (!row) throw new DomainError('NOT_FOUND', 'Registration not found in this branch.', 404);
    return row;
  }
  async confirm(ctx: Context, id: number, body: unknown) {
    staff(ctx);
    const input = confirmationInput.parse(body);
    await expirePublicRegistrations(this.db);
    return this.transact(async (db) => {
      await this.branch(ctx.branchId, db, true);
      const row = await this.pending(db, ctx, id);
      const decisionHash = hash({
        identityVerified: true,
        existingPatientId: input.existingPatientId ?? null,
      });
      if (row.status === 'ACCEPTED' && row.decision_hash === decisionHash)
        return {
          id,
          status: 'ACCEPTED',
          ticketNumber: row.ticket_number,
          patientId: row.patient_id,
          version: row.version,
        };
      if (
        row.status !== 'PENDING' ||
        row.version !== input.version ||
        new Date(row.expires_at.replace(' ', 'T') + 'Z').getTime() <= Date.now()
      )
        throw new DomainError(
          'VERSION_CONFLICT',
          'Registration changed or expired. Refresh before confirming.',
          409,
        );
      await lock(db, [
        `registration-identity:${ctx.actor.tenantId}:${hash(row.payload.nationalId)}`,
      ]);
      const match = (
        await db.query('SELECT id,branch_id FROM patients WHERE tenant_id=$1 AND national_id=$2', [
          ctx.actor.tenantId,
          row.payload.nationalId,
        ])
      ).rows[0];
      if (match && (match.branch_id !== ctx.branchId || match.id !== input.existingPatientId))
        throw new DomainError(
          'IDENTITY_REVIEW_REQUIRED',
          'Verify the existing patient record with reception before confirming.',
          409,
        );
      if (!match && input.existingPatientId)
        throw new DomainError(
          'IDENTITY_MISMATCH',
          'Selected patient does not match the submitted identity.',
          409,
        );
      const service = new ClinicService(db, (work) => work(db));
      const patient = match ? { id: match.id } : await service.savePatient(ctx, row.payload);
      const ticket = await service.checkIn(ctx, { patientId: patient.id, priority: 'NORMAL' }, id);
      await db.query(
        "UPDATE pending_registrations SET status='ACCEPTED',payload=NULL,patient_id=$2,queue_ticket_id=$3,reviewed_by=$4,decision_hash=$5,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=$1",
        [id, patient.id, ticket.id, ctx.actor.id, decisionHash],
      );
      await service.audit(db, ctx, 'CONFIRM_REGISTRATION', 'registration', id, {
        ticketNumber: row.ticket_number,
        patientId: patient.id,
      });
      return {
        id,
        status: 'ACCEPTED',
        ticketNumber: ticket.ticketNumber,
        patientId: patient.id,
        version: row.version + 1,
      };
    });
  }
  async reject(ctx: Context, id: number, body: unknown) {
    staff(ctx);
    const input = rejectionInput.parse(body);
    await expirePublicRegistrations(this.db);
    return this.transact(async (db) => {
      await this.branch(ctx.branchId, db, true);
      const row = await this.pending(db, ctx, id);
      if (row.status !== 'PENDING' || row.version !== input.version)
        throw new DomainError(
          'VERSION_CONFLICT',
          'Registration changed. Refresh before rejecting.',
          409,
        );
      await db.query(
        "UPDATE pending_registrations SET status='REJECTED',payload=NULL,reviewed_by=$2,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=$1",
        [id, ctx.actor.id],
      );
      await new ClinicService(db, (work) => work(db)).audit(
        db,
        ctx,
        'REJECT_REGISTRATION',
        'registration',
        id,
        { reason: input.reason || '' },
      );
      return { id, status: 'REJECTED', version: row.version + 1 };
    });
  }
}
