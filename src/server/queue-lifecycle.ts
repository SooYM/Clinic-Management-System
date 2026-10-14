import { lock, type Database } from './db.js';
import type { Context } from './security.js';

/** Serialize branch lifecycle work, releasing expired operational locks without rewriting visit history. */
export async function expireQueue(db: Database, ctx: Context) {
  await lock(db, [`queue-lifecycle:${ctx.actor.tenantId}:${ctx.branchId}`]);
  const expired = (
    await db.query(
      "SELECT id,status,service_date<DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) day_ended FROM queue_tickets WHERE tenant_id=$1 AND branch_id=$2 AND expired_at IS NULL AND status NOT IN ('COMPLETED','SKIPPED') AND (created_at<=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 12 HOUR) OR service_date<DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR))) ORDER BY id FOR UPDATE",
      [ctx.actor.tenantId, ctx.branchId],
    )
  ).rows;
  for (const ticket of expired) {
    await db.query(
      'UPDATE queue_tickets SET expired_at=UTC_TIMESTAMP(3),version=version+1 WHERE id=$1',
      [ticket.id],
    );
    await db.query(
      "INSERT INTO audit_logs(tenant_id,branch_id,actor_id,action,entity_type,entity_id,request_id,metadata) VALUES($1,$2,$3,'QUEUE_EXPIRED','queue',$4,$5,$6)",
      [
        ctx.actor.tenantId,
        ctx.branchId,
        ctx.actor.id,
        ticket.id,
        ctx.requestId,
        JSON.stringify({
          status: ticket.status,
          lifetimeHours: 12,
          reason: ticket.day_ended ? 'SERVICE_DAY_ENDED' : 'LIFETIME_ELAPSED',
        }),
      ],
    );
  }
}
