import type { Database } from '../db.js';
import { defaultPatientGroups } from '../../shared/catalogs.js';
/** Editable master data for newly created branches. */
export async function createPatientGroupDefaults(db: Database, tenantId: number, branchId: number) {
  for (const [sortOrder, label] of defaultPatientGroups.entries())
    await db.query(
      "INSERT INTO reference_catalogs(tenant_id,branch_id,kind,label,sort_order) VALUES($1,$2,'PATIENT_GROUP',$3,$4)",
      [tenantId, branchId, label, sortOrder],
    );
}
