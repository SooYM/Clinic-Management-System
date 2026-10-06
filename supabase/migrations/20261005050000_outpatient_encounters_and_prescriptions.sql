begin;

-- Draft SOAP notes remain editable through one checked RPC. Each save writes an
-- immutable, hashed snapshot; signing freezes the encounter permanently.
alter table public.encounters
  add column if not exists revision integer not null default 0 check (revision >= 0),
  add column if not exists signed_by uuid references public.staff_members(id) on delete restrict;

create table public.encounter_note_versions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  encounter_id uuid not null,
  revision integer not null check (revision > 0),
  note_snapshot jsonb not null check (jsonb_typeof(note_snapshot) = 'object'),
  snapshot_sha256 bytea not null check (octet_length(snapshot_sha256) = 32),
  changed_by uuid not null,
  signed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (encounter_id, revision),
  unique (id, clinic_id, branch_id),
  foreign key (encounter_id, clinic_id, branch_id)
    references public.encounters(id, clinic_id, branch_id) on delete restrict,
  foreign key (changed_by, clinic_id, branch_id)
    references public.staff_members(id, clinic_id, branch_id) on delete restrict
);
create index encounter_note_versions_history
  on public.encounter_note_versions(encounter_id, revision desc);
alter table public.encounter_note_versions enable row level security;
create policy encounter_note_versions_read on public.encounter_note_versions
  for select to authenticated
  using (public.has_branch_permission(clinic_id, branch_id, 'encounters.read'));
revoke insert, update, delete on public.encounter_note_versions from authenticated;
revoke update, delete on public.encounter_note_versions from service_role;
grant select, insert on public.encounter_note_versions to service_role;

create or replace function public.reject_clinical_history_mutation()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
  raise exception 'Clinical history rows are immutable' using errcode = '55000';
end;
$$;
create trigger encounter_note_versions_immutable
  before update or delete on public.encounter_note_versions
  for each row execute function public.reject_clinical_history_mutation();
create trigger medication_orders_immutable
  before update or delete on public.medication_orders
  for each row execute function public.reject_clinical_history_mutation();

-- Direct client writes bypass snapshot/signing and prescription checks, so all
-- authenticated writes go through the RPCs below.
revoke insert, update, delete on public.encounters, public.medication_orders from authenticated;

create or replace function public.save_outpatient_encounter(
  p_encounter_id uuid,
  p_patient_id uuid,
  p_queue_ticket_id uuid,
  p_appointment_id uuid,
  p_chief_complaint text,
  p_subjective text,
  p_objective jsonb,
  p_assessment text,
  p_plan text,
  p_diagnosis_codes jsonb,
  p_sign boolean default false
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  patient_row public.patients%rowtype;
  encounter_row public.encounters%rowtype;
  actor_id uuid;
  actor_role public.staff_role;
  next_revision integer;
  snapshot jsonb;
begin
  if p_patient_id is null
    or p_objective is null or jsonb_typeof(p_objective) <> 'object'
    or p_diagnosis_codes is null or jsonb_typeof(p_diagnosis_codes) <> 'array'
    or jsonb_array_length(p_diagnosis_codes) > 50
    or octet_length(p_objective::text) > 16000
    or octet_length(p_diagnosis_codes::text) > 8000
    or coalesce(length(p_chief_complaint), 0) > 2000
    or coalesce(length(p_subjective), 0) > 12000
    or coalesce(length(p_assessment), 0) > 8000
    or coalesce(length(p_plan), 0) > 12000 then
    raise exception 'SOAP note data is invalid' using errcode = '22023';
  end if;

  select p.* into patient_row from public.patients p
  where p.id = p_patient_id and public.has_branch_access(p.clinic_id, p.branch_id);
  if not found then raise exception 'Patient not found in selected branch' using errcode = 'P0002'; end if;

  select s.id, s.role into actor_id, actor_role
  from public.staff_members s
  where s.auth_user_id = auth.uid() and s.clinic_id = patient_row.clinic_id
    and s.branch_id = patient_row.branch_id and s.active;
  if actor_id is null or not public.has_branch_permission(patient_row.clinic_id, patient_row.branch_id, 'encounters.write') then
    raise exception 'Encounter write permission denied' using errcode = '42501';
  end if;
  if p_sign and actor_role not in ('doctor', 'manager') then
    raise exception 'Only a doctor or manager may sign an encounter' using errcode = '42501';
  end if;

  if p_encounter_id is null then
    if p_sign and actor_role not in ('doctor', 'manager') then
      raise exception 'Only a doctor or manager may sign an encounter' using errcode = '42501';
    end if;
    insert into public.encounters (
      clinic_id, branch_id, patient_id, queue_ticket_id, appointment_id, practitioner_id,
      chief_complaint, subjective, objective, assessment, plan, diagnosis_codes,
      status, signed_at, signed_by, revision
    ) values (
      patient_row.clinic_id, patient_row.branch_id, patient_row.id, p_queue_ticket_id, p_appointment_id, actor_id,
      nullif(trim(p_chief_complaint), ''), nullif(trim(p_subjective), ''), p_objective,
      nullif(trim(p_assessment), ''), nullif(trim(p_plan), ''), p_diagnosis_codes,
      case when p_sign then 'signed'::public.encounter_status else 'open'::public.encounter_status end,
      case when p_sign then now() else null end,
      case when p_sign then actor_id else null end, 1
    ) returning * into encounter_row;
  else
    select e.* into encounter_row from public.encounters e
    where e.id = p_encounter_id and e.clinic_id = patient_row.clinic_id
      and e.branch_id = patient_row.branch_id and e.patient_id = patient_row.id
      and public.has_branch_access(e.clinic_id, e.branch_id)
    for update;
    if not found then raise exception 'Encounter not found in selected branch' using errcode = 'P0002'; end if;
    if encounter_row.status <> 'open' then
      raise exception 'Only an open encounter can be edited or signed' using errcode = '23514';
    end if;
    update public.encounters set
      queue_ticket_id = coalesce(p_queue_ticket_id, queue_ticket_id),
      appointment_id = coalesce(p_appointment_id, appointment_id),
      chief_complaint = nullif(trim(p_chief_complaint), ''),
      subjective = nullif(trim(p_subjective), ''), objective = p_objective,
      assessment = nullif(trim(p_assessment), ''), plan = nullif(trim(p_plan), ''),
      diagnosis_codes = p_diagnosis_codes,
      status = case when p_sign then 'signed'::public.encounter_status else status end,
      signed_at = case when p_sign then now() else signed_at end,
      signed_by = case when p_sign then actor_id else signed_by end,
      revision = revision + 1, updated_at = now()
    where id = encounter_row.id returning * into encounter_row;
  end if;

  next_revision := encounter_row.revision;
  snapshot := jsonb_build_object(
    'patient_id', encounter_row.patient_id,
    'queue_ticket_id', encounter_row.queue_ticket_id,
    'appointment_id', encounter_row.appointment_id,
    'practitioner_id', encounter_row.practitioner_id,
    'chief_complaint', encounter_row.chief_complaint,
    'subjective', encounter_row.subjective,
    'objective', encounter_row.objective,
    'assessment', encounter_row.assessment,
    'plan', encounter_row.plan,
    'diagnosis_codes', encounter_row.diagnosis_codes,
    'status', encounter_row.status,
    'signed_at', encounter_row.signed_at,
    'signed_by', encounter_row.signed_by
  );
  insert into public.encounter_note_versions (
    clinic_id, branch_id, encounter_id, revision, note_snapshot,
    snapshot_sha256, changed_by, signed
  ) values (
    encounter_row.clinic_id, encounter_row.branch_id, encounter_row.id, next_revision,
    snapshot, extensions.digest(convert_to(snapshot::text, 'UTF8'), 'sha256'), actor_id, p_sign
  );
  return jsonb_build_object(
    'id', encounter_row.id, 'patient_id', encounter_row.patient_id,
    'queue_ticket_id', encounter_row.queue_ticket_id, 'appointment_id', encounter_row.appointment_id,
    'practitioner_id', encounter_row.practitioner_id, 'status', encounter_row.status,
    'chief_complaint', encounter_row.chief_complaint, 'subjective', encounter_row.subjective,
    'objective', encounter_row.objective, 'assessment', encounter_row.assessment,
    'plan', encounter_row.plan, 'diagnosis_codes', encounter_row.diagnosis_codes,
    'revision', encounter_row.revision, 'signed_at', encounter_row.signed_at,
    'signed_by', encounter_row.signed_by, 'created_at', encounter_row.created_at,
    'updated_at', encounter_row.updated_at
  );
end;
$$;

create or replace function public.create_medication_order(
  p_encounter_id uuid,
  p_medication_name text,
  p_dose text,
  p_route text,
  p_frequency text,
  p_quantity numeric,
  p_days_supply integer,
  p_instructions text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  encounter_row public.encounters%rowtype;
  patient_row public.patients%rowtype;
  order_row public.medication_orders%rowtype;
  actor_id uuid;
  actor_role public.staff_role;
  allergy jsonb;
  allergy_name text;
  allergy_key text;
  medication_key text;
begin
  if p_encounter_id is null or p_medication_name is null
    or length(trim(p_medication_name)) < 2 or length(p_medication_name) > 200
    or coalesce(length(p_dose), 0) > 200 or coalesce(length(p_route), 0) > 100
    or coalesce(length(p_frequency), 0) > 200 or p_quantity is null
    or p_quantity <= 0 or p_quantity > 100000
    or (p_days_supply is not null and (p_days_supply < 1 or p_days_supply > 3650))
    or coalesce(length(p_instructions), 0) > 2000 then
    raise exception 'Medication order data is invalid' using errcode = '22023';
  end if;
  select e.* into encounter_row from public.encounters e
  where e.id = p_encounter_id and public.has_branch_access(e.clinic_id, e.branch_id);
  if not found then raise exception 'Encounter not found in selected branch' using errcode = 'P0002'; end if;
  select s.id, s.role into actor_id, actor_role from public.staff_members s
  where s.auth_user_id = auth.uid() and s.clinic_id = encounter_row.clinic_id
    and s.branch_id = encounter_row.branch_id and s.active;
  if actor_id is null or actor_role not in ('doctor', 'manager')
    or not public.has_branch_permission(encounter_row.clinic_id, encounter_row.branch_id, 'prescriptions.write') then
    raise exception 'Prescription write permission denied' using errcode = '42501';
  end if;
  if encounter_row.status <> 'open' then
    raise exception 'Medication orders require an open encounter' using errcode = '23514';
  end if;
  select p.* into patient_row from public.patients p
  where p.id = encounter_row.patient_id and p.clinic_id = encounter_row.clinic_id
    and p.branch_id = encounter_row.branch_id;
  if not found then raise exception 'Patient not found in selected branch' using errcode = 'P0002'; end if;

  -- This is a conservative text collision check against recorded patient
  -- allergies, not a drug interaction or formulary database. Malformed allergy
  -- data fails closed so an uninspectable record cannot silently pass.
  if patient_row.allergies is null or jsonb_typeof(patient_row.allergies) <> 'array' then
    raise exception 'Patient allergy record cannot be checked; resolve it before prescribing' using errcode = '23514';
  end if;
  medication_key := regexp_replace(lower(trim(p_medication_name)), '[^[:alnum:]]', '', 'g');
  if length(medication_key) < 2 then
    raise exception 'Medication name is too ambiguous to check against recorded allergies' using errcode = '22023';
  end if;
  for allergy in select value from jsonb_array_elements(patient_row.allergies) as item(value) loop
    if jsonb_typeof(allergy) = 'string' then
      allergy_name := allergy #>> '{}';
    elsif jsonb_typeof(allergy) = 'object' then
      allergy_name := coalesce(allergy->>'substance', allergy->>'allergen', allergy->>'name');
    else
      raise exception 'Patient allergy record cannot be checked; resolve it before prescribing' using errcode = '23514';
    end if;
    allergy_key := regexp_replace(lower(trim(coalesce(allergy_name, ''))), '[^[:alnum:]]', '', 'g');
    if length(allergy_key) < 2 then
      raise exception 'Patient allergy record cannot be checked; resolve it before prescribing' using errcode = '23514';
    end if;
    if position(allergy_key in medication_key) > 0 or position(medication_key in allergy_key) > 0 then
      raise exception 'Medication name may match a recorded patient allergy; review and resolve before prescribing' using errcode = '23514';
    end if;
  end loop;

  insert into public.medication_orders (
    clinic_id, branch_id, encounter_id, patient_id, prescribed_by,
    medication_name, dose, route, frequency, quantity, days_supply, instructions
  ) values (
    encounter_row.clinic_id, encounter_row.branch_id, encounter_row.id, encounter_row.patient_id,
    actor_id, trim(p_medication_name), nullif(trim(p_dose), ''), nullif(trim(p_route), ''),
    nullif(trim(p_frequency), ''), p_quantity, p_days_supply, nullif(trim(p_instructions), '')
  ) returning * into order_row;
  return jsonb_build_object(
    'id', order_row.id, 'encounter_id', order_row.encounter_id, 'patient_id', order_row.patient_id,
    'prescribed_by', order_row.prescribed_by, 'medication_name', order_row.medication_name,
    'dose', order_row.dose, 'route', order_row.route, 'frequency', order_row.frequency,
    'quantity', order_row.quantity, 'days_supply', order_row.days_supply,
    'instructions', order_row.instructions, 'created_at', order_row.created_at
  );
end;
$$;

revoke all on function public.save_outpatient_encounter(uuid, uuid, uuid, uuid, text, text, jsonb, text, text, jsonb, boolean) from public, anon;
revoke all on function public.create_medication_order(uuid, text, text, text, text, numeric, integer, text) from public, anon;
grant execute on function public.save_outpatient_encounter(uuid, uuid, uuid, uuid, text, text, jsonb, text, text, jsonb, boolean) to authenticated;
grant execute on function public.create_medication_order(uuid, text, text, text, text, numeric, integer, text) to authenticated;

commit;
