import * as auditRepository from "@backend/repositories/audit-repository.server";
import type { ClinicDb } from "@backend/types";

export async function logAudit(
  db: ClinicDb,
  userId: string,
  input: {
    clinicId: string;
    action: string;
    entityType?: string | undefined;
    entityId?: string | null | undefined;
    metadata?: Record<string, unknown> | undefined;
  },
): Promise<boolean> {
  try {
    const { error } = await auditRepository.insertAuditLog(db, {
      clinic_id: input.clinicId,
      user_id: userId,
      action: input.action,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? null,
    });
    if (error) {
      console.error("audit log failed", {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        error,
      });
      return false;
    }
    return true;
  } catch (err) {
    console.error("audit log failed", {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      error: err,
    });
    return false;
  }
}
