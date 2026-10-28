-- Local PostgreSQL authentication. Provision accounts separately; no default passwords.
begin;
create schema if not exists clinic_auth;
revoke all on schema clinic_auth from public;
create table if not exists clinic_auth.credentials (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  identifier text not null unique check (identifier = lower(btrim(identifier)) and length(identifier) between 1 and 254),
  password_hash text not null check (password_hash ~ '^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists clinic_auth.sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references clinic_auth.credentials(auth_user_id) on delete cascade,
  access_token_hash text not null unique check (access_token_hash ~ '^[a-f0-9]{64}$'),
  refresh_token_hash text not null unique check (refresh_token_hash ~ '^[a-f0-9]{64}$'),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (access_expires_at <= refresh_expires_at)
);
create index if not exists clinic_auth_sessions_user on clinic_auth.sessions(auth_user_id);
create index if not exists clinic_auth_sessions_expiry on clinic_auth.sessions(refresh_expires_at);
revoke all on all tables in schema clinic_auth from public;
do $$ begin
  if exists (select from pg_roles where rolname = 'anon') then
    revoke all on schema clinic_auth from anon;
    revoke all on all tables in schema clinic_auth from anon;
  end if;
  if exists (select from pg_roles where rolname = 'authenticated') then
    revoke all on schema clinic_auth from authenticated;
    revoke all on all tables in schema clinic_auth from authenticated;
  end if;
end $$;
commit;
