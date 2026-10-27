import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction, camel, type Database } from './db.js';
import { roles, type Context } from './security.js';
import { DomainError } from '../domain/models.js';
import { idSchema } from '../shared/identifiers.js';
import {
  expenseInput,
  expenseCreateInput,
  parseAnalyticsRange,
} from '../shared/admin-analytics.js';
import { readAdminAnalytics } from './admin-analytics.js';

const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res)).catch(next);
const columns = 'id,paid_on,category,description,amount_cents,reference,version,voided_at';
async function audit(db: Database, ctx: Context, action: string, id: number, metadata: unknown) {
  await db.query(
    'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      ctx.actor.tenantId,
      ctx.branchId,
      ctx.actor.id,
      action,
      'expense',
      id,
      ctx.requestId,
      JSON.stringify(metadata),
    ],
  );
}
export function adminAnalyticsRouter() {
  const router = Router();
  router.use('/admin/analytics', roles('ADMIN'));
  router.use('/admin/expenses', roles('ADMIN'));
  router.get(
    '/admin/analytics',
    route(async (req, res) => {
      const range = parseAnalyticsRange(req.query);
      res.json(await transaction((db) => readAdminAnalytics(db, req.context, range)));
    }),
  );
  router.get(
    '/admin/expenses',
    route(async (req, res) => {
      const { beforeId, ...query } = z
        .object({
          from: z.string().optional(),
          to: z.string().optional(),
          beforeId: idSchema.optional(),
        })
        .strict()
        .parse(req.query);
      const range = parseAnalyticsRange(query);
      const { rows } = await pool.query(
        `SELECT ${columns} FROM expenses WHERE tenant_id=$1 AND branch_id=$2 AND voided_at IS NULL AND paid_on >= $3 AND paid_on <= $4 ${beforeId ? 'AND id<$5' : ''} ORDER BY id DESC LIMIT 200`,
        [
          req.context.actor.tenantId,
          req.context.branchId,
          range.from,
          range.to,
          ...(beforeId ? [beforeId] : []),
        ],
      );
      res.json({ data: camel(rows) });
    }),
  );
  router.post(
    '/admin/expenses',
    route(async (req, res) => {
      const { idempotencyKey, ...input } = expenseCreateInput.parse(req.body);
      const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const saved = await transaction(async (db) => {
        const ctx = req.context;
        // Branch lock serializes retries and prevents duplicate financial entries.
        await db.query('SELECT id FROM branches WHERE tenant_id=$1 AND id=$2 FOR UPDATE', [
          ctx.actor.tenantId,
          ctx.branchId,
        ]);
        const previous = (
          await db.query(
            `SELECT ${columns},request_hash FROM expenses WHERE tenant_id=$1 AND branch_id=$2 AND idempotency_key=$3`,
            [ctx.actor.tenantId, ctx.branchId, idempotencyKey],
          )
        ).rows[0];
        if (previous) {
          if (previous.request_hash !== hash)
            throw new DomainError(
              'IDEMPOTENCY_CONFLICT',
              'This expense key already records different details.',
              409,
            );
          const { request_hash, ...row } = previous;
          return camel(row);
        }
        const inserted = await db.query(
          'INSERT INTO expenses(tenant_id,branch_id,actor_id,paid_on,category,description,amount_cents,reference,idempotency_key,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            ctx.actor.tenantId,
            ctx.branchId,
            ctx.actor.id,
            input.paidOn,
            input.category,
            input.description,
            input.amountCents,
            input.reference,
            idempotencyKey,
            hash,
          ],
        );
        const id = inserted.insertId!;
        await audit(db, ctx, 'EXPENSE_CREATED', id, { after: input });
        return camel(
          (
            await db.query(
              `SELECT ${columns} FROM expenses WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`,
              [id, ctx.actor.tenantId, ctx.branchId],
            )
          ).rows[0],
        );
      });
      res.status(201).json(saved);
    }),
  );
  router.put(
    '/admin/expenses/:id',
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id),
        input = expenseInput.extend({ version: z.number().int().positive() }).parse(req.body);
      const saved = await transaction(async (db) => {
        const ctx = req.context;
        const previous = (
          await db.query(
            `SELECT ${columns} FROM expenses WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
            [id, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (!previous || previous.voided_at || previous.version !== input.version)
          throw new DomainError(
            'VERSION_CONFLICT',
            'Expense changed or was voided. Refresh before saving.',
            409,
          );
        const updated = await db.query(
          'UPDATE expenses SET paid_on=$4,category=$5,description=$6,amount_cents=$7,reference=$8,actor_id=$9,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND version=$10 AND voided_at IS NULL',
          [
            id,
            ctx.actor.tenantId,
            ctx.branchId,
            input.paidOn,
            input.category,
            input.description,
            input.amountCents,
            input.reference,
            ctx.actor.id,
            input.version,
          ],
        );
        if (!updated.rowCount)
          throw new DomainError(
            'VERSION_CONFLICT',
            'Expense changed or was voided. Refresh before saving.',
            409,
          );
        const saved = camel(
          (
            await db.query(
              `SELECT ${columns} FROM expenses WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`,
              [id, ctx.actor.tenantId, ctx.branchId],
            )
          ).rows[0],
        );
        await audit(db, ctx, 'EXPENSE_UPDATED', id, { before: camel(previous), after: saved });
        return saved;
      });
      res.json(saved);
    }),
  );
  router.delete(
    '/admin/expenses/:id',
    route(async (req, res) => {
      const id = idSchema.parse(req.params.id),
        { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
      await transaction(async (db) => {
        const ctx = req.context;
        const previous = (
          await db.query(
            `SELECT ${columns} FROM expenses WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE`,
            [id, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (!previous || previous.voided_at || previous.version !== version)
          throw new DomainError(
            'VERSION_CONFLICT',
            'Expense changed or was already voided. Refresh before voiding.',
            409,
          );
        const updated = await db.query(
          'UPDATE expenses SET voided_at=UTC_TIMESTAMP(3),version=version+1,updated_at=UTC_TIMESTAMP(3),actor_id=$4 WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 AND version=$5 AND voided_at IS NULL',
          [id, ctx.actor.tenantId, ctx.branchId, ctx.actor.id, version],
        );
        if (!updated.rowCount)
          throw new DomainError(
            'VERSION_CONFLICT',
            'Expense changed or was already voided. Refresh before voiding.',
            409,
          );
        const saved = (
          await db.query(
            `SELECT ${columns} FROM expenses WHERE id=$1 AND tenant_id=$2 AND branch_id=$3`,
            [id, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        await audit(db, ctx, 'EXPENSE_VOIDED', id, {
          before: camel(previous),
          after: camel(saved),
        });
      });
      res.json({ id, voided: true });
    }),
  );
  return router;
}
