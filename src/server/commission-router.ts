import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool, transaction, camel } from './db.js';
import { roles } from './security.js';

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
const bps = z.number().int().min(0).max(10000);
const policySchema = z
  .object({
    serviceBaseBps: bps,
    serviceThresholdCents: z.number().int().min(0).max(2_000_000_000),
    serviceHighBps: bps,
    productBps: bps,
  })
  .strict();
const defaults = {
  serviceBaseBps: 1000,
  serviceThresholdCents: 50000,
  serviceHighBps: 1500,
  productBps: 500,
};

export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function commissionRouter() {
  const router = Router();
  router.use('/admin/commission-policy', roles('ADMIN'));
  router.get(
    '/admin/commission-policy',
    route(async (req, res) => {
      const { rows } = await pool.query(
        'SELECT service_base_bps,service_threshold_cents,service_high_bps,product_bps,updated_at FROM commission_policies WHERE tenant_id=$1 AND branch_id=$2',
        [req.context.actor.tenantId, req.context.branchId],
      );
      res.json(rows[0] ? camel(rows[0]) : defaults);
    }),
  );
  router.put(
    '/admin/commission-policy',
    route(async (req, res) => {
      const input = policySchema.parse(req.body);
      await transaction(async (db) => {
        await db.query(
          `INSERT INTO commission_policies(tenant_id,branch_id,service_base_bps,service_threshold_cents,service_high_bps,product_bps) VALUES($1,$2,$3,$4,$5,$6)
        ON DUPLICATE KEY UPDATE service_base_bps=VALUES(service_base_bps),service_threshold_cents=VALUES(service_threshold_cents),service_high_bps=VALUES(service_high_bps),product_bps=VALUES(product_bps),updated_at=UTC_TIMESTAMP(3)`,
          [
            req.context.actor.tenantId,
            req.context.branchId,
            input.serviceBaseBps,
            input.serviceThresholdCents,
            input.serviceHighBps,
            input.productBps,
          ],
        );
        await db.query(
          'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            req.context.actor.tenantId,
            req.context.branchId,
            req.context.actor.id,
            'COMMISSION_POLICY_CHANGED',
            'branch',
            req.context.branchId,
            req.context.requestId,
            JSON.stringify(input),
          ],
        );
      });
      res.json(input);
    }),
  );
  router.get(
    '/commissions/export',
    roles('ADMIN'),
    route(async (req, res) => {
      const date = z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .refine((v) => {
          const parsed = new Date(`${v}T00:00:00Z`);
          return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === v;
        });
      const input = z
        .object({ from: date, to: date })
        .refine((v) => v.to >= v.from, 'End date must follow start date.')
        .parse(req.query);
      // Filter clinical business days in Malaysia; SQL storage remains UTC.
      const { rows } = await pool.query(
        `SELECT u.name,u.email,c.practitioner_id,c.category,SUM(c.base_cents) base_cents,SUM(c.amount_cents) commission_cents FROM commission_ledger c JOIN users u ON u.id=c.practitioner_id
      WHERE c.tenant_id=$1 AND c.branch_id=$2 AND c.created_at>=DATE_SUB(CAST($3 AS DATETIME),INTERVAL 8 HOUR) AND c.created_at<DATE_SUB(DATE_ADD(CAST($4 AS DATETIME),INTERVAL 1 DAY),INTERVAL 8 HOUR)
      GROUP BY u.name,u.email,c.practitioner_id,c.category ORDER BY u.name,c.category`,
        [req.context.actor.tenantId, req.context.branchId, input.from, input.to],
      );
      await pool.query(
        'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [
          req.context.actor.tenantId,
          req.context.branchId,
          req.context.actor.id,
          'PAYROLL_EXPORTED',
          'branch',
          req.context.branchId,
          req.context.requestId,
          JSON.stringify(input),
        ],
      );
      const header = [
        'Practitioner ID',
        'Practitioner',
        'Email',
        'Category',
        'Revenue cents (MYR)',
        'Commission cents (MYR)',
      ];
      const records = rows.map((row) =>
        [
          row.practitioner_id,
          row.name,
          row.email,
          row.category,
          row.base_cents,
          row.commission_cents,
        ]
          .map(csvCell)
          .join(','),
      );
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="clinic-commissions.csv"');
      res.send('\uFEFF' + [header.map(csvCell).join(','), ...records].join('\r\n'));
    }),
  );
  return router;
}
