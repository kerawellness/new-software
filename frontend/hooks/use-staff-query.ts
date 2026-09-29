import { useQuery } from "@tanstack/react-query";

import type { StaffOption } from "@backend/models/staff";
import { useProfile } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";

export type { StaffOption };

export function useActiveStaff() {
  const { data: profile } = useProfile();

  return useQuery({
    queryKey: ["staff-profiles-active", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StaffOption[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name")
        .eq("clinic_id", profile!.clinic_id)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
