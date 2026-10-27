import type { Database } from './db.js';
import type { Context } from './security.js';
import { DomainError } from '../domain/models.js';
import { analyticsUtcBounds, type AdminAnalytics } from '../shared/admin-analytics.js';

function exact(value: unknown) {
  const number = Number(value || 0);
  if (!Number.isSafeInteger(number))
    throw new DomainError('REPORT_LIMIT', 'Report amount exceeds the supported exact range.', 422);
  return number;
}
export async function readAdminAnalytics(
  db: Database,
  ctx: Context,
  range: { from: string; to: string },
): Promise<AdminAnalytics> {
  if (ctx.actor.role !== 'ADMIN')
    throw new DomainError('FORBIDDEN', 'Administration requires an administrator.', 403);
  const { start, end } = analyticsUtcBounds(range);
  const scope = [ctx.actor.tenantId, ctx.branchId];
  const collected = (
    await db.query(
      `SELECT COALESCE(SUM(p.amount_cents),0) collected FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.tenant_id=p.tenant_id AND i.branch_id=p.branch_id WHERE p.tenant_id=$1 AND p.branch_id=$2 AND i.status='PAID' AND p.method IN ('CASH','CARD','QR') AND p.created_at >= $3 AND p.created_at < $4`,
      [...scope, start, end],
    )
  ).rows[0];
  const invoice = (
    await db.query(
      "SELECT COUNT(*) count FROM invoices WHERE tenant_id=$1 AND branch_id=$2 AND status='PAID' AND created_at >= $3 AND created_at < $4",
      [...scope, start, end],
    )
  ).rows[0];
  const expense = (
    await db.query(
      "SELECT COALESCE(SUM(amount_cents),0) total,COALESCE(SUM(CASE WHEN category='STOCK_PURCHASE' THEN amount_cents ELSE 0 END),0) stock FROM expenses WHERE tenant_id=$1 AND branch_id=$2 AND voided_at IS NULL AND paid_on >= $3 AND paid_on <= $4",
      [...scope, range.from, range.to],
    )
  ).rows[0];
  const groups = (
    await db.query(
      "SELECT p.patient_group_id,COALESCE(c.label,'No group assigned') label,COUNT(*) patients FROM patients p LEFT JOIN reference_catalogs c ON c.id=p.patient_group_id AND c.tenant_id=p.tenant_id AND c.branch_id=p.branch_id AND c.kind='PATIENT_GROUP' WHERE p.tenant_id=$1 AND p.branch_id=$2 GROUP BY p.patient_group_id,c.label ORDER BY patients DESC,label",
      scope,
    )
  ).rows;
  const usage = (
    await db.query(
      `SELECT i.id item_id,i.name,i.category,i.unit,SUM(CASE WHEN m.dispense_id IS NOT NULL THEN -m.quantity_delta ELSE 0 END) dispensed,SUM(CASE WHEN m.usage_id IS NOT NULL THEN -m.quantity_delta ELSE 0 END) used,SUM(-m.quantity_delta) total FROM stock_movements m JOIN inventory_batches b ON b.id=m.batch_id AND b.tenant_id=m.tenant_id AND b.branch_id=m.branch_id JOIN inventory_items i ON i.id=b.item_id AND i.tenant_id=b.tenant_id AND i.branch_id=b.branch_id WHERE m.tenant_id=$1 AND m.branch_id=$2 AND i.category IN ('MEDICATION','CONSUMABLE') AND m.quantity_delta<0 AND (m.dispense_id IS NOT NULL OR m.usage_id IS NOT NULL) AND m.created_at >= $3 AND m.created_at < $4 GROUP BY i.id,i.name,i.category,i.unit ORDER BY total DESC,i.id LIMIT 10`,
      [...scope, start, end],
    )
  ).rows;
  const collectedCents = exact(collected?.collected),
    totalExpenseCents = exact(expense?.total),
    stockPurchaseCents = exact(expense?.stock);
  return {
    ...range,
    collectedCents,
    stockPurchaseCents,
    totalExpenseCents,
    operatingExpenseCents: exact(totalExpenseCents - stockPurchaseCents),
    netCashIncomeCents: exact(collectedCents - totalExpenseCents),
    paidInvoiceCount: exact(invoice?.count),
    patientGroups: groups.map((row) => ({
      patientGroupId: row.patient_group_id ?? null,
      label: row.label,
      patients: exact(row.patients),
    })),
    topUsage: usage.map((row) => ({
      itemId: row.item_id,
      name: row.name,
      category: row.category,
      unit: row.unit,
      dispensedQuantity: exact(row.dispensed),
      usedQuantity: exact(row.used),
      totalQuantity: exact(row.total),
    })),
  };
}
