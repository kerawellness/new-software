import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import { createInvoiceSchema } from "@backend/validators/invoice-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createInvoiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createInvoiceSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { createInvoice } = await import("@backend/services/invoice-service.server");
      return createInvoice(supabase, data);
    }),
  );
