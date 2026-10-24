-- Clinic calendar date is Asia/Kolkata, including between midnight and 05:30 IST.
-- Run once in Supabase → SQL Editor. Safe to run again.

CREATE OR REPLACE FUNCTION public.clinic_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('Asia/Kolkata', now()))::date;
$$;

REVOKE ALL ON FUNCTION public.clinic_today() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_today() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_quick_entry(
  _full_name text,
  _phone text,
  _gender text,
  _conditions jsonb,
  _allergies jsonb,
  _medications jsonb,
  _habits jsonb,
  _doctor_notes text,
  _clinical_notes text,
  _treatment_label text,
  _treatments jsonb,
  _invoice_items jsonb,
  _payment_amount numeric,
  _payment_method text,
  _visit_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid;
  _code text;
  _phone_used text;
  _patient_id uuid;
  _saved_code text;
  _saved_name text;
  _attempt integer;
  _constraint text;
  _saved boolean := false;
  _visit_id uuid;
  _invoice jsonb;
  _grand numeric := 0;
  _tax numeric := 0;
  _paid numeric := 0;
  _invoice_number text := NULL;
  _day date := COALESCE(_visit_date, public.clinic_today());
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN
    RAISE EXCEPTION 'Clinic profile is not ready.';
  END IF;
  IF char_length(btrim(coalesce(_full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter patient''s full name.';
  END IF;

  _code := public.next_patient_code();
  _phone_used := btrim(_phone);
  _paid := round(GREATEST(COALESCE(_payment_amount, 0), 0), 2);

  FOR _attempt IN 1..6 LOOP
    BEGIN
      INSERT INTO public.patients (
        clinic_id, patient_code, full_name, phone, gender, patient_type, created_by
      )
      VALUES (
        _clinic, _code, btrim(_full_name), _phone_used, _gender, 'walk_in', auth.uid()
      )
      RETURNING id, patient_code, full_name INTO _patient_id, _saved_code, _saved_name;
      _saved := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS _constraint = CONSTRAINT_NAME;
      IF _constraint = 'patients_clinic_phone_unique' THEN
        IF _attempt = 6 THEN
          RAISE EXCEPTION 'This mobile is already on file.';
        END IF;
        _phone_used := public.next_family_phone(_clinic, _phone_used);
      ELSIF _constraint = 'patients_clinic_id_patient_code_key' THEN
        _code := public.next_patient_code();
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;

  IF NOT _saved THEN
    RAISE EXCEPTION 'This mobile is already on file.';
  END IF;

  INSERT INTO public.medical_conditions (clinic_id, patient_id, condition, category, notes)
  SELECT
    _clinic, _patient_id, btrim(x.condition),
    nullif(btrim(coalesce(x.category, '')), ''),
    nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_conditions, '[]'::jsonb)) AS x(condition text, category text, notes text)
  WHERE nullif(btrim(coalesce(x.condition, '')), '') IS NOT NULL;

  INSERT INTO public.allergies (clinic_id, patient_id, substance, notes)
  SELECT _clinic, _patient_id, btrim(x.substance), nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_allergies, '[]'::jsonb)) AS x(substance text, notes text)
  WHERE nullif(btrim(coalesce(x.substance, '')), '') IS NOT NULL;

  INSERT INTO public.medications (clinic_id, patient_id, medication, notes)
  SELECT _clinic, _patient_id, btrim(x.medication), nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_medications, '[]'::jsonb)) AS x(medication text, notes text)
  WHERE nullif(btrim(coalesce(x.medication, '')), '') IS NOT NULL;

  INSERT INTO public.patient_habits (clinic_id, patient_id, habit, notes)
  SELECT _clinic, _patient_id, btrim(x.habit), nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_habits, '[]'::jsonb)) AS x(habit text, notes text)
  WHERE nullif(btrim(coalesce(x.habit, '')), '') IS NOT NULL;

  INSERT INTO public.visits (
    clinic_id, patient_id, doctor_id, doctor_notes, visit_date,
    chief_complaint, treatment_performed, clinical_notes
  )
  VALUES (
    _clinic,
    _patient_id,
    auth.uid(),
    nullif(btrim(coalesce(_doctor_notes, '')), ''),
    _day,
    nullif(btrim(coalesce(_treatment_label, '')), ''),
    nullif(btrim(coalesce(_treatment_label, '')), ''),
    COALESCE(nullif(btrim(coalesce(_clinical_notes, '')), ''), 'Walk-in treatment recorded.')
  )
  RETURNING id INTO _visit_id;

  INSERT INTO public.treatments (
    clinic_id, patient_id, visit_id, name, status, treatment_date, cost, notes
  )
  SELECT
    _clinic,
    _patient_id,
    _visit_id,
    btrim(x.name),
    'completed'::public.treatment_status,
    _day,
    round(GREATEST(COALESCE(x.cost, 0), 0), 2),
    'Recorded via Quick Entry Flow'
  FROM jsonb_to_recordset(COALESCE(_treatments, '[]'::jsonb)) AS x(name text, cost numeric)
  WHERE nullif(btrim(coalesce(x.name, '')), '') IS NOT NULL;

  IF _invoice_items IS NOT NULL
     AND jsonb_typeof(_invoice_items) = 'array'
     AND jsonb_array_length(_invoice_items) > 0 THEN
    _invoice := public.create_invoice_with_items(
      _day,
      'Auto-generated via Quick Entry Flow',
      _patient_id,
      _invoice_items
    );
    _invoice_number := _invoice->>'invoice_number';
    SELECT tax_amount, grand_total
    INTO _tax, _grand
    FROM public.invoices
    WHERE id = (_invoice->>'id')::uuid;

    IF _paid > _grand + 0.001 AND _paid <= _grand + 0.05 THEN
      _paid := _grand;
    END IF;
    IF _paid > _grand + 0.001 THEN
      RAISE EXCEPTION 'Payment cannot exceed balance due.';
    END IF;

    IF _paid > 0 THEN
      INSERT INTO public.payments (
        clinic_id, patient_id, invoice_id, amount, payment_method, payment_date, notes, recorded_by
      )
      VALUES (
        _clinic,
        _patient_id,
        (_invoice->>'id')::uuid,
        _paid,
        _payment_method::public.payment_method,
        _day,
        'Recorded via Quick Entry Flow',
        auth.uid()
      );
    END IF;
  ELSIF _paid > 0 THEN
    RAISE EXCEPTION 'Payment cannot exceed balance due.';
  END IF;

  RETURN jsonb_build_object(
    'id', _patient_id,
    'patient_code', _saved_code,
    'full_name', _saved_name,
    'invoice_number', _invoice_number,
    'tax', COALESCE(_tax, 0),
    'cost', COALESCE(_grand, 0),
    'paid', CASE WHEN _invoice_number IS NULL THEN 0 ELSE _paid END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_quick_entry(
  text, text, text, jsonb, jsonb, jsonb, jsonb, text, text, text, jsonb, jsonb, numeric, text, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_quick_entry(
  text, text, text, jsonb, jsonb, jsonb, jsonb, text, text, text, jsonb, jsonb, numeric, text, date
) TO authenticated;
