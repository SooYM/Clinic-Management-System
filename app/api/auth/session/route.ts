import { NextRequest } from "next/server";
import { clearSessionCookies, errorResponse, jsonResponse, resolveSession, setSessionCookies } from "../../../../lib/server/supabase-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await resolveSession(request);
    const response = jsonResponse({ ok: true, user: session.user });
    return session.rotatedTokens ? setSessionCookies(response, session.rotatedTokens) : response;
  } catch (error) {
    const response = errorResponse(error);
    if (response.status === 401 || response.status === 403) return clearSessionCookies(response);
    return response;
  }
}
