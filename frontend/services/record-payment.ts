import { recordInvoicePaymentFn } from "@backend/controllers/payment-controller";
import type {
  CollectTargetInstallment,
  RecordInvoicePaymentResult,
} from "@backend/models/payment";
import { todayISO } from "@/lib/format";
import { unwrapApi } from "@/services/api-client";

export type { CollectTargetInstallment, RecordInvoicePaymentResult };

export type RecordInvoicePaymentInput = {
  clinicId: string;
  recordedBy: string;
  invoiceId: string;
  invoiceNumber: string;
  patientId: string;
  patientName: string;
  balanceAmount: number;
  amount: number;
  paymentMethod: string;
  reference?: string | null;
  notes?: string | null;
  targetInstallment?: CollectTargetInstallment | null;
};

export async function recordInvoicePayment(
  input: RecordInvoicePaymentInput,
): Promise<RecordInvoicePaymentResult> {
  return unwrapApi(
    await recordInvoicePaymentFn({
      data: {
        clinicId: input.clinicId,
        recordedBy: input.recordedBy,
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
        patientId: input.patientId,
        patientName: input.patientName,
        balanceAmount: input.balanceAmount,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        targetInstallment: input.targetInstallment ?? null,
        paymentDate: todayISO(),
      },
    }),
  );
}
