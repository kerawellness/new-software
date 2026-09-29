import { getProfileFn } from "@backend/controllers/session-controller";
import type { ClinicProfile } from "@backend/models/session";
import { unwrapApi } from "@/services/api-client";

export async function getClinicProfile(): Promise<ClinicProfile | null> {
  return unwrapApi(await getProfileFn());
}
