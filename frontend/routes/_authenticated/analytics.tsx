import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  BarChart3,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Globe,
  Percent,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ErrorState, LoadingKpis } from "@/components/common/states";
import { Kpi, type KpiAccent } from "@/components/common/kpi";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { getDemoAnalyticsSource } from "@/lib/demo-data";
import { formatCurrency, todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — VSP Software" },
      {
        name: "description",
        content: "Clinic growth, revenue, treatments and attendance for a selected date range.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const RANGE_OPTIONS = [
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom" },
] as const;

type RangePreset = (typeof RANGE_OPTIONS)[number]["value"];

const CHART_PRIMARY = "var(--chart-1)";

type TreatmentRank = {
  name: string;
  count: number;
  value?: number;
};

function monthBounds(yearMonth: string) {
  const [y, m] = yearMonth.split("-").map(Number);
  const start = `${yearMonth}-01`;
  const lastDay = new Date(y!, m!, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

function resolveRange(
  preset: RangePreset,
  customFrom: string,
  customTo: string,
): { start: string; end: string } {
  const today = todayISO();
  if (preset === "custom") {
    const start = customFrom || today;
    const end = customTo || today;
    return start <= end ? { start, end } : { start: end, end: start };
  }
  if (preset === "last_month") {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return monthBounds(ym);
  }
  if (preset === "this_year") {
    return { start: `${today.slice(0, 4)}-01-01`, end: today };
  }
  return monthBounds(today.slice(0, 7));
}

function previousRange(start: string, end: string) {
  const startMs = new Date(`${start}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  const days = Math.round((endMs - startMs) / 86_400_000) + 1;
  const prevEnd = new Date(startMs);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

function inRange(isoDate: string | null | undefined, start: string, end: string) {
  if (!isoDate) return false;
  const day = isoDate.slice(0, 10);
  return day >= start && day <= end;
}

function pctChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 100);
}

function formatPct(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

function rankTreatmentsByCount(rows: { name: string }[]): {
  top: TreatmentRank[];
  bottom: TreatmentRank[];
  maxCount: number;
} {
  const map = new Map<string, number>();
  rows.forEach((t) => {
    map.set(t.name, (map.get(t.name) ?? 0) + 1);
  });

  const byCount = [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const top = byCount.slice(0, 3);
  const topNames = new Set(top.map((t) => t.name));
  const bottom = byCount
    .filter((t) => !topNames.has(t.name))
    .slice(-3)
    .reverse();

  return {
    top,
    bottom,
    maxCount: top[0]?.count ?? 1,
  };
}

function rankTreatmentsByValue(rows: { name: string; cost: number }[]): {
  top: TreatmentRank[];
  maxValue: number;
} {
  const map = new Map<string, { count: number; value: number }>();
  rows.forEach((t) => {
    const current = map.get(t.name) ?? { count: 0, value: 0 };
    current.count += 1;
    current.value += Number(t.cost) || 0;
    map.set(t.name, current);
  });

  const byValue = [...map.entries()]
    .map(([name, stats]) => ({ name, count: stats.count, value: stats.value }))
    .sort((a, b) => b.value - a.value || b.count - a.count);

  const top = byValue.slice(0, 3);
  return {
    top,
    maxValue: top[0]?.value ?? 1,
  };
}

function daysBetween(fromIso: string, toIso: string) {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00`).getTime();
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00`).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

function buildArAging(
  invoices: { balance_amount: number; invoice_date: string }[],
  today: string,
) {
  const buckets = {
    d0_30: 0,
    d31_60: 0,
    d60_plus: 0,
  };
  invoices.forEach((inv) => {
    const balance = Number(inv.balance_amount) || 0;
    if (balance <= 0 || !inv.invoice_date) return;
    const age = daysBetween(inv.invoice_date, today);
    if (age <= 30) buckets.d0_30 += balance;
    else if (age <= 60) buckets.d31_60 += balance;
    else buckets.d60_plus += balance;
  });
  const total = buckets.d0_30 + buckets.d31_60 + buckets.d60_plus;
  return { ...buckets, total };
}

function countComingPatients(
  patientById: Map<string, { id: string; created_at: string }>,
  activeIds: Set<string>,
  rangeStart: string,
  rangeEnd: string,
) {
  let newComing = 0;
  let oldComing = 0;
  activeIds.forEach((id) => {
    const patient = patientById.get(id);
    if (!patient) return;
    if (inRange(patient.created_at, rangeStart, rangeEnd)) newComing += 1;
    else if (patient.created_at.slice(0, 10) < rangeStart) oldComing += 1;
  });
  return { newComing, oldComing, totalComing: newComing + oldComing };
}

function dayShift(isoDay: string, days: number): string {
  const d = new Date(`${isoDay.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const PATIENT_ID_CHUNK = 200;

async function fetchPatientsByIds(
  clinicId: string,
  ids: string[],
): Promise<{ id: string; created_at: string }[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows: { id: string; created_at: string }[] = [];
  for (let i = 0; i < unique.length; i += PATIENT_ID_CHUNK) {
    const slice = unique.slice(i, i + PATIENT_ID_CHUNK);
    const { data, error } = await supabase
      .from("patients")
      .select("id, created_at")
      .eq("clinic_id", clinicId)
      .in("id", slice);
    if (error) throw error;
    rows.push(...(data ?? []));
  }
  return rows;
}

function AnalyticsPage() {
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();
  const currency = profile?.clinic?.currency ?? "INR";
  const [rangePreset, setRangePreset] = useState<RangePreset>("this_month");
  const [moreNumbersOpen, setMoreNumbersOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => `${todayISO().slice(0, 7)}-01`);
  const [customTo, setCustomTo] = useState(todayISO);

  const range = useMemo(
    () => resolveRange(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo],
  );
  const prior = useMemo(
    () => previousRange(range.start, range.end),
    [range.start, range.end],
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics", profile?.clinic_id, range.start, range.end, showDemoData],
    enabled: !!profile?.clinic_id,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const clinicId = profile!.clinic_id;
      const { start, end } = range;
      const today = todayISO();
      const spanStart = prior.start <= start ? prior.start : start;
      const spanEnd = end;
      const onlineFrom = `${start}T00:00:00`;
      const onlineTo = `${end}T23:59:59.999`;

      const [
        payments,
        priorPayments,
        openInvoices,
        billedInvoices,
        treatments,
        appts,
        followUps,
        onlineReqs,
      ] = await Promise.all([
        supabase
          .from("payments")
          .select("amount, payment_date")
          .eq("clinic_id", clinicId)
          .gte("payment_date", start)
          .lte("payment_date", end),
        supabase
          .from("payments")
          .select("amount, payment_date")
          .eq("clinic_id", clinicId)
          .gte("payment_date", prior.start)
          .lte("payment_date", prior.end),
        supabase
          .from("invoices")
          .select("balance_amount, invoice_date")
          .eq("clinic_id", clinicId)
          .gt("balance_amount", 0),
        supabase
          .from("invoices")
          .select("grand_total, invoice_date")
          .eq("clinic_id", clinicId)
          .gte("invoice_date", start)
          .lte("invoice_date", end),
        supabase
          .from("treatments")
          .select("name, cost, treatment_date, patient_id")
          .eq("clinic_id", clinicId)
          .gte("treatment_date", spanStart)
          .lte("treatment_date", spanEnd),
        supabase
          .from("appointments")
          .select("appointment_status, flow_status, appointment_date, patient_id")
          .eq("clinic_id", clinicId)
          .gte("appointment_date", spanStart)
          .lte("appointment_date", spanEnd),
        supabase
          .from("follow_ups")
          .select("due_date, status")
          .eq("clinic_id", clinicId)
          .gte("due_date", start)
          .lte("due_date", end),
        supabase
          .from("online_appointment_requests")
          .select("created_at, status")
          .eq("clinic_id", clinicId)
          .gte("created_at", onlineFrom)
          .lte("created_at", onlineTo),
      ]);

      if (payments.error) throw payments.error;
      if (priorPayments.error) throw priorPayments.error;
      if (openInvoices.error) throw openInvoices.error;
      if (billedInvoices.error) throw billedInvoices.error;
      if (treatments.error) throw treatments.error;
      if (appts.error) throw appts.error;
      if (followUps.error) throw followUps.error;
      if (onlineReqs.error) throw onlineReqs.error;

      let paymentRows = payments.data ?? [];
      let priorPaymentRows = priorPayments.data ?? [];
      let invoiceRows = openInvoices.data ?? [];
      let billedInvoiceRows = billedInvoices.data ?? [];
      let treatmentAll = treatments.data ?? [];
      let apptAll = appts.data ?? [];
      let followAll = followUps.data ?? [];
      let onlineAll = onlineReqs.data ?? [];

      const patientIdSet = new Set<string>();
      for (const row of apptAll) {
        if (row.patient_id) patientIdSet.add(row.patient_id);
      }
      for (const row of treatmentAll) {
        if (row.patient_id) patientIdSet.add(row.patient_id);
      }
      let patientRows = await fetchPatientsByIds(clinicId, [...patientIdSet]);

      if (showDemoData) {
        const demo = getDemoAnalyticsSource();
        paymentRows = [...demo.payments, ...paymentRows];
        priorPaymentRows = [
          ...demo.payments.map((p) => ({
            ...p,
            payment_date: dayShift(p.payment_date, -30),
          })),
          ...priorPaymentRows,
        ];
        invoiceRows = [
          ...demo.invoices.filter((i) => Number(i.balance_amount) > 0),
          ...invoiceRows,
        ];
        billedInvoiceRows = [
          ...demo.invoices.filter((i) => inRange(i.invoice_date, start, end)),
          ...billedInvoiceRows,
        ];
        patientRows = [...demo.patients, ...patientRows];
        treatmentAll = [...demo.treatments, ...treatmentAll];
        apptAll = [...demo.appointments, ...apptAll];
        followAll = [...demo.followUps, ...followAll];
        onlineAll = [
          ...(demo.onlineReqs as typeof onlineAll),
          ...onlineAll,
        ];
      }

      const treatmentRows = treatmentAll.filter((t) =>
        inRange(t.treatment_date, start, end),
      );
      const apptRows = apptAll.filter((a) =>
        inRange(a.appointment_date, start, end),
      );
      const followRows = followAll.filter((f) => inRange(f.due_date, start, end));
      const onlineRows = onlineAll.filter((r) =>
        inRange(r.created_at, start, end),
      );

      const patientById = new Map(patientRows.map((p) => [p.id, p]));

      const activePatientIds = new Set<string>();
      apptRows.forEach((a) => {
        if (a.patient_id) activePatientIds.add(a.patient_id);
      });
      treatmentRows.forEach((t) => {
        if (t.patient_id) activePatientIds.add(t.patient_id);
      });

      const priorApptRows = apptAll.filter((a) =>
        inRange(a.appointment_date, prior.start, prior.end),
      );
      const priorTreatmentRows = treatmentAll.filter((t) =>
        inRange(t.treatment_date, prior.start, prior.end),
      );
      const priorActiveIds = new Set<string>();
      priorApptRows.forEach((a) => {
        if (a.patient_id) priorActiveIds.add(a.patient_id);
      });
      priorTreatmentRows.forEach((t) => {
        if (t.patient_id) priorActiveIds.add(t.patient_id);
      });

      const coming = countComingPatients(patientById, activePatientIds, start, end);
      const priorComing = countComingPatients(
        patientById,
        priorActiveIds,
        prior.start,
        prior.end,
      );

      const spanDays =
        (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24) + 1;
      const useDaily = spanDays <= 45;

      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const bucket: Record<string, number> = {};

      if (useDaily) {
        const cursor = new Date(`${start}T00:00:00`);
        const last = new Date(`${end}T00:00:00`);
        while (cursor <= last) {
          const key = cursor.toISOString().slice(0, 10);
          bucket[key] = 0;
          cursor.setDate(cursor.getDate() + 1);
        }
        paymentRows.forEach((p) => {
          const key = p.payment_date.slice(0, 10);
          if (key in bucket) bucket[key] = (bucket[key] ?? 0) + Number(p.amount);
        });
      } else {
        months.forEach((m) => {
          bucket[m] = 0;
        });
        paymentRows.forEach((p) => {
          const mIdx = new Date(p.payment_date).getMonth();
          const mName = months[mIdx] ?? "Jan";
          bucket[mName] = (bucket[mName] ?? 0) + Number(p.amount);
        });
      }

      const revenueTrend = Object.entries(bucket).map(([label, revenue]) => ({
        label: useDaily ? label.slice(8) : label,
        revenue,
      }));

      const revenueCollected = paymentRows.reduce((s, p) => s + Number(p.amount), 0);
      const priorRevenue = priorPaymentRows.reduce((s, p) => s + Number(p.amount), 0);
      const totalOutstanding = invoiceRows.reduce((s, i) => s + Number(i.balance_amount), 0);
      const billedInRange = billedInvoiceRows.reduce(
        (s, i) => s + Number(i.grand_total),
        0,
      );
      const collectionRate =
        billedInRange > 0 ? (revenueCollected / billedInRange) * 100 : null;

      const treatmentRanks = rankTreatmentsByCount(treatmentRows);
      const treatmentValueRanks = rankTreatmentsByValue(treatmentRows);
      const arAging = buildArAging(invoiceRows, today);

      const noShowCount = apptRows.filter((a) => a.appointment_status === "no_show").length;
      const cancelCount = apptRows.filter((a) => a.appointment_status === "cancelled").length;
      const keptDenom = apptRows.length - cancelCount;
      const noShowRate = keptDenom > 0 ? (noShowCount / keptDenom) * 100 : null;
      const cancelRate =
        apptRows.length > 0 ? (cancelCount / apptRows.length) * 100 : null;

      const followDone = followRows.filter((f) => f.status === "completed").length;
      const followOverdue = followRows.filter(
        (f) =>
          f.status === "overdue" ||
          ((f.status === "pending" || f.status === "scheduled") && f.due_date < today),
      ).length;
      const followOpen = followRows.filter(
        (f) => f.status === "pending" || f.status === "scheduled",
      ).length;
      const followCompletionRate =
        followRows.length > 0 ? (followDone / followRows.length) * 100 : null;

      const onlineConfirmed = onlineRows.filter((r) => r.status === "confirmed").length;
      const onlineConfirmRate =
        onlineRows.length > 0 ? (onlineConfirmed / onlineRows.length) * 100 : null;

      return {
        revenueTrend,
        useDaily,
        revenueCollected,
        priorRevenue,
        revenueChange: pctChange(revenueCollected, priorRevenue),
        billedInRange,
        collectionRate,
        totalOutstanding,
        patientsComing: coming.totalComing,
        newComing: coming.newComing,
        oldComing: coming.oldComing,
        priorPatientsComing: priorComing.totalComing,
        patientsComingChange: pctChange(coming.totalComing, priorComing.totalComing),
        newComingShare:
          coming.totalComing > 0 ? (coming.newComing / coming.totalComing) * 100 : null,
        oldComingShare:
          coming.totalComing > 0 ? (coming.oldComing / coming.totalComing) * 100 : null,
        treatmentRanks,
        treatmentValueRanks,
        arAging,
        totalAppointments: apptRows.length,
        noShowCount,
        cancelCount,
        noShowRate,
        cancelRate,
        followDue: followRows.length,
        followDone,
        followOverdue,
        followOpen,
        followCompletionRate,
        onlineRequests: onlineRows.length,
        onlineConfirmed,
        onlineConfirmRate,
        priorLabel: `${prior.start} → ${prior.end}`,
      };
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="Analytics"
        description={`${range.start} → ${range.end}`}
      />

      <div className="mb-5 space-y-3 rounded-2xl border border-line/80 bg-surface-1 p-3 shadow-xs sm:p-4">
        <div
          className="flex overflow-hidden rounded-xl border border-line"
          role="tablist"
          aria-label="Date range"
        >
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={rangePreset === option.value}
              className={cn(
                "h-10 min-w-0 flex-1 px-1.5 text-[11px] font-semibold transition-colors sm:h-9 sm:text-xs",
                rangePreset === option.value
                  ? "bg-primary text-white"
                  : "bg-surface-1 text-ink-500 hover:bg-surface-2",
              )}
              onClick={() => setRangePreset(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {rangePreset === "custom" ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="analytics-from">From</Label>
              <Input
                id="analytics-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value || todayISO())}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="analytics-to">To</Label>
              <Input
                id="analytics-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value || todayISO())}
              />
            </div>
          </div>
        ) : null}
      </div>

      {isError ? (
        <ErrorState title="Unable to load analytics." onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <LoadingKpis count={4} />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Revenue collected"
              value={formatCurrency(data.revenueCollected, currency)}
              icon={CircleDollarSign}
              accent="revenue"
              hint={
                <ChangeHint
                  change={data.revenueChange}
                  label={`vs prior (${formatCurrency(data.priorRevenue, currency)})`}
                />
              }
            />
            <KpiCard
              label="Due"
              value={formatCurrency(data.totalOutstanding, currency)}
              icon={Wallet}
              accent="balance"
              tone={data.totalOutstanding > 0 ? "danger" : "success"}
            />
            <KpiCard
              label="No-show rate"
              value={formatPct(data.noShowRate)}
              icon={BarChart3}
              accent="followups"
              tone={
                data.noShowRate != null && data.noShowRate >= 15
                  ? "danger"
                  : data.noShowRate != null && data.noShowRate >= 8
                    ? "warning"
                    : undefined
              }
              hint={
                <span className="text-[11px] text-ink-500">
                  {data.noShowCount} of {data.totalAppointments - data.cancelCount} kept slots
                </span>
              }
            />
            <KpiCard
              label="New patients"
              value={data.newComing}
              icon={Users}
              accent="patients"
              hint={
                <span className="text-[11px] text-ink-500">
                  {data.patientsComing} visits in range
                </span>
              }
            />
          </div>
          <Collapsible open={moreNumbersOpen} onOpenChange={setMoreNumbersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl font-semibold">
                {moreNumbersOpen ? "Hide extra numbers" : "More numbers"}
                <ChevronDown
                  className={cn("size-3.5 transition-transform", moreNumbersOpen && "rotate-180")}
                  aria-hidden
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard
              label="Collection rate"
              value={formatPct(data.collectionRate)}
              icon={Percent}
              accent="growth"
              hint={
                <span className="text-[11px] text-ink-500">
                  Invoiced {formatCurrency(data.billedInRange, currency)}
                </span>
              }
            />
            <KpiCard
              label="Cancel rate"
              value={formatPct(data.cancelRate)}
              icon={Ban}
              accent="balance"
              tone={
                data.cancelRate != null && data.cancelRate >= 20
                  ? "danger"
                  : data.cancelRate != null && data.cancelRate >= 10
                    ? "warning"
                    : undefined
              }
              hint={
                <span className="text-[11px] text-ink-500">
                  {data.cancelCount} cancelled · {data.totalAppointments} booked
                </span>
              }
            />
            <KpiCard
              label="Follow-up completion"
              value={formatPct(data.followCompletionRate)}
              icon={ClipboardCheck}
              accent="clinic"
              tone={
                data.followCompletionRate != null && data.followCompletionRate < 40
                  ? "danger"
                  : data.followCompletionRate != null && data.followCompletionRate < 70
                    ? "warning"
                    : data.followCompletionRate != null
                      ? "success"
                      : undefined
              }
              hint={
                <span className="text-[11px] text-ink-500">
                  {data.followDone} done · {data.followOverdue} late · {data.followDue} due in
                  range
                </span>
              }
            />
            <KpiCard
              label="Online confirmed"
              value={formatPct(data.onlineConfirmRate)}
              icon={Globe}
              accent="patients"
              tone={
                data.onlineConfirmRate != null && data.onlineConfirmRate < 40
                  ? "warning"
                  : undefined
              }
              hint={
                <span className="text-[11px] text-ink-500">
                  {data.onlineConfirmed} of {data.onlineRequests} requests
                </span>
              }
            />
            <KpiCard
              label="Late Follow-ups"
              value={data.followOverdue}
              icon={ClipboardList}
              accent="followups"
              tone={data.followOverdue > 0 ? "danger" : "success"}
              hint={
                <span className="text-[11px] text-ink-500">
                  {data.followOpen} still open in range
                </span>
              }
            />
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="surface-card space-y-4 p-3 sm:p-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Balance due by age</h3>
              <p className="mt-0.5 text-[11px] text-ink-500">
                Unpaid invoice balances right now, grouped by how old the bill is.
              </p>
            </div>
            {data.arAging.total <= 0 ? (
              <p className="py-6 text-center text-xs text-ink-500">No balance due.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-lg font-bold tabular-nums text-ink-900 sm:text-xl">
                  {formatCurrency(data.arAging.total, currency)}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {[
                    { label: "0–30 days", amount: data.arAging.d0_30 },
                    { label: "31–60 days", amount: data.arAging.d31_60 },
                    { label: "60+ days", amount: data.arAging.d60_plus },
                  ].map((bucket) => {
                    const share =
                      data.arAging.total > 0
                        ? Math.round((bucket.amount / data.arAging.total) * 100)
                        : 0;
                    return (
                      <div
                        key={bucket.label}
                        className="rounded-xl border border-line/80 bg-surface-2/40 p-3"
                      >
                        <p className="text-[11px] font-medium text-ink-500">{bucket.label}</p>
                        <p className="mt-1 text-sm font-semibold tabular-nums text-ink-900">
                          {formatCurrency(bucket.amount, currency)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-ink-500">{share}%</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${data.arAging.total ? (data.arAging.d0_30 / data.arAging.total) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className="h-full bg-ink-500"
                    style={{
                      width: `${data.arAging.total ? (data.arAging.d31_60 / data.arAging.total) * 100 : 0}%`,
                    }}
                  />
                  <div
                    className="h-full bg-ink-300"
                    style={{
                      width: `${data.arAging.total ? (data.arAging.d60_plus / data.arAging.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="surface-card space-y-4 p-3 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                  <Users className="size-4 text-primary" aria-hidden />
                  Patients who came
                </h3>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  Unique patients with an appointment or treatment in this range.
                </p>
              </div>
              <ChangeHint
                change={data.patientsComingChange}
                label={`vs prior (${data.priorPatientsComing})`}
              />
            </div>

            <p className="text-lg font-bold tabular-nums text-ink-900 sm:text-xl md:text-2xl">
              {data.patientsComing}
              <span className="ml-2 text-sm font-medium text-ink-500">total</span>
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line/80 bg-surface-2/40 p-3.5">
                <p className="text-xs font-medium text-ink-500">New patients who came</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-ink-900 sm:text-xl">
                  {data.newComing}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  {formatPct(data.newComingShare)} of patients who came · registered in this
                  range
                </p>
              </div>
              <div className="rounded-xl border border-line/80 bg-surface-2/40 p-3.5">
                <p className="text-xs font-medium text-ink-500">Old patients who came</p>
                <p className="mt-1 text-lg font-bold tabular-nums text-ink-900 sm:text-xl">
                  {data.oldComing}
                </p>
                <p className="mt-0.5 text-[11px] text-ink-500">
                  {formatPct(data.oldComingShare)} of patients who came · registered earlier
                </p>
              </div>
            </div>

            {data.patientsComing > 0 ? (
              <div className="space-y-1.5">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${data.newComingShare ?? 0}%` }}
                    title="New"
                  />
                  <div
                    className="h-full bg-ink-300"
                    style={{ width: `${data.oldComingShare ?? 0}%` }}
                    title="Old"
                  />
                </div>
                <div className="flex justify-between text-[11px] text-ink-500">
                  <span>New {data.newComing}</span>
                  <span>Old {data.oldComing}</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="surface-card space-y-4 p-3 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
                <TrendingUp className="size-4 text-primary" aria-hidden />
                Revenue {data.useDaily ? "by day" : "by month"}
              </h3>
              <p className="text-[11px] text-ink-500">Prior period: {data.priorLabel}</p>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueTrend}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" fontSize={11} stroke="var(--ink-300)" />
                  <YAxis
                    fontSize={11}
                    stroke="var(--ink-300)"
                    tickFormatter={(v) => `₹${v}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value, currency), "Revenue"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={CHART_PRIMARY}
                    fillOpacity={1}
                    fill="url(#colorRev)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface-card space-y-4 p-3 sm:p-5">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Treatments</h3>
              <p className="mt-0.5 text-[11px] text-ink-500">
                By how often done, and by total treatment value in this date range.
              </p>
            </div>

            {data.treatmentRanks.top.length === 0 ? (
              <p className="py-8 text-center text-xs text-ink-500">
                No treatments in this date range.
              </p>
            ) : (
              <div className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2 md:gap-8">
                  <TreatmentCountList
                    title="Top 3"
                    subtitle="Most done"
                    rows={data.treatmentRanks.top}
                    maxCount={data.treatmentRanks.maxCount}
                    tone="high"
                  />
                  <TreatmentCountList
                    title="Bottom 3"
                    subtitle="Least done"
                    rows={data.treatmentRanks.bottom}
                    maxCount={data.treatmentRanks.maxCount}
                    tone="low"
                    empty="Need more than 3 treatment types to show a bottom list."
                  />
                </div>
                <TreatmentValueList
                  title="Top 3 by value"
                  subtitle="Highest total treatment cost"
                  rows={data.treatmentValueRanks.top}
                  maxValue={data.treatmentValueRanks.maxValue}
                  currency={currency}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}

function ChangeHint({ change, label }: { change: number; label: string }) {
  const up = change > 0;
  const flat = change === 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px]",
        flat ? "text-ink-500" : up ? "text-ink-700" : "text-ink-500",
      )}
    >
      {!flat ? <Icon className="size-3.5" aria-hidden /> : null}
      {flat ? "Same" : `${up ? "+" : ""}${change}%`} {label}
    </span>
  );
}

function TreatmentCountList({
  title,
  subtitle,
  rows,
  maxCount,
  tone,
  empty,
}: {
  title: string;
  subtitle: string;
  rows: TreatmentRank[];
  maxCount: number;
  tone: "high" | "low";
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <div>
        <div className="mb-3">
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <p className="text-[11px] text-ink-500">{subtitle}</p>
        </div>
        <p className="text-xs text-ink-500">{empty ?? "Nothing to show."}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="text-[11px] text-ink-500">{subtitle}</p>
      </div>
      <ul className="space-y-3">
        {rows.map((row, index) => {
          const width = Math.max(8, Math.round((row.count / Math.max(maxCount, 1)) * 100));
          return (
            <li key={`${title}-${row.name}`} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-ink-900">
                  <span className="mr-1.5 tabular-nums text-ink-500">{index + 1}</span>
                  {row.name}
                </p>
                <p className="shrink-0 text-xs font-semibold tabular-nums text-ink-700">
                  {row.count}×
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    "h-full rounded-full",
                    tone === "high" ? "bg-primary" : "bg-ink-300",
                  )}
                  style={{ width: `${width}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TreatmentValueList({
  title,
  subtitle,
  rows,
  maxValue,
  currency,
}: {
  title: string;
  subtitle: string;
  rows: TreatmentRank[];
  maxValue: number;
  currency: string;
}) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-line/80 bg-surface-2/40 p-3.5 sm:p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-ink-900">{title}</p>
        <p className="text-[11px] text-ink-500">{subtitle}</p>
      </div>
      <ul className="space-y-3">
        {rows.map((row, index) => {
          const value = row.value ?? 0;
          const width = Math.max(8, Math.round((value / Math.max(maxValue, 1)) * 100));
          return (
            <li key={`${title}-${row.name}`} className="min-w-0">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-ink-900">
                  <span className="mr-1.5 tabular-nums text-ink-500">{index + 1}</span>
                  {row.name}
                </p>
                <p className="shrink-0 text-xs font-semibold tabular-nums text-ink-700">
                  {formatCurrency(value, currency)}
                  <span className="ml-1.5 font-normal text-ink-500">{row.count}×</span>
                </p>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
                <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  hint,
  tone,
  accent,
}: {
  label: string;
  value: string | number;
  icon: typeof Users;
  hint?: ReactNode;
  tone?: "danger" | "warning" | "success" | undefined;
  accent: KpiAccent;
}) {
  return (
    <Kpi
      label={label}
      value={value}
      icon={icon}
      accent={accent}
      tone={tone}
      hint={hint}
      showToneChip={!!tone}
    />
  );
}
