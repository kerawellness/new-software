import { z } from "zod";

import { throwDb } from "@backend/db";
import type { ClinicDb } from "@backend/types";
import type { CreateInvoiceInput, CreatedInvoice } from "@backend/validators/invoice-validators";

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function insertInvoiceWithItems(
  db: ClinicDb,
  value: CreateInvoiceInput,
): Promise<CreatedInvoice> {
  const { data, error } = await (db.rpc as unknown as UntypedRpc)("create_invoice_with_items", {
    _invoice_date: value.invoiceDate,
    _notes: value.notes || null,
    _patient_id: value.patientId,
    _items: value.items,
  });
  throwDb(error);
  return z.object({ id: z.string().uuid(), invoice_number: z.string().min(1) }).parse(data);
}
