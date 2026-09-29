import { z } from "zod";

export const listActiveStaffSchema = z.object({
  clinicId: z.string().uuid(),
});
