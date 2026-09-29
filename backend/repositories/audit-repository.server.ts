import { throwDb } from "@backend/db";
import type { ClinicDb } from "@backend/types";

export async function insertAuditLog(
  db: ClinicDb,
  row: {
    clinic_id: string;
    user_id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    metadata: Record<string, unknown> | null;
  },
): Promise<{ error: { message: string } | null }> {
  const { error } = await db.from("audit_logs").insert({
    clinic_id: row.clinic_id,
    user_id: row.user_id,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    metadata: (row.metadata ?? null) as never,
  });
  return { error };
}
