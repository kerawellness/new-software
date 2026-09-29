import { describe, expect, it } from "vitest";

import { isMissedAppointment } from "./mark-missed-appointments";

const today = "2026-09-27";

describe("isMissedAppointment", () => {
  it("marks a past visit that was never arrived, rescheduled, or cancelled", () => {
    expect(
      isMissedAppointment({
        appointmentDate: "2026-09-26",
        appointmentStatus: "scheduled",
        flowStatus: "schedule",
        arrivedAt: null,
        today,
      }),
    ).toBe(true);
    expect(
      isMissedAppointment({
        appointmentDate: "2026-09-26",
        appointmentStatus: "confirmed",
        flowStatus: "schedule",
        arrivedAt: null,
        today,
      }),
    ).toBe(true);
  });

  it("leaves today, arrived, rescheduled-forward, and cancelled visits alone", () => {
    expect(
      isMissedAppointment({
        appointmentDate: today,
        appointmentStatus: "scheduled",
        flowStatus: "schedule",
        arrivedAt: null,
        today,
      }),
    ).toBe(false);
    expect(
      isMissedAppointment({
        appointmentDate: "2026-09-26",
        appointmentStatus: "scheduled",
        flowStatus: "waiting",
        arrivedAt: "2026-09-26T09:00:00.000Z",
        today,
      }),
    ).toBe(false);
    expect(
      isMissedAppointment({
        appointmentDate: "2026-09-28",
        appointmentStatus: "scheduled",
        flowStatus: "schedule",
        arrivedAt: null,
        today,
      }),
    ).toBe(false);
    expect(
      isMissedAppointment({
        appointmentDate: "2026-09-26",
        appointmentStatus: "cancelled",
        flowStatus: "schedule",
        arrivedAt: null,
        today,
      }),
    ).toBe(false);
    expect(
      isMissedAppointment({
        appointmentDate: "2026-09-26",
        appointmentStatus: "no_show",
        flowStatus: "schedule",
        arrivedAt: null,
        today,
      }),
    ).toBe(false);
  });
});
