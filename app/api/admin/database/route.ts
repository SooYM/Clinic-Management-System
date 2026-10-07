import { NextRequest, NextResponse } from "next/server";
import { AuthRouteError, getAuthenticatedClinicStaff, errorResponse, jsonResponse, setSessionCookies } from "../../../../lib/server/supabase-auth";
import { query } from "../../../../lib/server/db";
import { getDatabase } from "../../../../lib/server/storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      throw new AuthRouteError(403, "FORBIDDEN", "Only clinic administrators can view database tables.");
    }

    const { searchParams } = new URL(request.url);
    const tableName = searchParams.get("table");
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "50", 10), 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    try {
      if (tableName) {
        if (!/^[a-zA-Z0-9_]+$/.test(tableName)) {
          throw new AuthRouteError(400, "INVALID_TABLE", "Invalid table name format.");
        }

        // Get table columns
        const colRes = await query<{ column_name: string; data_type: string; is_nullable: string }>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = $1
           ORDER BY ordinal_position;`,
          [tableName],
        );

        // Get total count
        const countRes = await query<{ count: number }>(
          `SELECT COUNT(*)::int AS count FROM public."${tableName}";`
        );
        const total = countRes.rows[0]?.count ?? 0;

        // Get rows
        const dataRes = await query(
          `SELECT * FROM public."${tableName}" LIMIT $1 OFFSET $2;`,
          [limit, offset],
        );

        const result = jsonResponse({
          ok: true,
          mode: "postgresql",
          table: tableName,
          total,
          limit,
          offset,
          columns: colRes.rows.map((c) => ({
            name: c.column_name,
            type: c.data_type,
            nullable: c.is_nullable === "YES",
          })),
          rows: dataRes.rows,
        });
        return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
      }

      // Fetch list of all public tables
      const tablesRes = await query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name;`
      );

      const tablesWithCounts = await Promise.all(
        tablesRes.rows.map(async (t) => {
          try {
            const cRes = await query<{ count: number }>(
              `SELECT COUNT(*)::int AS count FROM public."${t.table_name}";`
            );
            return { name: t.table_name, count: cRes.rows[0]?.count ?? 0 };
          } catch {
            return { name: t.table_name, count: 0 };
          }
        })
      );

      const result = jsonResponse({
        ok: true,
        mode: "postgresql",
        database: "clinic_db",
        tables: tablesWithCounts,
      });
      return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
    } catch (pgError) {
      // Fallback: If PostgreSQL is unreachable, browse local JSON storage tables
      const db = getDatabase();
      const localTables = [
        { name: "staff", count: db.staff.length },
        { name: "patients", count: db.patients.length },
        { name: "queue", count: db.queue.length },
        { name: "rooms", count: db.rooms.length },
        { name: "inventory", count: db.inventory.length },
        { name: "digitalMcs", count: db.digitalMcs.length },
        { name: "referrals", count: db.referrals.length },
        { name: "labOrders", count: db.labOrders.length },
      ];

      if (tableName) {
        const dataKey = tableName as keyof typeof db;
        const list = Array.isArray(db[dataKey]) ? (db[dataKey] as unknown[]) : [];
        const rows = list.slice(offset, offset + limit);
        const sample = list[0] as Record<string, unknown> | undefined;
        const columns = sample
          ? Object.keys(sample).map((key) => ({
              name: key,
              type: typeof sample[key],
              nullable: true,
            }))
          : [];

        const result = jsonResponse({
          ok: true,
          mode: "local_storage",
          table: tableName,
          total: list.length,
          limit,
          offset,
          columns,
          rows,
        });
        return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
      }

      const result = jsonResponse({
        ok: true,
        mode: "local_storage",
        database: "clinic_database.json",
        tables: localTables,
      });
      return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthenticatedClinicStaff(request);
    if (session.user.role !== "manager") {
      throw new AuthRouteError(403, "FORBIDDEN", "Only clinic administrators can execute database queries.");
    }

    const body = (await request.json()) as { sql?: string };
    const sql = body.sql?.trim();
    if (!sql) {
      throw new AuthRouteError(400, "EMPTY_SQL", "SQL query cannot be empty.");
    }

    // Safety check: block destructive DROP DATABASE
    if (/drop\s+database/i.test(sql)) {
      throw new AuthRouteError(400, "UNSAFE_QUERY", "DROP DATABASE is disabled for safety.");
    }

    const startTime = Date.now();
    const res = await query(sql);
    const durationMs = Date.now() - startTime;

    const columns = res.fields?.map((f) => f.name) || (res.rows[0] ? Object.keys(res.rows[0]) : []);

    const result = jsonResponse({
      ok: true,
      columns,
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
      durationMs,
    });
    return session.rotatedTokens ? setSessionCookies(result, session.rotatedTokens) : result;
  } catch (error) {
    return errorResponse(error);
  }
}
