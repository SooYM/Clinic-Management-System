import { NextRequest } from "next/server";
import { ACCESS_COOKIE, REFRESH_COOKIE, assertSameOrigin, clearSessionCookies, errorResponse, jsonResponse, revokeSession } from "../../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return errorResponse(error);
  }
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  try {
    await revokeSession(accessToken, refreshToken);
    return clearSessionCookies(jsonResponse({ ok: true }));
  } catch {
    // Always clear browser credentials even if the upstream revocation service is unavailable.
    return clearSessionCookies(jsonResponse({
      ok: false,
      error: { code: "LOGOUT_REVOCATION_FAILED", message: "Local session cleared; server revocation could not be confirmed." },
    }, 503));
  }
}
