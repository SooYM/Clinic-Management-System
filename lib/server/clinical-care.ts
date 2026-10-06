import "server-only";

import { AuthRouteError, type AuthenticatedClinicStaff } from "./supabase-auth";
import { withSessionClient } from "./db";

export type ClinicalPermission = "encounters.read" | "encounters.write" | "prescriptions.read" | "prescriptions.write";

export async function assertClinicalPermission(session: AuthenticatedClinicStaff, permission: ClinicalPermission) {
  const allowed = await withSessionClient(session.user.auth_user_id, async (client) => {
    const res = await client.query<{ is_allowed: boolean }>(
      `SELECT is_allowed
       FROM public.role_permissions
       WHERE clinic_id = $1 AND branch_id = $2 AND role = $3 AND permission_key = $4
       LIMIT 1;`,
      [session.user.clinic_id, session.user.branch_id, session.user.role, permission],
    );
    return res.rows[0]?.is_allowed === true;
  });

  if (!allowed) {
    throw new AuthRouteError(403, "CLINICAL_PERMISSION_DENIED", "This clinic role does not have permission for that clinical action.");
  }
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function nullableText(value: unknown, maxLength: number, label: string): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > maxLength) {
    throw new AuthRouteError(400, "CLINICAL_DATA_INVALID", `Enter valid ${label} within ${maxLength} characters.`);
  }
  return value.trim() || null;
}
