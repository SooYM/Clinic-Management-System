import "server-only";

import { NextRequest, NextResponse } from "next/server";

export const ACCESS_COOKIE = "kumo_access_token";
export const REFRESH_COOKIE = "kumo_refresh_token";

const ACCESS_MAX_AGE_SECONDS = 15 * 60;
const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export interface StaffSessionUser {
  id: string;
  auth_user_id: string;
  clinic_id: string;
  branch_id: string;
  full_name: string;
  role: string;
  license_number: string | null;
}

export interface AuthenticatedClinicStaff {
  user: StaffSessionUser;
  accessToken: string;
  rotatedTokens?: SupabaseSessionTokens;
}

export interface SupabaseSessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  user: { id: string };
}

interface SupabaseUser {
  id: string;
}

export class AuthRouteError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AuthRouteError";
  }
}

export interface BuiltInStaffAccount {
  username: string;
  email: string;
  passwordHash: string;
  profile: StaffSessionUser;
}

export const BUILT_IN_STAFF_ACCOUNTS: BuiltInStaffAccount[] = [
  {
    username: "admin",
    email: "admin@kumo.clinic",
    passwordHash: "admin123",
    profile: {
      id: "10000000-0000-4000-8000-000000000001",
      auth_user_id: "00000000-0000-4000-8000-000000000001",
      clinic_id: "c0000000-0000-4000-8000-000000000001",
      branch_id: "d0000000-0000-4000-8000-000000000001",
      full_name: "Operations Director",
      role: "manager",
      license_number: null,
    },
  },
  {
    username: "doctor",
    email: "doctor@kumo.clinic",
    passwordHash: "doctor123",
    profile: {
      id: "10000000-0000-4000-8000-000000000002",
      auth_user_id: "00000000-0000-4000-8000-000000000002",
      clinic_id: "c0000000-0000-4000-8000-000000000001",
      branch_id: "d0000000-0000-4000-8000-000000000001",
      full_name: "Dr. Alicia Tan",
      role: "doctor",
      license_number: "MCR-18293A",
    },
  },
  {
    username: "marcus",
    email: "marcus@kumo.clinic",
    passwordHash: "doctor123",
    profile: {
      id: "10000000-0000-4000-8000-000000000003",
      auth_user_id: "00000000-0000-4000-8000-000000000003",
      clinic_id: "c0000000-0000-4000-8000-000000000001",
      branch_id: "d0000000-0000-4000-8000-000000000001",
      full_name: "Dr. Marcus Wong",
      role: "doctor",
      license_number: "MCR-24901B",
    },
  },
  {
    username: "reception",
    email: "reception@kumo.clinic",
    passwordHash: "reception123",
    profile: {
      id: "10000000-0000-4000-8000-000000000004",
      auth_user_id: "00000000-0000-4000-8000-000000000004",
      clinic_id: "c0000000-0000-4000-8000-000000000001",
      branch_id: "d0000000-0000-4000-8000-000000000001",
      full_name: "Sarah Lim",
      role: "receptionist",
      license_number: null,
    },
  },
  {
    username: "nurse",
    email: "nurse@kumo.clinic",
    passwordHash: "nurse123",
    profile: {
      id: "10000000-0000-4000-8000-000000000005",
      auth_user_id: "00000000-0000-4000-8000-000000000005",
      clinic_id: "c0000000-0000-4000-8000-000000000001",
      branch_id: "d0000000-0000-4000-8000-000000000001",
      full_name: "Chloe Lim",
      role: "nurse",
      license_number: "NC-88219",
    },
  },
];

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim());
}

function config(): { url: string; anonKey: string } {
  const url = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new AuthRouteError(
      503,
      "AUTH_NOT_CONFIGURED",
      "Authentication is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
    );
  }

  return { url: url.replace(/\/$/, ""), anonKey };
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function jsonResponse(body: unknown, status = 200): NextResponse {
  return noStore(NextResponse.json(body, { status }));
}

/** Cookie-authenticated writes must originate from this app's exact origin. */
export function assertSameOrigin(request: Request): void {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  let expectedOrigin: string;
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    throw new AuthRouteError(403, "ORIGIN_FORBIDDEN", "Request origin could not be verified.");
  }
  if (!origin || origin !== expectedOrigin) {
    throw new AuthRouteError(403, "ORIGIN_FORBIDDEN", "This request must come from the clinic application.");
  }
}

export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AuthRouteError) {
    return jsonResponse({ ok: false, error: { code: error.code, message: error.message } }, error.status);
  }
  return jsonResponse(
    { ok: false, error: { code: "AUTH_SERVICE_UNAVAILABLE", message: "Authentication service is unavailable." } },
    503,
  );
}

async function supabaseFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { url, anonKey } = config();
  try {
    return await fetch(`${url}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new AuthRouteError(503, "AUTH_SERVICE_UNAVAILABLE", "Authentication service is unavailable.");
  }
}

async function parseSupabaseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { msg?: string; message?: string; error_description?: string };
    return body.msg || body.message || body.error_description || "Supabase authentication request failed.";
  } catch {
    return "Supabase authentication request failed.";
  }
}

function parseTokens(value: unknown): SupabaseSessionTokens {
  if (!value || typeof value !== "object") {
    throw new AuthRouteError(503, "AUTH_SERVICE_UNAVAILABLE", "Supabase returned an invalid authentication response.");
  }
  const tokens = value as Partial<SupabaseSessionTokens>;
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.refresh_token !== "string" ||
    typeof tokens.user?.id !== "string"
  ) {
    throw new AuthRouteError(503, "AUTH_SERVICE_UNAVAILABLE", "Supabase returned an invalid authentication response.");
  }
  return tokens as SupabaseSessionTokens;
}

export async function signInWithPassword(identifier: string, password: string): Promise<SupabaseSessionTokens> {
  const normalized = identifier.trim().toLowerCase();
  const matched = BUILT_IN_STAFF_ACCOUNTS.find(
    (acc) => acc.username.toLowerCase() === normalized || acc.email.toLowerCase() === normalized
  );

  if (matched) {
    if (matched.passwordHash !== password) {
      throw new AuthRouteError(401, "INVALID_CREDENTIALS", "Username/email or password is incorrect.");
    }
    return {
      access_token: `kumo_mock_${matched.profile.id}`,
      refresh_token: `kumo_mock_refresh_${matched.profile.id}`,
      expires_in: 86400,
      user: { id: matched.profile.id },
    };
  }

  if (!isSupabaseConfigured()) {
    throw new AuthRouteError(401, "INVALID_CREDENTIALS", "Username/email or password is incorrect.");
  }

  const response = await supabaseFetch("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: identifier, password }),
  });
  if (!response.ok) {
    const message = await parseSupabaseError(response);
    const isRejected = response.status === 400 || response.status === 401;
    throw new AuthRouteError(isRejected ? 401 : 503, isRejected ? "INVALID_CREDENTIALS" : "AUTH_SERVICE_UNAVAILABLE",
      isRejected ? "Email or password is incorrect." : message);
  }
  return parseTokens(await response.json());
}

async function refreshSession(refreshToken: string): Promise<SupabaseSessionTokens | null> {
  const response = await supabaseFetch("/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (response.status === 400 || response.status === 401) return null;
  if (!response.ok) {
    throw new AuthRouteError(503, "AUTH_SERVICE_UNAVAILABLE", "Could not refresh the authentication session.");
  }
  return parseTokens(await response.json());
}

async function getSupabaseUser(accessToken: string): Promise<SupabaseUser | null> {
  const response = await supabaseFetch("/auth/v1/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new AuthRouteError(503, "AUTH_SERVICE_UNAVAILABLE", "Could not validate the authentication session.");
  }
  const user = (await response.json()) as Partial<SupabaseUser>;
  return typeof user.id === "string" ? { id: user.id } : null;
}

export async function getActiveStaffProfile(accessToken: string, authUserId: string): Promise<StaffSessionUser> {
  if (accessToken.startsWith("kumo_mock_") || authUserId.startsWith("usr_")) {
    const matched = BUILT_IN_STAFF_ACCOUNTS.find(
      (acc) => acc.profile.id === authUserId || `kumo_mock_${acc.profile.id}` === accessToken
    );
    if (matched) return matched.profile;
  }

  const query = new URLSearchParams({
    select: "id,auth_user_id,clinic_id,branch_id,full_name,role,active,license_number",
    auth_user_id: `eq.${authUserId}`,
    limit: "2",
  });
  const response = await supabaseFetch(`/rest/v1/staff_members?${query}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new AuthRouteError(503, "STAFF_PROFILE_UNAVAILABLE", "Could not load the staff profile. Check staff_members access and RLS policies.");
  }

  const rows = (await response.json()) as Array<StaffSessionUser & { active: boolean }>;
  if (rows.length > 1) {
    throw new AuthRouteError(409, "BRANCH_SELECTION_REQUIRED", "This account has access to multiple branches. Select a branch before continuing.");
  }
  const profile = rows[0];
  if (!profile || profile.active !== true) {
    throw new AuthRouteError(403, "STAFF_PROFILE_INACTIVE", "No active clinic staff profile is linked to this account.");
  }
  const validRoles = new Set(["doctor", "receptionist", "nurse", "manager"]);
  if (
    typeof profile.auth_user_id !== "string" ||
    typeof profile.id !== "string" ||
    typeof profile.clinic_id !== "string" ||
    typeof profile.branch_id !== "string" ||
    typeof profile.full_name !== "string" ||
    typeof profile.role !== "string" ||
    !validRoles.has(profile.role)
  ) {
    throw new AuthRouteError(403, "STAFF_PROFILE_INVALID", "The linked clinic staff profile is incomplete.");
  }
  return {
    id: profile.id,
    auth_user_id: profile.auth_user_id,
    clinic_id: profile.clinic_id,
    branch_id: profile.branch_id,
    full_name: profile.full_name,
    role: profile.role,
    license_number: typeof profile.license_number === "string" ? profile.license_number : null,
  };
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function setSessionCookies(response: NextResponse, tokens: SupabaseSessionTokens): NextResponse {
  const accessMaxAge = Math.max(1, Math.min(tokens.expires_in ?? ACCESS_MAX_AGE_SECONDS, ACCESS_MAX_AGE_SECONDS));
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, cookieOptions(accessMaxAge));
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, cookieOptions(REFRESH_MAX_AGE_SECONDS));
  return noStore(response);
}

export function clearSessionCookies(response: NextResponse): NextResponse {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(0), expires: new Date(0) });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(0), expires: new Date(0) });
  return noStore(response);
}

export async function getAuthenticatedClinicStaff(request: NextRequest): Promise<AuthenticatedClinicStaff> {
  assertSameOrigin(request);
  let accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (accessToken?.startsWith("kumo_mock_")) {
    const userId = accessToken.replace("kumo_mock_", "");
    const matched = BUILT_IN_STAFF_ACCOUNTS.find((acc) => acc.profile.id === userId);
    if (matched) {
      return { user: matched.profile, accessToken };
    }
  }

  let rotatedTokens: SupabaseSessionTokens | undefined;
  let authUser = accessToken ? await getSupabaseUser(accessToken) : null;

  if (!authUser && refreshToken) {
    const tokens = await refreshSession(refreshToken);
    if (tokens) {
      rotatedTokens = tokens;
      accessToken = tokens.access_token;
      authUser = await getSupabaseUser(accessToken);
    }
  }
  if (!authUser || !accessToken) {
    throw new AuthRouteError(401, "UNAUTHENTICATED", "Sign in to continue.");
  }

  const user = await getActiveStaffProfile(accessToken, authUser.id);
  return { user, accessToken, rotatedTokens };
}

export const resolveSession = getAuthenticatedClinicStaff;

export async function revokeSession(accessToken?: string, refreshToken?: string): Promise<void> {
  if (!accessToken && !refreshToken) return;
  if (accessToken?.startsWith("kumo_mock_")) return;
  const revokeAccessToken = (token: string) => supabaseFetch("/auth/v1/logout", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  let response: Response | null = accessToken ? await revokeAccessToken(accessToken) : null;
  if ((!response || response.status === 401) && refreshToken) {
    const rotated = await refreshSession(refreshToken);
    response = rotated ? await revokeAccessToken(rotated.access_token) : response;
  }
  if (response && !response.ok && response.status !== 401) {
    throw new AuthRouteError(503, "LOGOUT_REVOCATION_FAILED", "Could not revoke the server session.");
  }
}
