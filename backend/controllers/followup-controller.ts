import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import {
  completeFollowUpSchema,
  createFollowUpSchema,
  listFollowUpsSchema,
  rescheduleFollowUpSchema,
} from "@backend/validators/followup-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listFollowUpsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => listFollowUpsSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { listFollowUps } = await import("@backend/services/followup-service.server");
      return listFollowUps(supabase, data);
    }),
  );

export const createFollowUpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createFollowUpSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase, userId } = clinicAuth(context);
      const { createFollowUp } = await import("@backend/services/followup-service.server");
      return createFollowUp(supabase, userId, data);
    }),
  );

export const completeFollowUpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => completeFollowUpSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase, userId } = clinicAuth(context);
      const { completeFollowUp } = await import("@backend/services/followup-service.server");
      return completeFollowUp(supabase, userId, data);
    }),
  );

export const rescheduleFollowUpFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => rescheduleFollowUpSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { rescheduleFollowUp } = await import("@backend/services/followup-service.server");
      return rescheduleFollowUp(supabase, data);
    }),
  );
