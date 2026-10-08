import { z } from 'zod';
import { pool, transaction, camel, type Database } from './db.js';
import type { Context } from './security.js';
import { DomainError } from '../domain/models.js';
import { catalogKinds, type CatalogKind } from '../shared/catalogs.js';
import { schemas, validateItemIngredient } from './validation.js';
const fields = {
  label: z.string().trim().min(1).max(200),
  active: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(1000000).default(0),
};
const labelLimit = (kind: CatalogKind) =>
  kind === 'INVENTORY_UNIT' ? 50 : kind === 'SPECIMEN_TYPE' ? 100 : 200;
export const catalogCreate = z
  .object({ kind: z.enum(catalogKinds), ...fields })
  .strict()
  .superRefine((value, ctx) => {
    if (value.label.length > labelLimit(value.kind))
      ctx.addIssue({
        code: 'custom',
        path: ['label'],
        message: `Use at most ${labelLimit(value.kind)} characters for this catalog kind.`,
      });
  });
export const catalogUpdate = z
  .object({
    ...fields,
    active: z.boolean(),
    sortOrder: z.number().int().min(0).max(1000000),
    version: z.number().int().positive(),
  })
  .strict();
export const inventoryUpdate = schemas.item
  .extend({ active: z.boolean(), version: z.number().int().positive() })
  .strict();

/** Empty catalogs preserve legacy free text; configured catalogs restrict new choices to active labels. */
export async function validateCatalogChoices(
  db: Database,
  ctx: Context,
  kind: CatalogKind,
  labels: string[],
) {
  const rows = (
    await db.query(
      'SELECT label,active FROM reference_catalogs WHERE tenant_id=$1 AND branch_id=$2 AND kind=$3 FOR SHARE',
      [ctx.actor.tenantId, ctx.branchId, kind],
    )
  ).rows;
  if (!rows.length) return;
  if (labels.some((label) => !rows.some((row) => row.active && row.label === label)))
    throw new DomainError(
      'INACTIVE_CATALOG_CHOICE',
      `Select an active ${kind.toLowerCase().replace(/_/g, ' ')} from this branch.`,
    );
}
export class CatalogService {
  constructor(
    private db: Database = pool,
    private transact: typeof transaction = transaction,
  ) {}
  private admin(ctx: Context) {
    if (ctx.actor.role !== 'ADMIN')
      throw new DomainError('FORBIDDEN', 'Catalog management requires an administrator.', 403);
  }
  private async audit(db: Database, ctx: Context, action: string, entity: string, id: number) {
    await db.query(
      'INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [ctx.actor.tenantId, ctx.branchId, ctx.actor.id, action, entity, id, ctx.requestId, '{}'],
    );
  }
  async list(ctx: Context, kind?: CatalogKind, activeOnly = false) {
    const rows = (
      await this.db.query(
        'SELECT id,kind,label,active,sort_order,version,created_at,updated_at FROM reference_catalogs WHERE tenant_id=$1 AND branch_id=$2 AND ($3 IS NULL OR kind=$3) AND ($4=0 OR active=1) ORDER BY kind,sort_order,label,id',
        [ctx.actor.tenantId, ctx.branchId, kind || null, activeOnly ? 1 : 0],
      )
    ).rows;
    return camel(rows.map((row) => ({ ...row, active: Boolean(row.active) })));
  }
  async create(ctx: Context, input: unknown) {
    this.admin(ctx);
    const v = catalogCreate.parse(input);
    return this.transact(async (db) => {
      const row = (
        await db.query(
          'INSERT INTO reference_catalogs(tenant_id,branch_id,kind,label,active,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
          [ctx.actor.tenantId, ctx.branchId, v.kind, v.label, v.active, v.sortOrder],
        )
      ).rows[0];
      await this.audit(db, ctx, 'CREATE_CATALOG', 'reference_catalog', row.id);
      const { tenant_id, branch_id, ...entry } = row;
      return camel({ ...entry, active: Boolean(row.active) });
    });
  }
  async update(ctx: Context, id: number, input: unknown) {
    this.admin(ctx);
    const v = catalogUpdate.parse(input);
    return this.transact(async (db) => {
      const old = (
        await db.query(
          'SELECT * FROM reference_catalogs WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
          [id, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!old) throw new DomainError('NOT_FOUND', 'Catalog choice not found in this branch.', 404);
      if (v.label.length > labelLimit(old.kind))
        throw new DomainError(
          'INVALID_CATALOG_LABEL',
          `Use at most ${labelLimit(old.kind)} characters for this catalog kind.`,
        );
      if (old.version !== v.version)
        throw new DomainError(
          'VERSION_CONFLICT',
          'Catalog choice changed. Reload before saving.',
          409,
        );
      await db.query(
        'UPDATE reference_catalogs SET label=$2,active=$3,sort_order=$4,version=version+1,updated_at=now() WHERE id=$1',
        [id, v.label, v.active, v.sortOrder],
      );
      const row = (
        await db.query(
          'SELECT id,kind,label,active,sort_order,version,created_at,updated_at FROM reference_catalogs WHERE id=$1',
          [id],
        )
      ).rows[0];
      await this.audit(
        db,
        ctx,
        v.active ? 'UPDATE_CATALOG' : 'ARCHIVE_CATALOG',
        'reference_catalog',
        id,
      );
      return camel({ ...row, active: Boolean(row.active) });
    });
  }
  async updateInventory(ctx: Context, id: number, input: unknown) {
    this.admin(ctx);
    const v = inventoryUpdate.parse(input);
    return this.transact(async (db) => {
      const old = (
        await db.query(
          'SELECT * FROM inventory_items WHERE id=$1 AND tenant_id=$2 AND branch_id=$3 FOR UPDATE',
          [id, ctx.actor.tenantId, ctx.branchId],
        )
      ).rows[0];
      if (!old) throw new DomainError('NOT_FOUND', 'Inventory item not found in this branch.', 404);
      // Preserve incomplete legacy medicine metadata when archiving/restoring its history.
      if (!(
        old.category === 'MEDICATION' &&
        !old.ingredient.trim() &&
        v.category === old.category &&
        v.ingredient === old.ingredient
      ))
        validateItemIngredient(v);
      if (old.version !== v.version)
        throw new DomainError(
          'VERSION_CONFLICT',
          'Inventory item changed. Reload before saving.',
          409,
        );
      if (old.category !== v.category || old.unit !== v.unit || old.ingredient !== v.ingredient) {
        const used = (
          await db.query(
            "SELECT EXISTS(SELECT 1 FROM inventory_batches WHERE item_id=$1) OR EXISTS(SELECT 1 FROM encounters WHERE tenant_id=$2 AND branch_id=$3 AND JSON_CONTAINS(prescriptions,JSON_OBJECT('itemId',$1))) used",
            [id, ctx.actor.tenantId, ctx.branchId],
          )
        ).rows[0];
        if (used.used)
          throw new DomainError(
            'ITEM_HISTORY_IMMUTABLE',
            'Category, unit and ingredient cannot change after stock or prescription history exists.',
            409,
          );
      }
      if (v.unit !== old.unit) await validateCatalogChoices(db, ctx, 'INVENTORY_UNIT', [v.unit]);
      await db.query(
        'UPDATE inventory_items SET name=$2,sku=$3,ingredient=$4,category=$5,unit=$6,price_cents=$7,reorder_level=$8,active=$9,version=version+1,updated_at=now() WHERE id=$1',
        [
          id,
          v.name,
          v.sku,
          v.ingredient,
          v.category,
          v.unit,
          v.priceCents,
          v.reorderLevel,
          v.active,
        ],
      );
      const row = (await db.query('SELECT * FROM inventory_items WHERE id=$1', [id])).rows[0];
      await this.audit(
        db,
        ctx,
        v.active ? 'UPDATE_INVENTORY_CATALOG' : 'ARCHIVE_INVENTORY_CATALOG',
        'inventory',
        id,
      );
      return camel({ ...row, active: Boolean(row.active) });
    });
  }
}
