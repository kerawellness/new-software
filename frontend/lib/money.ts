/** Round to paise the same way as Postgres round(numeric, 2): half away from zero. */
export function paise(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Math.abs(value) * 100 + 1e-8)) / 100;
}

export function lineAmount(quantity: number, unitPrice: number): number {
  return paise(quantity * unitPrice);
}

export function invoiceTotals(
  lines: Array<{ quantity: number; unit_price: number }>,
  taxRate: number,
): { subtotal: number; tax: number; grand: number } {
  const subtotal = paise(lines.reduce((sum, line) => sum + lineAmount(line.quantity, line.unit_price), 0));
  const tax = taxRate > 0 ? paise((subtotal * taxRate) / 100) : 0;
  return { subtotal, tax, grand: paise(subtotal + tax) };
}

/** Equal shares in paise. The last share absorbs the remainder so the parts sum to total. */
export function splitMoney(total: number, count: number): number[] {
  const n = Math.max(1, Math.floor(count));
  const share = paise(total / n);
  const amounts = Array.from({ length: n }, () => share);
  amounts[n - 1] = paise(total - share * (n - 1));
  return amounts;
}
