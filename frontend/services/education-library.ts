import {
  archiveFailedEducationUploadFn,
  createEducationSignedUrlsFn,
  deleteEducationMaterialFn,
  finalizeEducationUploadFn,
  registerEducationUploadFn,
  searchEducationMaterialsFn,
  updateEducationMaterialFn,
} from "@backend/controllers/education-controller";
import type {
  EducationCategory,
  EducationMaterial,
  EducationMediaType,
  EducationPresentation,
} from "@backend/models/education";
import {
  educationMetadataSchema,
  type EducationMetadataInput,
  type EducationSearchInput,
} from "@backend/validators/education-validators";
import { supabase } from "@/integrations/supabase/client";
import { compressEducationImageForUpload } from "@/lib/compress-education-image";
import { unwrapApi } from "@/services/api-client";

export const EDUCATION_CATEGORIES = [
  { value: "dental_problem", label: "Dental Problems" },
  { value: "treatment_procedure", label: "Treatment Procedures" },
  { value: "prevention", label: "Prevention" },
  { value: "aftercare", label: "Aftercare" },
] as const;

export const EDUCATION_MEDIA_TYPES = [
  { value: "image", label: "Photos" },
  { value: "video", label: "Videos" },
  { value: "pdf", label: "PDFs" },
] as const;

export const EDUCATION_PRESENTATIONS = [
  { value: "single", label: "Single file" },
  { value: "before_after", label: "Before / After" },
] as const;

export type { EducationCategory, EducationMaterial, EducationMediaType, EducationPresentation };
export { educationMetadataSchema, type EducationMetadataInput, type EducationSearchInput };

export function classifyEducationFile(file: Pick<File, "name" | "size" | "type">) {
  const mimeType = file.type.toLowerCase();
  let mediaType: EducationMediaType;
  let maximumBytes: number;

  if (["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    mediaType = "image";
    maximumBytes = 25 * 1024 * 1024;
  } else if (["video/mp4", "video/quicktime"].includes(mimeType)) {
    mediaType = "video";
    maximumBytes = 200 * 1024 * 1024;
  } else if (mimeType === "application/pdf") {
    mediaType = "pdf";
    maximumBytes = 25 * 1024 * 1024;
  } else {
    throw new Error("Choose a JPEG, PNG, WebP, MP4, QuickTime, or PDF file.");
  }

  if (!file.name || file.name.length > 200 || /[/\\\0]/.test(file.name)) {
    throw new Error("The file name is invalid.");
  }
  if (file.size < 1 || file.size > maximumBytes) {
    const maximumMb = Math.round(maximumBytes / 1024 / 1024);
    throw new Error(`The selected ${mediaType} must be no larger than ${maximumMb} MB.`);
  }

  return { mediaType, mimeType };
}

export function classifyEducationPairImages(
  before: Pick<File, "name" | "size" | "type">,
  after: Pick<File, "name" | "size" | "type">,
) {
  const beforeClassified = classifyEducationFile(before);
  const afterClassified = classifyEducationFile(after);

  if (beforeClassified.mediaType !== "image" || afterClassified.mediaType !== "image") {
    throw new Error("Before/After pairs must be JPEG, PNG, or WebP images.");
  }

  return {
    before: beforeClassified,
    after: afterClassified,
  };
}

export async function searchEducationMaterials(input: EducationSearchInput = {}) {
  return unwrapApi(await searchEducationMaterialsFn({ data: input }));
}

type SignedUrlTarget = {
  id: string;
  storageBucket: string;
  storagePath: string;
};

function collectSignedUrlTargets(materials: EducationMaterial[]): SignedUrlTarget[] {
  const targets: SignedUrlTarget[] = [];
  for (const material of materials) {
    targets.push({
      id: material.id,
      storageBucket: material.storageBucket,
      storagePath: material.storagePath,
    });
    if (
      material.presentation === "before_after" &&
      material.afterId &&
      material.afterStoragePath &&
      material.afterStorageBucket
    ) {
      targets.push({
        id: material.afterId,
        storageBucket: material.afterStorageBucket,
        storagePath: material.afterStoragePath,
      });
    }
  }
  return targets;
}

/** JSON persist cannot store Map; revive a Record, Map, or leftover `{}`. */
export function educationSignedUrlLookup(value: unknown): Map<string, string> {
  if (value instanceof Map) {
    return new Map(
      [...value.entries()].filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return new Map(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  }
  return new Map();
}

export async function createEducationSignedUrls(
  materials: EducationMaterial[],
  expiresInSeconds = 600,
): Promise<Record<string, string>> {
  const targets = collectSignedUrlTargets(materials);
  return unwrapApi(
    await createEducationSignedUrlsFn({
      data: { targets, expiresInSeconds },
    }),
  );
}

async function registerAndUploadFile(args: {
  metadata: ReturnType<typeof educationMetadataSchema.parse>;
  file: File;
  mediaType: EducationMediaType;
  mimeType: string;
  presentation: EducationPresentation;
  pairGroupId: string | null;
  pairRole: "before" | "after" | null;
}) {
  const registered = unwrapApi(
    await registerEducationUploadFn({
      data: {
        title: args.metadata.title,
        summary: args.metadata.summary || null,
        category: args.metadata.category,
        mediaType: args.mediaType,
        tags: args.metadata.tags,
        originalFilename: args.file.name,
        mimeType: args.mimeType,
        byteSize: args.file.size,
        contentVersion: args.metadata.contentVersion || null,
        presentation: args.presentation,
        pairGroupId: args.pairGroupId,
        pairRole: args.pairRole,
      },
    }),
  );

  if (registered.duplicate) {
    return { id: registered.id, storagePath: registered.storage_path, duplicate: true as const };
  }

  try {
    const { error: uploadError } = await supabase.storage
      .from("education-materials")
      .upload(registered.storage_path, args.file, {
        cacheControl: "3600",
        contentType: args.mimeType,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    unwrapApi(await finalizeEducationUploadFn({ data: { materialId: registered.id } }));
    return { id: registered.id, storagePath: registered.storage_path, duplicate: false as const };
  } catch (error) {
    await archiveFailedEducationUploadFn({
      data: { materialId: registered.id, storagePath: registered.storage_path },
    }).catch(() => undefined);
    throw error;
  }
}

export async function uploadEducationMaterial(metadata: EducationMetadataInput, file: File) {
  const value = educationMetadataSchema.parse(metadata);
  classifyEducationFile(file);
  const uploadFile = await compressEducationImageForUpload(file);
  const { mediaType, mimeType } = classifyEducationFile(uploadFile);

  const result = await registerAndUploadFile({
    metadata: value,
    file: uploadFile,
    mediaType,
    mimeType,
    presentation: "single",
    pairGroupId: null,
    pairRole: null,
  });

  return { id: result.id, duplicate: result.duplicate };
}

export async function uploadEducationBeforeAfterPair(
  metadata: EducationMetadataInput,
  beforeFile: File,
  afterFile: File,
) {
  const value = educationMetadataSchema.parse(metadata);
  classifyEducationPairImages(beforeFile, afterFile);

  const compressedBefore = await compressEducationImageForUpload(beforeFile);
  const compressedAfter = await compressEducationImageForUpload(afterFile);
  const classified = classifyEducationPairImages(compressedBefore, compressedAfter);
  const pairGroupId = crypto.randomUUID();

  const beforeResult = await registerAndUploadFile({
    metadata: value,
    file: compressedBefore,
    mediaType: "image",
    mimeType: classified.before.mimeType,
    presentation: "before_after",
    pairGroupId,
    pairRole: "before",
  });

  if (beforeResult.duplicate) {
    return { id: beforeResult.id, duplicate: true };
  }

  try {
    const afterResult = await registerAndUploadFile({
      metadata: value,
      file: compressedAfter,
      mediaType: "image",
      mimeType: classified.after.mimeType,
      presentation: "before_after",
      pairGroupId,
      pairRole: "after",
    });

    if (afterResult.duplicate) {
      await archiveEducationMaterial(beforeResult.id);
      return { id: afterResult.id, duplicate: true };
    }

    return { id: beforeResult.id, duplicate: false };
  } catch (error) {
    await archiveEducationMaterial(beforeResult.id).catch(() => undefined);
    throw error;
  }
}

export async function updateEducationMaterial(
  materialId: string,
  metadata: EducationMetadataInput,
  pairGroupId?: string | null,
) {
  unwrapApi(
    await updateEducationMaterialFn({
      data: {
        materialId,
        metadata,
        ...(pairGroupId ? { pairGroupId } : {}),
      },
    }),
  );
}

export async function deleteEducationMaterial(materialId: string) {
  return unwrapApi(await deleteEducationMaterialFn({ data: { materialId } }));
}

export async function archiveEducationMaterial(materialId: string) {
  return deleteEducationMaterial(materialId);
}
