import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useBrowserOffline, useProfile, useSession } from "@/hooks/use-session";
import { supabase } from "@/integrations/supabase/client";
import { markMissedAppointmentsNoShowOnce } from "@/lib/mark-missed-appointments";
import { ensureClinicProfileForSession } from "@/lib/ensure-clinic-profile";
import { isConnectionFailure } from "@/lib/network";
import { warmClinicLists } from "@/lib/warm-clinic-data";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { session, loading } = useSession();
  const profileQuery = useProfile(!!session);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clinicId = profileQuery.data?.clinic_id;

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    void markMissedAppointmentsNoShowOnce(clinicId)
      .then((count) => {
        if (cancelled || count === 0) return;
        void qc.invalidateQueries({ queryKey: ["appointments"] });
        void qc.invalidateQueries({ queryKey: ["analytics"] });
        void qc.invalidateQueries({ queryKey: ["patient"] });
      })
      .catch(() => {
        toast.error("Could not mark missed appointments. Refresh the page to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, qc]);

  useEffect(() => {
    if (!clinicId) return;
    return warmClinicLists(qc, clinicId);
  }, [clinicId, qc]);

  useEffect(() => {
    if (!loading && !session) {
      navigate({
        to: "/login",
        search: {
          redirect: typeof window !== "undefined" ? window.location.pathname : "/dashboard",
          reason: "session",
        },
      });
    }
  }, [session, loading, navigate]);

  const offline = useBrowserOffline();
  const connectionFailed = offline || isConnectionFailure(profileQuery.error);

  if (
    !connectionFailed &&
    (loading || (session && profileQuery.isLoading && !profileQuery.data))
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  if (profileQuery.isError && !connectionFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="surface-card max-w-sm space-y-3 p-6 text-center">
          <h1 className="text-lg font-semibold">Could not load your clinic profile</h1>
          <p className="text-sm text-muted-foreground">
            The connection failed or your session expired. Sign in again, or retry if the network was
            briefly down.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={() => void profileQuery.refetch()}>
              Retry
            </Button>
            <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!profileQuery.data && !connectionFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="surface-card max-w-sm space-y-3 p-6 text-center">
          <h1 className="text-lg font-semibold">Access unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This sign-in is not linked to a clinic profile yet. Run{" "}
            <code className="text-xs">04-fix-auth-login.sql</code> in Supabase once, or tap Fix
            access below.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              variant="outline"
              onClick={async () => {
                await ensureClinicProfileForSession();
                void profileQuery.refetch();
              }}
            >
              Fix access
            </Button>
            <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
