import { z } from "zod";

export const educationCategorySchema = z.enum([
  "dental_problem",
  "treatment_procedure",
  "prevention",
  "aftercare",
]);

export const educationMediaTypeSchema = z.enum(["image", "video", "pdf"]);
export const educationPresentationSchema = z.enum(["single", "before_after"]);

export const educationMetadataSchema = z.object({
  title: z.string().trim().min(2, "Enter a title.").max(160, "Title is too long."),
  summary: z.string().trim().max(2000, "Summary is too long."),
  category: educationCategorySchema,
  tags: z
    .array(z.string().trim().min(1).max(50))
    .max(20, "Use no more than 20 tags.")
    .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]),
  contentVersion: z.string().trim().max(60).optional(),
});

export type EducationMetadataInput = z.input<typeof educationMetadataSchema>;
export type EducationMetadata = z.output<typeof educationMetadataSchema>;

export const educationSearchSchema = z.object({
  query: z.string().trim().max(200).default(""),
  category: educationCategorySchema.or(z.literal("all")).default("all"),
  mediaType: educationMediaTypeSchema.or(z.literal("all")).default("all"),
  presentation: educationPresentationSchema.or(z.literal("all")).default("all"),
  page: z.number().int().min(1).max(20_834).default(1),
  pageSize: z.number().int().min(1).max(100).default(48),
});

export type EducationSearchInput = z.input<typeof educationSearchSchema>;

export const educationSignedUrlTargetSchema = z.object({
  id: z.string().uuid(),
  storageBucket: z.string().min(1),
  storagePath: z.string().min(1),
});

export const createEducationSignedUrlsSchema = z.object({
  targets: z.array(educationSignedUrlTargetSchema),
  expiresInSeconds: z.number().int().positive().max(86_400).default(600),
});

export const registerEducationUploadSchema = z.object({
  title: z.string().min(1),
  summary: z.string().nullable(),
  category: educationCategorySchema,
  mediaType: educationMediaTypeSchema,
  tags: z.array(z.string()),
  originalFilename: z.string().min(1),
  mimeType: z.string().min(1),
  byteSize: z.number().int().nonnegative(),
  contentVersion: z.string().nullable(),
  presentation: educationPresentationSchema,
  pairGroupId: z.string().uuid().nullable(),
  pairRole: z.enum(["before", "after"]).nullable(),
});

export const finalizeEducationUploadSchema = z.object({
  materialId: z.string().uuid(),
});

export const updateEducationMaterialSchema = z.object({
  materialId: z.string().uuid(),
  metadata: educationMetadataSchema,
  pairGroupId: z.string().uuid().nullable().optional(),
});

export const deleteEducationMaterialSchema = z.object({
  materialId: z.string().uuid(),
});
