import { describe, expect, it } from "vitest";

import { replacePatientMedicalProfileSchema } from "@backend/validators/medical-profile-validators";

const patientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("replacePatientMedicalProfileSchema", () => {
  it("accepts a profile with one named allergy", () => {
    const parsed = replacePatientMedicalProfileSchema.parse({
      patientId,
      conditions: [],
      allergies: [{ substance: "Penicillin" }],
      medications: [],
      habits: [],
    });
    expect(parsed.allergies[0]?.substance).toBe("Penicillin");
  });

  it("rejects a blank allergy substance", () => {
    expect(() =>
      replacePatientMedicalProfileSchema.parse({
        patientId,
        conditions: [],
        allergies: [{ substance: "   " }],
        medications: [],
        habits: [],
      }),
    ).toThrow();
  });
});
