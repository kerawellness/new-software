import { listActiveStaffFn } from "@backend/controllers/staff-controller";
import type { StaffOption } from "@backend/models/staff";
import { unwrapApi } from "@/services/api-client";

export type { StaffOption };

export async function listActiveStaff(clinicId: string): Promise<StaffOption[]> {
  return unwrapApi(await listActiveStaffFn({ data: { clinicId } }));
}
