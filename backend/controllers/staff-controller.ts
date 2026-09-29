import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import { listActiveStaffSchema } from "@backend/validators/staff-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listActiveStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => listActiveStaffSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { listActiveStaff } = await import("@backend/services/staff-service.server");
      return listActiveStaff(supabase, data.clinicId);
    }),
  );
