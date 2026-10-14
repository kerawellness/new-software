-- Hide GSTIN, UPI, and doctor lines from the public booking clinic card.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Staff invoices still read the full address from the clinics table.

CREATE OR REPLACE FUNCTION public.get_public_booking_clinic(_clinic_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  phone text,
  address text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _clinic public.clinics%ROWTYPE;
  _line text;
  _kept text := '';
BEGIN
  SELECT * INTO _clinic FROM public.clinics WHERE clinics.id = _clinic_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF _clinic.address IS NOT NULL THEN
    FOREACH _line IN ARRAY regexp_split_to_array(_clinic.address, E'\r?\n') LOOP
      IF btrim(_line) ~* '^(GSTIN|GST NO\.?|GST NUMBER|GSTIN NO\.?|UPI|DOCTOR1|DOCTOR2)\s*:' THEN
        CONTINUE;
      END IF;
      IF _kept <> '' THEN
        _kept := _kept || E'\n';
      END IF;
      _kept := _kept || _line;
    END LOOP;
  END IF;

  id := _clinic.id;
  name := _clinic.name;
  phone := _clinic.phone;
  address := NULLIF(btrim(_kept), '');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_booking_clinic(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_booking_clinic(uuid) TO anon, authenticated;
