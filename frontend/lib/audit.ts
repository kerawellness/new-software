import { ZodError } from "zod";

import { publicErrorMessage } from "@backend/errors";
import { getSessionUserId } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

/** Records an important clinic action. Failures never block the primary operation. */
export async function logAudit(
  clinicId: string,
  action: string,
  entityType?: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
) {
  try {
    const userId = await getSessionUserId();
    if (!userId) return;
    const { error } = await supabase.from("audit_logs").insert({
      clinic_id: clinicId,
      user_id: userId,
      action,
      entity_type: entityType ?? null,
      entity_id: entityId ?? null,
      metadata: (metadata ?? null) as never,
    });
    if (error) {
      console.error("audit log failed", { action, entityType, entityId, error });
      return false;
    }
    return true;
  } catch (err) {
    console.error("audit log failed", { action, entityType, entityId, error: err });
    return false;
  }
}

/** Turns backend errors into a message safe and useful for clinic staff. */
export function friendlyError(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
) {
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback;
  return publicErrorMessage(error, fallback);
}
