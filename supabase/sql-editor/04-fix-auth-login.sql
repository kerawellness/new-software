-- Every Supabase Auth user must have a clinic profile to use the app.
-- Run once in Supabase → SQL Editor. Safe to run again.

DROP POLICY IF EXISTS "own_profile_select" ON public.profiles;
CREATE POLICY "own_profile_select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE OR REPLACE FUNCTION public.ensure_auth_user_clinic()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _clinic uuid;
  _email text;
  _name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT clinic_id INTO _clinic FROM public.profiles WHERE id = _uid;
  IF _clinic IS NOT NULL THEN
    RETURN jsonb_build_object('clinic_id', _clinic, 'created', false);
  END IF;

  SELECT id INTO _clinic
  FROM public.clinics
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  SELECT u.email, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1))
  INTO _email, _name
  FROM auth.users u
  WHERE u.id = _uid;

  IF _email IS NULL THEN
    RAISE EXCEPTION 'Auth user not found';
  END IF;

  IF _clinic IS NULL THEN
    INSERT INTO public.clinics (name, email)
    VALUES (COALESCE(_name, 'My Dental Clinic'), _email)
    RETURNING id INTO _clinic;

    INSERT INTO public.motivation_quotes (clinic_id, quote) VALUES
      (_clinic, 'Every patient you see today trusts you with their health. Make it count.'),
      (_clinic, 'Small consistent care builds lifelong smiles.'),
      (_clinic, 'A calm clinic is an efficient clinic.');
  END IF;

  INSERT INTO public.profiles (id, clinic_id, name, email)
  VALUES (_uid, _clinic, COALESCE(nullif(btrim(_name), ''), split_part(_email, '@', 1)), _email)
  ON CONFLICT (id) DO UPDATE
  SET
    clinic_id = EXCLUDED.clinic_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email;

  INSERT INTO public.user_roles (user_id, clinic_id, role)
  VALUES (_uid, _clinic, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('clinic_id', _clinic, 'created', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_auth_user_clinic() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_auth_user_clinic() TO authenticated;

-- Link any Auth users that were created before the signup trigger ran.
DO $$
DECLARE
  _clinic uuid;
  _user record;
BEGIN
  SELECT id INTO _clinic
  FROM public.clinics
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  FOR _user IN
    SELECT u.id, u.email, COALESCE(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)) AS name
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  LOOP
    IF _clinic IS NULL THEN
      INSERT INTO public.clinics (name, email)
      VALUES (COALESCE(_user.name, 'My Dental Clinic'), _user.email)
      RETURNING id INTO _clinic;

      INSERT INTO public.motivation_quotes (clinic_id, quote) VALUES
        (_clinic, 'Every patient you see today trusts you with their health. Make it count.'),
        (_clinic, 'Small consistent care builds lifelong smiles.'),
        (_clinic, 'A calm clinic is an efficient clinic.');
    END IF;

    INSERT INTO public.profiles (id, clinic_id, name, email)
    VALUES (_user.id, _clinic, _user.name, _user.email)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, clinic_id, role)
    VALUES (_user.id, _clinic, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END LOOP;
END $$;
