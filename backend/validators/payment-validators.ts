import { z } from "zod";

export const collectTargetInstallmentSchema = z.object({
  id: z.string().uuid(),
  amount: z.number(),
  paid_amount: z.number(),
  planId: z.string().uuid(),
  totalCount: z.number(),
  index: z.number(),
});

export const recordInvoicePaymentSchema = z.object({
  clinicId: z.string().uuid(),
  recordedBy: z.string().uuid(),
  invoiceId: z.string().uuid(),
  invoiceNumber: z.string().min(1),
  patientId: z.string().uuid(),
  patientName: z.string().min(1),
  balanceAmount: z.number(),
  amount: z.number(),
  paymentMethod: z.string().min(1),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  targetInstallment: collectTargetInstallmentSchema.nullable().optional(),
  paymentDate: z.string().min(8),
});

export type RecordInvoicePaymentCommand = z.infer<typeof recordInvoicePaymentSchema>;
