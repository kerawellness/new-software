import type { PatientOption } from "@backend/models/patient";
import * as patientRepository from "@backend/repositories/patient-repository.server";
import type { ClinicDb } from "@backend/types";
import { splitFamilyPhone } from "@/lib/family-phone";

export async function searchPatients(
  db: ClinicDb,
  clinicId: string,
  term: string,
): Promise<PatientOption[]> {
  return patientRepository.searchPatients(db, clinicId, term);
}

export async function findPatientsByPhoneBase(
  db: ClinicDb,
  clinicId: string,
  phone: string,
): Promise<PatientOption[]> {
  const { base } = splitFamilyPhone(phone);
  if (base.length < 6) return [];
  const data = await patientRepository.findPatientsByPhoneIlike(db, clinicId, base);
  return data.filter((p) => splitFamilyPhone(p.phone).base === base);
}

export async function familyPhonesForBase(
  db: ClinicDb,
  clinicId: string,
  phone: string,
): Promise<string[]> {
  const { base } = splitFamilyPhone(phone);
  const [patients, pending] = await Promise.all([
    findPatientsByPhoneBase(db, clinicId, phone),
    patientRepository.listPendingPhonesByIlike(db, clinicId, base),
  ]);
  const pendingPhones = pending
    .filter((p) => splitFamilyPhone(p.phone).base === base)
    .map((p) => p.phone);
  return [...patients.map((p) => p.phone), ...pendingPhones];
}
