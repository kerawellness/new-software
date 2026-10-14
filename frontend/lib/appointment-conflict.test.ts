import { describe, expect, it } from "vitest";

import { findSameTimeConflict, sameTimeWarning } from "./appointment-conflict";

const rows = [
  {
    id: "a1",
    appointment_date: "2026-10-14",
    start_time: "09:00:00",
    appointment_status: "scheduled",
    notes: "Doctor: Dr. A Kumar",
    patientName: "Meena",
  },
  {
    id: "a2",
    appointment_date: "2026-10-14",
    start_time: "10:00:00",
    appointment_status: "cancelled",
    patientName: "Ravi",
  },
];

describe("same-time appointments", () => {
  it("warns when the same time has no different doctor", () => {
    const hit = findSameTimeConflict(rows, {
      date: "2026-10-14",
      time: "09:00",
      doctorLabel: "Dr. A Kumar",
    });
    expect(hit?.id).toBe("a1");
    expect(sameTimeWarning(hit?.patientName, "09:00")).toContain("Meena");
  });

  it("allows a different doctor at the same time", () => {
    expect(
      findSameTimeConflict(rows, {
        date: "2026-10-14",
        time: "09:00",
        doctorLabel: "Dr. B Nair",
      }),
    ).toBeNull();
  });

  it("ignores cancelled rows and the appointment being moved", () => {
    expect(
      findSameTimeConflict(rows, { id: "a1", date: "2026-10-14", time: "09:00" }),
    ).toBeNull();
    expect(findSameTimeConflict(rows, { date: "2026-10-14", time: "10:00" })).toBeNull();
  });
});
