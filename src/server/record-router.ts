import { idSchema } from '../shared/identifiers.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool, camel } from './db.js';
import { roles } from './security.js';
import { DomainError } from '../domain/models.js';

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
export function recordRouter() {
  const router = Router();
  router.get(
    '/patients/:id/encounters',
    route(async (req, res) => {
      const patientId = idSchema.parse(req.params.id);
      const cursor = z
        .object({
          before: z.string().datetime().optional(),
          beforeId: idSchema.optional(),
        })
        .refine(
          (v) => Boolean(v.before) === Boolean(v.beforeId),
          'Supply both history cursor fields.',
        )
        .parse(req.query);
      const patient = await pool.query(
        'SELECT id FROM patients WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
        [patientId, req.context.actor.tenantId, req.context.branchId],
      );
      if (!patient.rows[0])
        throw new DomainError('NOT_FOUND', 'Patient not found in this branch.', 404);
      const { rows } = await pool.query(
        `SELECT e.id,e.patient_id,e.practitioner_id,e.specialty,e.assessment,e.status,e.created_at,u.name practitioner_name FROM encounters e JOIN users u ON u.id=e.practitioner_id
      WHERE e.patient_id=$1 AND e.tenant_id=$2 AND e.branch_id=$3 ${cursor.before ? 'AND (e.created_at<$4 OR (e.created_at=$4 AND e.id<$5))' : ''} ORDER BY e.created_at DESC,e.id DESC LIMIT 51`,
        [
          patientId,
          req.context.actor.tenantId,
          req.context.branchId,
          ...(cursor.before ? [new Date(cursor.before), cursor.beforeId] : []),
        ],
      );
      const result = camel(rows.slice(0, 50));
      const last = result.at(-1);
      await pool.query(
        'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          req.context.actor.tenantId,
          req.context.branchId,
          req.context.actor.id,
          'READ_HISTORY',
          'patient',
          patientId,
          req.context.requestId,
          JSON.stringify({ count: result.length }),
        ],
      );
      res.json({
        data: result,
        nextCursor: rows.length > 50 && last ? { before: last.createdAt, beforeId: last.id } : null,
      });
    }),
  );
  return router;
}
