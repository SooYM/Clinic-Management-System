begin;

-- All clinical document versions are immutable snapshots. These RPCs bind
-- author, branch and version numbers to the authenticated staff member.
create or replace function public.issue_clinical_document(
  p_document_id uuid,
  p_patient_id uuid,
  p_document_type public.clinical_document_type,
  p_document_number text,
  p_content jsonb,
  p_token_sha256 bytea
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  patient_row public.patients%rowtype;
  actor_id uuid;
  actor_role public.staff_role;
  document_row public.clinical_documents%rowtype;
  version_row public.clinical_document_versions%rowtype;
begin
  select p.* into patient_row
  from public.patients p
  where p.id = p_patient_id and public.has_branch_access(p.clinic_id, p.branch_id);
  if not found then
    raise exception 'Patient not found in selected branch' using errcode = 'P0002';
  end if;
  select s.id, s.role into actor_id, actor_role
  from public.staff_members s
  where s.auth_user_id = auth.uid() and s.clinic_id = patient_row.clinic_id
    and s.branch_id = patient_row.branch_id and s.active;
  if actor_id is null then
    raise exception 'Active clinic staff membership required' using errcode = '42501';
  end if;
  if actor_role not in ('doctor', 'manager')
    or not public.has_branch_permission(patient_row.clinic_id, patient_row.branch_id, 'documents.write') then
    raise exception 'Clinical document issue permission denied' using errcode = '42501';
  end if;
  if p_document_id is null or p_document_number is null or length(p_document_number) > 64
    or p_document_number !~ '^(MC|REF|LAB)-[A-Z0-9-]{4,56}$'
    or p_content is null or jsonb_typeof(p_content) <> 'object'
    or octet_length(p_content::text) > 65536
    or p_token_sha256 is null or octet_length(p_token_sha256) <> 32 then
    raise exception 'Invalid clinical document content' using errcode = '22023';
  end if;

  insert into public.clinical_documents (
    id, clinic_id, branch_id, patient_id, document_type, document_number, issued_by
  ) values (
    p_document_id, patient_row.clinic_id, patient_row.branch_id, patient_row.id, p_document_type, p_document_number, actor_id
  ) returning * into document_row;

  insert into public.clinical_document_versions (
    clinic_id, branch_id, document_id, version_number, content, content_sha256, created_by
  ) values (
    patient_row.clinic_id, patient_row.branch_id, document_row.id, 1, p_content,
    extensions.digest(convert_to(p_content::text, 'UTF8'), 'sha256'), actor_id
  ) returning * into version_row;
  insert into public.document_verification_tokens (clinic_id, branch_id, document_version_id, token_sha256)
  values (document_row.clinic_id, document_row.branch_id, version_row.id, p_token_sha256);

  return jsonb_build_object(
    'document_id', document_row.id, 'document_number', document_row.document_number,
    'document_type', document_row.document_type, 'status', document_row.status,
    'issued_at', document_row.issued_at, 'current_version', document_row.current_version,
    'version_id', version_row.id, 'content', version_row.content
  );
end;
$$;

create or replace function public.regenerate_clinical_document(
  p_document_id uuid,
  p_expected_version integer,
  p_content jsonb,
  p_token_sha256 bytea
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  document_row public.clinical_documents%rowtype;
  version_row public.clinical_document_versions%rowtype;
  actor_id uuid;
begin
  select d.* into document_row
  from public.clinical_documents d
  where d.id = p_document_id and public.has_branch_access(d.clinic_id, d.branch_id)
  for update;
  if not found then
    raise exception 'Clinical document not found' using errcode = 'P0002';
  end if;
  actor_id := public.current_staff_member_id(document_row.clinic_id, document_row.branch_id);
  if actor_id is null or not public.has_branch_permission(document_row.clinic_id, document_row.branch_id, 'documents.write') then
    raise exception 'Clinical document revision permission denied' using errcode = '42501';
  end if;
  if document_row.status <> 'active' then
    raise exception 'Revoked documents cannot be regenerated' using errcode = '23514';
  end if;
  if document_row.current_version <> p_expected_version then
    raise exception 'Document changed; reload reception log and retry' using errcode = '40001';
  end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or octet_length(p_content::text) > 65536
    or p_token_sha256 is null or octet_length(p_token_sha256) <> 32 then
    raise exception 'Invalid clinical document content' using errcode = '22023';
  end if;

  update public.clinical_documents
  set current_version = current_version + 1, updated_at = now()
  where id = document_row.id
  returning * into document_row;

  insert into public.clinical_document_versions (
    clinic_id, branch_id, document_id, version_number, content, content_sha256, change_reason, created_by
  ) values (
    document_row.clinic_id, document_row.branch_id, document_row.id, document_row.current_version, p_content,
    extensions.digest(convert_to(p_content::text, 'UTF8'), 'sha256'), 'Reissued from reception log',
    actor_id
  ) returning * into version_row;
  insert into public.document_verification_tokens (clinic_id, branch_id, document_version_id, token_sha256)
  values (document_row.clinic_id, document_row.branch_id, version_row.id, p_token_sha256);

  return jsonb_build_object(
    'document_id', document_row.id, 'document_number', document_row.document_number,
    'document_type', document_row.document_type, 'status', document_row.status,
    'issued_at', document_row.issued_at, 'current_version', document_row.current_version,
    'version_id', version_row.id, 'content', version_row.content
  );
end;
$$;

create or replace function public.record_clinical_document_print(
  p_document_id uuid,
  p_version_number integer,
  p_purpose text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  document_row public.clinical_documents%rowtype;
  version_row public.clinical_document_versions%rowtype;
  actor_id uuid;
  print_id uuid;
  print_time timestamptz;
begin
  select d.* into document_row
  from public.clinical_documents d
  where d.id = p_document_id and public.has_branch_access(d.clinic_id, d.branch_id);
  if not found then raise exception 'Clinical document not found' using errcode = 'P0002'; end if;
  actor_id := public.current_staff_member_id(document_row.clinic_id, document_row.branch_id);
  if actor_id is null or not public.has_branch_permission(document_row.clinic_id, document_row.branch_id, 'documents.read') then
    raise exception 'Clinical document print permission denied' using errcode = '42501';
  end if;
  select v.* into version_row from public.clinical_document_versions v
  where v.document_id = document_row.id and v.version_number = p_version_number;
  if not found then raise exception 'Document version not found' using errcode = 'P0002'; end if;
  insert into public.document_print_logs (
    clinic_id, branch_id, document_version_id, printed_by, purpose
  ) values (
    document_row.clinic_id, document_row.branch_id, version_row.id, actor_id,
    left(nullif(trim(p_purpose), ''), 120)
  ) returning id, printed_at into print_id, print_time;
  return jsonb_build_object('print_id', print_id, 'printed_at', print_time, 'version_number', p_version_number);
end;
$$;

create or replace function public.revoke_clinical_document(
  p_document_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  document_row public.clinical_documents%rowtype;
  actor_id uuid;
begin
  select d.* into document_row
  from public.clinical_documents d
  where d.id = p_document_id and public.has_branch_access(d.clinic_id, d.branch_id)
  for update;
  if not found then raise exception 'Clinical document not found' using errcode = 'P0002'; end if;
  actor_id := public.current_staff_member_id(document_row.clinic_id, document_row.branch_id);
  if actor_id is null or not public.has_branch_permission(document_row.clinic_id, document_row.branch_id, 'documents.delete') then
    raise exception 'Clinical document revocation permission denied' using errcode = '42501';
  end if;
  if document_row.status = 'revoked' then
    return jsonb_build_object('document_id', document_row.id, 'status', 'revoked');
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 or length(p_reason) > 500 then
    raise exception 'A revocation reason is required' using errcode = '22023';
  end if;
  update public.clinical_documents
  set status = 'revoked', revoked_at = now(), revoked_by = actor_id,
      revocation_reason = trim(p_reason), updated_at = now()
  where id = document_row.id
  returning * into document_row;
  return jsonb_build_object('document_id', document_row.id, 'status', document_row.status);
end;
$$;

revoke all on function public.issue_clinical_document(uuid, uuid, public.clinical_document_type, text, jsonb, bytea) from public, anon;
revoke all on function public.regenerate_clinical_document(uuid, integer, jsonb, bytea) from public, anon;
revoke all on function public.record_clinical_document_print(uuid, integer, text) from public, anon;
revoke all on function public.revoke_clinical_document(uuid, text) from public, anon;
revoke insert, update, delete on public.clinical_documents from authenticated;
grant execute on function public.issue_clinical_document(uuid, uuid, public.clinical_document_type, text, jsonb, bytea) to authenticated;
grant execute on function public.regenerate_clinical_document(uuid, integer, jsonb, bytea) to authenticated;
grant execute on function public.record_clinical_document_print(uuid, integer, text) to authenticated;
grant execute on function public.revoke_clinical_document(uuid, text) to authenticated;

commit;
