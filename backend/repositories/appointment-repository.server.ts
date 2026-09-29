import { throwDb } from "@backend/db";
import type { ClinicDb } from "@backend/types";

export async function updateAppointmentArrival(
  db: ClinicDb,
  appointmentId: string,
  patch: {
    patient_id?: string;
    pending_patient_id?: null;
    flow_status: "waiting" | "engage";
    arrived_at?: string;
    engaged_at?: string;
    appointment_status: "confirmed";
  },
): Promise<void> {
  const { error } = await db
    .from("appointments")
    .update(patch as never)
    .eq("id", appointmentId);
  throwDb(error);
}
