import { supabase } from "@/integrations/supabase/client";
import { applyDateColumnFilter, type DateScope } from "@/lib/date-scope";
import { paise } from "@/lib/money";

export type PaymentAmount = {
  amount: number | string | null;
  payment_method: string;
};

export type CollectionTotals = {
  cash: number;
  upi: number;
  card: number;
  bank: number;
  other: number;
  total: number;
  count: number;
};

export function emptyCollections(): CollectionTotals {
  return { cash: 0, upi: 0, card: 0, bank: 0, other: 0, total: 0, count: 0 };
}

export function addCollection(totals: CollectionTotals, payment: PaymentAmount): CollectionTotals {
  const amount = paise(Number(payment.amount) || 0);
  const next: CollectionTotals = {
    ...totals,
    count: totals.count + 1,
    total: paise(totals.total + amount),
  };
  if (payment.payment_method === "cash") next.cash = paise(next.cash + amount);
  else if (payment.payment_method === "upi") next.upi = paise(next.upi + amount);
  else if (payment.payment_method === "card") next.card = paise(next.card + amount);
  else if (payment.payment_method === "bank_transfer") next.bank = paise(next.bank + amount);
  else next.other = paise(next.other + amount);
  return next;
}

export function sumCollections(rows: PaymentAmount[]): CollectionTotals {
  return rows.reduce(addCollection, emptyCollections());
}

/** Every payment in the date range. A reversal (negative amount) reduces the total. */
export async function loadPaymentsForScope(clinicId: string, scope: DateScope): Promise<PaymentAmount[]> {
  const pageSize = 1000;
  const all: PaymentAmount[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("payments")
      .select("id, amount, payment_method, payment_date")
      .eq("clinic_id", clinicId);
    query = applyDateColumnFilter(query, "payment_date", scope);
    const { data, error } = await query
      .order("payment_date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    all.push(...chunk);
    if (chunk.length < pageSize) return all;
  }
}
