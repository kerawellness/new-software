import { throwDb } from "@backend/db";
import type { ReplacePatientMedicalProfileInput } from "@backend/validators/medical-profile-validators";
import type { ClinicDb } from "@backend/types";

function isMissingRpcError(error: { code?: string; message?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42883" ||
    error.code === "PGRST202" ||
    msg.includes("replace_patient_medical_profile") ||
    msg.includes("could not find the function")
  );
}

async function replacePatientMedicalProfileSequential(
  db: ClinicDb,
  clinicId: string,
  patientId: string,
  input: ReplacePatientMedicalProfileInput,
): Promise<void> {
  const del = async (table: "medical_conditions" | "allergies" | "medications" | "patient_habits") => {
    const { error } = await db.from(table).delete().eq("patient_id", patientId).eq("clinic_id", clinicId);
    throwDb(error);
  };

  await del("medical_conditions");
  await del("allergies");
  await del("medications");
  await del("patient_habits");

  if (input.conditions.length > 0) {
    const { error } = await db.from("medical_conditions").insert(
      input.conditions.map((c) => ({
        clinic_id: clinicId,
        patient_id: patientId,
        condition: c.condition,
        category: c.category || "General",
        notes: c.notes || null,
      })),
    );
    throwDb(error);
  }

  if (input.allergies.length > 0) {
    const { error } = await db.from("allergies").insert(
      input.allergies.map((a) => ({
        clinic_id: clinicId,
        patient_id: patientId,
        substance: a.substance,
        allergy_type: "Drug",
        reaction: a.reaction || null,
        severity: a.severity || null,
        notes: a.notes || null,
      })),
    );
    throwDb(error);
  }

  if (input.medications.length > 0) {
    const { error } = await db.from("medications").insert(
      input.medications.map((m) => ({
        clinic_id: clinicId,
        patient_id: patientId,
        medication: m.medication,
        dosage: m.dosage || null,
        frequency: m.frequency || null,
        duration: m.duration || null,
        notes: m.notes || null,
      })),
    );
    throwDb(error);
  }

  if (input.habits.length > 0) {
    const { error } = await db.from("patient_habits").insert(
      input.habits.map((h) => ({
        clinic_id: clinicId,
        patient_id: patientId,
        habit: h.habit,
        notes: h.notes || null,
      })),
    );
    throwDb(error);
  }

  await replaceDentalHistory(db, clinicId, patientId, input.dentalHistory);
}

export async function replacePatientMedicalProfile(
  db: ClinicDb,
  input: ReplacePatientMedicalProfileInput,
): Promise<void> {
  const { data: patient, error: patientError } = await db
    .from("patients")
    .select("clinic_id")
    .eq("id", input.patientId)
    .single();
  throwDb(patientError);
  if (!patient?.clinic_id) {
    throw new Error("Patient not found.");
  }

  const clinicId = patient.clinic_id;
  const patientId = input.patientId;

  const allergiesPayload = input.allergies.map((a) => ({
    substance: a.substance,
    allergy_type: "Drug",
    reaction: a.reaction || null,
    severity: a.severity || null,
    notes: a.notes || null,
  }));

  const { error: rpcError } = await db.rpc("replace_patient_medical_profile", {
    p_patient_id: patientId,
    p_conditions: input.conditions,
    p_allergies: allergiesPayload,
    p_medications: input.medications,
    p_habits: input.habits,
  });

  if (!rpcError) {
    await replaceDentalHistory(db, clinicId, patientId, input.dentalHistory);
    return;
  }

  if (isMissingRpcError(rpcError)) {
    await replacePatientMedicalProfileSequential(db, clinicId, patientId, input);
    return;
  }

  throwDb(rpcError);
}

function isMissingDentalTable(error: { code?: string; message?: string }): boolean {
  const msg = (error.message ?? "").toLowerCase();
  return error.code === "42P01" || error.code === "PGRST205" || msg.includes("patient_dental_history");
}

async function replaceDentalHistory(
  db: ClinicDb,
  clinicId: string,
  patientId: string,
  rows: ReplacePatientMedicalProfileInput["dentalHistory"],
): Promise<void> {
  const { error: deleteError } = await db
    .from("patient_dental_history")
    .delete()
    .eq("patient_id", patientId)
    .eq("clinic_id", clinicId);

  if (deleteError) {
    if (isMissingDentalTable(deleteError) && rows.length === 0) return;
    if (isMissingDentalTable(deleteError)) {
      throw new Error(
        "Dental history is not ready yet. Run supabase/sql-editor/07-dental-history.sql in Supabase, then save again.",
      );
    }
    throwDb(deleteError);
  }

  if (rows.length === 0) return;

  const { error } = await db.from("patient_dental_history").insert(
    rows.map((row) => ({
      clinic_id: clinicId,
      patient_id: patientId,
      item: row.item,
      notes: row.notes || null,
    })),
  );
  throwDb(error);
}
