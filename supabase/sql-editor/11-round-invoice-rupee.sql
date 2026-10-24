-- Round a new bill's total to the nearest rupee. 11.55 becomes 12. 11.49 becomes 11.
-- Run once in Supabase → SQL Editor. Safe to run again.

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
  _grand_total := round(_total_amount + _tax_amount, 0);
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
