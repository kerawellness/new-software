-- Dental history on the patient medical profile, shown under Habits.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE TABLE IF NOT EXISTS public.patient_dental_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  item text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_dental_history TO authenticated;
GRANT ALL ON public.patient_dental_history TO service_role;

ALTER TABLE public.patient_dental_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clinic_staff_all" ON public.patient_dental_history;
CREATE POLICY "clinic_staff_all"
  ON public.patient_dental_history
  FOR ALL
  TO authenticated
  USING (clinic_id = public.current_clinic_id())
  WITH CHECK (clinic_id = public.current_clinic_id());
