-- Initial multi-tenant foundation. Do not seed real patient/staff PII.
-- National identifiers are ciphertext plus a keyed/hash duplicate key supplied by the server.
begin;
set local search_path = public, extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

create type public.staff_role as enum ('doctor','receptionist','nurse','manager');
create type public.appointment_status as enum ('booked','confirmed','arrived','cancelled','no_show','completed');
create type public.queue_status as enum ('registered','triage_waiting','called_to_room','in_consultation','dispensary_waiting','payment_waiting','completed','no_show');
create type public.encounter_status as enum ('open','signed','amended','voided');
create type public.clinical_document_type as enum ('medical_certificate','referral_letter','lab_requisition');
create type public.clinical_document_status as enum ('active','revoked');
create type public.inventory_movement_type as enum ('receipt','dispense','adjustment','transfer_in','transfer_out','waste','return');
create type public.invoice_status as enum ('draft','issued','partially_paid','paid','voided','refunded');
create type public.payment_status as enum ('pending','succeeded','failed','voided','refunded');
create type public.notification_channel as enum ('whatsapp','email');
create type public.notification_status as enum ('queued','sending','sent','delivered','failed','cancelled');

create table public.clinics (
 id uuid primary key default gen_random_uuid(), name text not null,
 country_code char(2) not null default 'MY' check(country_code='MY'),
 timezone text not null default 'Asia/Kuala_Lumpur', currency char(3) not null default 'MYR' check(currency='MYR'),
 settings jsonb not null default '{}'::jsonb check(jsonb_typeof(settings)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.branches (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics on delete restrict,
 name text not null, code text not null, address jsonb not null default '{}'::jsonb check(jsonb_typeof(address)='object'), phone text,
 is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(clinic_id,code), unique(id,clinic_id)
);
-- One row is one staff member's access to one branch, matching the auth integration contract.
create table public.staff_members (
 id uuid primary key default gen_random_uuid(), auth_user_id uuid not null references auth.users(id) on delete restrict,
 clinic_id uuid not null, branch_id uuid not null, full_name text not null, role public.staff_role not null,
 active boolean not null default true, license_number text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(auth_user_id,clinic_id,branch_id), unique(id,clinic_id,branch_id),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete restrict
);
create index staff_members_auth_lookup on public.staff_members(auth_user_id,clinic_id,branch_id) where active;
create table public.role_permissions (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null,
 role public.staff_role not null, permission_key text not null check(permission_key ~ '^[a-z][a-z0-9_.:-]{1,99}$'),
 is_allowed boolean not null default false, updated_by uuid references public.staff_members(id) on delete set null,
 updated_at timestamptz not null default now(), unique(clinic_id,branch_id,role,permission_key),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete cascade
);

create function public.has_branch_access(p_clinic_id uuid,p_branch_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.staff_members s where s.auth_user_id=(select auth.uid()) and s.clinic_id=p_clinic_id and s.branch_id=p_branch_id and s.active)
$$;
create function public.has_clinic_access(p_clinic_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.staff_members s where s.auth_user_id=(select auth.uid()) and s.clinic_id=p_clinic_id and s.active)
$$;
create function public.is_branch_manager(p_clinic_id uuid,p_branch_id uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.staff_members s where s.auth_user_id=(select auth.uid()) and s.clinic_id=p_clinic_id and s.branch_id=p_branch_id and s.active and s.role='manager')
$$;
create function public.current_staff_member_id(p_clinic_id uuid,p_branch_id uuid) returns uuid
language sql stable security definer set search_path=pg_catalog,public as $$
 select s.id from public.staff_members s where s.auth_user_id=(select auth.uid()) and s.clinic_id=p_clinic_id and s.branch_id=p_branch_id and s.active limit 1
$$;
-- RLS helpers are security-definer functions: never expose them to anonymous callers.
revoke all on function public.has_branch_access(uuid,uuid) from public,anon;
revoke all on function public.has_clinic_access(uuid) from public,anon;
revoke all on function public.is_branch_manager(uuid,uuid) from public,anon;
revoke all on function public.current_staff_member_id(uuid,uuid) from public,anon;
grant execute on function public.has_branch_access(uuid,uuid) to authenticated;
grant execute on function public.has_clinic_access(uuid) to authenticated;
grant execute on function public.is_branch_manager(uuid,uuid) to authenticated;
grant execute on function public.current_staff_member_id(uuid,uuid) to authenticated;
-- No module access is implied by branch membership or by a role name. A branch
-- permission must be explicitly enabled in role_permissions; missing rows deny.
create function public.has_branch_permission(p_clinic_id uuid,p_branch_id uuid,p_permission_key text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(
  select 1 from public.staff_members s
  join public.role_permissions rp on rp.clinic_id=s.clinic_id and rp.branch_id=s.branch_id and rp.role=s.role
  where s.auth_user_id=(select auth.uid()) and s.clinic_id=p_clinic_id and s.branch_id=p_branch_id
    and s.active and rp.permission_key=p_permission_key and rp.is_allowed
 )
$$;
revoke all on function public.has_branch_permission(uuid,uuid,text) from public,anon;
grant execute on function public.has_branch_permission(uuid,uuid,text) to authenticated;

create table public.patients (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null,
 medical_record_number text not null, national_id_ciphertext text, national_id_hash bytea,
 full_name text not null, date_of_birth date, gender text check(gender in ('female','male','other','unknown')),
 phone text, email text, blood_group text check(blood_group in ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
 allergies jsonb not null default '[]'::jsonb check(jsonb_typeof(allergies)='array'),
 chronic_conditions jsonb not null default '[]'::jsonb check(jsonb_typeof(chronic_conditions)='array'),
 pdpa_consent_at timestamptz, pdpa_consent_version text, created_by uuid references public.staff_members(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
 unique(clinic_id,branch_id,medical_record_number), unique(id,clinic_id,branch_id),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete restrict
);
create unique index patients_national_id_hash_unique on public.patients(clinic_id,national_id_hash) where national_id_hash is not null and archived_at is null;
create index patients_name_search on public.patients(clinic_id,branch_id,lower(full_name));
create index patients_phone_search on public.patients(clinic_id,branch_id,phone) where phone is not null;

create table public.consultation_rooms (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null,
 room_number text not null, attending_practitioner_id uuid, is_active boolean not null default true, created_at timestamptz not null default now(),
 unique(clinic_id,branch_id,room_number), unique(id,clinic_id,branch_id),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete restrict,
 foreign key(attending_practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create table public.appointments (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid not null,
 practitioner_id uuid not null, room_id uuid, starts_at timestamptz not null, ends_at timestamptz not null,
 status public.appointment_status not null default 'booked', reason text, notes text,
 created_by uuid references public.staff_members(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), cancelled_at timestamptz,
 check(ends_at>starts_at), unique(id,clinic_id,branch_id),
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict,
 foreign key(practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict,
 foreign key(room_id,clinic_id,branch_id) references public.consultation_rooms(id,clinic_id,branch_id) on delete restrict
);
create index appointments_calendar on public.appointments(clinic_id,branch_id,starts_at) where status not in ('cancelled','no_show');
create index appointments_patient_history on public.appointments(patient_id,starts_at desc);
alter table public.appointments add constraint appointments_no_practitioner_overlap
 exclude using gist (clinic_id with =, branch_id with =, practitioner_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
 where (status not in ('cancelled','no_show'));
alter table public.appointments add constraint appointments_no_room_overlap
 exclude using gist (clinic_id with =, branch_id with =, room_id with =, tstzrange(starts_at,ends_at,'[)') with &&)
 where (room_id is not null and status not in ('cancelled','no_show'));

create table public.queue_tickets (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid not null, appointment_id uuid,
 ticket_number text not null, status public.queue_status not null default 'registered', priority smallint not null default 0 check(priority between 0 and 9),
 room_id uuid, practitioner_id uuid, registered_at timestamptz not null default now(), called_at timestamptz, completed_at timestamptz,
 created_by uuid references public.staff_members(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(clinic_id,branch_id,ticket_number), unique(id,clinic_id,branch_id),
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict,
 foreign key(appointment_id,clinic_id,branch_id) references public.appointments(id,clinic_id,branch_id) on delete restrict,
 foreign key(room_id,clinic_id,branch_id) references public.consultation_rooms(id,clinic_id,branch_id) on delete restrict,
 foreign key(practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index queue_active_order on public.queue_tickets(clinic_id,branch_id,priority desc,registered_at) where status in ('registered','triage_waiting','called_to_room','in_consultation','dispensary_waiting','payment_waiting');
-- A patient can have only one open visit at a branch; the partial unique index
-- also closes the concurrent double-check-in race in create_queue_ticket.
create unique index queue_one_active_ticket_per_patient on public.queue_tickets(clinic_id,branch_id,patient_id)
 where status in ('registered','triage_waiting','called_to_room','in_consultation','dispensary_waiting','payment_waiting');
-- Prevent two active calls/consultations from occupying a single room at once.
create unique index queue_one_active_ticket_per_room on public.queue_tickets(clinic_id,branch_id,room_id)
 where room_id is not null and status in ('called_to_room','in_consultation');
create index queue_patient_history on public.queue_tickets(patient_id,registered_at desc);
create table public.queue_events (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, queue_ticket_id uuid not null,
 from_status public.queue_status, to_status public.queue_status not null, room_id uuid, practitioner_id uuid, note text,
 actor_id uuid references public.staff_members(id) on delete set null, occurred_at timestamptz not null default now(),
 foreign key(queue_ticket_id,clinic_id,branch_id) references public.queue_tickets(id,clinic_id,branch_id) on delete restrict,
 foreign key(room_id,clinic_id,branch_id) references public.consultation_rooms(id,clinic_id,branch_id) on delete restrict,
 foreign key(practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index queue_events_history on public.queue_events(queue_ticket_id,occurred_at);

create table public.encounters (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid not null,
 queue_ticket_id uuid, appointment_id uuid, practitioner_id uuid not null, status public.encounter_status not null default 'open',
 chief_complaint text, subjective text, objective jsonb not null default '{}'::jsonb check(jsonb_typeof(objective)='object'),
 assessment text, plan text, diagnosis_codes jsonb not null default '[]'::jsonb check(jsonb_typeof(diagnosis_codes)='array'),
 signed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,clinic_id,branch_id),
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict,
 foreign key(queue_ticket_id,clinic_id,branch_id) references public.queue_tickets(id,clinic_id,branch_id) on delete restrict,
 foreign key(appointment_id,clinic_id,branch_id) references public.appointments(id,clinic_id,branch_id) on delete restrict,
 foreign key(practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index encounter_patient_history on public.encounters(patient_id,created_at desc);
create table public.medication_orders (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, encounter_id uuid not null, patient_id uuid not null,
 prescribed_by uuid not null, medication_name text not null, dose text, route text, frequency text, quantity numeric(12,3) not null check(quantity>0),
 days_supply integer check(days_supply is null or days_supply>0), instructions text, created_at timestamptz not null default now(),
 foreign key(encounter_id,clinic_id,branch_id) references public.encounters(id,clinic_id,branch_id) on delete restrict,
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict,
 foreign key(prescribed_by,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index medication_orders_patient on public.medication_orders(patient_id,created_at desc);

create table public.clinical_documents (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid not null, encounter_id uuid,
 document_type public.clinical_document_type not null, document_number text not null, status public.clinical_document_status not null default 'active',
 current_version integer not null default 1 check(current_version>0), issued_by uuid not null, issued_at timestamptz not null default now(),
 revoked_at timestamptz, revoked_by uuid, revocation_reason text, unique(clinic_id,branch_id,document_number), unique(id,clinic_id,branch_id),
 check((status='active' and revoked_at is null) or (status='revoked' and revoked_at is not null)),
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict,
 foreign key(encounter_id,clinic_id,branch_id) references public.encounters(id,clinic_id,branch_id) on delete restrict,
 foreign key(issued_by,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict,
 foreign key(revoked_by,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create table public.clinical_document_versions (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, document_id uuid not null,
 version_number integer not null check(version_number>0), content jsonb not null check(jsonb_typeof(content)='object'),
 content_sha256 bytea not null check(octet_length(content_sha256)=32), change_reason text, created_by uuid not null, created_at timestamptz not null default now(),
 unique(document_id,version_number), unique(id,clinic_id,branch_id),
 foreign key(document_id,clinic_id,branch_id) references public.clinical_documents(id,clinic_id,branch_id) on delete restrict,
 foreign key(created_by,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index clinical_document_versions_history on public.clinical_document_versions(document_id,version_number desc);
create table public.document_verification_tokens (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, document_version_id uuid not null,
 token_sha256 bytea not null unique check(octet_length(token_sha256)=32), expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now(),
 foreign key(document_version_id,clinic_id,branch_id) references public.clinical_document_versions(id,clinic_id,branch_id) on delete restrict
);
create table public.document_print_logs (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, document_version_id uuid not null,
 printed_by uuid not null, purpose text, printed_at timestamptz not null default now(),
 foreign key(document_version_id,clinic_id,branch_id) references public.clinical_document_versions(id,clinic_id,branch_id) on delete restrict,
 foreign key(printed_by,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index document_print_logs_history on public.document_print_logs(document_version_id,printed_at desc);

create table public.inventory_items (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, sku text not null, name text not null,
 category text not null check(category in ('medication','aesthetic_consumable','retail','other')), unit text not null default 'unit',
 minimum_par_level numeric(12,3) not null default 0 check(minimum_par_level>=0), is_active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(clinic_id,branch_id,sku), unique(id,clinic_id,branch_id),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete restrict
);
create table public.inventory_batches (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, inventory_item_id uuid not null,
 batch_number text not null, expires_on date, quantity_on_hand numeric(12,3) not null default 0 check(quantity_on_hand>=0), received_at timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(inventory_item_id,batch_number), unique(id,clinic_id,branch_id),
 foreign key(inventory_item_id,clinic_id,branch_id) references public.inventory_items(id,clinic_id,branch_id) on delete restrict
);
create index inventory_batches_fefo on public.inventory_batches(clinic_id,branch_id,inventory_item_id,expires_on nulls last,received_at) where quantity_on_hand>0;
create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, inventory_item_id uuid not null, batch_id uuid,
 movement_type public.inventory_movement_type not null, quantity_delta numeric(12,3) not null check(quantity_delta<>0), reference_type text, reference_id uuid,
 reason text, actor_id uuid references public.staff_members(id) on delete set null, occurred_at timestamptz not null default now(),
 foreign key(inventory_item_id,clinic_id,branch_id) references public.inventory_items(id,clinic_id,branch_id) on delete restrict,
 foreign key(batch_id,clinic_id,branch_id) references public.inventory_batches(id,clinic_id,branch_id) on delete restrict
);
create index inventory_movements_history on public.inventory_movements(inventory_item_id,occurred_at desc);

create table public.treatment_packages (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid not null,
 package_name text not null, total_sessions integer not null check(total_sessions>0), purchase_date date not null default current_date,
 expiry_date date, amount_paid numeric(12,2) not null check(amount_paid>=0), currency char(3) not null default 'MYR' check(currency='MYR'),
 created_by uuid references public.staff_members(id) on delete set null, created_at timestamptz not null default now(), unique(id,clinic_id,branch_id),
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict
);
create index treatment_packages_patient on public.treatment_packages(patient_id,purchase_date desc);
create table public.package_redemptions (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, package_id uuid not null,
 encounter_id uuid, practitioner_id uuid not null, session_number integer not null check(session_number>0), notes text, redeemed_at timestamptz not null default now(),
 foreign key(package_id,clinic_id,branch_id) references public.treatment_packages(id,clinic_id,branch_id) on delete restrict,
 foreign key(encounter_id,clinic_id,branch_id) references public.encounters(id,clinic_id,branch_id) on delete restrict,
 foreign key(practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict,
 unique(package_id,session_number)
);
create index package_redemptions_history on public.package_redemptions(package_id,redeemed_at desc);

create table public.invoices (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid not null, encounter_id uuid,
 invoice_number text not null, status public.invoice_status not null default 'draft', subtotal numeric(12,2) not null default 0 check(subtotal>=0),
 tax_amount numeric(12,2) not null default 0 check(tax_amount>=0), discount_amount numeric(12,2) not null default 0 check(discount_amount>=0),
 total_amount numeric(12,2) not null default 0 check(total_amount>=0), currency char(3) not null default 'MYR' check(currency='MYR'),
 issued_at timestamptz, due_at timestamptz, created_by uuid references public.staff_members(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(clinic_id,branch_id,invoice_number), unique(id,clinic_id,branch_id),
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict,
 foreign key(encounter_id,clinic_id,branch_id) references public.encounters(id,clinic_id,branch_id) on delete restrict
);
create index invoices_patient_history on public.invoices(patient_id,created_at desc);
create table public.invoice_items (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, invoice_id uuid not null,
 description text not null, item_type text not null check(item_type in ('consultation','medication','procedure','package','retail','other')),
 quantity numeric(12,3) not null check(quantity>0), unit_price numeric(12,2) not null check(unit_price>=0), tax_rate numeric(7,5) not null default 0 check(tax_rate between 0 and 1),
 line_total numeric(12,2) not null check(line_total>=0), practitioner_id uuid, created_at timestamptz not null default now(),
 foreign key(invoice_id,clinic_id,branch_id) references public.invoices(id,clinic_id,branch_id) on delete restrict,
 foreign key(practitioner_id,clinic_id,branch_id) references public.staff_members(id,clinic_id,branch_id) on delete restrict
);
create index invoice_items_invoice on public.invoice_items(invoice_id);
create table public.payments (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, invoice_id uuid not null,
 amount numeric(12,2) not null check(amount>0), currency char(3) not null default 'MYR' check(currency='MYR'),
 method text not null check(method in ('cash','card','duitnow_qr','bank_transfer','insurance','deposit','package_credit','other')),
 status public.payment_status not null default 'pending', provider text, provider_reference text, idempotency_key text,
 received_by uuid references public.staff_members(id) on delete set null, paid_at timestamptz, created_at timestamptz not null default now(),
 foreign key(invoice_id,clinic_id,branch_id) references public.invoices(id,clinic_id,branch_id) on delete restrict,
 unique(clinic_id,idempotency_key)
);
create index payments_invoice on public.payments(invoice_id,created_at);

create table public.notification_outbox (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, patient_id uuid,
 channel public.notification_channel not null, template_key text not null, recipient_ciphertext text not null, payload_ciphertext text not null,
 status public.notification_status not null default 'queued', scheduled_at timestamptz not null default now(), attempt_count integer not null default 0 check(attempt_count>=0),
 last_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,clinic_id,branch_id),
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete restrict,
 foreign key(patient_id,clinic_id,branch_id) references public.patients(id,clinic_id,branch_id) on delete restrict
);
create index notification_outbox_due on public.notification_outbox(status,scheduled_at) where status in ('queued','failed');
create table public.notification_delivery_logs (
 id uuid primary key default gen_random_uuid(), clinic_id uuid not null, branch_id uuid not null, notification_id uuid not null,
 provider_message_id text, status public.notification_status not null, provider_status text, error_code text, occurred_at timestamptz not null default now(),
 foreign key(notification_id,clinic_id,branch_id) references public.notification_outbox(id,clinic_id,branch_id) on delete restrict
);
create index notification_delivery_history on public.notification_delivery_logs(notification_id,occurred_at desc);

create table public.audit_events (
 id bigint generated always as identity primary key, clinic_id uuid not null, branch_id uuid, actor_id uuid references public.staff_members(id) on delete set null,
 action text not null check(action ~ '^[a-z][a-z0-9_.:-]{1,99}$'), entity_type text not null, entity_id uuid, request_id text,
 metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'), occurred_at timestamptz not null default now(),
 foreign key(clinic_id) references public.clinics(id) on delete restrict,
 foreign key(branch_id,clinic_id) references public.branches(id,clinic_id) on delete restrict
);
create index audit_events_branch_timeline on public.audit_events(clinic_id,branch_id,occurred_at desc);
create index audit_events_entity on public.audit_events(clinic_id,entity_type,entity_id,occurred_at desc);

-- Append-only evidence/history tables. Corrections use new rows or document revocation.
create function public.reject_mutation() returns trigger language plpgsql set search_path=pg_catalog,public
as $$ begin raise exception '% is append-only',tg_table_name using errcode='55000'; end $$;
create trigger clinical_document_versions_immutable before update or delete on public.clinical_document_versions for each row execute function public.reject_mutation();
create trigger document_print_logs_immutable before update or delete on public.document_print_logs for each row execute function public.reject_mutation();
create trigger queue_events_immutable before update or delete on public.queue_events for each row execute function public.reject_mutation();
create trigger inventory_movements_immutable before update or delete on public.inventory_movements for each row execute function public.reject_mutation();
create trigger package_redemptions_immutable before update or delete on public.package_redemptions for each row execute function public.reject_mutation();
create trigger notification_delivery_logs_immutable before update or delete on public.notification_delivery_logs for each row execute function public.reject_mutation();
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function public.reject_mutation();

-- Hash caller-held random tokens; return status only, never patient/document fields.
create function public.verify_clinical_document(p_token text) returns table(status text)
language sql stable security definer set search_path=pg_catalog,public,extensions as $$
 select case when d.status='revoked' or t.revoked_at is not null or (t.expires_at is not null and t.expires_at<=now()) then 'revoked' else 'valid' end
 from public.document_verification_tokens t join public.clinical_document_versions v on v.id=t.document_version_id
 join public.clinical_documents d on d.id=v.document_id
 where p_token is not null and length(p_token) between 32 and 512 and t.token_sha256=extensions.digest(convert_to(p_token,'UTF8'),'sha256')
 union all
 select 'revoked' where p_token is null or length(p_token)<32 or length(p_token)>512 or not exists(
  select 1 from public.document_verification_tokens t where t.token_sha256=extensions.digest(convert_to(p_token,'UTF8'),'sha256'))
 limit 1
$$;
revoke all on function public.verify_clinical_document(text) from public;
grant execute on function public.verify_clinical_document(text) to anon,authenticated;

-- RLS is on every application table. staff_members binds auth user to one clinic+branch.
do $$ declare t text; begin
 foreach t in array array['clinics','branches','staff_members','role_permissions','patients','consultation_rooms','appointments','queue_tickets','queue_events','encounters','medication_orders','clinical_documents','clinical_document_versions','document_verification_tokens','document_print_logs','inventory_items','inventory_batches','inventory_movements','treatment_packages','package_redemptions','invoices','invoice_items','payments','notification_outbox','notification_delivery_logs','audit_events'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;
create policy clinics_read on public.clinics for select to authenticated using(public.has_clinic_access(id));
create policy branches_read on public.branches for select to authenticated using(public.has_branch_access(clinic_id,id));
create policy branches_manage on public.branches for all to authenticated using(public.is_branch_manager(clinic_id,id)) with check(public.is_branch_manager(clinic_id,id));
create policy staff_members_read on public.staff_members for select to authenticated using(public.has_branch_access(clinic_id,branch_id));
create policy staff_members_manage on public.staff_members for all to authenticated using(public.is_branch_manager(clinic_id,branch_id)) with check(public.is_branch_manager(clinic_id,branch_id));
create policy role_permissions_read on public.role_permissions for select to authenticated using(public.has_branch_access(clinic_id,branch_id));
create policy role_permissions_manage on public.role_permissions for all to authenticated using(public.is_branch_manager(clinic_id,branch_id)) with check(public.is_branch_manager(clinic_id,branch_id));
-- Queue permissions: `queue.read` grants ticket reads. `queue.manage` is
-- required by the create/transition RPCs; direct authenticated writes to
-- queue_tickets are intentionally denied so ticket + queue_events stay atomic.
create policy queue_tickets_read on public.queue_tickets for select to authenticated
 using(public.has_branch_permission(clinic_id,branch_id,'queue.read'));
-- Operational tables are separately gated by explicit role_permissions keys.
-- Each table has SELECT, INSERT, UPDATE, and DELETE checks. Missing permission
-- rows (and false rows) deny access, regardless of staff role or branch access.
do $$
declare p record;
begin
 for p in select * from (values
  ('patients','patients.read','patients.write','patients.delete'),
  ('consultation_rooms','rooms.read','rooms.manage','rooms.manage'),
  ('appointments','appointments.read','appointments.manage','appointments.manage'),
  ('encounters','encounters.read','encounters.write','encounters.delete'),
  ('medication_orders','prescriptions.read','prescriptions.write','prescriptions.delete'),
  ('clinical_documents','documents.read','documents.write','documents.delete'),
  ('inventory_items','inventory.read','inventory.manage','inventory.manage'),
  ('inventory_batches','inventory.read','inventory.manage','inventory.manage'),
  ('treatment_packages','packages.read','packages.manage','packages.manage'),
  ('invoices','billing.read','billing.write','billing.delete'),
  ('invoice_items','billing.read','billing.write','billing.delete'),
  ('payments','billing.read','billing.write','billing.delete'),
  ('notification_outbox','notifications.read','notifications.manage','notifications.manage')
 ) as rules(table_name,read_permission,write_permission,delete_permission)
 loop
  execute format('create policy %I on public.%I for select to authenticated using(public.has_branch_permission(clinic_id,branch_id,%L))',p.table_name||'_read',p.table_name,p.read_permission);
  execute format('create policy %I on public.%I for insert to authenticated with check(public.has_branch_permission(clinic_id,branch_id,%L))',p.table_name||'_insert',p.table_name,p.write_permission);
  execute format('create policy %I on public.%I for update to authenticated using(public.has_branch_permission(clinic_id,branch_id,%L)) with check(public.has_branch_permission(clinic_id,branch_id,%L))',p.table_name||'_update',p.table_name,p.write_permission,p.write_permission);
  execute format('create policy %I on public.%I for delete to authenticated using(public.has_branch_permission(clinic_id,branch_id,%L))',p.table_name||'_delete',p.table_name,p.delete_permission);
 end loop;

 -- Histories are readable by their module's readers, but only trusted server
 -- handlers may append rows after validating the initiating staff permission.
 for p in select * from (values
  ('queue_events','queue.read'),
  ('clinical_document_versions','documents.read'),
  ('document_print_logs','documents.read'),
  ('inventory_movements','inventory.read'),
  ('package_redemptions','packages.read'),
  ('notification_delivery_logs','notifications.read')
 ) as rules(table_name,read_permission)
 loop
  execute format('create policy %I on public.%I for select to authenticated using(public.has_branch_permission(clinic_id,branch_id,%L))',p.table_name||'_read',p.table_name,p.read_permission);
 end loop;
end $$;
create policy audit_events_read on public.audit_events for select to authenticated using(branch_id is not null and public.has_branch_permission(clinic_id,branch_id,'audit.read'));
-- Audit records are written by trusted server-side code, never directly by a browser session.
create function public.bind_audit_actor() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is not null then
  select s.id into new.actor_id from public.staff_members s
  where s.auth_user_id=auth.uid() and s.clinic_id=new.clinic_id and s.branch_id=new.branch_id and s.active;
  if new.actor_id is null then raise exception 'Active staff membership required for audit event' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger audit_events_bind_actor before insert on public.audit_events for each row execute function public.bind_audit_actor();
grant select,insert,update,delete on all tables in schema public to authenticated;
grant usage,select on all sequences in schema public to authenticated;
revoke all on all tables in schema public from anon;
revoke all on public.document_verification_tokens from anon,authenticated;
revoke insert,update,delete on public.audit_events from authenticated;
revoke insert,update,delete on public.queue_tickets from authenticated;
revoke insert,update,delete on public.queue_events, public.clinical_document_versions, public.document_print_logs,
 public.inventory_movements, public.package_redemptions, public.notification_delivery_logs from authenticated;
-- Trusted server handlers own ledger/history writes and must validate role, branch, and business invariants.
grant select,insert,update,delete on all tables in schema public to service_role;
commit;
