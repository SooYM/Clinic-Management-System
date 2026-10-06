import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies } from "../../../lib/server/supabase-auth";
import { withSessionClient, callRpc } from "../../../lib/server/db";

export const runtime = "nodejs";

type QueueRow = {
  id: string;
  patient_id: string;
  ticket_number: string;
  status: string;
  priority: number;
  registered_at: string;
  called_at: string | null;
  room_id: string | null;
};

const statusMap: Record<string, string> = {
  WAITING: "registered",
  CALLED_TO_ROOM: "called_to_room",
  IN_CONSULTATION: "in_consultation",
  DISPENSARY: "dispensary_waiting",
  PAYMENT: "payment_waiting",
  COMPLETED: "completed",
};

const databaseStatuses = new Set([
  "registered",
  "triage_waiting",
  "called_to_room",
  "in_consultation",
  "dispensary_waiting",
  "payment_waiting",
  "completed",
  "no_show",
]);

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const rows = await withSessionClient(session.user.auth_user_id, async (client) => {
      const res = await client.query<QueueRow>(
        `SELECT id, patient_id, ticket_number, status, priority, registered_at, called_at, room_id
         FROM public.queue_tickets
         WHERE clinic_id = $1 AND branch_id = $2
         ORDER BY priority DESC, registered_at ASC LIMIT 500;`,
        [session.user.clinic_id, session.user.branch_id],
      );
      return res.rows;
    });

    const result = jsonResponse({ ok: true, queue: rows });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (!["receptionist", "manager", "nurse"].includes(session.user.role)) {
      throw new AuthRouteError(403, "ROLE_FORBIDDEN", "Your role cannot issue queue tickets.");
    }
    const body = (await request.json()) as { patientId?: unknown };
    if (typeof body.patientId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.patientId)) {
      throw new AuthRouteError(400, "INVALID_PATIENT", "Select a valid patient.");
    }

    const ticketNumber = `Q-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

    const ticket = await callRpc<QueueRow>(session.user.auth_user_id, "create_queue_ticket", [
      body.patientId,
      ticketNumber,
    ]);

    const result = NextResponse.json({ ok: true, ticket }, { status: 201, headers: { "Cache-Control": "no-store" } });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const body = (await request.json()) as {
      ticketId?: unknown;
      expectedStatus?: unknown;
      status?: unknown;
      roomId?: unknown;
      note?: unknown;
    };

    if (
      typeof body.ticketId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(body.ticketId) ||
      typeof body.status !== "string" ||
      !statusMap[body.status]
    ) {
      throw new AuthRouteError(400, "INVALID_QUEUE_TRANSITION", "Provide a valid ticket and destination status.");
    }

    const expected =
      typeof body.expectedStatus === "string" && databaseStatuses.has(body.expectedStatus)
        ? body.expectedStatus
        : typeof body.expectedStatus === "string"
          ? statusMap[body.expectedStatus]
          : undefined;

    if (!expected) {
      throw new AuthRouteError(400, "INVALID_QUEUE_TRANSITION", "Provide the current ticket status to prevent stale updates.");
    }

    const roomId = typeof body.roomId === "string" && /^[0-9a-f-]{36}$/i.test(body.roomId) ? body.roomId : null;
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

    const ticket = await callRpc<QueueRow>(session.user.auth_user_id, "transition_queue_ticket", [
      body.ticketId,
      expected,
      statusMap[body.status],
      roomId,
      note,
    ]);

    const result = jsonResponse({ ok: true, ticket });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
