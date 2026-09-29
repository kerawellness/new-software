# Connect the website appointment form

The website and Clinic Compass use the **same Supabase project**. The website does not create tables and does not send a clinic id. A form submit is only a request. Staff accept it in the app.

The table still stores `clinic_id`. The booking function fills that from the one clinic.

## 1. Create the clinic login

If you have not added a staff user yet:

1. Open the Clinic Compass project in Supabase.
2. Go to **Authentication → Users → Add user**.
3. Enter an email and password.
4. Turn on **Auto Confirm User**.
5. Save.

That first user creates the one clinic. Later staff logins join the same clinic. Without this user, a website booking is rejected with “Booking clinic unavailable”.

## 2. Run this SQL once

In **Supabase → SQL Editor**, paste this whole block and press **Run**. It removes the `_clinic_id` input. New requests still save the one clinic’s id.

```sql
DROP FUNCTION IF EXISTS public.submit_online_appointment_request(
  uuid, text, text, text, date, time, text, text
);

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
     AND (_requested_date < CURRENT_DATE OR _requested_date > CURRENT_DATE + 730) THEN
    RAISE EXCEPTION 'Invalid requested date';
  END IF;
  IF char_length(coalesce(_reason, '')) > 300 OR char_length(coalesce(_message, '')) > 2000 THEN
    RAISE EXCEPTION 'Appointment details are too long';
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
```

## 3. Logic on the website

```
Visitor fills the form
        |
        v
Website checks name, phone, and date
        |
        v
supabase.rpc("submit_online_appointment_request", { name, phone, ... })
        |
        v
Function stores the one clinic id and status = requested
        |
        v
Staff open Clinic Compass → Appointments → Online
```

What the website sends:

| Field | From the form | Rule |
| --- | --- | --- |
| `_name` | Name box | 2–120 characters |
| `_phone` | Phone box | 6–20 digits |
| `_email` | Email box, or empty | Optional |
| `_requested_date` | Date box | Not in the past. Use `YYYY-MM-DD` |
| `_requested_time` | Time box, or empty | Use `HH:MM` or leave empty |
| `_reason` | Reason box, or empty | Optional |
| `_message` | Message box, or empty | Optional |

Do not send `_clinic_id`. Do not set `CLINIC_ID` in `.env.local`. The function sets `clinic_id` and `requested`.

Success text: “Request received. The clinic will confirm.” The visit is not booked until staff accept it.

## 4. Prompt to paste into the website chat

Copy this whole block into the website project chat. Do this after the SQL in section 2 has run.

```
Update the public appointment form. Do not ask for CLINIC_ID and do not send _clinic_id. One clinic is chosen by the database.

Call:
supabase.rpc("submit_online_appointment_request", {
  _name,
  _phone,
  _email,
  _requested_date,
  _requested_time,
  _reason,
  _message
})

Rules:
- Do not send a status field. The database sets requested.
- Do not create tables, clinics, or a second database.
- Do not insert into online_appointment_requests or appointments from the browser.
- Do not list other people's requests.
- Before submit, check name 2–120 characters, phone 6–20 digits, optional email, date not in the past.
- On success, show: Request received. The clinic will confirm.
- On error, show the message from the function.
- Use the Clinic Compass Supabase URL and anon key only. No service-role key.
```

## 5. What the website must not do

- Do not ask the visitor or the env file for a clinic id.
- Do not create `clinics`, a `slug`, or `online_appointment_requests`.
- Do not insert into `online_appointment_requests` or `appointments` from the browser.
- Do not show other people’s requests on the public site.
- Do not use clinic id `a1b2c3d4-e5f6-7890-abcd-ef1234567890`.

## 6. Check that it connected

1. Submit a test from the website.
2. Sign in to Clinic Compass.
3. Open **Appointments → Online**.

The same name and phone must be there. Every staff login sees that same request.
