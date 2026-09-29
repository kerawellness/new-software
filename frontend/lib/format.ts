import { differenceInMinutes, format, parseISO } from "date-fns";

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Calendar month add in local timezone (avoids UTC date shift from toISOString). */
export function addMonthsLocalISO(isoDate: string, monthsToAdd: number): string {
  const parts = isoDate.split("-").map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const d = new Date(y, m - 1, day);
  d.setMonth(d.getMonth() + monthsToAdd);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function formatCurrency(amount: number | string | null | undefined, currency = "INR") {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)}`;
  }
}

export function catalogueOptionLabel(
  item: { id: string; name: string; default_cost: number | string | null },
  currency: string,
  catalogue: Array<{ id: string; name: string; default_cost: number | string | null }>,
) {
  const price = formatCurrency(item.default_cost, currency);
  const sameName = catalogue.filter((row) => row.name === item.name).length > 1;
  return sameName ? `${item.name} · ${price}` : `${item.name} (${price})`;
}

/** Day and month only, for a previous-date badge: 26/09. */
export function formatDayMonth(value?: string | null) {
  if (!value) return "";
  try {
    const d = value.length <= 10 ? parseISO(`${value}T00:00:00`) : parseISO(value);
    return format(d, "dd/MM");
  } catch {
    return "";
  }
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    const d = value.length <= 10 ? parseISO(`${value}T00:00:00`) : parseISO(value);
    return format(d, "d MMM yyyy");
  } catch {
    return value;
  }
}

export function formatTime(value?: string | null) {
  if (!value) return "—";
  try {
    const raw = value.includes("T") ? value : `1970-01-01T${value.length === 5 ? `${value}:00` : value}`;
    return format(parseISO(raw), "h:mm a");
  } catch {
    return value;
  }
}

export function formatClock(value?: string | null) {
  return formatTime(value);
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  try {
    return format(parseISO(value), "d MMM yyyy, h:mm a");
  } catch {
    return value;
  }
}

export function durationSince(value?: string | null) {
  if (!value) return "—";
  const mins = Math.max(0, differenceInMinutes(new Date(), new Date(value)));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}

export function minutesSince(value?: string | null): number {
  if (!value) return 0;
  return Math.max(0, differenceInMinutes(new Date(), new Date(value)));
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "");
}

/** Patient mobile as 10 digits (strips +91 and family +1 / +2). */
export function patientPhoneDigits(value: string) {
  const tagged = value.trim().match(/^(.*)\+(\d+)$/);
  const core = tagged ? tagged[1]! : value;
  const digits = core.replace(/\D/g, "");
  if (digits.length >= 12 && digits.startsWith("91")) return digits.slice(-10);
  return digits.slice(0, 10);
}

export function isPatientPhone(value: string) {
  return /^\d{10}$/.test(patientPhoneDigits(value));
}

export function whatsappLink(phone: string, message: string) {
  const digits = normalizePhone(phone).replace(/^\+/, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");
}

function isConsultationLabel(name: string) {
  return name.trim().toLowerCase() === "consultation";
}

function textIsOnlyConsultation(text: string) {
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every(isConsultationLabel);
}

/** A visit is a treatment when it has a procedure other than Consultation. */
export function visitHasTreatment(v: {
  treatment_performed?: string | null;
  treatments?: unknown[] | null;
}): boolean {
  const rows = v.treatments ?? [];
  if (rows.length > 0) {
    const hasProcedure = rows.some((row) => {
      if (!row || typeof row !== "object" || !("name" in row)) return true;
      const name = (row as { name?: unknown }).name;
      if (typeof name !== "string" || !name.trim()) return true;
      return !isConsultationLabel(name);
    });
    if (hasProcedure) return true;
  }
  const performed = v.treatment_performed?.trim() ?? "";
  if (!performed) return false;
  return !textIsOnlyConsultation(performed);
}

export function visitKindCounts(
  visits: Array<{
    patient_id: string;
    treatment_performed?: string | null;
    treatments?: unknown[] | null;
  }>,
) {
  let consultation = 0;
  let treatment = 0;
  const patients = new Set<string>();
  for (const visit of visits) {
    patients.add(visit.patient_id);
    if (visitHasTreatment(visit)) treatment += 1;
    else consultation += 1;
  }
  return { consultation, treatment, visitedPatients: patients.size };
}
