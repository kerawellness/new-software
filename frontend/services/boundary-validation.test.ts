import { describe, expect, it } from "vitest";

import { friendlyError } from "@/lib/audit";
import { createInvoiceSchema } from "@/services/invoices";

describe("critical boundary validation", () => {
  it("rejects unsafe invoice items before the RPC boundary", () => {
    expect(() =>
      createInvoiceSchema.parse({
        invoiceDate: "2026-08-24",
        notes: null,
        patientId: "11111111-1111-4111-8111-111111111111",
        items: [{ description: "", quantity: 0, unit_price: -1 }],
      }),
    ).toThrow();
  });

  it("does not expose unknown backend error messages", () => {
    expect(
      friendlyError(new Error("relation internal_table does not exist"), "Unable to save."),
    ).toBe("Unable to save.");
  });
});
