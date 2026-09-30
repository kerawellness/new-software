-- Copy this whole file into Supabase → SQL Editor → Run.
-- Read the grid. Every row must say PASS.
-- The last row must say: PASS — database ready for the app
-- This file only reads. It does not change data.
-- If you see "relation does not exist", the setup SQL did not finish.

WITH checks (ord, item, ok) AS (
  VALUES
    (1,  'table clinics', to_regclass('public.clinics') IS NOT NULL),
    (2,  'table profiles', to_regclass('public.profiles') IS NOT NULL),
    (3,  'table user_roles', to_regclass('public.user_roles') IS NOT NULL),
    (4,  'table patients', to_regclass('public.patients') IS NOT NULL),
    (5,  'table pending_patients', to_regclass('public.pending_patients') IS NOT NULL),
    (6,  'table appointments', to_regclass('public.appointments') IS NOT NULL),
    (7,  'table visits', to_regclass('public.visits') IS NOT NULL),
    (8,  'table treatments', to_regclass('public.treatments') IS NOT NULL),
    (9,  'table treatment_catalogue', to_regclass('public.treatment_catalogue') IS NOT NULL),
    (10, 'table invoices', to_regclass('public.invoices') IS NOT NULL),
    (11, 'table invoice_items', to_regclass('public.invoice_items') IS NOT NULL),
    (12, 'table payments', to_regclass('public.payments') IS NOT NULL),
    (13, 'table follow_ups', to_regclass('public.follow_ups') IS NOT NULL),
    (14, 'table audit_logs', to_regclass('public.audit_logs') IS NOT NULL),
    (15, 'function current_clinic_id', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'current_clinic_id'
    )),
    (16, 'function next_patient_code', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'next_patient_code'
    )),
    (17, 'function create_invoice_with_items', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'create_invoice_with_items'
    )),
    (18, 'function replace_patient_medical_profile', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'replace_patient_medical_profile'
    )),
    (19, 'function submit_online_appointment_request', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'submit_online_appointment_request'
    )),
    (20, 'trigger first user creates clinic', EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'on_auth_user_created' AND NOT tgisinternal
    )),
    (21, 'trigger block overpay', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'payments'
        AND t.tgname = 'trg_payments_reject_over_balance' AND NOT t.tgisinternal
    )),
    (22, 'trigger invoice totals recalc', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'payments'
        AND t.tgname = 'trg_payments_recalc' AND NOT t.tgisinternal
    )),
    (23, 'trigger staff cannot edit invoice totals', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'invoices'
        AND t.tgname = 'trg_invoices_reject_financial_edit' AND NOT t.tgisinternal
    )),
    (24, 'trigger payment recorded_by', EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'payments'
        AND t.tgname = 'trg_payments_enforce_recorded_by' AND NOT t.tgisinternal
    )),
    (25, 'unique phone per clinic', EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'patients_clinic_phone_unique'
    )),
    (26, 'staff cannot update or delete payments',
      CASE
        WHEN to_regclass('public.payments') IS NULL THEN false
        ELSE NOT has_table_privilege('authenticated', 'public.payments', 'UPDATE')
         AND NOT has_table_privilege('authenticated', 'public.payments', 'DELETE')
      END
    ),
    (27, 'row security on patients', EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'patients' AND c.relrowsecurity
    )),
    (28, 'row security on invoices', EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'invoices' AND c.relrowsecurity
    )),
    (29, 'row security on payments', EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'payments' AND c.relrowsecurity
    )),
    (30, 'deleting a patient cannot delete bills', EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'invoices_patient_id_fkey' AND confdeltype = 'r'
    )),
    (31, 'no duplicate patient phones',
      NOT EXISTS (
        SELECT 1 FROM public.patients
        GROUP BY clinic_id, phone
        HAVING count(*) > 1
      )
    ),
    (32, 'at least one staff profile', EXISTS (
      SELECT 1 FROM public.profiles
    )),
    (33, 'signup joins the existing clinic', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'handle_new_user'
        AND pg_get_functiondef(p.oid) ILIKE '%ORDER BY created_at ASC, id ASC%'
        AND pg_get_functiondef(p.oid) ILIKE '%IF _clinic IS NULL THEN%'
    )),
    (34, 'only one clinic', (SELECT count(*) FROM public.clinics) <= 1),
    (35, 'every login uses that clinic', (SELECT count(DISTINCT clinic_id) FROM public.profiles) <= 1),
    (36, 'function save_new_patient', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'save_new_patient'
    )),
    (37, 'function save_quick_entry', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'save_quick_entry'
    )),
    (38, 'function record_invoice_payment', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'record_invoice_payment'
    )),
    (39, 'function ensure_auth_user_clinic', EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'ensure_auth_user_clinic'
    )),
    (40, 'policy own_profile_select', EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'own_profile_select'
    ))
)
SELECT ord, item, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result
FROM checks
UNION ALL
SELECT
  100,
  'ALL',
  CASE
    WHEN bool_and(ok) THEN 'PASS — database ready for the app'
    ELSE 'FAIL — fix every FAIL row, then run this file again'
  END
FROM checks
ORDER BY 1;
