import { describe, expect, it } from "vitest";

import { invoiceTotals, paise, splitMoney } from "./money";

describe("paise rounding", () => {
  it("matches a 18% tax on 10.03", () => {
    const bill = invoiceTotals([{ quantity: 1, unit_price: 10.03 }], 18);
    expect(bill.subtotal).toBe(10.03);
    expect(bill.tax).toBe(1.81);
    expect(bill.grand).toBe(11.84);
  });

  it("puts the leftover paise on the last installment", () => {
    expect(splitMoney(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(splitMoney(100, 3).reduce((sum, part) => paise(sum + part), 0)).toBe(100);
  });
});
