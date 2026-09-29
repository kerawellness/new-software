-- Clinic Compass — complete SQL for a brand-new empty Supabase project.
-- Paste this whole file into Supabase → SQL Editor and press Run once.
-- Includes every table, rule, and the one-clinic signup (later logins join the first clinic).
-- Do NOT run this on a clinic database that already has tables. It will fail on CREATE TABLE.
--

-- ============================================================================
-- FILE: 20260811111247_fb1e3298-0866-45ab-a6b7-7c80a00b3269.sql
-- ============================================================================


-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','dentist','receptionist');
CREATE TYPE public.appointment_status AS ENUM ('scheduled','confirmed','cancelled','no_show');
CREATE TYPE public.flow_status AS ENUM ('schedule','waiting','engage','done');
CREATE TYPE public.request_status AS ENUM ('requested','confirmed','rescheduled','rejected');
CREATE TYPE public.treatment_status AS ENUM ('planned','in_progress','completed','cancelled');
CREATE TYPE public.invoice_status AS ENUM ('draft','unpaid','partial','paid','cancelled');
CREATE TYPE public.payment_method AS ENUM ('cash','card','upi','bank_transfer','other');
CREATE TYPE public.follow_up_status AS ENUM ('pending','scheduled','completed','overdue');
CREATE TYPE public.installment_status AS ENUM ('pending','partial','paid','overdue');

-- UTIL
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- CLINICS
CREATE TABLE public.clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  phone text,
  email text,
  logo_url text,
  patient_code_prefix text NOT NULL DEFAULT 'VSP',
  tax_enabled boolean NOT NULL DEFAULT false,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  tax_label text NOT NULL DEFAULT 'Tax',
  currency text NOT NULL DEFAULT 'INR',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  avatar_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- SECURITY DEFINER HELPERS
CREATE OR REPLACE FUNCTION public.current_clinic_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT clinic_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

-- PATIENTS
CREATE TABLE public.patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_code text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  date_of_birth date,
  gender text,
  address text,
  emergency_contact text,
  patient_type text NOT NULL DEFAULT 'regular',
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, patient_code)
);
CREATE INDEX idx_patients_clinic_name ON public.patients (clinic_id, full_name);
CREATE INDEX idx_patients_clinic_phone ON public.patients (clinic_id, phone);

CREATE TABLE public.clinic_counters (
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  prefix text NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, prefix)
);

CREATE OR REPLACE FUNCTION public.next_patient_code(_prefix text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _clinic uuid; _p text; _n integer;
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN RAISE EXCEPTION 'No clinic for user'; END IF;
  _p := COALESCE(NULLIF(_prefix,''), (SELECT patient_code_prefix FROM public.clinics WHERE id = _clinic));
  INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
  VALUES (_clinic, _p, 1)
  ON CONFLICT (clinic_id, prefix) DO UPDATE SET last_value = public.clinic_counters.last_value + 1
  RETURNING last_value INTO _n;
  RETURN _p || lpad(_n::text, 4, '0');
END; $$;

CREATE TABLE public.medical_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  condition text NOT NULL,
  category text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  substance text NOT NULL,
  allergy_type text,
  reaction text,
  severity text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  medication text NOT NULL,
  dosage text, frequency text, duration text, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.patient_habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  habit text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.case_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  note text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- APPOINTMENTS
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  dentist_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  appointment_date date NOT NULL,
  start_time time,
  end_time time,
  reason text,
  notes text,
  appointment_status public.appointment_status NOT NULL DEFAULT 'scheduled',
  flow_status public.flow_status NOT NULL DEFAULT 'schedule',
  arrived_at timestamptz,
  engaged_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_appts_clinic_date ON public.appointments (clinic_id, appointment_date);

CREATE TABLE public.online_appointment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text NOT NULL,
  email text,
  requested_date date,
  requested_time time,
  reason text,
  message text,
  status public.request_status NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CLINICAL
CREATE TABLE public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  chief_complaint text,
  clinical_notes text,
  diagnosis text,
  treatment_performed text,
  doctor_notes text,
  post_care_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.treatment_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  default_cost numeric(12,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  status public.treatment_status NOT NULL DEFAULT 'planned',
  treatment_date date NOT NULL DEFAULT CURRENT_DATE,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.care_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  name text NOT NULL,
  duration text,
  interval_months integer,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_due_date date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- BILLING
CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  invoice_number text NOT NULL,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  grand_total numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  balance_amount numeric(12,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'unpaid',
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, invoice_number)
);
CREATE TABLE public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  treatment_id uuid REFERENCES public.treatments(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  reference text,
  notes text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.installment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  number_of_installments integer NOT NULL CHECK (number_of_installments > 0),
  down_payment numeric(12,2) NOT NULL DEFAULT 0,
  installment_amount numeric(12,2) NOT NULL DEFAULT 0,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  installment_plan_id uuid NOT NULL REFERENCES public.installment_plans(id) ON DELETE CASCADE,
  due_date date NOT NULL,
  amount numeric(12,2) NOT NULL,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  status public.installment_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- payment totals trigger
CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv uuid; _paid numeric; _grand numeric;
BEGIN
  _inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO _paid FROM public.payments WHERE invoice_id = _inv;
  SELECT grand_total INTO _grand FROM public.invoices WHERE id = _inv;
  UPDATE public.invoices SET
    paid_amount = _paid,
    balance_amount = GREATEST(_grand - _paid, 0),
    status = CASE WHEN _paid <= 0 THEN 'unpaid'::public.invoice_status
                  WHEN _paid >= _grand THEN 'paid'::public.invoice_status
                  ELSE 'partial'::public.invoice_status END,
    updated_at = now()
  WHERE id = _inv;
  RETURN NULL;
END; $$;
CREATE TRIGGER trg_payments_recalc AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_totals();

-- FOLLOW UPS
CREATE TABLE public.follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  reason text NOT NULL,
  due_date date NOT NULL,
  status public.follow_up_status NOT NULL DEFAULT 'pending',
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- COMMS / ADMIN
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'appointment',
  message text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.motivation_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  quote text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.motivation_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.motivation_quotes(id) ON DELETE SET NULL,
  ack_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ack_date)
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_clinic_created ON public.audit_logs (clinic_id, created_at DESC);

-- SIGNUP TRIGGER
-- One clinic for the whole install. The first login creates it. Later logins join it.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _clinic uuid;
BEGIN
  SELECT id INTO _clinic
  FROM public.clinics
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF _clinic IS NULL THEN
    INSERT INTO public.clinics (name, email)
    VALUES (COALESCE(NEW.raw_user_meta_data->>'clinic_name','My Dental Clinic'), NEW.email)
    RETURNING id INTO _clinic;

    INSERT INTO public.motivation_quotes (clinic_id, quote) VALUES
      (_clinic, 'Every patient you see today trusts you with their health. Make it count.'),
      (_clinic, 'Small consistent care builds lifelong smiles.'),
      (_clinic, 'A calm clinic is an efficient clinic.');
  END IF;

  INSERT INTO public.profiles (id, clinic_id, name, email)
  VALUES (NEW.id, _clinic, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)), NEW.email);

  INSERT INTO public.user_roles (user_id, clinic_id, role) VALUES (NEW.id, _clinic, 'admin');

  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- UPDATED_AT TRIGGERS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinics','profiles','patients','appointments','online_appointment_requests','visits','treatments','care_plans','invoices','follow_ups','whatsapp_templates','motivation_quotes'] LOOP
    EXECUTE format('CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- GRANTS + RLS
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clinics','profiles','user_roles','patients','clinic_counters','medical_conditions','allergies','medications','patient_habits','case_notes','appointments','online_appointment_requests','visits','treatment_catalogue','treatments','care_plans','invoices','invoice_items','payments','installment_plans','installments','follow_ups','whatsapp_templates','motivation_quotes','motivation_acknowledgements','audit_logs'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
  -- clinic-scoped tables: staff of the clinic can do everything
  FOREACH t IN ARRAY ARRAY['patients','medical_conditions','allergies','medications','patient_habits','case_notes','appointments','visits','treatments','care_plans','invoices','invoice_items','payments','installment_plans','installments','follow_ups'] LOOP
    EXECUTE format($f$CREATE POLICY "clinic_staff_all" ON public.%I FOR ALL TO authenticated USING (clinic_id = public.current_clinic_id()) WITH CHECK (clinic_id = public.current_clinic_id())$f$, t);
  END LOOP;
  -- admin-managed config tables: all staff read, admins write
  FOREACH t IN ARRAY ARRAY['treatment_catalogue','whatsapp_templates','motivation_quotes'] LOOP
    EXECUTE format($f$CREATE POLICY "clinic_read" ON public.%I FOR SELECT TO authenticated USING (clinic_id = public.current_clinic_id())$f$, t);
    EXECUTE format($f$CREATE POLICY "admin_write" ON public.%I FOR ALL TO authenticated USING (clinic_id = public.current_clinic_id() AND public.is_admin()) WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_admin())$f$, t);
  END LOOP;
END $$;

CREATE POLICY "own_clinic_read" ON public.clinics FOR SELECT TO authenticated USING (id = public.current_clinic_id());
CREATE POLICY "admin_clinic_update" ON public.clinics FOR UPDATE TO authenticated USING (id = public.current_clinic_id() AND public.is_admin()) WITH CHECK (id = public.current_clinic_id() AND public.is_admin());

CREATE POLICY "clinic_profiles_read" ON public.profiles FOR SELECT TO authenticated USING (clinic_id = public.current_clinic_id());
CREATE POLICY "own_profile_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "admin_profile_manage" ON public.profiles FOR ALL TO authenticated USING (clinic_id = public.current_clinic_id() AND public.is_admin()) WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_admin());

CREATE POLICY "clinic_roles_read" ON public.user_roles FOR SELECT TO authenticated USING (clinic_id = public.current_clinic_id());
CREATE POLICY "admin_roles_manage" ON public.user_roles FOR ALL TO authenticated USING (clinic_id = public.current_clinic_id() AND public.is_admin()) WITH CHECK (clinic_id = public.current_clinic_id() AND public.is_admin());

CREATE POLICY "counters_read" ON public.clinic_counters FOR SELECT TO authenticated USING (clinic_id = public.current_clinic_id());

CREATE POLICY "clinic_requests_manage" ON public.online_appointment_requests FOR ALL TO authenticated USING (clinic_id = public.current_clinic_id()) WITH CHECK (clinic_id = public.current_clinic_id());
GRANT INSERT ON public.online_appointment_requests TO anon;
CREATE POLICY "public_can_request" ON public.online_appointment_requests FOR INSERT TO anon WITH CHECK (status = 'requested');

CREATE POLICY "own_ack_all" ON public.motivation_acknowledgements FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "clinic_audit_read" ON public.audit_logs FOR SELECT TO authenticated USING (clinic_id = public.current_clinic_id());
CREATE POLICY "clinic_audit_insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (clinic_id = public.current_clinic_id() AND user_id = auth.uid());

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;


-- ============================================================================
-- FILE: 20260811111312_2208970e-215e-4774-b2f4-eee353181e55.sql
-- ============================================================================


REVOKE EXECUTE ON FUNCTION public.current_clinic_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.next_patient_code(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.current_clinic_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_patient_code(text) TO authenticated;


-- ============================================================================
-- FILE: 20260811111333_2a8438f5-8dd4-4db1-a9fb-e17906581964.sql
-- ============================================================================


REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.recalc_invoice_totals() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;


-- ============================================================================
-- FILE: 20260816000000_public_booking_and_schema_fixes.sql
-- ============================================================================

-- Migration: Add anonymous SELECT on clinics for public appointment booking and ensure treatment_catalogue category column
-- Created: 2026-08-16

-- Allow anonymous visitors to read non-sensitive clinic branding for online booking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'clinics' AND policyname = 'public_clinic_read'
  ) THEN
    CREATE POLICY "public_clinic_read" ON public.clinics
      FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

GRANT SELECT ON public.clinics TO anon;

-- Ensure treatment_catalogue has category column with default
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'treatment_catalogue' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.treatment_catalogue ADD COLUMN category text NOT NULL DEFAULT 'general';
  END IF;
END $$;


-- ============================================================================
-- FILE: 20260816000001_atomic_invoice_counter.sql
-- ============================================================================

-- Migration: Atomic sequential invoice number generator using clinic_counters
-- Created: 2026-08-16

CREATE OR REPLACE FUNCTION public.next_invoice_number(_prefix text DEFAULT 'INV-')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE 
  _clinic uuid; 
  _p text; 
  _n integer;
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN 
    RAISE EXCEPTION 'No clinic for current user'; 
  END IF;

  _p := COALESCE(NULLIF(_prefix, ''), 'INV-');

  INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
  VALUES (_clinic, _p, 1)
  ON CONFLICT (clinic_id, prefix) DO UPDATE SET last_value = public.clinic_counters.last_value + 1
  RETURNING last_value INTO _n;

  RETURN _p || lpad(_n::text, 4, '0');
END; $$;


-- ============================================================================
-- FILE: 20260818000000_fk_indexes.sql
-- ============================================================================

-- Migration: Add relational foreign key indexes for performance
-- Created: 2026-08-18

CREATE INDEX IF NOT EXISTS idx_invoices_patient_id ON public.invoices (patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_treatments_patient_id ON public.treatments (patient_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_patient_id ON public.follow_ups (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON public.appointments (patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_dentist_id ON public.appointments (dentist_id);
CREATE INDEX IF NOT EXISTS idx_visits_patient_id ON public.visits (patient_id);


-- ============================================================================
-- FILE: 20260818000001_atomic_invoice.sql
-- ============================================================================

-- Migration: Atomic invoice creation with line items
-- Created: 2026-08-18

CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  _invoice_date date,
  _notes text,
  _patient_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _clinic uuid;
  _invoice_id uuid;
  _invoice_number text;
  _total_amount numeric(12,2) := 0;
  _tax_amount numeric(12,2) := 0;
  _grand_total numeric(12,2) := 0;
  _tax_enabled boolean;
  _tax_rate numeric(5,2);
  _item jsonb;
  _item_sum numeric(12,2);
BEGIN
  -- 1. Get current clinic ID
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN
    RAISE EXCEPTION 'No clinic session for current user';
  END IF;

  -- 2. Fetch tax settings from clinic
  SELECT tax_enabled, tax_rate INTO _tax_enabled, _tax_rate FROM public.clinics WHERE id = _clinic;

  -- 3. Loop through items to compute total_amount
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _item_sum := (_item->>'quantity')::numeric * (_item->>'unit_price')::numeric;
    _total_amount := _total_amount + _item_sum;
  END LOOP;

  -- 4. Calculate taxes
  IF _tax_enabled THEN
    _tax_amount := (_total_amount * _tax_rate) / 100;
  END IF;
  _grand_total := _total_amount + _tax_amount;

  -- 5. Generate invoice number
  _invoice_number := public.next_invoice_number();

  -- 6. Insert invoice header
  INSERT INTO public.invoices (
    clinic_id,
    patient_id,
    invoice_number,
    total_amount,
    tax_amount,
    grand_total,
    paid_amount,
    balance_amount,
    status,
    invoice_date,
    notes,
    created_by
  ) VALUES (
    _clinic,
    _patient_id,
    _invoice_number,
    _total_amount,
    _tax_amount,
    _grand_total,
    0,
    _grand_total,
    'unpaid'::public.invoice_status,
    _invoice_date,
    _notes,
    auth.uid()
  ) RETURNING id INTO _invoice_id;

  -- 7. Insert invoice items
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    INSERT INTO public.invoice_items (
      clinic_id,
      invoice_id,
      description,
      quantity,
      unit_price,
      amount
    ) VALUES (
      _clinic,
      _invoice_id,
      _item->>'description',
      (_item->>'quantity')::numeric,
      (_item->>'unit_price')::numeric,
      (_item->>'quantity')::numeric * (_item->>'unit_price')::numeric
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', _invoice_id,
    'invoice_number', _invoice_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(date, text, uuid, jsonb) TO authenticated;


-- ============================================================================
-- FILE: 20260818000002_tooth_number.sql
-- ============================================================================

-- Migration: Add tooth_number column to treatments table
-- Created: 2026-08-18

ALTER TABLE public.treatments ADD COLUMN IF NOT EXISTS tooth_number text;


-- ============================================================================
-- FILE: 20260818000003_whatsapp_triggers.sql
-- ============================================================================

-- Migration: Add trigger_event column to whatsapp_templates table
-- Created: 2026-08-18

ALTER TABLE public.whatsapp_templates ADD COLUMN IF NOT EXISTS trigger_event text;


-- ============================================================================
-- FILE: 20260818000004_pending_patients.sql
-- ============================================================================

-- Create pending_patients table to store temporary/unregistered patient details
CREATE TABLE public.pending_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  email text,
  date_of_birth date,
  gender text,
  address text,
  emergency_contact text,
  patient_type text NOT NULL DEFAULT 'regular',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create search indexes for fast lookups
CREATE INDEX idx_pending_patients_clinic_name ON public.pending_patients (clinic_id, full_name);
CREATE INDEX idx_pending_patients_clinic_phone ON public.pending_patients (clinic_id, phone);

-- Automatically update updated_at column on edit
CREATE TRIGGER trg_pending_patients_updated BEFORE UPDATE ON public.pending_patients 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE public.pending_patients ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_patients TO authenticated;
GRANT ALL ON public.pending_patients TO service_role;

-- RLS Policy: clinic staff can do everything
CREATE POLICY "clinic_staff_all" ON public.pending_patients FOR ALL TO authenticated 
USING (clinic_id = public.current_clinic_id()) 
WITH CHECK (clinic_id = public.current_clinic_id());

-- Modify appointments table
-- 1. Make patient_id nullable (so appointment can exist without a registered patient)
ALTER TABLE public.appointments ALTER COLUMN patient_id DROP NOT NULL;

-- 2. Add pending_patient_id column referencing pending_patients
ALTER TABLE public.appointments ADD COLUMN pending_patient_id uuid REFERENCES public.pending_patients(id) ON DELETE SET NULL;

-- 3. Add index for pending_patient_id
CREATE INDEX idx_appointments_pending_patient ON public.appointments (pending_patient_id);

-- 4. Create flow completion trigger function
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion()
RETURNS TRIGGER AS $$
DECLARE
  _pending_patient record;
  _new_patient_id uuid;
  _prefix text;
  _counter_val integer;
  _patient_code text;
BEGIN
  -- Trigger executes only if flow is marked 'done' and there is an associated pending patient
  IF NEW.flow_status = 'done' AND OLD.flow_status IS DISTINCT FROM 'done' AND NEW.pending_patient_id IS NOT NULL AND NEW.patient_id IS NULL THEN
    
    -- Fetch details of the pending patient
    SELECT * INTO _pending_patient FROM public.pending_patients WHERE id = NEW.pending_patient_id;
    
    IF FOUND THEN
      -- Generate permanent patient code using the clinic's prefix configuration
      SELECT patient_code_prefix INTO _prefix FROM public.clinics WHERE id = _pending_patient.clinic_id;
      _prefix := COALESCE(NULLIF(_prefix, ''), 'PT');
      
      INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
      VALUES (_pending_patient.clinic_id, _prefix, 1)
      ON CONFLICT (clinic_id, prefix) 
      DO UPDATE SET last_value = public.clinic_counters.last_value + 1
      RETURNING last_value INTO _counter_val;
      
      _patient_code := _prefix || lpad(_counter_val::text, 4, '0');
      
      -- Insert records to the permanent patients table
      INSERT INTO public.patients (
        clinic_id,
        patient_code,
        full_name,
        phone,
        email,
        date_of_birth,
        gender,
        address,
        emergency_contact,
        patient_type,
        status,
        created_by
      ) VALUES (
        _pending_patient.clinic_id,
        _patient_code,
        _pending_patient.full_name,
        _pending_patient.phone,
        _pending_patient.email,
        _pending_patient.date_of_birth,
        _pending_patient.gender,
        _pending_patient.address,
        _pending_patient.emergency_contact,
        _pending_patient.patient_type,
        'active',
        NEW.created_by
      ) RETURNING id INTO _new_patient_id;

      -- Update the appointment record details to point to the newly registered patient
      NEW.patient_id := _new_patient_id;
      NEW.pending_patient_id := NULL;

      -- Delete the temporary patient record
      DELETE FROM public.pending_patients WHERE id = _pending_patient.id;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bind flow completion trigger to appointments table
CREATE TRIGGER trg_appointment_flow_completion
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion();


-- ============================================================================
-- FILE: 20260818000005_fix_flow_completion_trigger.sql
-- ============================================================================

-- 1. Drop existing single-phase trigger
DROP TRIGGER IF EXISTS trg_appointment_flow_completion ON public.appointments;

-- 2. Re-define BEFORE UPDATE trigger function (only handles registration and linking)
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion()
RETURNS TRIGGER AS $$
DECLARE
  _pending_patient record;
  _new_patient_id uuid;
  _prefix text;
  _counter_val integer;
  _patient_code text;
BEGIN
  IF NEW.flow_status = 'done' AND OLD.flow_status IS DISTINCT FROM 'done' AND NEW.pending_patient_id IS NOT NULL AND NEW.patient_id IS NULL THEN
    
    -- Fetch details of the pending patient
    SELECT * INTO _pending_patient FROM public.pending_patients WHERE id = NEW.pending_patient_id;
    
    IF FOUND THEN
      -- Generate permanent patient code using the clinic's prefix configuration
      SELECT patient_code_prefix INTO _prefix FROM public.clinics WHERE id = _pending_patient.clinic_id;
      _prefix := COALESCE(NULLIF(_prefix, ''), 'PT');
      
      INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
      VALUES (_pending_patient.clinic_id, _prefix, 1)
      ON CONFLICT (clinic_id, prefix) 
      DO UPDATE SET last_value = public.clinic_counters.last_value + 1
      RETURNING last_value INTO _counter_val;
      
      _patient_code := _prefix || lpad(_counter_val::text, 4, '0');
      
      -- Insert records to the permanent patients table
      INSERT INTO public.patients (
        clinic_id,
        patient_code,
        full_name,
        phone,
        email,
        date_of_birth,
        gender,
        address,
        emergency_contact,
        patient_type,
        status,
        created_by
      ) VALUES (
        _pending_patient.clinic_id,
        _patient_code,
        _pending_patient.full_name,
        _pending_patient.phone,
        _pending_patient.email,
        _pending_patient.date_of_birth,
        _pending_patient.gender,
        _pending_patient.address,
        _pending_patient.emergency_contact,
        _pending_patient.patient_type,
        'active',
        NEW.created_by
      ) RETURNING id INTO _new_patient_id;

      -- Update the appointment record details to point to the newly registered patient
      NEW.patient_id := _new_patient_id;
      NEW.pending_patient_id := NULL;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bind BEFORE UPDATE trigger back to appointments table
CREATE TRIGGER trg_appointment_flow_completion
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion();

-- 3. Create AFTER UPDATE trigger function (handles pending patient cleanup)
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion_after()
RETURNS TRIGGER AS $$
BEGIN
  -- If we successfully transitioned to done and mapped to a permanent patient, delete the pending record
  IF OLD.pending_patient_id IS NOT NULL AND NEW.pending_patient_id IS NULL AND NEW.flow_status = 'done' THEN
    DELETE FROM public.pending_patients WHERE id = OLD.pending_patient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Bind AFTER UPDATE trigger to appointments table
CREATE TRIGGER trg_appointment_flow_completion_after
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion_after();


-- ============================================================================
-- FILE: 20260818000006_robust_patient_code.sql
-- ============================================================================

-- Re-define BEFORE UPDATE trigger function with self-healing unique code loop
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion()
RETURNS TRIGGER AS $$
DECLARE
  _pending_patient record;
  _new_patient_id uuid;
  _prefix text;
  _counter_val integer;
  _patient_code text;
BEGIN
  IF NEW.flow_status = 'done' AND OLD.flow_status IS DISTINCT FROM 'done' AND NEW.pending_patient_id IS NOT NULL AND NEW.patient_id IS NULL THEN
    
    -- Fetch details of the pending patient
    SELECT * INTO _pending_patient FROM public.pending_patients WHERE id = NEW.pending_patient_id;
    
    IF FOUND THEN
      -- Generate permanent patient code using the clinic's prefix configuration
      SELECT patient_code_prefix INTO _prefix FROM public.clinics WHERE id = _pending_patient.clinic_id;
      _prefix := COALESCE(NULLIF(_prefix, ''), 'PT');
      
      -- Self-healing loop: increment counter until we find a unique code
      LOOP
        INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
        VALUES (_pending_patient.clinic_id, _prefix, 1)
        ON CONFLICT (clinic_id, prefix) 
        DO UPDATE SET last_value = public.clinic_counters.last_value + 1
        RETURNING last_value INTO _counter_val;
        
        _patient_code := _prefix || lpad(_counter_val::text, 4, '0');
        
        -- Exit loop only if the code does not exist in the patients table
        IF NOT EXISTS (
          SELECT 1 FROM public.patients 
          WHERE clinic_id = _pending_patient.clinic_id 
            AND patient_code = _patient_code
        ) THEN
          EXIT;
        END IF;
      END LOOP;
      
      -- Insert records to the permanent patients table
      INSERT INTO public.patients (
        clinic_id,
        patient_code,
        full_name,
        phone,
        email,
        date_of_birth,
        gender,
        address,
        emergency_contact,
        patient_type,
        status,
        created_by
      ) VALUES (
        _pending_patient.clinic_id,
        _patient_code,
        _pending_patient.full_name,
        _pending_patient.phone,
        _pending_patient.email,
        _pending_patient.date_of_birth,
        _pending_patient.gender,
        _pending_patient.address,
        _pending_patient.emergency_contact,
        _pending_patient.patient_type,
        'active',
        COALESCE(auth.uid(), NEW.created_by)
      ) RETURNING id INTO _new_patient_id;

      -- Update the appointment record details to point to the newly registered patient
      NEW.patient_id := _new_patient_id;
      NEW.pending_patient_id := NULL;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ============================================================================
-- FILE: 20260818000007_no_action_constraint.sql
-- ============================================================================

-- 1. Drop the existing foreign key constraint with ON DELETE SET NULL
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_pending_patient_id_fkey;

-- 2. Re-add the constraint with default ON DELETE NO ACTION behavior
ALTER TABLE public.appointments 
  ADD CONSTRAINT appointments_pending_patient_id_fkey 
  FOREIGN KEY (pending_patient_id) 
  REFERENCES public.pending_patients(id);


-- ============================================================================
-- FILE: 20260818000008_robust_no_action.sql
-- ============================================================================

-- 1. Dynamically find and drop any foreign key constraint on appointments.pending_patient_id
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT tc.constraint_name 
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'appointments'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'pending_patient_id'
  LOOP
    EXECUTE 'ALTER TABLE public.appointments DROP CONSTRAINT ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

-- 2. Re-add the constraint with default ON DELETE NO ACTION behavior
ALTER TABLE public.appointments 
  ADD CONSTRAINT appointments_pending_patient_id_fkey 
  FOREIGN KEY (pending_patient_id) 
  REFERENCES public.pending_patients(id);


-- ============================================================================
-- FILE: 20260818000009_deferrable_constraint.sql
-- ============================================================================

-- 1. Dynamically find and drop any foreign key constraint on appointments.pending_patient_id
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN 
    SELECT tc.constraint_name 
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'appointments'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND kcu.column_name = 'pending_patient_id'
  LOOP
    EXECUTE 'ALTER TABLE public.appointments DROP CONSTRAINT ' || quote_ident(r.constraint_name);
  END LOOP;
END $$;

-- 2. Re-add the constraint as DEFERRABLE INITIALLY DEFERRED
ALTER TABLE public.appointments 
  ADD CONSTRAINT appointments_pending_patient_id_fkey 
  FOREIGN KEY (pending_patient_id) 
  REFERENCES public.pending_patients(id)
  DEFERRABLE INITIALLY DEFERRED;


-- ============================================================================
-- FILE: 20260818000010_engage_registration_trigger.sql
-- ============================================================================

-- 1. Re-define BEFORE UPDATE trigger function to execute when moving to 'engage' or 'done'
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion()
RETURNS TRIGGER AS $$
DECLARE
  _pending_patient record;
  _new_patient_id uuid;
  _prefix text;
  _counter_val integer;
  _patient_code text;
BEGIN
  -- Trigger executes when transitioning to 'engage' and there is a pending patient
  IF NEW.flow_status = 'engage' AND NEW.pending_patient_id IS NOT NULL AND NEW.patient_id IS NULL THEN
    
    -- Fetch details of the pending patient
    SELECT * INTO _pending_patient FROM public.pending_patients WHERE id = NEW.pending_patient_id;
    
    IF FOUND THEN
      -- Generate permanent patient code using the clinic's prefix configuration
      SELECT patient_code_prefix INTO _prefix FROM public.clinics WHERE id = _pending_patient.clinic_id;
      _prefix := COALESCE(NULLIF(_prefix, ''), 'PT');
      
      -- Self-healing loop: increment counter until we find a unique code
      LOOP
        INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
        VALUES (_pending_patient.clinic_id, _prefix, 1)
        ON CONFLICT (clinic_id, prefix) 
        DO UPDATE SET last_value = public.clinic_counters.last_value + 1
        RETURNING last_value INTO _counter_val;
        
        _patient_code := _prefix || lpad(_counter_val::text, 4, '0');
        
        -- Exit loop only if the code does not exist in the patients table
        IF NOT EXISTS (
          SELECT 1 FROM public.patients 
          WHERE clinic_id = _pending_patient.clinic_id 
            AND patient_code = _patient_code
        ) THEN
          EXIT;
        END IF;
      END LOOP;
      
      -- Insert records to the permanent patients table
      INSERT INTO public.patients (
        clinic_id,
        patient_code,
        full_name,
        phone,
        email,
        date_of_birth,
        gender,
        address,
        emergency_contact,
        patient_type,
        status,
        created_by
      ) VALUES (
        _pending_patient.clinic_id,
        _patient_code,
        _pending_patient.full_name,
        _pending_patient.phone,
        _pending_patient.email,
        _pending_patient.date_of_birth,
        _pending_patient.gender,
        _pending_patient.address,
        _pending_patient.emergency_contact,
        _pending_patient.patient_type,
        'active',
        COALESCE(auth.uid(), NEW.created_by)
      ) RETURNING id INTO _new_patient_id;

      -- Update the appointment record details to point to the newly registered patient
      NEW.patient_id := _new_patient_id;
      NEW.pending_patient_id := NULL;
      
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Re-define AFTER UPDATE trigger function to handle cleanup on 'engage' or 'done' transitions
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion_after()
RETURNS TRIGGER AS $$
BEGIN
  -- If we successfully transitioned to engage and mapped to a permanent patient, delete the pending record
  IF OLD.pending_patient_id IS NOT NULL AND NEW.pending_patient_id IS NULL AND NEW.flow_status = 'engage' THEN
    DELETE FROM public.pending_patients WHERE id = OLD.pending_patient_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Explicitly drop and bind triggers to public.appointments table
DROP TRIGGER IF EXISTS trg_appointment_flow_completion ON public.appointments;
CREATE TRIGGER trg_appointment_flow_completion
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion();

DROP TRIGGER IF EXISTS trg_appointment_flow_completion_after ON public.appointments;
CREATE TRIGGER trg_appointment_flow_completion_after
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion_after();



-- ============================================================================
-- FILE: 20260818000011_treatment_quick_entry.sql
-- ============================================================================

-- Migration: Add quick_entry flag to treatment catalogue
ALTER TABLE public.treatment_catalogue ADD COLUMN IF NOT EXISTS quick_entry boolean NOT NULL DEFAULT false;

-- For existing items, set quick_entry to true so the current list remains visible
UPDATE public.treatment_catalogue SET quick_entry = true WHERE quick_entry = false;


-- ============================================================================
-- FILE: 20260821000000_treatment_catalogue_staff_write.sql
-- ============================================================================

-- Allow all clinic staff to update treatment catalogue (Quick Entry / Active).
-- Previously only is_admin() could write; non-admin PATCH returned 204 with 0 rows,
-- so the UI flipped then snapped back on refetch.

DROP POLICY IF EXISTS "admin_write" ON public.treatment_catalogue;

CREATE POLICY "clinic_staff_write"
  ON public.treatment_catalogue
  FOR ALL
  TO authenticated
  USING (clinic_id = public.current_clinic_id())
  WITH CHECK (clinic_id = public.current_clinic_id());


-- ============================================================================
-- FILE: 20260821000001_default_admin_staff.sql
-- ============================================================================

-- Clinic Compass: all staff are admins (matches Settings UI â€” no role picker).
-- Also unlocks treatment_catalogue writes that previously required is_admin().

UPDATE public.user_roles
SET role = 'admin'
WHERE role IS DISTINCT FROM 'admin';

-- Anyone on a clinic profile can claim admin for themselves (fixes locked dentist accounts).
CREATE OR REPLACE FUNCTION public.ensure_self_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid;
BEGIN
  SELECT clinic_id INTO _clinic FROM public.profiles WHERE id = auth.uid();
  IF _clinic IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = auth.uid()
    AND clinic_id = _clinic;

  INSERT INTO public.user_roles (user_id, clinic_id, role)
  VALUES (auth.uid(), _clinic, 'admin');
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_self_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_self_admin() TO authenticated;

-- Staff can manage treatment catalogue (Quick Entry / Active toggles).
DROP POLICY IF EXISTS "admin_write" ON public.treatment_catalogue;
DROP POLICY IF EXISTS "clinic_staff_write" ON public.treatment_catalogue;

CREATE POLICY "clinic_staff_write"
  ON public.treatment_catalogue
  FOR ALL
  TO authenticated
  USING (clinic_id = public.current_clinic_id())
  WITH CHECK (clinic_id = public.current_clinic_id());


-- ============================================================================
-- FILE: 20260824000000_final_architecture_hardening.sql
-- ============================================================================

-- Final Universal Architecture hardening:
-- one admin per clinic, public booking boundary, and tenant-safe invoice creation.
-- Staff active/inactive is not used. Every signed-in profile is an admin.

CREATE OR REPLACE FUNCTION public.current_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id
  FROM public.profiles
  WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "own_profile_update" ON public.profiles;
DROP POLICY IF EXISTS "own_active_profile_update" ON public.profiles;
CREATE POLICY "own_profile_update"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (
    id = auth.uid()
    AND clinic_id = public.current_clinic_id()
  )
  WITH CHECK (
    id = auth.uid()
    AND clinic_id = public.current_clinic_id()
  );

-- Clinic Compass intentionally uses a flat authorization model: every active
-- clinic staff account is an administrator. Remove misleading residual roles
-- and establish the role at migration time instead of escalating on page load.
DELETE FROM public.user_roles
WHERE role IS DISTINCT FROM 'admin';

INSERT INTO public.user_roles (user_id, clinic_id, role)
SELECT id, clinic_id, 'admin'::public.app_role
FROM public.profiles
ON CONFLICT (user_id, role) DO NOTHING;

DROP FUNCTION IF EXISTS public.ensure_self_admin();

-- Do not expose full clinic rows or permit direct anonymous inserts.
DROP POLICY IF EXISTS "public_clinic_read" ON public.clinics;
REVOKE SELECT ON public.clinics FROM anon;

DROP POLICY IF EXISTS "public_can_request" ON public.online_appointment_requests;
REVOKE INSERT ON public.online_appointment_requests FROM anon;

CREATE OR REPLACE FUNCTION public.get_public_booking_clinic(_clinic_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  address text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.phone, c.address
  FROM public.clinics c
  WHERE c.id = _clinic_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_clinic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_clinic(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_online_appointment_request(
  _clinic_id uuid,
  _name text,
  _phone text,
  _email text DEFAULT NULL,
  _requested_date date DEFAULT NULL,
  _requested_time time DEFAULT NULL,
  _reason text DEFAULT NULL,
  _message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request_id uuid;
  _clean_name text := btrim(coalesce(_name, ''));
  _clean_phone text := regexp_replace(coalesce(_phone, ''), '[^0-9+]', '', 'g');
  _clean_email text := nullif(btrim(coalesce(_email, '')), '');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clinics WHERE id = _clinic_id) THEN
    RAISE EXCEPTION 'Booking clinic unavailable';
  END IF;

  IF char_length(_clean_name) < 2 OR char_length(_clean_name) > 120 THEN
    RAISE EXCEPTION 'Invalid patient name';
  END IF;
  IF char_length(_clean_phone) < 6 OR char_length(_clean_phone) > 20 THEN
    RAISE EXCEPTION 'Invalid phone number';
  END IF;
  IF _clean_email IS NOT NULL
     AND (char_length(_clean_email) > 254 OR _clean_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;
  IF _requested_date IS NOT NULL
     AND (_requested_date < CURRENT_DATE OR _requested_date > CURRENT_DATE + 730) THEN
    RAISE EXCEPTION 'Invalid requested date';
  END IF;
  IF char_length(coalesce(_reason, '')) > 300 OR char_length(coalesce(_message, '')) > 2000 THEN
    RAISE EXCEPTION 'Appointment details are too long';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.online_appointment_requests
    WHERE clinic_id = _clinic_id
      AND phone = _clean_phone
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Please wait before submitting another request';
  END IF;

  INSERT INTO public.online_appointment_requests (
    clinic_id,
    name,
    phone,
    email,
    requested_date,
    requested_time,
    reason,
    message,
    status
  )
  VALUES (
    _clinic_id,
    _clean_name,
    _clean_phone,
    _clean_email,
    _requested_date,
    _requested_time,
    nullif(btrim(coalesce(_reason, '')), ''),
    nullif(btrim(coalesce(_message, '')), ''),
    'requested'
  )
  RETURNING id INTO _request_id;

  RETURN _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_online_appointment_request(
  uuid, text, text, text, date, time, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_online_appointment_request(
  uuid, text, text, text, date, time, text, text
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_invoice_with_items(
  _invoice_date date,
  _notes text,
  _patient_id uuid,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid;
  _invoice_id uuid;
  _invoice_number text;
  _total_amount numeric := 0;
  _tax_amount numeric := 0;
  _grand_total numeric := 0;
  _tax_enabled boolean;
  _tax_rate numeric(5,2);
  _item jsonb;
  _description text;
  _quantity numeric;
  _unit_price numeric;
  _item_sum numeric;
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN
    RAISE EXCEPTION 'No active clinic session for current user';
  END IF;

  IF _invoice_date IS NULL THEN
    RAISE EXCEPTION 'Invoice date is required';
  END IF;
  IF _patient_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = _patient_id AND clinic_id = _clinic
  ) THEN
    RAISE EXCEPTION 'Patient does not belong to the active clinic';
  END IF;
  IF _items IS NULL
     OR jsonb_typeof(_items) <> 'array'
     OR jsonb_array_length(_items) = 0
     OR jsonb_array_length(_items) > 100 THEN
    RAISE EXCEPTION 'Invoice must contain between 1 and 100 items';
  END IF;
  IF char_length(coalesce(_notes, '')) > 2000 THEN
    RAISE EXCEPTION 'Invoice notes are too long';
  END IF;

  SELECT tax_enabled, tax_rate
  INTO _tax_enabled, _tax_rate
  FROM public.clinics
  WHERE id = _clinic;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _description := btrim(coalesce(_item->>'description', ''));
    BEGIN
      _quantity := (_item->>'quantity')::numeric;
      _unit_price := (_item->>'unit_price')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Invoice item quantity and price must be numeric';
    END;

    IF char_length(_description) < 1 OR char_length(_description) > 300
       OR _quantity <= 0 OR _quantity > 10000
       OR _unit_price < 0 OR _unit_price > 100000000 THEN
      RAISE EXCEPTION 'Invalid invoice item';
    END IF;

    _item_sum := round(_quantity * _unit_price, 2);
    IF _item_sum > 9999999999.99 OR _total_amount + _item_sum > 9999999999.99 THEN
      RAISE EXCEPTION 'Invoice total exceeds the supported limit';
    END IF;
    _total_amount := _total_amount + _item_sum;
  END LOOP;

  _tax_amount := CASE
    WHEN _tax_enabled THEN round((_total_amount * _tax_rate) / 100, 2)
    ELSE 0
  END;
  _grand_total := _total_amount + _tax_amount;
  IF _grand_total < 0 OR _grand_total > 9999999999.99 THEN
    RAISE EXCEPTION 'Invoice total exceeds the supported limit';
  END IF;
  _invoice_number := public.next_invoice_number();

  INSERT INTO public.invoices (
    clinic_id, patient_id, invoice_number, total_amount, tax_amount,
    grand_total, paid_amount, balance_amount, status, invoice_date,
    notes, created_by
  )
  VALUES (
    _clinic, _patient_id, _invoice_number, _total_amount, _tax_amount,
    _grand_total, 0, _grand_total, 'unpaid'::public.invoice_status,
    _invoice_date, nullif(btrim(coalesce(_notes, '')), ''), auth.uid()
  )
  RETURNING id INTO _invoice_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _description := btrim(_item->>'description');
    _quantity := (_item->>'quantity')::numeric;
    _unit_price := (_item->>'unit_price')::numeric;

    INSERT INTO public.invoice_items (
      clinic_id, invoice_id, description, quantity, unit_price, amount
    )
    VALUES (
      _clinic, _invoice_id, _description, _quantity, _unit_price,
      round(_quantity * _unit_price, 2)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'id', _invoice_id,
    'invoice_number', _invoice_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_with_items(date, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_invoice_with_items(date, text, uuid, jsonb) TO authenticated;


-- ============================================================================
-- FILE: 20260827000000_patient_education_library.sql
-- ============================================================================

-- Patient Education Library
-- Run once in EACH clinic's separate Supabase project.
-- Files are private in Storage; PostgreSQL stores metadata only.

CREATE TABLE IF NOT EXISTS public.education_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 2 AND 160),
  summary text CHECK (summary IS NULL OR char_length(summary) <= 2000),
  category text NOT NULL CHECK (
    category IN ('dental_problem', 'treatment_procedure', 'prevention', 'aftercare')
  ),
  media_type text NOT NULL CHECK (media_type IN ('image', 'video', 'pdf')),
  tags text[] NOT NULL DEFAULT '{}',
  storage_bucket text NOT NULL DEFAULT 'education-materials'
    CHECK (storage_bucket = 'education-materials'),
  storage_path text NOT NULL,
  original_filename text NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 200),
  mime_type text NOT NULL CHECK (
    mime_type IN (
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'application/pdf'
    )
  ),
  byte_size bigint NOT NULL CHECK (byte_size > 0 AND byte_size <= 209715200),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'failed', 'archived')),
  content_version text,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector(
      'simple'::regconfig,
      coalesce(title, '') || ' ' ||
      coalesce(summary, '') || ' ' ||
      coalesce(original_filename, '')
    )
  ) STORED,
  UNIQUE (clinic_id, storage_path)
);

CREATE INDEX IF NOT EXISTS idx_education_clinic_status_created
  ON public.education_materials (clinic_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_education_clinic_category_media
  ON public.education_materials (clinic_id, category, media_type);

CREATE INDEX IF NOT EXISTS idx_education_search_vector
  ON public.education_materials USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_education_tags
  ON public.education_materials USING gin (tags);

CREATE UNIQUE INDEX IF NOT EXISTS idx_education_clinic_sha256_active
  ON public.education_materials (clinic_id, sha256)
  WHERE sha256 IS NOT NULL AND status <> 'archived';

ALTER TABLE public.education_materials ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.education_materials TO authenticated;
GRANT UPDATE (title, summary, category, tags, content_version)
  ON public.education_materials TO authenticated;
GRANT ALL ON public.education_materials TO service_role;

DROP POLICY IF EXISTS "education_materials_read" ON public.education_materials;
CREATE POLICY "education_materials_read"
  ON public.education_materials
  FOR SELECT
  TO authenticated
  USING (clinic_id = public.current_clinic_id());

DROP POLICY IF EXISTS "education_materials_insert" ON public.education_materials;
CREATE POLICY "education_materials_insert"
  ON public.education_materials
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = public.current_clinic_id()
    AND uploaded_by = auth.uid()
    AND status = 'pending'
    AND storage_path LIKE public.current_clinic_id()::text || '/%'
  );

DROP POLICY IF EXISTS "education_materials_update" ON public.education_materials;
CREATE POLICY "education_materials_update"
  ON public.education_materials
  FOR UPDATE
  TO authenticated
  USING (clinic_id = public.current_clinic_id())
  WITH CHECK (clinic_id = public.current_clinic_id());

CREATE OR REPLACE FUNCTION public.protect_education_material_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
    RAISE EXCEPTION 'Education material file identity cannot be changed';
  END IF;

  NEW.updated_at := now();
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_education_material_identity ON public.education_materials;
CREATE TRIGGER trg_education_material_identity
  BEFORE UPDATE ON public.education_materials
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_education_material_identity();

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'education-materials',
  'education-materials',
  false,
  209715200,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "education_storage_read" ON storage.objects;
CREATE POLICY "education_storage_read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'education-materials'
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

DROP POLICY IF EXISTS "education_storage_insert" ON storage.objects;
CREATE POLICY "education_storage_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'education-materials'
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
    AND EXISTS (
      SELECT 1
      FROM public.education_materials material
      WHERE material.id::text = (storage.foldername(name))[2]
        AND material.clinic_id = public.current_clinic_id()
        AND material.storage_path = name
        AND material.status = 'pending'
    )
  );

DROP POLICY IF EXISTS "education_storage_update" ON storage.objects;
CREATE POLICY "education_storage_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'education-materials'
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  )
  WITH CHECK (
    bucket_id = 'education-materials'
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

DROP POLICY IF EXISTS "education_storage_delete" ON storage.objects;
CREATE POLICY "education_storage_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'education-materials'
    AND (storage.foldername(name))[1] = public.current_clinic_id()::text
  );

CREATE OR REPLACE FUNCTION public.register_education_upload(
  _title text,
  _summary text,
  _category text,
  _media_type text,
  _tags text[],
  _original_filename text,
  _mime_type text,
  _byte_size bigint,
  _sha256 text DEFAULT NULL,
  _content_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _material_id uuid;
  _safe_filename text;
  _storage_path text;
  _existing public.education_materials%ROWTYPE;
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;
  IF char_length(btrim(coalesce(_title, ''))) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Title must contain between 2 and 160 characters';
  END IF;
  IF char_length(coalesce(_summary, '')) > 2000 THEN
    RAISE EXCEPTION 'Summary is too long';
  END IF;
  IF _category NOT IN ('dental_problem', 'treatment_procedure', 'prevention', 'aftercare') THEN
    RAISE EXCEPTION 'Invalid education category';
  END IF;
  IF _media_type NOT IN ('image', 'video', 'pdf') THEN
    RAISE EXCEPTION 'Invalid media type';
  END IF;
  IF cardinality(coalesce(_tags, '{}')) > 20
     OR EXISTS (
       SELECT 1 FROM unnest(coalesce(_tags, '{}')) tag
       WHERE char_length(btrim(tag)) NOT BETWEEN 1 AND 50
     ) THEN
    RAISE EXCEPTION 'Use no more than 20 tags of 1 to 50 characters';
  END IF;
  IF char_length(coalesce(_original_filename, '')) NOT BETWEEN 1 AND 200
     OR _original_filename LIKE '%/%'
     OR _original_filename LIKE E'%\\%' THEN
    RAISE EXCEPTION 'Invalid file name';
  END IF;
  IF _sha256 IS NOT NULL AND _sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid SHA-256 hash';
  END IF;

  IF _media_type = 'image'
     AND (_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
          OR _byte_size NOT BETWEEN 1 AND 26214400) THEN
    RAISE EXCEPTION 'Images must be JPEG, PNG, or WebP and no larger than 25 MB';
  ELSIF _media_type = 'video'
     AND (_mime_type NOT IN ('video/mp4', 'video/quicktime')
          OR _byte_size NOT BETWEEN 1 AND 209715200) THEN
    RAISE EXCEPTION 'Videos must be MP4 or QuickTime and no larger than 200 MB';
  ELSIF _media_type = 'pdf'
     AND (_mime_type <> 'application/pdf'
          OR _byte_size NOT BETWEEN 1 AND 26214400) THEN
    RAISE EXCEPTION 'Documents must be PDF and no larger than 25 MB';
  END IF;

  IF _sha256 IS NOT NULL THEN
    SELECT *
    INTO _existing
    FROM public.education_materials
    WHERE clinic_id = _clinic
      AND sha256 = _sha256
      AND status <> 'archived'
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', _existing.id,
        'storage_path', _existing.storage_path,
        'status', _existing.status,
        'duplicate', true
      );
    END IF;
  END IF;

  _material_id := gen_random_uuid();
  _safe_filename := regexp_replace(_original_filename, '[^A-Za-z0-9._-]', '_', 'g');
  IF _safe_filename = '' THEN
    RAISE EXCEPTION 'Invalid file name';
  END IF;
  _storage_path := _clinic::text || '/' || _material_id::text || '/' || _safe_filename;

  INSERT INTO public.education_materials (
    id,
    clinic_id,
    title,
    summary,
    category,
    media_type,
    tags,
    storage_path,
    original_filename,
    mime_type,
    byte_size,
    sha256,
    status,
    content_version,
    uploaded_by
  )
  VALUES (
    _material_id,
    _clinic,
    btrim(_title),
    nullif(btrim(coalesce(_summary, '')), ''),
    _category,
    _media_type,
    coalesce(_tags, '{}'),
    _storage_path,
    _original_filename,
    _mime_type,
    _byte_size,
    _sha256,
    'pending',
    nullif(btrim(coalesce(_content_version, '')), ''),
    auth.uid()
  );

  RETURN jsonb_build_object(
    'id', _material_id,
    'storage_path', _storage_path,
    'status', 'pending',
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_education_upload(
  text, text, text, text, text[], text, text, bigint, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_education_upload(
  text, text, text, text, text[], text, text, bigint, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalize_education_upload(_material_id uuid)
RETURNS public.education_materials
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _material public.education_materials%ROWTYPE;
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;

  SELECT *
  INTO _material
  FROM public.education_materials
  WHERE id = _material_id
    AND clinic_id = _clinic
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Education material was not found';
  END IF;
  IF _material.status <> 'pending' THEN
    RAISE EXCEPTION 'Education material is not pending upload';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id = _material.storage_bucket
      AND name = _material.storage_path
  ) THEN
    RAISE EXCEPTION 'Uploaded file was not found';
  END IF;

  UPDATE public.education_materials
  SET status = 'published'
  WHERE id = _material.id
  RETURNING * INTO _material;

  RETURN _material;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_education_upload(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_education_upload(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.archive_education_material(_material_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _storage_path text;
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;

  UPDATE public.education_materials
  SET status = 'archived'
  WHERE id = _material_id
    AND clinic_id = _clinic
    AND status <> 'archived'
  RETURNING storage_path INTO _storage_path;

  IF _storage_path IS NULL THEN
    RAISE EXCEPTION 'Education material was not found';
  END IF;

  RETURN _storage_path;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_education_material(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_education_material(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_education_materials(
  _query text DEFAULT NULL,
  _category text DEFAULT NULL,
  _media_type text DEFAULT NULL,
  _limit integer DEFAULT 48,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  clinic_id uuid,
  title text,
  summary text,
  category text,
  media_type text,
  tags text[],
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  byte_size bigint,
  status text,
  content_version text,
  uploaded_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _clean_query text := nullif(btrim(coalesce(_query, '')), '');
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;
  IF _limit NOT BETWEEN 1 AND 100 OR _offset < 0 OR _offset > 1000000 THEN
    RAISE EXCEPTION 'Invalid pagination';
  END IF;
  IF _category IS NOT NULL
     AND _category NOT IN ('dental_problem', 'treatment_procedure', 'prevention', 'aftercare') THEN
    RAISE EXCEPTION 'Invalid education category';
  END IF;
  IF _media_type IS NOT NULL AND _media_type NOT IN ('image', 'video', 'pdf') THEN
    RAISE EXCEPTION 'Invalid media type';
  END IF;

  RETURN QUERY
  SELECT
    material.id,
    material.clinic_id,
    material.title,
    material.summary,
    material.category,
    material.media_type,
    material.tags,
    material.storage_bucket,
    material.storage_path,
    material.original_filename,
    material.mime_type,
    material.byte_size,
    material.status,
    material.content_version,
    material.uploaded_by,
    material.created_at,
    material.updated_at,
    count(*) OVER () AS total_count
  FROM public.education_materials material
  WHERE material.clinic_id = _clinic
    AND material.status = 'published'
    AND (_category IS NULL OR material.category = _category)
    AND (_media_type IS NULL OR material.media_type = _media_type)
    AND (
      _clean_query IS NULL
      OR material.search_vector @@ websearch_to_tsquery('simple', _clean_query)
      OR EXISTS (
        SELECT 1
        FROM unnest(material.tags) tag
        WHERE tag ILIKE '%' || _clean_query || '%'
      )
    )
  ORDER BY material.created_at DESC, material.id DESC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_education_materials(
  text, text, text, integer, integer
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_education_materials(
  text, text, text, integer, integer
) TO authenticated;

COMMENT ON TABLE public.education_materials IS
  'Clinic-private metadata for patient education photos, videos, and PDFs. File bytes live in private Supabase Storage.';


-- ============================================================================
-- FILE: 20260828000000_education_before_after_pairs.sql
-- ============================================================================

-- Patient Education: Before/After pairs + presentation metadata
-- Run once in EACH clinic's separate Supabase project after 20260827000000.

ALTER TABLE public.education_materials
  ADD COLUMN IF NOT EXISTS presentation text NOT NULL DEFAULT 'single'
    CHECK (presentation IN ('single', 'before_after')),
  ADD COLUMN IF NOT EXISTS pair_group_id uuid,
  ADD COLUMN IF NOT EXISTS pair_role text
    CHECK (pair_role IS NULL OR pair_role IN ('before', 'after'));

ALTER TABLE public.education_materials
  DROP CONSTRAINT IF EXISTS education_materials_pair_shape;

ALTER TABLE public.education_materials
  ADD CONSTRAINT education_materials_pair_shape CHECK (
    (presentation = 'single' AND pair_group_id IS NULL AND pair_role IS NULL)
    OR (presentation = 'before_after' AND pair_group_id IS NOT NULL AND pair_role IN ('before', 'after'))
  );

CREATE INDEX IF NOT EXISTS idx_education_clinic_pair_group
  ON public.education_materials (clinic_id, pair_group_id)
  WHERE pair_group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_education_clinic_pair_role_active
  ON public.education_materials (clinic_id, pair_group_id, pair_role)
  WHERE pair_group_id IS NOT NULL AND status <> 'archived';

CREATE OR REPLACE FUNCTION public.protect_education_material_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
     OR NEW.storage_path IS DISTINCT FROM OLD.storage_path
     OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
     OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.presentation IS DISTINCT FROM OLD.presentation
     OR NEW.pair_group_id IS DISTINCT FROM OLD.pair_group_id
     OR NEW.pair_role IS DISTINCT FROM OLD.pair_role THEN
    RAISE EXCEPTION 'Education material file identity cannot be changed';
  END IF;

  NEW.updated_at := now();
  IF NEW.status = 'archived' AND OLD.status <> 'archived' THEN
    NEW.archived_at := now();
  ELSIF NEW.status <> 'archived' THEN
    NEW.archived_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.register_education_upload(
  text, text, text, text, text[], text, text, bigint, text, text
);

CREATE OR REPLACE FUNCTION public.register_education_upload(
  _title text,
  _summary text,
  _category text,
  _media_type text,
  _tags text[],
  _original_filename text,
  _mime_type text,
  _byte_size bigint,
  _sha256 text DEFAULT NULL,
  _content_version text DEFAULT NULL,
  _presentation text DEFAULT 'single',
  _pair_group_id uuid DEFAULT NULL,
  _pair_role text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _material_id uuid;
  _safe_filename text;
  _storage_path text;
  _existing public.education_materials%ROWTYPE;
  _presentation_value text := coalesce(nullif(btrim(_presentation), ''), 'single');
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;
  IF char_length(btrim(coalesce(_title, ''))) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Title must contain between 2 and 160 characters';
  END IF;
  IF char_length(coalesce(_summary, '')) > 2000 THEN
    RAISE EXCEPTION 'Summary is too long';
  END IF;
  IF _category NOT IN ('dental_problem', 'treatment_procedure', 'prevention', 'aftercare') THEN
    RAISE EXCEPTION 'Invalid education category';
  END IF;
  IF _media_type NOT IN ('image', 'video', 'pdf') THEN
    RAISE EXCEPTION 'Invalid media type';
  END IF;
  IF _presentation_value NOT IN ('single', 'before_after') THEN
    RAISE EXCEPTION 'Invalid presentation';
  END IF;
  IF _presentation_value = 'single' THEN
    IF _pair_group_id IS NOT NULL OR _pair_role IS NOT NULL THEN
      RAISE EXCEPTION 'Single materials cannot include pair metadata';
    END IF;
  ELSE
    IF _pair_group_id IS NULL OR _pair_role NOT IN ('before', 'after') THEN
      RAISE EXCEPTION 'Before/After uploads require a pair group and role';
    END IF;
    IF _media_type <> 'image' THEN
      RAISE EXCEPTION 'Before/After pairs must be images';
    END IF;
  END IF;
  IF cardinality(coalesce(_tags, '{}')) > 20
     OR EXISTS (
       SELECT 1 FROM unnest(coalesce(_tags, '{}')) tag
       WHERE char_length(btrim(tag)) NOT BETWEEN 1 AND 50
     ) THEN
    RAISE EXCEPTION 'Use no more than 20 tags of 1 to 50 characters';
  END IF;
  IF char_length(coalesce(_original_filename, '')) NOT BETWEEN 1 AND 200
     OR _original_filename LIKE '%/%'
     OR _original_filename LIKE E'%\\%' THEN
    RAISE EXCEPTION 'Invalid file name';
  END IF;
  IF _sha256 IS NOT NULL AND _sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid SHA-256 hash';
  END IF;

  IF _media_type = 'image'
     AND (_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp')
          OR _byte_size NOT BETWEEN 1 AND 26214400) THEN
    RAISE EXCEPTION 'Images must be JPEG, PNG, or WebP and no larger than 25 MB';
  ELSIF _media_type = 'video'
     AND (_mime_type NOT IN ('video/mp4', 'video/quicktime')
          OR _byte_size NOT BETWEEN 1 AND 209715200) THEN
    RAISE EXCEPTION 'Videos must be MP4 or QuickTime and no larger than 200 MB';
  ELSIF _media_type = 'pdf'
     AND (_mime_type <> 'application/pdf'
          OR _byte_size NOT BETWEEN 1 AND 26214400) THEN
    RAISE EXCEPTION 'Documents must be PDF and no larger than 25 MB';
  END IF;

  IF _sha256 IS NOT NULL THEN
    SELECT *
    INTO _existing
    FROM public.education_materials
    WHERE clinic_id = _clinic
      AND sha256 = _sha256
      AND status <> 'archived'
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'id', _existing.id,
        'storage_path', _existing.storage_path,
        'status', _existing.status,
        'duplicate', true
      );
    END IF;
  END IF;

  _material_id := gen_random_uuid();
  _safe_filename := regexp_replace(_original_filename, '[^A-Za-z0-9._-]', '_', 'g');
  IF _safe_filename = '' THEN
    RAISE EXCEPTION 'Invalid file name';
  END IF;
  _storage_path := _clinic::text || '/' || _material_id::text || '/' || _safe_filename;

  INSERT INTO public.education_materials (
    id,
    clinic_id,
    title,
    summary,
    category,
    media_type,
    tags,
    storage_path,
    original_filename,
    mime_type,
    byte_size,
    sha256,
    status,
    content_version,
    uploaded_by,
    presentation,
    pair_group_id,
    pair_role
  )
  VALUES (
    _material_id,
    _clinic,
    btrim(_title),
    nullif(btrim(coalesce(_summary, '')), ''),
    _category,
    _media_type,
    coalesce(_tags, '{}'),
    _storage_path,
    _original_filename,
    _mime_type,
    _byte_size,
    _sha256,
    'pending',
    nullif(btrim(coalesce(_content_version, '')), ''),
    auth.uid(),
    _presentation_value,
    _pair_group_id,
    _pair_role
  );

  RETURN jsonb_build_object(
    'id', _material_id,
    'storage_path', _storage_path,
    'status', 'pending',
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_education_upload(
  text, text, text, text, text[], text, text, bigint, text, text, text, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_education_upload(
  text, text, text, text, text[], text, text, bigint, text, text, text, uuid, text
) TO authenticated;

DROP FUNCTION IF EXISTS public.archive_education_material(uuid);

CREATE OR REPLACE FUNCTION public.archive_education_material(_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _material public.education_materials%ROWTYPE;
  _paths text[];
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;

  SELECT *
  INTO _material
  FROM public.education_materials
  WHERE id = _material_id
    AND clinic_id = _clinic
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Education material was not found';
  END IF;

  IF _material.pair_group_id IS NOT NULL THEN
    WITH archived AS (
      UPDATE public.education_materials
      SET status = 'archived'
      WHERE clinic_id = _clinic
        AND pair_group_id = _material.pair_group_id
        AND status <> 'archived'
      RETURNING storage_path
    )
    SELECT coalesce(array_agg(storage_path), ARRAY[]::text[])
    INTO _paths
    FROM archived;
  ELSE
    WITH archived AS (
      UPDATE public.education_materials
      SET status = 'archived'
      WHERE id = _material.id
        AND status <> 'archived'
      RETURNING storage_path
    )
    SELECT coalesce(array_agg(storage_path), ARRAY[_material.storage_path])
    INTO _paths
    FROM archived;
  END IF;

  IF _paths IS NULL OR cardinality(_paths) = 0 THEN
    RAISE EXCEPTION 'Education material was not found';
  END IF;

  RETURN jsonb_build_object('paths', to_jsonb(_paths));
END;
$$;

REVOKE ALL ON FUNCTION public.archive_education_material(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_education_material(uuid) TO authenticated;

DROP FUNCTION IF EXISTS public.search_education_materials(
  text, text, text, integer, integer
);

CREATE OR REPLACE FUNCTION public.search_education_materials(
  _query text DEFAULT NULL,
  _category text DEFAULT NULL,
  _media_type text DEFAULT NULL,
  _limit integer DEFAULT 48,
  _offset integer DEFAULT 0,
  _presentation text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  clinic_id uuid,
  title text,
  summary text,
  category text,
  media_type text,
  tags text[],
  storage_bucket text,
  storage_path text,
  original_filename text,
  mime_type text,
  byte_size bigint,
  status text,
  content_version text,
  uploaded_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  presentation text,
  pair_group_id uuid,
  pair_role text,
  after_id uuid,
  after_storage_path text,
  after_storage_bucket text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _clean_query text := nullif(btrim(coalesce(_query, '')), '');
  _presentation_value text := nullif(btrim(coalesce(_presentation, '')), '');
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;
  IF _limit NOT BETWEEN 1 AND 100 OR _offset < 0 OR _offset > 1000000 THEN
    RAISE EXCEPTION 'Invalid pagination';
  END IF;
  IF _category IS NOT NULL
     AND _category NOT IN ('dental_problem', 'treatment_procedure', 'prevention', 'aftercare') THEN
    RAISE EXCEPTION 'Invalid education category';
  END IF;
  IF _media_type IS NOT NULL AND _media_type NOT IN ('image', 'video', 'pdf') THEN
    RAISE EXCEPTION 'Invalid media type';
  END IF;
  IF _presentation_value IS NOT NULL
     AND _presentation_value NOT IN ('single', 'before_after') THEN
    RAISE EXCEPTION 'Invalid presentation';
  END IF;

  RETURN QUERY
  SELECT
    material.id,
    material.clinic_id,
    material.title,
    material.summary,
    material.category,
    material.media_type,
    material.tags,
    material.storage_bucket,
    material.storage_path,
    material.original_filename,
    material.mime_type,
    material.byte_size,
    material.status,
    material.content_version,
    material.uploaded_by,
    material.created_at,
    material.updated_at,
    material.presentation,
    material.pair_group_id,
    material.pair_role,
    after_side.id AS after_id,
    after_side.storage_path AS after_storage_path,
    after_side.storage_bucket AS after_storage_bucket,
    count(*) OVER () AS total_count
  FROM public.education_materials material
  LEFT JOIN public.education_materials after_side
    ON after_side.clinic_id = material.clinic_id
   AND after_side.pair_group_id = material.pair_group_id
   AND after_side.pair_role = 'after'
   AND after_side.status = 'published'
  WHERE material.clinic_id = _clinic
    AND material.status = 'published'
    AND (
      material.presentation = 'single'
      OR material.pair_role = 'before'
    )
    AND (_category IS NULL OR material.category = _category)
    AND (_media_type IS NULL OR material.media_type = _media_type)
    AND (_presentation_value IS NULL OR material.presentation = _presentation_value)
    AND (
      _clean_query IS NULL
      OR material.search_vector @@ websearch_to_tsquery('simple', _clean_query)
      OR EXISTS (
        SELECT 1
        FROM unnest(material.tags) tag
        WHERE tag ILIKE '%' || _clean_query || '%'
      )
    )
  ORDER BY material.created_at DESC, material.id DESC
  LIMIT _limit
  OFFSET _offset;
END;
$$;

REVOKE ALL ON FUNCTION public.search_education_materials(
  text, text, text, integer, integer, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_education_materials(
  text, text, text, integer, integer, text
) TO authenticated;


-- ============================================================================
-- FILE: 20260829000000_education_hard_delete.sql
-- ============================================================================

-- Patient Education: hard delete (row + return storage paths for client cleanup)
-- Run once in EACH clinic Supabase project after 20260828000000.

CREATE OR REPLACE FUNCTION public.delete_education_material(_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid := public.current_clinic_id();
  _material public.education_materials%ROWTYPE;
  _paths text[];
BEGIN
  IF _clinic IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'No active clinic session';
  END IF;

  SELECT *
  INTO _material
  FROM public.education_materials
  WHERE id = _material_id
    AND clinic_id = _clinic
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Education material was not found';
  END IF;

  IF _material.pair_group_id IS NOT NULL THEN
    WITH removed AS (
      DELETE FROM public.education_materials
      WHERE clinic_id = _clinic
        AND pair_group_id = _material.pair_group_id
      RETURNING storage_path
    )
    SELECT coalesce(array_agg(storage_path), ARRAY[]::text[])
    INTO _paths
    FROM removed;
  ELSE
    WITH removed AS (
      DELETE FROM public.education_materials
      WHERE id = _material.id
      RETURNING storage_path
    )
    SELECT coalesce(array_agg(storage_path), ARRAY[]::text[])
    INTO _paths
    FROM removed;
  END IF;

  IF _paths IS NULL OR cardinality(_paths) = 0 THEN
    RAISE EXCEPTION 'Education material was not found';
  END IF;

  RETURN jsonb_build_object('paths', to_jsonb(_paths));
END;
$$;

REVOKE ALL ON FUNCTION public.delete_education_material(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_education_material(uuid) TO authenticated;

-- Keep old name working for any leftover callers; same hard-delete behavior.
CREATE OR REPLACE FUNCTION public.archive_education_material(_material_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.delete_education_material(_material_id);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_education_material(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_education_material(uuid) TO authenticated;


-- ============================================================================
-- FILE: 20260919000000_reject_payment_over_balance.sql
-- ============================================================================

-- Reject payments that would take paid totals above invoice grand_total.
-- Overpay must not be saved and then shown as balance 0.

CREATE OR REPLACE FUNCTION public.reject_payment_over_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grand numeric;
  _paid numeric;
BEGIN
  SELECT grand_total INTO _grand
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF _grand IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id
    AND id IS DISTINCT FROM NEW.id;

  IF (_paid + NEW.amount) > (_grand + 0.001) THEN
    RAISE EXCEPTION 'Payment cannot exceed balance due';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_reject_over_balance ON public.payments;
CREATE TRIGGER trg_payments_reject_over_balance
BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.reject_payment_over_balance();

REVOKE ALL ON FUNCTION public.reject_payment_over_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_over_balance() FROM anon, authenticated;


-- ============================================================================
-- FILE: 20260922000000_replace_patient_medical_profile.sql
-- ============================================================================

-- Atomic replace of patient medical profile (conditions, allergies, medications, habits).
-- Used by staff app serverFn; relies on current_clinic_id() from hardening migration.

CREATE OR REPLACE FUNCTION public.replace_patient_medical_profile(
  p_patient_id uuid,
  p_conditions jsonb DEFAULT '[]'::jsonb,
  p_allergies jsonb DEFAULT '[]'::jsonb,
  p_medications jsonb DEFAULT '[]'::jsonb,
  p_habits jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid;
BEGIN
  v_clinic := public.current_clinic_id();
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Clinic session not active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = p_patient_id AND clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'Patient not found';
  END IF;

  DELETE FROM public.medical_conditions
  WHERE patient_id = p_patient_id AND clinic_id = v_clinic;

  DELETE FROM public.allergies
  WHERE patient_id = p_patient_id AND clinic_id = v_clinic;

  DELETE FROM public.medications
  WHERE patient_id = p_patient_id AND clinic_id = v_clinic;

  DELETE FROM public.patient_habits
  WHERE patient_id = p_patient_id AND clinic_id = v_clinic;

  INSERT INTO public.medical_conditions (clinic_id, patient_id, condition, category, notes)
  SELECT
    v_clinic,
    p_patient_id,
    trim(x.condition),
    COALESCE(nullif(trim(x.category), ''), 'General'),
    nullif(trim(x.notes), '')
  FROM jsonb_to_recordset(p_conditions) AS x(
    condition text,
    category text,
    notes text
  )
  WHERE nullif(trim(x.condition), '') IS NOT NULL;

  INSERT INTO public.allergies (
    clinic_id,
    patient_id,
    substance,
    allergy_type,
    reaction,
    severity,
    notes
  )
  SELECT
    v_clinic,
    p_patient_id,
    trim(x.substance),
    COALESCE(nullif(trim(x.allergy_type), ''), 'Drug'),
    nullif(trim(x.reaction), ''),
    nullif(trim(x.severity), ''),
    nullif(trim(x.notes), '')
  FROM jsonb_to_recordset(p_allergies) AS x(
    substance text,
    allergy_type text,
    reaction text,
    severity text,
    notes text
  )
  WHERE nullif(trim(x.substance), '') IS NOT NULL;

  INSERT INTO public.medications (
    clinic_id,
    patient_id,
    medication,
    dosage,
    frequency,
    duration,
    notes
  )
  SELECT
    v_clinic,
    p_patient_id,
    trim(x.medication),
    nullif(trim(x.dosage), ''),
    nullif(trim(x.frequency), ''),
    nullif(trim(x.duration), ''),
    nullif(trim(x.notes), '')
  FROM jsonb_to_recordset(p_medications) AS x(
    medication text,
    dosage text,
    frequency text,
    duration text,
    notes text
  )
  WHERE nullif(trim(x.medication), '') IS NOT NULL;

  INSERT INTO public.patient_habits (clinic_id, patient_id, habit, notes)
  SELECT
    v_clinic,
    p_patient_id,
    trim(x.habit),
    nullif(trim(x.notes), '')
  FROM jsonb_to_recordset(p_habits) AS x(habit text, notes text)
  WHERE nullif(trim(x.habit), '') IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_patient_medical_profile(uuid, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_patient_medical_profile(uuid, jsonb, jsonb, jsonb, jsonb) TO authenticated;


-- ============================================================================
-- FILE: 20260922100000_audit2_phase0_baseline.sql
-- ============================================================================

-- Audit 2 Phase 0 â€” idempotent baseline (safe to run on hosted Supabase SQL Editor).
-- Run medical RPC migration first, or use scripts/phase-0-apply-all-in-one.sql (both parts).

DO $$
BEGIN
  IF to_regprocedure('public.current_clinic_id()') IS NULL THEN
    RAISE EXCEPTION 'Prerequisite missing: public.current_clinic_id(). Apply 20260824000000_final_architecture_hardening.sql on this project first.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Payment over-balance guard (re-apply; no-op if already present)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_payment_over_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _grand numeric;
  _paid numeric;
BEGIN
  SELECT grand_total INTO _grand
  FROM public.invoices
  WHERE id = NEW.invoice_id
  FOR UPDATE;

  IF _grand IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO _paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id
    AND id IS DISTINCT FROM NEW.id;

  IF (_paid + NEW.amount) > (_grand + 0.001) THEN
    RAISE EXCEPTION 'Payment cannot exceed balance due';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_reject_over_balance ON public.payments;
CREATE TRIGGER trg_payments_reject_over_balance
BEFORE INSERT OR UPDATE OF amount, invoice_id ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.reject_payment_over_balance();

REVOKE ALL ON FUNCTION public.reject_payment_over_balance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_payment_over_balance() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Hot-path indexes (DA-021)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_payments_clinic_payment_date
  ON public.payments (clinic_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_clinic_invoice_date
  ON public.invoices (clinic_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_follow_ups_clinic_due_date
  ON public.follow_ups (clinic_id, due_date);

CREATE INDEX IF NOT EXISTS idx_visits_clinic_visit_date
  ON public.visits (clinic_id, visit_date DESC);

-- ---------------------------------------------------------------------------
-- 3) Engage flow: pending patient must belong to appointment clinic (DA-040)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion()
RETURNS TRIGGER AS $$
DECLARE
  _pending_patient record;
  _new_patient_id uuid;
  _prefix text;
  _counter_val integer;
  _patient_code text;
BEGIN
  IF NEW.flow_status = 'engage' AND NEW.pending_patient_id IS NOT NULL AND NEW.patient_id IS NULL THEN

    SELECT * INTO _pending_patient
    FROM public.pending_patients
    WHERE id = NEW.pending_patient_id
      AND clinic_id = NEW.clinic_id;

    IF FOUND THEN
      SELECT patient_code_prefix INTO _prefix FROM public.clinics WHERE id = _pending_patient.clinic_id;
      _prefix := COALESCE(NULLIF(_prefix, ''), 'PT');

      LOOP
        INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
        VALUES (_pending_patient.clinic_id, _prefix, 1)
        ON CONFLICT (clinic_id, prefix)
        DO UPDATE SET last_value = public.clinic_counters.last_value + 1
        RETURNING last_value INTO _counter_val;

        _patient_code := _prefix || lpad(_counter_val::text, 4, '0');

        IF NOT EXISTS (
          SELECT 1 FROM public.patients
          WHERE clinic_id = _pending_patient.clinic_id
            AND patient_code = _patient_code
        ) THEN
          EXIT;
        END IF;
      END LOOP;

      INSERT INTO public.patients (
        clinic_id,
        patient_code,
        full_name,
        phone,
        email,
        date_of_birth,
        gender,
        address,
        emergency_contact,
        patient_type,
        status,
        created_by
      ) VALUES (
        _pending_patient.clinic_id,
        _patient_code,
        _pending_patient.full_name,
        _pending_patient.phone,
        _pending_patient.email,
        _pending_patient.date_of_birth,
        _pending_patient.gender,
        _pending_patient.address,
        _pending_patient.emergency_contact,
        _pending_patient.patient_type,
        'active',
        COALESCE(auth.uid(), NEW.created_by)
      ) RETURNING id INTO _new_patient_id;

      NEW.patient_id := _new_patient_id;
      NEW.pending_patient_id := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_appointment_flow_completion_after()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.pending_patient_id IS NOT NULL AND NEW.pending_patient_id IS NULL AND NEW.flow_status = 'engage' THEN
    DELETE FROM public.pending_patients
    WHERE id = OLD.pending_patient_id
      AND clinic_id = NEW.clinic_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_appointment_flow_completion ON public.appointments;
CREATE TRIGGER trg_appointment_flow_completion
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion();

DROP TRIGGER IF EXISTS trg_appointment_flow_completion_after ON public.appointments;
CREATE TRIGGER trg_appointment_flow_completion_after
  AFTER UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_appointment_flow_completion_after();


-- ============================================================================
-- FILE: 20260923100000_audit2_phase5_schema_hardening.sql
-- ============================================================================

-- Audit 2 Phase 5 â€” schema hardening (money + identity at DB layer)
-- Prerequisite: Phase 0 baseline applied (current_clinic_id, overpay trigger).
-- If UNIQUE (clinic_id, phone) fails, fix duplicate bare phones first (use +N family lines).

-- ========== 1) Invoice totals: only recalc trigger may change money columns ==========

CREATE OR REPLACE FUNCTION public.recalc_invoice_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _inv uuid;
  _paid numeric;
  _grand numeric;
BEGIN
  _inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.payments WHERE invoice_id = _inv;
  SELECT grand_total INTO _grand FROM public.invoices WHERE id = _inv;

  PERFORM set_config('audit2.allow_invoice_totals', '1', true);
  UPDATE public.invoices
  SET
    paid_amount = _paid,
    balance_amount = GREATEST(_grand - _paid, 0),
    status = CASE
      WHEN _paid <= 0 THEN 'unpaid'::public.invoice_status
      WHEN _paid >= _grand THEN 'paid'::public.invoice_status
      ELSE 'partial'::public.invoice_status
    END,
    updated_at = now()
  WHERE id = _inv;
  PERFORM set_config('audit2.allow_invoice_totals', '0', true);

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_invoice_financial_direct_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('audit2.allow_invoice_totals', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
    OR NEW.grand_total IS DISTINCT FROM OLD.grand_total
    OR NEW.paid_amount IS DISTINCT FROM OLD.paid_amount
    OR NEW.balance_amount IS DISTINCT FROM OLD.balance_amount
    OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'Invoice totals and status cannot be edited directly';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_reject_financial_edit ON public.invoices;
CREATE TRIGGER trg_invoices_reject_financial_edit
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_invoice_financial_direct_edit();

REVOKE ALL ON FUNCTION public.reject_invoice_financial_direct_edit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_invoice_financial_direct_edit() FROM anon, authenticated;

-- ========== 2) Payments: no delete/update for staff; recorded_by from session ==========

CREATE OR REPLACE FUNCTION public.enforce_payment_recorded_by()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.recorded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_enforce_recorded_by ON public.payments;
CREATE TRIGGER trg_payments_enforce_recorded_by
  BEFORE INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_payment_recorded_by();

REVOKE ALL ON FUNCTION public.enforce_payment_recorded_by() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_payment_recorded_by() FROM anon, authenticated;

DROP POLICY IF EXISTS "clinic_staff_all" ON public.payments;

CREATE POLICY "clinic_staff_payments_select"
  ON public.payments FOR SELECT TO authenticated
  USING (clinic_id = public.current_clinic_id());

CREATE POLICY "clinic_staff_payments_insert"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.current_clinic_id());

REVOKE DELETE, UPDATE ON public.payments FROM PUBLIC;
REVOKE DELETE, UPDATE ON public.payments FROM anon;
REVOKE DELETE, UPDATE ON public.payments FROM authenticated;

-- ========== 3) Patient delete must not CASCADE money rows ==========

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_patient_id_fkey;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_patient_id_fkey;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;

-- ========== 4) Invoice line items: non-negative unit price ==========

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_unit_price_nonneg;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_unit_price_nonneg CHECK (unit_price >= 0);

-- ========== 5) One phone string per clinic (family +N is separate strings) ==========

CREATE UNIQUE INDEX IF NOT EXISTS patients_clinic_phone_unique
  ON public.patients (clinic_id, phone);


-- ============================================================================
-- One clinic for every login
-- On a brand-new project this does nothing until the first user signs up.
-- If this script is applied where extra clinics already exist, those logins
-- and their rows are moved onto the oldest clinic, then the extra clinics
-- are removed.
-- ============================================================================

DO $$
DECLARE
  _clinic uuid;
  _table text;
BEGIN
  SELECT id INTO _clinic
  FROM public.clinics
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF _clinic IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.clinic_counters (clinic_id, prefix, last_value)
  SELECT _clinic, prefix, MAX(last_value)
  FROM public.clinic_counters
  GROUP BY prefix
  ON CONFLICT (clinic_id, prefix)
  DO UPDATE SET last_value = GREATEST(public.clinic_counters.last_value, EXCLUDED.last_value);

  DELETE FROM public.clinic_counters WHERE clinic_id <> _clinic;

  FOR _table IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'clinic_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name NOT IN ('clinics', 'clinic_counters')
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET clinic_id = %L WHERE clinic_id IS DISTINCT FROM %L',
      _table,
      _clinic,
      _clinic
    );
  END LOOP;

  DELETE FROM public.clinics WHERE id <> _clinic;
END $$;

