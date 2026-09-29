import * as medicalProfileRepository from "@backend/repositories/medical-profile-repository.server";
import type { ReplacePatientMedicalProfileInput } from "@backend/validators/medical-profile-validators";
import type { ClinicDb } from "@backend/types";

export async function replacePatientMedicalProfile(
  db: ClinicDb,
  input: ReplacePatientMedicalProfileInput,
): Promise<void> {
  await medicalProfileRepository.replacePatientMedicalProfile(db, input);
}
