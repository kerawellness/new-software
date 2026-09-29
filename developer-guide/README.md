# Developer guide

One app. One command. Screens live in `frontend/`. Save logic lives in `backend/`. Clinic data lives in **Supabase** (cloud database).

## 1. Run the app

1. Copy `.env.example` to `.env`.
2. Fill these from **Supabase → Project Settings → API**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - Copy the same two values to `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
3. In the project folder:

```bash
npm install
npm run dev
```

4. Open `http://localhost:8080` and sign in with the staff email and password.

The publishable key is the public key. Leave the service role key out of `.env` and out of git.

## 2. How staff use it

| Screen | File | Job |
| --- | --- | --- |
| Home | `frontend/routes/_authenticated/dashboard.tsx` | Today’s numbers |
| Quick Entry | `quick-entry.tsx` | Walk-in: name, 10-digit phone, treatment, payment |
| Patients | `patients.index.tsx` | Search and open a chart |
| Patient Flow | `flow.tsx` | Expected → Waiting → In Chair → Done |
| Appointments | `appointments.tsx` | Book. **Online** tab = website requests |
| Treatments | `treatments.tsx` | Visit and procedures |
| Billing | `billing.tsx` | Invoice and payment. Payment cannot be more than the balance |
| Follow-Ups | `followups.tsx` | Recall list |
| Settings | `settings.tsx` | Clinic name, doctors, prices, staff on/off |

More screens (WhatsApp, education, analytics, clinic log) are the other files in `frontend/routes/_authenticated/`.

## 3. Database — where to set it up

The database is **not** inside this folder. It is the Supabase project named in `.env`.

**Clinic that already has patients**

Use the existing `.env`. The tables are already there. Skip the full setup file.

Paste `supabase/sql-editor/02-single-clinic.sql` once in the SQL Editor and press **Run**. Every login then uses the oldest clinic and sees the same patients and bills. A new login does not create another clinic.

**Brand-new empty Supabase project**

1. Supabase → **SQL Editor**.
2. Open `supabase/full-setup-empty-database.sql`.
3. Paste the **whole** file and press **Run** once.
4. Supabase → **Authentication → Users → Add user** (email + password).
5. That first user gets the clinic and an admin login. Each later user joins that same clinic.
6. Put that project’s URL and publishable key in `.env`, then `npm run dev`.

Run `full-setup-empty-database.sql` only on an empty project. On a clinic that already has data it tries to create tables that already exist.

**After the SQL is in Supabase**

Paste `supabase/sql-editor/01-check-after-setup.sql` in the SQL Editor. The last row must say `PASS — database ready for the app`. Then do the 5 app tests in `supabase/sql-editor/README.md` (login, patient, appointment, payment, follow-up).

**A later database change** (new column or new rule)

1. Add a small new `.sql` file in `supabase/sql-editor/`.
2. Supabase → **SQL Editor** → paste **only that new file** → Run.
3. Paste `01-check-after-setup.sql` again.
4. Then change the matching code in `backend/`.

Folders you can ignore while coding: `OPTIVUS_SD_V1_UPDATED/`, `.agents/`, `.github/`.

## 4. Where to change code

Follow this path. Change the smallest file that owns the behavior.

```
Screen  →  frontend/routes/_authenticated/<screen>.tsx
Shared UI  →  frontend/components/
Screen calls server  →  frontend/services/
Server entry  →  backend/controllers/
Input checks  →  backend/validators/
Rules (money, patients)  →  backend/services/
Read / write tables  →  backend/repositories/
```

| You want to… | Edit |
| --- | --- |
| Label, button, layout | The screen file in `frontend/routes/_authenticated/` |
| A shared card or bill layout | `frontend/components/` |
| How a save is sent | `frontend/services/` |
| Who can call it, and the check | `backend/controllers/` and `backend/validators/` |
| Payment or patient rules | `backend/services/` |
| The SQL the app runs | `backend/repositories/` |
| A new table or column | New SQL in Supabase first, then the repository |

With `npm run dev` running, save the file and refresh `http://localhost:8080`.

Leave payment limits, phone rules, and Supabase row security as they are unless the owner asked to change them.
