import { supabase } from "@/integrations/supabase/client";
import { todayISO } from "@/lib/format";

/** A past visit still on the schedule, never arrived, and not cancelled. */
export function isMissedAppointment(input: {
  appointmentDate: string;
  appointmentStatus: string;
  flowStatus: string;
  arrivedAt: string | null;
  today: string;
}): boolean {
  if (input.appointmentDate >= input.today) return false;
  if (input.appointmentStatus !== "scheduled" && input.appointmentStatus !== "confirmed") {
    return false;
  }
  if (input.flowStatus !== "schedule") return false;
  if (input.arrivedAt) return false;
  return true;
}

const markedToday = new Map<string, Promise<number>>();

/** Save past missed visits as No Show. Reschedule moves the date; Arrived leaves the schedule. */
export async function markMissedAppointmentsNoShow(clinicId: string): Promise<number> {
  const today = todayISO();
  const { data, error } = await supabase
    .from("appointments")
    .update({ appointment_status: "no_show" })
    .eq("clinic_id", clinicId)
    .lt("appointment_date", today)
    .in("appointment_status", ["scheduled", "confirmed"])
    .eq("flow_status", "schedule")
    .is("arrived_at", null)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

/** Once per clinic per day, and never on the path that paints a page. */
export function markMissedAppointmentsNoShowOnce(clinicId: string): Promise<number> {
  const key = `${clinicId}:${todayISO()}`;
  const existing = markedToday.get(key);
  if (existing) return existing;
  const run = markMissedAppointmentsNoShow(clinicId).catch((error: unknown) => {
    markedToday.delete(key);
    throw error;
  });
  markedToday.set(key, run);
  return run;
}
