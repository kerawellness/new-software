import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import {
  createEducationSignedUrlsSchema,
  deleteEducationMaterialSchema,
  educationSearchSchema,
  finalizeEducationUploadSchema,
  registerEducationUploadSchema,
  updateEducationMaterialSchema,
} from "@backend/validators/education-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const searchEducationMaterialsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => educationSearchSchema.parse(data ?? {}))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { searchEducationMaterials } =
        await import("@backend/services/education-service.server");
      return searchEducationMaterials(supabase, data);
    }),
  );

export const createEducationSignedUrlsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => createEducationSignedUrlsSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { createEducationSignedUrls } =
        await import("@backend/services/education-service.server");
      return createEducationSignedUrls(supabase, data.targets, data.expiresInSeconds);
    }),
  );

export const registerEducationUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => registerEducationUploadSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { registerEducationUpload } =
        await import("@backend/services/education-service.server");
      return registerEducationUpload(supabase, data);
    }),
  );

export const finalizeEducationUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => finalizeEducationUploadSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { finalizeEducationUpload } =
        await import("@backend/services/education-service.server");
      return finalizeEducationUpload(supabase, data.materialId);
    }),
  );

export const updateEducationMaterialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => updateEducationMaterialSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { updateEducationMaterial } =
        await import("@backend/services/education-service.server");
      return updateEducationMaterial(supabase, data.materialId, data.metadata, data.pairGroupId);
    }),
  );

export const deleteEducationMaterialFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => deleteEducationMaterialSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { deleteEducationMaterial } =
        await import("@backend/services/education-service.server");
      return deleteEducationMaterial(supabase, data.materialId);
    }),
  );

const archiveFailedUploadSchema = z.object({
  materialId: z.string().uuid(),
  storagePath: z.string().min(1),
});

export const archiveFailedEducationUploadFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => archiveFailedUploadSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { archiveFailedEducationUpload } =
        await import("@backend/services/education-service.server");
      return archiveFailedEducationUpload(supabase, data.materialId, data.storagePath);
    }),
  );
