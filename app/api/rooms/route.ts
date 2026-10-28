import { NextRequest } from "next/server";
import { withSessionClient } from "../../../lib/server/db";
import { getDatabase } from "../../../lib/server/storage";
import { errorResponse, getAuthenticatedClinicStaff, isLocalDemoEnabled } from "../../../lib/server/supabase-auth";
import { sessionResponse } from "../../../lib/server/scheduling-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (isLocalDemoEnabled()) return sessionResponse(session, { ok: true, rooms: getDatabase().rooms });
    const rooms = await withSessionClient(session.user.auth_user_id, async (client) => {
      const result = await client.query(
        `SELECT r.id, r.room_number AS name,
                coalesce(s.full_name, '') AS "practitionerName",
                coalesce(to_jsonb(s)->>'specialty', 'General Practice') AS specialty,
                (q.id IS NOT NULL) AS "isOccupied", q.ticket_number AS "currentTicketNumber"
         FROM public.consultation_rooms r
         LEFT JOIN public.staff_members s ON s.id = r.attending_practitioner_id
           AND s.clinic_id = r.clinic_id AND s.branch_id = r.branch_id AND s.active
         LEFT JOIN public.queue_tickets q ON q.room_id = r.id
           AND q.clinic_id = r.clinic_id AND q.branch_id = r.branch_id
           AND q.status IN ('called_to_room', 'in_consultation')
         WHERE r.clinic_id = $1 AND r.branch_id = $2 AND r.is_active
         ORDER BY r.room_number, r.id;`,
        [session.user.clinic_id, session.user.branch_id],
      );
      return result.rows;
    });
    return sessionResponse(session, { ok: true, rooms });
  } catch (error) {
    return errorResponse(error);
  }
}
