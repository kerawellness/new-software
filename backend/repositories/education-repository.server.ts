import { z } from "zod";

import { throwDb } from "@backend/db";
import type { EducationMaterial } from "@backend/models/education";
import type { ClinicDb } from "@backend/types";
import {
  educationCategorySchema,
  educationMediaTypeSchema,
  educationPresentationSchema,
  type EducationMetadata,
} from "@backend/validators/education-validators";

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;

function rpc(db: ClinicDb, name: string, args: Record<string, unknown>) {
  return (db.rpc as unknown as UntypedRpc)(name, args);
}

const rpcMaterialSchema = z.object({
  id: z.string().uuid(),
  clinic_id: z.string().uuid(),
  title: z.string(),
  summary: z.string().nullable(),
  category: educationCategorySchema,
  media_type: educationMediaTypeSchema,
  tags: z.array(z.string()),
  storage_bucket: z.string(),
  storage_path: z.string(),
  original_filename: z.string(),
  mime_type: z.string(),
  byte_size: z.coerce.number(),
  status: z.enum(["pending", "published", "failed", "archived"]),
  content_version: z.string().nullable(),
  uploaded_by: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  presentation: educationPresentationSchema.default("single"),
  pair_group_id: z.string().uuid().nullable().optional().default(null),
  pair_role: z.enum(["before", "after"]).nullable().optional().default(null),
  after_id: z.string().uuid().nullable().optional().default(null),
  after_storage_path: z.string().nullable().optional().default(null),
  after_storage_bucket: z.string().nullable().optional().default(null),
  total_count: z.coerce.number().int().nonnegative(),
});

export function mapEducationMaterial(value: z.infer<typeof rpcMaterialSchema>): EducationMaterial {
  return {
    id: value.id,
    clinicId: value.clinic_id,
    title: value.title,
    summary: value.summary,
    category: value.category,
    mediaType: value.media_type,
    tags: value.tags,
    storageBucket: value.storage_bucket,
    storagePath: value.storage_path,
    originalFilename: value.original_filename,
    mimeType: value.mime_type,
    byteSize: value.byte_size,
    status: value.status,
    contentVersion: value.content_version,
    uploadedBy: value.uploaded_by,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    presentation: value.presentation,
    pairGroupId: value.pair_group_id ?? null,
    pairRole: value.pair_role ?? null,
    afterId: value.after_id ?? null,
    afterStoragePath: value.after_storage_path ?? null,
    afterStorageBucket: value.after_storage_bucket ?? null,
  };
}

export async function searchEducationMaterials(
  db: ClinicDb,
  args: {
    query: string;
    category: string;
    mediaType: string;
    presentation: string;
    page: number;
    pageSize: number;
  },
) {
  const { data, error } = await rpc(db, "search_education_materials", {
    _query: args.query || null,
    _category: args.category === "all" ? null : args.category,
    _media_type: args.mediaType === "all" ? null : args.mediaType,
    _limit: args.pageSize,
    _offset: (args.page - 1) * args.pageSize,
    _presentation: args.presentation === "all" ? null : args.presentation,
  });
  throwDb(error);
  const rows = z.array(rpcMaterialSchema).parse(data ?? []);
  return {
    materials: rows.map(mapEducationMaterial),
    total: rows[0]?.total_count ?? 0,
    page: args.page,
    pageSize: args.pageSize,
  };
}

export async function createSignedUrls(
  db: ClinicDb,
  targets: Array<{ id: string; storageBucket: string; storagePath: string }>,
  expiresInSeconds: number,
): Promise<Record<string, string>> {
  if (targets.length === 0) return {};

  const grouped = new Map<string, typeof targets>();
  for (const target of targets) {
    const group = grouped.get(target.storageBucket) ?? [];
    group.push(target);
    grouped.set(target.storageBucket, group);
  }

  const urls: Record<string, string> = {};
  for (const [bucket, group] of grouped) {
    const { data, error } = await db.storage.from(bucket).createSignedUrls(
      group.map((target) => target.storagePath),
      expiresInSeconds,
    );
    throwDb(error);
    (data ?? []).forEach((entry, index) => {
      if (entry.signedUrl) urls[group[index]!.id] = entry.signedUrl;
    });
  }
  return urls;
}

export async function registerEducationUpload(
  db: ClinicDb,
  args: {
    title: string;
    summary: string | null;
    category: string;
    mediaType: string;
    tags: string[];
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    contentVersion: string | null;
    presentation: string;
    pairGroupId: string | null;
    pairRole: "before" | "after" | null;
  },
) {
  const { data, error } = await rpc(db, "register_education_upload", {
    _title: args.title,
    _summary: args.summary,
    _category: args.category,
    _media_type: args.mediaType,
    _tags: args.tags,
    _original_filename: args.originalFilename,
    _mime_type: args.mimeType,
    _byte_size: args.byteSize,
    _sha256: null,
    _content_version: args.contentVersion,
    _presentation: args.presentation,
    _pair_group_id: args.pairGroupId,
    _pair_role: args.pairRole,
  });
  throwDb(error);
  return z
    .object({
      id: z.string().uuid(),
      storage_path: z.string().min(1),
      status: z.enum(["pending", "published", "failed", "archived"]),
      duplicate: z.boolean(),
    })
    .parse(data);
}

export async function finalizeEducationUpload(db: ClinicDb, materialId: string): Promise<void> {
  const { error } = await rpc(db, "finalize_education_upload", { _material_id: materialId });
  throwDb(error);
}

export async function updateEducationMaterial(
  db: ClinicDb,
  materialId: string,
  metadata: EducationMetadata,
  pairGroupId?: string | null,
): Promise<void> {
  const payload = {
    title: metadata.title,
    summary: metadata.summary || null,
    category: metadata.category,
    tags: metadata.tags,
    content_version: metadata.contentVersion || null,
  };

  if (pairGroupId) {
    const { error } = await db
      .from("education_materials" as never)
      .update(payload as never)
      .eq("pair_group_id", pairGroupId);
    throwDb(error);
    return;
  }

  const { error } = await db
    .from("education_materials" as never)
    .update(payload as never)
    .eq("id", materialId);
  throwDb(error);
}

function isMissingRpcError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    message.includes("Could not find the function") ||
    message.includes("schema cache")
  );
}

export async function deleteEducationMaterial(db: ClinicDb, materialId: string) {
  const hardDelete = await rpc(db, "delete_education_material", { _material_id: materialId });
  let data: unknown;
  if (hardDelete.error && isMissingRpcError(hardDelete.error)) {
    const softOrLegacy = await rpc(db, "archive_education_material", { _material_id: materialId });
    throwDb(softOrLegacy.error);
    data = softOrLegacy.data;
  } else if (hardDelete.error) {
    throw hardDelete.error;
  } else {
    data = hardDelete.data;
  }

  const parsed =
    typeof data === "string"
      ? { paths: [data] }
      : z.object({ paths: z.array(z.string().min(1)).min(1) }).parse(data);

  const { error: storageError } = await db.storage.from("education-materials").remove(parsed.paths);
  return { storageCleanupFailed: !!storageError };
}

export async function archiveEducationMaterial(db: ClinicDb, materialId: string) {
  await rpc(db, "archive_education_material", { _material_id: materialId }).catch(() => undefined);
}

export async function removeEducationFiles(db: ClinicDb, paths: string[]) {
  await db.storage
    .from("education-materials")
    .remove(paths)
    .catch(() => undefined);
}
