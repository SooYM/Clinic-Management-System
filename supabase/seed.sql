-- Seed initial clinic, branch, auth users, staff members, and default permissions.
BEGIN;

INSERT INTO public.clinics (id, name, country_code, timezone, currency, settings)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  'Kumo Clinic HQ',
  'MY',
  'Asia/Kuala_Lumpur',
  'MYR',
  '{"tagline": "Medical & Aesthetic Specialist"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.branches (id, clinic_id, name, code, address, phone, is_active)
VALUES (
  'd0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'KL Sentral Branch',
  'KL_CENTRAL',
  '{"street": "Level 12, KL Sentral", "city": "Kuala Lumpur", "state": "Wilayah Persekutuan", "postcode": "50470"}'::jsonb,
  '+60 3-2274 8888',
  true
) ON CONFLICT (id) DO NOTHING;

-- Auth users
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@kumo.clinic'),
  ('00000000-0000-4000-8000-000000000002', 'doctor@kumo.clinic'),
  ('00000000-0000-4000-8000-000000000003', 'marcus@kumo.clinic'),
  ('00000000-0000-4000-8000-000000000004', 'reception@kumo.clinic'),
  ('00000000-0000-4000-8000-000000000005', 'nurse@kumo.clinic')
ON CONFLICT (id) DO NOTHING;

-- Staff members
INSERT INTO public.staff_members (id, auth_user_id, clinic_id, branch_id, full_name, role, active, license_number) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Operations Director', 'manager', true, null),
  ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Dr. Alicia Tan', 'doctor', true, 'MCR-18293A'),
  ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Dr. Marcus Wong', 'doctor', true, 'MCR-24901B'),
  ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Sarah Lim', 'receptionist', true, null),
  ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Chloe Lim', 'nurse', true, 'NC-88219')
ON CONFLICT (id) DO NOTHING;

-- Consultation Rooms
INSERT INTO public.consultation_rooms (id, clinic_id, branch_id, room_number, attending_practitioner_id, is_active) VALUES
  ('20000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Room 01', '10000000-0000-4000-8000-000000000002', true),
  ('20000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Room 02', '10000000-0000-4000-8000-000000000003', true),
  ('20000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Suite A', null, true)
ON CONFLICT (id) DO NOTHING;

-- Seed default permissions
INSERT INTO public.role_permissions (clinic_id, branch_id, role, permission_key, is_allowed)
SELECT 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', r.role, p.permission, true
FROM (VALUES
  ('manager'::public.staff_role),
  ('doctor'::public.staff_role),
  ('receptionist'::public.staff_role),
  ('nurse'::public.staff_role)
) r(role)
CROSS JOIN (VALUES
  ('patients.read'), ('patients.write'), ('patients.identifiers.read'),
  ('queue.read'), ('queue.manage'),
  ('appointments.read'), ('appointments.manage'),
  ('rooms.read'), ('rooms.manage'),
  ('encounters.read'), ('encounters.write'),
  ('clinical_documents.issue'), ('clinical_documents.revise'), ('clinical_documents.revoke'), ('clinical_documents.print'),
  ('inventory.read'), ('inventory.manage'),
  ('billing.read'), ('billing.manage'),
  ('permissions.manage')
) p(permission)
ON CONFLICT (clinic_id, branch_id, role, permission_key) DO UPDATE SET is_allowed = true;

COMMIT;
