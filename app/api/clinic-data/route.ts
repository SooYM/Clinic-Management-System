import { NextRequest } from "next/server";
import { getDatabase, saveDatabase, type ClinicDatabaseState } from "../../../lib/server/storage";
import { AuthRouteError, errorResponse, getAuthenticatedClinicStaff, isLocalDemoEnabled, jsonResponse } from "../../../lib/server/supabase-auth";

export const runtime = "nodejs";

const writableFields: Record<string, readonly string[]> = {
  manager: ["patients", "queue", "rooms", "inventory", "digitalMcs", "referrals", "labOrders", "portalConfig", "rolePermissions"],
  doctor: ["queue", "rooms", "inventory", "digitalMcs", "referrals", "labOrders"],
  receptionist: ["patients", "queue", "rooms"],
  nurse: ["queue", "rooms", "inventory"],
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (!isLocalDemoEnabled()) {
      throw new AuthRouteError(403, "FORBIDDEN", "Local clinic data requires local demo mode.");
    }
    const db = getDatabase();
    return jsonResponse({
      ok: true,
      data: {
        staff: session.user.role === "manager" ? db.staff.map((s) => ({
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
        })) : [],
        patients: db.patients.map((patient) => ({ ...patient, nric: "" })),
        queue: db.queue,
        rooms: db.rooms,
        inventory: db.inventory,
        digitalMcs: ["doctor", "manager"].includes(session.user.role) ? db.digitalMcs : [],
        referrals: ["doctor", "manager"].includes(session.user.role) ? db.referrals : [],
        labOrders: ["doctor", "manager"].includes(session.user.role) ? db.labOrders : [],
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
    const session = await getAuthenticatedClinicStaff(request);
    if (!isLocalDemoEnabled()) {
      throw new AuthRouteError(403, "FORBIDDEN", "Local clinic data requires local demo mode.");
    }
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new AuthRouteError(400, "INVALID_INPUT", "Provide a clinic data object.");
    }
    const allowedFields = new Set(writableFields[session.user.role] ?? []);
    for (const [key, value] of Object.entries(body)) {
      if (!allowedFields.has(key)) {
        throw new AuthRouteError(403, "FORBIDDEN", "Your clinic role cannot update these fields.");
      }
      if (key === "portalConfig" || key === "rolePermissions"
        ? !value || typeof value !== "object" || Array.isArray(value)
        : !Array.isArray(value) || value.length > 5000 || value.some((item) => !item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !item.id)) {
        throw new AuthRouteError(400, "INVALID_INPUT", "Provide valid clinic data fields; staff credentials cannot be updated here.");
      }
      if (key === "portalConfig" && Object.entries(value as object).some(([field, item]) =>
        !["portalName", "portalTagline", "legalEntityName", "branchName", "addressLine", "customDuitNowQrImage"].includes(field) || typeof item !== "string")) {
        throw new AuthRouteError(400, "INVALID_INPUT", "Provide valid portal settings.");
      }
      if (key === "rolePermissions" && Object.entries(value as object).some(([role, permissions]) =>
        !Object.hasOwn(writableFields, role) || !Array.isArray(permissions) || permissions.some((permission) => typeof permission !== "string"))) {
        throw new AuthRouteError(400, "INVALID_INPUT", "Provide valid role permissions.");
      }
    }
    const updated = saveDatabase(body as Partial<ClinicDatabaseState>);
    return jsonResponse({ ok: true, updatedAt: updated.updatedAt });
  } catch (error) {
    return errorResponse(error);
  }
}
