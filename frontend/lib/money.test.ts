import { describe, expect, it } from "vitest";

import { invoiceTotals, paise, rupee, splitMoney } from "./money";

describe("paise rounding", () => {
  it("matches a 18% tax on 10.03 and rounds the total to a rupee", () => {
    const bill = invoiceTotals([{ quantity: 1, unit_price: 10.03 }], 18);
    expect(bill.subtotal).toBe(10.03);
    expect(bill.tax).toBe(1.81);
    expect(bill.grand).toBe(12);
  });

  it("rounds 11.55 up to 12 and 11.49 down to 11", () => {
    expect(rupee(11.55)).toBe(12);
    expect(rupee(11.49)).toBe(11);
    expect(invoiceTotals([{ quantity: 1, unit_price: 11.55 }], 0).grand).toBe(12);
  });

  it("puts the leftover paise on the last installment", () => {
    expect(splitMoney(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitMoney(100, 3).reduce((sum, part) => paise(sum + part), 0)).toBe(100);
  });
});
