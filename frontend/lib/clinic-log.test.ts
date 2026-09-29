import { describe, expect, it } from "vitest";

import { collapseQuickEntryPayments, describeClinicLog } from "./clinic-log";

describe("describeClinicLog", () => {
  it("turns stored actions into plain sentences", () => {
    expect(describeClinicLog("payment_recorded", { amount: 500, method: "upi", invoice_number: "INV-12" })).toEqual({
      title: "Payment taken",
      detail: "₹500.00 · UPI · INV-12",
      area: "Billing",
    });
    expect(
      describeClinicLog("appointment_rescheduled", {
        patient: "Ashwin",
        from_date: "2026-09-26",
        from_time: "09:00",
        to_date: "2026-09-28",
        to_time: "10:30",
      }).title,
    ).toBe("Appointment moved");
    expect(describeClinicLog("quick_entry_express", { full_name: "Ashwin", treatment: "Scaling", paid: 0 }).detail).toBe(
      "Ashwin · Scaling",
    );
    expect(describeClinicLog("followup_created", { patient: "Ashwin", reason: "Balance due", due_date: "2026-10-26" }).detail).toContain(
      "Ashwin",
    );
    expect(describeClinicLog("appointment_cancelled", null).title).toBe("Appointment cancelled");
    expect(
      describeClinicLog("quick_entry_express", {
        full_name: "one",
        treatment: "a",
        paid: 11,
        method: "cash",
        invoice_number: "INV-0016",
      }).detail,
    ).toBe("one · a · Paid ₹11.00 · Cash · INV-0016");
  });

  it("folds the Quick Entry payment into the one Quick Entry row", () => {
    const rows = collapseQuickEntryPayments([
      {
        id: "qe",
        action: "quick_entry_express",
        created_at: "2026-09-27T13:41:00.000Z",
        userId: "u1",
        userName: "testm",
        metadata: { full_name: "one", treatment: "a", paid: 11 },
      },
      {
        id: "pay",
        action: "payment_recorded",
        created_at: "2026-09-27T13:41:02.000Z",
        userId: "u1",
        userName: "testm",
        metadata: { amount: 11, method: "cash", invoice_number: "INV-0016" },
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["qe"]);
    expect(describeClinicLog(rows[0]!.action, rows[0]!.metadata).detail).toBe(
      "one · a · Paid ₹11.00 · Cash · INV-0016",
    );
  });
});
