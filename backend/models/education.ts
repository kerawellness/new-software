import type {
  educationCategorySchema,
  educationMediaTypeSchema,
  educationPresentationSchema,
} from "@backend/validators/education-validators";
import type { z } from "zod";

export type EducationCategory = z.infer<typeof educationCategorySchema>;
export type EducationMediaType = z.infer<typeof educationMediaTypeSchema>;
export type EducationPresentation = z.infer<typeof educationPresentationSchema>;

export type EducationMaterial = {
  id: string;
  clinicId: string;
  title: string;
  summary: string | null;
  category: EducationCategory;
  mediaType: EducationMediaType;
  tags: string[];
  storageBucket: string;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  status: "pending" | "published" | "failed" | "archived";
  contentVersion: string | null;
  uploadedBy: string | null;
  createdAt: string;
  updatedAt: string;
  presentation: EducationPresentation;
  pairGroupId: string | null;
  pairRole: "before" | "after" | null;
  afterId: string | null;
  afterStoragePath: string | null;
  afterStorageBucket: string | null;
};
