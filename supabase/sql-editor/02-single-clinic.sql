-- One clinic for every login.
-- Run once on a database that already has patients.
-- Do not run full-setup-empty-database.sql on this database.
--
-- The oldest clinic is kept. Every login, and every row that was saved
-- under a later clinic, is moved onto that clinic. Later clinics are removed.
-- If two clinics share a patient code, invoice number, or phone, this stops
-- with an error instead of mixing those rows.

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
