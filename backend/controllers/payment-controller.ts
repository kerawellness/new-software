import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import { recordInvoicePaymentSchema } from "@backend/validators/payment-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const recordInvoicePaymentFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => recordInvoicePaymentSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase, userId } = clinicAuth(context);
      const { recordInvoicePayment } = await import("@backend/services/payment-service.server");
      return recordInvoicePayment(supabase, userId, data);
    }),
  );
