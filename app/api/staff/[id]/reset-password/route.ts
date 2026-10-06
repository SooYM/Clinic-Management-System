import { NextRequest } from "next/server";
import { resetStaffPassword } from "../../../../../lib/server/storage";
import { assertSameOrigin, errorResponse, getAuthenticatedClinicStaff, jsonResponse } from "../../../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    assertSameOrigin(request);
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      return jsonResponse({ ok: false, error: { message: "Only administrators can reset passwords." } }, 403);
    }

    const { id } = await context.params;
    const body = (await request.json()) as { newPassword?: string };
    if (!body.newPassword || body.newPassword.length < 6) {
      return jsonResponse({ ok: false, error: { message: "New password must be at least 6 characters." } }, 400);
    }

    const updated = resetStaffPassword(id, body.newPassword);
    return jsonResponse({
      ok: true,
      message: `Password reset successfully for ${updated.full_name} (${updated.username}).`,
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
