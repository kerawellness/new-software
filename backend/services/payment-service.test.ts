import { beforeEach, describe, expect, it, vi } from "vitest";

const getProfileByUserId = vi.fn();
const getInvoiceForPayment = vi.fn();
const getInvoiceBalance = vi.fn();
const findInstallmentPlanByInvoice = vi.fn();
const insertPayment = vi.fn();

vi.mock("@backend/repositories/profile-repository.server", () => ({
  getProfileByUserId: (...args: unknown[]) => getProfileByUserId(...args),
}));

vi.mock("@backend/repositories/payment-repository.server", () => ({
  getInvoiceForPayment: (...args: unknown[]) => getInvoiceForPayment(...args),
  getInvoiceBalance: (...args: unknown[]) => getInvoiceBalance(...args),
  findInstallmentPlanByInvoice: (...args: unknown[]) => findInstallmentPlanByInvoice(...args),
  insertPayment: (...args: unknown[]) => insertPayment(...args),
}));

vi.mock("@backend/repositories/audit-repository.server", () => ({
  insertAuditLog: vi.fn(async () => ({ error: null })),
}));

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

describe("recordInvoicePayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getProfileByUserId.mockResolvedValue({ clinic_id: clinicId });
    getInvoiceForPayment.mockResolvedValue({
      id: invoiceId,
      clinic_id: clinicId,
      patient_id: patientId,
      invoice_number: "INV-0001",
    });
    findInstallmentPlanByInvoice.mockResolvedValue(null);
  });

  it("refuses a payment above the database balance even if the client sends a smaller balance", async () => {
    getInvoiceBalance.mockResolvedValue(100);
    const { recordInvoicePayment } = await import("@backend/services/payment-service.server");

    await expect(recordInvoicePayment({} as never, userId, command)).rejects.toThrow(
      "Payment cannot exceed balance due.",
    );
    expect(insertPayment).not.toHaveBeenCalled();
  });

  it("refuses an invoice that belongs to another clinic", async () => {
    getInvoiceForPayment.mockResolvedValue({
      id: invoiceId,
      clinic_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      patient_id: patientId,
      invoice_number: "INV-0001",
    });
    const { recordInvoicePayment } = await import("@backend/services/payment-service.server");

    await expect(
      recordInvoicePayment({} as never, userId, { ...command, amount: 10 }),
    ).rejects.toThrow("Invoice not found.");
    expect(getInvoiceBalance).not.toHaveBeenCalled();
  });
});
