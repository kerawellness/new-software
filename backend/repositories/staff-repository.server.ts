import { throwDb } from "@backend/db";
import type { StaffOption } from "@backend/models/staff";
import type { ClinicDb } from "@backend/types";

export async function listActiveStaff(db: ClinicDb, clinicId: string): Promise<StaffOption[]> {
  const { data, error } = await db
    .from("profiles")
    .select("id, name")
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .order("name", { ascending: true });
  throwDb(error);
  return (data ?? []) as StaffOption[];
}
