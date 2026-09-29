import type { EducationMaterial } from "@backend/models/education";
import * as educationRepository from "@backend/repositories/education-repository.server";
import type { ClinicDb } from "@backend/types";
import type {
  EducationMetadata,
  EducationSearchInput,
} from "@backend/validators/education-validators";
import { educationSearchSchema } from "@backend/validators/education-validators";

export async function searchEducationMaterials(db: ClinicDb, input: EducationSearchInput = {}) {
  const value = educationSearchSchema.parse(input);
  return educationRepository.searchEducationMaterials(db, {
    query: value.query,
    category: value.category,
    mediaType: value.mediaType,
    presentation: value.presentation,
    page: value.page,
    pageSize: value.pageSize,
  });
}

export async function createEducationSignedUrls(
  db: ClinicDb,
  targets: Array<{ id: string; storageBucket: string; storagePath: string }>,
  expiresInSeconds: number,
) {
  return educationRepository.createSignedUrls(db, targets, expiresInSeconds);
}

export async function registerEducationUpload(
  db: ClinicDb,
  args: Parameters<typeof educationRepository.registerEducationUpload>[1],
) {
  return educationRepository.registerEducationUpload(db, args);
}

export async function finalizeEducationUpload(db: ClinicDb, materialId: string) {
  return educationRepository.finalizeEducationUpload(db, materialId);
}

export async function updateEducationMaterial(
  db: ClinicDb,
  materialId: string,
  metadata: EducationMetadata,
  pairGroupId?: string | null,
) {
  return educationRepository.updateEducationMaterial(db, materialId, metadata, pairGroupId);
}

export async function deleteEducationMaterial(db: ClinicDb, materialId: string) {
  return educationRepository.deleteEducationMaterial(db, materialId);
}

export async function archiveFailedEducationUpload(
  db: ClinicDb,
  materialId: string,
  storagePath: string,
) {
  await educationRepository.archiveEducationMaterial(db, materialId);
  await educationRepository.removeEducationFiles(db, [storagePath]);
}

export type { EducationMaterial };
