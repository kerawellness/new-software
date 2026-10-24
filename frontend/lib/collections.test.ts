import { describe, expect, it } from "vitest";

import { sumCollections } from "./collections";

describe("collection totals", () => {
  it("adds cash, UPI, card, and bank into one total", () => {
    const totals = sumCollections([
      { amount: 100, payment_method: "cash" },
      { amount: 50, payment_method: "upi" },
      { amount: 20, payment_method: "card" },
      { amount: 10, payment_method: "bank_transfer" },
    ]);
    expect(totals.total).toBe(180);
    expect(totals.cash).toBe(100);
    expect(totals.card).toBe(20);
    expect(totals.bank).toBe(10);
  });

  it("subtracts a reversed payment", () => {
    const totals = sumCollections([
      { amount: 100, payment_method: "cash" },
      { amount: -100, payment_method: "cash" },
    ]);
    expect(totals.total).toBe(0);
    expect(totals.cash).toBe(0);
  });
});
