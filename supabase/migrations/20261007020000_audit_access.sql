-- Permit only permissioned identifier-access events, never arbitrary audit rows.
begin;

create function public.record_patient_identifier_access(p_patient_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare
  v_patient public.patients%rowtype;
  v_actor uuid;
begin
  select * into v_patient from public.patients
  where id = p_patient_id and archived_at is null;

  if not found or auth.uid() is null then
    raise exception 'Patient access denied' using errcode = '42501';
  end if;
  if not public.has_branch_permission(v_patient.clinic_id, v_patient.branch_id, 'patients.read')
     or not public.has_branch_permission(v_patient.clinic_id, v_patient.branch_id, 'patients.identifiers.read') then
    raise exception 'Identifier access denied' using errcode = '42501';
  end if;
  v_actor := public.current_staff_member_id(v_patient.clinic_id, v_patient.branch_id);
  if v_actor is null then
    raise exception 'Active staff membership required' using errcode = '42501';
  end if;

  insert into public.audit_events (clinic_id, branch_id, actor_id, action, entity_type, entity_id, metadata)
  values (v_patient.clinic_id, v_patient.branch_id, v_actor, 'patients.identifier.read', 'patient',
          p_patient_id, '{"data_class":"national_identifier"}'::jsonb);
end;
$$;

revoke all on function public.record_patient_identifier_access(uuid) from public, anon;
grant execute on function public.record_patient_identifier_access(uuid) to authenticated;

commit;
