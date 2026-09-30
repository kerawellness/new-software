import { z } from "zod";

import { throwDb } from "@backend/db";
import type { RecordInvoicePaymentResult } from "@backend/models/payment";
import type { ClinicDb } from "@backend/types";
import type { RecordInvoicePaymentCommand } from "@backend/validators/payment-validators";

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const paymentResultSchema = z.object({
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  patientId: z.string().uuid(),
  patientName: z.string(),
  remaining: z.coerce.number(),
  nextDueDate: z.string().nullable(),
  clinicId: z.string().uuid(),
});

export async function recordInvoicePayment(
  db: ClinicDb,
  userId: string,
  input: RecordInvoicePaymentCommand,
): Promise<RecordInvoicePaymentResult> {
  if (!userId) throw new Error("Clinic session not active.");

  const amt = Number(input.amount);
  if (Number.isNaN(amt) || amt <= 0) throw new Error("Enter a valid payment amount.");

  const fromQuickEntry = (input.notes ?? "").includes("Recorded via Quick Entry Flow");
  const { data, error } = await (db.rpc as unknown as UntypedRpc)("record_invoice_payment", {
    _invoice_id: input.invoiceId,
    _patient_id: input.patientId,
    _amount: amt,
    _payment_method: input.paymentMethod,
    _payment_date: input.paymentDate,
    _reference: input.reference ?? null,
    _notes: input.notes ?? null,
    _target_installment: input.targetInstallment ?? null,
    _skip_audit: fromQuickEntry,
  });
  throwDb(error);
  return paymentResultSchema.parse(data);
}
