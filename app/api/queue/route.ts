import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies, isLocalDemoEnabled } from "../../../lib/server/supabase-auth";
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

function localQueueRow(ticket: StoredQueueTicket): QueueRow {
  return {
    id: ticket.id,
    patient_id: ticket.patientId,
    ticket_number: ticket.ticketNumber,
    status: statusMap[ticket.status],
    priority: 0,
    registered_at: ticket.registeredAt,
    called_at: ticket.calledAt ?? null,
    room_id: ticket.roomId ?? null,
  };
}

const localTransitions: Record<StoredQueueTicket["status"], StoredQueueTicket["status"][]> = {
  WAITING: ["CALLED_TO_ROOM"],
  CALLED_TO_ROOM: ["IN_CONSULTATION"],
  IN_CONSULTATION: ["DISPENSARY"],
  DISPENSARY: ["PAYMENT", "COMPLETED"],
  PAYMENT: ["COMPLETED"],
  COMPLETED: [],
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const rows = isLocalDemoEnabled()
      ? getDatabase().queue.map(localQueueRow)
      : await withSessionClient(session.user.auth_user_id, async (client) => {
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
    if (!body || typeof body.patientId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.patientId)) {
      throw new AuthRouteError(400, "INVALID_PATIENT", "Select a valid patient.");
    }

    const ticketNumber = `Q-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

    let ticket: QueueRow;
    if (!isLocalDemoEnabled()) {
      ticket = await callRpc<QueueRow>(session.user.auth_user_id, "create_queue_ticket", [body.patientId, ticketNumber]);
    } else {
      const db = getDatabase();
      const patient = db.patients.find((p) => p.id === body.patientId);
      if (!patient) throw new AuthRouteError(404, "PATIENT_NOT_FOUND", "Patient record not found.");
      if (db.queue.some((t) => t.patientId === patient.id && t.status !== "COMPLETED")) {
        throw new AuthRouteError(409, "PATIENT_ALREADY_QUEUED", "Patient already has an active queue ticket.");
      }
      const newLocalTicket: StoredQueueTicket = {
        id: crypto.randomUUID(),
        ticketNumber,
        patientId: patient.id,
        patientName: patient.name,
        phone: patient.phone,
        email: patient.email,
        status: "WAITING",
        practitionerName: "Unassigned",
        registeredAt: new Date().toISOString(),
        waitTimeMinutes: 0,
      };
      saveDatabase({ queue: [...db.queue, newLocalTicket] });
      ticket = localQueueRow(newLocalTicket);
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
      !body ||
      typeof body.ticketId !== "string" ||
      !body.ticketId ||
      typeof body.status !== "string" ||
      !Object.hasOwn(statusMap, body.status)
    ) {
      throw new AuthRouteError(400, "INVALID_QUEUE_TRANSITION", "Provide a valid ticket and destination status.");
    }

    const expected =
      typeof body.expectedStatus === "string" && databaseStatuses.has(body.expectedStatus)
        ? body.expectedStatus
        : typeof body.expectedStatus === "string" && Object.hasOwn(statusMap, body.expectedStatus)
          ? statusMap[body.expectedStatus]
          : undefined;

    if (!expected) {
      throw new AuthRouteError(400, "INVALID_QUEUE_TRANSITION", "Provide the current ticket status to prevent stale updates.");
    }

    const roomId = typeof body.roomId === "string" ? body.roomId : null;
    const note = typeof body.note === "string" ? body.note.slice(0, 500) : null;

    let ticket: QueueRow;
    if (!isLocalDemoEnabled()) {
      ticket = await callRpc<QueueRow>(session.user.auth_user_id, "transition_queue_ticket", [
        body.ticketId, expected, statusMap[body.status], roomId, note,
      ]);
    } else {
      const db = getDatabase();
      const target = db.queue.find((t) => t.id === body.ticketId);
      if (!target) throw new AuthRouteError(404, "QUEUE_TICKET_NOT_FOUND", "Queue ticket not found.");
      const mappedStatus = body.status as StoredQueueTicket["status"];
      if (target.status === mappedStatus) {
        ticket = localQueueRow(target);
      } else {
        if (statusMap[target.status] !== expected) {
          throw new AuthRouteError(409, "QUEUE_STALE", "Queue ticket changed; refresh and retry.");
        }
        if (!localTransitions[target.status].includes(mappedStatus)) {
          throw new AuthRouteError(400, "QUEUE_TRANSITION_NOT_ALLOWED", "Queue status transition is not allowed.");
        }
        const room = roomId ? db.rooms.find((r) => r.id === roomId) : undefined;
        if (roomId && !room) throw new AuthRouteError(400, "INVALID_ROOM", "Select a valid consultation room.");
        if (mappedStatus === "CALLED_TO_ROOM") {
          if (!room) throw new AuthRouteError(400, "ROOM_REQUIRED", "Select a consultation room.");
          if (room.isOccupied || db.queue.some((t) => t.id !== target.id && t.roomId === room.id &&
            ["CALLED_TO_ROOM", "IN_CONSULTATION"].includes(t.status))) {
            throw new AuthRouteError(409, "ROOM_OCCUPIED", "Consultation room is occupied.");
          }
        }
        const updated: StoredQueueTicket = {
          ...target,
          status: mappedStatus,
          roomId: mappedStatus === "CALLED_TO_ROOM" ? roomId! : target.roomId,
          calledAt: mappedStatus === "CALLED_TO_ROOM" ? new Date().toISOString() : target.calledAt,
        };
        const rooms = db.rooms.map((r) => {
          if (mappedStatus === "CALLED_TO_ROOM" && r.id === roomId) {
            return { ...r, isOccupied: true, currentTicketNumber: target.ticketNumber };
          }
          if (mappedStatus === "DISPENSARY" && r.id === target.roomId) {
            return { ...r, isOccupied: false, currentTicketNumber: undefined };
          }
          return r;
        });
        saveDatabase({ queue: db.queue.map((t) => t.id === target.id ? updated : t), rooms });
        ticket = localQueueRow(updated);
      }
    }

    const result = jsonResponse({ ok: true, ticket });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
