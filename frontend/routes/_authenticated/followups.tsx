import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowUpAZ,
  Calendar as CalendarIcon,
  CheckCircle,
  ChevronDown,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DateScopeFilter } from "@/components/common/date-scope-filter";
import { PatientLine } from "@/components/common/patient-line";
import { PatientPicker } from "@/components/patients/patient-picker";
import { RowActions } from "@/components/common/row-actions";
import {
  StatusChip,
  followUpStatusLabel,
  followUpStatusTone,
} from "@/components/common/status-chip";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { applyDateColumnFilter } from "@/lib/date-scope";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { FollowUpRow } from "@backend/models/followup";
import { useProfile } from "@/hooks/use-session";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { usePatientSearch } from "@/hooks/use-patients-query";
import { friendlyError } from "@/lib/audit";
import { createDateScope, resolveDateScope, type DateScope } from "@/lib/date-scope";
import { getDemoFollowUps, isDemoId } from "@/lib/demo-data";
import { splitPreviousDue } from "@/lib/followup-previous-date";
import { formatDate, formatDayMonth, todayISO, whatsappLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fetchFollowUpsList } from "@/lib/followups-list-query";
import {
  completeFollowUp as completeFollowUpRequest,
  createFollowUp as createFollowUpRequest,
  rescheduleFollowUp as rescheduleFollowUpRequest,
} from "@/services/followups";

type ViewFilter = "late" | "due" | "upcoming" | "done";

const VIEW_OPTIONS = [
  { value: "late", label: "Late" },
  { value: "due", label: "Due" },
  { value: "upcoming", label: "Upcoming" },
  { value: "done", label: "Done" },
] as const;

const SORT_OPTIONS = [
  { value: "asc", label: "Earliest first" },
  { value: "desc", label: "Latest first" },
] as const;

export const Route = createFileRoute("/_authenticated/followups")({
  head: () => ({
    meta: [
      { title: "Follow-Ups — VSP Software" },
      {
        name: "description",
        content: "Manage patient recall, post-treatment care follow-ups and due reminders.",
      },
    ],
  }),
  component: FollowUpsPage,
});

type PatientOption = {
  id: string;
  full_name: string;
  patient_code: string;
  phone: string;
};

function followUpMatchesSearch(row: FollowUpRow, term: string) {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return (
    row.reason.toLowerCase().includes(t) ||
    (splitPreviousDue(row.notes).notes.toLowerCase().includes(t) ?? false) ||
    (row.patients?.full_name.toLowerCase().includes(t) ?? false) ||
    (row.patients?.patient_code.toLowerCase().includes(t) ?? false) ||
    (row.patients?.phone.toLowerCase().includes(t) ?? false)
  );
}

function useDebounced<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function FollowUpsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();

  const [viewFilter, setViewFilter] = useState<ViewFilter>("late");
  const [dateScope, setDateScope] = useState<DateScope>(() => createDateScope("all"));
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchDebounced = useDebounced(search);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedFollowUp, setSelectedFollowUp] = useState<FollowUpRow | null>(null);
  const [newDueDate, setNewDueDate] = useState(todayISO());

  const [createOpen, setCreateOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [createReason, setCreateReason] = useState("");
  const [createDueDate, setCreateDueDate] = useState(todayISO());
  const [createNotes, setCreateNotes] = useState("");

  const patientsQuery = usePatientSearch(patientSearch, profile?.clinic_id, createOpen);

  const countsQuery = useQuery({
    queryKey: ["followups-counts", profile?.clinic_id, dateScope],
    enabled: !!profile?.clinic_id,
    staleTime: 30_000,
    queryFn: async () => {
      const clinicId = profile!.clinic_id;
      const today = todayISO();

      const base = () =>
        applyDateColumnFilter(
          supabase
            .from("follow_ups")
            .select("id", { count: "exact", head: true })
            .eq("clinic_id", clinicId),
          "due_date",
          dateScope,
        );

      const [late, due, upcoming, done] = await Promise.all([
        base().neq("status", "completed").lt("due_date", today),
        base().neq("status", "completed").eq("due_date", today),
        base().in("status", ["pending", "scheduled"]).gt("due_date", today),
        base().eq("status", "completed"),
      ]);

      if (late.error) throw late.error;
      if (due.error) throw due.error;
      if (upcoming.error) throw upcoming.error;
      if (done.error) throw done.error;

      return {
        late: late.count ?? 0,
        due: due.count ?? 0,
        upcoming: upcoming.count ?? 0,
        done: done.count ?? 0,
      };
    },
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["followups", viewFilter, dateScope, sortOrder],
    enabled: !!profile?.clinic_id,
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchFollowUpsList({
        clinicId: profile!.clinic_id,
        viewFilter,
        dateScope,
        sortOrder,
        today: todayISO(),
      }),
  });

  const markCompleted = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoId(id)) {
        throw new Error(
          "Dummy rows are preview only — turn off Show dummy data to change real follow-ups.",
        );
      }
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");
      await completeFollowUpRequest({ id, clinicId: profile.clinic_id });
    },
    onSuccess: () => {
      toast.success("Follow-up marked as completed.");
      void qc.invalidateQueries({ queryKey: ["followups"] });
      void qc.invalidateQueries({ queryKey: ["followups-counts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["overdue-followups-count"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to complete follow-up.")),
  });

  const reschedule = useMutation({
    mutationFn: async () => {
      if (!selectedFollowUp) return;
      await rescheduleFollowUpRequest({ id: selectedFollowUp.id, dueDate: newDueDate });
    },
    onSuccess: () => {
      toast.success("Follow-up rescheduled.");
      void qc.invalidateQueries({ queryKey: ["followups"] });
      void qc.invalidateQueries({ queryKey: ["followups-counts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["overdue-followups-count"] });
      setRescheduleOpen(false);
      setSelectedFollowUp(null);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to reschedule.")),
  });

  function resetCreateForm() {
    setSelectedPatient(null);
    setPatientSearch("");
    setCreateReason("");
    setCreateDueDate(todayISO());
    setCreateNotes("");
  }

  const createFollowUp = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("Select a patient.");
      if (!createReason.trim()) throw new Error("Enter follow-up reason.");
      if (!createDueDate) throw new Error("Select a due date.");
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");

      await createFollowUpRequest({
        clinicId: profile.clinic_id,
        patientId: selectedPatient.id,
        patientName: selectedPatient.full_name,
        reason: createReason.trim(),
        dueDate: createDueDate,
        notes: createNotes.trim(),
      });
    },
    onSuccess: () => {
      toast.success("Follow-up scheduled.");
      void qc.invalidateQueries({ queryKey: ["followups"] });
      void qc.invalidateQueries({ queryKey: ["followups-counts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["overdue-followups-count"] });
      setCreateOpen(false);
      resetCreateForm();
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to save follow-up.")),
  });

  function isOverdue(dateStr: string, status: string) {
    return status !== "completed" && dateStr < todayISO();
  }

  const moreFiltersActive = dateScope.mode !== "all" || sortOrder !== "asc";

  const dateRange = resolveDateScope(dateScope);
  const followUpRows = useMemo(() => {
    const real = (data ?? []).filter((row) => followUpMatchesSearch(row, searchDebounced));
    if (!showDemoData) return real;
    const today = todayISO();
    let demo = getDemoFollowUps({
      from: dateRange?.start,
      to: dateRange?.end,
    }) as FollowUpRow[];
    if (viewFilter === "late") {
      demo = demo.filter((d) => d.status !== "completed" && d.due_date < today);
    } else if (viewFilter === "due") {
      demo = demo.filter((d) => d.status !== "completed" && d.due_date === today);
    } else if (viewFilter === "upcoming") {
      demo = demo.filter(
        (d) => (d.status === "pending" || d.status === "scheduled") && d.due_date > today,
      );
    } else {
      demo = demo.filter((d) => d.status === "completed");
    }
    demo = demo.filter((row) => followUpMatchesSearch(row, searchDebounced));
    return [...demo, ...real];
  }, [data, showDemoData, dateRange?.start, dateRange?.end, viewFilter, searchDebounced]);

  return (
    <AppShell>
      <PageHeader
        title="Follow-Ups & Recalls"
        description="Track post-op checks, hygiene recall and due patient reminders."
        action={
          <Button
            className="w-full sm:w-auto"
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            Add Follow-up
          </Button>
        }
      />

      <div className="mb-5 space-y-3 rounded-2xl border border-line/80 bg-surface-1 p-3 shadow-xs sm:p-4">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="flex min-w-0 flex-1 overflow-hidden rounded-xl border border-line"
            role="tablist"
            aria-label="Follow-up view"
          >
            {VIEW_OPTIONS.map((option) => {
              const selected = viewFilter === option.value;
              const count = countsQuery.data?.[option.value];
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={cn(
                    "h-10 min-w-0 flex-1 px-1.5 text-[11px] font-semibold transition-colors sm:h-9 sm:px-2 sm:text-xs",
                    selected &&
                      option.value === "late" &&
                      "bg-danger-surface text-danger-text ring-1 ring-inset ring-danger-line",
                    selected &&
                      option.value === "due" &&
                      "bg-warning-surface text-warning-text ring-1 ring-inset ring-warning-line",
                    selected &&
                      option.value === "upcoming" &&
                      "bg-info-surface text-info-text ring-1 ring-inset ring-info-line",
                    selected &&
                      option.value === "done" &&
                      "bg-success-surface text-success-text ring-1 ring-inset ring-success-line",
                    !selected && "bg-surface-1 text-ink-500 hover:bg-surface-2",
                  )}
                  onClick={() => setViewFilter(option.value)}
                >
                  {option.label}
                  {typeof count === "number" ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>
          <div className="min-w-0 flex-1 sm:max-w-xs">
            <Input
              placeholder="Search"
              aria-label="Search follow-ups"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-700"
          aria-expanded={moreFiltersOpen}
          onClick={() => setMoreFiltersOpen((open) => !open)}
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", moreFiltersOpen && "rotate-180")}
            aria-hidden
          />
          More filters
          {moreFiltersActive ? (
            <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-500">
              On
            </span>
          ) : null}
        </button>

        {moreFiltersOpen ? (
          <div className="flex min-w-0 flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="w-full space-y-1.5 sm:w-auto sm:flex-1">
              <Label>Date</Label>
              <DateScopeFilter value={dateScope} onChange={setDateScope} />
            </div>

            <div className="w-full space-y-1.5 sm:w-auto">
              <Label htmlFor="followup-sort">Sort by date</Label>
              <Select
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as "asc" | "desc")}
              >
                <SelectTrigger id="followup-sort" className="w-full sm:w-44">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {option.value === "asc" ? (
                          <ArrowUpAZ className="size-3.5 text-ink-300" aria-hidden />
                        ) : (
                          <ArrowDownAZ className="size-3.5 text-ink-300" aria-hidden />
                        )}
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : null}
      </div>

      {isError ? (
        <ErrorState title="Unable to load follow-ups." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingCards count={4} />
      ) : followUpRows.length === 0 ? (
        <EmptyState
          icon={AlertCircle}
          title="No follow-ups found"
          description={
            viewFilter === "late"
              ? "No late follow-ups — nothing past its due date."
              : viewFilter === "due"
                ? "Nothing due today."
                : viewFilter === "upcoming"
                  ? "No upcoming follow-ups."
                  : "No completed follow-ups match your filters."
          }
          action={
            <Button
              className="rounded-xl"
              onClick={() => {
                resetCreateForm();
                setCreateOpen(true);
              }}
            >
              <Plus className="mr-1 size-4" aria-hidden />
              Add Follow-up
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {followUpRows.map((item) => {
            const overdue = isOverdue(item.due_date, item.status);
            const name = item.patients?.full_name ?? "Unknown patient";
            const statusLabel = followUpStatusLabel({ status: item.status, overdue });
            const statusTone = followUpStatusTone({ status: item.status, overdue });
            const previous = splitPreviousDue(item.notes);
            const metaParts = [item.reason, previous.notes].filter(Boolean);

            return (
              <div
                key={item.id}
                className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface-1 px-2.5 sm:px-3 transition-colors duration-150 hover:bg-surface-2/70"
              >
                <PatientLine
                  name={name}
                  patientId={isDemoId(item.patients?.id) ? undefined : item.patients?.id}
                  meta={
                    <>
                      {item.patients ? (
                        <Link
                          to="/patients/$patientId"
                          params={{ patientId: item.patients.id }}
                          className="hover:text-primary hover:underline"
                        >
                          {item.patients.patient_code}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {metaParts.length ? ` · ${metaParts.join(" · ")}` : null}
                    </>
                  }
                  figure={
                    <span className="flex flex-col items-end gap-1">
                      <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
                      {previous.previousDue ? (
                        <span
                          className="inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-500"
                          title="Previous date"
                        >
                          {formatDayMonth(previous.previousDue)}
                        </span>
                      ) : null}
                    </span>
                  }
                  tone={overdue ? "danger" : item.status === "completed" ? undefined : "warning"}
                  action={
                    <RowActions
                      primary={
                        item.status !== "completed" ? (
                          <Button
                            size="sm"
                            className="shrink-0 rounded-xl bg-primary text-xs font-semibold"
                            disabled={markCompleted.isPending}
                            onClick={() => markCompleted.mutate(item.id)}
                          >
                            <CheckCircle className="mr-1 size-3.5" aria-hidden />
                            Complete
                          </Button>
                        ) : undefined
                      }
                      items={[
                        item.patients?.phone
                          ? {
                              label: "Call",
                              icon: Phone,
                              onSelect: () => {
                                window.location.href = `tel:${item.patients!.phone}`;
                              },
                            }
                          : null,
                        item.patients?.phone
                          ? {
                              label: "WhatsApp",
                              icon: MessageCircle,
                              onSelect: () => {
                                const text = `Hello ${item.patients!.full_name}, this is a gentle reminder from ${profile?.clinic?.name ?? "Clinic"} regarding your follow-up checkup for "${item.reason}" due on ${formatDate(item.due_date)}. Please let us know if you need to adjust your visit!`;
                                window.open(
                                  whatsappLink(item.patients!.phone, text),
                                  "_blank",
                                  "noopener,noreferrer",
                                );
                              },
                            }
                          : null,
                        item.status !== "completed"
                          ? {
                              label: "Reschedule",
                              icon: CalendarIcon,
                              onSelect: () => {
                                setSelectedFollowUp(item);
                                setNewDueDate(item.due_date);
                                setRescheduleOpen(true);
                              },
                            }
                          : null,
                      ]}
                    />
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateForm();
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add Follow-up</DialogTitle>
            <DialogDescription>
              Schedule a recall or post-treatment reminder for a patient.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              createFollowUp.mutate();
            }}
          >
            <PatientPicker
              required
              selected={selectedPatient}
              onClear={() => setSelectedPatient(null)}
              search={patientSearch}
              onSearchChange={setPatientSearch}
              results={patientsQuery.data ?? []}
              loading={patientsQuery.isLoading}
              onSelect={(p) => {
                setSelectedPatient({
                  id: p.id,
                  full_name: p.full_name,
                  patient_code: p.patient_code ?? "",
                  phone: p.phone ?? "",
                });
                setPatientSearch("");
              }}
            />

            <div className="space-y-1.5">
              <Label htmlFor="fu-reason">Reason *</Label>
              <Input
                id="fu-reason"
                value={createReason}
                onChange={(e) => setCreateReason(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fu-due">Due date *</Label>
              <Input
                id="fu-due"
                type="date"
                value={createDueDate}
                onChange={(e) => setCreateDueDate(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fu-notes">Notes</Label>
              <Textarea
                id="fu-notes"
                value={createNotes}
                onChange={(e) => setCreateNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createFollowUp.isPending || !selectedPatient || !createReason.trim()}
              >
                {createFollowUp.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : null}
                Save Follow-up
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule Follow-Up</DialogTitle>
            <DialogDescription>
              Set a new due date for {selectedFollowUp?.patients?.full_name}.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              reschedule.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="rdate">New due date</Label>
              <Input
                id="rdate"
                type="date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                required
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" onClick={() => setRescheduleOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={reschedule.isPending}>
                {reschedule.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                Update Date
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
