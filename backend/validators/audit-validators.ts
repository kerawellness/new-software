import { z } from "zod";

export const logAuditSchema = z.object({
  clinicId: z.string().uuid(),
  action: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});
