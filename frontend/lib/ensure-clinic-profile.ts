import { supabase } from "@/integrations/supabase/client";

/** Creates or repairs the signed-in user's clinic profile row. */
export async function ensureClinicProfileForSession(): Promise<void> {
  const { error } = await supabase.rpc("ensure_auth_user_clinic");
  if (error) throw error;
}
