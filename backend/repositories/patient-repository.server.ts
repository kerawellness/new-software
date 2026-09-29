import { throwDb } from "@backend/db";
import type { PatientOption } from "@backend/models/patient";
import type { ClinicDb } from "@backend/types";

export async function searchPatients(
  db: ClinicDb,
  clinicId: string,
  term: string,
): Promise<PatientOption[]> {
  const q = term.trim();
  let query = db
    .from("patients")
    .select("id, full_name, patient_code, phone")
    .eq("clinic_id", clinicId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (q.length > 0) {
    query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,patient_code.ilike.%${q}%`);
  }

  const { data, error } = await query;
  throwDb(error);
  return (data ?? []) as PatientOption[];
}

export async function findPatientsByPhoneIlike(
  db: ClinicDb,
  clinicId: string,
  base: string,
): Promise<PatientOption[]> {
  const { data, error } = await db
    .from("patients")
    .select("id, full_name, patient_code, phone")
    .eq("clinic_id", clinicId)
    .ilike("phone", `%${base}%`)
    .order("created_at", { ascending: true })
    .limit(20);
  throwDb(error);
  return (data ?? []) as PatientOption[];
}

export async function getPatientById(
  db: ClinicDb,
  clinicId: string,
  patientId: string,
): Promise<{ id: string; full_name: string; phone: string }> {
  const { data, error } = await db
    .from("patients")
    .select("id, full_name, phone")
    .eq("id", patientId)
    .eq("clinic_id", clinicId)
    .single();
  throwDb(error);
  return data!;
}

export async function insertPatient(
  db: ClinicDb,
  row: {
    clinic_id: string;
    patient_code: string;
    full_name: string;
    phone: string;
    email: string | null;
    patient_type: string;
  },
): Promise<{ id: string; full_name: string }> {
  const { data, error } = await db.from("patients").insert(row).select("id, full_name").single();
  throwDb(error);
  return data!;
}

export async function nextPatientCode(db: ClinicDb): Promise<string> {
  let patientCode = `PAT-${Date.now().toString().slice(-4)}`;
  try {
    const { data: nextCode, error: codeErr } = await (
      db.rpc as unknown as (fn: string) => Promise<{ data: string | null; error: Error | null }>
    )("next_patient_code");
    if (!codeErr && nextCode) patientCode = nextCode;
  } catch {
    // keep fallback
  }
  return patientCode;
}

type PendingPatientRow = {
  id: string;
  phone: string;
  full_name?: string;
  email?: string | null;
  patient_type?: string | null;
};

type PendingPatientsClient = {
  from(table: "pending_patients"): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): {
        ilike(
          column: string,
          value: string,
        ): {
          limit(count: number): Promise<{
            data: Array<{ id: string; phone: string }> | null;
            error: { message: string } | null;
          }>;
        };
        single(): Promise<{
          data: PendingPatientRow | null;
          error: { message: string } | null;
        }>;
      };
    };
    update(patch: Record<string, unknown>): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
    delete(): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>;
    };
  };
};

function pendingPatients(db: ClinicDb) {
  return db as unknown as PendingPatientsClient;
}

export async function listPendingPhonesByIlike(
  db: ClinicDb,
  clinicId: string,
  base: string,
): Promise<Array<{ id: string; phone: string }>> {
  const pendingRes = await pendingPatients(db)
    .from("pending_patients")
    .select("id, phone")
    .eq("clinic_id", clinicId)
    .ilike("phone", `%${base}%`)
    .limit(20);
  throwDb(pendingRes.error);
  return pendingRes.data ?? [];
}

export async function updatePendingPatient(
  db: ClinicDb,
  pendingPatientId: string,
  patch: { full_name: string; phone: string; email?: string | null },
): Promise<void> {
  const { error } = await pendingPatients(db)
    .from("pending_patients")
    .update(patch)
    .eq("id", pendingPatientId);
  throwDb(error);
}

export async function getPendingPatient(
  db: ClinicDb,
  pendingPatientId: string,
): Promise<PendingPatientRow> {
  const { data, error } = await pendingPatients(db)
    .from("pending_patients")
    .select("id, full_name, phone, email, patient_type")
    .eq("id", pendingPatientId)
    .single();
  throwDb(error);
  if (!data) throw new Error("Pending patient not found.");
  return data;
}

export async function deletePendingPatient(db: ClinicDb, pendingPatientId: string): Promise<void> {
  const { error } = await pendingPatients(db)
    .from("pending_patients")
    .delete()
    .eq("id", pendingPatientId);
  throwDb(error);
}
