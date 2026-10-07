import 'dotenv/config';
import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createPool, escapeId, type RowDataPacket } from 'mysql2/promise';

/** Local inspection utility. Uses its own SELECT-only account, never the application connection. */
const password = process.env.DB_VIEWER_PASSWORD;
const connectionUrl = process.env.DB_VIEWER_DATABASE_URL;
if (!password) throw new Error('DB_VIEWER_PASSWORD is required.');
if (!connectionUrl) throw new Error('DB_VIEWER_DATABASE_URL is required.');
const parsed = new URL(connectionUrl);
if (
  parsed.protocol !== 'mysql:' ||
  !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname)
) {
  throw new Error('DB_VIEWER_DATABASE_URL must point to a loopback MySQL server.');
}
const database = decodeURIComponent(parsed.pathname.slice(1));
if (!database || database.includes('/'))
  throw new Error('A database name is required in DB_VIEWER_DATABASE_URL.');
const port = Number(process.env.DB_VIEWER_PORT || 3002);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('DB_VIEWER_PORT must be a valid port.');
const pool = createPool({
  host: parsed.hostname.replace(/^\[|\]$/g, ''),
  port: Number(parsed.port || 3306),
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
  database,
  connectionLimit: 2,
  supportBigNumbers: true,
  bigNumberStrings: true,
  dateStrings: true,
  multipleStatements: false,
});
let tables = new Set<string>();
async function refreshTables() {
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
    [database, 'BASE TABLE'],
  );
  tables = new Set(rows.map((row) => String(row.name)));
}
await refreshTables();
const expected = createHash('sha256').update(`clinic_viewer:${password}`).digest();
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  const header = req.headers.authorization || '';
  const supplied = header.startsWith('Basic ')
    ? Buffer.from(header.slice(6), 'base64').toString('utf8')
    : '';
  const actual = createHash('sha256').update(supplied).digest();
  if (!supplied || !timingSafeEqual(expected, actual)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Local clinic database", charset="UTF-8"');
    res.status(401).type('text').send('Sign in with the local database viewer account.');
    return;
  }
  next();
});

function safeValue(value: unknown): unknown {
  if (Buffer.isBuffer(value))
    return { binary: true, bytes: value.length, base64: value.toString('base64') };
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(safeValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, safeValue(entry)]));
  return value;
}
function pageNumber(value: unknown, fallback: number, maximum: number): number | undefined {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 && number <= maximum ? number : undefined;
}

app.get('/api/tables', async (_req, res, next) => {
  try {
    await refreshTables();
    const result = [];
    for (const name of tables) {
      const [counts] = await pool.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS rowCount FROM ${escapeId(name)}`,
      );
      result.push({ name, rowCount: counts[0].rowCount });
    }
    res.json({ tables: result });
  } catch (error) {
    next(error);
  }
});
app.get('/api/tables/:table', async (req, res, next) => {
  const name = req.params.table;
  if (!tables.has(name)) {
    res.status(404).json({ error: 'Table not found. Refresh the table list.' });
    return;
  }
  const offset = pageNumber(req.query.offset, 0, Number.MAX_SAFE_INTEGER);
  const limit = pageNumber(req.query.limit, 50, 200);
  if (offset === undefined || limit === undefined || limit < 1) {
    res
      .status(400)
      .json({ error: 'Offset must be a non-negative integer. Limit must be between 1 and 200.' });
    return;
  }
  try {
    const [columns] = await pool.query<RowDataPacket[]>(
      'SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable, COLUMN_KEY AS columnKey FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION',
      [database, name],
    );
    // Stable pagination uses primary keys where the schema supplies them.
    const primaryKeys = columns
      .filter((column) => column.columnKey === 'PRI')
      .map((column) => escapeId(String(column.name)));
    const order = primaryKeys.length ? ` ORDER BY ${primaryKeys.join(', ')}` : '';
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT * FROM ${escapeId(name)}${order} LIMIT ? OFFSET ?`,
      [limit, offset],
    );
    const [counts] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM ${escapeId(name)}`,
    );
    res.json({
      table: name,
      columns,
      rows: safeValue(rows),
      total: counts[0].total,
      offset,
      limit,
    });
  } catch (error) {
    next(error);
  }
});
app.get('/', (_req, res) => {
  const nonce = randomBytes(18).toString('base64');
  res.setHeader(
    'Content-Security-Policy',
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  res.type('html').send(html.replaceAll('__NONCE__', nonce));
});
app.use((_req, res) => {
  res.status(404).type('text').send('Not found.');
});
app.use(
  (_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({
      error: 'Database read failed. Check the viewer account permissions and local MySQL service.',
    });
  },
);

const html = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Clinic database viewer</title>
<style nonce="__NONCE__">
*{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#0f172a;font:14px/1.5 "Segoe UI",system-ui,sans-serif}main{padding:32px;max-width:1800px;margin:auto}h1{font-size:27px;letter-spacing:-.025em;margin:0 0 7px}p{color:#475569;margin:0 0 24px}.toolbar{display:flex;gap:18px;align-items:end;flex-wrap:wrap;margin-bottom:24px}label{display:flex;flex-direction:column;gap:6px;font-weight:600}select,button{font:inherit;border:1px solid #cbd5e1;border-radius:7px;padding:9px 12px;min-height:42px;background:white;color:#0f172a}select{min-width:240px}button{cursor:pointer;background:#2563eb;border-color:#2563eb;color:white;font-weight:600}button.secondary{background:white;color:#334155}button:disabled{opacity:.5;cursor:not-allowed}:focus-visible{outline:3px solid #2563eb;outline-offset:3px}.table-wrap{overflow:auto;background:white;border:1px solid #e2e8f0;border-radius:10px;max-height:70vh}table{border-collapse:collapse;width:100%;text-align:left;font-variant-numeric:tabular-nums}th{position:sticky;top:0;background:#eff6ff;z-index:1;font-size:12px;padding:14px;color:#1e40af;vertical-align:top}th small{display:block;font-weight:400;margin-top:4px;color:#475569}td{padding:12px 14px;border-top:1px solid #e2e8f0;max-width:420px;min-width:140px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap;font-size:12px}td.null{color:#64748b;font-style:italic}.pagination{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:20px}.pagination>div{display:flex;gap:10px}#status{margin:0;color:#475569}#error{padding:14px;border-radius:8px;background:#fef2f2;color:#991b1b;margin-bottom:20px}#empty{padding:40px;text-align:center}.scope{font-size:12px;color:#64748b}@media(max-width:600px){main{padding:20px 14px}.toolbar label,.toolbar select{width:100%}.pagination{align-items:start;flex-direction:column}h1{font-size:24px}}
</style></head><body><main><h1>Clinic database viewer</h1><p>Read tables and inspect stored records in your local MySQL database.</p>
<div class="toolbar"><label>Database table<select id="tables"><option value="">Loading tables…</option></select></label><label>Rows per page<select id="limit"><option>25</option><option selected>50</option><option>100</option><option>200</option></select></label><button id="refresh" class="secondary">Refresh table list</button></div>
<div id="error" role="alert" hidden></div><div class="table-wrap" aria-label="Database records"><table id="records"><thead></thead><tbody></tbody></table><div id="empty">Choose a table to inspect its records.</div></div>
<div class="pagination"><p id="status" role="status" aria-live="polite">Connecting to local database…</p><div><button id="previous" class="secondary" disabled>Previous page</button><button id="next" class="secondary" disabled>Next page</button></div></div><p class="scope">Read-only local access. Binary fields show byte count and base64; JSON fields show their stored contents.</p></main>
<script nonce="__NONCE__">
'use strict';
const tableSelect=document.getElementById('tables'),limitSelect=document.getElementById('limit'),records=document.getElementById('records'),status=document.getElementById('status'),error=document.getElementById('error'),empty=document.getElementById('empty'),previous=document.getElementById('previous'),next=document.getElementById('next'),refresh=document.getElementById('refresh');
let offset=0,total=0,busy=false,requestVersion=0;
function showError(message){error.textContent=message;error.hidden=false;}
function setBusy(value){busy=value;tableSelect.disabled=value;limitSelect.disabled=value;refresh.disabled=value;previous.disabled=value||offset===0;next.disabled=value||offset+Number(limitSelect.value)>=Number(total);}
async function read(path){const response=await fetch(path,{credentials:'same-origin',cache:'no-store'});const data=await response.json().catch(()=>({error:'Sign in again or check the local viewer service.'}));if(!response.ok)throw new Error(data.error||'Could not read the database.');return data;}
function render(page){const head=records.tHead,body=records.tBodies[0];head.replaceChildren();body.replaceChildren();const row=document.createElement('tr');page.columns.forEach(column=>{const th=document.createElement('th');th.scope='col';th.textContent=column.name;const type=document.createElement('small');type.textContent=column.columnType+(column.columnKey==='PRI'?' · primary key':'');th.append(type);row.append(th);});head.append(row);page.rows.forEach(record=>{const tr=document.createElement('tr');page.columns.forEach(column=>{const td=document.createElement('td'),value=record[column.name];if(value===null){td.textContent='NULL';td.className='null';}else{td.textContent=typeof value==='object'?JSON.stringify(value,null,2):String(value);}tr.append(td);});body.append(tr);});empty.hidden=page.rows.length>0;empty.textContent='No records on this page.';total=page.total;status.textContent=page.rows.length?'Rows '+(offset+1)+'–'+(offset+page.rows.length)+' of '+total+' · '+page.table:total+' rows · '+page.table;}
async function loadPage(){if(!tableSelect.value)return;const version=++requestVersion;setBusy(true);error.hidden=true;status.textContent='Reading records…';try{const page=await read('/api/tables/'+encodeURIComponent(tableSelect.value)+'?offset='+offset+'&limit='+limitSelect.value);if(version===requestVersion)render(page);}catch(e){showError(e.message);status.textContent='Unable to load records.';}finally{if(version===requestVersion)setBusy(false);}}
async function loadTables(){setBusy(true);error.hidden=true;const selected=tableSelect.value;try{const data=await read('/api/tables');tableSelect.replaceChildren();data.tables.forEach(table=>{const option=document.createElement('option');option.value=table.name;option.textContent=table.name+' ('+table.rowCount+' rows)';tableSelect.append(option);});if(data.tables.some(table=>table.name===selected))tableSelect.value=selected;offset=0;if(data.tables.length){await loadPage();}else{status.textContent='No readable tables found.';empty.textContent='The viewer account has no readable tables.';}}catch(e){showError(e.message);status.textContent='Unable to load tables.';}finally{setBusy(false);}}
tableSelect.addEventListener('change',()=>{offset=0;void loadPage();});limitSelect.addEventListener('change',()=>{offset=0;void loadPage();});previous.addEventListener('click',()=>{if(busy)return;offset=Math.max(0,offset-Number(limitSelect.value));void loadPage();});next.addEventListener('click',()=>{if(busy)return;offset+=Number(limitSelect.value);void loadPage();});refresh.addEventListener('click',()=>void loadTables());void loadTables();
</script></body></html>`;

const server = app.listen(port, '127.0.0.1', () => {
  console.log(`Local database viewer: http://127.0.0.1:${port} (username: clinic_viewer)`);
});
function stop() {
  server.close(() => {
    void pool.end().finally(() => process.exit(0));
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
