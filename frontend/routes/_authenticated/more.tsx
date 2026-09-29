import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import {
  AppShell,
  EXTERNAL_MENU_TONES,
  PageHeader,
  SECONDARY_NAV,
  useOverdueCount,
  usePendingOnlineCount,
} from "@/components/layout/app-shell";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/more")({
  head: () => ({
    meta: [
      { title: "More — VSP Software" },
      {
        name: "description",
        content: "Appointments, billing, WhatsApp, analytics, settings, and more clinic tools.",
      },
    ],
  }),
  component: MobileMorePage,
});

function MobileMorePage() {
  const { data: profile } = useProfile();
  const { data: overdueCount = 0 } = useOverdueCount(profile?.clinic_id);
  const { data: pendingOnlineCount = 0 } = usePendingOnlineCount(profile?.clinic_id);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  return (
    <AppShell>
      <PageHeader
        title="More"
        description="The rest of the clinic tools."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-line bg-surface-1 p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-10">
              <AvatarFallback className="text-sm font-semibold">
                {initials(profile?.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-900">
                {profile?.name ?? "Staff Member"}
              </p>
              <p className="truncate text-xs text-ink-500">{profile?.email}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={signOut}
            className="shrink-0 text-destructive"
          >
            <LogOut className="size-4" aria-hidden /> Sign Out
          </Button>
        </div>

        {[
          { title: "Chairs & money", tos: ["/appointments", "/billing", "/followups", "/treatments"] },
          { title: "Talk", tos: ["/whatsapp", "/patient-education"] },
          { title: "Clinic", tos: ["/analytics", "/clinic-log", "/settings"] },
          { title: "Ecosystem", tos: ["/link", "/connect", "/patent-plus"] },
        ].map((group) => (
          <div key={group.title} className="space-y-2">
            <h2 className="px-0.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
              {group.title}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.tos.map((to) => {
                const item = SECONDARY_NAV.find((n) => n.to === to);
                if (!item) return null;
                const tone = EXTERNAL_MENU_TONES[to];
                const className = cn(
                  "relative flex items-center gap-3 rounded-xl border p-3.5 transition-colors duration-150",
                  tone ? tone.card : "border-line bg-surface-1 hover:bg-surface-2/60",
                );
                const content = (
                  <>
                    <div
                      className={cn(
                        "grid size-9 place-items-center rounded-xl",
                        tone ? tone.chip : "bg-primary/10 text-primary",
                      )}
                    >
                      <item.icon className="size-5" aria-hidden />
                    </div>
                    <p
                      className={cn(
                        "min-w-0 flex-1 text-sm font-medium",
                        tone ? tone.text : "text-ink-900",
                      )}
                    >
                      {item.label}
                    </p>
                    {item.to === "/appointments" && pendingOnlineCount > 0 ? (
                      <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-destructive text-[10px] font-bold tabular-nums text-destructive-foreground">
                        {pendingOnlineCount > 99 ? "99+" : pendingOnlineCount}
                      </span>
                    ) : null}
                    {item.to === "/followups" && overdueCount > 0 ? (
                      <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-destructive text-[10px] font-bold tabular-nums text-destructive-foreground">
                        {overdueCount > 99 ? "99+" : overdueCount}
                      </span>
                    ) : null}
                  </>
                );
                if ("href" in item && item.href) {
                  return (
                    <a
                      key={item.to}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={className}
                    >
                      {content}
                    </a>
                  );
                }
                return (
                  <Link key={item.to} to={item.to} preload="render" className={className}>
                    {content}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}
