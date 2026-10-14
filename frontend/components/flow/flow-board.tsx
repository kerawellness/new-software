import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ArrivePendingDialog } from "@/components/flow/arrive-pending-dialog";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { PatientLine } from "@/components/common/patient-line";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { friendlyError, logAudit } from "@/lib/audit";
import {
  FLOW_ACTION_LABEL,
  FLOW_COLUMN_BAND,
  FLOW_COLUMN_HEADER,
  FLOW_LABELS,
  FLOW_NEXT,
  FLOW_STATES,
  type FlowState,
} from "@/lib/constants";
import { getDemoFlowAppointments, isDemoId } from "@/lib/demo-data";
import { needsArriveIdentity, needsChairRegistration, registerPendingAtChair } from "@/services/arrive-pending-patient";
import {
  durationSince,
  formatClock,
  formatTime,
  minutesSince,
  todayISO,
} from "@/lib/format";
import { cn } from "@/lib/utils";

type FlowAppointment = {
  id: string;
  start_time: string | null;
  reason: string | null;
  notes: string | null;
  flow_status: FlowState;
  arrived_at: string | null;
  engaged_at: string | null;
  completed_at: string | null;
  patients: { id: string; full_name: string; patient_code: string; phone: string } | null;
  pending_patients: { id: string; full_name: string; phone: string; email?: string | null } | null;
};

type FlowFilter = "all" | "long_wait" | "waiting_open";

const FLOW_FILTERS: { value: FlowFilter; label: string }[] = [
  { value: "all", label: "All today" },
  { value: "long_wait", label: "Waiting 15+ min" },
  { value: "waiting_open", label: "Waiting (not completed)" },
];

export function useTodayFlow(options?: { realtime?: boolean }) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();
  const clinicId = profile?.clinic_id;
  const realtime = options?.realtime ?? true;

  useEffect(() => {
    if (!clinicId || !realtime) return;

    // Unique topic per subscriber — reusing a subscribed channel throws in supabase-js.
    const channel = supabase
      .channel(`flow-appointments-${clinicId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `clinic_id=eq.${clinicId}`,
        },
        () => void qc.invalidateQueries({ queryKey: ["flow"] }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, clinicId, realtime]);

  const query = useQuery({
    queryKey: ["flow", todayISO(), clinicId],
    enabled: !!clinicId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, start_time, reason, notes, flow_status, arrived_at, engaged_at, completed_at, patients(id, full_name, patient_code, phone), pending_patients(id, full_name, phone, email)",
        )
        .eq("appointment_date", todayISO())
        .neq("appointment_status", "cancelled")
        .neq("appointment_status", "no_show")
        .order("start_time", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as FlowAppointment[];
    },
  });

  const data = useMemo(() => {
    if (!showDemoData) return query.data;
    return [...getDemoFlowAppointments(), ...(query.data ?? [])] as FlowAppointment[];
  }, [query.data, showDemoData]);

  return { ...query, data };
}

export function useAdvanceFlow() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  return useMutation({
    mutationFn: async ({ appointment, to }: { appointment: FlowAppointment; to: FlowState }) => {
      if (isDemoId(appointment.id)) {
        throw new Error("Dummy rows are preview only — turn off Show dummy data to move real patients.");
      }
      if (FLOW_NEXT[appointment.flow_status] !== to) {
        throw new Error("That patient flow step is not allowed.");
      }

      if (
        to === "engage" &&
        needsChairRegistration(appointment) &&
        profile?.clinic_id &&
        appointment.pending_patients?.id
      ) {
        const name = await registerPendingAtChair({
          clinicId: profile.clinic_id,
          appointmentId: appointment.id,
          pendingPatientId: appointment.pending_patients.id,
        });
        void logAudit(profile.clinic_id, "patient_engaged", "appointment", appointment.id, {
          patient: name,
          registered_at_chair: true,
        });
        return;
      }

      const patch: {
        flow_status: FlowState;
        arrived_at?: string;
        engaged_at?: string;
        completed_at?: string;
      } = { flow_status: to };
      const now = new Date().toISOString();
      if (to === "waiting") patch.arrived_at = now;
      if (to === "engage") patch.engaged_at = now;
      if (to === "done") patch.completed_at = now;

      const { data: updated, error } = await supabase
        .from("appointments")
        .update(patch)
        .eq("id", appointment.id)
        .eq("flow_status", appointment.flow_status)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) {
        throw new Error("This patient was already moved on another screen. Refresh the flow board.");
      }

      if (profile?.clinic_id) {
        const action =
          to === "waiting"
            ? "patient_arrived"
            : to === "engage"
              ? "patient_engaged"
              : "visit_completed";
        // Audit in background — the card should move as soon as the flow row is saved.
        void logAudit(profile.clinic_id, action, "appointment", appointment.id, {
          patient: appointment.patients?.full_name || appointment.pending_patients?.full_name,
        });
      }
    },
    onMutate: async ({ appointment, to }) => {
      await qc.cancelQueries({ queryKey: ["flow"] });
      const previous = qc.getQueriesData({ queryKey: ["flow"] });
      const now = new Date().toISOString();
      qc.setQueriesData({ queryKey: ["flow"] }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((row: { id: string }) =>
          row.id === appointment.id
            ? {
                ...row,
                flow_status: to,
                ...(to === "waiting" ? { arrived_at: now } : {}),
                ...(to === "engage" ? { engaged_at: now } : {}),
                ...(to === "done" ? { completed_at: now } : {}),
              }
            : row,
        );
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      toast.error(friendlyError(err, "Unable to move this patient."));
    },
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["flow"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      toast.success(`Moved to ${FLOW_LABELS[vars.to]}`);
    },
  });
}

type FlowAdvanceConfirm = {
  to: FlowState;
  title: string;
  description: string;
};

function flowAdvanceConfirm(to: FlowState, patientName: string): FlowAdvanceConfirm | null {
  if (to === "waiting") {
    return {
      to,
      title: "Mark as Arrived?",
      description: `${patientName} will move to Waiting on the flow board.`,
    };
  }
  if (to === "engage") {
    return {
      to,
      title: "Move to In chair?",
      description: `${patientName} will be marked as in the treatment chair.`,
    };
  }
  if (to === "done") {
    return {
      to,
      title: "Mark as Done?",
      description: `${patientName} will leave the active flow board (completed for today).`,
    };
  }
  return null;
}

function FlowCard({ appointment }: { appointment: FlowAppointment }) {
  const advance = useAdvanceFlow();
  const next = FLOW_NEXT[appointment.flow_status];
  const [arriveOpen, setArriveOpen] = useState(false);
  const [advanceConfirm, setAdvanceConfirm] = useState<FlowAdvanceConfirm | null>(null);

  const waitMins = appointment.flow_status === "waiting" ? minutesSince(appointment.arrived_at) : 0;
  const name =
    appointment.patients?.full_name ??
    appointment.pending_patients?.full_name ??
    "Unknown patient";
  const code = appointment.patients?.patient_code ?? "Pending";
  const reason = appointment.reason ?? "Consultation";
  const waitMeta =
    appointment.flow_status === "waiting"
      ? `Arrived ${formatClock(appointment.arrived_at)} · waiting ${durationSince(appointment.arrived_at)}`
      : appointment.flow_status === "engage"
        ? `Started ${formatClock(appointment.engaged_at)} · ${durationSince(appointment.engaged_at)}`
        : appointment.flow_status === "done"
          ? `Completed ${formatClock(appointment.completed_at)}`
          : `Expected ${formatTime(appointment.start_time)}`;
  const tone =
    waitMins >= 30
      ? "danger"
      : waitMins >= 15
        ? "warning"
        : appointment.flow_status === "engage"
          ? "info"
          : appointment.flow_status === "done"
            ? "success"
            : undefined;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface-1 px-2.5 transition-colors duration-150">
      <PatientLine
        name={name}
        patientId={isDemoId(appointment.patients?.id) ? undefined : appointment.patients?.id}
        meta={
          <>
            {appointment.patients ? (
              <Link
                to="/patients/$patientId"
                params={{ patientId: appointment.patients.id }}
                className="hover:text-primary hover:underline"
              >
                {code}
              </Link>
            ) : (
              <>
                {code}
                <span className="text-ink-500"> · New</span>
              </>
            )}
            {` · ${reason} · ${waitMeta}`}
          </>
        }
        tone={tone}
        action={
          next ? (
            <Button
              size="sm"
              className="rounded-xl px-3 font-semibold"
              disabled={advance.isPending}
              onClick={() => {
                if (!next) return;
                if (next === "waiting" && needsArriveIdentity(appointment)) {
                  setArriveOpen(true);
                  return;
                }
                const dialog = flowAdvanceConfirm(next, name);
                if (dialog) {
                  setAdvanceConfirm(dialog);
                  return;
                }
                advance.mutate({ appointment, to: next });
              }}
            >
              {FLOW_ACTION_LABEL[appointment.flow_status]}
            </Button>
          ) : undefined
        }
      />
      <ArrivePendingDialog
        appointment={arriveOpen ? appointment : null}
        onClose={() => setArriveOpen(false)}
      />

      <AlertDialog
        open={!!advanceConfirm}
        onOpenChange={(open) => {
          if (!open) setAdvanceConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{advanceConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{advanceConfirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!advanceConfirm || !next) return;
                advance.mutate({ appointment, to: advanceConfirm.to });
                setAdvanceConfirm(null);
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function FlowBoard() {
  const { data, isLoading, isError, refetch } = useTodayFlow();
  const [active, setActive] = useState<FlowState>("schedule");
  const [search, setSearch] = useState("");
  const [flowFilter, setFlowFilter] = useState<FlowFilter>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    let rows = data ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((a) => {
        const name = (a.patients?.full_name ?? a.pending_patients?.full_name ?? "").toLowerCase();
        const code = (a.patients?.patient_code ?? "").toLowerCase();
        const phone = a.patients?.phone ?? a.pending_patients?.phone ?? "";
        const reason = (a.reason ?? "").toLowerCase();
        return name.includes(q) || code.includes(q) || phone.includes(q) || reason.includes(q);
      });
    }
    if (flowFilter === "long_wait") {
      rows = rows.filter(
        (a) => a.flow_status === "waiting" && minutesSince(a.arrived_at) >= 15,
      );
    } else if (flowFilter === "waiting_open") {
      rows = rows.filter((a) => a.flow_status === "waiting");
    }

    const dir = sortOrder === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const at = a.start_time ?? "";
      const bt = b.start_time ?? "";
      if (!at && !bt) return 0;
      if (!at) return 1;
      if (!bt) return -1;
      return at < bt ? -dir : at > bt ? dir : 0;
    });
  }, [data, search, flowFilter, sortOrder]);

  if (isError)
    return <ErrorState description="We couldn't load the patient flow." onRetry={() => refetch()} />;
  if (isLoading) return <LoadingCards count={2} />;

  const grouped = FLOW_STATES.map((state) => ({
    state,
    items: filtered.filter((a) => a.flow_status === state),
  }));

  const renderCard = (a: FlowAppointment) => <FlowCard key={a.id} appointment={a} />;

  return (
    <>
      <div className="mb-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
          <SelectTrigger aria-label="Sort by date" className="w-full sm:w-44">
            <SelectValue placeholder="Sort by date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">Earliest first</SelectItem>
            <SelectItem value="desc">Latest first</SelectItem>
          </SelectContent>
        </Select>

        <Select value={flowFilter} onValueChange={(v) => setFlowFilter(v as FlowFilter)}>
          <SelectTrigger aria-label="Filter patients" className="w-full sm:w-52">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            {FLOW_FILTERS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-full min-w-0 flex-1">
          <Input
            placeholder="Search"
            aria-label="Search flow patients"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {(search.trim() || flowFilter !== "all") && filtered.length === 0 && (data?.length ?? 0) > 0 ? (
        <EmptyState
          title="No matches"
          description="Try another search or clear the filter."
        />
      ) : null}

      <div className="lg:hidden">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {grouped.map(({ state, items }) => (
            <button
              key={state}
              type="button"
              onClick={() => setActive(state)}
              className={cn(
                "rounded-lg px-2 py-2 text-xs font-medium leading-tight transition-colors duration-150",
                FLOW_COLUMN_BAND[state],
                active === state
                  ? cn("bg-surface-1 shadow-sm", FLOW_COLUMN_HEADER[state])
                  : "text-ink-500",
              )}
            >
              {FLOW_LABELS[state]}
              <span className="ml-1 tabular-nums opacity-70">{items.length}</span>
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {grouped.find((g) => g.state === active)!.items.length === 0 ? (
            <EmptyState
              title={`No patients in ${FLOW_LABELS[active]}`}
              description="Book an appointment to put someone in this stage."
              action={
                <Button asChild className="rounded-xl">
                  <Link to="/appointments">
                    <Plus className="mr-1 size-4" aria-hidden />
                    Book appointment
                  </Link>
                </Button>
              }
            />
          ) : (
            grouped.find((g) => g.state === active)!.items.map(renderCard)
          )}
        </div>
      </div>

      <div className="hidden gap-3 lg:grid lg:grid-cols-4">
        {grouped.map(({ state, items }) => (
          <div
            key={state}
            className={cn("rounded-xl bg-surface-2/60 p-2", FLOW_COLUMN_BAND[state])}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <p
                className={cn(
                  "text-xs font-semibold uppercase tracking-wide",
                  FLOW_COLUMN_HEADER[state],
                )}
              >
                {FLOW_LABELS[state]}
              </p>
              <span className="text-xs tabular-nums text-ink-500">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.length === 0 ? (
                <EmptyState
                  title={`No patients in ${FLOW_LABELS[state]}`}
                  description="Book an appointment to put someone in this stage."
                  action={
                    <Button asChild size="sm" className="rounded-xl">
                      <Link to="/appointments">
                        <Plus className="mr-1 size-4" aria-hidden />
                        Book appointment
                      </Link>
                    </Button>
                  }
                />
              ) : (
                items.map(renderCard)
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
