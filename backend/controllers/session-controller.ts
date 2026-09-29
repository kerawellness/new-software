import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    runController(async () => {
      const { supabase, userId } = clinicAuth(context);
      const { getSessionProfile } = await import("@backend/services/session-service.server");
      return getSessionProfile(supabase, userId);
    }),
  );
