-- Standalone PostgreSQL Setup & Seed Script for Clinic Management System
-- Compatible with local PostgreSQL 15, 16, 17, 18 & Supabase.

BEGIN;

-- 1. Prerequisites: schemas, extensions, and auth shims
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon;
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid,
    '00000000-0000-4000-8000-000000000001'::uuid
  );
$$ LANGUAGE sql STABLE;

SET search_path = public, extensions;

-- 2. Enumerated Types
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
    CREATE TYPE public.staff_role AS ENUM ('doctor','receptionist','nurse','manager');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE public.appointment_status AS ENUM ('booked','confirmed','arrived','cancelled','no_show','completed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'queue_status') THEN
    CREATE TYPE public.queue_status AS ENUM ('registered','triage_waiting','called_to_room','in_consultation','dispensary_waiting','payment_waiting','completed','no_show');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'encounter_status') THEN
    CREATE TYPE public.encounter_status AS ENUM ('open','signed','amended','voided');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinical_document_type') THEN
    CREATE TYPE public.clinical_document_type AS ENUM ('medical_certificate','referral_letter','lab_requisition');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'clinical_document_status') THEN
    CREATE TYPE public.clinical_document_status AS ENUM ('active','revoked');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_movement_type') THEN
    CREATE TYPE public.inventory_movement_type AS ENUM ('receipt','dispense','adjustment','transfer_in','transfer_out','waste','return');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invoice_status') THEN
    CREATE TYPE public.invoice_status AS ENUM ('draft','issued','partially_paid','paid','voided','refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE public.payment_status AS ENUM ('pending','succeeded','failed','voided','refunded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE public.notification_channel AS ENUM ('whatsapp','email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_status') THEN
    CREATE TYPE public.notification_status AS ENUM ('queued','sending','sent','delivered','failed','cancelled');
  END IF;
END $$;

-- 3. Core Multi-Tenant Tables
CREATE TABLE IF NOT EXISTS public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code char(2) NOT NULL DEFAULT 'MY' CHECK(country_code='MY'),
  timezone text NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  currency char(3) NOT NULL DEFAULT 'MYR' CHECK(currency='MYR'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(settings)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics ON DELETE RESTRICT,
  name text NOT NULL,
  code text NOT NULL,
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(address)='object'),
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, code),
  UNIQUE(id, clinic_id)
);

CREATE TABLE IF NOT EXISTS public.staff_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  clinic_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  full_name text NOT NULL,
  role public.staff_role NOT NULL,
  active boolean NOT NULL DEFAULT true,
  license_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id, clinic_id, branch_id),
  UNIQUE(id, clinic_id, branch_id),
  FOREIGN KEY(branch_id, clinic_id) REFERENCES public.branches(id, clinic_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  role public.staff_role NOT NULL,
  permission_key text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, branch_id, role, permission_key),
  FOREIGN KEY(branch_id, clinic_id) REFERENCES public.branches(id, clinic_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.consultation_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  room_number text NOT NULL,
  attending_practitioner_id uuid,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, branch_id, room_number),
  UNIQUE(id, clinic_id, branch_id),
  FOREIGN KEY(branch_id, clinic_id) REFERENCES public.branches(id, clinic_id) ON DELETE RESTRICT,
  FOREIGN KEY(attending_practitioner_id, clinic_id, branch_id) REFERENCES public.staff_members(id, clinic_id, branch_id) ON DELETE RESTRICT
);

-- 4. Patients Master Table
CREATE TABLE IF NOT EXISTS public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  medical_record_number text NOT NULL,
  id_type text NOT NULL DEFAULT 'nric' CHECK(id_type IN ('nric','passport')),
  ic_number text,
  national_id_ciphertext text,
  national_id_hash bytea,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  full_name text NOT NULL,
  date_of_birth date,
  gender text CHECK(gender IN ('female','male','other','unknown')),
  phone text,
  email text,
  blood_group text CHECK(blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','unknown')),
  allergies jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(allergies)='array'),
  chronic_conditions jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(chronic_conditions)='array'),
  address_line_1 text,
  address_line_2 text,
  postcode text,
  city text,
  state text,
  country text NOT NULL DEFAULT 'Malaysia',
  nationality text NOT NULL DEFAULT 'Malaysian',
  pdpa_consent_at timestamptz,
  pdpa_consent_version text,
  created_by uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE(clinic_id, branch_id, medical_record_number),
  UNIQUE(id, clinic_id, branch_id),
  FOREIGN KEY(branch_id, clinic_id) REFERENCES public.branches(id, clinic_id) ON DELETE RESTRICT
);

-- Idempotent column migrations for existing databases
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS id_type text DEFAULT 'nric',
  ADD COLUMN IF NOT EXISTS ic_number text,
  ADD COLUMN IF NOT EXISTS first_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS postcode text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Malaysia',
  ADD COLUMN IF NOT EXISTS nationality text DEFAULT 'Malaysian';

-- 5. Appointments & Queue Tickets
CREATE TABLE IF NOT EXISTS public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  practitioner_id uuid NOT NULL,
  room_id uuid,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status public.appointment_status NOT NULL DEFAULT 'booked',
  reason text,
  notes text,
  created_by uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK(ends_at > starts_at),
  UNIQUE(id, clinic_id, branch_id),
  FOREIGN KEY(patient_id, clinic_id, branch_id) REFERENCES public.patients(id, clinic_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY(practitioner_id, clinic_id, branch_id) REFERENCES public.staff_members(id, clinic_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY(room_id, clinic_id, branch_id) REFERENCES public.consultation_rooms(id, clinic_id, branch_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.queue_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  appointment_id uuid,
  ticket_number text NOT NULL,
  status public.queue_status NOT NULL DEFAULT 'registered',
  priority smallint NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 9),
  room_id uuid,
  practitioner_id uuid,
  registered_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.staff_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(clinic_id, branch_id, ticket_number),
  UNIQUE(id, clinic_id, branch_id),
  FOREIGN KEY(patient_id, clinic_id, branch_id) REFERENCES public.patients(id, clinic_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY(appointment_id, clinic_id, branch_id) REFERENCES public.appointments(id, clinic_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY(room_id, clinic_id, branch_id) REFERENCES public.consultation_rooms(id, clinic_id, branch_id) ON DELETE RESTRICT,
  FOREIGN KEY(practitioner_id, clinic_id, branch_id) REFERENCES public.staff_members(id, clinic_id, branch_id) ON DELETE RESTRICT
);

-- 6. Initial Clinic & Staff Seed Data
INSERT INTO public.clinics (id, name, country_code, timezone, currency, settings)
VALUES (
  'c0000000-0000-4000-8000-000000000001',
  'Clinic HQ',
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

-- Auth users: Single initial administrator account
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-4000-8000-000000000001', 'admin@clinic.local')
ON CONFLICT (id) DO NOTHING;

-- Staff members: Single administrator
INSERT INTO public.staff_members (id, auth_user_id, clinic_id, branch_id, full_name, role, active, license_number) VALUES
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Clinic Administrator', 'manager', true, null)
ON CONFLICT (id) DO NOTHING;

-- Consultation Rooms
INSERT INTO public.consultation_rooms (id, clinic_id, branch_id, room_number, attending_practitioner_id, is_active) VALUES
  ('20000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Room 01', null, true),
  ('20000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'Room 02', null, true)
ON CONFLICT (id) DO NOTHING;

-- Production deployment starts with 0 patients and 0 queue tickets.
-- Clinic Admin registers real patients and staff via front desk & administration portal.

COMMIT;
