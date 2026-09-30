import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

const clinicId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const invoiceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const patientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const command = {
  clinicId,
  recordedBy: userId,
  invoiceId,
  invoiceNumber: "INV-0001",
  patientId,
  patientName: "Ada",
  balanceAmount: 1,
  amount: 500,
  paymentMethod: "cash",
  paymentDate: "2026-09-23",
};

const saved = {
  invoiceId,
  invoiceNumber: "INV-0001",
  patientId,
  patientName: "Ada",
  remaining: 0,
  nextDueDate: null,
  clinicId,
};

describe("recordInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-positive amount before calling the database", async () => {
    const { recordInvoicePayment } = await import("@backend/services/payment-service.server");

    await expect(
      recordInvoicePayment({ rpc } as never, userId, { ...command, amount: 0 }),
    ).rejects.toThrow("Enter a valid payment amount.");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("records the payment with one database call", async () => {
    rpc.mockResolvedValue({ data: saved, error: null });
    const { recordInvoicePayment } = await import("@backend/services/payment-service.server");

    const result = await recordInvoicePayment({ rpc } as never, userId, { ...command, amount: 10 });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("record_invoice_payment");
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      _invoice_id: invoiceId,
      _patient_id: patientId,
      _amount: 10,
    });
    expect(result.remaining).toBe(0);
  });

  it("returns the database refusal when the payment is over the balance", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Payment cannot exceed balance due." },
    });
    const { recordInvoicePayment } = await import("@backend/services/payment-service.server");

    await expect(
      recordInvoicePayment({ rpc } as never, userId, { ...command, amount: 10 }),
    ).rejects.toThrow("Payment cannot exceed balance due.");
  });
});
