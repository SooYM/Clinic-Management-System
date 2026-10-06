import { assertSameOrigin, errorResponse, getActiveStaffProfile, jsonResponse, setSessionCookies, signInWithPassword } from "../../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: { code: "INVALID_REQUEST", message: "Send a valid JSON body." } }, 400);
    }
    const payload = (body ?? {}) as Record<string, unknown>;
    const rawIdentifier = (payload.username ?? payload.email ?? payload.identifier ?? "") as string;
    const rawPassword = (payload.password ?? "") as string;
    if (typeof rawIdentifier !== "string" || !rawIdentifier.trim() || typeof rawPassword !== "string" || !rawPassword) {
      return jsonResponse({ ok: false, error: { code: "INVALID_REQUEST", message: "Username/email and password are required." } }, 400);
    }

    const tokens = await signInWithPassword(rawIdentifier.trim(), rawPassword);
    const profile = await getActiveStaffProfile(tokens.access_token, tokens.user.id);
    const response = jsonResponse({ ok: true, user: profile });
    return setSessionCookies(response, tokens);
  } catch (error) {
    return errorResponse(error);
  }
}
