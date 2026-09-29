import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { History } from "lucide-react";
import { useMemo, useState } from "react";

import { DateScopeFilter } from "@/components/common/date-scope-filter";
import { StatusChip } from "@/components/common/status-chip";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveStaff } from "@/hooks/use-staff-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { collapseQuickEntryPayments, describeClinicLog } from "@/lib/clinic-log";
import {
  applyTimestampColumnFilter,
  createDateScope,
  resolveDateScope,
  type DateScope,
} from "@/lib/date-scope";
import { getDemoAuditLogs } from "@/lib/demo-data";
import { formatTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/clinic-log")({
  head: () => ({
    meta: [
      { title: "Clinic Log — VSP Software" },
      {
        name: "description",
        content: "View clinic staff activity on patients, billing and appointments.",
      },
    ],
  }),
  component: ClinicLogPage,
});

type AuditLogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  userId: string | null;
  userName: string;
};

function dayKey(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

function dayLabel(iso: string) {
  const date = parseISO(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "d MMM yyyy");
}

function ClinicLogPage() {
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();
  const staffQuery = useActiveStaff();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [dateScope, setDateScope] = useState<DateScope>(() => createDateScope("month"));

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-logs", profile?.clinic_id, entityFilter, dateScope],
    enabled: !!profile?.clinic_id,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AuditLogRow[]> => {
      let query = supabase
        .from("audit_logs")
        .select("id, action, entity_type, entity_id, metadata, created_at, user_id")
        .eq("clinic_id", profile!.clinic_id)
        .order("created_at", { ascending: false })
        .limit(100);

      query = applyTimestampColumnFilter(query, "created_at", dateScope);

      if (entityFilter !== "all") {
        query = query.eq("entity_type", entityFilter);
      }

      const { data: logs, error: lErr } = await query;
      if (lErr) throw lErr;

      return (logs ?? []).map((l) => ({
        id: l.id,
        action: l.action,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        metadata: (l.metadata as Record<string, unknown>) ?? null,
        created_at: l.created_at,
        userId: l.user_id,
        userName: l.user_id && l.user_id === profile!.id ? profile!.name : "Staff",
      }));
    },
  });

  const dateRange = resolveDateScope(dateScope);
  const staffNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const person of staffQuery.data ?? []) names.set(person.id, person.name);
    return names;
  }, [staffQuery.data]);
  const logRows = useMemo(() => {
    let rows = data ?? [];
    if (showDemoData) {
      let demo = getDemoAuditLogs({
        from: dateRange?.start,
        to: dateRange?.end,
      }).map((row) => ({ ...row, userId: null })) as AuditLogRow[];
      if (entityFilter !== "all") {
        demo = demo.filter((r) => r.entity_type === entityFilter);
      }
      rows = [...demo, ...rows];
    }
    rows = collapseQuickEntryPayments(rows);
    rows = [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
    const described = rows.map((row) => {
      const copy = describeClinicLog(row.action, row.metadata);
      const userName = (row.userId && staffNames.get(row.userId)) || row.userName;
      return { ...row, ...copy, userName };
    });
    if (!search.trim()) return described;
    const t = search.trim().toLowerCase();
    return described.filter(
      (row) =>
        row.title.toLowerCase().includes(t) ||
        row.detail.toLowerCase().includes(t) ||
        row.area.toLowerCase().includes(t) ||
        row.userName.toLowerCase().includes(t),
    );
  }, [data, showDemoData, dateRange?.start, dateRange?.end, entityFilter, search, staffNames]);
  const dayGroups = useMemo(() => {
    const groups: { key: string; label: string; rows: typeof logRows }[] = [];
    for (const row of logRows) {
      const key = dayKey(row.created_at);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.rows.push(row);
      else groups.push({ key, label: dayLabel(row.created_at), rows: [row] });
    }
    return groups;
  }, [logRows]);

  return (
    <AppShell>
      <PageHeader
        title="Clinic Log"
        description="A plain record of what the clinic did: who, what, and when."
      />

      <div className="mb-4 flex min-w-0 flex-col gap-2">
        <DateScopeFilter value={dateScope} onChange={setDateScope} />
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger aria-label="Filter by type" className="w-full sm:w-44">
              <SelectValue placeholder="All activity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All activity</SelectItem>
              <SelectItem value="patient">Patients</SelectItem>
              <SelectItem value="appointment">Appointments</SelectItem>
              <SelectItem value="visit">Visits</SelectItem>
              <SelectItem value="invoice">Bills and payments</SelectItem>
              <SelectItem value="follow_up">Follow-ups</SelectItem>
              <SelectItem value="education_materials">Education</SelectItem>
              <SelectItem value="whatsapp_template">WhatsApp</SelectItem>
              <SelectItem value="clinic">Clinic settings</SelectItem>
            </SelectContent>
          </Select>

          <Input
            placeholder="Search patient, bill, or action"
            aria-label="Search clinic log"
            className="min-w-0 flex-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isError ? (
        <ErrorState title="Unable to load clinic log." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingCards count={4} />
      ) : logRows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing recorded in these dates"
          description="Book a visit, take a payment, or complete a follow-up. It will show here in plain words."
        />
      ) : (
        <div className="min-w-0 space-y-4">
          <p className="text-xs text-ink-500">
            {logRows.length} {logRows.length === 1 ? "action" : "actions"}
          </p>
          {dayGroups.map((group) => (
            <section key={group.key} className="min-w-0">
              <h2 className="mb-1.5 px-1 text-xs font-semibold text-ink-500">{group.label}</h2>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-line bg-surface-1">
                {group.rows.map((log, index) => (
                  <div
                    key={log.id}
                    className={`min-w-0 px-4 py-3 ${index > 0 ? "border-t border-line" : ""}`}
                  >
                    <div className="flex min-w-0 items-start justify-between gap-3">
                      <div className="min-w-0">
                        <StatusChip>{log.area}</StatusChip>
                        <p className="mt-1.5 break-words text-sm font-semibold text-ink-900">{log.title}</p>
                      </div>
                      <p className="shrink-0 pt-0.5 text-xs tabular-nums text-ink-500">
                        {formatTime(log.created_at)}
                      </p>
                    </div>
                    <p className="mt-1 break-words text-xs text-ink-500">
                      {log.detail ? <span className="text-ink-700">{log.detail}</span> : null}
                      {log.detail ? " · " : null}
                      by {log.userName}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
