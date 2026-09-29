import { describe, expect, it } from "vitest";

import {
  classifyEducationFile,
  classifyEducationPairImages,
  educationMetadataSchema,
} from "@/services/education-library";

describe("education library boundaries", () => {
  it("normalizes metadata tags", () => {
    const value = educationMetadataSchema.parse({
      title: "Root Canal Treatment",
      summary: "What patients should expect.",
      category: "treatment_procedure",
      tags: ["Root Canal", "root canal", "Aftercare"],
      contentVersion: "2026.1",
    });

    expect(value.tags).toEqual(["root canal", "aftercare"]);
  });

  it("classifies an allowed video", () => {
    expect(
      classifyEducationFile({
        name: "root-canal.mp4",
        size: 20 * 1024 * 1024,
        type: "video/mp4",
      }),
    ).toEqual({ mediaType: "video", mimeType: "video/mp4" });
  });

  it("rejects unsupported and oversized files", () => {
    expect(() =>
      classifyEducationFile({
        name: "material.exe",
        size: 1024,
        type: "application/octet-stream",
      }),
    ).toThrow("Choose a JPEG, PNG, WebP, MP4, QuickTime, or PDF file.");

    expect(() =>
      classifyEducationFile({
        name: "large.pdf",
        size: 26 * 1024 * 1024,
        type: "application/pdf",
      }),
    ).toThrow("no larger than 25 MB");
  });

  it("rejects path separators in file names", () => {
    expect(() =>
      classifyEducationFile({
        name: "../material.pdf",
        size: 1024,
        type: "application/pdf",
      }),
    ).toThrow("file name is invalid");
  });

  it("accepts before/after image pairs", () => {
    expect(
      classifyEducationPairImages(
        { name: "before.jpg", size: 1024, type: "image/jpeg" },
        { name: "after.png", size: 2048, type: "image/png" },
      ),
    ).toEqual({
      before: { mediaType: "image", mimeType: "image/jpeg" },
      after: { mediaType: "image", mimeType: "image/png" },
    });
  });

  it("rejects pdf or video for before/after pairs", () => {
    expect(() =>
      classifyEducationPairImages(
        { name: "before.pdf", size: 1024, type: "application/pdf" },
        { name: "after.jpg", size: 1024, type: "image/jpeg" },
      ),
    ).toThrow("Before/After pairs must be JPEG, PNG, or WebP images.");

    expect(() =>
      classifyEducationPairImages(
        { name: "before.jpg", size: 1024, type: "image/jpeg" },
        { name: "after.mp4", size: 1024, type: "video/mp4" },
      ),
    ).toThrow("Before/After pairs must be JPEG, PNG, or WebP images.");
  });
});
