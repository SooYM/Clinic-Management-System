import { AuthRouteError, type AuthenticatedClinicStaff, jsonResponse, setSessionCookies } from "./supabase-auth";
import { callRpc } from "./db";

export async function requireSchedulingPermission(
  session: AuthenticatedClinicStaff,
  permission: string,
): Promise<void> {
  const allowed = await callRpc<boolean>(session.user.auth_user_id, "has_branch_permission", [
    session.user.clinic_id,
    session.user.branch_id,
    permission,
  ]);
  if (allowed !== true) {
    throw new AuthRouteError(403, "PERMISSION_DENIED", "Your clinic role does not have permission for this action.");
  }
}

export function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseInstant(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function sessionResponse(session: AuthenticatedClinicStaff, body: unknown, status = 200) {
  const response = jsonResponse(body, status);
  return session.rotatedTokens ? setSessionCookies(response, session.rotatedTokens) : response;
}

export function requireText(value: unknown, label: string, max: number, optional = false): string | null {
  if (value === undefined || value === null || value === "") {
    if (optional) return null;
    throw new AuthRouteError(400, "INVALID_INPUT", `${label} is required.`);
  }
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    throw new AuthRouteError(400, "INVALID_INPUT", `${label} must be a non-empty value of at most ${max} characters.`);
  }
  return value.trim();
}
