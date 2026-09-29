import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { DailyMotivation } from "@/components/motivation/daily-motivation";
import { Kpi } from "@/components/common/kpi";
import {
  StatusChip,
  flowStatusTone,
} from "@/components/common/status-chip";
import { useTodayFlow } from "@/components/flow/flow-board";
import { ErrorState, LoadingKpis } from "@/components/common/states";
import { useBrowserOffline, useProfile } from "@/hooks/use-session";
import { failIfOffline, isBrowserOffline, withNetworkTimeout } from "@/lib/network";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { FLOW_LABELS, FLOW_STATES } from "@/lib/constants";
import {
  getDemoFollowUps,
  getDemoInvoices,
  getDemoPayments,
  getDemoPatients,
  getDemoVisits,
} from "@/lib/demo-data";
import { formatCurrency, formatDate, todayISO, visitKindCounts } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — VSP Software" },
      {
        name: "description",
        content:
          "Today's patients, patient flow, revenue, follow-ups and outstanding balances at a glance.",
      },
      { property: "og:title", content: "Dashboard — VSP Software" },
      {
        property: "og:description",
        content: "Today's patients, patient flow, revenue and follow-ups at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

function useDashboardMetrics(clinicId?: string) {
  return useQuery({
    queryKey: ["dashboard", clinicId, todayISO()],
    enabled: !!clinicId,
    staleTime: 60_000,
    networkMode: "always",
    retry: (failureCount) => !isBrowserOffline() && failureCount < 1,
    queryFn: () =>
      withNetworkTimeout((async () => {
        failIfOffline();
        const today = todayISO();
      const monthStart = `${today.slice(0, 7)}-01`;

      const [payments, followUps, overdueFollowUpCount, monthPatients, visits] = await Promise.all([
        supabase
          .from("payments")
          .select("amount, payment_method")
          .eq("clinic_id", clinicId!)
          .eq("payment_date", today),
        supabase
          .from("follow_ups")
          .select("id, reason, due_date, status, patients(id, full_name, patient_code, phone)")
          .eq("clinic_id", clinicId!)
          .neq("status", "completed")
          .lt("due_date", today)
          .order("due_date", { ascending: true })
          .limit(10),
        supabase
          .from("follow_ups")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId!)
          .neq("status", "completed")
          .lt("due_date", today),
        supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .gte("created_at", monthStart),
        supabase
          .from("visits")
          .select("id, patient_id, treatment_performed, treatments(id)")
          .eq("clinic_id", clinicId!)
          .eq("visit_date", today),
      ]);

      if (payments.error) throw payments.error;
      if (followUps.error) throw followUps.error;
      if (overdueFollowUpCount.error) throw overdueFollowUpCount.error;
      if (monthPatients.error) throw monthPatients.error;
      if (visits.error) throw visits.error;

      const byMethod: Record<string, number> = {
        cash: 0,
        upi: 0,
        card: 0,
        bank_transfer: 0,
        other: 0,
      };
      let revenue = 0;
      for (const p of payments.data ?? []) {
        const amount = Number(p.amount) || 0;
        revenue += amount;
        const method = p.payment_method in byMethod ? p.payment_method : "other";
        byMethod[method] = (byMethod[method] ?? 0) + amount;
      }
      const visitCounts = visitKindCounts(visits.data ?? []);

      return {
        revenue,
        collectionsByMethod: byMethod,
        paymentCount: payments.data?.length ?? 0,
        followUps: followUps.data ?? [],
        overdueFollowUpCount: overdueFollowUpCount.count ?? 0,
        monthPatients: monthPatients.count ?? 0,
        consultationCount: visitCounts.consultation,
        treatmentCount: visitCounts.treatment,
        visitTotal: (visits.data ?? []).length,
      };
    })()),
  });
}

function useOutstanding(clinicId?: string) {
  return useQuery({
    queryKey: ["dashboard-outstanding", clinicId],
    enabled: !!clinicId,
    staleTime: 60_000,
    networkMode: "always",
    retry: (failureCount) => !isBrowserOffline() && failureCount < 1,
    queryFn: () =>
      withNetworkTimeout((async () => {
        failIfOffline();
        const { data, error } = await supabase
        .from("invoices")
        .select("balance_amount")
        .eq("clinic_id", clinicId!)
        .gt("balance_amount", 0);
      if (error) throw error;
      return (data ?? []).reduce((sum, row) => sum + Number(row.balance_amount), 0);
    })()),
  });
}

function DashboardPage() {
  const [dayEndOpen, setDayEndOpen] = useState(false);
  const [moreKpisOpen, setMoreKpisOpen] = useState(false);
  const profileQuery = useProfile();
  const profile = profileQuery.data;
  const { showDemoData } = useShowDemoData();
  const flowQuery = useTodayFlow();
  const {
    data: metricsData,
    isLoading: metricsLoading,
    isError,
    refetch,
  } = useDashboardMetrics(profile?.clinic_id);
  const outstandingQuery = useOutstanding(profile?.clinic_id);
  const currency = profile?.clinic?.currency ?? "INR";
  const appointments = flowQuery.data ?? [];
  const offline = useBrowserOffline();
  const showLoadError =
    !metricsData && (isError || profileQuery.isError || (offline && !metricsData));
  const isLoading =
    !showLoadError &&
    !metricsData &&
    (metricsLoading || profileQuery.isLoading || !profile?.clinic_id);

  const data = useMemo(() => {
    if (!metricsData) return metricsData;
    if (!showDemoData) return metricsData;

    const today = todayISO();
    const demoPays = getDemoPayments().filter((p) => p.payment_date === today);
    const byMethod: Record<string, number> = { ...metricsData.collectionsByMethod };
    let revenue = metricsData.revenue;
    for (const p of demoPays) {
      const amount = Number(p.amount) || 0;
      revenue += amount;
      const method = p.payment_method in byMethod ? p.payment_method : "other";
      byMethod[method] = (byMethod[method] ?? 0) + amount;
    }

    const demoFollowUps = getDemoFollowUps().filter(
      (f) => f.status !== "completed" && f.due_date < today,
    );

    const demoVisits = getDemoVisits({ from: today, to: today }).map((v) => ({
      id: v.id,
      patient_id: v.patients.id,
      treatment_performed: v.treatment_performed,
      treatments: v.treatments,
    }));
    const demoVisitCounts = visitKindCounts(demoVisits);

    return {
      revenue,
      collectionsByMethod: byMethod,
      paymentCount: metricsData.paymentCount + demoPays.length,
      followUps: [...demoFollowUps, ...metricsData.followUps],
      overdueFollowUpCount: metricsData.overdueFollowUpCount + demoFollowUps.length,
      monthPatients: metricsData.monthPatients + getDemoPatients().length,
      consultationCount: metricsData.consultationCount + demoVisitCounts.consultation,
      treatmentCount: metricsData.treatmentCount + demoVisitCounts.treatment,
      visitTotal: metricsData.visitTotal + demoVisits.length,
    };
  }, [metricsData, showDemoData]);

  const demoOutstanding = showDemoData
    ? getDemoInvoices()
        .filter((inv) => inv.balance_amount > 0)
        .reduce((sum, inv) => sum + inv.balance_amount, 0)
    : 0;
  const outstanding = (outstandingQuery.data ?? 0) + (outstandingQuery.isSuccess ? demoOutstanding : 0);
  const dueLabel = outstandingQuery.isLoading
    ? "…"
    : formatCurrency(outstanding, currency);

  const engagedOrWaiting = appointments.filter(
    (a) => a.flow_status === "waiting" || a.flow_status === "engage",
  ).length;

  return (
    <AppShell>
      <DailyMotivation />
      <PageHeader title={`Good day, ${profile?.name?.split(" ")[0] ?? "there"}`} description={formatDate(todayISO())} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-6 sm:gap-3 sm:grid-cols-4">
        {[
          {
            to: "/patients/new" as const,
            icon: UserPlus,
            label: "New Patient",
            iconClass: "bg-info-surface text-info-text",
          },
          {
            to: "/appointments" as const,
            icon: CalendarDays,
            label: "Appointment",
            iconClass: "bg-primary/10 text-primary",
          },
          {
            to: "/quick-entry" as const,
            icon: Zap,
            label: "Quick Entry",
            iconClass: "bg-warning-surface text-warning-text",
          },
          {
            to: "/billing" as const,
            icon: Wallet,
            label: "Payment",
            iconClass: "bg-success-surface text-success-text",
          },
        ].map((item) => (
          <Button
            key={item.to}
            asChild
            variant="outline"
            className="h-auto min-h-[4.5rem] flex-col gap-1.5 rounded-xl border-line/80 bg-surface-1 py-3 font-semibold text-ink-700 shadow-2xs transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
          >
            <Link to={item.to}>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-lg",
                  item.iconClass,
                )}
              >
                <item.icon className="size-4" aria-hidden />
              </span>
              <span className="text-xs">{item.label}</span>
            </Link>
          </Button>
        ))}
      </div>

      {showLoadError ? (
        <ErrorState
          description="We couldn't load today's clinic data. Check the connection, then try again."
          onRetry={() => {
            void profileQuery.refetch();
            void refetch();
            void flowQuery.refetch();
            void outstandingQuery.refetch();
          }}
        />
      ) : isLoading ? (
        <>
          <div className="lg:hidden">
            <LoadingKpis count={3} />
          </div>
          <div className="hidden lg:block">
            <LoadingKpis count={6} />
          </div>
        </>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-3 lg:hidden">
            <Kpi
              label="In Clinic Now"
              value={engagedOrWaiting}
              icon={ClipboardList}
              accent="clinic"
              tone={engagedOrWaiting > 0 ? "warning" : undefined}
              actionLabel="Open flow"
              actionTo="/flow"
            />
            <Kpi
              label="Due"
              value={dueLabel}
              icon={Wallet}
              accent="balance"
              tone={outstandingQuery.isLoading ? undefined : outstanding > 0 ? "danger" : "success"}
              actionLabel="Collect"
              actionTo="/billing"
            />
            <Kpi
              className="col-span-2"
              label="Late Follow-ups"
              value={data?.overdueFollowUpCount ?? 0}
              icon={AlertCircle}
              accent="followups"
              tone={(data?.overdueFollowUpCount ?? 0) > 0 ? "warning" : "success"}
              actionLabel="Review"
              actionTo="/followups"
            />
          </div>
          <Collapsible open={moreKpisOpen} onOpenChange={setMoreKpisOpen} className="lg:hidden">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="mb-2 flex w-full items-center justify-between rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-left"
              >
                <span className="text-xs font-semibold text-ink-700">Today’s numbers</span>
                <ChevronDown
                  className={cn(
                    "size-4 text-ink-500 transition-transform duration-150",
                    moreKpisOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mb-2 grid grid-cols-2 gap-3">
                <Kpi
                  label="Patients Today"
                  value={appointments.length}
                  icon={Users}
                  accent="patients"
                  actionLabel="View schedule"
                  actionTo="/appointments"
                />
                <Kpi
                  label="Today's Revenue"
                  value={formatCurrency(data?.revenue ?? 0, currency)}
                  icon={CircleDollarSign}
                  accent="revenue"
                  tone={(data?.revenue ?? 0) > 0 ? "success" : undefined}
                  actionLabel="View payments"
                  actionTo="/billing"
                />
                <Kpi
                  className="col-span-2"
                  label="Patients This Month"
                  value={data?.monthPatients ?? 0}
                  icon={UserPlus}
                  accent="growth"
                  actionLabel="All patients"
                  actionTo="/patients"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
          <div className="mb-2 hidden grid-cols-3 gap-3 lg:grid xl:grid-cols-6">
            <Kpi
              label="Patients Today"
              value={appointments.length}
              icon={Users}
              accent="patients"
              actionLabel="View schedule"
              actionTo="/appointments"
            />
            <Kpi
              label="In Clinic Now"
              value={engagedOrWaiting}
              icon={ClipboardList}
              accent="clinic"
              tone={engagedOrWaiting > 0 ? "warning" : undefined}
              actionLabel="Open flow board"
              actionTo="/flow"
            />
            <Kpi
              label="Today's Revenue"
              value={formatCurrency(data?.revenue ?? 0, currency)}
              icon={CircleDollarSign}
              accent="revenue"
              tone={(data?.revenue ?? 0) > 0 ? "success" : undefined}
              actionLabel="View payments"
              actionTo="/billing"
            />
            <Kpi
              label="Late Follow-ups"
              value={data?.overdueFollowUpCount ?? 0}
              icon={AlertCircle}
              accent="followups"
              tone={(data?.overdueFollowUpCount ?? 0) > 0 ? "warning" : "success"}
              actionLabel="Review follow-ups"
              actionTo="/followups"
            />
            <Kpi
              label="Due"
              value={dueLabel}
              icon={Wallet}
              accent="balance"
              tone={outstandingQuery.isLoading ? undefined : outstanding > 0 ? "danger" : "success"}
              actionLabel="Record payment"
              actionTo="/billing"
            />
            <Kpi
              label="Patients This Month"
              value={data?.monthPatients ?? 0}
              icon={UserPlus}
              accent="growth"
              actionLabel="All patients"
              actionTo="/patients"
            />
          </div>
        </>
      )}

      {!showLoadError && !isLoading ? (
        <section className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
          <Link to="/treatments" className="min-w-0">
            <Kpi
              label="Total"
              value={data?.visitTotal ?? 0}
              icon={Users}
              accent="patients"
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Today</p>}
            />
          </Link>
          <Link to="/treatments" search={{ kind: "consultation" }} className="min-w-0">
            <Kpi
              label="Pending"
              value={data?.consultationCount ?? 0}
              icon={UserCheck}
              accent="clinic"
              tone={(data?.consultationCount ?? 0) > 0 ? "warning" : undefined}
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Consultation</p>}
            />
          </Link>
          <Link to="/treatments" search={{ kind: "treatment" }} className="col-span-2 min-w-0 sm:col-span-1">
            <Kpi
              label="Completed"
              value={data?.treatmentCount ?? 0}
              icon={CheckCircle}
              accent="revenue"
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Treatment</p>}
            />
          </Link>
        </section>
      ) : null}

      {!showLoadError && !isLoading ? (
        <Collapsible open={dayEndOpen} onOpenChange={setDayEndOpen}>
          <section className="mt-4 rounded-2xl border border-line/80 bg-surface-1 p-4 shadow-xs md:mt-6 md:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ink-900">Day-end close</h2>
                <p className="text-[11px] text-ink-500">
                  {dayEndOpen
                    ? "Today's collections by method — match cash drawer and UPI before closing."
                    : outstandingQuery.isLoading
                      ? `Collected ${formatCurrency(data?.revenue ?? 0, currency)}`
                      : outstanding > 0
                        ? `Still ${formatCurrency(outstanding, currency)} due · ${formatCurrency(data?.revenue ?? 0, currency)} collected`
                      : `Collected up · ${formatCurrency(data?.revenue ?? 0, currency)} · ${
                          (data?.paymentCount ?? 0) === 1
                            ? "1 payment"
                            : `${data?.paymentCount ?? 0} payments`
                        }`}
                </p>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl border-line font-semibold"
                >
                  {dayEndOpen ? "Hide" : "Close day"}
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform duration-150",
                      dayEndOpen && "rotate-180",
                    )}
                    aria-hidden
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="overflow-hidden">
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    ["cash", "Cash"],
                    ["upi", "UPI"],
                    ["card", "Card"],
                    ["bank_transfer", "Bank"],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                      {label}
                    </p>
                    <p className="mt-1 text-sm font-bold tabular-nums text-ink-900">
                      {formatCurrency(data?.collectionsByMethod?.[key] ?? 0, currency)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                <p className="text-xs text-ink-500">
                  {(data?.paymentCount ?? 0) === 1
                    ? "1 payment today"
                    : `${data?.paymentCount ?? 0} payments today`}
                  {(data?.collectionsByMethod?.["other"] ?? 0) > 0
                    ? ` · Other ${formatCurrency(data!.collectionsByMethod["other"], currency)}`
                    : ""}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold tabular-nums text-ink-900">
                    Total {formatCurrency(data?.revenue ?? 0, currency)}
                  </p>
                  <Button asChild variant="ghost" size="sm" className="px-2 font-semibold text-primary">
                    <Link to="/billing">Payments</Link>
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </section>
        </Collapsible>
      ) : null}

      <section className="mt-6 min-w-0 overflow-hidden rounded-2xl border border-line/80 bg-surface-1 p-4 shadow-xs sm:mt-8 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-900">Patient Flow</h2>
          <Button asChild variant="ghost" size="sm" className="shrink-0 text-xs font-semibold text-primary hover:text-primary">
            <Link to="/flow">Full board</Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FLOW_STATES.map((state) => (
            <Link
              key={state}
              to="/flow"
              className={cn(
                "min-w-0 rounded-xl border px-2 py-3 text-center transition-colors duration-150",
                state === "waiting" && "border-warning-line bg-warning-surface hover:border-warning-text",
                state === "engage" && "border-info-line bg-info-surface hover:border-info-text",
                state === "done" && "border-success-line bg-success-surface hover:border-success-text",
                state === "schedule" && "border-line bg-surface-2 hover:border-ink-300",
              )}
            >
              <p className="text-lg font-bold tabular-nums text-ink-900 sm:text-xl">
                {appointments.filter((a) => a.flow_status === state).length}
              </p>
              <p className="mt-1 flex justify-center">
                <StatusChip tone={flowStatusTone(state)} className="max-w-full truncate">
                  {FLOW_LABELS[state]}
                </StatusChip>
              </p>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
