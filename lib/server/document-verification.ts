import "server-only";
import { createHash, createHmac } from "node:crypto";
import { AuthRouteError } from "./supabase-auth";

function signingKey(): Buffer {
  const raw = process.env.DOCUMENT_QR_SIGNING_KEY?.trim();
  if (!raw) throw new AuthRouteError(503, "DOCUMENT_QR_NOT_CONFIGURED", "Document verification signing is not configured.");
  const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new AuthRouteError(503, "DOCUMENT_QR_NOT_CONFIGURED", "DOCUMENT_QR_SIGNING_KEY must encode 32 bytes.");
  return key;
}

/** Prefer a trusted deployment URL so an untrusted Host header cannot forge QR destinations. */
export function documentVerificationOrigin(requestOrigin: string): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new AuthRouteError(503, "APP_BASE_URL_NOT_CONFIGURED", "The clinic public URL is not configured.");
    }
    return new URL(requestOrigin).origin;
  }
  let parsed: URL;
  try { parsed = new URL(configured); }
  catch { throw new AuthRouteError(503, "APP_BASE_URL_INVALID", "APP_BASE_URL must be an absolute URL."); }
  if (parsed.protocol !== "https:" && process.env.NODE_ENV === "production" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new AuthRouteError(503, "APP_BASE_URL_INVALID", "APP_BASE_URL must use HTTPS in production.");
  }
  return parsed.origin;
}

/** Derive a version-scoped opaque token; only its SHA-256 digest is persisted. */
export function documentVerificationToken(documentId: string, version: number): string {
  return createHmac("sha256", signingKey())
    .update("clinic-document-verification:v1:" + documentId + ":" + version)
    .digest("base64url");
}

export function documentVerificationDigest(token: string): string {
  return "\\x" + createHash("sha256").update(token, "utf8").digest("hex");
}

export function documentVerificationUrl(origin: string, documentId: string, version: number): string {
  const url = new URL("/api/document-verification", origin);
  url.searchParams.set("token", documentVerificationToken(documentId, version));
  return url.toString();
}
