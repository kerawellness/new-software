import type { FollowUpRow } from "@backend/models/followup";
import * as auditRepository from "@backend/repositories/audit-repository.server";
import * as followupRepository from "@backend/repositories/followup-repository.server";
import type { ClinicDb } from "@backend/types";
import type { DateScope } from "@/lib/date-scope";
import { isDemoId } from "@/lib/demo-data";

export async function listFollowUps(
  db: ClinicDb,
  input: {
    viewFilter: "late" | "due" | "upcoming" | "done";
    dateScope: DateScope;
    sortOrder: "asc" | "desc";
    search: string;
    today: string;
  },
): Promise<FollowUpRow[]> {
  return followupRepository.listFollowUps(db, {
    viewFilter: input.viewFilter,
    dateScope: input.dateScope,
    sortOrder: input.sortOrder,
    today: input.today,
    search: input.search,
  });
}

export async function createFollowUp(
  db: ClinicDb,
  userId: string,
  input: {
    clinicId: string;
    patientId: string;
    patientName: string;
    reason: string;
    dueDate: string;
    notes: string;
  },
): Promise<void> {
  if (!input.reason.trim()) throw new Error("Enter follow-up reason.");
  if (!input.dueDate) throw new Error("Select a due date.");

  await followupRepository.insertFollowUp(db, {
    clinic_id: input.clinicId,
    patient_id: input.patientId,
    reason: input.reason.trim(),
    due_date: input.dueDate,
    notes: input.notes.trim() || null,
    status: "pending",
  });

  const audit = await auditRepository.insertAuditLog(db, {
    clinic_id: input.clinicId,
    user_id: userId,
    action: "followup_created",
    entity_type: "follow_up",
    entity_id: input.patientId,
    metadata: {
      patient: input.patientName,
      reason: input.reason.trim(),
      due_date: input.dueDate,
    },
  });
  if (audit.error) {
    console.error("audit log failed", {
      action: "followup_created",
      entityType: "follow_up",
      entityId: input.patientId,
      error: audit.error,
    });
  }
}

export async function completeFollowUp(
  db: ClinicDb,
  userId: string,
  input: { id: string; clinicId: string },
): Promise<void> {
  if (isDemoId(input.id)) {
    throw new Error(
      "Dummy rows are preview only — turn off Show dummy data to change real follow-ups.",
    );
  }
  await followupRepository.completeFollowUp(db, input.id);
  const audit = await auditRepository.insertAuditLog(db, {
    clinic_id: input.clinicId,
    user_id: userId,
    action: "followup_completed",
    entity_type: "follow_up",
    entity_id: input.id,
    metadata: null,
  });
  if (audit.error) {
    console.error("audit log failed", {
      action: "followup_completed",
      entityType: "follow_up",
      entityId: input.id,
      error: audit.error,
    });
  }
}

export async function rescheduleFollowUp(
  db: ClinicDb,
  input: { id: string; dueDate: string },
): Promise<void> {
  await followupRepository.rescheduleFollowUp(db, input.id, input.dueDate);
}
