import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

export type ClinicDb = SupabaseClient<Database>;

export type ClinicAuth = {
  supabase: ClinicDb;
  userId: string;
};
