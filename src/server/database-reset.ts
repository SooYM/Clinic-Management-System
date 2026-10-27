import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { pool, transaction, lock, type Database } from './db.js';
import { roles, verifyPassword, hashPassword, type Context } from './security.js';
import { DomainError } from '../domain/models.js';
import { DATABASE_RESET_PHRASE, type DatabaseResetPreview } from '../shared/database-reset.js';
import { bootstrapConfiguration, createBootstrapDefaults } from './db/bootstrap-defaults.js';

/** Reviewed child-first order. Unknown tables stop reset instead of silently retaining data. */
export const RESET_TABLES = [
  'stock_movements',
  'prescription_reservations',
  'prescription_dose_logs',
  'clinical_photos',
  'clinical_documents',
  'package_redemptions',
  'commission_ledger',
  'payments',
  'patient_deposits',
  'notification_outbox',
  'audit_logs',
  'dispenses',
  'inventory_usages',
  'treatment_packages',
  'invoices',
  'encounters',
  'pending_registrations',
  'queue_tickets',
  'appointments',
  'inventory_batches',
  'inventory_items',
  'patients',
  'reference_catalogs',
  'commission_policies',
  'role_module_permissions',
  'sessions',
  'user_branches',
  'rooms',
  'users',
  'custom_roles',
  'branches',
  'tenants',
  'resource_locks',
] as const;
const resetInput = z
  .object({
    confirmationPhrase: z.literal(DATABASE_RESET_PHRASE),
    currentPassword: z.string().min(1).max(128),
    acknowledge: z.literal(true),
  })
  .strict();
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
async function assertSchema(db: Database) {
  const tables = (
    await db.query(
      "SELECT TABLE_NAME name,ENGINE engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE'",
    )
  ).rows;
  const expected = new Set<string>([...RESET_TABLES, 'schema_migrations']);
  if (
    tables.length !== expected.size ||
    tables.some((t) => !expected.has(t.name) || t.engine !== 'InnoDB')
  )
    throw new DomainError(
      'RESET_SCHEMA_MISMATCH',
      'Database schema differs from the reviewed reset table set. Apply current migrations and review additional tables first.',
      409,
    );
}
async function administrator(db: Database, ctx: Context) {
  const user = (
    await db.query(
      'SELECT id,tenant_id,branch_id,active,role,is_super_admin,password_hash FROM users WHERE id=$1 AND tenant_id=$2',
      [ctx.actor.id, ctx.actor.tenantId],
    )
  ).rows[0];
  if (!user || !user.active || user.role !== 'ADMIN' || !user.is_super_admin)
    throw new DomainError(
      'SUPER_ADMIN_REQUIRED',
      'Entire database reset requires explicit SuperAdmin capability.',
      403,
    );
  return user;
}
export class DatabaseResetService {
  constructor(
    private readonly db: Database = pool,
    private readonly transact: typeof transaction = transaction,
    private readonly createDefaults = createBootstrapDefaults,
  ) {}
  async preview(ctx: Context): Promise<DatabaseResetPreview> {
    await administrator(this.db, ctx);
    const { defaults } = bootstrapConfiguration();
    await assertSchema(this.db);
    const counts = [];
    for (const table of RESET_TABLES)
      counts.push({
        table,
        rowCount: Number(
          (await this.db.query(`SELECT COUNT(*) count FROM \`${table}\``)).rows[0].count,
        ),
      });
    return {
      scope: 'ENTIRE_DATABASE',
      confirmationPhrase: DATABASE_RESET_PHRASE,
      counts,
      defaults,
      preserves: ['schema_migrations', 'auto_increment_sequences'],
      requiresPassword: true,
    };
  }
  async reset(ctx: Context, body: unknown) {
    const input = resetInput.parse(body),
      live = await administrator(this.db, ctx);
    if (!(await verifyPassword(input.currentPassword, live.password_hash)))
      throw new DomainError('PASSWORD_INCORRECT', 'Current password is incorrect.', 403);
    const configuration = bootstrapConfiguration(),
      hash = await hashPassword(configuration.password);
    return this.transact(
      async (db) => {
        await lock(db, ['database-reset']);
        // SERIALIZABLE next-key locks include empty ranges/supremum, blocking new parents and user inserts during reset.
        await db.query('SELECT id FROM tenants ORDER BY id FOR UPDATE');
        await db.query('SELECT id FROM users ORDER BY id FOR UPDATE');
        const current = await administrator(db, ctx);
        if (current.password_hash !== live.password_hash)
          throw new DomainError(
            'PASSWORD_INCORRECT',
            'Password changed. Reauthenticate before resetting.',
            403,
          );
        await assertSchema(db);
        for (const table of RESET_TABLES) await db.query(`DELETE FROM \`${table}\``);
        const created = await this.createDefaults(db, configuration.defaults, hash);
        await db.query(
          "INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,'DATABASE_RESET','database',NULL,$4,$5)",
          [
            created.tenantId,
            created.branchId,
            created.id,
            ctx.requestId,
            JSON.stringify({
              formerInitiatorId: ctx.actor.id,
              formerTenantId: ctx.actor.tenantId,
              scope: 'ENTIRE_DATABASE',
            }),
          ],
        );
        return { requiresLogin: true, bootstrapEmail: configuration.defaults.administratorEmail };
      },
      { isolation: 'SERIALIZABLE' },
    );
  }
}
export function databaseResetRouter(service = new DatabaseResetService()) {
  const router = Router();
  router.get(
    '/admin/database-reset/preview',
    roles('ADMIN'),
    route(async (req, res) => res.json(await service.preview(req.context))),
  );
  router.post(
    '/admin/database-reset',
    roles('ADMIN'),
    rateLimit({
      windowMs: 15 * 60_000,
      limit: 10,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
    route(async (req, res) => {
      const result = await service.reset(req.context, req.body);
      res.setHeader(
        'Set-Cookie',
        `cms_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`,
      );
      res.json(result);
    }),
  );
  return router;
}
