import { idSchema } from '../shared/identifiers.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction, camel, type Database } from './db.js';
import { roles } from './security.js';
import { DomainError } from '../domain/models.js';

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const inputSchema = z
  .object({
    stage: z.enum(['BEFORE', 'AFTER']),
    caption: z.string().trim().max(500).default(''),
    consent: z.literal(true),
    mimeType: z.enum(['image/jpeg', 'image/png']),
    dataBase64: z
      .string()
      .regex(/^[A-Za-z0-9+/]+={0,2}$/)
      .max(204800),
  })
  .strict();
function encryptionKey() {
  const key = Buffer.from(process.env.PHOTO_ENCRYPTION_KEY || '', 'hex');
  if (key.length !== 32)
    throw new DomainError(
      'PHOTO_STORAGE_UNCONFIGURED',
      'Configure a 64-character hexadecimal photo encryption key.',
      503,
    );
  return key;
}
async function encounter(db: Database, req: Request, id: number) {
  const { rows } = await db.query(
    'SELECT id,patient_id,practitioner_id FROM encounters WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
    [id, req.context.actor.tenantId, req.context.branchId],
  );
  if (!rows[0]) throw new DomainError('NOT_FOUND', 'Consultation not found.', 404);
  return rows[0];
}
async function audit(db: Database, req: Request, action: string, id: number) {
  await db.query(
    'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      req.context.actor.tenantId,
      req.context.branchId,
      req.context.actor.id,
      action,
      'clinical_photo',
      id,
      req.context.requestId,
      '{}',
    ],
  );
}
export function photoRouter() {
  const router = Router();
  router.get(
    '/encounters/:id/photos',
    roles('ADMIN', 'DOCTOR', 'NURSE', 'THERAPIST'),
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      await encounter(pool, req, id);
      const { rows } = await pool.query(
        'SELECT id,stage,caption,created_at FROM clinical_photos WHERE encounter_id=$1 AND tenant_id=$2 AND branch_id=$3 ORDER BY created_at',
        [id, req.context.actor.tenantId, req.context.branchId],
      );
      res.json({ data: camel(rows) });
    }),
  );
  router.post(
    '/encounters/:id/photos',
    roles('ADMIN', 'DOCTOR', 'THERAPIST'),
    route(async (req, res) => {
      const encounterId = idSchema.parse(req.params.id),
        input = inputSchema.parse(req.body);
      const plain = Buffer.from(input.dataBase64, 'base64');
      const png = plain.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg =
        plain[0] === 255 &&
        plain[1] === 216 &&
        plain[2] === 255 &&
        plain.at(-2) === 255 &&
        plain.at(-1) === 217;
      if (!plain.length || plain.length > 153600 || (input.mimeType === 'image/png' ? !png : !jpeg))
        throw new DomainError(
          'INVALID_PHOTO',
          'Upload a valid PNG or JPEG no larger than 150 KiB.',
          422,
        );
      const id = await transaction(async (db) => {
        const e = await encounter(db, req, encounterId);
        if (req.context.actor.role !== 'ADMIN' && e.practitioner_id !== req.context.actor.id)
          throw new DomainError(
            'FORBIDDEN',
            'Only the attending practitioner may add clinical photographs.',
            403,
          );
        // Allocate the database key inside the transaction before binding authenticated encryption to it.
        const inserted = await db.query(
          'INSERT INTO clinical_photos(tenant_id,branch_id,encounter_id,patient_id,actor_id,stage,caption,mime_type,encrypted_data,iv,auth_tag,consent_recorded) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true)',
          [
            req.context.actor.tenantId,
            req.context.branchId,
            encounterId,
            e.patient_id,
            req.context.actor.id,
            input.stage,
            input.caption,
            input.mimeType,
            Buffer.alloc(0),
            Buffer.alloc(12),
            Buffer.alloc(16),
          ],
        );
        const id = inserted.insertId!;
        const iv = randomBytes(12),
          cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
        cipher.setAAD(
          Buffer.from(
            req.context.actor.tenantId + ':' + req.context.branchId + ':' + encounterId + ':' + id,
          ),
        );
        const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
        await db.query(
          'UPDATE clinical_photos SET encrypted_data=$2,iv=$3,auth_tag=$4 WHERE id=$1',
          [id, encrypted, iv, cipher.getAuthTag()],
        );
        await audit(db, req, 'PHOTO_ADDED', id);
        return id;
      });
      res.status(201).json({ id, stage: input.stage, caption: input.caption });
    }),
  );
  router.get(
    '/photos/:id/image',
    roles('ADMIN', 'DOCTOR', 'NURSE', 'THERAPIST'),
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const { rows } = await pool.query(
        'SELECT * FROM clinical_photos WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
        [id, req.context.actor.tenantId, req.context.branchId],
      );
      const photo = rows[0];
      if (!photo) throw new DomainError('NOT_FOUND', 'Clinical photograph not found.', 404);
      const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), photo.iv);
      decipher.setAAD(
        Buffer.from(`${photo.tenant_id}:${photo.branch_id}:${photo.encounter_id}:${photo.id}`),
      );
      decipher.setAuthTag(photo.auth_tag);
      const data = Buffer.concat([decipher.update(photo.encrypted_data), decipher.final()]);
      await audit(pool, req, 'PHOTO_VIEWED', id);
      res.setHeader('Content-Type', photo.mime_type);
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(data);
    }),
  );
  return router;
}
