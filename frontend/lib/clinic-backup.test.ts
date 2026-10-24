import { describe, expect, it } from "vitest";

import { backupBetweenRange, backupMonthRange, lockBackup, toCsv, unlockBackup } from "./clinic-backup";

describe("clinic backup CSV", () => {
  it("covers every day of the chosen month", () => {
    expect(backupMonthRange("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    expect(backupMonthRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(backupMonthRange("2025-02")).toEqual({ start: "2025-02-01", end: "2025-02-28" });
  });

  it("covers every day from the start month through the end month", () => {
    expect(backupBetweenRange("2026-01", "2026-03")).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(backupBetweenRange("2026-03", "2026-01")).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(backupBetweenRange("2024-01", "2024-02")).toEqual({ start: "2024-01-01", end: "2024-02-29" });
  });

  it("locks a backup so the wrong password cannot read it", async () => {
    const zip = new TextEncoder().encode("patients,phone\r\nAsha,9000000000");
    const locked = await lockBackup(zip, "clinic-pass");
    expect(new TextDecoder().decode(locked.slice(0, 4))).toBe("VSP1");
    expect(new TextDecoder().decode(await unlockBackup(locked, "clinic-pass"))).toBe(
      "patients,phone\r\nAsha,9000000000",
    );
    await expect(unlockBackup(locked, "wrong-pass")).rejects.toThrow("That password does not open this backup.");
  });

  it("quotes cells that contain commas, quotes, or line breaks", () => {
    expect(toCsv(["Name", "Notes"], [["Ashwin", "ok"], ["A, B", 'say "hi"'], [null, "line\n2"]])).toBe(
      'Name,Notes\r\nAshwin,ok\r\n"A, B","say ""hi"""\r\n,"line\n2"',
    );
  });
});
