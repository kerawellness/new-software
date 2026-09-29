import { describe, expect, it } from "vitest";

import { clinicDoctorNames, composeClinicAddress, parseClinicBillExtras } from "./clinic-identity";

describe("clinic bill extras on address", () => {
  it("round-trips GSTIN and UPI without changing the street line", () => {
    const composed = composeClinicAddress("12 MG Road, Chennai", "29ABCDE1234F1Z5", "clinic@oksbi");
    expect(composed).toBe("12 MG Road, Chennai\nGSTIN: 29ABCDE1234F1Z5\nUPI: clinic@oksbi");
    expect(parseClinicBillExtras(composed)).toEqual({
      address: "12 MG Road, Chennai",
      gstin: "29ABCDE1234F1Z5",
      upi: "clinic@oksbi",
      doctor1: "",
      doctor2: "",
    });
  });

  it("round-trips up to two doctor names", () => {
    const composed = composeClinicAddress(
      "12 MG Road, Chennai",
      "",
      "",
      "Dr. A Kumar",
      "Dr. B Nair",
    );
    expect(parseClinicBillExtras(composed)).toEqual({
      address: "12 MG Road, Chennai",
      gstin: "",
      upi: "",
      doctor1: "Dr. A Kumar",
      doctor2: "Dr. B Nair",
    });
  });

  it("lists saved doctor names for attending doctor", () => {
    const composed = composeClinicAddress("12 MG Road", "", "", "Dr. A Kumar", "");
    expect(clinicDoctorNames(composed)).toEqual(["Dr. A Kumar"]);
  });

  it("leaves a plain address unchanged", () => {
    expect(parseClinicBillExtras("12 MG Road")).toEqual({
      address: "12 MG Road",
      gstin: "",
      upi: "",
      doctor1: "",
      doctor2: "",
    });
  });
});
