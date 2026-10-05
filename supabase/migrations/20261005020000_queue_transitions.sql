begin;

-- Create the ticket and its initial immutable timeline event as one transaction.
create or replace function public.create_queue_ticket(p_patient_id uuid, p_ticket_number text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  branch_clinic uuid;
  branch_id uuid;
  actor uuid;
  actor_role public.staff_role;
  created_ticket public.queue_tickets%rowtype;
begin
  if p_ticket_number is null or p_ticket_number !~ '^Q-[0-9]{6}-[A-F0-9]{4}$' then
    raise exception 'Invalid ticket number' using errcode = '22023';
  end if;
  if (select count(*) from public.staff_members s where s.auth_user_id = auth.uid() and s.active) <> 1 then
    raise exception 'Select a branch before creating queue tickets' using errcode = '42501';
  end if;
  select s.id, s.role, s.clinic_id, s.branch_id into actor, actor_role, branch_clinic, branch_id
  from public.staff_members s
  where s.auth_user_id = auth.uid()
    and s.active
    and public.has_branch_access(s.clinic_id, s.branch_id);
  if actor is null then
    raise exception 'Active branch membership required' using errcode = '42501';
  end if;
  if not public.has_branch_permission(branch_clinic, branch_id, 'queue.manage') then
    raise exception 'Queue creation permission denied' using errcode = '42501';
  end if;

  insert into public.queue_tickets (clinic_id, branch_id, patient_id, ticket_number, status, created_by)
  select p.clinic_id, p.branch_id, p.id, p_ticket_number, 'registered', actor
  from public.patients p
  where p.id = p_patient_id and p.clinic_id = branch_clinic and p.branch_id = branch_id;
  if not found then
    raise exception 'Patient not found in selected branch' using errcode = 'P0002';
  end if;
  select q.* into created_ticket from public.queue_tickets q where q.clinic_id = branch_clinic and q.ticket_number = p_ticket_number;
  insert into public.queue_events (clinic_id, branch_id, queue_ticket_id, from_status, to_status, actor_id, occurred_at)
  values (created_ticket.clinic_id, created_ticket.branch_id, created_ticket.id, null, 'registered', actor, now());
  return to_jsonb(created_ticket);
end;
$$;
revoke all on function public.create_queue_ticket(uuid, text) from public, anon;
grant execute on function public.create_queue_ticket(uuid, text) to authenticated;

-- Queue state changes and their immutable history event must commit together.
-- Callers cannot supply an actor or bypass branch membership / explicit role denials.
create or replace function public.transition_queue_ticket(
  p_queue_ticket_id uuid,
  p_expected_status public.queue_status,
  p_to_status public.queue_status,
  p_room_id uuid default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  current_ticket public.queue_tickets%rowtype;
  updated_ticket public.queue_tickets%rowtype;
  actor uuid;
  actor_role public.staff_role;
  allowed boolean := false;
begin
  select q.* into current_ticket
  from public.queue_tickets q
  where q.id = p_queue_ticket_id
    and public.has_branch_access(q.clinic_id, q.branch_id)
  for update;
  if not found then
    raise exception 'Queue ticket not found' using errcode = 'P0002';
  end if;

  select s.id, s.role into actor, actor_role
  from public.staff_members s
  where s.auth_user_id = auth.uid()
    and s.clinic_id = current_ticket.clinic_id
    and s.branch_id = current_ticket.branch_id
    and s.active;
  if actor is null then
    raise exception 'Active branch membership required' using errcode = '42501';
  end if;
  if actor_role not in ('doctor', 'receptionist', 'nurse', 'manager')
    or not public.has_branch_permission(current_ticket.clinic_id, current_ticket.branch_id, 'queue.manage') then
    raise exception 'Queue transition permission denied' using errcode = '42501';
  end if;

  -- Repeated request after a successful response is safe; stale competing edits conflict.
  if current_ticket.status = p_to_status then
    return to_jsonb(current_ticket);
  end if;
  if current_ticket.status <> p_expected_status then
    raise exception 'Queue ticket changed; refresh and retry' using errcode = '40001';
  end if;

  allowed := case current_ticket.status
    when 'registered' then p_to_status in ('triage_waiting', 'called_to_room', 'no_show')
    when 'triage_waiting' then p_to_status in ('called_to_room', 'no_show')
    when 'called_to_room' then p_to_status in ('in_consultation', 'no_show')
    when 'in_consultation' then p_to_status in ('dispensary_waiting', 'no_show')
    when 'dispensary_waiting' then p_to_status in ('payment_waiting', 'completed', 'no_show')
    when 'payment_waiting' then p_to_status in ('completed', 'no_show')
    else false
  end;
  if not allowed then
    raise exception 'Queue status transition is not allowed' using errcode = '23514';
  end if;
  if p_room_id is not null and not exists (
    select 1 from public.consultation_rooms r
    where r.id = p_room_id and r.clinic_id = current_ticket.clinic_id
      and r.branch_id = current_ticket.branch_id and r.is_active
  ) then
    raise exception 'Room is not active in this clinic branch' using errcode = '23503';
  end if;

  update public.queue_tickets q
  set status = p_to_status,
      room_id = case when p_to_status = 'called_to_room' and p_room_id is not null then p_room_id else q.room_id end,
      called_at = case when p_to_status = 'called_to_room' then now() else q.called_at end,
      completed_at = case when p_to_status in ('completed', 'no_show') then now() else q.completed_at end,
      updated_at = now()
  where q.id = current_ticket.id
  returning q.* into updated_ticket;

  insert into public.queue_events (
    clinic_id, branch_id, queue_ticket_id, from_status, to_status,
    room_id, note, actor_id, occurred_at
  ) values (
    current_ticket.clinic_id, current_ticket.branch_id, current_ticket.id,
    current_ticket.status, p_to_status, updated_ticket.room_id,
    left(nullif(trim(p_note), ''), 500), actor, now()
  );

  return to_jsonb(updated_ticket);
end;
$$;

revoke all on function public.transition_queue_ticket(uuid, public.queue_status, public.queue_status, uuid, text) from public, anon;
grant execute on function public.transition_queue_ticket(uuid, public.queue_status, public.queue_status, uuid, text) to authenticated;

commit;
