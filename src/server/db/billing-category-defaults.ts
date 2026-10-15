import type { Database } from '../db.js';
import { defaultBillingCategories } from '../../shared/catalogs.js';
/** Initialize real editable master data only when creating a new branch. */
export async function createBillingCategoryDefaults(
  db: Database,
  tenantId: number,
  branchId: number,
) {
  for (const [sortOrder, label] of defaultBillingCategories.entries())
    await db.query(
      "INSERT INTO reference_catalogs(tenant_id,branch_id,kind,label,sort_order,billing_default) VALUES($1,$2,'BILLING_CATEGORY',$3,$4,$3)",
      [tenantId, branchId, label, sortOrder],
    );
}
