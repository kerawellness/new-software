import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import type { ClinicProfile } from "@backend/models/session";
import { supabase } from "@/integrations/supabase/client";
import { clearShowDemoData } from "@/lib/demo-data";
import { failIfOffline, isBrowserOffline, withNetworkTimeout } from "@/lib/network";
import { clearPersistedQueryCache } from "@/lib/query-persist";

export type { ClinicProfile };

/** Local session only — avoids a slow network round-trip to Supabase Auth. */
export async function getSessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "SIGNED_OUT") {
        clearShowDemoData();
        clearPersistedQueryCache();
        qc.clear();
      } else if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        void qc.invalidateQueries({ queryKey: ["profile"] });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [qc]);

  return { session, user: session?.user ?? null, loading };
}

export function useBrowserOffline() {
  const [offline, setOffline] = useState(isBrowserOffline);

  useEffect(() => {
    const sync = () => setOffline(isBrowserOffline());
    window.addEventListener("offline", sync);
    window.addEventListener("online", sync);
    return () => {
      window.removeEventListener("offline", sync);
      window.removeEventListener("online", sync);
    };
  }, []);

  return offline;
}

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ["profile"],
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    networkMode: "always",
    retry: (failureCount) => !isBrowserOffline() && failureCount < 1,
    queryFn: () =>
      withNetworkTimeout(
        (async (): Promise<ClinicProfile | null> => {
          failIfOffline();
          const uid = await getSessionUserId();
          if (!uid) return null;

          const { data: profile, error } = await supabase
            .from("profiles")
            .select(
              "id, clinic_id, name, email, avatar_url, clinics(id, name, phone, email, address, patient_code_prefix, tax_enabled, tax_rate, tax_label, currency)",
            )
            .eq("id", uid)
            .maybeSingle();

          if (error) throw error;
          if (!profile?.clinic_id) return null;

          const clinic = (profile as { clinics: ClinicProfile["clinic"] }).clinics ?? null;
          return {
            id: profile.id,
            clinic_id: profile.clinic_id,
            name: profile.name,
            email: profile.email,
            avatar_url: profile.avatar_url,
            roles: ["admin"],
            clinic,
          };
        })(),
      ),
  });
}
