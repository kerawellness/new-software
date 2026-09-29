import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import {
  arrivePendingPatientSchema,
  registerPendingAtChairSchema,
} from "@backend/validators/patient-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const arrivePendingPatientFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => arrivePendingPatientSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase, userId } = clinicAuth(context);
      const { arrivePendingPatient } =
        await import("@backend/services/arrive-pending-service.server");
      return arrivePendingPatient(supabase, userId, data);
    }),
  );

export const registerPendingAtChairFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => registerPendingAtChairSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { registerPendingAtChair } =
        await import("@backend/services/arrive-pending-service.server");
      return registerPendingAtChair(supabase, data);
    }),
  );
