import { createServerFn } from "@tanstack/react-start";

import { clinicAuth } from "@backend/auth-context";
import { runController } from "@backend/http";
import { replacePatientMedicalProfileSchema } from "@backend/validators/medical-profile-validators";
import {
  findPatientsByPhoneSchema,
  searchPatientsSchema,
} from "@backend/validators/patient-validators";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const searchPatientsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => searchPatientsSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { searchPatients } = await import("@backend/services/patient-service.server");
      return searchPatients(supabase, data.clinicId, data.term);
    }),
  );

export const findPatientsByPhoneFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => findPatientsByPhoneSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { findPatientsByPhoneBase } = await import("@backend/services/patient-service.server");
      return findPatientsByPhoneBase(supabase, data.clinicId, data.phone);
    }),
  );

export const familyPhonesForBaseFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => findPatientsByPhoneSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { familyPhonesForBase } = await import("@backend/services/patient-service.server");
      return familyPhonesForBase(supabase, data.clinicId, data.phone);
    }),
  );

export const replacePatientMedicalProfileFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => replacePatientMedicalProfileSchema.parse(data))
  .handler(async ({ data, context }) =>
    runController(async () => {
      const { supabase } = clinicAuth(context);
      const { replacePatientMedicalProfile } = await import(
        "@backend/services/medical-profile-service.server"
      );
      await replacePatientMedicalProfile(supabase, data);
      return { ok: true as const };
    }),
  );
