import { throwDb } from "@backend/db";
import type { InstallmentPlanRecord, InstallmentRecord } from "@backend/models/payment";
import type { ClinicDb } from "@backend/types";

export async function findInstallmentPlanByInvoice(
  db: ClinicDb,
  invoiceId: string,
): Promise<InstallmentPlanRecord | null> {
  const { data } = await db
    .from("installment_plans")
    .select("*, installments(*)")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  return (data as InstallmentPlanRecord | null) ?? null;
}

export async function insertPayment(
  db: ClinicDb,
  row: {
    clinic_id: string;
    patient_id: string;
    invoice_id: string;
    amount: number;
    payment_method: string;
    payment_date: string;
    reference: string | null;
    notes: string | null;
    recorded_by: string;
  },
): Promise<void> {
  const { error } = await db.from("payments").insert({
    clinic_id: row.clinic_id,
    patient_id: row.patient_id,
    invoice_id: row.invoice_id,
    amount: row.amount,
    payment_method: row.payment_method as never,
    payment_date: row.payment_date,
    reference: row.reference,
    notes: row.notes,
    recorded_by: row.recorded_by,
  });
  throwDb(error);
}

export async function updateInstallment(
  db: ClinicDb,
  id: string,
  patch: {
    paid_amount?: number;
    status?: string;
    paid_at?: string | null;
    amount?: number;
  },
): Promise<void> {
  const { error } = await db
    .from("installments")
    .update(patch as never)
    .eq("id", id);
  throwDb(error);
}

export async function listInstallments(
  db: ClinicDb,
  planId: string,
): Promise<Array<Pick<InstallmentRecord, "id" | "status" | "due_date" | "paid_amount">>> {
  const { data } = await db
    .from("installments")
    .select("id, status, due_date, paid_amount")
    .eq("installment_plan_id", planId);
  return (data ?? []) as Array<
    Pick<InstallmentRecord, "id" | "status" | "due_date" | "paid_amount">
  >;
}

export type InvoiceForPayment = {
  id: string;
  clinic_id: string;
  patient_id: string;
  invoice_number: string;
};

export async function getInvoiceForPayment(
  db: ClinicDb,
  invoiceId: string,
): Promise<InvoiceForPayment> {
  const { data, error } = await db
    .from("invoices")
    .select("id, clinic_id, patient_id, invoice_number")
    .eq("id", invoiceId)
    .single();
  throwDb(error);
  if (!data?.clinic_id || !data.patient_id || !data.invoice_number) {
    throw new Error("Invoice not found.");
  }
  return data as InvoiceForPayment;
}

export async function getInvoiceBalance(db: ClinicDb, invoiceId: string): Promise<number> {
  const { data, error } = await db
    .from("invoices")
    .select("balance_amount")
    .eq("id", invoiceId)
    .single();
  throwDb(error);
  if (data?.balance_amount == null) {
    throw new Error("Invoice balance could not be loaded.");
  }
  return Math.max(0, Number(data.balance_amount));
}

export async function markRemainingInstallmentsPaid(
  db: ClinicDb,
  planId: string,
  paidAt: string,
): Promise<void> {
  const { error } = await db
    .from("installments")
    .update({ status: "paid", paid_at: paidAt })
    .eq("installment_plan_id", planId)
    .neq("status", "paid");
  throwDb(error);
}

export async function completeInstallmentPlan(db: ClinicDb, planId: string): Promise<void> {
  const { error } = await db.from("installment_plans").update({ status: "completed" }).eq("id", planId);
  throwDb(error);
}

export async function getNextUnpaidDueDate(db: ClinicDb, planId: string): Promise<string | null> {
  const { data } = await db
    .from("installments")
    .select("due_date")
    .eq("installment_plan_id", planId)
    .neq("status", "paid")
    .order("due_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.due_date ?? null;
}
