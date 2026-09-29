import type { ClinicProfile } from "@backend/models/session";
import * as profileRepository from "@backend/repositories/profile-repository.server";
import type { ClinicDb } from "@backend/types";

export async function getSessionProfile(
  db: ClinicDb,
  userId: string,
): Promise<ClinicProfile | null> {
  return profileRepository.getProfileByUserId(db, userId);
}
