begin;

-- Appointment and room state changes are performed through audited RPCs so a
-- client cannot bypass branch checks, overlap constraints, or history writes.
alter table public.consultation_rooms
  add column updated_at timestamptz not null default now();

create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  appointment_id uuid not null,
  actor_id uuid not null references public.staff_members(id) on delete restrict,
  action text not null check (action in ('created','updated','status_changed','cancelled')),
  from_status public.appointment_status,
  to_status public.appointment_status not null,
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state)='object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (appointment_id,clinic_id,branch_id)
    references public.appointments(id,clinic_id,branch_id) on delete restrict
);
create index appointment_events_timeline on public.appointment_events(appointment_id,occurred_at desc);

create table public.consultation_room_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  room_id uuid not null,
  actor_id uuid not null references public.staff_members(id) on delete restrict,
  action text not null check (action in ('created','updated')),
  before_state jsonb not null default '{}'::jsonb check (jsonb_typeof(before_state)='object'),
  after_state jsonb not null default '{}'::jsonb check (jsonb_typeof(after_state)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (room_id,clinic_id,branch_id)
    references public.consultation_rooms(id,clinic_id,branch_id) on delete restrict
);
create index consultation_room_events_timeline on public.consultation_room_events(room_id,occurred_at desc);

create trigger appointment_events_immutable before update or delete on public.appointment_events
  for each row execute function public.reject_mutation();
create trigger consultation_room_events_immutable before update or delete on public.consultation_room_events
  for each row execute function public.reject_mutation();

alter table public.appointment_events enable row level security;
alter table public.consultation_room_events enable row level security;
create policy appointment_events_read on public.appointment_events for select to authenticated
  using (public.has_branch_permission(clinic_id,branch_id,'appointments.read'));
create policy consultation_room_events_read on public.consultation_room_events for select to authenticated
  using (public.has_branch_permission(clinic_id,branch_id,'rooms.read'));

revoke insert,update,delete on public.appointments,public.consultation_rooms,
  public.appointment_events,public.consultation_room_events from authenticated;
grant select on public.appointment_events,public.consultation_room_events to authenticated;

create or replace function public.create_clinic_appointment(
  p_patient_id uuid,
  p_practitioner_id uuid,
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  actor uuid;
  clinic uuid;
  branch uuid;
  created_row public.appointments%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if (select count(*) from public.staff_members s where s.auth_user_id=auth.uid() and s.active) <> 1 then
    raise exception 'Select a branch before scheduling' using errcode='42501';
  end if;
  select s.id,s.clinic_id,s.branch_id into actor,clinic,branch
  from public.staff_members s where s.auth_user_id=auth.uid() and s.active;
  if actor is null or not public.has_branch_permission(clinic,branch,'appointments.manage') then
    raise exception 'Appointment management permission denied' using errcode='42501';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or p_ends_at-p_starts_at > interval '12 hours' then
    raise exception 'Invalid appointment interval' using errcode='22023';
  end if;
  if p_starts_at < now()-interval '5 minutes' then
    raise exception 'Appointments cannot be scheduled in the past' using errcode='22023';
  end if;
  if not exists(select 1 from public.patients p where p.id=p_patient_id and p.clinic_id=clinic and p.branch_id=branch and p.archived_at is null) then
    raise exception 'Patient not found in selected branch' using errcode='P0002';
  end if;
  if not exists(select 1 from public.staff_members s where s.id=p_practitioner_id and s.clinic_id=clinic and s.branch_id=branch and s.active and s.role in ('doctor','manager')) then
    raise exception 'Active practitioner not found in selected branch' using errcode='P0002';
  end if;
  if p_room_id is not null and not exists(select 1 from public.consultation_rooms r where r.id=p_room_id and r.clinic_id=clinic and r.branch_id=branch and r.is_active) then
    raise exception 'Active room not found in selected branch' using errcode='P0002';
  end if;
  insert into public.appointments(clinic_id,branch_id,patient_id,practitioner_id,room_id,starts_at,ends_at,reason,notes,created_by)
  values(clinic,branch,p_patient_id,p_practitioner_id,p_room_id,p_starts_at,p_ends_at,left(nullif(trim(p_reason),''),240),left(nullif(trim(p_notes),''),2000),actor)
  returning * into created_row;
  insert into public.appointment_events(clinic_id,branch_id,appointment_id,actor_id,action,to_status,after_state)
  values(clinic,branch,created_row.id,actor,'created',created_row.status,to_jsonb(created_row));
  return to_jsonb(created_row);
end $$;

create or replace function public.update_clinic_appointment(
  p_appointment_id uuid,
  p_expected_updated_at timestamptz,
  p_practitioner_id uuid,
  p_room_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text,
  p_notes text,
  p_status public.appointment_status default null
) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  old_row public.appointments%rowtype;
  new_row public.appointments%rowtype;
  actor uuid;
begin
  select a.* into old_row from public.appointments a
  where a.id=p_appointment_id and public.has_branch_access(a.clinic_id,a.branch_id) for update;
  if not found then raise exception 'Appointment not found' using errcode='P0002'; end if;
  select s.id into actor from public.staff_members s where s.auth_user_id=auth.uid()
    and s.clinic_id=old_row.clinic_id and s.branch_id=old_row.branch_id and s.active;
  if actor is null or not public.has_branch_permission(old_row.clinic_id,old_row.branch_id,'appointments.manage') then
    raise exception 'Appointment management permission denied' using errcode='42501';
  end if;
  if p_expected_updated_at is null or old_row.updated_at<>p_expected_updated_at then
    raise exception 'Appointment changed; refresh and retry' using errcode='40001';
  end if;
  if old_row.status in ('cancelled','completed','no_show') then
    raise exception 'This appointment can no longer be edited' using errcode='23514';
  end if;
  if p_practitioner_id is null or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at
    or p_ends_at-p_starts_at>interval '12 hours' or p_starts_at<now()-interval '5 minutes' then
    raise exception 'Invalid appointment details or interval' using errcode='22023';
  end if;
  if not exists(select 1 from public.staff_members s where s.id=p_practitioner_id and s.clinic_id=old_row.clinic_id and s.branch_id=old_row.branch_id and s.active and s.role in ('doctor','manager')) then
    raise exception 'Active practitioner not found in selected branch' using errcode='P0002';
  end if;
  if p_room_id is not null and not exists(select 1 from public.consultation_rooms r where r.id=p_room_id and r.clinic_id=old_row.clinic_id and r.branch_id=old_row.branch_id and r.is_active) then
    raise exception 'Active room not found in selected branch' using errcode='P0002';
  end if;
  if p_status is not null and p_status not in ('booked','confirmed','arrived','completed','no_show') then
    raise exception 'Invalid appointment status transition' using errcode='23514';
  end if;
  update public.appointments set practitioner_id=p_practitioner_id,room_id=p_room_id,starts_at=p_starts_at,ends_at=p_ends_at,
    reason=left(nullif(trim(p_reason),''),240),notes=left(nullif(trim(p_notes),''),2000),
    status=coalesce(p_status,status),updated_at=now()
  where id=old_row.id returning * into new_row;
  insert into public.appointment_events(clinic_id,branch_id,appointment_id,actor_id,action,from_status,to_status,before_state,after_state)
  values(old_row.clinic_id,old_row.branch_id,old_row.id,actor,
    case when new_row.status is distinct from old_row.status then 'status_changed' else 'updated' end,
    old_row.status,new_row.status,to_jsonb(old_row),to_jsonb(new_row));
  return to_jsonb(new_row);
end $$;

create or replace function public.cancel_clinic_appointment(p_appointment_id uuid,p_expected_updated_at timestamptz,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_row public.appointments%rowtype; new_row public.appointments%rowtype; actor uuid;
begin
  select a.* into old_row from public.appointments a where a.id=p_appointment_id
    and public.has_branch_access(a.clinic_id,a.branch_id) for update;
  if not found then raise exception 'Appointment not found' using errcode='P0002'; end if;
  select s.id into actor from public.staff_members s where s.auth_user_id=auth.uid()
    and s.clinic_id=old_row.clinic_id and s.branch_id=old_row.branch_id and s.active;
  if actor is null or not public.has_branch_permission(old_row.clinic_id,old_row.branch_id,'appointments.manage') then
    raise exception 'Appointment management permission denied' using errcode='42501';
  end if;
  if old_row.status='cancelled' then return to_jsonb(old_row); end if;
  if p_expected_updated_at is null or old_row.updated_at<>p_expected_updated_at then
    raise exception 'Appointment changed; refresh and retry' using errcode='40001';
  end if;
  if old_row.status in ('completed','no_show') then raise exception 'Completed appointments cannot be cancelled' using errcode='23514'; end if;
  update public.appointments set status='cancelled',cancelled_at=now(),notes=case when nullif(trim(p_reason),'') is null then notes else left(concat_ws(E'\n',notes,'Cancellation: '||left(trim(p_reason),500)),2000) end,updated_at=now()
   where id=old_row.id returning * into new_row;
  insert into public.appointment_events(clinic_id,branch_id,appointment_id,actor_id,action,from_status,to_status,before_state,after_state)
  values(old_row.clinic_id,old_row.branch_id,old_row.id,actor,'cancelled',old_row.status,new_row.status,to_jsonb(old_row),to_jsonb(new_row));
  return to_jsonb(new_row);
end $$;

create or replace function public.create_consultation_room(p_room_number text,p_attending_practitioner_id uuid default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare actor uuid; clinic uuid; branch uuid; created_row public.consultation_rooms%rowtype;
begin
  if auth.uid() is null or (select count(*) from public.staff_members s where s.auth_user_id=auth.uid() and s.active)<>1 then
    raise exception 'Active branch membership required' using errcode='42501';
  end if;
  select s.id,s.clinic_id,s.branch_id into actor,clinic,branch from public.staff_members s where s.auth_user_id=auth.uid() and s.active;
  if not public.has_branch_permission(clinic,branch,'rooms.manage') then raise exception 'Room management permission denied' using errcode='42501'; end if;
  if p_room_number is null or length(trim(p_room_number)) not between 1 and 40 or p_room_number !~ '^[[:alnum:] ._-]+$' then
    raise exception 'Invalid room number' using errcode='22023';
  end if;
  if p_attending_practitioner_id is not null and not exists(select 1 from public.staff_members s where s.id=p_attending_practitioner_id and s.clinic_id=clinic and s.branch_id=branch and s.active and s.role in ('doctor','manager')) then
    raise exception 'Active practitioner not found in selected branch' using errcode='P0002';
  end if;
  insert into public.consultation_rooms(clinic_id,branch_id,room_number,attending_practitioner_id)
  values(clinic,branch,trim(p_room_number),p_attending_practitioner_id) returning * into created_row;
  insert into public.consultation_room_events(clinic_id,branch_id,room_id,actor_id,action,after_state)
  values(clinic,branch,created_row.id,actor,'created',to_jsonb(created_row));
  return to_jsonb(created_row);
end $$;

create or replace function public.update_consultation_room(p_room_id uuid,p_room_number text,p_attending_practitioner_id uuid,p_is_active boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_row public.consultation_rooms%rowtype; new_row public.consultation_rooms%rowtype; actor uuid;
begin
  select r.* into old_row from public.consultation_rooms r where r.id=p_room_id
    and public.has_branch_access(r.clinic_id,r.branch_id) for update;
  if not found then raise exception 'Room not found' using errcode='P0002'; end if;
  select s.id into actor from public.staff_members s where s.auth_user_id=auth.uid()
    and s.clinic_id=old_row.clinic_id and s.branch_id=old_row.branch_id and s.active;
  if actor is null or not public.has_branch_permission(old_row.clinic_id,old_row.branch_id,'rooms.manage') then
    raise exception 'Room management permission denied' using errcode='42501';
  end if;
  if p_room_number is null or length(trim(p_room_number)) not between 1 and 40 or p_room_number !~ '^[[:alnum:] ._-]+$' or p_is_active is null then
    raise exception 'Invalid room details' using errcode='22023';
  end if;
  if p_attending_practitioner_id is not null and not exists(select 1 from public.staff_members s where s.id=p_attending_practitioner_id and s.clinic_id=old_row.clinic_id and s.branch_id=old_row.branch_id and s.active and s.role in ('doctor','manager')) then
    raise exception 'Active practitioner not found in selected branch' using errcode='P0002';
  end if;
  if not p_is_active and (exists(select 1 from public.queue_tickets q where q.room_id=old_row.id and q.status in ('called_to_room','in_consultation'))
    or exists(select 1 from public.appointments a where a.room_id=old_row.id and a.status in ('booked','confirmed','arrived') and a.ends_at>now())) then
    raise exception 'Room has active queue or upcoming appointments' using errcode='23514';
  end if;
  update public.consultation_rooms set room_number=trim(p_room_number),attending_practitioner_id=p_attending_practitioner_id,is_active=p_is_active,updated_at=now()
   where id=old_row.id returning * into new_row;
  insert into public.consultation_room_events(clinic_id,branch_id,room_id,actor_id,action,before_state,after_state)
  values(old_row.clinic_id,old_row.branch_id,old_row.id,actor,'updated',to_jsonb(old_row),to_jsonb(new_row));
  return to_jsonb(new_row);
end $$;

revoke all on function public.create_clinic_appointment(uuid,uuid,uuid,timestamptz,timestamptz,text,text) from public,anon;
revoke all on function public.update_clinic_appointment(uuid,timestamptz,uuid,uuid,timestamptz,timestamptz,text,text,public.appointment_status) from public,anon;
revoke all on function public.cancel_clinic_appointment(uuid,timestamptz,text) from public,anon;
revoke all on function public.create_consultation_room(text,uuid) from public,anon;
revoke all on function public.update_consultation_room(uuid,text,uuid,boolean) from public,anon;
grant execute on function public.create_clinic_appointment(uuid,uuid,uuid,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.update_clinic_appointment(uuid,timestamptz,uuid,uuid,timestamptz,timestamptz,text,text,public.appointment_status) to authenticated;
grant execute on function public.cancel_clinic_appointment(uuid,timestamptz,text) to authenticated;
grant execute on function public.create_consultation_room(text,uuid) to authenticated;
grant execute on function public.update_consultation_room(uuid,text,uuid,boolean) to authenticated;

grant select on public.consultation_rooms,public.appointments to authenticated;
grant select,insert,update,delete on public.consultation_rooms,public.appointments,
  public.appointment_events,public.consultation_room_events to service_role;

commit;
