import { pool, camel } from './db.js';
import type { Context } from './security.js';
import { DomainError } from '../domain/models.js';
import { buildReceiptView } from '../shared/receipt-view.js';

export async function readReceipt(ctx: Context, id: number) {
  const invoice = (
    await pool.query(
      `SELECT i.id,i.invoice_number,i.created_at,i.receipt_snapshot,i.lines,i.total_cents,
    p.name patient_name,p.national_id,b.name branch_name,b.address clinic_address,t.name clinic_name,
    (SELECT u.name FROM audit_logs a JOIN users u ON u.id=a.actor_id
      WHERE a.tenant_id=i.tenant_id AND a.branch_id=i.branch_id AND a.entity_type='invoice'
      AND a.entity_id=i.id AND a.action='CHECKOUT' ORDER BY a.id LIMIT 1) received_by
    FROM invoices i JOIN patients p ON p.id=i.patient_id JOIN branches b ON b.id=i.branch_id
    JOIN tenants t ON t.id=i.tenant_id WHERE i.id=$1 AND i.tenant_id=$2 AND i.branch_id=$3`,
      [id, ctx.actor.tenantId, ctx.branchId],
    )
  ).rows[0];
  if (!invoice) throw new DomainError('NOT_FOUND', 'Invoice not found.', 404);
  const payments = (
    await pool.query(
      'SELECT method,amount_cents,reference FROM payments WHERE invoice_id=$1 AND tenant_id=$2 AND branch_id=$3 ORDER BY id',
      [id, ctx.actor.tenantId, ctx.branchId],
    )
  ).rows;
  return buildReceiptView({
    ...camel(invoice),
    receivedBy: invoice.received_by || '',
    payments: camel(payments),
  });
}
