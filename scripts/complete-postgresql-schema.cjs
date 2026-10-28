/* Complete an existing standalone PostgreSQL installation without seeds or resets.
 * Usage: node scripts/complete-postgresql-schema.cjs [--database disposable_db]
 * Take a verified backup and test this command on its restored clone first.
 */
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { loadEnvFile } = require('node:process');
const { Client } = require('pg');

// Split SQL at top-level semicolons; function bodies and comments remain intact.
function statements(sql) {
  const result = [];
  let start = 0;
  let quote = null;
  let dollar = null;
  let lineComment = false;
  let blockComment = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    const next = sql[i + 1];
    if (lineComment) { if (c === '\n') lineComment = false; continue; }
    if (blockComment) {
      if (c === '/' && next === '*') { blockComment++; i++; }
      else if (c === '*' && next === '/') { blockComment--; i++; }
      continue;
    }
    if (dollar) {
      if (sql.startsWith(dollar, i)) { i += dollar.length - 1; dollar = null; }
      continue;
    }
    if (quote) {
      if (c === quote && next === quote) i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '-' && next === '-') { lineComment = true; i++; }
    else if (c === '/' && next === '*') { blockComment = 1; i++; }
    else if (c === "'" || c === '"') quote = c;
    else if (c === '$') {
      const match = sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z_0-9]*)?\$/);
      if (match) { dollar = match[0]; i += dollar.length - 1; }
    } else if (c === ';') { result.push(sql.slice(start, i).trim()); start = i + 1; }
  }
  if (quote || dollar || blockComment) throw new Error('Unterminated SQL token');
  if (sql.slice(start).trim()) result.push(sql.slice(start).trim());
  return result.filter(Boolean);
}

function withoutLeadingComments(sql) {
  return sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, '').trim();
}

async function adapt(client, statement) {
  let sql = withoutLeadingComments(statement);
  if (/^(begin|commit)\s*$/i.test(sql)) return null;
  let match = sql.match(/^create type public\.(\w+) as enum\s*\(([\s\S]+)\)$/i);
  if (match) {
    const existing = await client.query(`select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid
      join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typname=$1 order by e.enumsortorder`, [match[1]]);
    if (existing.rowCount) {
      const expected = [...match[2].matchAll(/'([^']+)'/g)].map((item) => item[1]);
      if (JSON.stringify(expected) !== JSON.stringify(existing.rows.map((row) => row.enumlabel))) {
        throw new Error(`Existing enum public.${match[1]} differs from migration`);
      }
      return null;
    }
  }
  match = sql.match(/^alter table public\.(\w+) add constraint (\w+)/i);
  if (match) {
    const existing = await client.query('select 1 from pg_constraint where conrelid=to_regclass($1) and conname=$2', [`public.${match[1]}`, match[2]]);
    if (existing.rowCount) return null;
  }
  match = sql.match(/^create trigger (\w+)[\s\S]*? on public\.(\w+)/i);
  if (match) {
    const existing = await client.query('select 1 from pg_trigger where tgrelid=to_regclass($1) and tgname=$2', [`public.${match[2]}`, match[1]]);
    if (existing.rowCount) return null;
  }
  match = sql.match(/^create policy (\w+) on public\.(\w+)/i);
  if (match) {
    const existing = await client.query('select 1 from pg_policy where polrelid=to_regclass($1) and polname=$2', [`public.${match[2]}`, match[1]]);
    if (existing.rowCount) throw new Error(`Untracked policy ${match[1]} exists; review before adopting migration`);
  }
  sql = sql.replace(/^create table (?!if not exists)/i, 'create table if not exists ')
    .replace(/^create (unique )?index (?!if not exists)/i, 'create $1index if not exists ')
    .replace(/^create function /i, 'create or replace function ')
    .replace(/\badd column (?!if not exists)/gi, 'add column if not exists ');
  return sql;
}

async function main() {
  try { loadEnvFile(resolve('.env.local')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(process.env.DATABASE_URL);
  const args = process.argv.slice(2);
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--database' || !/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(args[1])) {
      throw new Error('Usage: node scripts/complete-postgresql-schema.cjs [--database disposable_db]');
    }
    url.pathname = `/${args[1]}`;
  }
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 10000 });
  await client.connect();
  try {
    // Serialise runners across sessions without holding table locks between migrations.
    await client.query("select pg_advisory_lock(hashtext('clinic_schema_completion'))");
    await client.query('begin');
    await client.query("set local lock_timeout='2s'; set local statement_timeout='60s'");
    await client.query(`create schema if not exists extensions; create schema if not exists auth;
      create schema if not exists clinic_migrations; revoke all on schema clinic_migrations from public;
      create table if not exists clinic_migrations.applied (name text primary key, sha256 text not null, applied_at timestamptz not null default now());
      create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
      do $$ begin
        if not exists(select from pg_roles where rolname='anon') then create role anon nologin; end if;
        if not exists(select from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
        if not exists(select from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
      end $$;
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
      $$;
      create or replace function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)
      $$;
      grant usage on schema public, auth, extensions to authenticated, anon, service_role;
      grant execute on function auth.uid(),auth.jwt() to authenticated,anon,service_role;`);
    await client.query('commit');
    const directory = resolve('supabase/migrations');
    for (const name of readdirSync(directory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
      const source = readFileSync(resolve(directory, name), 'utf8');
      const hash = createHash('sha256').update(source).digest('hex');
      const applied = await client.query('select sha256 from clinic_migrations.applied where name=$1', [name]);
      if (applied.rowCount) {
        if (applied.rows[0].sha256 !== hash) throw new Error(`Applied migration changed: ${name}`);
        console.log(`Already applied: ${name}`);
        continue;
      }
      await client.query('begin');
      try {
        await client.query("set local lock_timeout='2s'; set local statement_timeout='60s'; set local search_path=public,extensions");
        for (const statement of statements(source)) {
          const sql = await adapt(client, statement);
          if (sql) await client.query(sql);
        }
        if (name.includes('clinic_foundation')) {
          await client.query(`alter table public.role_permissions add constraint clinic_completion_permission_key
            check(permission_key ~ '^[a-z][a-z0-9_.:-]{1,99}$')`);
        }
        await client.query('insert into clinic_migrations.applied(name,sha256) values($1,$2)', [name, hash]);
        await client.query('commit');
        console.log(`Applied: ${name}`);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migration ${name} rolled back: ${error.message}`);
      }
    }
  } finally { await client.end(); }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { statements, adapt };
