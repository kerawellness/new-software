import type { QueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { applyDateColumnFilter, createDateScope } from "@/lib/date-scope";
import { todayISO } from "@/lib/format";
import { isSlowConnection } from "@/lib/network";
import { listFollowUps } from "@/services/followups";

/**
 * Loads the lists each page shows on first open, so a menu tap finds data
 * already in memory. Keys must match the page queries.
 */
export function warmClinicLists(qc: QueryClient, clinicId: string): () => void {
  const day = createDateScope("day");
  const allDates = createDateScope("all");
  const today = todayISO();

  const jobs: Array<() => Promise<unknown>> = [
    () =>
      qc.prefetchQuery({
        queryKey: ["patients", ""],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("patients")
            .select("id, patient_code, full_name, phone, patient_type, status, created_at, visits(visit_date)")
            .order("created_at", { ascending: false })
            .order("visit_date", { foreignTable: "visits", ascending: false })
            .limit(50)
            .limit(1, { foreignTable: "visits" });
          if (error) throw error;
          return data ?? [];
        },
      }),
    () =>
      qc.prefetchQuery({
        queryKey: ["appointments", day, "all", "asc"],
        queryFn: async () => {
          let query = supabase
            .from("appointments")
            .select(
              "id, appointment_date, start_time, end_time, reason, notes, appointment_status, flow_status, dentist_id, patients(id, full_name, patient_code, phone), pending_patients(id, full_name, phone, email), profiles(id, name)",
            )
            .order("appointment_date", { ascending: true })
            .order("start_time", { ascending: true, nullsFirst: false })
            .limit(200);
          query = applyDateColumnFilter(query, "appointment_date", day);
          const { data, error } = await query;
          if (error) throw error;
          return data ?? [];
        },
      }),
    () =>
      qc.prefetchQuery({
        queryKey: ["flow", today, clinicId],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("appointments")
            .select(
              "id, start_time, reason, notes, flow_status, arrived_at, engaged_at, completed_at, patients(id, full_name, patient_code, phone), pending_patients(id, full_name, phone, email)",
            )
            .eq("appointment_date", today)
            .neq("appointment_status", "cancelled")
            .neq("appointment_status", "no_show")
            .order("start_time", { ascending: true, nullsFirst: false });
          if (error) throw error;
          return data ?? [];
        },
      }),
    () =>
      qc.prefetchQuery({
        queryKey: ["visits", day, "desc"],
        queryFn: async () => {
          let query = supabase
            .from("visits")
            .select(
              "id, patient_id, visit_date, reason, chief_complaint, clinical_notes, diagnosis, treatment_performed, post_care_instructions, doctor_notes, patients(id, full_name, patient_code, phone), profiles(id, name), treatments(id, name, cost, tooth_number)",
            )
            .order("visit_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(100);
          query = applyDateColumnFilter(query, "visit_date", day);
          const { data, error } = await query;
          if (error) throw error;
          return data ?? [];
        },
      }),
    () =>
      qc.prefetchQuery({
        queryKey: ["outstanding-invoices"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("invoices")
            .select("id, balance_amount, grand_total, patients(id, full_name, patient_code, phone)")
            .eq("clinic_id", clinicId)
            .gt("balance_amount", 0);
          if (error) throw error;
          return data ?? [];
        },
      }),
    () =>
      qc.prefetchQuery({
        queryKey: ["followups", "late", allDates, "asc"],
        queryFn: () =>
          listFollowUps({
            viewFilter: "late",
            dateScope: allDates,
            sortOrder: "asc",
            search: "",
          }),
      }),
  ];

  const slow = isSlowConnection();
  const queue = slow ? jobs.slice(0, 3) : jobs;
  let cancelled = false;
  let timer = 0;
  let index = 0;

  const step = () => {
    if (cancelled || index >= queue.length) return;
    const run = queue[index];
    index += 1;
    if (run) void run().catch(() => undefined);
    timer = window.setTimeout(step, slow ? 1200 : 500);
  };

  timer = window.setTimeout(step, 4000);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}
