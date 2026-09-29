import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import { logAuditSchema } from "@backend/validators/audit-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const logAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => logAuditSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase, userId } = clinicAuth(context);
      const { logAudit } = await import("@backend/services/audit-service.server");
      return logAudit(supabase, userId, data);
    }),
  );
