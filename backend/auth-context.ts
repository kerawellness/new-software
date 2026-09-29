import type { ClinicAuth, ClinicDb } from "@backend/types";

export function clinicAuth(context: unknown): ClinicAuth {
  const value = context as { supabase: ClinicDb; userId: string };
  return { supabase: value.supabase, userId: value.userId };
}
