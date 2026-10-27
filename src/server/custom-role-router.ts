import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool, transaction, camel, type Database } from './db.js';
import { roles } from './security.js';
import { DomainError } from '../domain/models.js';
import { idSchema } from '../shared/identifiers.js';
import { customRoleInput } from '../shared/custom-roles.js';
import { moduleIds } from '../shared/module-permissions.js';

export async function validateCustomRole(
  db: Database,
  tenantId: number,
  role: string,
  id?: number | null,
) {
  if (id == null) return;
  if (role === 'ADMIN')
    throw new DomainError('INVALID_ROLE', 'Administrators retain all module access.', 422);
  const result = await db.query(
    'SELECT id FROM custom_roles WHERE tenant_id=$1 AND id=$2 FOR UPDATE',
    [tenantId, id],
  );
  if (!result.rows[0])
    throw new DomainError('INVALID_ROLE', 'Choose a custom role in your clinic.', 422);
}
export function customRoleRouter() {
  const router = Router();
  const route =
    (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve(fn(req, res)).catch(next);
  router.use('/admin/custom-roles', roles('ADMIN'));
  router.get(
    '/admin/custom-roles',
    route(async (req, res) => {
      const result = await pool.query(
        'SELECT id,name,modules,version FROM custom_roles WHERE tenant_id=$1 ORDER BY name',
        [req.context.actor.tenantId],
      );
      res.json({ data: camel(result.rows) });
    }),
  );
  for (const method of ['post', 'put'] as const)
    router[method](
      method === 'post' ? '/admin/custom-roles' : '/admin/custom-roles/:id',
      route(async (req, res) => {
        const input = (
          method === 'post'
            ? customRoleInput
            : customRoleInput.extend({ version: z.number().int().positive() })
        ).parse(req.body);
        const modules = moduleIds.filter((module) => input.modules.includes(module));
        const saved = await transaction(async (db) => {
          const tenantId = req.context.actor.tenantId;
          // Serialize clinic role writes so duplicate names produce a useful conflict.
          await db.query('SELECT id FROM tenants WHERE id=$1 FOR UPDATE', [tenantId]);
          let id = method === 'put' ? idSchema.parse(req.params.id) : 0;
          const duplicate = await db.query(
            'SELECT id FROM custom_roles WHERE tenant_id=$1 AND name=$2 AND id<>$3',
            [tenantId, input.name, id],
          );
          if (duplicate.rows[0])
            throw new DomainError('DUPLICATE_ROLE', 'A custom role already uses this name.', 409);
          let version = 1;
          if (method === 'post') {
            id = (
              await db.query('INSERT INTO custom_roles(tenant_id,name,modules) VALUES($1,$2,$3)', [
                tenantId,
                input.name,
                JSON.stringify(modules),
              ])
            ).insertId!;
          } else {
            const expected = (input as z.infer<typeof customRoleInput> & { version: number })
              .version;
            const updated = await db.query(
              'UPDATE custom_roles SET name=$3,modules=$4,version=version+1,updated_at=UTC_TIMESTAMP(3) WHERE tenant_id=$1 AND id=$2 AND version=$5',
              [tenantId, id, input.name, JSON.stringify(modules), expected],
            );
            if (!updated.rowCount)
              throw new DomainError(
                'VERSION_CONFLICT',
                'Custom role changed or was removed. Refresh before saving.',
                409,
              );
            version = expected + 1;
          }
          await db.query(
            'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
            [
              tenantId,
              req.context.branchId,
              req.context.actor.id,
              method === 'post' ? 'CUSTOM_ROLE_CREATED' : 'CUSTOM_ROLE_UPDATED',
              'custom_role',
              id,
              req.context.requestId,
              JSON.stringify({ name: input.name, modules }),
            ],
          );
          return { id, name: input.name, modules, version };
        });
        res.status(method === 'post' ? 201 : 200).json(saved);
      }),
    );
  return router;
}
