import { zipSync } from "fflate";

import { supabase } from "@/integrations/supabase/client";

export type BackupScope =
  | { mode: "overall" }
  | { mode: "month"; month: string }
  | { mode: "between"; from: string; to: string };

type Range = { start: string; end: string };

export function backupMonthRange(month: string): Range {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthNumber = Number(monthText);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const mm = String(monthNumber).padStart(2, "0");
  return {
    start: `${year}-${mm}-01`,
    end: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
  };
}

export function backupBetweenRange(fromMonth: string, toMonth: string): Range {
  const [from, to] = fromMonth <= toMonth ? [fromMonth, toMonth] : [toMonth, fromMonth];
  return {
    start: backupMonthRange(from).start,
    end: backupMonthRange(to).end,
  };
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(","));
  return lines.join("\r\n");
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function personName(row: { patients?: { full_name?: string; patient_code?: string; phone?: string } | null }) {
  const patient = row.patients;
  return {
    name: patient?.full_name ?? "",
    code: patient?.patient_code ?? "",
    phone: patient?.phone ?? "",
  };
}

async function eachPage<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const size = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await load(from, from + size - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < size) return all;
  }
}

type Dated = "date" | "time" | "none";

function stampRange(range: Range | null, kind: Dated): { start: string; end: string } | null {
  if (!range || kind === "none") return null;
  if (kind === "date") return range;
  return {
    start: new Date(`${range.start}T00:00:00`).toISOString(),
    end: new Date(`${range.end}T23:59:59.999`).toISOString(),
  };
}

export async function downloadClinicBackup(clinicId: string, scope: BackupScope): Promise<void> {
  const between = scope.mode === "between" ? backupBetweenRange(scope.from, scope.to) : null;
  const range = scope.mode === "month" ? backupMonthRange(scope.month) : between;
  const label =
    scope.mode === "month" ? scope.month : between ? `${between.start.slice(0, 7)}_to_${between.end.slice(0, 7)}` : "overall";

  const patients = await eachPage((from, to) => {
    let query = supabase
      .from("patients")
      .select("patient_code, full_name, phone, email, date_of_birth, gender, address, emergency_contact, patient_type, status, created_at")
      .eq("clinic_id", clinicId)
      .order("patient_code", { ascending: true })
      .range(from, to);
    const bounds = stampRange(range, "time");
    if (bounds) query = query.gte("created_at", bounds.start).lte("created_at", bounds.end);
    return query;
  });

  const appointments = await eachPage((from, to) => {
    let query = supabase
      .from("appointments")
      .select("appointment_date, start_time, appointment_status, flow_status, reason, notes, patients(full_name, patient_code, phone)")
      .eq("clinic_id", clinicId)
      .order("appointment_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("appointment_date", range.start).lte("appointment_date", range.end);
    return query;
  });

  const visits = await eachPage((from, to) => {
    let query = supabase
      .from("visits")
      .select("visit_date, chief_complaint, diagnosis, treatment_performed, clinical_notes, doctor_notes, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("visit_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("visit_date", range.start).lte("visit_date", range.end);
    return query;
  });

  const treatments = await eachPage((from, to) => {
    let query = supabase
      .from("treatments")
      .select("treatment_date, name, tooth_number, cost, status, notes, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("treatment_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("treatment_date", range.start).lte("treatment_date", range.end);
    return query;
  });

  const invoices = await eachPage((from, to) => {
    let query = supabase
      .from("invoices")
      .select("invoice_number, invoice_date, total_amount, tax_amount, grand_total, paid_amount, balance_amount, status, notes, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("invoice_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("invoice_date", range.start).lte("invoice_date", range.end);
    return query;
  });

  const invoiceLines = await eachPage((from, to) => {
    let query = supabase
      .from("invoice_items")
      .select("description, quantity, unit_price, tax_rate, amount, created_at, invoices(invoice_number, invoice_date)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
      .range(from, to);
    const bounds = stampRange(range, "time");
    if (bounds) query = query.gte("created_at", bounds.start).lte("created_at", bounds.end);
    return query;
  });

  const payments = await eachPage((from, to) => {
    let query = supabase
      .from("payments")
      .select("payment_date, amount, payment_method, reference, notes, patients(full_name, patient_code), invoices(invoice_number)")
      .eq("clinic_id", clinicId)
      .order("payment_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("payment_date", range.start).lte("payment_date", range.end);
    return query;
  });

  const followUps = await eachPage((from, to) => {
    let query = supabase
      .from("follow_ups")
      .select("due_date, reason, status, notes, patients(full_name, patient_code, phone)")
      .eq("clinic_id", clinicId)
      .order("due_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("due_date", range.start).lte("due_date", range.end);
    return query;
  });

  const plans = await eachPage((from, to) => {
    let query = supabase
      .from("installment_plans")
      .select("start_date, number_of_installments, installment_amount, down_payment, status, invoices(invoice_number)")
      .eq("clinic_id", clinicId)
      .order("start_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("start_date", range.start).lte("start_date", range.end);
    return query;
  });

  const installments = await eachPage((from, to) => {
    let query = supabase
      .from("installments")
      .select("due_date, amount, paid_amount, status, paid_at")
      .eq("clinic_id", clinicId)
      .order("due_date", { ascending: true })
      .range(from, to);
    if (range) query = query.gte("due_date", range.start).lte("due_date", range.end);
    return query;
  });

  const allergies = await eachPage((from, to) => {
    let query = supabase
      .from("allergies")
      .select("substance, allergy_type, severity, reaction, notes, created_at, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
      .range(from, to);
    const bounds = stampRange(range, "time");
    if (bounds) query = query.gte("created_at", bounds.start).lte("created_at", bounds.end);
    return query;
  });

  const conditions = await eachPage((from, to) => {
    let query = supabase
      .from("medical_conditions")
      .select("condition, category, notes, created_at, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
      .range(from, to);
    const bounds = stampRange(range, "time");
    if (bounds) query = query.gte("created_at", bounds.start).lte("created_at", bounds.end);
    return query;
  });

  const medications = await eachPage((from, to) => {
    let query = supabase
      .from("medications")
      .select("medication, dosage, frequency, duration, notes, created_at, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
      .range(from, to);
    const bounds = stampRange(range, "time");
    if (bounds) query = query.gte("created_at", bounds.start).lte("created_at", bounds.end);
    return query;
  });

  const habits = await eachPage((from, to) => {
    let query = supabase
      .from("patient_habits")
      .select("habit, notes, created_at, patients(full_name, patient_code)")
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: true })
      .range(from, to);
    const bounds = stampRange(range, "time");
    if (bounds) query = query.gte("created_at", bounds.start).lte("created_at", bounds.end);
    return query;
  });

  const catalogue = await eachPage((from, to) =>
    supabase
      .from("treatment_catalogue")
      .select("name, default_cost, active, quick_entry")
      .eq("clinic_id", clinicId)
      .order("name", { ascending: true })
      .range(from, to),
  );

  const readme = [
    "VSP Software backup",
    `Scope: ${label}`,
    "Each CSV is one list. Open them in Excel.",
    "A month or between-months backup keeps records dated in that span. Patients are those added in the span.",
    "The treatment list is the current price list and is included every time.",
    `Patients: ${patients.length}`,
    `Appointments: ${appointments.length}`,
    `Visits: ${visits.length}`,
    `Treatments: ${treatments.length}`,
    `Invoices: ${invoices.length}`,
    `Payments: ${payments.length}`,
    `Follow-ups: ${followUps.length}`,
  ].join("\r\n");

  const files: Record<string, Uint8Array> = {
    "00-readme.txt": encode(readme),
    "01-patients.csv": encode(toCsv(
      ["Code", "Name", "Phone", "Email", "Date of birth", "Gender", "Address", "Emergency contact", "Type", "Status", "Added"],
      patients.map((row) => [row.patient_code, row.full_name, row.phone, row.email, row.date_of_birth, row.gender, row.address, row.emergency_contact, row.patient_type, row.status, row.created_at]),
    )),
    "02-appointments.csv": encode(toCsv(
      ["Date", "Time", "Patient", "Code", "Phone", "Status", "Flow", "Reason", "Notes"],
      appointments.map((row) => {
        const who = personName(row);
        return [row.appointment_date, row.start_time, who.name, who.code, who.phone, row.appointment_status, row.flow_status, row.reason, row.notes];
      }),
    )),
    "03-visits.csv": encode(toCsv(
      ["Date", "Patient", "Code", "Complaint", "Diagnosis", "Treatment", "Clinical notes", "Doctor notes"],
      visits.map((row) => {
        const who = personName(row);
        return [row.visit_date, who.name, who.code, row.chief_complaint, row.diagnosis, row.treatment_performed, row.clinical_notes, row.doctor_notes];
      }),
    )),
    "04-treatments.csv": encode(toCsv(
      ["Date", "Patient", "Code", "Treatment", "Tooth", "Cost", "Status", "Notes"],
      treatments.map((row) => {
        const who = personName(row);
        return [row.treatment_date, who.name, who.code, row.name, row.tooth_number, row.cost, row.status, row.notes];
      }),
    )),
    "05-invoices.csv": encode(toCsv(
      ["Invoice", "Date", "Patient", "Code", "Subtotal", "Tax", "Total", "Paid", "Balance", "Status", "Notes"],
      invoices.map((row) => {
        const who = personName(row);
        return [row.invoice_number, row.invoice_date, who.name, who.code, row.total_amount, row.tax_amount, row.grand_total, row.paid_amount, row.balance_amount, row.status, row.notes];
      }),
    )),
    "06-invoice-lines.csv": encode(toCsv(
      ["Invoice", "Invoice date", "Description", "Quantity", "Unit price", "Tax rate", "Amount"],
      invoiceLines.map((row) => {
        const bill = row.invoices;
        return [bill?.invoice_number, bill?.invoice_date, row.description, row.quantity, row.unit_price, row.tax_rate, row.amount];
      }),
    )),
    "07-payments.csv": encode(toCsv(
      ["Date", "Patient", "Code", "Invoice", "Amount", "Method", "Reference", "Notes"],
      payments.map((row) => {
        const who = personName(row);
        return [row.payment_date, who.name, who.code, row.invoices?.invoice_number, row.amount, row.payment_method, row.reference, row.notes];
      }),
    )),
    "08-follow-ups.csv": encode(toCsv(
      ["Due date", "Patient", "Code", "Phone", "Reason", "Status", "Notes"],
      followUps.map((row) => {
        const who = personName(row);
        return [row.due_date, who.name, who.code, who.phone, row.reason, row.status, row.notes];
      }),
    )),
    "09-installment-plans.csv": encode(toCsv(
      ["Invoice", "Start date", "Installments", "Each amount", "Down payment", "Status"],
      plans.map((row) => [row.invoices?.invoice_number, row.start_date, row.number_of_installments, row.installment_amount, row.down_payment, row.status]),
    )),
    "10-installments.csv": encode(toCsv(
      ["Due date", "Amount", "Paid", "Status", "Paid at"],
      installments.map((row) => [row.due_date, row.amount, row.paid_amount, row.status, row.paid_at]),
    )),
    "11-allergies.csv": encode(toCsv(
      ["Patient", "Code", "Substance", "Type", "Severity", "Reaction", "Notes", "Added"],
      allergies.map((row) => {
        const who = personName(row);
        return [who.name, who.code, row.substance, row.allergy_type, row.severity, row.reaction, row.notes, row.created_at];
      }),
    )),
    "12-conditions.csv": encode(toCsv(
      ["Patient", "Code", "Condition", "Category", "Notes", "Added"],
      conditions.map((row) => {
        const who = personName(row);
        return [who.name, who.code, row.condition, row.category, row.notes, row.created_at];
      }),
    )),
    "13-medications.csv": encode(toCsv(
      ["Patient", "Code", "Medication", "Dosage", "Frequency", "Duration", "Notes", "Added"],
      medications.map((row) => {
        const who = personName(row);
        return [who.name, who.code, row.medication, row.dosage, row.frequency, row.duration, row.notes, row.created_at];
      }),
    )),
    "14-habits.csv": encode(toCsv(
      ["Patient", "Code", "Habit", "Notes", "Added"],
      habits.map((row) => {
        const who = personName(row);
        return [who.name, who.code, row.habit, row.notes, row.created_at];
      }),
    )),
    "15-treatment-list.csv": encode(toCsv(
      ["Name", "Default cost", "Active", "Quick Entry"],
      catalogue.map((row) => [row.name, row.default_cost, row.active ? "Yes" : "No", row.quick_entry ? "Yes" : "No"]),
    )),
  };

  const zipped = zipSync(files, { level: 6 });
  const blob = new Blob([zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer], {
    type: "application/zip",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clinic-backup-${label}.zip`;
  link.click();
  URL.revokeObjectURL(url);
}

function encode(text: string): Uint8Array {
  return new TextEncoder().encode(`\uFEFF${text}`);
}
