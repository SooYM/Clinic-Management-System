import "server-only";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { AuthRouteError } from "./supabase-auth";

let pool: Pool | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const connectionString =
      process.env.SUPABASE_DB_URL ||
      process.env.DATABASE_URL ||
      `postgresql://${process.env.POSTGRES_USER || "sooyauming"}@${process.env.POSTGRES_HOST || "localhost"}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB || "clinic_db"}`;

    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("Unexpected error on idle PostgreSQL client", err);
    });
  }

  return pool;
}

export function mapDbError(error: unknown): AuthRouteError | Error {
  if (error instanceof AuthRouteError) return error;
  if (!error || typeof error !== "object") {
    return new AuthRouteError(500, "DB_UNKNOWN", "An unknown database error occurred.");
  }

  const err = error as { code?: string; message?: string; detail?: string };
  const code = err.code ?? "";
  const rawMsg = err.message ?? "Database operation failed.";
  const cleanMsg = rawMsg.replace(/^error:\s*/i, "").trim();

  if (code === "42501") {
    return new AuthRouteError(403, "PERMISSION_DENIED", cleanMsg || "Your clinic role does not have permission for this action.");
  }
  if (code === "P0002") {
    return new AuthRouteError(404, "RECORD_NOT_FOUND", cleanMsg || "The requested clinic record was not found.");
  }
  if (code === "40001") {
    return new AuthRouteError(409, "STALE_RECORD", "This record was changed in another session. Refresh and retry.");
  }
  if (code === "23505" || code === "23P01") {
    return new AuthRouteError(409, "DUPLICATE_KEY", cleanMsg || "A conflicting record or booking already exists.");
  }
  if (code === "23514") {
    return new AuthRouteError(400, "CHECK_VIOLATION", cleanMsg || "The update violates clinical or validation rules.");
  }
  if (code === "22023" || code === "22P02") {
    return new AuthRouteError(400, "INVALID_INPUT", cleanMsg || "Invalid input parameters provided.");
  }

  return new AuthRouteError(502, "DATABASE_ERROR", cleanMsg || "Database request could not be completed.");
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<T>> {
  const p = getDbPool();
  try {
    return await p.query<T>(text, params);
  } catch (error) {
    throw mapDbError(error);
  }
}

export async function withSessionClient<T>(
  authUserId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const p = getDbPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN;");
    if (authUserId) {
      await client.query("SELECT set_config('request.jwt.claim.sub', $1, true);", [authUserId]);
    }
    const result = await fn(client);
    await client.query("COMMIT;");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK;");
    } catch {
      // ignore rollback failure
    }
    throw mapDbError(error);
  } finally {
    client.release();
  }
}

export async function callRpc<T = unknown>(
  authUserId: string | null,
  functionName: string,
  args: unknown[] = [],
): Promise<T> {
  return withSessionClient(authUserId, async (client) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const sql = `SELECT public.${functionName}(${placeholders}) AS result;`;
    const res = await client.query(sql, args);
    return res.rows[0]?.result as T;
  });
}
