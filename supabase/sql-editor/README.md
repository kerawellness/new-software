# SQL Editor — copy, check, test

Open **Supabase → SQL Editor**. Paste one file. Press **Run**.

## Order

**Clinic that already has patients**

1. Skip the big setup file.
2. Paste `02-single-clinic.sql` and press **Run** once. Every login uses the oldest clinic. A new login does not create another clinic.
3. Paste `01-check-after-setup.sql`. Last row must be `PASS — database ready for the app`.
4. Do the 5 tests below in the app (`npm run dev` → `http://localhost:8080`). Sign in with a second staff email and confirm Home shows the same clinic.

**Brand-new empty project**

1. Paste all of `supabase/full-setup-empty-database.sql`. Run once.
2. Paste `supabase/sql-editor/04-fix-auth-login.sql`. Run once (links every Auth user to a clinic profile).
3. Optionally paste `supabase/sql-editor/03-fast-saves.sql` for faster Quick Entry saves.
4. **Authentication → Users → Add user** (email + password). The first user creates the clinic. Each later user joins that clinic.
5. Paste `01-check-after-setup.sql`. Last row must be `PASS — database ready for the app`.
6. Put that project’s URL and publishable key in `.env`.
7. Do the 5 tests below.

If the check shows an error like `relation does not exist`, the setup file did not finish.

## What the check means

| Last row | Meaning |
| --- | --- |
| `PASS — database ready for the app` | Tables, save rules, and staff login row are in place |
| `FAIL — fix every FAIL row...` | Read each `FAIL` line. The missing piece is named in the `item` column |

Paste the result grid back to the AI when you want it checked. The AI reads PASS and FAIL. It does not need to open Supabase.

## 5 manual tests (backend + database)

Do these while signed in. Each one writes through `backend/` into Supabase.

1. **Login.** Sign in. Home shows today’s numbers. Proves Auth, `profiles`, and clinic access.
2. **Patient.** Quick Entry or New Patient with a new 10-digit phone. Search that name under Patients. Proves `patients` and `next_patient_code`.
3. **Appointment.** Book that patient for today. Open Patient Flow. Move them Expected → Waiting. Proves `appointments`.
4. **Money.** Billing: create a small invoice and take a payment equal to the bill. It saves. Try a second payment bigger than what is left. It must be rejected. Proves `invoices`, `payments`, and the overpay block.
5. **Follow-up.** Add a follow-up for that patient. Mark it done. Refresh. It stays done. Proves `follow_ups`.

If the SQL check is PASS and a test fails on screen, the bug is in `frontend/` or `backend/`, not a missing table.

## How to modify

**Add another database check**

Open `01-check-after-setup.sql`. Copy one `(number, 'name', ...)` line. Use the next number. Run the file again.

**Change the database**

1. Add a new file in this folder, for example `02-add-column.sql`.
2. Paste **only that new file** in the SQL Editor and Run.
3. Paste `01-check-after-setup.sql` again.
4. If the app must use the new column, edit the matching file in `backend/repositories/`.

**Change a screen or a save rule**

See `developer-guide/README.md` section 4. Screen files are in `frontend/routes/_authenticated/`. Money and patient rules are in `backend/services/`.
