import {
  completeFollowUpFn,
  createFollowUpFn,
  listFollowUpsFn,
  rescheduleFollowUpFn,
} from "@backend/controllers/followup-controller";
import type { FollowUpRow } from "@backend/models/followup";
import type { DateScope } from "@/lib/date-scope";
import { todayISO } from "@/lib/format";
import { unwrapApi } from "@/services/api-client";

export type { FollowUpRow };

export async function listFollowUps(input: {
  viewFilter: "late" | "due" | "upcoming" | "done";
  dateScope: DateScope;
  sortOrder: "asc" | "desc";
  search: string;
}): Promise<FollowUpRow[]> {
  return unwrapApi(
    await listFollowUpsFn({
      data: {
        ...input,
        today: todayISO(),
      },
    }),
  );
}

export async function createFollowUp(input: {
  clinicId: string;
  patientId: string;
  patientName: string;
  reason: string;
  dueDate: string;
  notes: string;
}): Promise<void> {
  unwrapApi(await createFollowUpFn({ data: input }));
}

export async function completeFollowUp(input: { id: string; clinicId: string }): Promise<void> {
  unwrapApi(await completeFollowUpFn({ data: input }));
}

export async function rescheduleFollowUp(input: { id: string; dueDate: string }): Promise<void> {
  unwrapApi(await rescheduleFollowUpFn({ data: input }));
}
