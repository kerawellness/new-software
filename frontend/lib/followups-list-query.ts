import type { FollowUpRow } from "@backend/models/followup";
import { applyDateColumnFilter, type DateScope } from "@/lib/date-scope";
import { supabase } from "@/integrations/supabase/client";

const LIST_FOLLOW_UPS_LIMIT = 500;

export async function fetchFollowUpsList(input: {
  clinicId: string;
  viewFilter: "late" | "due" | "upcoming" | "done";
  dateScope: DateScope;
  sortOrder: "asc" | "desc";
  today: string;
}): Promise<FollowUpRow[]> {
  let query = supabase
    .from("follow_ups")
    .select(
      "id, reason, due_date, status, notes, created_at, patients(id, full_name, patient_code, phone)",
    )
    .eq("clinic_id", input.clinicId)
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

  const { data, error } = await query.limit(LIST_FOLLOW_UPS_LIMIT);
  if (error) throw error;
  return (data ?? []) as unknown as FollowUpRow[];
}
