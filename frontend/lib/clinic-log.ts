import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";

export type ClinicLogCopy = {
  title: string;
  detail: string;
  area: string;
};

function text(meta: Record<string, unknown> | null, key: string): string | null {
  const value = meta?.[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function amount(meta: Record<string, unknown> | null, key: string): number | null {
  const value = meta?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return null;
}

function money(meta: Record<string, unknown> | null, key: string): string | null {
  const value = amount(meta, key);
  return value == null ? null : formatCurrency(value);
}

function join(parts: Array<string | null | undefined>) {
  return parts.filter((part) => part && part.trim()).join(" · ");
}

function person(meta: Record<string, unknown> | null) {
  return text(meta, "patient") ?? text(meta, "full_name") ?? text(meta, "name");
}

function when(date: string | null, time: string | null) {
  if (!date) return null;
  const day = formatDate(date);
  const clock = time ? formatTime(time) : "";
  if (!clock || clock === "—") return day;
  return `${day}, ${clock}`;
}

export function describeClinicLog(
  action: string,
  metadata: Record<string, unknown> | null,
): ClinicLogCopy {
  const who = person(metadata);

  switch (action) {
    case "patient_created":
      return {
        title: "New patient added",
        detail: join([who, text(metadata, "patient_code")]),
        area: "Patient",
      };
    case "quick_entry_express": {
      const method = text(metadata, "method");
      return {
        title: "Quick Entry saved",
        detail: join([
          who,
          text(metadata, "treatment"),
          (amount(metadata, "paid") ?? 0) > 0 ? `Paid ${money(metadata, "paid")}` : null,
          method ? (PAYMENT_METHOD_LABELS[method] ?? method) : null,
          text(metadata, "invoice_number"),
        ]),
        area: "Quick Entry",
      };
    }
    case "appointment_created":
      return {
        title: "Appointment booked",
        detail: join([who, when(text(metadata, "date"), null)]),
        area: "Appointment",
      };
    case "appointment_confirmed":
      return { title: "Appointment confirmed", detail: who ?? "", area: "Appointment" };
    case "appointment_cancelled":
      return { title: "Appointment cancelled", detail: who ?? "", area: "Appointment" };
    case "appointment_no_show":
      return { title: "Marked as no-show", detail: who ?? "", area: "Appointment" };
    case "appointment_scheduled":
      return { title: "Appointment set to expected", detail: who ?? "", area: "Appointment" };
    case "appointment_rescheduled":
      return {
        title: "Appointment moved",
        detail: join([
          who,
          when(text(metadata, "from_date"), text(metadata, "from_time")),
          when(text(metadata, "to_date"), text(metadata, "to_time"))
            ? `to ${when(text(metadata, "to_date"), text(metadata, "to_time"))}`
            : null,
        ]),
        area: "Appointment",
      };
    case "patient_arrived":
      return { title: "Patient arrived", detail: who ?? "", area: "Appointment" };
    case "patient_engaged":
      return { title: "Patient taken to the chair", detail: who ?? "", area: "Appointment" };
    case "visit_completed":
      return { title: "Visit finished", detail: who ?? "", area: "Appointment" };
    case "online_booking_converted":
      return {
        title: "Online request booked",
        detail: join([who, when(text(metadata, "date"), null)]),
        area: "Appointment",
      };
    case "visit_recorded":
      return {
        title: "Visit recorded",
        detail: join([who, text(metadata, "diagnosis")]),
        area: "Visit",
      };
    case "invoice_created":
      return {
        title: "Bill created",
        detail: join([text(metadata, "invoice_number"), who, money(metadata, "grand_total")]),
        area: "Billing",
      };
    case "payment_recorded": {
      const method = text(metadata, "method");
      return {
        title: "Payment taken",
        detail: join([
          money(metadata, "amount"),
          method ? (PAYMENT_METHOD_LABELS[method] ?? method) : null,
          text(metadata, "invoice_number"),
        ]),
        area: "Billing",
      };
    }
    case "followup_created":
      return {
        title: "Follow-up set",
        detail: join([who, text(metadata, "reason"), when(text(metadata, "due_date"), null)]),
        area: "Follow-up",
      };
    case "followup_completed":
      return { title: "Follow-up completed", detail: who ?? "", area: "Follow-up" };
    case "clinic_settings_updated":
      return { title: "Clinic settings saved", detail: "", area: "Clinic" };
    case "education_uploaded":
      return { title: "Education file added", detail: text(metadata, "title") ?? "", area: "Education" };
    case "education_updated":
      return { title: "Education file edited", detail: text(metadata, "title") ?? "", area: "Education" };
    case "education_deleted":
      return { title: "Education file removed", detail: text(metadata, "title") ?? "", area: "Education" };
    case "whatsapp_template_created":
      return { title: "WhatsApp message saved", detail: "", area: "WhatsApp" };
    case "whatsapp_template_updated":
      return { title: "WhatsApp message updated", detail: "", area: "WhatsApp" };
    case "demo_preview":
      return { title: "Sample row", detail: who ? `${who} · practice data` : "Practice data", area: "Sample" };
    default:
      return {
        title: action.replaceAll("_", " "),
        detail: who ?? "",
        area: "Clinic",
      };
  }
}

type CollapsibleLog = {
  id: string;
  action: string;
  created_at: string;
  userId: string | null;
  userName: string;
  metadata: Record<string, unknown> | null;
};

function samePerson(a: CollapsibleLog, b: CollapsibleLog) {
  if (a.userId && b.userId) return a.userId === b.userId;
  return a.userName === b.userName;
}

function closeInTime(a: CollapsibleLog, b: CollapsibleLog) {
  const gap = Math.abs(new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return gap <= 3 * 60 * 1000;
}

/** Quick Entry already includes the payment, so the extra payment row is one event. */
export function collapseQuickEntryPayments<T extends CollapsibleLog>(rows: T[]): T[] {
  const hidden = new Set<string>();
  const merged = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    if (row.action !== "quick_entry_express" || hidden.has(row.id)) continue;
    const paid = amount(row.metadata, "paid") ?? 0;
    if (paid <= 0) continue;
    const payment = rows.find((other) => {
      if (other.id === row.id || hidden.has(other.id) || other.action !== "payment_recorded") return false;
      if (!samePerson(row, other) || !closeInTime(row, other)) return false;
      const taken = amount(other.metadata, "amount");
      return taken != null && Math.abs(taken - paid) < 0.01;
    });
    if (!payment) continue;
    hidden.add(payment.id);
    merged.set(row.id, {
      ...(row.metadata ?? {}),
      method: text(row.metadata, "method") ?? text(payment.metadata, "method"),
      invoice_number: text(row.metadata, "invoice_number") ?? text(payment.metadata, "invoice_number"),
    });
  }

  return rows
    .filter((row) => !hidden.has(row.id))
    .map((row) => (merged.has(row.id) ? { ...row, metadata: merged.get(row.id)! } : row));
}
