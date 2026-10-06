import { NextRequest } from "next/server";
import { AuthRouteError, errorResponse, getAuthenticatedClinicStaff } from "../../../../lib/server/supabase-auth";
import { parseInstant, requireSchedulingPermission, requireText, sessionResponse, validUuid } from "../../../../lib/server/scheduling-api";
import { withSessionClient, callRpc } from "../../../../lib/server/db";

export const runtime = "nodejs";

type Appointment = {
  id: string;
  patient_id: string;
  practitioner_id: string;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  reason: string | null;
  notes: string | null;
  updated_at: string;
};

type RouteContext = { params: Promise<{ id: string }> };
const statuses = new Set(["booked", "confirmed", "arrived", "completed", "no_show"]);

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const { id } = await context.params;
    if (!validUuid(id)) {
      throw new AuthRouteError(400, "INVALID_APPOINTMENT", "Provide a valid appointment identifier.");
    }
    const body = (await request.json()) as Record<string, unknown>;
    const expectedUpdatedAt = parseInstant(body.expectedUpdatedAt);
    if (!expectedUpdatedAt) {
      throw new AuthRouteError(400, "EXPECTED_VERSION_REQUIRED", "Provide the appointment's current updatedAt value.");
    }

    const current = await withSessionClient(session.user.auth_user_id, async (client) => {
      const res = await client.query<Appointment>(
        `SELECT id, patient_id, practitioner_id, room_id, starts_at, ends_at, status, reason, notes, updated_at
         FROM public.appointments
         WHERE id = $1 AND clinic_id = $2 AND branch_id = $3
         LIMIT 1;`,
        [id, session.user.clinic_id, session.user.branch_id],
      );
      return res.rows[0];
    });

    if (!current) {
      throw new AuthRouteError(404, "APPOINTMENT_NOT_FOUND", "Appointment not found in this branch.");
    }

    const practitionerId = body.practitionerId === undefined ? current.practitioner_id : body.practitionerId;
    const roomId = body.roomId === undefined ? current.room_id : body.roomId;
    const startsAt = body.startsAt === undefined ? parseInstant(current.starts_at) : parseInstant(body.startsAt);
    const endsAt = body.endsAt === undefined ? parseInstant(current.ends_at) : parseInstant(body.endsAt);
    const reason = body.reason === undefined ? current.reason : requireText(body.reason, "Reason", 240, true);
    const notes = body.notes === undefined ? current.notes : requireText(body.notes, "Notes", 2000, true);
    const status = body.status === undefined ? null : body.status;

    if (
      !validUuid(practitionerId) ||
      (roomId !== null && !validUuid(roomId)) ||
      !startsAt ||
      !endsAt ||
      endsAt <= startsAt ||
      (status !== null && (typeof status !== "string" || !statuses.has(status)))
    ) {
      throw new AuthRouteError(400, "INVALID_APPOINTMENT", "Provide valid appointment details and status.");
    }

    await requireSchedulingPermission(session, "appointments.manage");

    const appointment = await callRpc(session.user.auth_user_id, "update_clinic_appointment", [
      id,
      expectedUpdatedAt,
      practitionerId,
      roomId,
      startsAt,
      endsAt,
      reason,
      notes,
      status,
    ]);

    return sessionResponse(session, { ok: true, appointment });
  } catch (error) {
    return errorResponse(error);
  }
}
