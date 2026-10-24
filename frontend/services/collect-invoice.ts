import { supabase } from "@/integrations/supabase/client";

type RpcError = { message: string; code?: string };
type Rpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcError | null }>;

export type CollectedInvoice = {
  id: string;
  invoice_number: string;
  grand_total: number;
  balance_amount: number;
};

function rpcMissing(error: RpcError | null): boolean {
  if (!error) return false;
  return error.code === "PGRST202" || /could not find the function|schema cache/i.test(error.message);
}

const callRpc = supabase.rpc as unknown as Rpc;

export async function collectNewInvoice(input: {
  invoiceDate: string;
  notes: string | null;
  patientId: string;
  items: Array<{ description: string; quantity: number; unit_price: number }>;
  paymentAmount: number;
  paymentMethod: string;
  paymentDate: string;
  installmentCount: number;
  installmentStart: string;
}): Promise<CollectedInvoice | null> {
  const { data, error } = await callRpc("collect_new_invoice", {
    _invoice_date: input.invoiceDate,
    _notes: input.notes,
    _patient_id: input.patientId,
    _items: input.items,
    _payment_amount: input.paymentAmount,
    _payment_method: input.paymentMethod,
    _payment_date: input.paymentDate,
    _installment_count: input.installmentCount,
    _installment_start: input.installmentStart,
  });
  if (rpcMissing(error)) return null;
  if (error) throw new Error(error.message);
  const row = data as CollectedInvoice | null;
  if (!row?.id || !row.invoice_number) throw new Error("Invoice was not saved.");
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    grand_total: Number(row.grand_total),
    balance_amount: Number(row.balance_amount),
  };
}

export async function reversePayment(paymentId: string): Promise<void> {
  const { error } = await callRpc("reverse_payment", { _payment_id: paymentId });
  if (rpcMissing(error)) {
    throw new Error("Please run 10-collect-invoice.sql in Supabase, then try the reversal again.");
  }
  if (error) throw new Error(error.message);
}
