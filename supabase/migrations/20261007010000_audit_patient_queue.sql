begin;

-- Persist registration metadata without adding a plaintext national identifier.
alter table public.patients
  add column id_type text not null default 'nric' check (id_type in ('nric', 'passport')),
  add column first_name text,
  add column last_name text,
  add column address_line_1 text,
  add column address_line_2 text,
  add column postcode text,
  add column city text,
  add column state text,
  add column country text not null default 'Malaysia',
  add column nationality text;

-- Existing table RLS and table-level grants apply to these new columns.
-- Existing records remain readable; new calls must allocate a room.
alter table public.queue_tickets add constraint queue_consultation_requires_room
  check (status not in ('called_to_room', 'in_consultation') or room_id is not null)
  not valid;

-- Also protect installations created before the foundation occupancy index existed.
create unique index if not exists queue_one_active_ticket_per_room
  on public.queue_tickets (clinic_id, branch_id, room_id)
  where room_id is not null and status in ('called_to_room', 'in_consultation');

commit;
