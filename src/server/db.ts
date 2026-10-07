import mysql, { type PoolConnection, type ResultSetHeader } from 'mysql2/promise';
import { readFileSync } from 'node:fs';
import { databaseUrl } from './deployment-config.js';
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  insertId?: number;
}
export interface Database {
  query<T = any>(sql: string, values?: any[]): Promise<QueryResult<T>>;
}
/** Numbered placeholders are bound, never interpolated. RETURNING is application emulation, not MySQL syntax.
 * Inserts select by MySQL auto-increment insertId; updates reread their stable WHERE keys after execution.
 * Version predicates are advanced by one. Callers must keep mutable status predicates out of RETURNING queries.
 * Clinical service writes run inside one connection transaction, so rereads observe their own writes.
 */
const entityIdColumns = new Set([
  'id',
  'tenant_id',
  'branch_id',
  'patient_id',
  'user_id',
  'practitioner_id',
  'actor_id',
  'room_id',
  'encounter_id',
  'queue_ticket_id',
  'item_id',
  'batch_id',
  'dispense_id',
  'usage_id',
  'invoice_id',
  'package_id',
  'sale_invoice_id',
  'entity_id',
  'active_patient_id',
  'occupied_room_id',
  'patient_number',
  'tenant_number',
  'branch_number',
]);
function numericRows<T>(rows: any[]): T[] {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (value !== null && entityIdColumns.has(key)) {
          const number = Number(value);
          if (!Number.isSafeInteger(number) || number <= 0)
            throw new Error('Database identifier exceeds the supported positive integer range.');
          return [key, number];
        }
        return [key, value];
      }),
    ),
  ) as T[];
}
class MysqlDatabase implements Database {
  constructor(private readonly connection: mysql.Pool | PoolConnection) {}
  async query<T = any>(sql: string, values: any[] = []): Promise<QueryResult<T>> {
    const returning = sql.match(/\s+RETURNING\s+(.+)$/i)?.[1];
    if (returning) sql = sql.replace(/\s+RETURNING\s+(.+)$/i, '');
    const table = sql.match(/^\s*INSERT INTO\s+(\w+)\s*\(/i)?.[1];
    const bound: any[] = [];
    sql = sql.replace(/\$(\d+)/g, (_, index) => {
      let value = values[Number(index) - 1] ?? null;
      if (value instanceof Date) value = value.toISOString().slice(0, 23).replace('T', ' ');
      bound.push(value);
      return '?';
    });
    const [result] = await this.connection.query(sql, bound);
    if (Array.isArray(result)) return { rows: numericRows<T>(result), rowCount: result.length };
    const count = (result as ResultSetHeader).affectedRows;
    const insertId = Number((result as ResultSetHeader).insertId || 0);
    if (!Number.isSafeInteger(insertId) || insertId < 0)
      throw new Error('Generated database identifier exceeds the supported integer range.');
    if (returning && count) {
      if (table) {
        const [rows] = await this.connection.query(`SELECT ${returning} FROM ${table} WHERE id=?`, [
          insertId,
        ]);
        return { rows: numericRows<T>(rows as any[]), rowCount: count };
      }
      const update = sql.match(/^\s*UPDATE\s+(\w+)\s+SET/i)?.[1];
      if (update) {
        const where = sql.match(/\bWHERE\b([\s\S]+)$/i)?.[1];
        if (!where) throw new Error('UPDATE RETURNING requires WHERE.');
        const setParams = sql.slice(0, sql.indexOf('WHERE')).split('?').length - 1;
        const selectWhere = where.replace(/\bversion\s*=\s*\?/gi, 'version = ? + 1');
        const [rows] = await this.connection.query(
          `SELECT ${returning} FROM ${update} WHERE ${selectWhere}`,
          bound.slice(setParams),
        );
        return { rows: numericRows<T>(rows as any[]), rowCount: count };
      }
    }
    return { rows: [], rowCount: count, insertId };
  }
}
const url = databaseUrl(process.env.DATABASE_URL || 'mysql://localhost/clinic_dev');
export const rawPool = mysql.createPool({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 100,
  connectTimeout: 5000,
  dateStrings: true,
  timezone: 'Z',
  decimalNumbers: true,
  supportBigNumbers: true,
  ...(process.env.DATABASE_TLS === 'true'
    ? {
        ssl: {
          rejectUnauthorized: true,
          verifyIdentity: true,
          ...(process.env.DATABASE_TLS_CA_FILE
            ? { ca: readFileSync(process.env.DATABASE_TLS_CA_FILE, 'utf8') }
            : {}),
        },
      }
    : {}),
});
export const pool = Object.assign(new MysqlDatabase(rawPool), {
  end: () => rawPool.end(),
  connect: () => rawPool.getConnection(),
});
export async function transaction<T>(work: (db: Database) => Promise<T>): Promise<T> {
  const connection = await rawPool.getConnection();
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    const result = await work(new MysqlDatabase(connection));
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
export async function lock(db: Database, keys: string[]) {
  for (const key of [...new Set(keys)].sort()) {
    await db.query(
      'INSERT INTO resource_locks(lock_key) VALUES($1) ON DUPLICATE KEY UPDATE lock_key=lock_key',
      [key],
    );
    await db.query('SELECT lock_key FROM resource_locks WHERE lock_key=$1 FOR UPDATE', [key]);
  }
}
export { camel } from './serialization.js';
