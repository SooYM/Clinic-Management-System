import { NextRequest } from "next/server";
import { getDatabase, registerStaff } from "../../../lib/server/storage";
import { withSessionClient } from "../../../lib/server/db";
import { sessionResponse } from "../../../lib/server/scheduling-api";
import { AuthRouteError, assertSameOrigin, errorResponse, getAuthenticatedClinicStaff, isLocalDemoEnabled, jsonResponse } from "../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await getAuthenticatedClinicStaff(request);
    if (!isLocalDemoEnabled()) {
      const staff = await withSessionClient(session.user.auth_user_id, async (client) => {
        const result = await client.query(
          `SELECT id, auth_user_id, full_name AS "fullName", role,
                  license_number AS "licenseNumber", active AS "isActive", created_at AS "createdAt",
                  coalesce(to_jsonb(s)->>'specialty', '') AS specialty,
                  coalesce(to_jsonb(s)->>'username', '') AS username,
                  coalesce(to_jsonb(s)->>'email', '') AS email
           FROM public.staff_members s
           WHERE clinic_id = $1 AND branch_id = $2
           ORDER BY full_name, id;`,
          [session.user.clinic_id, session.user.branch_id],
        );
        return result.rows;
      });
      return sessionResponse(session, { ok: true, staff });
    }
    if (session.user.role !== "manager") throw new AuthRouteError(403, "ROLE_FORBIDDEN", "Only administrators can list demo staff users.");
    const db = getDatabase();
    // Return staff list without exposing raw passwords in default listing
    const sanitized = db.staff.map((s) => ({
      id: s.id,
      auth_user_id: s.auth_user_id,
      username: s.username,
      email: s.email,
      fullName: s.full_name,
      role: s.role,
      specialty: s.specialty,
      licenseNumber: s.license_number,
      isActive: s.active,
      createdAt: s.createdAt,
    }));
    return jsonResponse({ ok: true, staff: sanitized });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      return jsonResponse({ ok: false, error: { message: "Only administrators can register staff users." } }, 403);
    }
    if (!isLocalDemoEnabled()) throw new AuthRouteError(503, "STAFF_MANAGEMENT_UNAVAILABLE", "Live staff management is not configured.");

    const body = (await request.json()) as {
      username?: string;
      email?: string;
      password?: string;
      fullName?: string;
      role?: "doctor" | "receptionist" | "nurse" | "manager";
      specialty?: string;
      licenseNumber?: string;
    };

    if (!body || typeof body !== "object" || typeof body.email !== "string" || typeof body.fullName !== "string" || !body.email.trim() || !body.fullName.trim() || !["doctor", "receptionist", "nurse", "manager"].includes(body.role ?? "")) {
      return jsonResponse({ ok: false, error: { message: "Full name, email, and role are required." } }, 400);
    }
    if ((body.username !== undefined && typeof body.username !== "string") ||
        (body.specialty !== undefined && typeof body.specialty !== "string") ||
        (body.licenseNumber !== undefined && typeof body.licenseNumber !== "string") ||
        typeof body.password !== "string" || body.password.length < 6 || body.password.length > 128) {
      throw new AuthRouteError(400, "INVALID_STAFF", "Provide valid staff fields and a password of 6 to 128 characters.");
    }

    const created = registerStaff({
      username: body.username?.trim(),
      email: body.email.trim(),
      password: body.password,
      fullName: body.fullName.trim(),
      role: body.role!,
      specialty: body.specialty?.trim(),
      licenseNumber: body.licenseNumber?.trim(),
    });

    return jsonResponse({
      ok: true,
      staff: {
        id: created.id,
        auth_user_id: created.auth_user_id,
        username: created.username,
        email: created.email,
        fullName: created.full_name,
        role: created.role,
        specialty: created.specialty,
        licenseNumber: created.license_number,
        isActive: created.active,
        createdAt: created.createdAt,
      },
    }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
