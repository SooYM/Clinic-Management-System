import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { AuthRouteError } from "../lib/server/supabase-auth";
import { getPostgresAuthenticatedProfile, getPostgresStaffProfile, hashPostgresPassword, hashPostgresToken, isPostgresAuthEnabled, resolvePostgresSession, revokePostgresSession, signInPostgres, verifyPostgresPassword } from "../lib/server/postgres-auth";

const profile = {
  id: "10000000-0000-4000-8000-000000000001", auth_user_id: "00000000-0000-4000-8000-000000000001",
  clinic_id: "c0000000-0000-4000-8000-000000000001", branch_id: "d0000000-0000-4000-8000-000000000001",
  full_name: "Test Manager", role: "manager", license_number: null,
};

function database(responses: object[][]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const pool = { async query(sql: string, params: unknown[]) {
    calls.push({ sql, params });
    assert.ok(responses.length, `Unexpected query: ${sql}`);
    return { rows: responses.shift()! };
  } } as unknown as Pool;
  return { pool, calls };
}

test("PostgreSQL password hashes are salted, bounded, and reject wrong or malformed credentials", async () => {
  const password = "Test-secret-12345";
  const first = await hashPostgresPassword(password);
  const second = await hashPostgresPassword(password);
  assert.notEqual(first, second);
  assert.equal(await verifyPostgresPassword(password, first), true);
  assert.equal(await verifyPostgresPassword("wrong", first), false);
  assert.equal(await verifyPostgresPassword(password, "scrypt$bad$bad"), false);
  assert.equal(await verifyPostgresPassword("x".repeat(1025), first), false);
  await assert.rejects(hashPostgresPassword(""));
  const legacyHash = await hashPostgresPassword("short");
  assert.equal(await verifyPostgresPassword("short", legacyHash), true);
});

test("PostgreSQL sign-in uses normalized identifier and persists only token hashes", async () => {
  const password = "Test-secret-12345";
  const db = database([[{ auth_user_id: profile.auth_user_id, password_hash: await hashPostgresPassword(password) }], [profile], []]);
  const session = await signInPostgres(" ADMIN@CLINIC.LOCAL ", password, db.pool);
  assert.deepEqual(db.calls[0].params, ["admin@clinic.local"]);
  assert.match(db.calls[0].sql, /c.identifier = \$1 OR lower\(u.email\) = \$1 LIMIT 2/);
  assert.equal(session.user.id, profile.auth_user_id);
  assert.equal(session.expires_in, 900);
  assert.deepEqual(db.calls[2].params, [profile.auth_user_id, hashPostgresToken(session.access_token), hashPostgresToken(session.refresh_token)]);
  assert.equal(JSON.stringify(db.calls).includes(password), false);
  assert.equal(JSON.stringify(db.calls).includes(session.access_token), false);
  assert.equal(JSON.stringify(db.calls).includes(session.refresh_token), false);
});

test("PostgreSQL rejects bad passwords and missing accounts without creating sessions", async () => {
  const hash = await hashPostgresPassword("Test-secret-12345");
  const account = { auth_user_id: profile.auth_user_id, password_hash: hash };
  for (const row of [[account], [], [account, account]]) {
    const db = database([row]);
    await assert.rejects(signInPostgres("admin", "wrong", db.pool), (error: unknown) => error instanceof AuthRouteError && error.code === "INVALID_CREDENTIALS");
    assert.equal(db.calls.length, 1);
  }
});

test("PostgreSQL profiles reject inactive, ambiguous, and invalid memberships", async () => {
  for (const [rows, code] of [[[], "STAFF_PROFILE_INACTIVE"], [[profile, profile], "BRANCH_SELECTION_REQUIRED"], [[{ ...profile, role: "owner" }], "STAFF_PROFILE_INVALID"]] as const) {
    const db = database([[...rows]]);
    await assert.rejects(getPostgresStaffProfile(profile.auth_user_id, db.pool), (error: unknown) => error instanceof AuthRouteError && error.code === code);
    assert.match(db.calls[0].sql, /AND active LIMIT 2/);
  }
});

test("PostgreSQL access requires unexpired session and reloads active staff membership", async () => {
  const db = database([[{ auth_user_id: profile.auth_user_id }], [profile]]);
  const session = await resolvePostgresSession("opaque-access", undefined, db.pool);
  assert.deepEqual(session.user, profile);
  assert.equal(session.rotatedTokens, undefined);
  assert.match(db.calls[0].sql, /access_expires_at > now\(\).*refresh_expires_at > now\(\)/);
  assert.deepEqual(db.calls[0].params, [hashPostgresToken("opaque-access")]);
});

test("PostgreSQL refresh rotates both tokens atomically without extending maximum session lifetime", async () => {
  const db = database([[], [{ auth_user_id: profile.auth_user_id }], [profile]]);
  const session = await resolvePostgresSession("expired-access", "valid-refresh", db.pool);
  assert.ok(session.rotatedTokens);
  assert.equal(session.rotatedTokens.user.id, profile.auth_user_id);
  assert.match(db.calls[1].sql, /^UPDATE clinic_auth.sessions/);
  assert.match(db.calls[1].sql, /LEAST\(now\(\) \+ interval '15 minutes', refresh_expires_at\)/);
  assert.match(db.calls[1].sql, /WHERE refresh_token_hash = \$1 AND refresh_expires_at > now\(\) RETURNING auth_user_id/);
  assert.deepEqual(db.calls[1].params, [hashPostgresToken("valid-refresh"), hashPostgresToken(session.accessToken), hashPostgresToken(session.rotatedTokens.refresh_token)]);
});

test("PostgreSQL rejects missing, expired, revoked, or mismatched sessions", async () => {
  await assert.rejects(resolvePostgresSession(undefined, undefined, database([]).pool), (error: unknown) => error instanceof AuthRouteError && error.status === 401);
  await assert.rejects(resolvePostgresSession("expired", "revoked", database([[], []]).pool), (error: unknown) => error instanceof AuthRouteError && error.status === 401);
  await assert.rejects(getPostgresAuthenticatedProfile("access", "different-user", database([[{ auth_user_id: profile.auth_user_id }], [profile]]).pool), (error: unknown) => error instanceof AuthRouteError && error.status === 401);
});

test("PostgreSQL logout deletes server sessions using hashes of either cookie", async () => {
  const db = database([[]]);
  await revokePostgresSession("access", "refresh", db.pool);
  assert.match(db.calls[0].sql, /^DELETE FROM clinic_auth.sessions/);
  assert.deepEqual(db.calls[0].params, [hashPostgresToken("access"), hashPostgresToken("refresh")]);
});

test("PostgreSQL auth activates only through explicit provider selection", () => {
  const previous = process.env.CLINIC_AUTH_PROVIDER;
  try {
    delete process.env.CLINIC_AUTH_PROVIDER;
    assert.equal(isPostgresAuthEnabled(), false);
    process.env.CLINIC_AUTH_PROVIDER = "postgresql";
    assert.equal(isPostgresAuthEnabled(), true);
  } finally {
    if (previous === undefined) delete process.env.CLINIC_AUTH_PROVIDER;
    else process.env.CLINIC_AUTH_PROVIDER = previous;
  }
});
