import { NextRequest } from "next/server";
import { toggleStaffActive } from "../../../../lib/server/storage";
import { assertSameOrigin, errorResponse, getAuthenticatedClinicStaff, jsonResponse } from "../../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      return jsonResponse({ ok: false, error: { message: "Only administrators can change staff status." } }, 403);
    }

    const { id } = await context.params;
    const body = (await request.json()) as { active?: boolean };
    if (typeof body.active !== "boolean") {
      return jsonResponse({ ok: false, error: { message: "Property 'active' (boolean) is required." } }, 400);
    }

    const updated = toggleStaffActive(id, body.active);
    return jsonResponse({
      ok: true,
      staff: {
        id: updated.id,
        username: updated.username,
        fullName: updated.full_name,
        role: updated.role,
        isActive: updated.active,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
