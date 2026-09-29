import { z } from "zod";

const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Each invoice item needs a description.").max(300),
  quantity: z.number().finite().positive().max(10_000),
  unit_price: z.number().finite().nonnegative().max(100_000_000),
});

export const createInvoiceSchema = z.object({
  invoiceDate: z.string().date("Invoice date is invalid."),
  notes: z.string().trim().max(2000).nullable(),
  patientId: z.string().uuid("Patient is invalid."),
  items: z.array(invoiceItemSchema).min(1, "Add at least one invoice item.").max(100),
});

export type CreateInvoiceInput = z.input<typeof createInvoiceSchema>;
export type CreatedInvoice = { id: string; invoice_number: string };
