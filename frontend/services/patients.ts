import {
  familyPhonesForBaseFn,
  findPatientsByPhoneFn,
  replacePatientMedicalProfileFn,
  searchPatientsFn,
} from "@backend/controllers/patient-controller";
import type { ReplacePatientMedicalProfileInput } from "@backend/validators/medical-profile-validators";
import type { PatientOption } from "@backend/models/patient";
import { unwrapApi } from "@/services/api-client";

export type { PatientOption };

export async function searchPatients(clinicId: string, term: string): Promise<PatientOption[]> {
  return unwrapApi(await searchPatientsFn({ data: { clinicId, term } }));
}

export async function findPatientsByPhone(
  clinicId: string,
  phone: string,
): Promise<PatientOption[]> {
  return unwrapApi(await findPatientsByPhoneFn({ data: { clinicId, phone } }));
}

export async function familyPhonesForBase(clinicId: string, phone: string): Promise<string[]> {
  return unwrapApi(await familyPhonesForBaseFn({ data: { clinicId, phone } }));
}

export async function replacePatientMedicalProfile(
  input: ReplacePatientMedicalProfileInput,
): Promise<void> {
  await unwrapApi(await replacePatientMedicalProfileFn({ data: input }));
}
