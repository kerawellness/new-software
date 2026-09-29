import { describe, expect, it } from "vitest";

import {
  ALLERGY_OPTIONS,
  canTransition,
  CURRENCIES,
  FLOW_ACTION_LABEL,
  FLOW_LABELS,
  FLOW_NEXT,
  FLOW_STATES,
  HABIT_OPTIONS,
  MEDICAL_HISTORY,
  MEDICATION_OPTIONS,
  ROLES,
  TREATMENT_CATEGORIES,
} from "./constants";

describe("Workflow & Clinical Constants (src/lib/constants.ts)", () => {
  it("should define valid flow state transitions", () => {
    expect(FLOW_NEXT["schedule"]).toBe("waiting");
    expect(FLOW_NEXT["waiting"]).toBe("engage");
    expect(FLOW_NEXT["engage"]).toBe("done");
    expect(FLOW_NEXT["done"]).toBeNull();
  });

  it("should validate transition guards via canTransition", () => {
    expect(canTransition("schedule", "waiting")).toBe(true);
    expect(canTransition("waiting", "engage")).toBe(true);
    expect(canTransition("engage", "done")).toBe(true);

    // Invalid transitions
    expect(canTransition("schedule", "done")).toBe(false);
    expect(canTransition("waiting", "schedule")).toBe(false);
    expect(canTransition("done", "engage")).toBe(false);
  });

  it("should provide human-readable labels for all flow states", () => {
    FLOW_STATES.forEach((state) => {
      expect(FLOW_LABELS[state]).toBeDefined();
      expect(FLOW_ACTION_LABEL[state]).toBeDefined();
    });
    expect(FLOW_LABELS.schedule).toBe("Expected");
    expect(FLOW_LABELS.engage).toBe("In Chair");
    expect(FLOW_ACTION_LABEL.waiting).toBe("In chair");
    expect(FLOW_ACTION_LABEL.schedule).toBe("Arrived");
    expect(FLOW_ACTION_LABEL.engage).toBe("Done");
  });

  it("should contain standard clinical options", () => {
    expect(Object.keys(MEDICAL_HISTORY).length).toBeGreaterThan(0);
    expect(ALLERGY_OPTIONS.length).toBeGreaterThan(0);
    expect(MEDICATION_OPTIONS.length).toBeGreaterThan(0);
    expect(HABIT_OPTIONS.length).toBeGreaterThan(0);
    expect(ROLES).toContain("dentist");
    expect(CURRENCIES.some((c) => c.value === "INR")).toBe(true);
    expect(TREATMENT_CATEGORIES).toContain("general");
  });
});
