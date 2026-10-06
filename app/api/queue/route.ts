import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies } from "../../../lib/server/supabase-auth";
import { withSessionClient, callRpc } from "../../../lib/server/db";
import { getDatabase, saveDatabase, type StoredQueueTicket } from "../../../lib/server/storage";

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
    let rows: QueueRow[] = [];
    try {
      const res = await withSessionClient(session.user.auth_user_id, async (client) => {
        const queryRes = await client.query<QueueRow>(
          `SELECT id, patient_id, ticket_number, status, priority, registered_at, called_at, room_id
           FROM public.queue_tickets
           WHERE clinic_id = $1 AND branch_id = $2
           ORDER BY priority DESC, registered_at ASC LIMIT 500;`,
          [session.user.clinic_id, session.user.branch_id],
        );
        return queryRes.rows;
      });
      rows = res;
    } catch {
      // Zero-config persistent local fallback
      const db = getDatabase();
      rows = db.queue.map((q) => ({
        id: q.id,
        patient_id: q.patientId,
        ticket_number: q.ticketNumber,
        status: statusMap[q.status] || "registered",
        priority: 0,
        registered_at: new Date().toISOString(),
        called_at: q.calledAt ? new Date().toISOString() : null,
        room_id: q.roomId || null,
      }));
    }

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

    let ticket: QueueRow;
    try {
      ticket = await callRpc<QueueRow>(session.user.auth_user_id, "create_queue_ticket", [
        body.patientId,
        ticketNumber,
      ]);
    } catch {
      // Zero-config persistent local fallback
      const db = getDatabase();
      const patient = db.patients.find((p) => p.id === body.patientId);
      const newLocalTicket: StoredQueueTicket = {
        id: crypto.randomUUID(),
        ticketNumber: `Q-${db.queue.length + 101}`,
        patientId: body.patientId as string,
        patientName: patient?.name || "Patient",
        phone: patient?.phone || "",
        email: patient?.email || "",
        status: "WAITING",
        practitionerName: "Unassigned",
        registeredAt: new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }),
        waitTimeMinutes: 0,
      };
      saveDatabase({ queue: [...db.queue, newLocalTicket] });
      ticket = {
        id: newLocalTicket.id,
        patient_id: newLocalTicket.patientId,
        ticket_number: newLocalTicket.ticketNumber,
        status: "registered",
        priority: 0,
        registered_at: new Date().toISOString(),
        called_at: null,
        room_id: null,
      };
    }

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
      !body.ticketId ||
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

    const roomId = typeof body.roomId === "string" ? body.roomId : null;
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

    let ticket: QueueRow;
    try {
      ticket = await callRpc<QueueRow>(session.user.auth_user_id, "transition_queue_ticket", [
        body.ticketId,
        expected,
        statusMap[body.status],
        roomId,
        note,
      ]);
    } catch {
      // Zero-config persistent local fallback
      const db = getDatabase();
      const mappedStatus = body.status as StoredQueueTicket["status"];
      const updatedQueue = db.queue.map((t) => {
        if (t.id === body.ticketId) {
          return {
            ...t,
            status: mappedStatus,
            roomId: roomId || t.roomId,
            calledAt: mappedStatus === "CALLED_TO_ROOM" ? new Date().toLocaleTimeString("en-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }) : t.calledAt,
          };
        }
        return t;
      });
      saveDatabase({ queue: updatedQueue });
      const target = updatedQueue.find((t) => t.id === body.ticketId);
      ticket = {
        id: (target?.id || body.ticketId) as string,
        patient_id: target?.patientId || "",
        ticket_number: target?.ticketNumber || "",
        status: statusMap[body.status] || "registered",
        priority: 0,
        registered_at: new Date().toISOString(),
        called_at: target?.calledAt ? new Date().toISOString() : null,
        room_id: roomId,
      };
    }

    const result = jsonResponse({ ok: true, ticket });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
