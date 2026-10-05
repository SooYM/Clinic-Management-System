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
    const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || !email.trim() || typeof password !== "string" || !password) {
      return jsonResponse({ ok: false, error: { code: "INVALID_REQUEST", message: "Email and password are required." } }, 400);
    }

    const tokens = await signInWithPassword(email.trim(), password);
    const profile = await getActiveStaffProfile(tokens.access_token, tokens.user.id);
    const response = jsonResponse({ ok: true, user: profile });
    return setSessionCookies(response, tokens);
  } catch (error) {
    return errorResponse(error);
  }
}
