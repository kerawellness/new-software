-- One database call for new patient, Quick Entry, and recording a payment.
-- Run once in Supabase → SQL Editor on the clinic project. Safe to run again.

CREATE OR REPLACE FUNCTION public.next_family_phone(_clinic uuid, _phone text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _core text;
  _digits text;
  _base text;
  _max integer;
BEGIN
  IF _phone ~ '\+[0-9]+$' THEN
    _core := regexp_replace(_phone, '\+[0-9]+$', '');
  ELSE
    _core := _phone;
  END IF;
  _digits := regexp_replace(coalesce(_core, ''), '\D', '', 'g');
  _base := CASE WHEN char_length(_digits) >= 10 THEN right(_digits, 10) ELSE _digits END;

  SELECT COALESCE(MAX(
    CASE
      WHEN phone = _base THEN 0
      WHEN phone ~ ('^' || _base || '\+[0-9]+$')
        THEN substring(phone from '\+([0-9]+)$')::integer
      ELSE NULL
    END
  ), 0)
  INTO _max
  FROM public.patients
  WHERE clinic_id = _clinic
    AND (phone = _base OR phone LIKE _base || '+%');

  RETURN _base || '+' || (_max + 1)::text;
END;
$$;

REVOKE ALL ON FUNCTION public.next_family_phone(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_family_phone(uuid, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.save_new_patient(
  _full_name text,
  _phone text,
  _email text,
  _date_of_birth date,
  _gender text,
  _address text,
  _emergency_contact text,
  _patient_type text,
  _conditions jsonb,
  _allergies jsonb,
  _medications jsonb,
  _habits jsonb,
  _case_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid;
  _code text;
  _patient_id uuid;
  _saved_code text;
  _saved_name text;
  _attempt integer;
  _constraint text;
  _saved boolean := false;
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN
    RAISE EXCEPTION 'Clinic profile is not ready.';
  END IF;
  IF char_length(btrim(coalesce(_full_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Enter the patient''s full name';
  END IF;

  _code := public.next_patient_code();

  FOR _attempt IN 1..6 LOOP
    BEGIN
      INSERT INTO public.patients (
        clinic_id, patient_code, full_name, phone, email, date_of_birth,
        gender, address, emergency_contact, patient_type, created_by
      )
      VALUES (
        _clinic,
        _code,
        btrim(_full_name),
        btrim(_phone),
        nullif(btrim(coalesce(_email, '')), ''),
        _date_of_birth,
        nullif(btrim(coalesce(_gender, '')), ''),
        nullif(btrim(coalesce(_address, '')), ''),
        nullif(btrim(coalesce(_emergency_contact, '')), ''),
        COALESCE(nullif(btrim(coalesce(_patient_type, '')), ''), 'regular'),
        auth.uid()
      )
      RETURNING id, patient_code, full_name INTO _patient_id, _saved_code, _saved_name;
      _saved := true;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS _constraint = CONSTRAINT_NAME;
      IF _constraint = 'patients_clinic_phone_unique' THEN
        RAISE EXCEPTION 'This mobile is already on file.';
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
    _clinic,
    _patient_id,
    btrim(x.condition),
    nullif(btrim(coalesce(x.category, '')), ''),
    nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_conditions, '[]'::jsonb)) AS x(condition text, category text, notes text)
  WHERE nullif(btrim(coalesce(x.condition, '')), '') IS NOT NULL;

  INSERT INTO public.allergies (clinic_id, patient_id, substance, reaction, severity, notes)
  SELECT
    _clinic,
    _patient_id,
    btrim(x.substance),
    nullif(btrim(coalesce(x.reaction, '')), ''),
    nullif(btrim(coalesce(x.severity, '')), ''),
    nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_allergies, '[]'::jsonb)) AS x(
    substance text, reaction text, severity text, notes text
  )
  WHERE nullif(btrim(coalesce(x.substance, '')), '') IS NOT NULL;

  INSERT INTO public.medications (clinic_id, patient_id, medication, dosage, frequency, duration, notes)
  SELECT
    _clinic,
    _patient_id,
    btrim(x.medication),
    nullif(btrim(coalesce(x.dosage, '')), ''),
    nullif(btrim(coalesce(x.frequency, '')), ''),
    nullif(btrim(coalesce(x.duration, '')), ''),
    nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_medications, '[]'::jsonb)) AS x(
    medication text, dosage text, frequency text, duration text, notes text
  )
  WHERE nullif(btrim(coalesce(x.medication, '')), '') IS NOT NULL;

  INSERT INTO public.patient_habits (clinic_id, patient_id, habit, notes)
  SELECT
    _clinic,
    _patient_id,
    btrim(x.habit),
    nullif(btrim(coalesce(x.notes, '')), '')
  FROM jsonb_to_recordset(COALESCE(_habits, '[]'::jsonb)) AS x(habit text, notes text)
  WHERE nullif(btrim(coalesce(x.habit, '')), '') IS NOT NULL;

  IF nullif(btrim(coalesce(_case_note, '')), '') IS NOT NULL THEN
    INSERT INTO public.case_notes (clinic_id, patient_id, note, created_by)
    VALUES (_clinic, _patient_id, btrim(_case_note), auth.uid());
  END IF;

  RETURN jsonb_build_object(
    'id', _patient_id,
    'patient_code', _saved_code,
    'full_name', _saved_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_new_patient(
  text, text, text, date, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_new_patient(
  text, text, text, date, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text
) TO authenticated;

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
    COALESCE(_visit_date, CURRENT_DATE),
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
    COALESCE(_visit_date, CURRENT_DATE),
    round(GREATEST(COALESCE(x.cost, 0), 0), 2),
    'Recorded via Quick Entry Flow'
  FROM jsonb_to_recordset(COALESCE(_treatments, '[]'::jsonb)) AS x(name text, cost numeric)
  WHERE nullif(btrim(coalesce(x.name, '')), '') IS NOT NULL;

  IF _invoice_items IS NOT NULL
     AND jsonb_typeof(_invoice_items) = 'array'
     AND jsonb_array_length(_invoice_items) > 0 THEN
    _invoice := public.create_invoice_with_items(
      COALESCE(_visit_date, CURRENT_DATE),
      'Auto-generated via Quick Entry Flow',
      _patient_id,
      _invoice_items
    );
    _invoice_number := _invoice->>'invoice_number';
    SELECT tax_amount, grand_total
    INTO _tax, _grand
    FROM public.invoices
    WHERE id = (_invoice->>'id')::uuid;

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
        COALESCE(_visit_date, CURRENT_DATE),
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

CREATE OR REPLACE FUNCTION public.record_invoice_payment(
  _invoice_id uuid,
  _patient_id uuid,
  _amount numeric,
  _payment_method text,
  _payment_date date,
  _reference text,
  _notes text,
  _target_installment jsonb,
  _skip_audit boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid;
  _invoice_clinic uuid;
  _invoice_patient uuid;
  _invoice_number text;
  _patient_name text;
  _balance numeric;
  _amt numeric;
  _plan_id uuid;
  _note text;
  _target_id uuid;
  _due_share numeric;
  _already numeric;
  _total_paid numeric;
  _status text;
  _rem numeric;
  _n integer;
  _share numeric;
  _i integer;
  _row record;
  _due numeric;
  _remaining_pay numeric;
  _next_due date;
  _all_paid boolean;
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN
    RAISE EXCEPTION 'Clinic session not active.';
  END IF;

  _amt := round(COALESCE(_amount, 0), 2);
  IF _amt <= 0 THEN
    RAISE EXCEPTION 'Enter a valid payment amount.';
  END IF;

  SELECT clinic_id, patient_id, invoice_number, balance_amount
  INTO _invoice_clinic, _invoice_patient, _invoice_number, _balance
  FROM public.invoices
  WHERE id = _invoice_id
  FOR UPDATE;

  IF _invoice_clinic IS NULL OR _invoice_clinic <> _clinic THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;
  IF _invoice_patient IS DISTINCT FROM _patient_id THEN
    RAISE EXCEPTION 'Patient does not match this invoice.';
  END IF;
  IF _amt > COALESCE(_balance, 0) + 0.001 THEN
    RAISE EXCEPTION 'Payment cannot exceed balance due.';
  END IF;

  SELECT full_name INTO _patient_name FROM public.patients WHERE id = _patient_id;
  SELECT id INTO _plan_id FROM public.installment_plans WHERE invoice_id = _invoice_id LIMIT 1;

  _note := btrim(coalesce(_notes, ''));
  IF _plan_id IS NOT NULL THEN
    IF _target_installment IS NOT NULL AND jsonb_typeof(_target_installment) = 'object' THEN
      _note := (
        '[Installment #' || ((_target_installment->>'index')::integer + 1)::text
        || ' of ' || (_target_installment->>'totalCount')
        || '][ParentId:' || _plan_id::text || '] ' || _note
      );
    ELSE
      _note := ('[Waterfall Payment][ParentId:' || _plan_id::text || '] ' || _note);
    END IF;
    _note := btrim(_note);
  END IF;

  INSERT INTO public.payments (
    clinic_id, patient_id, invoice_id, amount, payment_method, payment_date, reference, notes, recorded_by
  )
  VALUES (
    _clinic,
    _patient_id,
    _invoice_id,
    _amt,
    _payment_method::public.payment_method,
    COALESCE(_payment_date, CURRENT_DATE),
    nullif(btrim(coalesce(_reference, '')), ''),
    nullif(_note, ''),
    auth.uid()
  );

  IF _plan_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.installments WHERE installment_plan_id = _plan_id
  ) THEN
    IF _target_installment IS NOT NULL AND jsonb_typeof(_target_installment) = 'object'
       AND nullif(_target_installment->>'id', '') IS NOT NULL THEN
      _target_id := (_target_installment->>'id')::uuid;
      _due_share := GREATEST(0, COALESCE((_target_installment->>'amount')::numeric, 0));
      _already := COALESCE((_target_installment->>'paid_amount')::numeric, 0);
      _total_paid := _already + _amt;
      _status := CASE WHEN _due_share > 0 AND _total_paid >= _due_share THEN 'paid' ELSE 'partial' END;

      UPDATE public.installments
      SET
        paid_amount = _total_paid,
        status = _status::public.installment_status,
        paid_at = CASE WHEN _status = 'paid' THEN COALESCE(_payment_date, CURRENT_DATE)::timestamptz ELSE NULL END
      WHERE id = _target_id;

      SELECT balance_amount INTO _rem FROM public.invoices WHERE id = _invoice_id;
      SELECT count(*) INTO _n
      FROM public.installments
      WHERE installment_plan_id = _plan_id AND status <> 'paid';

      IF _n > 0 AND _rem <= 0 THEN
        UPDATE public.installments
        SET amount = 0, status = 'paid', paid_at = COALESCE(_payment_date, CURRENT_DATE)::timestamptz
        WHERE installment_plan_id = _plan_id AND status <> 'paid';
      ELSIF _n > 0 THEN
        _share := round((_rem / _n)::numeric, 2);
        _i := 0;
        FOR _row IN
          SELECT id
          FROM public.installments
          WHERE installment_plan_id = _plan_id AND status <> 'paid'
          ORDER BY due_date
        LOOP
          _i := _i + 1;
          UPDATE public.installments
          SET amount = CASE
            WHEN _i = _n THEN round((_rem - _share * (_n - 1))::numeric, 2)
            ELSE _share
          END
          WHERE id = _row.id;
        END LOOP;
      END IF;
    ELSE
      _remaining_pay := _amt;
      FOR _row IN
        SELECT id, amount, paid_amount, status, due_date
        FROM public.installments
        WHERE installment_plan_id = _plan_id
        ORDER BY due_date
      LOOP
        EXIT WHEN _remaining_pay <= 0;
        IF _row.status::text = 'paid' THEN
          CONTINUE;
        END IF;
        _due := _row.amount - COALESCE(_row.paid_amount, 0);
        IF _remaining_pay >= _due THEN
          UPDATE public.installments
          SET
            paid_amount = _row.amount,
            status = 'paid',
            paid_at = COALESCE(_payment_date, CURRENT_DATE)::timestamptz
          WHERE id = _row.id;
          _remaining_pay := _remaining_pay - _due;
        ELSE
          UPDATE public.installments
          SET
            paid_amount = COALESCE(_row.paid_amount, 0) + _remaining_pay,
            status = 'partial'
          WHERE id = _row.id;
          _remaining_pay := 0;
        END IF;
      END LOOP;
    END IF;

    SELECT balance_amount INTO _rem FROM public.invoices WHERE id = _invoice_id;
    IF _rem <= 0 THEN
      UPDATE public.installments
      SET status = 'paid', paid_at = COALESCE(_payment_date, CURRENT_DATE)::timestamptz
      WHERE installment_plan_id = _plan_id AND status <> 'paid';
      UPDATE public.installment_plans SET status = 'completed' WHERE id = _plan_id;
    ELSE
      SELECT bool_and(status = 'paid') INTO _all_paid
      FROM public.installments
      WHERE installment_plan_id = _plan_id;
      IF _all_paid THEN
        UPDATE public.installment_plans SET status = 'completed' WHERE id = _plan_id;
      END IF;
    END IF;
  END IF;

  IF NOT COALESCE(_skip_audit, false)
     AND position('Recorded via Quick Entry Flow' in coalesce(_notes, '')) = 0 THEN
    INSERT INTO public.audit_logs (clinic_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (
      _clinic,
      auth.uid(),
      'payment_recorded',
      'invoice',
      _invoice_id,
      jsonb_build_object(
        'amount', _amt,
        'method', _payment_method,
        'invoice_number', _invoice_number
      )
    );
  END IF;

  SELECT balance_amount INTO _balance FROM public.invoices WHERE id = _invoice_id;
  _next_due := NULL;
  IF _plan_id IS NOT NULL THEN
    SELECT due_date INTO _next_due
    FROM public.installments
    WHERE installment_plan_id = _plan_id AND status <> 'paid'
    ORDER BY due_date
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'invoiceId', _invoice_id,
    'invoiceNumber', _invoice_number,
    'patientId', _patient_id,
    'patientName', COALESCE(_patient_name, ''),
    'remaining', GREATEST(COALESCE(_balance, 0), 0),
    'nextDueDate', _next_due,
    'clinicId', _clinic
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_invoice_payment(
  uuid, uuid, numeric, text, date, text, text, jsonb, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_invoice_payment(
  uuid, uuid, numeric, text, date, text, text, jsonb, boolean
) TO authenticated;
