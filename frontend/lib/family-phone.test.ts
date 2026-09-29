import { describe, expect, it } from "vitest";

import { familyPhoneLabel, nextSharedPhone, splitFamilyPhone } from "@/lib/family-phone";

describe("family phone", () => {
  it("splits a bare mobile and a +N family line", () => {
    expect(splitFamilyPhone("9876543210")).toEqual({ base: "9876543210", suffix: 0 });
    expect(splitFamilyPhone("9876543210+2")).toEqual({ base: "9876543210", suffix: 2 });
  });

  it("assigns the next free suffix for the same base", () => {
    expect(nextSharedPhone("9876543210", ["9876543210", "9876543210+1"])).toBe("9876543210+2");
  });

  it("labels only suffixed numbers", () => {
    expect(familyPhoneLabel("9876543210")).toBeNull();
    expect(familyPhoneLabel("9876543210+1")).toBe("Family line +1 (9876543210+1)");
  });
});
