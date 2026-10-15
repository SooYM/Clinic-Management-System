import { lock, type Database } from './db.js';
/** One serialized sequence covers confirmed visits and numbers reserved by public registrations. */
export async function allocateQueueNumber(db: Database, branchId: number) {
  const day = (
    await db.query('SELECT DATE(DATE_ADD(UTC_TIMESTAMP(),INTERVAL 8 HOUR)) service_date')
  ).rows[0].service_date;
  await lock(db, [`queue:${branchId}:${day}`]);
  const next = (
    await db.query(
      `SELECT COALESCE(MAX(number),0)+1 number FROM (
    SELECT CAST(SUBSTRING(ticket_number,3) AS UNSIGNED) number FROM queue_tickets WHERE branch_id=$1 AND service_date=$2
    UNION ALL SELECT CAST(SUBSTRING(ticket_number,3) AS UNSIGNED) number FROM pending_registrations WHERE branch_id=$1 AND service_date=$2
  ) numbers`,
      [branchId, day],
    )
  ).rows[0].number;
  return { ticketNumber: `Q-${String(next).padStart(3, '0')}`, serviceDate: String(day) };
}
