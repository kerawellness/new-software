import type { CreatedInvoice } from "@backend/validators/invoice-validators";
import type { CreateInvoiceInput } from "@backend/validators/invoice-validators";
import type { ClinicDb } from "@backend/types";
import * as invoiceRepository from "@backend/repositories/invoice-repository.server";

export async function createInvoice(
  db: ClinicDb,
  input: CreateInvoiceInput,
): Promise<CreatedInvoice> {
  return invoiceRepository.insertInvoiceWithItems(db, input);
}
