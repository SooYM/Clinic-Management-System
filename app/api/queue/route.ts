import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, jsonResponse, errorResponse, setSessionCookies } from "../../../lib/server/supabase-auth";

export const runtime = "nodejs";

type QueueRow = {
  id: string; patient_id: string; ticket_number: string; status: string; priority: number;
  registered_at: string; called_at: string | null; room_id: string | null;
};

async function rest(token: string, path: string, init: RequestInit = {}) {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const anon = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new AuthRouteError(503, "DATABASE_NOT_CONFIGURED", "PostgreSQL is not configured.");
  try {
    return await fetch(`${url}/rest/v1/${path}`, {
      ...init, cache: "no-store", headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
  } catch { throw new AuthRouteError(503, "DATABASE_UNAVAILABLE", "The clinic database is unavailable."); }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const query = new URLSearchParams({ select: "id,patient_id,ticket_number,status,priority,registered_at,called_at,room_id", order: "priority.desc,registered_at.asc", limit: "500" });
    const response = await rest(session.accessToken, `queue_tickets?${query}`);
    if (!response.ok) throw new AuthRouteError(502, "QUEUE_LOAD_FAILED", "Could not load the clinic queue.");
    const rows = await response.json() as QueueRow[];
    const result = jsonResponse({ ok: true, queue: rows });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (!["receptionist", "manager", "nurse"].includes(session.user.role)) throw new AuthRouteError(403, "ROLE_FORBIDDEN", "Your role cannot issue queue tickets.");
    const body = await request.json() as { patientId?: unknown };
    if (typeof body.patientId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.patientId)) throw new AuthRouteError(400, "INVALID_PATIENT", "Select a valid patient.");
    const ticketNumber = `Q-${new Date().toISOString().slice(11, 19).replaceAll(":", "")}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    const response = await rest(session.accessToken, "rpc/create_queue_ticket", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_patient_id: body.patientId, p_ticket_number: ticketNumber }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { code?: string };
      if (data.code === "23505") throw new AuthRouteError(409, "QUEUE_CONFLICT", "A queue ticket could not be issued. Refresh the queue and retry.");
      if (data.code === "42501") throw new AuthRouteError(403, "QUEUE_PERMISSION_DENIED", "Your clinic role cannot issue queue tickets.");
      if (data.code === "P0002") throw new AuthRouteError(404, "PATIENT_NOT_FOUND", "Patient was not found in this branch.");
      throw new AuthRouteError(response.status === 403 ? 403 : 502, "QUEUE_CREATE_FAILED", "Could not issue the queue ticket.");
    }
    const ticket = await response.json() as QueueRow;
    const result = NextResponse.json({ ok: true, ticket }, { status: 201, headers: { "Cache-Control": "no-store" } });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}

const statusMap: Record<string, string> = {
  WAITING: "registered", CALLED_TO_ROOM: "called_to_room", IN_CONSULTATION: "in_consultation",
  DISPENSARY: "dispensary_waiting", PAYMENT: "payment_waiting", COMPLETED: "completed",
};
const databaseStatuses = new Set(["registered", "triage_waiting", "called_to_room", "in_consultation", "dispensary_waiting", "payment_waiting", "completed", "no_show"]);

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    const body = await request.json() as { ticketId?: unknown; expectedStatus?: unknown; status?: unknown; roomId?: unknown; note?: unknown };
    if (typeof body.ticketId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.ticketId) || typeof body.status !== "string" || !statusMap[body.status]) {
      throw new AuthRouteError(400, "INVALID_QUEUE_TRANSITION", "Provide a valid ticket and destination status.");
    }
    const expected = typeof body.expectedStatus === "string" && databaseStatuses.has(body.expectedStatus)
      ? body.expectedStatus
      : typeof body.expectedStatus === "string" ? statusMap[body.expectedStatus] : undefined;
    if (!expected) throw new AuthRouteError(400, "INVALID_QUEUE_TRANSITION", "Provide the current ticket status to prevent stale updates.");
    const roomId = typeof body.roomId === "string" && /^[0-9a-f-]{36}$/i.test(body.roomId) ? body.roomId : null;
    const base = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const anon = process.env.SUPABASE_ANON_KEY?.trim();
    if (!base || !anon) throw new AuthRouteError(503, "DATABASE_NOT_CONFIGURED", "PostgreSQL is not configured.");
    let response: Response;
    try {
      response = await fetch(`${base}/rest/v1/rpc/transition_queue_ticket`, {
        method: "POST", cache: "no-store",
        headers: { apikey: anon, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_queue_ticket_id: body.ticketId, p_expected_status: expected, p_to_status: statusMap[body.status], p_room_id: roomId, p_note: typeof body.note === "string" ? body.note.slice(0, 500) : null }),
      });
    } catch { throw new AuthRouteError(503, "DATABASE_UNAVAILABLE", "The clinic database is unavailable."); }
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { code?: string };
      if (data.code === "40001") throw new AuthRouteError(409, "QUEUE_STALE", "The ticket changed in another session. Refresh the queue and retry.");
      if (data.code === "23514") throw new AuthRouteError(400, "QUEUE_TRANSITION_NOT_ALLOWED", "That queue status change is not allowed.");
      if (data.code === "42501") throw new AuthRouteError(403, "QUEUE_PERMISSION_DENIED", "Your clinic role cannot change this ticket.");
      if (data.code === "P0002") throw new AuthRouteError(404, "QUEUE_TICKET_NOT_FOUND", "Queue ticket not found.");
      throw new AuthRouteError(502, "QUEUE_TRANSITION_FAILED", "Could not update the queue ticket.");
    }
    const ticket = await response.json();
    const result = jsonResponse({ ok: true, ticket });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) { return errorResponse(error); }
}
