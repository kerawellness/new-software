-- Save a bill, its payment, and its installment rows in one transaction.
-- Reverse a payment only through reverse_payment. Direct negative amounts are rejected.
-- Run once in Supabase → SQL Editor after 08-clinic-today.sql. Safe to run again.

CREATE OR REPLACE FUNCTION public.clinic_today()
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT (timezone('Asia/Kolkata', now()))::date;
$$;

DO $$
DECLARE
  _name text;
BEGIN
  FOR _name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'payments'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%amount%'
  LOOP
    EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', _name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.payments_reject_nonpositive()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.amount <= 0
     AND current_setting('vsp.allow_payment_reversal', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Enter a valid payment amount.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_reject_nonpositive ON public.payments;
CREATE TRIGGER trg_payments_reject_nonpositive
  BEFORE INSERT OR UPDATE OF amount ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.payments_reject_nonpositive();

REVOKE ALL ON FUNCTION public.payments_reject_nonpositive() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.payments_reject_nonpositive() FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.collect_new_invoice(
  _invoice_date date,
  _notes text,
  _patient_id uuid,
  _items jsonb,
  _payment_amount numeric,
  _payment_method text,
  _payment_date date,
  _installment_count integer,
  _installment_start date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invoice jsonb;
  _id uuid;
  _number text;
  _grand numeric;
  _pay numeric;
  _remaining numeric;
  _count integer;
  _share numeric;
  _i integer;
  _plan uuid;
  _amount numeric;
  _start date;
BEGIN
  _invoice := public.create_invoice_with_items(_invoice_date, _notes, _patient_id, _items);
  _id := (_invoice->>'id')::uuid;
  _number := _invoice->>'invoice_number';

  SELECT grand_total INTO _grand FROM public.invoices WHERE id = _id;
  _pay := round(GREATEST(COALESCE(_payment_amount, 0), 0), 2);
  IF _pay > COALESCE(_grand, 0) + 0.001 THEN
    RAISE EXCEPTION 'Paid amount cannot exceed the invoice total.';
  END IF;

  IF _pay > 0 THEN
    PERFORM public.record_invoice_payment(
      _id,
      _patient_id,
      _pay,
      COALESCE(NULLIF(btrim(_payment_method), ''), 'cash'),
      COALESCE(_payment_date, public.clinic_today()),
      NULL,
      'Recorded with the invoice.',
      NULL,
      false
    );
  END IF;

  SELECT balance_amount INTO _remaining FROM public.invoices WHERE id = _id;
  _count := GREATEST(COALESCE(_installment_count, 0), 0);

  IF _count > 0 AND COALESCE(_remaining, 0) > 0.001 THEN
    _share := round(_remaining / _count, 2);
    _start := COALESCE(_installment_start, public.clinic_today());
    INSERT INTO public.installment_plans (
      clinic_id, invoice_id, number_of_installments, down_payment, installment_amount, start_date, status
    )
    VALUES (
      public.current_clinic_id(),
      _id,
      _count,
      _pay,
      _share,
      _start,
      'active'
    )
    RETURNING id INTO _plan;

    FOR _i IN 1.._count LOOP
      _amount := CASE
        WHEN _i = _count THEN round(_remaining - _share * (_count - 1), 2)
        ELSE _share
      END;
      INSERT INTO public.installments (
        clinic_id, installment_plan_id, due_date, amount, paid_amount, status
      )
      VALUES (
        public.current_clinic_id(),
        _plan,
        (_start + make_interval(months => _i))::date,
        _amount,
        0,
        'pending'
      );
    END LOOP;
  END IF;

  SELECT balance_amount INTO _remaining FROM public.invoices WHERE id = _id;
  RETURN jsonb_build_object(
    'id', _id,
    'invoice_number', _number,
    'grand_total', _grand,
    'balance_amount', COALESCE(_remaining, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.collect_new_invoice(date, text, uuid, jsonb, numeric, text, date, integer, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.collect_new_invoice(date, text, uuid, jsonb, numeric, text, date, integer, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_payment(_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic uuid;
  _pay public.payments%ROWTYPE;
  _plan uuid;
  _left numeric;
  _row record;
  _paid numeric;
BEGIN
  _clinic := public.current_clinic_id();
  IF _clinic IS NULL THEN
    RAISE EXCEPTION 'Clinic session not active.';
  END IF;

  SELECT * INTO _pay FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF _pay.id IS NULL OR _pay.clinic_id <> _clinic THEN
    RAISE EXCEPTION 'Payment not found.';
  END IF;
  IF _pay.amount <= 0 THEN
    RAISE EXCEPTION 'This payment was already reversed.';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.payments
    WHERE invoice_id = _pay.invoice_id
      AND notes LIKE '%[reversal-of:' || _payment_id::text || ']%'
  ) THEN
    RAISE EXCEPTION 'This payment was already reversed.';
  END IF;

  PERFORM set_config('vsp.allow_payment_reversal', '1', true);
  INSERT INTO public.payments (
    clinic_id, patient_id, invoice_id, amount, payment_method, payment_date, notes, recorded_by
  )
  VALUES (
    _clinic,
    _pay.patient_id,
    _pay.invoice_id,
    -_pay.amount,
    _pay.payment_method,
    public.clinic_today(),
    '[reversal-of:' || _payment_id::text || '] Reversal',
    auth.uid()
  );
  PERFORM set_config('vsp.allow_payment_reversal', '0', true);

  SELECT id INTO _plan FROM public.installment_plans WHERE invoice_id = _pay.invoice_id LIMIT 1;
  IF _plan IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO _paid FROM public.payments WHERE invoice_id = _pay.invoice_id;
    _left := GREATEST(_paid, 0);
    FOR _row IN
      SELECT id, amount
      FROM public.installments
      WHERE installment_plan_id = _plan
      ORDER BY due_date, created_at
    LOOP
      IF _left <= 0 THEN
        UPDATE public.installments
        SET paid_amount = 0, status = 'pending', paid_at = NULL
        WHERE id = _row.id;
      ELSIF _left + 0.001 >= _row.amount THEN
        UPDATE public.installments
        SET paid_amount = _row.amount, status = 'paid', paid_at = public.clinic_today()::timestamptz
        WHERE id = _row.id;
        _left := _left - _row.amount;
      ELSE
        UPDATE public.installments
        SET paid_amount = round(_left, 2), status = 'partial', paid_at = NULL
        WHERE id = _row.id;
        _left := 0;
      END IF;
    END LOOP;

    IF _paid + 0.001 >= (
      SELECT COALESCE(grand_total, 0) FROM public.invoices WHERE id = _pay.invoice_id
    ) THEN
      UPDATE public.installment_plans SET status = 'completed' WHERE id = _plan;
    ELSE
      UPDATE public.installment_plans SET status = 'active' WHERE id = _plan;
    END IF;
  END IF;

  RETURN jsonb_build_object('invoiceId', _pay.invoice_id, 'reversed', _pay.amount);
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_payment(uuid) TO authenticated;
