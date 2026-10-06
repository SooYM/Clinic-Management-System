import { NextRequest } from "next/server";
import { getDatabase, saveDatabase, type ClinicDatabaseState } from "../../../lib/server/storage";
import { assertSameOrigin, errorResponse, jsonResponse } from "../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const db = getDatabase();
    return jsonResponse({
      ok: true,
      data: {
        staff: db.staff.map((s) => ({
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
        })),
        patients: db.patients,
        queue: db.queue,
        rooms: db.rooms,
        inventory: db.inventory,
        digitalMcs: db.digitalMcs,
        referrals: db.referrals,
        labOrders: db.labOrders,
        portalConfig: db.portalConfig,
        rolePermissions: db.rolePermissions,
        updatedAt: db.updatedAt,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as Partial<ClinicDatabaseState>;
    const updated = saveDatabase(body);
    return jsonResponse({ ok: true, updatedAt: updated.updatedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
