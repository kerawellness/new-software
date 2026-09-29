import { describe, expect, it } from "vitest";

import {
  catalogueOptionLabel,
  formatCurrency,
  formatDate,
  formatTime,
  initials,
  isPatientPhone,
  normalizePhone,
  patientPhoneDigits,
  todayISO,
  visitHasTreatment,
  visitKindCounts,
  whatsappLink,
} from "./format";

describe("Formatting Utilities (src/lib/format.ts)", () => {
  it("should format currencies correctly", () => {
    expect(formatCurrency(5000, "INR")).toBe("₹5,000.00");
    expect(formatCurrency(150, "USD")).toBe("$150.00");
    expect(formatCurrency(0, "INR")).toBe("₹0.00");
  });

  it("disambiguates catalogue options with the same name", () => {
    const catalogue = [
      { id: "aaaa1111-0000", name: "Scaling", default_cost: 500 },
      { id: "bbbb2222-0000", name: "Scaling", default_cost: 1500 },
      { id: "cccc3333-0000", name: "Extraction", default_cost: 800 },
    ];
    expect(catalogueOptionLabel(catalogue[0]!, "INR", catalogue)).toBe(
      "Scaling · ₹500.00",
    );
    expect(catalogueOptionLabel(catalogue[1]!, "INR", catalogue)).toBe(
      "Scaling · ₹1,500.00",
    );
    expect(catalogueOptionLabel(catalogue[2]!, "INR", catalogue)).toBe(
      "Extraction (₹800.00)",
    );
  });

  it("should normalize phone numbers cleanly", () => {
    expect(normalizePhone("9876543210")).toBe("9876543210");
    expect(normalizePhone("+91 98765 43210")).toBe("+919876543210");
    expect(normalizePhone(" 987-654-3210 ")).toBe("9876543210");
  });

  it("keeps patient phone input to exactly 10 digits", () => {
    expect(patientPhoneDigits("9876543210")).toBe("9876543210");
    expect(patientPhoneDigits("+91 98765 43210")).toBe("9876543210");
    expect(patientPhoneDigits("9876543210+1")).toBe("9876543210");
    expect(patientPhoneDigits("98765432101")).toBe("9876543210");
    expect(patientPhoneDigits("98765")).toBe("98765");
    expect(isPatientPhone("9876543210")).toBe(true);
    expect(isPatientPhone("+91 98765 43210")).toBe(true);
    expect(isPatientPhone("98765")).toBe(false);
  });

  it("should generate WhatsApp links with encoded message text", () => {
    const link = whatsappLink("9876543210", "Hello Ramesh!");
    expect(link).toBe("https://wa.me/9876543210?text=Hello%20Ramesh!");
  });

  it("should format dates and times reliably", () => {
    expect(formatDate("2026-08-11")).toBe("11 Aug 2026");
    expect(formatTime("14:30")).toBe("2:30 PM");
    expect(formatTime("09:00")).toBe("9:00 AM");
  });

  it("should extract user initials accurately", () => {
    expect(initials("Ramesh Kumar")).toBe("RK");
    expect(initials("Ananya")).toBe("A");
    expect(initials(null)).toBe("?");
  });

  it("should generate ISO date for today", () => {
    const today = todayISO();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("classifies consultation vs treatment visits", () => {
    expect(visitHasTreatment({ treatments: [], treatment_performed: null })).toBe(false);
    expect(visitHasTreatment({ treatments: [{}], treatment_performed: null })).toBe(true);
    expect(visitHasTreatment({ treatments: [], treatment_performed: "RCT" })).toBe(true);
    expect(
      visitHasTreatment({
        treatments: [{ name: "Consultation" }],
        treatment_performed: "Consultation",
      }),
    ).toBe(false);
    expect(
      visitHasTreatment({
        treatments: [{ name: "Consultation" }, { name: "Scaling" }],
        treatment_performed: "Consultation, Scaling",
      }),
    ).toBe(true);
    expect(
      visitKindCounts([
        { patient_id: "a", treatments: [], treatment_performed: null },
        { patient_id: "a", treatments: [{}], treatment_performed: null },
        { patient_id: "b", treatments: [], treatment_performed: "Scaling" },
      ]),
    ).toEqual({ consultation: 1, treatment: 2, visitedPatients: 2 });
  });
});
