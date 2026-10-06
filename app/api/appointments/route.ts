import { NextRequest } from "next/server";
import { AuthRouteError, errorResponse, getAuthenticatedClinicStaff } from "../../../lib/server/supabase-auth";
import { parseInstant, requireSchedulingPermission, requireText, sessionResponse, validUuid } from "../../../lib/server/scheduling-api";
import { withSessionClient, callRpc } from "../../../lib/server/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    await requireSchedulingPermission(session, "appointments.read");

    const fromRaw = request.nextUrl.searchParams.get("from");
    const toRaw = request.nextUrl.searchParams.get("to");
    const from = fromRaw ? parseInstant(fromRaw) : null;
    const to = toRaw ? parseInstant(toRaw) : null;

    if ((fromRaw && !from) || (toRaw && !to) || (from && to && from >= to)) {
      throw new AuthRouteError(400, "INVALID_DATE_RANGE", "Provide a valid appointment date range.");
    }

    const appointments = await withSessionClient(session.user.auth_user_id, async (client) => {
      let sql = `SELECT id, patient_id, practitioner_id, room_id, starts_at, ends_at, status, reason, notes, created_by, created_at, updated_at, cancelled_at
                 FROM public.appointments
                 WHERE clinic_id = $1 AND branch_id = $2`;
      const params: unknown[] = [session.user.clinic_id, session.user.branch_id];

      if (from) {
        params.push(from);
        sql += ` AND starts_at >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        sql += ` AND starts_at < $${params.length}`;
      }

      sql += ` ORDER BY starts_at ASC LIMIT 500;`;
      const res = await client.query(sql, params);
      return res.rows;
    });

    return sessionResponse(session, { ok: true, appointments });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    await requireSchedulingPermission(session, "appointments.manage");

    const body = (await request.json()) as Record<string, unknown>;
    const startsAt = parseInstant(body.startsAt);
    const endsAt = parseInstant(body.endsAt);

    if (
      !validUuid(body.patientId) ||
      !validUuid(body.practitionerId) ||
      (body.roomId !== null && body.roomId !== undefined && !validUuid(body.roomId)) ||
      !startsAt ||
      !endsAt ||
      endsAt <= startsAt
    ) {
      throw new AuthRouteError(400, "INVALID_APPOINTMENT", "Provide a patient, active practitioner, optional room, and valid start and end times.");
    }

    const reason = requireText(body.reason, "Reason", 240, true);
    const notes = requireText(body.notes, "Notes", 2000, true);

    const appointment = await callRpc(session.user.auth_user_id, "create_clinic_appointment", [
      body.patientId,
      body.practitionerId,
      body.roomId ?? null,
      startsAt,
      endsAt,
      reason,
      notes,
    ]);

    return sessionResponse(session, { ok: true, appointment }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
