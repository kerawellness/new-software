import type { Role } from "@/lib/constants";

import { throwDb } from "@backend/db";
import type { ClinicProfile } from "@backend/models/session";
import type { ClinicDb } from "@backend/types";

export async function getProfileByUserId(
  db: ClinicDb,
  userId: string,
): Promise<ClinicProfile | null> {
  const [{ data: profile, error }, { data: roles }] = await Promise.all([
    db
      .from("profiles")
      .select(
        "id, clinic_id, name, email, avatar_url, clinics(id, name, phone, email, address, patient_code_prefix, tax_enabled, tax_rate, tax_label, currency)",
      )
      .eq("id", userId)
      .maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);

  throwDb(error);
  if (!profile) return null;

  return {
    id: profile.id,
    clinic_id: profile.clinic_id,
    name: profile.name,
    email: profile.email,
    avatar_url: profile.avatar_url,
    roles: (roles ?? []).map((r) => r.role as Role),
    clinic: (profile as unknown as { clinics: ClinicProfile["clinic"] }).clinics ?? null,
  };
}
