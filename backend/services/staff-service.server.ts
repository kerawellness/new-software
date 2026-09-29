import type { StaffOption } from "@backend/models/staff";
import * as staffRepository from "@backend/repositories/staff-repository.server";
import type { ClinicDb } from "@backend/types";

export async function listActiveStaff(db: ClinicDb, clinicId: string): Promise<StaffOption[]> {
  return staffRepository.listActiveStaff(db, clinicId);
}
