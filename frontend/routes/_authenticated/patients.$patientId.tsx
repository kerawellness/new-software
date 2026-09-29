import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  CircleDollarSign,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Stethoscope,
  Trash2,
  Wallet,
  X,
  Eye,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Kpi } from "@/components/common/kpi";
import { RowActions } from "@/components/common/row-actions";
import { ErrorState, LoadingCards } from "@/components/common/states";
import {
  StatusChip,
  appointmentStatusTone,
  flowStatusTone,
  followUpStatusLabel,
  followUpStatusTone,
  invoiceStatusLabel,
  invoiceStatusTone,
  treatmentStatusLabel,
  treatmentStatusTone,
} from "@/components/common/status-chip";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/use-session";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { friendlyError } from "@/lib/audit";
import {
  FLOW_LABELS,
  PATIENT_TYPES,
  PATIENT_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PatientType,
} from "@/lib/constants";
import { splitPreviousDue, withPreviousDue } from "@/lib/followup-previous-date";
import { formatCurrency, formatDate, formatDayMonth, formatTime, isPatientPhone, patientPhoneDigits, todayISO, whatsappLink } from "@/lib/format";
import { familyPhoneLabel } from "@/lib/family-phone";
import { replacePatientMedicalProfile } from "@/services/patients";
import {
  recordInvoicePayment,
  type CollectTargetInstallment,
} from "@/services/record-payment";
import { type SelectedCondition } from "@/components/patients/medical-history-picker";
import { MedicalRecordsForm, type AllergyRow, type MedicationRow, type HabitRow } from "@/components/patients/medical-records-form";

const toLocalIsoAtTime = (dateOnly: Date, hours = 10, minutes = 0) => {
  const d = new Date(dateOnly);
  d.setHours(hours, minutes, 0, 0);
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString();
};

const localDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const getClampedDate = (year: number, monthIndex: number, targetDay: number) => {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const clampedDay = Math.min(Math.max(1, targetDay), lastDay);
  return new Date(year, monthIndex, clampedDay);
};

const getNext12Months = () => {
  const months = [];
  const start = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    months.push({ key, label, year: d.getFullYear(), monthIndex: d.getMonth() });
  }
  return months;
};

export const Route = createFileRoute("/_authenticated/patients/$patientId")({
  head: () => ({
    meta: [
      { title: "Patient Record — VSP Software" },
      {
        name: "description",
        content: "Full dental patient record: profile, medical history, visits, care plans and billing.",
      },
      { property: "og:title", content: "Patient Record — VSP Software" },
      { property: "og:description", content: "Full dental patient record and clinical history." },
    ],
  }),
  component: PatientDetailPage,
});

const VALID_TABS = ["overview","appointments","clinical","billing","followups"] as const;
type PatientTab = typeof VALID_TABS[number];

type PatientVisitRow = {
  id: string;
  visit_date: string;
  chief_complaint: string | null;
  diagnosis: string | null;
  treatment_performed: string | null;
  clinical_notes: string | null;
  post_care_instructions: string | null;
  created_at: string;
  doctor_notes: string | null;
  profiles: { name?: string } | null;
};

function findVisitForSession(session: TreatmentSession, visits: PatientVisitRow[]): PatientVisitRow | undefined {
  if (session.visit_id) {
    return visits.find((v) => v.id === session.visit_id);
  }
  return visits.find((v) => v.visit_date === session.treatment_date);
}

function findAnchorVisitForGroup(
  group: TreatmentTimelineGroup,
  visits: PatientVisitRow[],
): PatientVisitRow | undefined {
  const firstSession = [...group.sessions].reverse()[0];
  if (!firstSession) return undefined;
  if (firstSession.visit_id) {
    return visits.find((v) => v.id === firstSession.visit_id) ?? findVisitForSession(firstSession, visits);
  }
  return findVisitForSession(firstSession, visits);
}

function getSessionClinicNote(
  session: TreatmentSession,
  visit: PatientVisitRow | undefined,
  anchorVisit: PatientVisitRow | undefined,
): string {
  if (session.sessionNumber === 1) {
    if (session.notes?.trim() && session.notes !== "Ongoing session") {
      return session.notes.trim();
    }
    const anchorNotes = anchorVisit?.clinical_notes?.trim() ?? "";
    if (anchorNotes) {
      return anchorNotes.split(/\n\n--- /)[0]?.trim() ?? "";
    }
    return visit?.clinical_notes?.trim() ?? "";
  }

  if (visit?.clinical_notes?.trim() && visit.id !== anchorVisit?.id) {
    return visit.clinical_notes.trim();
  }
  if (session.notes?.trim() && session.notes !== "Ongoing session") {
    return session.notes.trim();
  }

  const anchorNotes = anchorVisit?.clinical_notes?.trim() ?? "";
  if (!anchorNotes) return visit?.clinical_notes?.trim() ?? "";

  for (const part of anchorNotes.split(/\n\n--- /).slice(1)) {
    const dateLine = part.split("\n")[0] ?? "";
    if (dateLine.includes(session.treatment_date)) {
      return part.split("\n").slice(1).join("\n").trim();
    }
  }

  return visit?.clinical_notes?.trim() ?? "";
}

function ClinicalDetailField({ label, value }: { label: string; value?: string | null | undefined }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap">{value?.trim() || "—"}</p>
    </div>
  );
}

type PatientTreatmentRow = {
  id: string;
  visit_id: string | null;
  name: string;
  description: string | null;
  status: string;
  treatment_date: string;
  cost: number;
  tooth_number: string | null;
  notes: string | null;
  created_at: string;
};

type TreatmentSession = PatientTreatmentRow & {
  sessionNumber: number;
  sessionLabel: string;
};

type TreatmentTimelineGroup = {
  name: string;
  type: "Ongoing" | "Completed";
  sessions: TreatmentSession[];
};

function groupTreatmentsForTimeline(treatments: PatientTreatmentRow[]): TreatmentTimelineGroup[] {
  const byName = new Map<string, PatientTreatmentRow[]>();

  for (const treatment of treatments) {
    const key = treatment.name.trim().toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(treatment);
    byName.set(key, list);
  }

  const groups: TreatmentTimelineGroup[] = [];

  for (const sessions of byName.values()) {
    const sorted = [...sessions].sort((a, b) => {
      const aTime = a.created_at || a.treatment_date;
      const bTime = b.created_at || b.treatment_date;
      return aTime.localeCompare(bTime);
    });

    const isOngoing = sorted.some((s) => s.status === "planned" || s.status === "in_progress");
    const type: TreatmentTimelineGroup["type"] = isOngoing ? "Ongoing" : "Completed";

    const labeled: TreatmentSession[] = sorted.map((session, index) => {
      let sessionLabel = "(Update)";
      if (index === 0) sessionLabel = "(Started)";
      else if (index === sorted.length - 1 && session.status === "completed") sessionLabel = "(Completed)";
      return { ...session, sessionNumber: index + 1, sessionLabel };
    });

    groups.push({
      name: sorted[0]!.name,
      type,
      sessions: [...labeled].reverse(),
    });
  }

  return groups.sort((a, b) => {
    const aLatest = a.sessions[0]?.created_at ?? a.sessions[0]?.treatment_date ?? "";
    const bLatest = b.sessions[0]?.created_at ?? b.sessions[0]?.treatment_date ?? "";
    return bLatest.localeCompare(aLatest);
  });
}

function formatTimelineStamp(value?: string | null) {
  if (!value) return "—";
  try {
    return format(new Date(value), "d/M/yyyy, h:mm:ss a");
  } catch {
    return value;
  }
}

type VisitDayGroup = {
  date: string;
  visits: PatientVisitRow[];
  treatments: PatientTreatmentRow[];
  doctorNames: string[];
};

function groupVisitsByDate(visits: PatientVisitRow[], treatments: PatientTreatmentRow[]): VisitDayGroup[] {
  const dateMap = new Map<string, VisitDayGroup>();

  for (const visit of visits) {
    const existing = dateMap.get(visit.visit_date) ?? {
      date: visit.visit_date,
      visits: [],
      treatments: [],
      doctorNames: [],
    };
    existing.visits.push(visit);
    const doctorName = visit.doctor_notes?.trim() || visit.profiles?.name;
    if (doctorName && !existing.doctorNames.includes(doctorName)) {
      existing.doctorNames.push(doctorName);
    }
    dateMap.set(visit.visit_date, existing);
  }

  for (const treatment of treatments) {
    const linkedVisit = treatment.visit_id ? visits.find((v) => v.id === treatment.visit_id) : undefined;
    const date = linkedVisit?.visit_date ?? treatment.treatment_date;
    const existing = dateMap.get(date) ?? {
      date,
      visits: [],
      treatments: [],
      doctorNames: [],
    };
    if (!existing.treatments.some((t) => t.id === treatment.id)) {
      existing.treatments.push(treatment);
    }
    dateMap.set(date, existing);
  }

  return [...dateMap.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function PatientDetailPage() {
  const { patientId } = Route.useParams();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as { tab?: string };
  const requestedTab =
    searchParams.tab === "medical" || searchParams.tab === "plans" || searchParams.tab === "notes"
      ? "overview"
      : searchParams.tab;
  const activeTab: PatientTab = (VALID_TABS as readonly string[]).includes(requestedTab ?? "") ? requestedTab as PatientTab : "overview";

  function setActiveTab(tab: PatientTab) {
    void navigate({ to: "/patients/$patientId", params: { patientId }, search: { tab }, replace: true });
  }

  const [editOpen, setEditOpen] = useState(false);
  const [demographicsOpen, setDemographicsOpen] = useState(false);
  const [showAllTreatments, setShowAllTreatments] = useState(false);

  // In-place Collect
  const [collectOpen, setCollectOpen] = useState(false);
  const [collectInvoice, setCollectInvoice] = useState<{
    id: string;
    invoice_number: string;
    balance_amount: number;
  } | null>(null);
  const [collectTarget, setCollectTarget] = useState<CollectTargetInstallment | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<string>("cash");
  const [collectRef, setCollectRef] = useState("");
  const [collectNotes, setCollectNotes] = useState("");
  const [collectAmountError, setCollectAmountError] = useState<string | null>(null);

  // Confirm dialogs
  const [deleteFollowUpId, setDeleteFollowUpId] = useState<string | null>(null);
  const [clearAllFollowUpsOpen, setClearAllFollowUpsOpen] = useState(false);

  // Follow-Up Form State
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [fReason, setFReason] = useState("");
  const [fDueDate, setFDueDate] = useState(todayISO());
  const [fNotes, setFNotes] = useState("");
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [editingOriginalDue, setEditingOriginalDue] = useState<string | null>(null);
  const [editingPreviousDue, setEditingPreviousDue] = useState<string | null>(null);

  // Follow-Up Scheduler Form States
  const [schedulerOpen, setSchedulerOpen] = useState(false);
  const [fuMode, setFuMode] = useState<"monthly" | "dates">("monthly");
  const [fuUntilMonth, setFuUntilMonth] = useState<string>("");
  const [fuDayOfMonth, setFuDayOfMonth] = useState<number>(10);
  const [fuExcludedMonths, setFuExcludedMonths] = useState<string[]>([]);
  const [selectedManualDates, setSelectedManualDates] = useState<string[]>([]);
  const [calendarViewMonth, setCalendarViewMonth] = useState<string>("");

  const next12Months = useMemo(() => getNext12Months(), []);
  useEffect(() => {
    if (next12Months.length > 0) {
      setFuUntilMonth(next12Months[2]?.key || ""); // Defaults to 3 months from now
      setCalendarViewMonth(next12Months[0]?.key || ""); // Defaults to current month
    }
  }, [next12Months]);

  // Unified medical record states for editing
  const [medicalEditOpen, setMedicalEditOpen] = useState(false);
  const [editConditions, setEditConditions] = useState<SelectedCondition[]>([]);
  const [editAllergies, setEditAllergies] = useState<AllergyRow[]>([]);
  const [editMedications, setEditMedications] = useState<MedicationRow[]>([]);
  const [editHabits, setEditHabits] = useState<HabitRow[]>([]);

  const openMedicalEditModal = () => {
    if (!data) return;
    setEditConditions(
      (data.conditions ?? []).map((c) => ({
        condition: c.condition,
        category: c.category || "General",
        notes: c.notes || "",
      }))
    );
    setEditAllergies(
      (data.allergies ?? []).map((a) => ({
        substance: a.substance,
        severity: a.severity || "Moderate",
        reaction: a.reaction || "",
        notes: a.notes || "",
      }))
    );
    setEditMedications(
      (data.medications ?? []).map((m) => ({
        medication: m.medication,
        dosage: m.dosage || "",
        frequency: m.frequency || "",
        duration: m.duration || "",
        notes: m.notes || "",
      }))
    );
    setEditHabits(
      (data.habits ?? []).map((h) => ({
        habit: h.habit,
        notes: h.notes || "",
      }))
    );
    setMedicalEditOpen(true);
  };

  // Edit patient form state
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other">("male");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [patientType, setPatientType] = useState<PatientType>("regular");

  const [selectedVisitDay, setSelectedVisitDay] = useState<VisitDayGroup | null>(null);
  const [selectedTreatmentGroup, setSelectedTreatmentGroup] = useState<TreatmentTimelineGroup | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["patient", patientId],
    queryFn: async () => {
      const [patient, conditions, allergies, medications, habits, appts, visits, treatments, invoices, followups, payments] =
        await Promise.all([
          supabase.from("patients").select("*").eq("id", patientId).single(),
          supabase.from("medical_conditions").select("*").eq("patient_id", patientId),
          supabase.from("allergies").select("*").eq("patient_id", patientId),
          supabase.from("medications").select("*").eq("patient_id", patientId),
          supabase.from("patient_habits").select("*").eq("patient_id", patientId),
          supabase
            .from("appointments")
            .select("*, profiles(name)")
            .eq("patient_id", patientId)
            .order("appointment_date", { ascending: false })
            .limit(40),
          supabase
            .from("visits")
            .select("*, profiles(name)")
            .eq("patient_id", patientId)
            .order("visit_date", { ascending: false })
            .limit(40),
          supabase
            .from("treatments")
            .select("id, visit_id, name, description, status, treatment_date, cost, tooth_number, notes, created_at")
            .eq("patient_id", patientId)
            .order("treatment_date", { ascending: false })
            .limit(80),
          supabase
            .from("invoices")
            .select("*")
            .eq("patient_id", patientId)
            .order("invoice_date", { ascending: false })
            .limit(40),
          supabase
            .from("follow_ups")
            .select("*")
            .eq("patient_id", patientId)
            .order("due_date", { ascending: false }),
          supabase
            .from("payments")
            .select("id, amount, payment_date, payment_method, notes, invoice_id, invoices(invoice_number)")
            .eq("patient_id", patientId)
            .order("payment_date", { ascending: false })
            .limit(40),
        ]);

      if (patient.error) throw patient.error;

      const invoiceRows = invoices.data ?? [];
      const invoiceIds = invoiceRows.map((inv) => inv.id);
      let installmentPlans: Array<{
        id: string;
        status: string;
        number_of_installments: number;
        installment_amount: number;
        invoice_id: string;
        invoices?: {
          id: string;
          invoice_number: string;
          grand_total: number;
          paid_amount: number;
          balance_amount: number;
        } | null;
        installments?: Array<{
          id: string;
          due_date: string;
          amount: number;
          paid_amount: number;
          status: string;
        }>;
      }> = [];

      if (invoiceIds.length > 0) {
        const { data: plans } = await supabase
          .from("installment_plans")
          .select("*, invoices(id, invoice_number, grand_total, paid_amount, balance_amount), installments(*)")
          .in("invoice_id", invoiceIds)
          .eq("status", "active")
          .order("created_at", { ascending: false });
        installmentPlans = plans ?? [];
      }

      return {
        patient: patient.data,
        conditions: conditions.data ?? [],
        allergies: allergies.data ?? [],
        medications: medications.data ?? [],
        habits: habits.data ?? [],
        appointments: appts.data ?? [],
        visits: (visits.data ?? []) as PatientVisitRow[],
        treatments: (treatments.data ?? []) as PatientTreatmentRow[],
        invoices: invoiceRows,
        followups: followups.data ?? [],
        payments: payments.data ?? [],
        installmentPlans,
      };
    },
  });

  const visitDays = useMemo(
    () => groupVisitsByDate(data?.visits ?? [], data?.treatments ?? []),
    [data?.visits, data?.treatments],
  );

  const treatmentTimeline = useMemo(
    () => groupTreatmentsForTimeline(data?.treatments ?? []),
    [data?.treatments],
  );

  const openEditModal = () => {
    if (!data?.patient) return;
    const p = data.patient;
    setFullName(p.full_name ?? "");
    setPhone(patientPhoneDigits(p.phone ?? ""));
    setEmail(p.email ?? "");
    setDob(p.date_of_birth ?? "");
    setGender((p.gender as "male" | "female" | "other") ?? "male");
    setAddress(p.address ?? "");
    setEmergencyContact(p.emergency_contact ?? "");
    let rawType = p.patient_type || "regular";
    if (rawType === "standard") rawType = "regular";
    setPatientType((rawType as PatientType) ?? "regular");
    setEditOpen(true);
  };

  const updatePatientMutation = useMutation({
    mutationFn: async () => {
      if (!fullName.trim()) throw new Error("Patient name is required.");
      if (!isPatientPhone(phone)) throw new Error("Enter a 10-digit phone number.");
      const digits = patientPhoneDigits(phone);
      const tagged = (data?.patient?.phone ?? "").trim().match(/^(.*)\+(\d+)$/);
      const savePhone = tagged ? `${digits}+${tagged[2]}` : digits;

      const { error } = await supabase
        .from("patients")
        .update({
          full_name: fullName.trim(),
          phone: savePhone,
          email: email.trim() || null,
          date_of_birth: dob || null,
          gender,
          address: address.trim() || null,
          emergency_contact: emergencyContact.trim() || null,
          patient_type: patientType,
          updated_at: new Date().toISOString(),
        })
        .eq("id", patientId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Patient details updated.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      setEditOpen(false);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to update patient.")),
  });

  const openAddFollowUp = () => {
    setEditingFollowUpId(null);
    setFReason("");
    setFDueDate(todayISO());
    setFNotes("");
    setFollowUpOpen(true);
  };

  const openEditFollowUp = (fu: any) => {
    const previous = splitPreviousDue(fu.notes);
    setEditingFollowUpId(fu.id);
    setEditingOriginalDue(fu.due_date);
    setEditingPreviousDue(previous.previousDue);
    setFReason(fu.reason);
    setFDueDate(fu.due_date);
    setFNotes(previous.notes);
    setFollowUpOpen(true);
  };

  const openCollect = (
    invoice: { id: string; invoice_number: string; balance_amount: number },
    target?: CollectTargetInstallment | null,
  ) => {
    setCollectInvoice(invoice);
    setCollectTarget(target ?? null);
    const due = target
      ? Math.max(0, Number(target.amount) - Number(target.paid_amount || 0))
      : Math.max(0, Number(invoice.balance_amount) || 0);
    setCollectAmount(String(due));
    setCollectMethod("cash");
    setCollectRef("");
    setCollectNotes("");
    setCollectAmountError(null);
    setCollectOpen(true);
  };

  const collectPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!collectInvoice) throw new Error("Select an invoice to pay.");
      if (!profile?.clinic_id || !profile.id) throw new Error("Clinic session not active.");
      const amt = Number(collectAmount);
      if (Number.isNaN(amt) || amt <= 0) throw new Error("Enter a valid payment amount.");
      const maxBalance = Math.max(0, Number(collectInvoice.balance_amount) || 0);
      if (amt > maxBalance + 0.001) {
        throw new Error(
          `Payment cannot exceed balance due of ${formatCurrency(maxBalance, profile.clinic?.currency ?? "INR")}.`,
        );
      }
      return recordInvoicePayment({
        clinicId: profile.clinic_id,
        recordedBy: profile.id,
        invoiceId: collectInvoice.id,
        invoiceNumber: collectInvoice.invoice_number,
        patientId,
        patientName: data?.patient.full_name ?? "Patient",
        balanceAmount: maxBalance,
        amount: amt,
        paymentMethod: collectMethod,
        reference: collectRef,
        notes: collectNotes,
        targetInstallment: collectTarget,
      });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["payments-history"] });
      void qc.invalidateQueries({ queryKey: ["active-installment-plans"] });
      void qc.invalidateQueries({ queryKey: ["outstanding-invoices"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["flow-balances"] });
      setCollectOpen(false);
      setCollectInvoice(null);
      setCollectTarget(null);
      toast.success(
        result.remaining > 0
          ? `Payment recorded. Balance due ${formatCurrency(result.remaining, profile?.clinic?.currency ?? "INR")}.`
          : "Payment recorded. Invoice settled.",
      );
    },
    onError: (err) => {
      const msg = friendlyError(err, "Unable to record payment.");
      setCollectAmountError(msg);
      toast.error(msg);
    },
  });

  const saveFollowUpMutation = useMutation({
    mutationFn: async () => {
      if (!fReason.trim()) throw new Error("Enter follow-up reason.");
      if (!fDueDate) throw new Error("Select a due date.");
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");

      if (editingFollowUpId) {
        const previousDue =
          editingOriginalDue && fDueDate !== editingOriginalDue
            ? editingOriginalDue
            : editingPreviousDue;
        const { error } = await supabase
          .from("follow_ups")
          .update({
            reason: fReason.trim(),
            due_date: fDueDate,
            notes: withPreviousDue(fNotes, previousDue),
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingFollowUpId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("follow_ups").insert({
          clinic_id: profile.clinic_id,
          patient_id: patientId,
          reason: fReason.trim(),
          due_date: fDueDate,
          notes: fNotes.trim() || null,
          status: "pending",
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingFollowUpId ? "Follow-up rescheduled." : "Follow-up scheduled.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
      setFollowUpOpen(false);
      setEditingFollowUpId(null);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to save follow-up.")),
  });

  const toggleFollowUpStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "scheduled" | "completed" | "overdue" }) => {
      const { error } = await supabase
        .from("follow_ups")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up status updated.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to update status.")),
  });

  const deleteFollowUpMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("follow_ups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Follow-up deleted.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to delete follow-up.")),
  });

  const clearAllFollowUpsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("follow_ups").delete().eq("patient_id", patientId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("All follow-ups for this patient cleared.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to clear follow-ups.")),
  });

  const followUpPlanImpact = useMemo(() => {
    const existingFollowUps = (data?.followups ?? []).filter((fu) => fu.status !== "completed");
    const existingKeys = new Set(existingFollowUps.map((fu) => fu.due_date));
    const targetDatesList: string[] = [];
    const next12 = getNext12Months();

    if (fuMode === "monthly") {
      const rangeMonths = next12.filter((m) => {
        const d = getClampedDate(m.year, m.monthIndex, fuDayOfMonth);
        return m.key <= fuUntilMonth && localDateKey(d) >= todayISO();
      });
      rangeMonths.forEach((m) => {
        if (fuExcludedMonths.includes(m.key)) return;
        const d = getClampedDate(m.year, m.monthIndex, fuDayOfMonth);
        targetDatesList.push(localDateKey(d));
      });
    } else {
      const endLimitDateStr = `${fuUntilMonth}-31`;
      selectedManualDates.forEach((dStr) => {
        if (dStr <= endLimitDateStr) targetDatesList.push(dStr);
      });
    }

    const nextKeys = new Set(targetDatesList);
    const toCreateKeys = targetDatesList.filter((key) => !existingKeys.has(key));
    const toCancelIds: string[] = [];
    if (fuMode === "monthly") {
      existingFollowUps.forEach((fu) => {
        const mKey = fu.due_date.substring(0, 7);
        if (fuExcludedMonths.includes(mKey)) toCancelIds.push(fu.id);
      });
    } else {
      existingFollowUps.forEach((fu) => {
        if (!nextKeys.has(fu.due_date)) toCancelIds.push(fu.id);
      });
    }

    const toRemove = existingFollowUps.filter((fu) => toCancelIds.includes(fu.id));
    return { toCreateKeys, toCancelIds, toRemove, toAddCount: toCreateKeys.length };
  }, [
    data?.followups,
    fuDayOfMonth,
    fuExcludedMonths,
    fuMode,
    fuUntilMonth,
    selectedManualDates,
  ]);

  const saveFollowUpPlanMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");

      const { toCreateKeys, toCancelIds } = followUpPlanImpact;

      // Step 4: Run Transactions sequentially to ensure type safety
      if (toCancelIds.length > 0) {
        const { error } = await supabase
          .from("follow_ups")
          .delete()
          .in("id", toCancelIds);
        if (error) throw error;
      }

      if (toCreateKeys.length > 0) {
        const fuInserts = toCreateKeys.map((dateKey) => ({
          clinic_id: profile.clinic_id,
          patient_id: patientId,
          reason: "Follow-up Checkup",
          due_date: dateKey,
          status: "scheduled" as const,
          created_by: profile.id,
        }));
        const { error: fuErr } = await supabase.from("follow_ups").insert(fuInserts);
        if (fuErr) throw fuErr;
      }
    },
    onSuccess: () => {
      toast.success("Follow-up schedule plan updated.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
      setSchedulerOpen(false);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to save follow-up plan.")),
  });

  // Unified Medical Profile Save Mutation
  const updateMedicalRecordsMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");

      await replacePatientMedicalProfile({
        patientId,
        conditions: editConditions
          .filter((c) => c.condition.trim())
          .map((c) => ({
            condition: c.condition.trim(),
            category: c.category || "General",
            notes: c.notes || "",
          })),
        allergies: editAllergies
          .filter((a) => a.substance)
          .map((a) => ({
            substance: a.substance,
            severity: a.severity || "",
            reaction: a.reaction || "",
            notes: a.notes || "",
          })),
        medications: editMedications
          .filter((m) => m.medication)
          .map((m) => ({
            medication: m.medication,
            dosage: m.dosage || "",
            frequency: m.frequency || "",
            duration: m.duration || "",
            notes: m.notes || "",
          })),
        habits: editHabits
          .filter((h) => h.habit)
          .map((h) => ({
            habit: h.habit,
            notes: h.notes || "",
          })),
      });
    },
    onSuccess: () => {
      toast.success("Medical profile updated.");
      void qc.invalidateQueries({ queryKey: ["patient", patientId] });
      setMedicalEditOpen(false);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to update medical profile.")),
  });

  if (isError)
    return (
      <AppShell>
        <ErrorState title="Unable to load this patient." onRetry={() => refetch()} />
      </AppShell>
    );
  if (isLoading || !data)
    return (
      <AppShell>
        <LoadingCards count={3} />
      </AppShell>
    );

  const { patient } = data;

  const currentMonthData = next12Months.find((m) => m.key === calendarViewMonth) || next12Months[0];

  const getDaysInMonth = (year: number, month: number) => {
    const date = new Date(year, month, 1);
    const daysArr = [];
    while (date.getMonth() === month) {
      daysArr.push(new Date(date));
      date.setDate(date.getDate() + 1);
    }
    return daysArr;
  };

  const days = currentMonthData ? getDaysInMonth(currentMonthData.year, currentMonthData.monthIndex) : [];
  const firstDayOfWeek = days.length > 0 ? (days[0]?.getDay() ?? 0) : 0;

  return (
    <AppShell>
      <div className="mb-4 print:hidden">
        <Button asChild variant="ghost" size="sm" className="gap-1 px-0">
          <Link to="/patients">
            <ArrowLeft className="size-4" aria-hidden /> Back to Patients
          </Link>
        </Button>
      </div>
      <PageHeader
        title={patient.full_name}
        description={`${patient.patient_code} · ${patient.phone}`}
        action={
          <div className="flex w-full min-w-0 items-center gap-2">
            {patient.phone ? (
              <a
                href={`tel:${patient.phone}`}
                className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 text-xs font-medium text-ink-700 transition-colors duration-150 hover:bg-surface-2 sm:h-9 sm:flex-none"
              >
                <Phone className="size-3.5" aria-hidden /> Call
              </a>
            ) : null}
            {patient.phone ? (
              <a
                href={whatsappLink(patient.phone, `Hi ${patient.full_name}, this is a message from our dental clinic.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-1 px-3 text-xs font-medium text-ink-700 transition-colors duration-150 hover:bg-surface-2 sm:h-9 sm:flex-none"
              >
                <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
              </a>
            ) : null}
            <RowActions
              items={[{ label: "Edit", icon: Pencil, onSelect: openEditModal }]}
            />
          </div>
        }
      />

      {data.allergies.length > 0 ? (
        <div className="surface-card mb-4 border-destructive/40 bg-destructive/10 p-3 text-sm">
          <strong>Allergies:</strong> {data.allergies.map((a) => a.substance).join(", ")}
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PatientTab)}>
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="appointments">Appts ({data.appointments.length})</TabsTrigger>
          <TabsTrigger value="clinical">Visits ({visitDays.length})</TabsTrigger>
          <TabsTrigger value="billing">Bills ({data.invoices.length})</TabsTrigger>
          <TabsTrigger value="followups">Follow-ups ({data.followups.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 grid gap-4 md:grid-cols-2">
          <Section title="Demographics">
            <div className="space-y-2 text-sm">
              <p className="font-medium text-ink-900">
                {patient.phone}
                {patient.patient_type
                  ? ` · ${PATIENT_TYPE_LABELS[patient.patient_type as PatientType] ?? patient.patient_type}`
                  : " · Standard"}
              </p>
              <p className="text-xs text-ink-500">
                {[patient.gender, patient.date_of_birth ? `DOB ${patient.date_of_birth}` : null, patient.email]
                  .filter(Boolean)
                  .join(" · ") || "No extra details"}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="px-0 text-primary"
                onClick={() => setDemographicsOpen((v) => !v)}
              >
                {demographicsOpen ? "Hide details" : "Details"}
              </Button>
              {demographicsOpen ? (
                <div className="space-y-1.5 border-t border-line pt-2 text-xs">
                  <Row label="Full Name" value={patient.full_name} />
                  <Row label="Patient Code" value={patient.patient_code} />
                  <Row label="Phone" value={patient.phone} />
                  <Row label="Email" value={patient.email ?? "—"} />
                  <Row label="Gender" value={patient.gender ?? "—"} />
                  <Row label="Date of Birth" value={patient.date_of_birth ?? "—"} />
                  <Row
                    label="Patient Type"
                    value={
                      patient.patient_type && patient.patient_type in PATIENT_TYPE_LABELS
                        ? PATIENT_TYPE_LABELS[patient.patient_type as PatientType]
                        : "Regular"
                    }
                  />
                  <Row label="Emergency Contact" value={patient.emergency_contact ?? "—"} />
                  <Row label="Address" value={patient.address ?? "—"} />
                </div>
              ) : null}
            </div>
          </Section>

          <Section title="Summary Stats">
            <div className="grid grid-cols-2 gap-2 text-center text-xs">
              <div className="surface-card p-3 border rounded-lg">
                <p className="text-lg font-semibold text-primary sm:text-xl">{visitDays.length}</p>
                <p className="text-muted-foreground mt-0.5">Visits</p>
              </div>
              <div className="surface-card p-3 border rounded-lg">
                <p className="text-lg font-semibold text-foreground sm:text-xl">{data.invoices.length}</p>
                <p className="text-muted-foreground mt-0.5">Invoices</p>
              </div>
            </div>
          </Section>

          <div className="space-y-4 md:col-span-2">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Patient Medical Profile
            </h3>
            <Button size="sm" variant="outline" onClick={openMedicalEditModal}>
              <Pencil className="size-3.5 mr-1.5" /> Edit Medical Profile
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="surface-card p-4 rounded-xl border space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Medical Conditions
              </h4>
              {data.conditions.length ? (
                <div className="space-y-2">
                  {data.conditions.map((c) => (
                    <div key={c.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                      <p className="font-semibold text-foreground">{c.condition}</p>
                      {c.category ? <p className="text-[10px] text-muted-foreground">Category: {c.category}</p> : null}
                      {c.notes ? <p className="text-[10px] text-muted-foreground mt-0.5">Notes: {c.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Muted>No recorded medical conditions.</Muted>
              )}
            </div>

            <div className="surface-card p-4 rounded-xl border space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Allergies
              </h4>
              {data.allergies.length ? (
                <div className="space-y-2">
                  {data.allergies.map((a) => (
                    <div key={a.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-foreground">{a.substance}</span>
                        {a.severity ? (
                          <StatusChip tone={a.severity === "Severe" ? "danger" : "warning"}>
                            {a.severity}
                          </StatusChip>
                        ) : null}
                      </div>
                      {a.reaction ? <p className="text-[10px] text-muted-foreground mt-0.5">Reaction: {a.reaction}</p> : null}
                      {a.notes ? <p className="text-[10px] text-muted-foreground mt-0.5">Notes: {a.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Muted>No recorded allergies.</Muted>
              )}
            </div>

            <div className="surface-card p-4 rounded-xl border space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Active Medications
              </h4>
              {data.medications.length ? (
                <div className="space-y-2">
                  {data.medications.map((m) => (
                    <div key={m.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                      <p className="font-semibold text-foreground">{m.medication}</p>
                      <p className="text-muted-foreground mt-0.5">
                        {[m.dosage, m.frequency, m.duration].filter(Boolean).join(" · ") || "No dosage notes"}
                      </p>
                      {m.notes ? <p className="text-[10px] text-muted-foreground mt-0.5">Notes: {m.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Muted>No active medications.</Muted>
              )}
            </div>

            <div className="surface-card p-4 rounded-xl border space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Patient Habits
              </h4>
              {data.habits.length ? (
                <div className="space-y-2">
                  {data.habits.map((h) => (
                    <div key={h.id} className="text-xs border-b pb-2 last:border-0 last:pb-0">
                      <p className="font-semibold text-foreground">{h.habit}</p>
                      {h.notes ? <p className="text-[10px] text-muted-foreground mt-0.5">Notes: {h.notes}</p> : null}
                    </div>
                  ))}
                </div>
              ) : (
                <Muted>No recorded habits.</Muted>
              )}
            </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <Section title="Treatments Timeline">
              {treatmentTimeline.length ? (
                <div className="space-y-8">
                  {(showAllTreatments ? treatmentTimeline : treatmentTimeline.slice(0, 3)).map((group) => (
                    <div key={group.name} className="space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="text-base font-semibold text-primary">{group.name}</h3>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedTreatmentGroup(group)}
                        >
                          <Eye className="size-3.5 mr-1.5" aria-hidden />
                          See Details
                        </Button>
                      </div>

                      <div className="inline-flex gap-6 rounded-lg border bg-surface-2/80 px-4 py-2.5 text-xs">
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</p>
                          <p className="font-semibold text-foreground">{group.type}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Sessions</p>
                          <p className="font-semibold text-foreground">{group.sessions.length}</p>
                        </div>
                      </div>

                      <div className="relative pl-6 space-y-4">
                        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-primary/30" aria-hidden />

                        {group.sessions.map((session) => (
                          <div key={session.id} className="relative">
                            <div className="absolute -left-6 top-3 size-3.5 rounded-full border-2 border-primary bg-surface-1" aria-hidden />

                            <div className="mb-2">
                              <StatusChip tone={treatmentStatusTone(session.status)}>
                                {treatmentStatusLabel(session.status)}
                              </StatusChip>
                            </div>

                            <div className="rounded-xl border bg-surface-1 p-4 shadow-2xs">
                              <p className="text-sm font-semibold text-primary">
                                Session {session.sessionNumber} {session.sessionLabel}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {formatTimelineStamp(session.created_at || session.treatment_date)}
                                {" — "}
                                {formatCurrency(session.cost, profile?.clinic?.currency ?? "INR")}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {treatmentTimeline.length > 3 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setShowAllTreatments((v) => !v)}
                    >
                      {showAllTreatments
                        ? "Show less"
                        : `Show all (${treatmentTimeline.length})`}
                    </Button>
                  ) : null}
                </div>
              ) : (
                <Muted>No treatments recorded yet.</Muted>
              )}
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="appointments" className="mt-4 space-y-3">
          {data.appointments.length ? (
            data.appointments.map((appt) => (
              <div key={appt.id} className="surface-card flex items-center justify-between p-3.5 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-medium">
                    <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
                    <span>{formatDate(appt.appointment_date)} at {formatTime(appt.start_time)}</span>
                  </div>
                  {appt.reason ? <p className="text-muted-foreground">Reason: {appt.reason}</p> : null}
                  {(appt.profiles as unknown as { name?: string })?.name ? (
                    <p className="text-muted-foreground">Dentist: {(appt.profiles as unknown as { name?: string })?.name}</p>
                  ) : null}
                </div>
                <div className="space-y-1.5 text-right">
                  <div className="flex flex-wrap justify-end gap-1">
                    <StatusChip tone={appointmentStatusTone(appt.appointment_status)}>
                      {appt.appointment_status.replaceAll("_", " ")}
                    </StatusChip>
                    <StatusChip tone={flowStatusTone(appt.flow_status)}>
                      {FLOW_LABELS[appt.flow_status]}
                    </StatusChip>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <Muted>No appointment history for this patient.</Muted>
          )}
        </TabsContent>

        <TabsContent value="clinical" className="mt-4 space-y-3">
          {visitDays.length ? (
            visitDays.map((day) => (
              <div key={day.date} className="surface-card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{formatDate(day.date)}</p>
                  {day.doctorNames.length ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Doctor: {day.doctorNames.join(", ")}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {day.treatments.length
                      ? `${day.treatments.length} treatment${day.treatments.length === 1 ? "" : "s"} on this day`
                      : "Visit recorded — tap Treatments for details"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setSelectedVisitDay(day)}
                >
                  <Stethoscope className="size-3.5 mr-1.5" aria-hidden />
                  Treatments
                  {day.treatments.length ? ` (${day.treatments.length})` : ""}
                </Button>
              </div>
            ))
          ) : (
            <Muted>No clinical visits recorded for this patient.</Muted>
          )}
        </TabsContent>

        <TabsContent value="billing" className="mt-4 space-y-4">
          {(() => {
            const currency = profile?.clinic?.currency ?? "INR";
            const invoices = data.invoices ?? [];
            const payments = data.payments ?? [];
            const plans = data.installmentPlans ?? [];
            const totalBilled = invoices.reduce((sum, inv) => sum + Number(inv.grand_total ?? 0), 0);
            const totalPaidFromPayments = payments.reduce((sum, p) => sum + Number(p.amount ?? 0), 0);
            const totalPaidFromInvoices = invoices.reduce((sum, inv) => sum + Number(inv.paid_amount ?? 0), 0);
            const totalPaid = Math.max(totalPaidFromPayments, totalPaidFromInvoices);
            const pendingBalance = invoices.reduce((sum, inv) => sum + Number(inv.balance_amount ?? 0), 0);

            return (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Kpi
                    label="Total Billed"
                    value={formatCurrency(totalBilled, currency)}
                    icon={CircleDollarSign}
                    accent="revenue"
                  />
                  <Kpi
                    label="Total Paid"
                    value={formatCurrency(totalPaid, currency)}
                    icon={Wallet}
                    accent="growth"
                  />
                  <Kpi
                    className="col-span-2 sm:col-span-1"
                    label="Due"
                    value={formatCurrency(pendingBalance, currency)}
                    icon={Wallet}
                    accent="balance"
                    tone={pendingBalance > 0 ? "danger" : "success"}
                  />
                </div>

                {(() => {
                  const outstandingInvoices = invoices
                    .filter((inv) => Number(inv.balance_amount ?? 0) > 0)
                    .sort(
                      (a, b) => Number(b.balance_amount ?? 0) - Number(a.balance_amount ?? 0),
                    );
                  const outstandingCollect = outstandingInvoices[0];
                  const lastInvoice = [...invoices].sort((a, b) =>
                    String(b.invoice_date ?? "").localeCompare(String(a.invoice_date ?? "")),
                  )[0];

                  return (
                    <div className="flex flex-wrap gap-2">
                      {outstandingCollect ? (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          onClick={() =>
                            openCollect({
                              id: outstandingCollect.id,
                              invoice_number: outstandingCollect.invoice_number,
                              balance_amount: Number(outstandingCollect.balance_amount ?? 0),
                            })
                          }
                        >
                          <Wallet className="size-3.5" aria-hidden />
                          Collect
                        </Button>
                      ) : null}
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <Link to="/billing" search={{ patientId }}>
                          <Plus className="size-3.5" aria-hidden />
                          New Invoice
                        </Link>
                      </Button>
                      {lastInvoice ? (
                        <Button asChild size="sm" variant="outline" className="gap-1.5">
                          <Link
                            to="/billing/$invoiceId"
                            params={{ invoiceId: lastInvoice.id }}
                            search={{ share: true }}
                          >
                            <MessageCircle className="size-3.5" aria-hidden />
                            WhatsApp last bill
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Ledger &amp; Payments
                  </h3>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Active Installment Plans
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {plans.length} active
                    </Badge>
                  </div>
                  {plans.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No active installment plans.</p>
                  ) : (
                    <div className="space-y-3">
                      {plans.map((plan) => {
                        const paidCount = (plan.installments ?? []).filter((i) => i.status === "paid").length;
                        const totalCount = plan.number_of_installments;
                        const percent = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 0;
                        const nextPending = [...(plan.installments ?? [])]
                          .filter((i) => i.status !== "paid")
                          .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
                        const inv = plan.invoices;
                        const planTotal = Number(inv?.grand_total ?? 0);
                        const planPaid = Number(inv?.paid_amount ?? 0);
                        const planBalance = Number(inv?.balance_amount ?? 0);
                        const nextAmount = nextPending
                          ? Math.max(0, Number(nextPending.amount) - Number(nextPending.paid_amount || 0))
                          : 0;

                        return (
                          <div key={plan.id} className="surface-card rounded-xl border p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-sm">{inv?.invoice_number ?? "Installment plan"}</p>
                                <p className="text-xs text-muted-foreground">
                                  Installment {paidCount} of {totalCount} collected
                                </p>
                              </div>
                              <Badge variant="outline" className="text-[10px]">
                                {totalCount}x plan
                              </Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-muted-foreground uppercase text-[10px]">Total</p>
                                <p className="font-semibold tabular-nums">{formatCurrency(planTotal, currency)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground uppercase text-[10px]">Paid</p>
                                <p className="font-semibold tabular-nums">{formatCurrency(planPaid, currency)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground uppercase text-[10px]">Due</p>
                                <p className="font-semibold tabular-nums text-destructive">
                                  {formatCurrency(planBalance, currency)}
                                </p>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[11px]">
                                <span className="text-muted-foreground">Progress</span>
                                <span className="font-medium">{percent}%</span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                                <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <p className="text-xs text-muted-foreground">
                                {nextPending
                                  ? `Next: ${formatDate(nextPending.due_date)} · ${formatCurrency(nextAmount, currency)}/installment`
                                  : "Fully collected"}
                              </p>
                              {nextPending && inv?.id ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() =>
                                    openCollect(
                                      {
                                        id: inv.id,
                                        invoice_number: inv.invoice_number,
                                        balance_amount: Number(inv.balance_amount ?? 0),
                                      },
                                      {
                                        id: nextPending.id,
                                        amount: Number(nextPending.amount),
                                        paid_amount: Number(nextPending.paid_amount || 0),
                                        planId: plan.id,
                                        totalCount: totalCount,
                                        index: (plan.installments ?? []).findIndex(
                                          (i) => i.id === nextPending.id,
                                        ),
                                      },
                                    )
                                  }
                                >
                                  <Wallet className="size-3.5" aria-hidden />
                                  Collect Installment
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Payment History
                    </h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {payments.length} records
                    </Badge>
                  </div>
                  {payments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No payments recorded yet.</p>
                  ) : (
                    <div className="divide-y rounded-lg border text-xs">
                      {payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between p-3.5 surface-card gap-3">
                          <div>
                            <p className="font-semibold tabular-nums">
                              {formatCurrency(Number(p.amount), currency)}
                            </p>
                            <p className="text-muted-foreground">
                              {PAYMENT_METHOD_LABELS[p.payment_method as keyof typeof PAYMENT_METHOD_LABELS] ??
                                p.payment_method}{" "}
                              · {formatDate(p.payment_date)}
                            </p>
                            {p.invoices && "invoice_number" in p.invoices && p.invoices.invoice_number ? (
                              <p className="text-[11px] text-muted-foreground">
                                Invoice {String(p.invoices.invoice_number)}
                              </p>
                            ) : null}
                          </div>
                          <StatusChip tone="success">Paid</StatusChip>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Invoices
                  </h3>
                  {invoices.length ? (
                    invoices.map((inv) => (
              <Link
                key={inv.id}
                to="/billing/$invoiceId"
                params={{ invoiceId: inv.id }}
                className="surface-card flex items-center justify-between p-3.5 text-xs hover:bg-accent/30 block"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{inv.invoice_number}</span>
                    <StatusChip
                      tone={invoiceStatusTone(inv.status, Number(inv.balance_amount))}
                    >
                      {invoiceStatusLabel(inv.status, Number(inv.balance_amount))}
                    </StatusChip>
                  </div>
                  <p className="text-muted-foreground mt-0.5">{formatDate(inv.invoice_date)}</p>
                </div>
                <div className="text-right">
                          <p className="font-semibold tabular-nums">{formatCurrency(inv.grand_total, currency)}</p>
                  {Number(inv.balance_amount) > 0 ? (
                            <p className="text-destructive font-medium tabular-nums">
                              Due: {formatCurrency(inv.balance_amount, currency)}
                            </p>
                  ) : (
                    <StatusChip tone="success">Paid</StatusChip>
                  )}
                </div>
              </Link>
            ))
          ) : (
            <Muted>No billing invoices for this patient.</Muted>
          )}
          </div>
              </>
            );
          })()}
        </TabsContent>

        <TabsContent value="followups" className="mt-4 space-y-3">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Follow-up Recall Reminders
            </h3>
            <div className="flex items-center gap-2">
              {data.followups.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 text-xs border-destructive/30"
                  onClick={() => setClearAllFollowUpsOpen(true)}
                  disabled={clearAllFollowUpsMutation.isPending}
                >
                  <Trash2 className="size-3.5 mr-1" aria-hidden /> Clear All
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => setSchedulerOpen(true)}>
                <CalendarDays className="size-3.5 mr-1.5" aria-hidden /> Schedule Plan
              </Button>
            </div>
          </div>
          {data.followups.length ? (
            <div className="space-y-2">
              {data.followups.map((fu) => (
                <div key={fu.id} className="surface-card flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 text-xs border rounded-lg gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-medium">
                      <span className="font-semibold text-sm">{fu.reason}</span>
                      <StatusChip
                        tone={followUpStatusTone({
                          status: fu.status,
                          overdue: fu.status === "overdue" || (fu.status !== "completed" && fu.due_date < todayISO()),
                        })}
                      >
                        {followUpStatusLabel({
                          status: fu.status,
                          overdue: fu.status === "overdue" || (fu.status !== "completed" && fu.due_date < todayISO()),
                        })}
                      </StatusChip>
                    </div>
                    {splitPreviousDue(fu.notes).notes ? (
                      <p className="text-muted-foreground">Notes: {splitPreviousDue(fu.notes).notes}</p>
                    ) : null}
                    {splitPreviousDue(fu.notes).previousDue ? (
                      <span
                        className="inline-flex items-center rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-ink-500"
                        title="Previous date"
                      >
                        {formatDayMonth(splitPreviousDue(fu.notes).previousDue)}
                      </span>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      Created: {formatDate(fu.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 justify-between sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="font-medium text-foreground">
                        Due: {formatDate(fu.due_date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {fu.status !== "completed" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="px-2"
                          onClick={() => toggleFollowUpStatusMutation.mutate({ id: fu.id, status: "completed" })}
                        >
                          Complete
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 text-muted-foreground hover:text-foreground"
                        onClick={() => openEditFollowUp(fu)}
                      >
                        Reschedule
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="px-2 text-destructive hover:bg-destructive/5"
                        onClick={() => setDeleteFollowUpId(fu.id)}
                        aria-label="Delete follow-up"
                      >
                        <Trash2 className="size-3.5 mr-1" aria-hidden />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Muted>No follow-ups scheduled.</Muted>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Medical Records Modal */}
      <Dialog open={medicalEditOpen} onOpenChange={setMedicalEditOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Medical Profile</DialogTitle>
            <DialogDescription>
              Update patient's medical history, allergies, medications, and habits.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMedicalRecordsMutation.mutate();
            }}
            className="space-y-4"
          >
            <MedicalRecordsForm
              conditions={editConditions}
              onChangeConditions={setEditConditions}
              allergies={editAllergies}
              onChangeAllergies={setEditAllergies}
              medications={editMedications}
              onChangeMedications={setEditMedications}
              habits={editHabits}
              onChangeHabits={setEditHabits}
            />

            <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t mt-4 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setMedicalEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updateMedicalRecordsMutation.isPending}>
                {updateMedicalRecordsMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : null}
                Save Medical Profile
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Patient Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Patient Details</DialogTitle>
            <DialogDescription>Update demographics, phone number, and contact info.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              updatePatientMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name *</Label>
              <Input
                id="edit-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Phone *</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  required
                  value={phone}
                  onChange={(e) => setPhone(patientPhoneDigits(e.target.value))}
                />
                {familyPhoneLabel(data?.patient?.phone ?? "") ? (
                  <p className="text-xs text-ink-500">{familyPhoneLabel(data?.patient?.phone ?? "")}</p>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="edit-dob">Date of birth</Label>
                <Input
                  id="edit-dob"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-gender">Gender</Label>
                <Select value={gender} onValueChange={(v) => setGender(v as "male" | "female" | "other")}>
                  <SelectTrigger id="edit-gender">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-type">Patient type</Label>
              <Select
                value={patientType}
                onValueChange={(v) => setPatientType(v as PatientType)}
              >
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PATIENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PATIENT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-address">Address</Label>
              <Textarea
                id="edit-address"
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-emg">Emergency contact</Label>
              <Input
                id="edit-emg"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={updatePatientMutation.isPending}>
                {updatePatientMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : null}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Follow-up Modal */}
      <Dialog open={followUpOpen} onOpenChange={setFollowUpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFollowUpId ? "Reschedule Follow-up" : "Schedule Follow-up"}</DialogTitle>
            <DialogDescription>
              {editingFollowUpId
                ? "Modify follow-up details or change the recall due date."
                : "Schedule a post-treatment clinical follow-up or routine checkup reminder."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveFollowUpMutation.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="fu-reason">Reason *</Label>
              <Input
                id="fu-reason"
                required
                value={fReason}
                onChange={(e) => setFReason(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="fu-due">Due Date *</Label>
              <Input
                id="fu-due"
                type="date"
                required
                value={fDueDate}
                onChange={(e) => setFDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="fu-notes">Notes</Label>
              <Textarea
                id="fu-notes"
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setFollowUpOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveFollowUpMutation.isPending}>
                {saveFollowUpMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : null}
                {editingFollowUpId ? "Reschedule" : "Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Follow-up Scheduler Plan Modal */}
      <Dialog open={schedulerOpen} onOpenChange={setSchedulerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Follow-up Plan</DialogTitle>
            <DialogDescription>
              Select the month limit and configure automatic or manual follow-up dates.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4 text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              saveFollowUpPlanMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="fu-mode">Scheduling Mode</Label>
              <Select value={fuMode} onValueChange={(v) => setFuMode(v as any)}>
                <SelectTrigger id="fu-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Automatic (each month)</SelectItem>
                  <SelectItem value="dates">Pick dates manually</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fu-limit">Up to month</Label>
              <Select value={fuUntilMonth} onValueChange={setFuUntilMonth}>
                <SelectTrigger id="fu-limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {next12Months.map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {fuMode === "monthly" ? (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                <div className="space-y-1.5">
                  <Label htmlFor="fu-day">Day of month</Label>
                  <Input
                    id="fu-day"
                    type="number"
                    min={1}
                    max={31}
                    value={fuDayOfMonth}
                    onChange={(e) => setFuDayOfMonth(Number(e.target.value))}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Months to include</Label>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto border rounded-md p-2 surface-card">
                    {next12Months
                      .filter((m) => {
                        const d = getClampedDate(m.year, m.monthIndex, fuDayOfMonth);
                        return m.key <= fuUntilMonth && localDateKey(d) >= todayISO();
                      })
                      .map((m) => {
                        const isExcluded = fuExcludedMonths.includes(m.key);
                        return (
                          <label key={m.key} className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-accent/40 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFuExcludedMonths(prev => prev.filter((k) => k !== m.key));
                                } else {
                                  setFuExcludedMonths(prev => [...prev, m.key]);
                                }
                              }}
                              className="rounded border-gray-300 text-primary focus:ring-primary h-3.5 w-3.5"
                            />
                            <span>{m.label}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 p-3 border rounded-lg bg-muted/20">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Label htmlFor="fu-cal-month">View Month</Label>
                  <Select value={calendarViewMonth} onValueChange={setCalendarViewMonth}>
                    <SelectTrigger id="fu-cal-month" className="w-full sm:w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {next12Months
                        .filter((m) => m.key <= fuUntilMonth)
                        .map((m) => (
                          <SelectItem key={m.key} value={m.key}>
                            {m.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Calendar Date Picker Grid */}
                <div className="space-y-1">
                  <div className="grid grid-cols-7 gap-1 text-center font-semibold text-[10px] text-muted-foreground mb-1">
                    <span>Su</span>
                    <span>Mo</span>
                    <span>Tu</span>
                    <span>We</span>
                    <span>Th</span>
                    <span>Fr</span>
                    <span>Sa</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1 justify-items-center">
                    {/* Padding empty days */}
                    {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                      <div key={`empty-${i}`} className="h-8 w-8" />
                    ))}
                    {/* Active days */}
                    {days.map((day) => {
                      const key = localDateKey(day);
                      const isSelected = selectedManualDates.includes(key);
                      const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));
                      const isBeyondLimit = key > `${fuUntilMonth}-31`;
                      const disabled = isPast || isBeyondLimit;
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedManualDates((prev) => prev.filter((d) => d !== key));
                            } else {
                              setSelectedManualDates((prev) => [...prev, key]);
                            }
                          }}
                          className={`h-7 w-7 text-[10px] rounded-full flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-primary text-primary-foreground font-semibold"
                              : "hover:bg-accent text-foreground"
                          } ${disabled ? "opacity-25 cursor-not-allowed" : ""}`}
                        >
                          {day.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Selected dates: {selectedManualDates.filter(d => d <= `${fuUntilMonth}-31`).length}
                </div>
              </div>
            )}

            {followUpPlanImpact.toRemove.length > 0 ? (
              <div className="rounded-lg border border-warning-line bg-warning-surface/50 p-3 text-[11px] text-ink-700">
                <p className="font-semibold text-warning-text">
                  {followUpPlanImpact.toRemove.length} scheduled recall
                  {followUpPlanImpact.toRemove.length === 1 ? "" : "s"} will be removed:
                </p>
                <ul className="mt-1.5 max-h-24 list-disc space-y-0.5 overflow-y-auto pl-4">
                  {followUpPlanImpact.toRemove.map((fu) => (
                    <li key={fu.id}>
                      {formatDate(fu.due_date)}
                      {fu.reason ? ` · ${fu.reason}` : ""}
                    </li>
                  ))}
                </ul>
                {followUpPlanImpact.toAddCount > 0 ? (
                  <p className="mt-2 text-ink-600">
                    {followUpPlanImpact.toAddCount} new date
                    {followUpPlanImpact.toAddCount === 1 ? "" : "s"} will be added.
                  </p>
                ) : null}
              </div>
            ) : followUpPlanImpact.toAddCount > 0 ? (
              <p className="text-[11px] text-ink-600">
                {followUpPlanImpact.toAddCount} new follow-up date
                {followUpPlanImpact.toAddCount === 1 ? "" : "s"} will be added.
              </p>
            ) : null}

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setSchedulerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveFollowUpPlanMutation.isPending}>
                {saveFollowUpPlanMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : null}
                Save Plan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedTreatmentGroup} onOpenChange={(open) => { if (!open) setSelectedTreatmentGroup(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedTreatmentGroup?.name ?? "Treatment Details"}</DialogTitle>
            <DialogDescription>
              Visit summary at top; each session&apos;s case note from Session 1 below.
            </DialogDescription>
          </DialogHeader>

          {selectedTreatmentGroup ? (() => {
            const anchorVisit = findAnchorVisitForGroup(selectedTreatmentGroup, data.visits);

            return (
              <div className="space-y-5">
                <div className="rounded-xl border bg-surface-2/50 p-4 space-y-4">
                  <ClinicalDetailField label="Dentist" value={anchorVisit?.doctor_notes?.trim() || anchorVisit?.profiles?.name} />
                  <ClinicalDetailField label="Chief Complaint" value={anchorVisit?.chief_complaint} />
                  <ClinicalDetailField label="Diagnosis" value={anchorVisit?.diagnosis} />
                  <ClinicalDetailField label="Post-Care Instructions for Patient" value={anchorVisit?.post_care_instructions} />
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Case Notes
                  </p>
                  {[...selectedTreatmentGroup.sessions].reverse().map((session) => {
                    const visit = findVisitForSession(session, data.visits);
                    const addedAt = visit?.created_at ?? session.created_at ?? session.treatment_date;
                    const note = getSessionClinicNote(session, visit, anchorVisit);

                    return (
                      <div
                        key={session.id}
                        className="rounded-lg border px-3 py-2.5 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-primary">
                            Session {session.sessionNumber} {session.sessionLabel}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {formatTimelineStamp(addedAt)}
                          </span>
                        </div>
                        <ClinicalDetailField label="Case Note" value={note?.trim() || "Nil"} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })() : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedTreatmentGroup(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedVisitDay} onOpenChange={(open) => { if (!open) setSelectedVisitDay(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Treatments — {selectedVisitDay ? formatDate(selectedVisitDay.date) : ""}
            </DialogTitle>
            <DialogDescription>
              All procedures done on this visit day.
            </DialogDescription>
          </DialogHeader>

          {selectedVisitDay ? (
            <div className="space-y-4 text-xs">
              {selectedVisitDay.treatments.length ? (
                selectedVisitDay.treatments.map((t) => (
                  <div key={t.id} className="rounded-xl border p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-foreground">{t.name}</p>
                      <StatusChip tone={treatmentStatusTone(t.status)} className="shrink-0 capitalize">
                        {treatmentStatusLabel(t.status)}
                      </StatusChip>
                    </div>
                    <div className="grid gap-1.5 text-muted-foreground">
                      <p><strong className="text-foreground">Cost:</strong> {formatCurrency(t.cost, profile?.clinic?.currency ?? "INR")}</p>
                      {t.tooth_number ? <p><strong className="text-foreground">Tooth:</strong> {t.tooth_number}</p> : null}
                      {t.description ? <p><strong className="text-foreground">Description:</strong> {t.description}</p> : null}
                      {t.notes ? <p><strong className="text-foreground">Notes:</strong> {t.notes}</p> : null}
                    </div>
                  </div>
                ))
              ) : (
                <Muted>No individual treatment records for this day.</Muted>
              )}

              {selectedVisitDay.visits.length ? (
                <div className="space-y-3 pt-2 border-t">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Visit Notes</p>
                  {selectedVisitDay.visits.map((visit) => (
                    <div key={visit.id} className="rounded-xl border bg-muted/30 p-3 space-y-1.5">
                      {visit.chief_complaint ? <p><strong>Chief Complaint:</strong> {visit.chief_complaint}</p> : null}
                      {visit.diagnosis ? <p><strong>Diagnosis:</strong> {visit.diagnosis}</p> : null}
                      {visit.treatment_performed ? <p><strong>Treatment Summary:</strong> {visit.treatment_performed}</p> : null}
                      {visit.clinical_notes ? <p><strong>Clinical Notes:</strong> {visit.clinical_notes}</p> : null}
                      {visit.post_care_instructions ? <p className="text-primary"><strong>Post-Care:</strong> {visit.post_care_instructions}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedVisitDay(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* In-place Collect */}
      <Dialog
        open={collectOpen}
        onOpenChange={(open) => {
          setCollectOpen(open);
          if (!open) {
            setCollectInvoice(null);
            setCollectTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {collectTarget
                ? `Collect · Installment #${collectTarget.index + 1}`
                : `Collect · ${collectInvoice?.invoice_number ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {collectTarget
                ? `This month ${formatCurrency(
                    Math.max(0, collectTarget.amount - collectTarget.paid_amount),
                    profile?.clinic?.currency ?? "INR",
                  )}. Stay on this patient record.`
                : `Pay toward invoice ${collectInvoice?.invoice_number ?? ""}.`}
            </DialogDescription>
          </DialogHeader>

          {collectInvoice ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                collectPaymentMutation.mutate();
              }}
            >
              <div className="flex justify-between border-b border-line py-2">
                <span className="text-sm text-ink-500">Balance due</span>
                <span className="font-bold tabular-nums text-destructive">
                  {formatCurrency(collectInvoice.balance_amount, profile?.clinic?.currency ?? "INR")}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="collect-amt">Amount *</Label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setCollectAmountError(null);
                      setCollectAmount(String(Math.max(0, Number(collectInvoice.balance_amount) || 0)));
                    }}
                  >
                    Use remaining
                  </Button>
                </div>
                <Input
                  id="collect-amt"
                  type="number"
                  step="0.01"
                  min={0}
                  max={Math.max(0, Number(collectInvoice.balance_amount) || 0)}
                  value={collectAmount}
                  required
                  aria-invalid={!!collectAmountError}
                  aria-describedby={collectAmountError ? "collect-amount-error" : undefined}
                  onChange={(e) => {
                    setCollectAmountError(null);
                    const maxBal = Math.max(0, Number(collectInvoice.balance_amount) || 0);
                    const next = Number(e.target.value);
                    if (!Number.isNaN(next) && next > maxBal) {
                      setCollectAmount(String(maxBal));
                      toast.message("Amount capped to outstanding balance.");
                      return;
                    }
                    setCollectAmount(e.target.value);
                  }}
                />
                {collectAmountError ? (
                  <p id="collect-amount-error" className="text-sm font-medium text-destructive">
                    {collectAmountError}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collect-method">Method *</Label>
                <Select value={collectMethod} onValueChange={setCollectMethod}>
                  <SelectTrigger id="collect-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collect-ref">Reference</Label>
                <Input
                  id="collect-ref"
                  value={collectRef}
                  onChange={(e) => setCollectRef(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="collect-notes">Notes</Label>
                <Textarea
                  id="collect-notes"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  rows={2}
                />
              </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCollectOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={collectPaymentMutation.isPending || !collectAmount}
            >
              {collectPaymentMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                "Record payment"
              )}
            </Button>
          </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteFollowUpId}
        onOpenChange={(open) => {
          if (!open) setDeleteFollowUpId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this follow-up?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the reminder permanently. You can add a new one later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteFollowUpId) deleteFollowUpMutation.mutate(deleteFollowUpId);
                setDeleteFollowUpId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearAllFollowUpsOpen} onOpenChange={setClearAllFollowUpsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all follow-ups?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every follow-up reminder for this patient.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                clearAllFollowUpsMutation.mutate();
                setClearAllFollowUpsOpen(false);
              }}
            >
              Clear all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right capitalize font-medium">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="surface-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
