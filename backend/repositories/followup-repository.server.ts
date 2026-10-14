import { throwDb } from "@backend/db";
import type { FollowUpRow } from "@backend/models/followup";
import type { ClinicDb } from "@backend/types";
import { applyDateColumnFilter, type DateScope } from "@/lib/date-scope";
import { splitPreviousDue, withPreviousDue } from "@/lib/followup-previous-date";

const LIST_FOLLOW_UPS_LIMIT = 500;

export async function listFollowUps(
  db: ClinicDb,
  input: {
    viewFilter: "late" | "due" | "upcoming" | "done";
    dateScope: DateScope;
    sortOrder: "asc" | "desc";
    today: string;
    search: string;
  },
): Promise<FollowUpRow[]> {
  let query = db
    .from("follow_ups")
    .select(
      "id, reason, due_date, status, notes, created_at, patients(id, full_name, patient_code, phone)",
    )
    .order("due_date", { ascending: input.sortOrder === "asc" });

  query = applyDateColumnFilter(query, "due_date", input.dateScope);

  if (input.viewFilter === "late") {
    query = query.neq("status", "completed").lt("due_date", input.today);
  } else if (input.viewFilter === "due") {
    query = query.neq("status", "completed").eq("due_date", input.today);
  } else if (input.viewFilter === "upcoming") {
    query = query.in("status", ["pending", "scheduled"]).gt("due_date", input.today);
  } else {
    query = query.eq("status", "completed");
  }

  query = query.limit(LIST_FOLLOW_UPS_LIMIT);

  const { data, error } = await query;
  throwDb(error);
  const rows = (data ?? []) as unknown as FollowUpRow[];
  const term = input.search.trim().toLowerCase();
  if (!term) return rows;
  return rows.filter((row) => followUpMatchesSearch(row, term));
}

function followUpMatchesSearch(row: FollowUpRow, term: string) {
  return (
    row.reason.toLowerCase().includes(term) ||
    splitPreviousDue(row.notes).notes.toLowerCase().includes(term) ||
    (row.patients?.full_name?.toLowerCase().includes(term) ?? false) ||
    (row.patients?.patient_code?.toLowerCase().includes(term) ?? false) ||
    (row.patients?.phone?.toLowerCase().includes(term) ?? false)
  );
}

export async function insertFollowUp(
  db: ClinicDb,
  row: {
    clinic_id: string;
    patient_id: string;
    reason: string;
    due_date: string;
    notes: string | null;
    status: "pending";
  },
): Promise<void> {
  const { error } = await db.from("follow_ups").insert(row);
  throwDb(error);
}

export async function completeFollowUp(db: ClinicDb, id: string): Promise<void> {
  const { error } = await db.from("follow_ups").update({ status: "completed" }).eq("id", id);
  throwDb(error);
}

export async function rescheduleFollowUp(db: ClinicDb, id: string, dueDate: string): Promise<void> {
  const existing = await db
    .from("follow_ups")
    .select("due_date, notes")
    .eq("id", id)
    .maybeSingle();
  throwDb(existing.error);

  const previousDue =
    existing.data?.due_date && existing.data.due_date !== dueDate ? existing.data.due_date : null;

  const { error } = await db
    .from("follow_ups")
    .update({
      due_date: dueDate,
      status: "scheduled",
      ...(previousDue ? { notes: withPreviousDue(existing.data?.notes, previousDue) } : {}),
    })
    .eq("id", id);
  throwDb(error);
}
