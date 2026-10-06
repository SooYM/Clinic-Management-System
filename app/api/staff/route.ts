import { NextRequest, NextResponse } from "next/server";
import { getDatabase, registerStaff } from "../../../lib/server/storage";
import { assertSameOrigin, errorResponse, getAuthenticatedClinicStaff, jsonResponse } from "../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
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

    const body = (await request.json()) as {
      username?: string;
      email?: string;
      password?: string;
      fullName?: string;
      role?: "doctor" | "receptionist" | "nurse" | "manager";
      specialty?: string;
      licenseNumber?: string;
    };

    if (!body.email?.trim() || !body.fullName?.trim() || !body.role) {
      return jsonResponse({ ok: false, error: { message: "Full name, email, and role are required." } }, 400);
    }

    const created = registerStaff({
      username: body.username?.trim(),
      email: body.email.trim(),
      password: body.password?.trim() || "clinic123",
      fullName: body.fullName.trim(),
      role: body.role,
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
