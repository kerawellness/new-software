import { Link, useRouter, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  CreditCard,
  Home,
  LayoutGrid,
  Handshake,
  UserSearch,
  Link2,
  LogOut,
  MessageCircle,
  ScrollText,
  Settings,
  Stethoscope,
  Users,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ClinicLogo } from "@/components/common/clinic-logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { useProfile } from "@/hooks/use-session";
import { initials, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { to: "/dashboard", label: "Home", shortLabel: "Home", icon: Home },
  { to: "/quick-entry", label: "Quick Entry", shortLabel: "Quick", icon: Zap },
  { to: "/patients", label: "Patients", shortLabel: "Patients", icon: Users },
  { to: "/flow", label: "Patient Flow", shortLabel: "Flow", icon: Activity },
  { to: "/more", label: "More", shortLabel: "More", icon: LayoutGrid },
] as const;

export const SECONDARY_NAV = [
  { to: "/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/billing", label: "Billing", icon: CreditCard },
  { to: "/followups", label: "Follow-Ups", icon: ClipboardList },
  { to: "/treatments", label: "Treatments", icon: Stethoscope },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/patient-education", label: "Patient Education", icon: BookOpen },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/clinic-log", label: "Clinic Log", icon: ScrollText },
  { to: "/settings", label: "Settings", icon: Settings },
  {
    to: "/link",
    label: "Link",
    icon: Link2,
    href: "https://link.optivus.sbs",
  },
  { to: "/connect", label: "Connect", icon: Handshake },
  { to: "/patent-plus", label: "Patient+", icon: UserSearch },
] as const;

const DESKTOP_NAV_GROUPS = [
  {
    title: null,
    items: PRIMARY_NAV.filter((item) => item.to !== "/more"),
  },
  {
    title: "Chairs & money",
    items: ["/appointments", "/billing", "/followups", "/treatments"].map(
      (to) => SECONDARY_NAV.find((item) => item.to === to)!,
    ),
  },
  {
    title: "Talk",
    items: ["/whatsapp", "/patient-education"].map(
      (to) => SECONDARY_NAV.find((item) => item.to === to)!,
    ),
  },
  {
    title: "Clinic",
    items: ["/analytics", "/clinic-log", "/settings"].map(
      (to) => SECONDARY_NAV.find((item) => item.to === to)!,
    ),
  },
  {
    title: "Ecosystem",
    items: ["/link", "/connect", "/patent-plus"].map(
      (to) => SECONDARY_NAV.find((item) => item.to === to)!,
    ),
  },
] as const;

/** Link, Connect and Patent+ each have their own menu colour. */
export const EXTERNAL_MENU_TONES: Record<
  string,
  { text: string; row: string; card: string; chip: string }
> = {
  "/link": {
    text: "text-menu-link-text",
    row: "text-menu-link-text hover:bg-menu-link-surface",
    card: "border-menu-link-text/25 bg-menu-link-surface/40 hover:bg-menu-link-surface/70",
    chip: "bg-menu-link-surface text-menu-link-text",
  },
  "/connect": {
    text: "text-menu-connect-text",
    row: "text-menu-connect-text hover:bg-menu-connect-surface",
    card: "border-menu-connect-text/25 bg-menu-connect-surface/40 hover:bg-menu-connect-surface/70",
    chip: "bg-menu-connect-surface text-menu-connect-text",
  },
  "/patent-plus": {
    text: "text-menu-patent-text",
    row: "text-menu-patent-text hover:bg-menu-patent-surface",
    card: "border-menu-patent-text/25 bg-menu-patent-surface/40 hover:bg-menu-patent-surface/70",
    chip: "bg-menu-patent-surface text-menu-patent-text",
  },
};

/** Warm page code together, so the next menu tap is not still downloading. */
const IDLE_PREFETCH_ROUTES = [
  "/dashboard",
  "/quick-entry",
  "/patients",
  "/appointments",
  "/flow",
  "/billing",
  "/followups",
  "/treatments",
  "/clinic-log",
  "/analytics",
  "/settings",
  "/whatsapp",
  "/patient-education",
  "/connect",
  "/patent-plus",
] as const;

function useIdlePrefetchRoutes(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let cancelled = false;
    const prefetch = () => {
      if (cancelled) return;
      for (const to of IDLE_PREFETCH_ROUTES) {
        void router.preloadRoute({ to }).catch(() => undefined);
      }
    };

    const timer = window.setTimeout(prefetch, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, router]);
}

/** Website bookings still waiting — confirm or reject clears the icon number. */
export function usePendingOnlineCount(clinicId?: string) {
  return useQuery({
    queryKey: ["pending-online-count", clinicId],
    enabled: !!clinicId,
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("online_appointment_requests")
        .select("id", { count: "exact", head: true })
        .eq("clinic_id", clinicId!)
        .eq("status", "requested");
      return count ?? 0;
    },
  });
}

/** Late follow-ups count — used by desktop nav and mobile More menu. */
export function useOverdueCount(clinicId?: string) {
  return useQuery({
    queryKey: ["overdue-followups-count", clinicId],
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { count } = await supabase
        .from("follow_ups")
        .select("id", { count: "exact", head: true })
        .neq("status", "completed")
        .lt("due_date", todayISO());
      return count ?? 0;
    },
  });
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: profile } = useProfile();
  const { data: overdueCount = 0 } = useOverdueCount(profile?.clinic_id);
  const { data: pendingOnlineCount = 0 } = usePendingOnlineCount(profile?.clinic_id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useIdlePrefetchRoutes(!!profile?.clinic_id);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface-1 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-md"
      >
        Skip to content
      </a>
      {/* Desktop / tablet sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line/80 bg-surface-1 px-3 py-4 shadow-xs lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-5 border-b border-line mb-3">
          <ClinicLogo className="size-9 shrink-0 rounded-xl shadow-xs" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-900">VSP Software</p>
            <p className="truncate text-[11px] font-medium text-ink-500">
              {profile?.clinic?.name ?? "Clinic Portal"}
            </p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto pr-1">
          {DESKTOP_NAV_GROUPS.map((group) => (
            <div key={group.title ?? "primary"} className={cn(group.title && "mt-2")}>
              {group.title ? (
                <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {group.title}
                </p>
              ) : null}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const href = "href" in item ? item.href : undefined;
                  const tone = EXTERNAL_MENU_TONES[item.to];
                  const active = !href && isActive(item.to);
                  const className = cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all",
                    active && !tone && "bg-primary/10 text-primary font-semibold shadow-2xs",
                    tone && (active ? cn(tone.chip, "font-semibold") : tone.row),
                    !active && !tone && "text-ink-700 hover:bg-surface-2 hover:text-ink-900",
                  );
                  const content = (
                    <>
                      <item.icon
                        className={cn(
                          "size-4",
                          active && !tone && "text-primary",
                          tone && tone.text,
                          !active && !tone && "text-ink-300",
                        )}
                        aria-hidden
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.to === "/appointments" && pendingOnlineCount > 0 ? (
                        <span className="ml-auto grid size-5 place-items-center rounded-full bg-destructive text-[10px] font-bold tabular-nums text-destructive-foreground">
                          {pendingOnlineCount > 99 ? "99+" : pendingOnlineCount}
                        </span>
                      ) : null}
                      {item.to === "/followups" && overdueCount > 0 ? (
                        <span className="ml-auto grid size-5 place-items-center rounded-full bg-destructive text-[10px] font-bold tabular-nums text-destructive-foreground">
                          {overdueCount > 99 ? "99+" : overdueCount}
                        </span>
                      ) : null}
                    </>
                  );

                  if (href) {
                    return (
                      <a
                        key={item.to}
                        href={href}
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
        </nav>
        <div className="mt-2 flex items-center gap-2.5 rounded-xl border border-line bg-surface-2/80 p-2.5">
          <Avatar className="size-8 border border-line shadow-2xs">
            <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
              {initials(profile?.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink-900">
              {profile?.name ?? "Staff"}
            </p>
            <p className="truncate text-[10px] text-ink-500">{profile?.email}</p>
          </div>
          <ThemeToggle className="size-8 rounded-lg" />
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-ink-300 hover:text-ink-700"
            aria-label="Sign out"
            onClick={signOut}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b border-line/80 bg-surface-1/95 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <ClinicLogo className="size-8 shrink-0 rounded-lg shadow-2xs" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight text-ink-900">
                VSP Software
              </p>
              <p className="truncate text-[11px] leading-tight text-ink-500">
                {profile?.clinic?.name ?? "Clinic Portal"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <Avatar className="size-8 shrink-0 border">
              <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">
                {initials(profile?.name)}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="min-w-0 overflow-x-hidden px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 lg:ml-60 lg:px-8 lg:pb-12 lg:pt-5"
      >
        <div className="mx-auto w-full max-w-[90rem]">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line/80 bg-surface-1/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {PRIMARY_NAV.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            preload="render"
            className={cn(
              "relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 px-0.5 py-2 text-[10px] font-medium transition-colors",
              isActive(item.to) ? "text-primary font-semibold" : "text-ink-500",
            )}
          >
            <span className="relative inline-flex">
              <item.icon
                className={cn("size-5", isActive(item.to) ? "text-primary" : "text-ink-300")}
                aria-hidden
              />
              {item.to === "/more" && (pendingOnlineCount > 0 || overdueCount > 0) ? (
                <span className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-destructive text-[9px] font-bold leading-none tabular-nums text-destructive-foreground">
                  {pendingOnlineCount > 0
                    ? pendingOnlineCount > 9
                      ? "9+"
                      : pendingOnlineCount
                    : overdueCount > 9
                      ? "9+"
                      : overdueCount}
                </span>
              ) : null}
            </span>
            {item.shortLabel}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex min-w-0 flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight text-ink-900 sm:text-xl md:text-2xl">
          {title}
        </h1>
        {description ? <p className="mt-1 text-xs text-ink-500 sm:text-sm">{description}</p> : null}
      </div>
      {action ? (
        <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">{action}</div>
      ) : null}
    </div>
  );
}
