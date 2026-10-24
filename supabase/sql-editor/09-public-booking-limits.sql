-- Cap public booking floods and hide GSTIN-shaped text on the public clinic card.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- The website calls the function that does not take a clinic id.

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
      _line := regexp_replace(_line, '\m\d{2}[A-Z0-9]{13}\M', '', 'gi');
      IF btrim(_line) = '' THEN
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

CREATE OR REPLACE FUNCTION public.submit_online_appointment_request(
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
  _clinic uuid;
  _request_id uuid;
  _today date := public.clinic_today();
  _clean_name text := btrim(coalesce(_name, ''));
  _clean_phone text := regexp_replace(coalesce(_phone, ''), '[^0-9+]', '', 'g');
  _clean_email text := nullif(btrim(coalesce(_email, '')), '');
BEGIN
  SELECT id INTO _clinic
  FROM public.clinics
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF _clinic IS NULL THEN
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
     AND (_requested_date < _today OR _requested_date > _today + 730) THEN
    RAISE EXCEPTION 'Invalid requested date';
  END IF;
  IF char_length(coalesce(_reason, '')) > 300 OR char_length(coalesce(_message, '')) > 2000 THEN
    RAISE EXCEPTION 'Appointment details are too long';
  END IF;

  IF (
    SELECT count(*)
    FROM public.online_appointment_requests
    WHERE clinic_id = _clinic
      AND created_at > now() - interval '10 minutes'
  ) >= 20 THEN
    RAISE EXCEPTION 'Please wait before submitting another request';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.online_appointment_requests
    WHERE clinic_id = _clinic
      AND phone = _clean_phone
      AND created_at > now() - interval '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Please wait before submitting another request';
  END IF;

  INSERT INTO public.online_appointment_requests (
    clinic_id, name, phone, email, requested_date, requested_time, reason, message, status
  )
  VALUES (
    _clinic,
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
  text, text, text, date, time, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_online_appointment_request(
  text, text, text, date, time, text, text
) TO anon, authenticated;

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
  _today date := public.clinic_today();
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
     AND (_requested_date < _today OR _requested_date > _today + 730) THEN
    RAISE EXCEPTION 'Invalid requested date';
  END IF;
  IF char_length(coalesce(_reason, '')) > 300 OR char_length(coalesce(_message, '')) > 2000 THEN
    RAISE EXCEPTION 'Appointment details are too long';
  END IF;

  IF (
    SELECT count(*)
    FROM public.online_appointment_requests
    WHERE clinic_id = _clinic_id
      AND created_at > now() - interval '10 minutes'
  ) >= 20 THEN
    RAISE EXCEPTION 'Please wait before submitting another request';
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
    clinic_id, name, phone, email, requested_date, requested_time, reason, message, status
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
