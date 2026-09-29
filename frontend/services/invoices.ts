import { createInvoiceFn } from "@backend/controllers/invoice-controller";
import {
  createInvoiceSchema,
  type CreateInvoiceInput,
  type CreatedInvoice,
} from "@backend/validators/invoice-validators";
import { unwrapApi } from "@/services/api-client";

export { createInvoiceSchema, type CreateInvoiceInput, type CreatedInvoice };

export async function createInvoiceWithItems(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  const value = createInvoiceSchema.parse(input);
  return unwrapApi(await createInvoiceFn({ data: value }));
}
