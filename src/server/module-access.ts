import type { Request, Response, NextFunction } from 'express';
import { pool, type Database } from './db.js';
import { DomainError } from '../domain/models.js';
import {
  defaultRoleModules,
  moduleIds,
  type ModuleId,
  type RoleId,
} from '../shared/module-permissions.js';
export async function effectiveModules(
  db: Database,
  tenantId: number,
  role: string,
): Promise<ModuleId[]> {
  if (role === 'ADMIN') return [...moduleIds];
  if (!(role in defaultRoleModules)) return [];
  const { rows } = await db.query(
    'SELECT modules FROM role_module_permissions WHERE tenant_id=$1 AND role=$2',
    [tenantId, role],
  );
  if (!rows[0]) return [...defaultRoleModules[role as RoleId]];
  const configured =
    typeof rows[0].modules === 'string' ? JSON.parse(rows[0].modules) : rows[0].modules;
  return Array.isArray(configured) ? moduleIds.filter((module) => configured.includes(module)) : [];
}
function routeModule(path: string): ModuleId | undefined {
  if (/^\/patients\/[^/]+\/deposit-balance$/.test(path)) return 'billing';
  if (/^\/patients\/[^/]+\/encounters$/.test(path)) return 'clinical';
  if (/^\/(queue|dashboard)(\/|$)/.test(path)) return 'queue';
  if (/^\/patients(\/|$)/.test(path)) return 'patients';
  if (/^\/appointments(\/|$)/.test(path)) return 'appointments';
  if (/^\/(encounters|documents|clinical)(\/|$)/.test(path)) return 'clinical';
  if (/^\/(inventory|dispensary|dispenses)(\/|$)/.test(path)) return 'inventory';
  if (/^\/(invoices|deposits)(\/|$)/.test(path)) return 'billing';
  if (/^\/(notifications|reports)(\/|$)/.test(path)) return 'reports';
  return undefined;
}
export async function authorizeModules(req: Request, _res: Response, next: NextFunction) {
  try {
    const modules = await effectiveModules(
      pool,
      req.context.actor.tenantId,
      req.context.actor.role,
    );
    req.context.modules = modules;
    if (req.path.startsWith('/admin/') && req.context.actor.role !== 'ADMIN')
      throw new DomainError('FORBIDDEN', 'Administration requires an administrator.', 403);
    if (
      /^\/(packages|commissions|photos)(\/|$)/.test(req.path) ||
      /^\/encounters\/[^/]+\/photos(\/|$)/.test(req.path) ||
      req.path.startsWith('/admin/commission-policy') ||
      /^\/reports\/commissions(?:\.|\/|$)/.test(req.path)
    )
      throw new DomainError(
        'FEATURE_RETIRED',
        'This feature has been removed from active clinic workflows.',
        410,
      );
    const module = routeModule(req.path);
    if (module && !modules.includes(module))
      throw new DomainError(
        'MODULE_FORBIDDEN',
        'Your role does not have access to this module.',
        403,
      );
    next();
  } catch (error) {
    next(error);
  }
}
