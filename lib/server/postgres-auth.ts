import "server-only";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { getDbPool } from "./db";
import { AuthRouteError, type StaffSessionUser, type SupabaseSessionTokens, type AuthenticatedClinicStaff } from "./supabase-auth";

const ACCESS_SECONDS = 900;
const roles = new Set(["doctor", "receptionist", "nurse", "manager"]);

export function isPostgresAuthEnabled(): boolean {
  return process.env.CLINIC_AUTH_PROVIDER === "postgresql";
}

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
}

export async function hashPostgresPassword(password: string): Promise<string> {
  // Migration preserves existing passwords; account provisioning enforces its own strength rules.
  if (!password || Buffer.byteLength(password) > 1024) throw new Error("Password must contain 1 to 1024 bytes.");
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPostgresPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (Buffer.byteLength(password) > 1024 || parts.length !== 3 || parts[0] !== "scrypt" || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  return timingSafeEqual(await derive(password, parts[1]), Buffer.from(parts[2], "hex"));
}

export function hashPostgresToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokens(userId: string): SupabaseSessionTokens {
  return { access_token: `cms_pg_${randomBytes(32).toString("hex")}`, refresh_token: `cms_pg_refresh_${randomBytes(32).toString("hex")}`, expires_in: ACCESS_SECONDS, user: { id: userId } };
}

export async function getPostgresStaffProfile(userId: string, pool: Pool = getDbPool()): Promise<StaffSessionUser> {
  const result = await pool.query<StaffSessionUser>(
    "SELECT id, auth_user_id, clinic_id, branch_id, full_name, role, license_number FROM public.staff_members WHERE auth_user_id = $1 AND active LIMIT 2", [userId]);
  if (result.rows.length > 1) throw new AuthRouteError(409, "BRANCH_SELECTION_REQUIRED", "This account has access to multiple branches. Select a branch before continuing.");
  const profile = result.rows[0];
  if (!profile) throw new AuthRouteError(403, "STAFF_PROFILE_INACTIVE", "No active clinic staff profile is linked to this account.");
  if (!roles.has(profile.role) || !profile.id || !profile.auth_user_id || !profile.clinic_id || !profile.branch_id || !profile.full_name) throw new AuthRouteError(403, "STAFF_PROFILE_INVALID", "The linked clinic staff profile is incomplete.");
  return profile;
}

export async function signInPostgres(identifier: string, password: string, pool: Pool = getDbPool()): Promise<SupabaseSessionTokens> {
  const result = await pool.query<{ auth_user_id: string; password_hash: string }>(
    "SELECT c.auth_user_id, c.password_hash FROM clinic_auth.credentials c JOIN auth.users u ON u.id = c.auth_user_id WHERE c.identifier = $1 OR lower(u.email) = $1 LIMIT 2", [identifier.trim().toLowerCase()]);
  const account = result.rows.length === 1 ? result.rows[0] : undefined;
  // Equal-cost hashing for unknown accounts avoids exposing identifier existence.
  const valid = await verifyPostgresPassword(password, account?.password_hash ?? `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`);
  if (!account || !valid) throw new AuthRouteError(401, "INVALID_CREDENTIALS", "Username/email or password is incorrect.");
  await getPostgresStaffProfile(account.auth_user_id, pool);
  const session = tokens(account.auth_user_id);
  await pool.query("INSERT INTO clinic_auth.sessions (auth_user_id, access_token_hash, refresh_token_hash, access_expires_at, refresh_expires_at) VALUES ($1, $2, $3, now() + interval '15 minutes', now() + interval '7 days')", [account.auth_user_id, hashPostgresToken(session.access_token), hashPostgresToken(session.refresh_token)]);
  return session;
}

export async function resolvePostgresSession(accessToken?: string, refreshToken?: string, pool: Pool = getDbPool()): Promise<AuthenticatedClinicStaff> {
  if (accessToken) {
    const result = await pool.query<{ auth_user_id: string }>("SELECT auth_user_id FROM clinic_auth.sessions WHERE access_token_hash = $1 AND access_expires_at > now() AND refresh_expires_at > now()", [hashPostgresToken(accessToken)]);
    if (result.rows[0]) return { accessToken, user: await getPostgresStaffProfile(result.rows[0].auth_user_id, pool) };
  }
  if (refreshToken) {
    const next = tokens("");
    // One atomic update rotates both tokens; concurrent refreshes cannot reuse the old token.
    const result = await pool.query<{ auth_user_id: string }>("UPDATE clinic_auth.sessions SET access_token_hash = $2, refresh_token_hash = $3, access_expires_at = LEAST(now() + interval '15 minutes', refresh_expires_at) WHERE refresh_token_hash = $1 AND refresh_expires_at > now() RETURNING auth_user_id", [hashPostgresToken(refreshToken), hashPostgresToken(next.access_token), hashPostgresToken(next.refresh_token)]);
    if (result.rows[0]) {
      next.user.id = result.rows[0].auth_user_id;
      return { accessToken: next.access_token, user: await getPostgresStaffProfile(next.user.id, pool), rotatedTokens: next };
    }
  }
  throw new AuthRouteError(401, "UNAUTHENTICATED", "Sign in to continue.");
}

export async function getPostgresAuthenticatedProfile(accessToken: string, userId: string, pool: Pool = getDbPool()): Promise<StaffSessionUser> {
  const session = await resolvePostgresSession(accessToken, undefined, pool);
  if (session.user.auth_user_id !== userId) throw new AuthRouteError(401, "UNAUTHENTICATED", "Sign in to continue.");
  return session.user;
}

export async function revokePostgresSession(accessToken?: string, refreshToken?: string, pool: Pool = getDbPool()): Promise<void> {
  await pool.query("DELETE FROM clinic_auth.sessions WHERE access_token_hash = $1 OR refresh_token_hash = $2", [accessToken ? hashPostgresToken(accessToken) : null, refreshToken ? hashPostgresToken(refreshToken) : null]);
}
