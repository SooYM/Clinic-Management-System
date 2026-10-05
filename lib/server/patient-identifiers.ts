import "server-only";
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { AuthRouteError } from "./supabase-auth";

function key(name: string): Buffer {
  const raw = process.env[name]?.trim();
  if (!raw) throw new AuthRouteError(503, "PATIENT_ENCRYPTION_NOT_CONFIGURED", "Patient identifier encryption is not configured.");
  const value = /^[a-f\d]+$/i.test(raw) && raw.length === 64 ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (value.length !== 32) throw new AuthRouteError(503, "PATIENT_ENCRYPTION_NOT_CONFIGURED", `${name} must encode exactly 32 bytes.`);
  return value;
}

export function encryptPatientNationalId(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key("PATIENT_NRIC_ENCRYPTION_KEY"), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptPatientNationalId(value: string): string {
  const [ivPart, tagPart, ciphertextPart] = value.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) throw new Error("Invalid encrypted identifier format");
  const decipher = createDecipheriv("aes-256-gcm", key("PATIENT_NRIC_ENCRYPTION_KEY"), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}

export function hashPatientNationalId(value: string): string {
  return createHmac("sha256", key("PATIENT_NRIC_HASH_KEY")).update(value).digest("hex");
}
