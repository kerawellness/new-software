export type SlotAppointment = {
  id: string;
  appointment_date: string;
  start_time: string | null;
  appointment_status: string;
  notes?: string | null;
  dentist_id?: string | null;
  doctorName?: string | null;
  patientName?: string | null;
};

export function clockTime(value: string | null | undefined): string {
  return (value ?? "").trim().slice(0, 5);
}

export function doctorFromNotes(notes: string | null | undefined): string {
  for (const line of (notes ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase().startsWith("doctor:")) {
      return trimmed.slice(trimmed.indexOf(":") + 1).trim();
    }
  }
  return "";
}

/** Same clock time is a conflict unless both sides name a different doctor. */
export function slotsConflict(
  existing: { dentistId?: string | null; doctorLabel?: string | null },
  next: { dentistId?: string | null; doctorLabel?: string | null },
): boolean {
  if (existing.dentistId && next.dentistId && existing.dentistId !== next.dentistId) return false;
  const left = (existing.doctorLabel ?? "").trim().toLowerCase();
  const right = (next.doctorLabel ?? "").trim().toLowerCase();
  if (left && right && left !== right) return false;
  return true;
}

export function findSameTimeConflict(
  rows: SlotAppointment[],
  target: {
    id?: string;
    date: string;
    time: string | null;
    dentistId?: string | null;
    doctorLabel?: string | null;
  },
): SlotAppointment | null {
  const time = clockTime(target.time);
  if (!target.date || !time) return null;
  for (const row of rows) {
    if (row.id === target.id) continue;
    if (row.appointment_status === "cancelled" || row.appointment_status === "no_show") continue;
    if (row.appointment_date !== target.date || clockTime(row.start_time) !== time) continue;
    const doctorLabel = doctorFromNotes(row.notes) || row.doctorName || "";
    if (
      slotsConflict(
        { dentistId: row.dentist_id ?? null, doctorLabel },
        { dentistId: target.dentistId ?? null, doctorLabel: target.doctorLabel ?? null },
      )
    ) {
      return row;
    }
  }
  return null;
}

export function sameTimeWarning(patientName: string | null | undefined, time: string): string {
  const who = patientName?.trim() || "another patient";
  return `${who} already has an appointment at ${time}. Book this time anyway?`;
}
