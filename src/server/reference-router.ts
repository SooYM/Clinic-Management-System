import { idSchema } from '../shared/identifiers.js';
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { pool, camel } from './db.js';
import { DomainError } from '../domain/models.js';
import type { ModuleId } from '../shared/module-permissions.js';
import { lookupPostcode } from './data/postcodes.js';
const route =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
function anyModule(req: Request, modules: ModuleId[]) {
  if (!modules.some((module) => req.context.modules?.includes(module)))
    throw new DomainError(
      'MODULE_FORBIDDEN',
      'Your role does not have access to these references.',
      403,
    );
}
async function audit(
  req: Request,
  action: string,
  entity: string,
  id: number | null,
  count?: number,
) {
  await pool.query(
    'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
    [
      req.context.actor.tenantId,
      req.context.branchId,
      req.context.actor.id,
      action,
      entity,
      id,
      req.context.requestId,
      JSON.stringify(count === undefined ? {} : { count }),
    ],
  );
}
export function referenceRouter() {
  const router = Router();
  router.get(
    '/references/postcodes/:postcode',
    route(async (req, res) => {
      anyModule(req, ['patients']);
      const postcode = z
        .string()
        .regex(/^\d{5}$/, 'Postcode must contain five digits.')
        .parse(req.params.postcode);
      res.json({ data: lookupPostcode(postcode) });
    }),
  );
  router.get(
    '/references/patients',
    route(async (req, res) => {
      anyModule(req, ['queue', 'patients', 'appointments', 'clinical', 'billing']);
      const search = z
        .string()
        .max(200)
        .parse(req.query.search || '');
      const { rows } = await pool.query(
        'SELECT id,id patient_number,name,national_id,phone FROM patients WHERE tenant_id=$1 AND branch_id=$2 AND (name LIKE $3 OR national_id LIKE $3 OR phone LIKE $3) ORDER BY name LIMIT 200',
        [req.context.actor.tenantId, req.context.branchId, `%${search}%`],
      );
      await audit(req, 'READ_REFERENCES', 'patient', null, rows.length);
      res.json({ data: camel(rows) });
    }),
  );
  router.get(
    '/references/medications',
    route(async (req, res) => {
      anyModule(req, ['clinical', 'inventory']);
      const search = z.string().max(200).default('').parse(req.query.search);
      const includeInactive = z.enum(['1']).optional().parse(req.query.includeInactive);
      const { rows } = await pool.query(
        "SELECT id,name,ingredient,unit,category,price_cents,active,version FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND category='MEDICATION' AND ($4=1 OR active=1) AND (name LIKE $3 OR sku LIKE $3 OR ingredient LIKE $3) ORDER BY name LIMIT 200",
        [req.context.actor.tenantId, req.context.branchId, `%${search}%`, includeInactive ? 1 : 0],
      );
      res.json({ data: camel(rows.map((row) => ({ ...row, active: Boolean(row.active) }))) });
    }),
  );
  router.get(
    '/clinical/patients/:id',
    route(async (req, res) => {
      anyModule(req, ['clinical']);
      const id = idSchema.parse(req.params.id);
      const { rows } = await pool.query(
        'SELECT id,id patient_number,name,first_name,last_name,national_id,date_of_birth,sex,blood_group,allergies,conditions FROM patients WHERE id=$1 AND tenant_id=$2 AND branch_id=$3',
        [id, req.context.actor.tenantId, req.context.branchId],
      );
      if (!rows[0]) throw new DomainError('NOT_FOUND', 'Patient not found in this branch.', 404);
      await audit(req, 'READ_CLINICAL_BANNER', 'patient', id);
      res.json(camel(rows[0]));
    }),
  );
  router.get(
    '/dispensary/encounters',
    route(async (req, res) => {
      anyModule(req, ['inventory']);
      const search = z.string().max(200).default('').parse(req.query.search);
      const { rows } = await pool.query(
        `SELECT e.id,e.patient_id,p.id patient_number,p.name patient_name,p.national_id,p.allergies,e.practitioner_id,u.name practitioner_name,e.created_at,e.prescriptions
   FROM encounters e JOIN patients p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id AND p.branch_id=e.branch_id JOIN users u ON u.id=e.practitioner_id AND u.tenant_id=e.tenant_id
   WHERE e.tenant_id=$1 AND e.branch_id=$2 AND e.status='SIGNED' AND JSON_LENGTH(e.prescriptions)>0 AND NOT EXISTS(SELECT 1 FROM dispenses d WHERE d.encounter_id=e.id)
   AND (p.name LIKE $3 OR p.national_id LIKE $3 OR CAST(p.id AS CHAR) LIKE $3 OR CAST(e.id AS CHAR) LIKE $3 OR u.name LIKE $3 OR EXISTS (
     SELECT 1 FROM JSON_TABLE(e.prescriptions, '$[*]' COLUMNS(item_id BIGINT PATH '$.itemId')) rx JOIN inventory_items i ON i.id=rx.item_id AND i.tenant_id=e.tenant_id AND i.branch_id=e.branch_id WHERE i.name LIKE $3
   )) ORDER BY e.created_at LIMIT 200`,
        [req.context.actor.tenantId, req.context.branchId, `%${search}%`],
      );
      const itemIds = [
        ...new Set(rows.flatMap((row) => row.prescriptions.map((rx: any) => rx.itemId))),
      ];
      const items = itemIds.length
        ? (
            await pool.query(
              'SELECT id,name FROM inventory_items WHERE tenant_id=$1 AND branch_id=$2 AND id IN ($3)',
              [req.context.actor.tenantId, req.context.branchId, itemIds],
            )
          ).rows
        : [];
      const names = new Map(items.map((item) => [item.id, item.name]));
      for (const row of rows)
        row.prescriptions = row.prescriptions.map((rx: any) => ({
          ...rx,
          itemName: rx.itemName || names.get(rx.itemId) || 'Medication',
          frequencyPerDay: rx.frequencyPerDay || 1,
          mealTiming: rx.mealTiming || 'ANY_TIME',
        }));
      await audit(req, 'READ_DISPENSARY', 'encounter', null, rows.length);
      res.json({ data: camel(rows) });
    }),
  );
  router.get(
    '/dispensary/history',
    route(async (req, res) => {
      anyModule(req, ['inventory', 'clinical']);
      const search = z.string().max(200).default('').parse(req.query.search);
      const { rows } = await pool.query(
        `SELECT e.id,e.patient_id,p.name patient_name,u.name practitioner_name,e.created_at,e.status,
      EXISTS(SELECT 1 FROM dispenses d WHERE d.encounter_id=e.id) dispensed
      FROM encounters e JOIN patients p ON p.id=e.patient_id AND p.tenant_id=e.tenant_id AND p.branch_id=e.branch_id
      JOIN users u ON u.id=e.practitioner_id AND u.tenant_id=e.tenant_id
      WHERE e.tenant_id=$1 AND e.branch_id=$2 AND e.status='SIGNED' AND JSON_LENGTH(e.prescriptions)>0
      AND (p.name LIKE $3 OR p.national_id LIKE $3 OR CAST(p.id AS CHAR) LIKE $3 OR CAST(e.id AS CHAR) LIKE $3 OR u.name LIKE $3 OR EXISTS (
        SELECT 1 FROM JSON_TABLE(e.prescriptions,'$[*]' COLUMNS(item_id BIGINT PATH '$.itemId')) rx JOIN inventory_items i ON i.id=rx.item_id AND i.tenant_id=e.tenant_id AND i.branch_id=e.branch_id WHERE i.name LIKE $3))
      ORDER BY e.created_at DESC LIMIT 200`,
        [req.context.actor.tenantId, req.context.branchId, `%${search}%`],
      );
      await audit(req, 'READ_PRESCRIPTION_HISTORY', 'encounter', null, rows.length);
      res.json({ data: camel(rows.map((row) => ({ ...row, dispensed: Boolean(row.dispensed) }))) });
    }),
  );
  return router;
}
