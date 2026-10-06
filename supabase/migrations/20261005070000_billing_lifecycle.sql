begin;

-- Invoices and receipts are durable. Only cashier-confirmed cash is settled by
-- this release; card/QR/bank/insurance require provider or reconciliation work.
alter table public.payments
  add constraint payments_id_clinic_branch_key unique (id, clinic_id, branch_id);

create table public.billing_receipts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  invoice_id uuid not null,
  payment_id uuid not null unique,
  receipt_number text not null,
  snapshot jsonb not null check(jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 65536),
  issued_at timestamptz not null default now(),
  created_by uuid not null references public.staff_members(id) on delete restrict,
  unique(clinic_id, branch_id, receipt_number),
  unique(id, clinic_id, branch_id),
  foreign key(invoice_id, clinic_id, branch_id) references public.invoices(id, clinic_id, branch_id) on delete restrict,
  foreign key(payment_id, clinic_id, branch_id) references public.payments(id, clinic_id, branch_id) on delete restrict
);

create table public.billing_receipt_print_logs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null,
  branch_id uuid not null,
  receipt_id uuid not null,
  printed_by uuid not null references public.staff_members(id) on delete restrict,
  purpose text,
  printed_at timestamptz not null default now(),
  foreign key(receipt_id, clinic_id, branch_id) references public.billing_receipts(id, clinic_id, branch_id) on delete restrict
);
create index billing_receipts_invoice on public.billing_receipts(invoice_id, issued_at desc);
create index billing_receipt_print_history on public.billing_receipt_print_logs(receipt_id, printed_at desc);
alter table public.billing_receipts enable row level security;
alter table public.billing_receipt_print_logs enable row level security;
create policy billing_receipts_read on public.billing_receipts for select to authenticated
  using(public.has_branch_permission(clinic_id, branch_id, 'billing.read'));
create policy billing_receipt_print_logs_read on public.billing_receipt_print_logs for select to authenticated
  using(public.has_branch_permission(clinic_id, branch_id, 'billing.read'));
grant select on public.billing_receipts, public.billing_receipt_print_logs to authenticated;
revoke insert, update, delete on public.invoices, public.invoice_items, public.payments,
  public.billing_receipts, public.billing_receipt_print_logs from authenticated;
revoke all on public.billing_receipts, public.billing_receipt_print_logs from anon;
create trigger billing_receipts_immutable before update or delete on public.billing_receipts
  for each row execute function public.reject_mutation();
create trigger billing_receipt_print_logs_immutable before update or delete on public.billing_receipt_print_logs
  for each row execute function public.reject_mutation();

create or replace function public.issue_invoice(
  p_invoice_id uuid,
  p_invoice_number text,
  p_patient_id uuid,
  p_items jsonb,
  p_discount_amount numeric default 0
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  actor_id uuid;
  staff_row public.staff_members%rowtype;
  membership_count integer;
  patient_row public.patients%rowtype;
  invoice_row public.invoices%rowtype;
  item jsonb;
  item_count integer := 0;
  subtotal numeric(12,2) := 0;
  discount numeric(12,2) := coalesce(p_discount_amount, 0);
  description text;
  item_type text;
  quantity numeric(12,3);
  unit_price numeric(12,2);
  tax_rate numeric(7,5);
  line_subtotal numeric(12,2);
  line_tax numeric(12,2);
  tax_total numeric(12,2) := 0;
begin
  select count(*) into membership_count from public.staff_members where auth_user_id=auth.uid() and active;
  if membership_count <> 1 then raise exception 'Exactly one active clinic membership is required' using errcode='42501'; end if;
  select * into staff_row from public.staff_members where auth_user_id=auth.uid() and active limit 1;
  actor_id := staff_row.id;
  select p.* into patient_row from public.patients p
   where p.id=p_patient_id and p.clinic_id=staff_row.clinic_id and p.branch_id=staff_row.branch_id;
  if not found then raise exception 'Patient not found in active branch' using errcode='P0002'; end if;
  if not public.has_branch_permission(patient_row.clinic_id, patient_row.branch_id, 'billing.write') then
    raise exception 'Billing permission denied' using errcode='42501';
  end if;
  if p_invoice_id is null or p_invoice_number is null or p_invoice_number !~ '^INV-[A-Z0-9-]{6,56}$'
    or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100
    or discount < 0 then
    raise exception 'Invalid invoice data' using errcode='22023';
  end if;

  insert into public.invoices(id,clinic_id,branch_id,patient_id,invoice_number,status,created_by)
  values(p_invoice_id,patient_row.clinic_id,patient_row.branch_id,patient_row.id,p_invoice_number,'draft',actor_id)
  returning * into invoice_row;

  for item in select value from jsonb_array_elements(p_items) loop
    item_count := item_count + 1;
    description := trim(item->>'description');
    item_type := item->>'itemType';
    quantity := (item->>'quantity')::numeric;
    unit_price := (item->>'unitPrice')::numeric;
    tax_rate := coalesce((item->>'taxRate')::numeric, 0);
    if description is null or length(description) not between 1 and 200
      or item_type not in ('consultation','medication','procedure','package','retail','other')
      or quantity <= 0 or quantity > 100000 or unit_price < 0 or unit_price > 10000000
      or tax_rate < 0 or tax_rate > 1 then
      raise exception 'Invalid invoice line' using errcode='22023';
    end if;
    line_subtotal := round(quantity * unit_price, 2);
    line_tax := round(line_subtotal * tax_rate, 2);
    subtotal := subtotal + line_subtotal;
    tax_total := tax_total + line_tax;
    insert into public.invoice_items(clinic_id,branch_id,invoice_id,description,item_type,quantity,unit_price,tax_rate,line_total)
    values(patient_row.clinic_id,patient_row.branch_id,invoice_row.id,description,item_type,quantity,unit_price,tax_rate,line_subtotal + line_tax);
  end loop;
  if discount > subtotal + tax_total then raise exception 'Discount exceeds invoice value' using errcode='22023'; end if;
  update public.invoices set subtotal=subtotal, tax_amount=tax_total, discount_amount=discount,
    total_amount=subtotal+tax_total-discount, status='issued', issued_at=now(), updated_at=now()
   where id=invoice_row.id returning * into invoice_row;
  return jsonb_build_object('invoice_id',invoice_row.id,'invoice_number',invoice_row.invoice_number,
    'patient_id',invoice_row.patient_id,'status',invoice_row.status,'subtotal',invoice_row.subtotal,
    'tax_amount',invoice_row.tax_amount,'discount_amount',invoice_row.discount_amount,
    'total_amount',invoice_row.total_amount,'currency',invoice_row.currency,'issued_at',invoice_row.issued_at);
end;
$$;

create or replace function public.record_cash_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_idempotency_key text,
  p_receipt_number text
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  invoice_row public.invoices%rowtype;
  actor_id uuid;
  paid_before numeric(12,2);
  payment_row public.payments%rowtype;
  receipt_row public.billing_receipts%rowtype;
  receipt_snapshot jsonb;
  items_snapshot jsonb;
begin
  select i.* into invoice_row from public.invoices i
   where i.id=p_invoice_id and public.has_branch_access(i.clinic_id,i.branch_id) for update;
  if not found then raise exception 'Invoice not found' using errcode='P0002'; end if;
  actor_id := public.current_staff_member_id(invoice_row.clinic_id, invoice_row.branch_id);
  if actor_id is null or not public.has_branch_permission(invoice_row.clinic_id,invoice_row.branch_id,'billing.write') then
    raise exception 'Billing permission denied' using errcode='42501';
  end if;
  if p_idempotency_key is not null then
    select * into payment_row from public.payments
      where clinic_id=invoice_row.clinic_id and idempotency_key=p_idempotency_key;
    if payment_row.id is not null then
      if payment_row.invoice_id<>invoice_row.id or payment_row.amount<>p_amount or payment_row.status<>'succeeded' then
        raise exception 'Idempotency key was already used for another payment' using errcode='23505';
      end if;
      select * into receipt_row from public.billing_receipts where payment_id=payment_row.id;
      if receipt_row.id is not null then
        return jsonb_build_object('payment_id',payment_row.id,'receipt_id',receipt_row.id,
          'receipt_number',receipt_row.receipt_number,'snapshot',receipt_row.snapshot,'idempotent',true);
      end if;
      raise exception 'Existing payment has no receipt record' using errcode='23514';
    end if;
  end if;
  if invoice_row.status not in ('issued','partially_paid') or p_amount is null or p_amount <= 0
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 128
    or p_receipt_number is null or p_receipt_number !~ '^RCP-[A-Z0-9-]{6,56}$' then
    raise exception 'Invalid cash payment' using errcode='22023';
  end if;

  select coalesce(sum(amount),0) into paid_before from public.payments
    where invoice_id=invoice_row.id and status='succeeded';
  if p_amount > invoice_row.total_amount-paid_before then
    raise exception 'Payment exceeds amount due' using errcode='22023';
  end if;
  insert into public.payments(clinic_id,branch_id,invoice_id,amount,currency,method,status,provider,idempotency_key,received_by,paid_at)
  values(invoice_row.clinic_id,invoice_row.branch_id,invoice_row.id,p_amount,'MYR','cash','succeeded','manual-cashier',p_idempotency_key,actor_id,now())
  on conflict(clinic_id,idempotency_key) do nothing
  returning * into payment_row;
  if payment_row.id is null then
    select * into payment_row from public.payments where clinic_id=invoice_row.clinic_id and idempotency_key=p_idempotency_key;
    if payment_row.invoice_id<>invoice_row.id or payment_row.amount<>p_amount or payment_row.status<>'succeeded' then
      raise exception 'Idempotency key was already used for another payment' using errcode='23505';
    end if;
    select * into receipt_row from public.billing_receipts where payment_id=payment_row.id;
    if receipt_row.id is not null then
      return jsonb_build_object('payment_id',payment_row.id,'receipt_id',receipt_row.id,
        'receipt_number',receipt_row.receipt_number,'snapshot',receipt_row.snapshot,'idempotent',true);
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('description',description,'item_type',item_type,
    'quantity',quantity,'unit_price',unit_price,'line_total',line_total) order by created_at,id),'[]'::jsonb)
    into items_snapshot from public.invoice_items where invoice_id=invoice_row.id;
  receipt_snapshot := jsonb_build_object(
    'receiptNumber',p_receipt_number,'invoiceNumber',invoice_row.invoice_number,
    'patientId',invoice_row.patient_id,'issuedAt',now(),'currency','MYR',
    'paymentMethod','Cash','paymentAmount',p_amount,'invoiceTotal',invoice_row.total_amount,
    'items',items_snapshot,'clinicId',invoice_row.clinic_id,'branchId',invoice_row.branch_id);
  insert into public.billing_receipts(clinic_id,branch_id,invoice_id,payment_id,receipt_number,snapshot,created_by)
  values(invoice_row.clinic_id,invoice_row.branch_id,invoice_row.id,payment_row.id,p_receipt_number,receipt_snapshot,actor_id)
  returning * into receipt_row;
  update public.invoices set status=case when paid_before+p_amount=total_amount then 'paid'::public.invoice_status else 'partially_paid'::public.invoice_status end,
    updated_at=now() where id=invoice_row.id;
  return jsonb_build_object('payment_id',payment_row.id,'receipt_id',receipt_row.id,
    'receipt_number',receipt_row.receipt_number,'snapshot',receipt_row.snapshot,'idempotent',false);
end;
$$;

create or replace function public.record_billing_receipt_print(p_receipt_id uuid,p_purpose text default null)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  receipt_row public.billing_receipts%rowtype;
  actor_id uuid;
  log_id uuid;
  log_time timestamptz;
begin
  select r.* into receipt_row from public.billing_receipts r
   where r.id=p_receipt_id and public.has_branch_access(r.clinic_id,r.branch_id);
  if not found then raise exception 'Receipt not found' using errcode='P0002'; end if;
  actor_id := public.current_staff_member_id(receipt_row.clinic_id,receipt_row.branch_id);
  if actor_id is null or not public.has_branch_permission(receipt_row.clinic_id,receipt_row.branch_id,'billing.read') then
    raise exception 'Receipt permission denied' using errcode='42501';
  end if;
  insert into public.billing_receipt_print_logs(clinic_id,branch_id,receipt_id,printed_by,purpose)
  values(receipt_row.clinic_id,receipt_row.branch_id,receipt_row.id,actor_id,left(nullif(trim(p_purpose),''),120))
  returning id,printed_at into log_id,log_time;
  return jsonb_build_object('print_id',log_id,'printed_at',log_time,'receipt_id',receipt_row.id);
end;
$$;

revoke all on function public.issue_invoice(uuid,text,uuid,jsonb,numeric) from public,anon;
revoke all on function public.record_cash_payment(uuid,numeric,text,text) from public,anon;
revoke all on function public.record_billing_receipt_print(uuid,text) from public,anon;
grant execute on function public.issue_invoice(uuid,text,uuid,jsonb,numeric) to authenticated;
grant execute on function public.record_cash_payment(uuid,numeric,text,text) to authenticated;
grant execute on function public.record_billing_receipt_print(uuid,text) to authenticated;
commit;
