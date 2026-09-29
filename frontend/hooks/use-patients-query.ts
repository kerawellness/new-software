import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { PatientOption } from "@backend/models/patient";
import { supabase } from "@/integrations/supabase/client";

export type { PatientOption };

export function usePatientSearch(term: string, clinicId?: string, forceEnable = false) {
  const q = term.trim();
  return useQuery({
    queryKey: ["patients-search", q, clinicId],
    enabled: !!clinicId && (forceEnable || q.length >= 2),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PatientOption[]> => {
      let query = supabase
        .from("patients")
        .select("id, full_name, patient_code, phone")
        .eq("clinic_id", clinicId!)
        .order("created_at", { ascending: false })
        .limit(10);
      if (q.length > 0) {
        query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,patient_code.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as PatientOption[];
    },
  });
}
