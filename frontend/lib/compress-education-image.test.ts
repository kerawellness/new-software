import { describe, expect, it } from "vitest";

import { compressEducationImageForUpload } from "@/lib/compress-education-image";

describe("compressEducationImageForUpload", () => {
  it("leaves videos and PDFs unchanged", async () => {
    const pdf = new File([new Uint8Array([1, 2, 3])], "guide.pdf", {
      type: "application/pdf",
    });
    const video = new File([new Uint8Array(8)], "clip.mp4", { type: "video/mp4" });

    await expect(compressEducationImageForUpload(pdf)).resolves.toBe(pdf);
    await expect(compressEducationImageForUpload(video)).resolves.toBe(video);
  });

  it("leaves small images unchanged", async () => {
    const small = new File([new Uint8Array(1024)], "tiny.jpg", { type: "image/jpeg" });
    await expect(compressEducationImageForUpload(small)).resolves.toBe(small);
  });
});
