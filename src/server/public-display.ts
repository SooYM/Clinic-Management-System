import { Router, type Request, type Response, type NextFunction } from 'express';
import { pool, camel } from './db.js';
import { idSchema } from '../shared/identifiers.js';
import { DomainError } from '../domain/models.js';

const route =
  (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);

/** Public waiting-room projection: clinic branding and anonymous queue numbers only. */
export function publicDisplayRouter() {
  const router = Router();
  router.get(
    '/branches',
    route(async (_req, res) => {
      const { rows } = await pool.query(
        'SELECT b.id,b.name,t.name clinic_name FROM branches b JOIN tenants t ON t.id=b.tenant_id WHERE b.active=1 ORDER BY b.id',
      );
      res.json({ data: camel(rows) });
    }),
  );
  router.get(
    '/queue',
    route(async (req, res) => {
      const branchId = idSchema.parse(req.query.branchId);
      const branch = (
        await pool.query(
          'SELECT b.id,b.name,t.name clinic_name,b.tenant_id FROM branches b JOIN tenants t ON t.id=b.tenant_id WHERE b.id=$1 AND b.active=1',
          [branchId],
        )
      ).rows[0];
      if (!branch) throw new DomainError('NOT_FOUND', 'Display branch not found.', 404);
      const { rows } = await pool.query(
        `SELECT q.ticket_number,q.status,r.name room_name FROM queue_tickets q
      LEFT JOIN rooms r ON r.id=q.room_id AND r.tenant_id=q.tenant_id AND r.branch_id=q.branch_id
      WHERE q.branch_id=$1 AND q.tenant_id=$2 AND q.service_date=DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))
      AND q.expired_at IS NULL AND q.created_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR)
      AND q.status IN ('REGISTERED','TRIAGE_WAITING','CALLED_TO_ROOM','IN_CONSULTATION')
      ORDER BY CASE WHEN q.priority='URGENT' THEN 0 ELSE 1 END,q.created_at,q.id LIMIT 200`,
        [branchId, branch.tenant_id],
      );
      res.json({
        branch: { id: branch.id, name: branch.name, clinicName: branch.clinic_name },
        data: camel(rows),
      });
    }),
  );
  return router;
}
