import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

import { DateScopeFilter } from "@/components/common/date-scope-filter";
import { Kpi } from "@/components/common/kpi";
import { PatientLine } from "@/components/common/patient-line";
import { PatientPicker } from "@/components/patients/patient-picker";
import {
  StatusChip,
  appointmentStatusTone,
  flowStatusTone,
} from "@/components/common/status-chip";
import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { usePatientSearch } from "@/hooks/use-patients-query";
import { useActiveStaff } from "@/hooks/use-staff-query";
import { clinicDoctorNames } from "@/lib/clinic-identity";
import { friendlyError, logAudit } from "@/lib/audit";
import { FLOW_LABELS, FLOW_NEXT, type FlowState } from "@/lib/constants";
import {
  applyDateColumnFilter,
  createDateScope,
  dateScopeLabel,
  resolveDateScope,
  type DateScope,
} from "@/lib/date-scope";
import { getDemoAppointments, isDemoId } from "@/lib/demo-data";
import { formatDate, formatTime, isPatientPhone, patientPhoneDigits, todayISO, whatsappLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useNewHotkey } from "@/hooks/use-new-hotkey";
import { ArrivePendingDialog } from "@/components/flow/arrive-pending-dialog";
import { isOnlineAppointment, needsArriveIdentity } from "@/services/arrive-pending-patient";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — VSP Software" },
      {
        name: "description",
        content: "Schedule, track and manage patient appointments for your dental clinic.",
      },
    ],
  }),
  component: AppointmentsPage,
});

type AppointmentRow = {
  id: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  notes: string | null;
  appointment_status: "scheduled" | "confirmed" | "cancelled" | "no_show";
  flow_status: FlowState;
  dentist_id: string | null;
  patients: { id: string; full_name: string; patient_code: string; phone: string } | null;
  pending_patients: { id: string; full_name: string; phone: string; email?: string | null } | null;
  profiles: { id: string; name: string } | null;
};

type PatientOption = {
  id: string;
  full_name: string;
  patient_code: string;
  phone: string;
  isPending?: boolean;
};

type StaffOption = {
  id: string;
  name: string;
};

const APPOINTMENT_STATUS_LABELS: Record<AppointmentRow["appointment_status"], string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

function isFromOnlineBooking(notes?: string | null) {
  return isOnlineAppointment({ notes });
}

function clinicWhatsAppName(name?: string | null | undefined) {
  const trimmed = name?.trim();
  return trimmed || "our clinic";
}

function onlineConfirmWhatsAppMessage(opts: {
  name: string;
  date: string;
  time: string;
  reason?: string | null | undefined;
  clinicName?: string | null | undefined;
}) {
  const when = `${formatDate(opts.date)} at ${formatTime(opts.time)}`;
  const reason = opts.reason?.trim();
  return `Hi ${opts.name}, your appointment is confirmed on ${when}${reason ? ` for ${reason}` : ""}. Please arrive on time. — ${clinicWhatsAppName(opts.clinicName)}`;
}

function openOnlineWhatsApp(phone: string, message: string) {
  if (phone.replace(/\D/g, "").length < 6) {
    toast.error("This request has no valid phone number.");
    return;
  }
  window.open(whatsappLink(phone, message), "_blank", "noopener,noreferrer");
}

function AppointmentsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();

  const [dateScope, setDateScope] = useState<DateScope>(() => createDateScope("day"));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  useNewHotkey(() => setNewOpen(true));

  const listView =
    statusFilter === "online_requests"
      ? "online"
      : statusFilter === "rejected_online"
        ? "rejected"
        : "schedule";

  // Reschedule
  const [rescheduleAppt, setRescheduleAppt] = useState<AppointmentRow | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(todayISO());
  const [rescheduleTime, setRescheduleTime] = useState("09:00");

  // Form state
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [appointmentDate, setAppointmentDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("09:00");
  const [reason, setReason] = useState("");
  const [attendingDoctor, setAttendingDoctor] = useState("");
  const [notes, setNotes] = useState("");
  const [arriveTarget, setArriveTarget] = useState<AppointmentRow | null>(null);

  const [isQuickPatient, setIsQuickPatient] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [quickPhone, setQuickPhone] = useState("");

  // Patient search query for modal (loads latest patients by default or filters by term)
  const patientsQuery = usePatientSearch(patientSearch, profile?.clinic_id, true);

  // Staff query for dentist dropdown
  const staffQuery = useActiveStaff();
  const clinicDoctors = clinicDoctorNames(profile?.clinic?.address);

  // Appointments list query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["appointments", dateScope, statusFilter, sortOrder],
    enabled: !!profile?.clinic_id,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const ascending = sortOrder === "asc";
      let query = supabase
        .from("appointments")
        .select(
          "id, appointment_date, start_time, end_time, reason, notes, appointment_status, flow_status, dentist_id, patients(id, full_name, patient_code, phone), pending_patients(id, full_name, phone, email), profiles(id, name)",
        )
        .order("appointment_date", { ascending })
        .order("start_time", { ascending, nullsFirst: false })
        .limit(200);

      query = applyDateColumnFilter(query, "appointment_date", dateScope);
      if (
        statusFilter !== "all" &&
        statusFilter !== "online_requests" &&
        statusFilter !== "rejected_online" &&
        statusFilter !== "online_booked"
      ) {
        query = query.eq("appointment_status", statusFilter as never);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AppointmentRow[];
    },
  });

  // Create appointment mutation
  const createAppointment = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("Select a patient for the appointment.");
      if (!appointmentDate) throw new Error("Select an appointment date.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      const insertData: any = {
        clinic_id: profile.clinic_id,
        dentist_id: null,
        appointment_date: appointmentDate,
        start_time: startTime || null,
        reason: reason.trim() || null,
        notes: [attendingDoctor.trim() ? `Doctor: ${attendingDoctor.trim()}` : "", notes.trim()]
          .filter(Boolean)
          .join("\n") || null,
        appointment_status: "scheduled",
        flow_status: "schedule",
        created_by: profile.id,
      };

      if (selectedPatient.isPending) {
        insertData.pending_patient_id = selectedPatient.id;
        insertData.patient_id = null;
      } else {
        insertData.patient_id = selectedPatient.id;
        insertData.pending_patient_id = null;
      }

      const { data: appt, error } = await supabase
        .from("appointments")
        .insert(insertData)
        .select("id")
        .single();

      if (error) throw error;

      void logAudit(profile.clinic_id, "appointment_created", "appointment", appt.id, {
        patient: selectedPatient.full_name,
        date: appointmentDate,
        is_pending_patient: !!selectedPatient.isPending,
      });
      return appt;
    },
    onSuccess: () => {
      toast.success("Appointment booked successfully.");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["flow"] });
      setNewOpen(false);
      resetForm();
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to book appointment.")),
  });

  // Quick Register Patient mutation inside modal
  const quickRegisterPatient = useMutation({
    mutationFn: async () => {
      if (!quickName.trim()) throw new Error("Enter patient full name.");
      if (!isPatientPhone(quickPhone)) throw new Error("Enter a 10-digit phone number.");
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");

      const { data: newP, error } = await (supabase as any)
        .from("pending_patients")
        .insert({
          clinic_id: profile.clinic_id,
          full_name: quickName.trim(),
          phone: patientPhoneDigits(quickPhone),
          patient_type: "regular",
        })
        .select("id, full_name, phone")
        .single();

      if (error) throw error;
      const res = newP as { id: string; full_name: string; phone: string };
      return {
        id: res.id,
        full_name: res.full_name,
        phone: res.phone,
        patient_code: "PENDING",
        isPending: true,
      };
    },
    onSuccess: (newP) => {
      toast.success(`Temporary record created for new patient: ${newP.full_name}`);
      setSelectedPatient(newP);
      setIsQuickPatient(false);
      setQuickName("");
      setQuickPhone("");
      void qc.invalidateQueries({ queryKey: ["patients-search-modal"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to create patient.")),
  });

  // Update appointment status mutation
  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "scheduled" | "confirmed" | "cancelled" | "no_show";
    }) => {
      const { error } = await supabase
        .from("appointments")
        .update({ appointment_status: status })
        .eq("id", id);
      if (error) throw error;

      // Audit in background — the row should update as soon as the status is saved.
      if (profile?.clinic_id) {
        void logAudit(profile.clinic_id, `appointment_${status}`, "appointment", id);
      }
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["appointments"] });
      const previous = qc.getQueriesData({ queryKey: ["appointments"] });
      qc.setQueriesData({ queryKey: ["appointments"] }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return old.map((row: { id: string }) =>
          row.id === id ? { ...row, appointment_status: status } : row,
        );
      });
      return { previous };
    },
    onError: (err, _vars, context) => {
      context?.previous.forEach(([key, data]) => {
        qc.setQueryData(key, data);
      });
      toast.error(friendlyError(err, "Unable to update status."));
    },
    onSuccess: () => {
      toast.success("Status updated.");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  function openReschedule(appt: AppointmentRow) {
    setRescheduleAppt(appt);
    setRescheduleDate(appt.appointment_date || todayISO());
    setRescheduleTime((appt.start_time ?? "09:00").slice(0, 5));
  }

  const rescheduleAppointment = useMutation({
    mutationFn: async () => {
      if (!rescheduleAppt) throw new Error("Select an appointment to reschedule.");
      if (!rescheduleDate) throw new Error("Pick a new date.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      const patch: {
        appointment_date: string;
        start_time: string | null;
        appointment_status?: "scheduled" | "confirmed";
        flow_status?: FlowState;
        arrived_at?: null;
        engaged_at?: null;
        completed_at?: null;
      } = {
        appointment_date: rescheduleDate,
        start_time: rescheduleTime || null,
      };

      // A new time needs a fresh confirm. Reset the clinic flow if they had already arrived.
      if (rescheduleAppt.flow_status !== "done") {
        patch.appointment_status = "scheduled";
        if (
          rescheduleAppt.flow_status === "waiting" ||
          rescheduleAppt.flow_status === "engage"
        ) {
          patch.flow_status = "schedule";
          patch.arrived_at = null;
          patch.engaged_at = null;
          patch.completed_at = null;
        }
      }

      const { error } = await supabase
        .from("appointments")
        .update(patch)
        .eq("id", rescheduleAppt.id);
      if (error) throw error;

      void logAudit(profile.clinic_id, "appointment_rescheduled", "appointment", rescheduleAppt.id, {
        patient: rescheduleAppt.patients?.full_name ?? rescheduleAppt.pending_patients?.full_name,
        from_date: rescheduleAppt.appointment_date,
        from_time: rescheduleAppt.start_time,
        to_date: rescheduleDate,
        to_time: rescheduleTime || null,
      });
    },
    onSuccess: () => {
      toast.success("Appointment rescheduled.");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["flow"] });
      setRescheduleAppt(null);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to reschedule.")),
  });

  // Mark arrived mutation (advances to flow_status = waiting)
  const markArrived = useMutation({
    mutationFn: async (appt: AppointmentRow) => {
      if (isDemoId(appt.id)) {
        throw new Error("Dummy rows are preview only — turn off Show dummy data to change real appointments.");
      }
      if (FLOW_NEXT[appt.flow_status] !== "waiting") {
        throw new Error("Patient flow cannot transition to waiting.");
      }
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("appointments")
        .update({ flow_status: "waiting", arrived_at: now, appointment_status: "confirmed" })
        .eq("id", appt.id);

      if (error) throw error;
      if (profile?.clinic_id) {
        void logAudit(profile.clinic_id, "patient_arrived", "appointment", appt.id, {
          patient: appt.patients?.full_name ?? appt.pending_patients?.full_name,
        });
      }
    },
    onSuccess: () => {
      toast.success("Arrived — Waiting");
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["flow"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to mark arrival.")),
  });

  // Online booking requests (pending + rejected for filters; confirmed for blue schedule rows)
  const onlineRequestsQuery = useQuery({
    queryKey: ["online-appointment-requests", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("online_appointment_requests")
        .select("id, status, name, phone, email, message, reason, requested_date, requested_time, created_at")
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Appointments created from Confirm & Schedule (audit) — always mark blue
  const onlineConvertedIdsQuery = useQuery({
    queryKey: ["online-converted-appointment-ids", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("entity_id")
        .eq("clinic_id", profile!.clinic_id)
        .eq("action", "online_booking_converted")
        .eq("entity_type", "appointment");
      if (error) throw error;
      return new Set(
        (data ?? [])
          .map((row) => row.entity_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      );
    },
  });

  function appointmentIsOnline(appt: AppointmentRow) {
    if (isFromOnlineBooking(appt.notes)) return true;
    if (onlineConvertedIdsQuery.data?.has(appt.id)) return true;
    return false;
  }

  // Reject Online Request mutation
  const rejectOnlineRequest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("online_appointment_requests")
        .update({ status: "rejected" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Request rejected.");
      void qc.invalidateQueries({ queryKey: ["online-appointment-requests"] });
      void qc.invalidateQueries({ queryKey: ["pending-online-count"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to reject request.")),
  });

  // Confirm and convert online request mutation
  const [confirmReq, setConfirmReq] = useState<{
    id: string;
    name: string;
    phone: string;
    email: string | null;
    requested_date: string | null;
    requested_time: string | null;
    reason: string | null;
    message: string | null;
  } | null>(null);
  const [confirmDentistId, setConfirmDentistId] = useState("");
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmTime, setConfirmTime] = useState("");
  const [confirmReason, setConfirmReason] = useState("");
  const [confirmNotes, setConfirmNotes] = useState("");

  const openConfirmDialog = (req: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    requested_date: string | null;
    requested_time: string | null;
    reason: string | null;
    message: string | null;
  }) => {
    setConfirmReq(req);
    setConfirmDate(req.requested_date || todayISO());
    setConfirmTime(req.requested_time || "09:00");
    setConfirmReason(req.reason || "General Dental Consultation");
    setConfirmNotes(
      req.message ? `[Online] Online booking note: ${req.message}` : "[Online]",
    );
    setConfirmDentistId("");
  };

  const confirmAndScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!confirmReq) throw new Error("No request selected.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not active.");
      if (!confirmDate) throw new Error("Select appointment date.");

      // Keep the website name as pending. Staff verify and edit when they arrive.
      const { data: pending, error: pendingErr } = await (supabase as any)
        .from("pending_patients")
        .insert({
          clinic_id: profile.clinic_id,
          full_name: confirmReq.name.trim(),
          phone: confirmReq.phone.trim(),
          email: confirmReq.email?.trim() || null,
          patient_type: "regular",
        })
        .select("id")
        .single();

      if (pendingErr) throw pendingErr;

      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .insert({
          clinic_id: profile.clinic_id,
          patient_id: null,
          pending_patient_id: pending.id,
          dentist_id: confirmDentistId || null,
          appointment_date: confirmDate,
          start_time: confirmTime || "09:00",
          reason: confirmReason.trim() || null,
          notes: confirmNotes.trim().includes("[Online]")
            ? confirmNotes.trim() || "[Online]"
            : `[Online]${confirmNotes.trim() ? ` ${confirmNotes.trim()}` : ""}`,
          appointment_status: "confirmed",
          flow_status: "schedule",
          created_by: profile.id,
        } as never)
        .select("id")
        .single();

      if (apptErr) throw apptErr;

      // 4. Update online request status
      const { error: reqUpdateErr } = await supabase
        .from("online_appointment_requests")
        .update({
          status: "confirmed",
          patient_id: null,
        } as never)
        .eq("id", confirmReq.id);

      if (reqUpdateErr) throw reqUpdateErr;

      await logAudit(profile.clinic_id, "online_booking_converted", "appointment", appt.id, {
        patient: confirmReq.name,
        date: confirmDate,
      });
    },
    onSuccess: () => {
      toast.success(`Appointment confirmed for ${confirmReq?.name}!`);
      void qc.invalidateQueries({ queryKey: ["online-appointment-requests"] });
      void qc.invalidateQueries({ queryKey: ["pending-online-count"] });
      void qc.invalidateQueries({ queryKey: ["online-converted-appointment-ids"] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["flow"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      setConfirmReq(null);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to confirm appointment.")),
  });

  function resetForm() {
    setSelectedPatient(null);
    setPatientSearch("");
    setAppointmentDate(todayISO());
    setStartTime("09:00");
    setReason("");
    setAttendingDoctor("");
    setNotes("");
  }

  const dateRange = resolveDateScope(dateScope);

  function onlineRequestMatchesFilters(r: {
    name: string;
    phone: string;
    reason: string | null;
    message: string | null;
    requested_date: string | null;
    created_at: string;
  }) {
    if (dateRange) {
      const day = r.requested_date || r.created_at.slice(0, 10);
      if (day < dateRange.start || day > dateRange.end) return false;
    }
    const t = search.trim().toLowerCase();
    if (!t) return true;
    return (
      r.name.toLowerCase().includes(t) ||
      r.phone.includes(t) ||
      (r.reason ?? "").toLowerCase().includes(t) ||
      (r.message ?? "").toLowerCase().includes(t)
    );
  }

  const pendingOnlineRequests = useMemo(() => {
    return (onlineRequestsQuery.data ?? []).filter(
      (r) => r.status === "requested" && onlineRequestMatchesFilters(r),
    );
  }, [onlineRequestsQuery.data, search, dateRange?.start, dateRange?.end]);

  const rejectedOnlineRequests = useMemo(() => {
    return (onlineRequestsQuery.data ?? []).filter(
      (r) => r.status === "rejected" && onlineRequestMatchesFilters(r),
    );
  }, [onlineRequestsQuery.data, search, dateRange?.start, dateRange?.end]);

  const pendingRequestsCount = pendingOnlineRequests.length;
  const rejectedRequestsCount = rejectedOnlineRequests.length;
  const filteredRows = useMemo(() => {
    const real = data ?? [];
    const merged = !showDemoData
      ? real
      : ([
          ...getDemoAppointments({
            from: dateRange?.start,
            to: dateRange?.end,
          }),
          ...real,
        ] as AppointmentRow[]);
    const scoped =
      statusFilter === "online_booked"
        ? merged.filter((row) => appointmentIsOnline(row))
        : merged;
    if (!search.trim()) return scoped;
    const t = search.trim().toLowerCase();
    return scoped.filter(
      (r) =>
        r.patients?.full_name.toLowerCase().includes(t) ||
        r.patients?.patient_code.toLowerCase().includes(t) ||
        r.patients?.phone.includes(t) ||
        r.pending_patients?.full_name.toLowerCase().includes(t) ||
        r.pending_patients?.phone.includes(t) ||
        (r.reason && r.reason.toLowerCase().includes(t)),
    );
  }, [
    data,
    showDemoData,
    dateRange?.start,
    dateRange?.end,
    statusFilter,
    onlineConvertedIdsQuery.data,
    search,
  ]);
  const totalPatients = filteredRows.length;
  const completedCount = filteredRows.filter((r) => r.flow_status === "done").length;
  const pendingCount = filteredRows.filter(
    (r) =>
      r.flow_status !== "done" &&
      r.appointment_status !== "cancelled" &&
      r.appointment_status !== "no_show",
  ).length;
  const statsScopeLabel = dateScopeLabel(dateScope);
  const showRowDate = !dateRange || dateRange.start !== dateRange.end;

  function renderOnlineRequestCard(
    req: (typeof pendingOnlineRequests)[number],
    variant: "online" | "rejected",
  ) {
    const isRejected = variant === "rejected";
    return (
      <div
        key={req.id}
        className={cn(
          "flex flex-col justify-between gap-2 rounded-xl border p-3 text-xs sm:flex-row sm:items-center",
          isRejected
            ? "border-danger-line bg-danger-surface/60"
            : "border-info-line bg-info-surface",
        )}
      >
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            {isRejected ? <StatusChip tone="danger">Rejected</StatusChip> : null}
            <p className="text-sm font-medium text-ink-900">
              {req.name} · {req.phone}
            </p>
          </div>
          <p className="text-ink-500">
            {formatDate(req.requested_date)} ·{" "}
            {req.requested_time ? formatTime(req.requested_time) : "Anytime"}
            {req.reason ? ` · ${req.reason}` : ""}
          </p>
          {req.message ? (
            <p className="italic text-ink-300">&ldquo;{req.message}&rdquo;</p>
          ) : null}
        </div>
        {!isRejected ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-danger-surface"
              onClick={() => {
                if (
                  !window.confirm(
                    `Reject the online request from ${req.name}? They will not get an appointment.`,
                  )
                ) {
                  return;
                }
                rejectOnlineRequest.mutate(req.id);
              }}
            >
              Reject
            </Button>
            <Button size="sm" onClick={() => openConfirmDialog(req)}>
              Confirm & Schedule
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Appointments"
        description="Schedule, track and manage patient visits."
        action={
          <Button onClick={() => setNewOpen(true)} className="w-full sm:w-auto">
            <Plus className="size-4" aria-hidden />
            New Appointment
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-surface-1 p-1">
        {(
          [
            { id: "all" as const, label: "Schedule", view: "schedule" as const },
            {
              id: "online_requests" as const,
              label: "Online",
              view: "online" as const,
              count: pendingRequestsCount,
              activeClass: "bg-info-surface text-info-text border border-info-line",
            },
            {
              id: "rejected_online" as const,
              label: "Rejected",
              view: "rejected" as const,
              count: rejectedRequestsCount,
              activeClass: "bg-danger-surface text-danger-text border border-danger-line",
            },
          ] as const
        ).map((tab) => {
          const active =
            tab.view === "schedule"
              ? listView === "schedule"
              : statusFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id === "all" ? "all" : tab.id)}
              className={cn(
                "flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold transition-colors",
                active
                  ? "activeClass" in tab && tab.activeClass
                    ? tab.activeClass
                    : "bg-primary text-primary-foreground"
                  : "text-ink-500 hover:bg-surface-2",
              )}
            >
              <span>{tab.label}</span>
              {"count" in tab && typeof tab.count === "number" && tab.count > 0 ? (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] tabular-nums",
                    active ? "bg-white/25" : "bg-surface-2 text-ink-500",
                  )}
                >
                  {tab.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {(() => {
        const dateLabel = statsScopeLabel;
        const statusLabel =
          statusFilter === "all"
            ? "All statuses"
            : statusFilter === "online_requests"
              ? "Online requests"
              : statusFilter === "rejected_online"
                ? "Rejected online"
                : statusFilter === "online_booked"
                  ? "Online booked"
                  : APPOINTMENT_STATUS_LABELS[statusFilter as AppointmentRow["appointment_status"]] ??
                    statusFilter;
        const filterControls = (
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <DateScopeFilter value={dateScope} onChange={setDateScope} />
            </div>
            <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as "asc" | "desc")}>
              <SelectTrigger aria-label="Sort by date" disabled={listView !== "schedule"}>
                <SelectValue placeholder="Sort by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Earliest first</SelectItem>
                <SelectItem value="desc">Latest first</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-label="Status filter">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
                <SelectItem value="online_booked">Online booked</SelectItem>
                <SelectItem value="online_requests">Online requests</SelectItem>
                <SelectItem value="rejected_online">Rejected online</SelectItem>
              </SelectContent>
            </Select>
            <div className="min-w-0">
              <Input
                placeholder="Search"
                aria-label="Filter appointments"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        );
        const stats = (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <Kpi
              label="Total"
              value={isLoading ? "—" : totalPatients}
              icon={Users}
              accent="patients"
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">{statsScopeLabel}</p>}
            />
            <Kpi
              label="Pending"
              value={isLoading ? "—" : pendingCount}
              icon={UserCheck}
              accent="clinic"
              tone={!isLoading && pendingCount > 0 ? "warning" : undefined}
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Not done yet</p>}
            />
            <Kpi
              className="col-span-2 sm:col-span-1"
              label="Completed"
              value={isLoading ? "—" : completedCount}
              icon={CheckCircle}
              accent="revenue"
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Done</p>}
            />
          </div>
        );
        return (
          <>
            {listView === "schedule" ? <div className="mb-4">{stats}</div> : null}

            <div className="mb-4 lg:hidden">
              <button
                type="button"
                className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 px-3 text-left sm:h-9"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <span className="truncate text-xs font-semibold text-ink-700">
                  {dateLabel} · {statusLabel}
                  {search.trim() ? ` · “${search.trim()}”` : ""}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-ink-500">
                  Filter
                  <ChevronDown
                    className={cn("size-4 transition-transform", filtersOpen && "rotate-180")}
                    aria-hidden
                  />
                </span>
              </button>
              {filtersOpen ? (
                <div className="mt-2 space-y-3 rounded-xl border border-line bg-surface-1 p-3">
                  {filterControls}
                </div>
              ) : null}
            </div>
            <div className="mb-5 hidden lg:block">{filterControls}</div>
          </>
        );
      })()}

      {/* Online / Rejected lists */}
      {listView === "online" ? (
        onlineRequestsQuery.isError ? (
          <ErrorState
            title="Unable to load online requests."
            onRetry={() => void onlineRequestsQuery.refetch()}
          />
        ) : onlineRequestsQuery.isLoading ? (
          <LoadingCards count={3} />
        ) : pendingOnlineRequests.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No online requests"
            description="Website bookings waiting for confirm will show here."
          />
        ) : (
          <div className="space-y-3 rounded-2xl border border-info-line bg-info-surface/40 p-4">
            <p className="text-sm font-semibold text-info-text">
              Online booking requests ({pendingOnlineRequests.length})
            </p>
            <div className="space-y-2">
              {pendingOnlineRequests.map((req) => renderOnlineRequestCard(req, "online"))}
            </div>
          </div>
        )
      ) : listView === "rejected" ? (
        onlineRequestsQuery.isError ? (
          <ErrorState
            title="Unable to load rejected requests."
            onRetry={() => void onlineRequestsQuery.refetch()}
          />
        ) : onlineRequestsQuery.isLoading ? (
          <LoadingCards count={3} />
        ) : rejectedOnlineRequests.length === 0 ? (
          <EmptyState
            icon={XCircle}
            title="No rejected requests"
            description="Rejected online bookings will show here."
          />
        ) : (
          <div className="space-y-3 rounded-2xl border border-danger-line bg-danger-surface/40 p-4">
            <p className="text-sm font-semibold text-danger-text">
              Rejected online bookings ({rejectedOnlineRequests.length})
            </p>
            <div className="space-y-2">
              {rejectedOnlineRequests.map((req) => renderOnlineRequestCard(req, "rejected"))}
            </div>
          </div>
        )
      ) : isError ? (
        <ErrorState title="Unable to load appointments." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingCards count={4} />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No appointments found"
          description={
            dateScope.mode === "day" && dateScope.day === todayISO()
              ? "No appointments booked for today."
              : "Try adjusting your date or status filters."
          }
          action={
            <Button className="rounded-xl shadow-xs" onClick={() => setNewOpen(true)}>
              <Plus className="size-4 mr-1" aria-hidden />
              Book Appointment
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {filteredRows.map((appt) => {
            const displayName =
              appt.patients?.full_name ?? appt.pending_patients?.full_name ?? "Unknown patient";
            const phone = appt.patients?.phone || appt.pending_patients?.phone;
            const metaRest = [
              phone,
              appt.reason,
              appt.notes?.match(/^Doctor:\s*(.+)$/m)?.[1]?.trim() ??
                (appt.profiles?.name ? `Dr. ${appt.profiles.name}` : null),
              !appt.patients ? "New patient" : null,
            ]
              .filter(Boolean)
              .join(" · ");

            const canArrive =
              appt.flow_status === "schedule" && appt.appointment_status !== "cancelled";
            const canConfirm = appt.appointment_status === "scheduled";
            const canReschedule =
              appt.appointment_status !== "cancelled" && appt.flow_status !== "done";
            const canCancel = appt.appointment_status !== "cancelled";

            const problemStatus =
              appt.appointment_status === "cancelled" || appt.appointment_status === "no_show";
            const confirmedOnSchedule =
              appt.appointment_status === "confirmed" && appt.flow_status === "schedule";
            const fromOnline = appointmentIsOnline(appt);
            const rowTone = problemStatus
              ? "danger"
              : fromOnline
                ? "info"
                : appt.flow_status === "waiting"
                  ? "warning"
                  : appt.flow_status === "engage"
                    ? "info"
                    : appt.flow_status === "done"
                      ? "success"
                      : undefined;

            const canWhatsApp = fromOnline && canArrive;
            const hasOverflow = canWhatsApp || canConfirm || canReschedule || canCancel;

            const rowActions = (
              <div className="flex max-w-full flex-wrap items-center justify-end gap-1.5">
                {canArrive ? (
                  <Button
                    size="sm"
                    className="rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-2xs"
                    disabled={markArrived.isPending}
                    onClick={() => {
                      if (
                        needsArriveIdentity(appt, {
                          fromOnlineConvert: onlineConvertedIdsQuery.data?.has(appt.id),
                        })
                      )
                        setArriveTarget(appt);
                      else if (
                        window.confirm(
                          `Mark ${displayName} as Arrived? They will appear on the flow board in Waiting.`,
                        )
                      ) {
                        markArrived.mutate(appt);
                      }
                    }}
                  >
                    <UserCheck className="mr-1 size-3.5 shrink-0" aria-hidden />
                    Arrived
                  </Button>
                ) : null}
                {hasOverflow ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="size-10 shrink-0 rounded-xl border-line p-0 transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5 sm:size-9"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      {canWhatsApp ? (
                        <DropdownMenuItem
                          onClick={() => {
                            const phone = appt.patients?.phone || appt.pending_patients?.phone;
                            if (!phone) {
                              toast.error("This request has no valid phone number.");
                              return;
                            }
                            openOnlineWhatsApp(
                              phone,
                              onlineConfirmWhatsAppMessage({
                                name: displayName,
                                date: appt.appointment_date,
                                time: appt.start_time || "09:00",
                                reason: appt.reason,
                                clinicName: profile?.clinic?.name,
                              }),
                            );
                          }}
                        >
                          <MessageCircle className="mr-2 size-3.5" aria-hidden />
                          WhatsApp
                        </DropdownMenuItem>
                      ) : null}
                      {canConfirm ? (
                        <DropdownMenuItem
                          className="text-success-text focus:bg-success-surface focus:text-success-text"
                          onClick={() =>
                            updateStatus.mutate({ id: appt.id, status: "confirmed" })
                          }
                        >
                          <CheckCircle className="mr-2 size-3.5" aria-hidden />
                          Confirm
                        </DropdownMenuItem>
                      ) : null}
                      {canReschedule ? (
                        <DropdownMenuItem
                          className="text-info-text focus:bg-info-surface focus:text-info-text"
                          onClick={() => openReschedule(appt)}
                        >
                          <CalendarClock className="mr-2 size-3.5" aria-hidden />
                          Reschedule
                        </DropdownMenuItem>
                      ) : null}
                      {canWhatsApp || canConfirm || canReschedule ? <DropdownMenuSeparator /> : null}
                      {canCancel ? (
                        <DropdownMenuItem
                          className="text-destructive focus:bg-danger-surface focus:text-destructive"
                          onClick={() => {
                            if (
                              !window.confirm(
                                `Cancel the appointment for ${displayName}? This cannot be undone from the schedule.`,
                              )
                            ) {
                              return;
                            }
                            updateStatus.mutate({ id: appt.id, status: "cancelled" });
                          }}
                        >
                          <XCircle className="mr-2 size-3.5" aria-hidden />
                          Cancel
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            );

            return (
              <div
                key={appt.id}
                className={cn(
                  "min-w-0 overflow-hidden rounded-xl border bg-surface-1 px-2.5 sm:px-3 transition-colors hover:bg-surface-2/70 lg:grid lg:grid-cols-[4.75rem_minmax(0,1fr)] lg:items-center lg:gap-3",
                  fromOnline
                    ? "border-info-line bg-info-surface/50"
                    : "border-line",
                )}
              >
                <p className="hidden tabular-nums text-sm font-semibold text-ink-700 lg:block">
                  {formatTime(appt.start_time)}
                </p>
                <PatientLine
                  name={displayName}
                  patientId={isDemoId(appt.patients?.id) ? undefined : appt.patients?.id}
                  meta={
                    <>
                      {appt.patients ? (
                        <Link
                          to="/patients/$patientId"
                          params={{ patientId: appt.patients.id }}
                          className="hover:text-primary hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {appt.patients.patient_code}
                        </Link>
                      ) : (
                        "Pending register"
                      )}
                      {metaRest ? ` · ${metaRest}` : null}
                    </>
                  }
                  figure={
                    <span className="flex flex-col items-end gap-1">
                      <StatusChip
                        tone={
                          problemStatus || confirmedOnSchedule
                            ? appointmentStatusTone(appt.appointment_status)
                            : flowStatusTone(appt.flow_status)
                        }
                      >
                        {problemStatus || confirmedOnSchedule
                          ? APPOINTMENT_STATUS_LABELS[appt.appointment_status]
                          : FLOW_LABELS[appt.flow_status]}
                      </StatusChip>
                      <span className="text-xs tabular-nums text-ink-700">
                        {showRowDate
                          ? `${formatDate(appt.appointment_date)} · ${formatTime(appt.start_time)}`
                          : formatTime(appt.start_time)}
                      </span>
                    </span>
                  }
                  tone={rowTone}
                  action={rowActions}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* New Appointment Modal */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="flex max-h-[100dvh] max-w-lg flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[min(90vh,900px)] sm:rounded-2xl">
          <DialogHeader className="shrink-0 space-y-1.5 border-b border-line px-4 pb-4 pt-4 text-left pr-14 sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-bold text-ink-900">New Appointment</DialogTitle>
            <DialogDescription className="text-xs text-ink-500">Book a dental appointment for a patient.</DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedPatient) {
                toast.error("Select a patient first.");
                return;
              }
              createAppointment.mutate();
            }}
          >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
            {isQuickPatient && !selectedPatient ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">New patient</p>
                  <button
                    type="button"
                    onClick={() => setIsQuickPatient(false)}
                    className="text-sm text-ink-500 hover:underline"
                  >
                    Search instead
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-name">Full name *</Label>
                    <Input
                      id="quick-name"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="quick-phone">Phone *</Label>
                    <Input
                      id="quick-phone"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={10}
                      placeholder="10-digit mobile"
                      value={quickPhone}
                      onChange={(e) => setQuickPhone(patientPhoneDigits(e.target.value))}
                      required
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  disabled={quickRegisterPatient.isPending}
                  onClick={() => quickRegisterPatient.mutate()}
                >
                  {quickRegisterPatient.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Create and select
                </Button>
              </div>
            ) : (
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
                  setIsQuickPatient(false);
                }}
                createSlot={
                  <button
                    type="button"
                    onClick={() => setIsQuickPatient(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    New patient
                  </button>
                }
              />
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={appointmentDate}
                  onChange={(e) => setAppointmentDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="time">Time</Label>
                <Input
                  id="time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dentist">Doctor</Label>
              <Select
                {...(attendingDoctor ? { value: attendingDoctor } : {})}
                onValueChange={setAttendingDoctor}
                disabled={clinicDoctors.length === 0}
              >
                <SelectTrigger id="dentist">
                  <SelectValue
                    placeholder={
                      clinicDoctors.length ? "Select doctor" : "Add doctor names in Settings"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {clinicDoctors.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason / Chief Complaint</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-line px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createAppointment.isPending}>
              {createAppointment.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              Book Appointment
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reschedule Appointment */}
      <Dialog
        open={!!rescheduleAppt}
        onOpenChange={(open) => {
          if (!open) setRescheduleAppt(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 p-0 sm:gap-4 sm:p-6">
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 space-y-1 border-b px-4 pb-3 pt-4 pr-14 text-left sm:border-0 sm:px-0 sm:pb-0 sm:pt-0 sm:pr-0">
              <DialogTitle className="text-base sm:text-lg">Reschedule appointment</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {rescheduleAppt?.patients?.full_name ??
                  rescheduleAppt?.pending_patients?.full_name ??
                  "Patient"}{" "}
                · currently {rescheduleAppt ? formatDate(rescheduleAppt.appointment_date) : ""}{" "}
                {rescheduleAppt?.start_time ? formatTime(rescheduleAppt.start_time) : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-0 sm:py-2">
              <div className="space-y-2">
                <Label htmlFor="resched-date">New date *</Label>
                <Input
                  id="resched-date"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="resched-time">New time</Label>
                <Input
                  id="resched-time"
                  type="time"
                  value={rescheduleTime}
                  onChange={(e) => setRescheduleTime(e.target.value)}
                />
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 mt-auto shrink-0 gap-2 border-t bg-background px-4 py-3 sm:static sm:border-0 sm:px-0 sm:py-0">
              <Button
                variant="outline"
                className="w-full flex-1 sm:w-auto sm:flex-none"
                onClick={() => setRescheduleAppt(null)}
              >
                Cancel
              </Button>
              <Button
                className="w-full flex-1 sm:w-auto sm:flex-none"
                disabled={rescheduleAppointment.isPending || !rescheduleDate}
                onClick={() => rescheduleAppointment.mutate()}
              >
                {rescheduleAppointment.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : null}
                Save new time
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Online Request Dialog */}
      <Dialog open={!!confirmReq} onOpenChange={(open) => !open && setConfirmReq(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirm & Schedule Online Request</DialogTitle>
            <DialogDescription>
              Assign dentist and schedule for {confirmReq?.name}. Staff will verify and edit when they arrive.
            </DialogDescription>
          </DialogHeader>

          {confirmReq ? (
            <div className="space-y-3.5 text-xs">
              <div className="surface-card p-3 rounded-lg border bg-muted/40 space-y-1">
                <p className="font-semibold text-foreground text-sm">{confirmReq.name}</p>
                <p className="text-muted-foreground">{confirmReq.phone} {confirmReq.email ? `· ${confirmReq.email}` : ""}</p>
                {confirmReq.message ? (
                  <p className="italic text-primary pt-1">Patient message: "{confirmReq.message}"</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-date">Appointment Date *</Label>
                  <Input
                    id="confirm-date"
                    type="date"
                    required
                    value={confirmDate}
                    onChange={(e) => setConfirmDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm-time">Start Time *</Label>
                  <Input
                    id="confirm-time"
                    type="time"
                    required
                    value={confirmTime}
                    onChange={(e) => setConfirmTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-dentist">Dentist</Label>
                <Select value={confirmDentistId} onValueChange={setConfirmDentistId}>
                  <SelectTrigger id="confirm-dentist">
                    <SelectValue placeholder="Assign dentist (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {(staffQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-reason">Reason / Treatment</Label>
                <Input
                  id="confirm-reason"
                  value={confirmReason}
                  onChange={(e) => setConfirmReason(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm-notes">Internal Booking Notes</Label>
                <Textarea
                  id="confirm-notes"
                  rows={2}
                  value={confirmNotes}
                  onChange={(e) => setConfirmNotes(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmReq(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmAndScheduleMutation.mutate()}
              disabled={confirmAndScheduleMutation.isPending}
            >
              {confirmAndScheduleMutation.isPending ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : null}
              Confirm & Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ArrivePendingDialog
        appointment={arriveTarget}
        onClose={() => setArriveTarget(null)}
      />
    </AppShell>
  );
}
