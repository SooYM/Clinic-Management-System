begin;

-- Inventory quantities and immutable movement evidence change together. All
-- operations serialize on the item row; dispense then locks eligible batches
-- in FEFO order (earliest expiry first, null expiry last).
create or replace function public.receive_inventory_batch(
  p_inventory_item_id uuid,
  p_batch_number text,
  p_expires_on date,
  p_quantity numeric,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_count integer;
  item_row public.inventory_items%rowtype;
  batch_row public.inventory_batches%rowtype;
  movement_row public.inventory_movements%rowtype;
begin
  if p_inventory_item_id is null or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
    or p_batch_number is null or length(trim(p_batch_number)) not between 1 and 120
    or (p_reference_type is not null and length(p_reference_type) > 80)
    or coalesce(length(p_reason), 0) > 500 then
    raise exception 'Invalid inventory receipt' using errcode = '22023';
  end if;
  select count(*) into actor_count from public.staff_members s
   where s.auth_user_id = auth.uid() and s.active;
  if actor_count <> 1 then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select s.id into actor_id from public.staff_members s
   where s.auth_user_id = auth.uid() and s.active and public.has_branch_access(s.clinic_id, s.branch_id);
  if actor_id is null then raise exception 'Active branch membership required' using errcode = '42501'; end if;

  select i.* into item_row from public.inventory_items i
   where i.id = p_inventory_item_id and i.is_active
     and public.has_branch_access(i.clinic_id, i.branch_id)
   for update;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  if actor_id <> public.current_staff_member_id(item_row.clinic_id, item_row.branch_id)
    or not public.has_branch_permission(item_row.clinic_id, item_row.branch_id, 'inventory.manage') then
    raise exception 'Inventory management permission denied' using errcode = '42501';
  end if;

  select b.* into batch_row from public.inventory_batches b
   where b.inventory_item_id = item_row.id and b.batch_number = trim(p_batch_number)
   for update;
  if found then
    if batch_row.expires_on is distinct from p_expires_on then
      raise exception 'Batch expiry does not match existing batch' using errcode = '23514';
    end if;
    update public.inventory_batches set quantity_on_hand = quantity_on_hand + p_quantity
     where id = batch_row.id returning * into batch_row;
  else
    insert into public.inventory_batches(clinic_id, branch_id, inventory_item_id, batch_number, expires_on, quantity_on_hand)
    values (item_row.clinic_id, item_row.branch_id, item_row.id, trim(p_batch_number), p_expires_on, p_quantity)
    returning * into batch_row;
  end if;
  insert into public.inventory_movements(clinic_id, branch_id, inventory_item_id, batch_id, movement_type,
    quantity_delta, reference_type, reference_id, reason, actor_id)
  values (item_row.clinic_id, item_row.branch_id, item_row.id, batch_row.id, 'receipt', p_quantity,
    nullif(trim(p_reference_type), ''), p_reference_id, nullif(trim(p_reason), ''), actor_id)
  returning * into movement_row;
  return jsonb_build_object('batch', to_jsonb(batch_row), 'movement', to_jsonb(movement_row));
end;
$$;

create or replace function public.adjust_inventory_batch(
  p_inventory_item_id uuid,
  p_batch_id uuid,
  p_quantity_delta numeric,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_count integer;
  item_row public.inventory_items%rowtype;
  batch_row public.inventory_batches%rowtype;
  movement_row public.inventory_movements%rowtype;
begin
  if p_inventory_item_id is null or p_batch_id is null or p_quantity_delta is null or p_quantity_delta = 0
    or abs(p_quantity_delta) > 1000000000 or p_reason is null or length(trim(p_reason)) not between 1 and 500
    or (p_reference_type is not null and length(p_reference_type) > 80) then
    raise exception 'Invalid inventory adjustment' using errcode = '22023';
  end if;
  select count(*) into actor_count from public.staff_members s where s.auth_user_id = auth.uid() and s.active;
  if actor_count <> 1 then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select s.id into actor_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active
    and public.has_branch_access(s.clinic_id, s.branch_id);
  if actor_id is null then raise exception 'Active branch membership required' using errcode = '42501'; end if;

  select i.* into item_row from public.inventory_items i
   where i.id = p_inventory_item_id and i.is_active and public.has_branch_access(i.clinic_id, i.branch_id)
   for update;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  if actor_id <> public.current_staff_member_id(item_row.clinic_id, item_row.branch_id)
    or not public.has_branch_permission(item_row.clinic_id, item_row.branch_id, 'inventory.manage') then
    raise exception 'Inventory management permission denied' using errcode = '42501';
  end if;
  select b.* into batch_row from public.inventory_batches b where b.id = p_batch_id
    and b.inventory_item_id = item_row.id and b.clinic_id = item_row.clinic_id and b.branch_id = item_row.branch_id
    for update;
  if not found then raise exception 'Inventory batch not found' using errcode = 'P0002'; end if;
  if batch_row.quantity_on_hand + p_quantity_delta < 0 then
    raise exception 'Adjustment would create negative stock' using errcode = 'P0001';
  end if;
  update public.inventory_batches set quantity_on_hand = quantity_on_hand + p_quantity_delta
   where id = batch_row.id returning * into batch_row;
  insert into public.inventory_movements(clinic_id, branch_id, inventory_item_id, batch_id, movement_type,
    quantity_delta, reference_type, reference_id, reason, actor_id)
  values (item_row.clinic_id, item_row.branch_id, item_row.id, batch_row.id, 'adjustment', p_quantity_delta,
    nullif(trim(p_reference_type), ''), p_reference_id, trim(p_reason), actor_id)
  returning * into movement_row;
  return jsonb_build_object('batch', to_jsonb(batch_row), 'movement', to_jsonb(movement_row));
end;
$$;

create or replace function public.dispense_inventory(
  p_inventory_item_id uuid,
  p_quantity numeric,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_count integer;
  item_row public.inventory_items%rowtype;
  batch_row public.inventory_batches%rowtype;
  movement_row public.inventory_movements%rowtype;
  remaining numeric(12,3);
  take_quantity numeric(12,3);
  allocations jsonb := '[]'::jsonb;
begin
  if p_inventory_item_id is null or p_quantity is null or p_quantity <= 0 or p_quantity > 1000000000
    or (p_reference_type is not null and length(p_reference_type) > 80)
    or coalesce(length(p_reason), 0) > 500 then
    raise exception 'Invalid inventory dispense' using errcode = '22023';
  end if;
  select count(*) into actor_count from public.staff_members s where s.auth_user_id = auth.uid() and s.active;
  if actor_count <> 1 then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select s.id into actor_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active
    and public.has_branch_access(s.clinic_id, s.branch_id);
  if actor_id is null then raise exception 'Active branch membership required' using errcode = '42501'; end if;

  select i.* into item_row from public.inventory_items i
   where i.id = p_inventory_item_id and i.is_active and public.has_branch_access(i.clinic_id, i.branch_id)
   for update;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  if actor_id <> public.current_staff_member_id(item_row.clinic_id, item_row.branch_id)
    or not public.has_branch_permission(item_row.clinic_id, item_row.branch_id, 'inventory.manage') then
    raise exception 'Inventory management permission denied' using errcode = '42501';
  end if;

  remaining := p_quantity;
  for batch_row in
    select b.* from public.inventory_batches b
    where b.inventory_item_id = item_row.id and b.clinic_id = item_row.clinic_id
      and b.branch_id = item_row.branch_id and b.quantity_on_hand > 0
      and (b.expires_on is null or b.expires_on >= current_date)
    order by b.expires_on asc nulls last, b.received_at asc, b.id asc
    for update
  loop
    exit when remaining <= 0;
    take_quantity := least(batch_row.quantity_on_hand, remaining);
    update public.inventory_batches set quantity_on_hand = quantity_on_hand - take_quantity
      where id = batch_row.id returning * into batch_row;
    insert into public.inventory_movements(clinic_id, branch_id, inventory_item_id, batch_id, movement_type,
      quantity_delta, reference_type, reference_id, reason, actor_id)
    values (item_row.clinic_id, item_row.branch_id, item_row.id, batch_row.id, 'dispense', -take_quantity,
      nullif(trim(p_reference_type), ''), p_reference_id, nullif(trim(p_reason), ''), actor_id)
    returning * into movement_row;
    allocations := allocations || jsonb_build_array(jsonb_build_object(
      'batch_id', batch_row.id, 'quantity', take_quantity, 'movement_id', movement_row.id
    ));
    remaining := remaining - take_quantity;
  end loop;
  if remaining > 0 then raise exception 'Insufficient unexpired stock' using errcode = 'P0001'; end if;
  return jsonb_build_object('inventory_item_id', item_row.id, 'quantity', p_quantity, 'allocations', allocations);
end;
$$;

create or replace function public.purchase_treatment_package(
  p_patient_id uuid,
  p_package_name text,
  p_total_sessions integer,
  p_amount_paid numeric,
  p_expiry_date date default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_count integer;
  patient_row public.patients%rowtype;
  package_row public.treatment_packages%rowtype;
begin
  if p_patient_id is null or p_package_name is null or length(trim(p_package_name)) not between 2 and 160
    or p_total_sessions is null or p_total_sessions not between 1 and 1000
    or p_amount_paid is null or p_amount_paid < 0 or p_amount_paid > 1000000000
    or (p_expiry_date is not null and p_expiry_date < current_date) then
    raise exception 'Invalid treatment package' using errcode = '22023';
  end if;
  select count(*) into actor_count from public.staff_members s where s.auth_user_id = auth.uid() and s.active;
  if actor_count <> 1 then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select s.id into actor_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active
    and public.has_branch_access(s.clinic_id, s.branch_id);
  if actor_id is null then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select p.* into patient_row from public.patients p where p.id = p_patient_id
    and public.has_branch_access(p.clinic_id, p.branch_id);
  if not found then raise exception 'Patient not found' using errcode = 'P0002'; end if;
  if actor_id <> public.current_staff_member_id(patient_row.clinic_id, patient_row.branch_id)
    or not public.has_branch_permission(patient_row.clinic_id, patient_row.branch_id, 'packages.manage') then
    raise exception 'Package management permission denied' using errcode = '42501';
  end if;
  insert into public.treatment_packages(clinic_id, branch_id, patient_id, package_name,
    total_sessions, purchase_date, expiry_date, amount_paid, currency, created_by)
  values (patient_row.clinic_id, patient_row.branch_id, patient_row.id, trim(p_package_name),
    p_total_sessions, current_date, p_expiry_date, p_amount_paid, 'MYR', actor_id)
  returning * into package_row;
  return to_jsonb(package_row);
end;
$$;

create or replace function public.redeem_treatment_package(
  p_package_id uuid,
  p_practitioner_id uuid,
  p_encounter_id uuid default null,
  p_notes text default null
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  actor_count integer;
  package_row public.treatment_packages%rowtype;
  encounter_row public.encounters%rowtype;
  practitioner_row public.staff_members%rowtype;
  redeemed_count integer;
  redemption_row public.package_redemptions%rowtype;
begin
  if p_package_id is null or p_practitioner_id is null or coalesce(length(p_notes), 0) > 1000 then
    raise exception 'Invalid package redemption' using errcode = '22023';
  end if;
  select count(*) into actor_count from public.staff_members s where s.auth_user_id = auth.uid() and s.active;
  if actor_count <> 1 then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select s.id into actor_id from public.staff_members s where s.auth_user_id = auth.uid() and s.active
    and public.has_branch_access(s.clinic_id, s.branch_id);
  if actor_id is null then raise exception 'Active branch membership required' using errcode = '42501'; end if;
  select p.* into package_row from public.treatment_packages p where p.id = p_package_id
    and public.has_branch_access(p.clinic_id, p.branch_id) for update;
  if not found then raise exception 'Treatment package not found' using errcode = 'P0002'; end if;
  if actor_id <> public.current_staff_member_id(package_row.clinic_id, package_row.branch_id)
    or not public.has_branch_permission(package_row.clinic_id, package_row.branch_id, 'packages.manage') then
    raise exception 'Package management permission denied' using errcode = '42501';
  end if;
  if package_row.expiry_date is not null and package_row.expiry_date < current_date then
    raise exception 'Treatment package has expired' using errcode = 'P0001';
  end if;
  select s.* into practitioner_row from public.staff_members s where s.id = p_practitioner_id
    and s.clinic_id = package_row.clinic_id and s.branch_id = package_row.branch_id
    and s.active and s.role in ('doctor', 'nurse');
  if not found then raise exception 'Active practitioner not found in this branch' using errcode = '23503'; end if;
  if p_encounter_id is not null then
    select e.* into encounter_row from public.encounters e where e.id = p_encounter_id
      and e.clinic_id = package_row.clinic_id and e.branch_id = package_row.branch_id
      and e.patient_id = package_row.patient_id;
    if not found then raise exception 'Encounter does not belong to package patient and branch' using errcode = '23503'; end if;
  end if;
  select count(*) into redeemed_count from public.package_redemptions r where r.package_id = package_row.id;
  if redeemed_count >= package_row.total_sessions then
    raise exception 'All package sessions have been redeemed' using errcode = 'P0001';
  end if;
  insert into public.package_redemptions(clinic_id, branch_id, package_id, encounter_id,
    practitioner_id, session_number, notes)
  values (package_row.clinic_id, package_row.branch_id, package_row.id, p_encounter_id,
    practitioner_row.id, redeemed_count + 1, nullif(trim(p_notes), ''))
  returning * into redemption_row;
  return jsonb_build_object('redemption', to_jsonb(redemption_row), 'sessions_redeemed', redeemed_count + 1,
    'sessions_remaining', package_row.total_sessions - redeemed_count - 1);
end;
$$;

revoke all on function public.receive_inventory_batch(uuid, text, date, numeric, text, uuid, text) from public, anon;
revoke all on function public.adjust_inventory_batch(uuid, uuid, numeric, text, text, uuid) from public, anon;
revoke all on function public.dispense_inventory(uuid, numeric, text, uuid, text) from public, anon;
revoke all on function public.purchase_treatment_package(uuid, text, integer, numeric, date) from public, anon;
revoke all on function public.redeem_treatment_package(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.receive_inventory_batch(uuid, text, date, numeric, text, uuid, text) to authenticated;
grant execute on function public.adjust_inventory_batch(uuid, uuid, numeric, text, text, uuid) to authenticated;
grant execute on function public.dispense_inventory(uuid, numeric, text, uuid, text) to authenticated;
grant execute on function public.purchase_treatment_package(uuid, text, integer, numeric, date) to authenticated;
grant execute on function public.redeem_treatment_package(uuid, uuid, uuid, text) to authenticated;

commit;
