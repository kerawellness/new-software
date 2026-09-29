import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  CheckCircle,
  ChevronDown,
  Loader2,
  Plus,
  Stethoscope,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DateScopeFilter } from "@/components/common/date-scope-filter";
import { Kpi } from "@/components/common/kpi";
import { PatientLine } from "@/components/common/patient-line";
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
import { friendlyError, logAudit } from "@/lib/audit";
import { clinicDoctorNames } from "@/lib/clinic-identity";
import {
  applyDateColumnFilter,
  createDateScope,
  dateScopeLabel,
  resolveDateScope,
  type DateScope,
} from "@/lib/date-scope";
import { getDemoVisits, isDemoId } from "@/lib/demo-data";
import { catalogueOptionLabel, formatCurrency, formatDate, todayISO, visitHasTreatment, visitKindCounts } from "@/lib/format";
import { cn } from "@/lib/utils";

type VisitKindFilter = "consultation" | "treatment" | "visited";

function appendClinicalNote(existing: string | null | undefined, date: string, note: string): string {
  const trimmed = note.trim();
  if (!trimmed) return existing?.trim() ?? "";
  const block = `--- ${date} ---\n${trimmed}`;
  return existing?.trim() ? `${existing.trim()}\n\n${block}` : block;
}

async function resolveAnchorVisitId(
  patientId: string,
  treatmentName: string,
  preferredVisitId: string | null,
): Promise<string | null> {
  if (preferredVisitId) return preferredVisitId;

  const { data: priorTreatments } = await supabase
    .from("treatments")
    .select("visit_id, created_at")
    .eq("patient_id", patientId)
    .eq("name", treatmentName)
    .not("visit_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  return priorTreatments?.[0]?.visit_id ?? null;
}

export const Route = createFileRoute("/_authenticated/treatments")({
  validateSearch: (search: Record<string, unknown>): {
    patientId?: string;
    kind?: VisitKindFilter;
  } => {
    const out: { patientId?: string; kind?: VisitKindFilter } = {};
    if (typeof search["patientId"] === "string") out.patientId = search["patientId"];
    if (
      search["kind"] === "consultation" ||
      search["kind"] === "treatment" ||
      search["kind"] === "visited"
    ) {
      out.kind = search["kind"];
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Visits & Treatments — VSP Software" },
      {
        name: "description",
        content: "Record clinical notes, diagnosis, performed treatments and post-care instructions.",
      },
    ],
  }),
  component: TreatmentsPage,
});

type VisitRow = {
  id: string;
  patient_id: string;
  visit_date: string;
  reason: string | null;
  chief_complaint: string | null;
  clinical_notes: string | null;
  diagnosis: string | null;
  treatment_performed: string | null;
  post_care_instructions: string | null;
  doctor_notes: string | null;
  patients: { id: string; full_name: string; patient_code: string; phone: string } | null;
  profiles: { id: string; name: string } | null;
  treatments?: { id: string; name: string; cost: number; tooth_number: string | null }[];
};

function visitTreatmentLabel(v: VisitRow): string {
  const names = (v.treatments ?? []).map((t) => t.name.trim()).filter(Boolean);
  if (names.length) return names.join(", ");
  return v.treatment_performed?.trim() || "No treatment listed";
}

function latestVisitPerPatient(rows: VisitRow[]): VisitRow[] {
  const seen = new Set<string>();
  const out: VisitRow[] = [];
  for (const row of rows) {
    const id = row.patients?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

type PatientOption = {
  id: string;
  full_name: string;
  patient_code: string;
  phone: string;
};

type TreatmentItemInput = {
  name: string;
  cost: number;
  nature: "new" | "ongoing";
  type: "one-time" | "recurring";
  duration: "3" | "6" | "9" | "12";
  ongoingTreatmentId?: string | undefined;
};

function TreatmentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/treatments" });
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();
  const searchParams = Route.useSearch();
  const kind = searchParams.kind;
  const currency = profile?.clinic?.currency ?? "INR";

  const [search, setSearch] = useState("");
  const [dateScope, setDateScope] = useState<DateScope>(() => createDateScope("day"));
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [newVisitOpen, setNewVisitOpen] = useState(false);
  const [detailVisit, setDetailVisit] = useState<VisitRow | null>(null);

  // New Visit Form State
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [visitNature, setVisitNature] = useState<"new" | "ongoing">("new");
  const [ongoingSelectedId, setOngoingSelectedId] = useState<string>("");
  const [attendingDoctor, setAttendingDoctor] = useState<string>("");
  const [visitDate, setVisitDate] = useState(todayISO());
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [clinicalNotes, setClinicalNotes] = useState("");
  const [postCare, setPostCare] = useState("");

  // Pre-load patient if passed via search param
  useEffect(() => {
    if (searchParams?.patientId) {
      void supabase
        .from("patients")
        .select("id, full_name, patient_code, phone")
        .eq("id", searchParams.patientId)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedPatient(data);
            setNewVisitOpen(true);
          }
        });
    }
  }, [searchParams.patientId]);

  const [treatments, setTreatments] = useState<TreatmentItemInput[]>([]);

  // Patient Search Query
  const patientsQuery = usePatientSearch(patientSearch, profile?.clinic_id, true);

  // Fetch patient's recurring treatments for ongoing selection
  const patientTreatmentsQuery = useQuery({
    queryKey: ["patient-recurring-treatments", selectedPatient?.id],
    enabled: !!selectedPatient?.id && !!profile?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select("id, name, cost, notes, status, treatment_date, visit_id")
        .eq("patient_id", selectedPatient!.id)
        .eq("clinic_id", profile!.clinic_id);
      if (error) throw error;
      return (data ?? []).filter(
        (t) => t.notes && t.notes.toLowerCase().includes("recurring")
      );
    },
  });

  const clinicDoctors = clinicDoctorNames(profile?.clinic?.address);

  // Treatment catalogue query for treatment selection
  const catalogueQuery = useQuery({
    queryKey: ["treatment-catalogue", "active", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .select("id, name, default_cost")
        .eq("clinic_id", profile!.clinic_id)
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Visits list query
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["visits", dateScope, sortOrder],
    enabled: !!profile?.clinic_id,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const ascending = sortOrder === "asc";
      let query = supabase
        .from("visits")
        .select(
          "id, patient_id, visit_date, reason, chief_complaint, clinical_notes, diagnosis, treatment_performed, post_care_instructions, doctor_notes, patients(id, full_name, patient_code, phone), profiles(id, name), treatments(id, name, cost, tooth_number)",
        )
        .order("visit_date", { ascending })
        .order("created_at", { ascending })
        .limit(100);

      query = applyDateColumnFilter(query, "visit_date", dateScope);

      const { data, error } = await query;

      if (error) throw error;
      return (data ?? []) as unknown as VisitRow[];
    },
  });

  // Create Clinical Visit & Treatments mutation
  const createVisit = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("Select a patient for the visit.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      if (visitNature === "new") {
        if (treatments.some((row) => !row.name.trim())) {
          throw new Error("Enter a treatment name or remove the empty line.");
        }
        if (!treatments.some((row) => row.name.trim())) {
          throw new Error("Select Consultation or add a treatment.");
        }
      }

      // --- Ongoing visit — append clinic notes to original visit, do not replace ---
      if (visitNature === "ongoing") {
        const matched = patientTreatmentsQuery.data?.find((t) => t.id === ongoingSelectedId);
        if (!matched) throw new Error("Select an ongoing treatment.");

        const anchorVisitId = await resolveAnchorVisitId(
          selectedPatient.id,
          matched.name,
          matched.visit_id,
        );
        if (!anchorVisitId) {
          throw new Error("Could not find the original visit for this treatment.");
        }

        const { data: anchorVisit, error: anchorErr } = await supabase
          .from("visits")
          .select("id, chief_complaint, diagnosis, clinical_notes, post_care_instructions")
          .eq("id", anchorVisitId)
          .single();
        if (anchorErr) throw anchorErr;

        const sessionNote = clinicalNotes.trim();
        if (sessionNote) {
          const { error: updateErr } = await supabase
            .from("visits")
            .update({
              clinical_notes: appendClinicalNote(anchorVisit.clinical_notes, visitDate, sessionNote),
            })
            .eq("id", anchorVisitId);
          if (updateErr) throw updateErr;
        }

        const { data: sessionVisit, error: vErr } = await supabase
          .from("visits")
          .insert({
            clinic_id: profile.clinic_id,
            patient_id: selectedPatient.id,
            doctor_id: profile.id,
            doctor_notes: attendingDoctor.trim() || null,
            visit_date: visitDate,
            treatment_performed: matched.name,
            clinical_notes: sessionNote || null,
          })
          .select("id")
          .single();
        if (vErr) throw vErr;

        const { error: tErr } = await supabase.from("treatments").insert({
          clinic_id: profile.clinic_id,
          patient_id: selectedPatient.id,
          visit_id: sessionVisit.id,
          name: matched.name,
          status: "completed" as const,
          treatment_date: visitDate,
          cost: Number(matched.cost),
          notes: sessionNote || "Ongoing session",
        });
        if (tErr) throw tErr;

        void logAudit(profile.clinic_id, "visit_recorded", "visit", sessionVisit.id, {
          patient: selectedPatient.full_name,
          nature: "ongoing",
          anchor_visit_id: anchorVisitId,
        });
        return sessionVisit;
      }

      // --- New visit ---
      const treatmentSummary = treatments
        .filter((t) => t.name.trim())
        .map((t) => t.name.trim())
        .join(", ");

      const { data: visit, error: vErr } = await supabase
        .from("visits")
        .insert({
          clinic_id: profile.clinic_id,
          patient_id: selectedPatient.id,
          doctor_id: profile.id,
          doctor_notes: attendingDoctor.trim() || null,
          visit_date: visitDate,
          chief_complaint: chiefComplaint.trim() || null,
          diagnosis: diagnosis.trim() || null,
          clinical_notes: clinicalNotes.trim() || null,
          treatment_performed: treatmentSummary || null,
          post_care_instructions: postCare.trim() || null,
        })
        .select("id")
        .single();

      if (vErr) throw vErr;

      if (treatments.length) {
        const treatmentInserts = treatments
          .filter((t) => t.name.trim())
          .map((t) => ({
            clinic_id: profile.clinic_id,
            patient_id: selectedPatient.id,
            visit_id: visit.id,
            name: t.name.trim(),
            status: "completed" as const,
            treatment_date: visitDate,
            cost: t.cost,
            notes:
              t.name.trim().toLowerCase() === "consultation"
                ? "Consultation"
                : t.type === "recurring"
                  ? `Recurring (${t.duration} months)`
                  : "One-time",
          }));

        if (treatmentInserts.length) {
          const { error: tErr } = await supabase.from("treatments").insert(treatmentInserts);
          if (tErr) throw tErr;
        }
      }

      // Audit in background — the visit is already saved.
      void logAudit(profile.clinic_id, "visit_recorded", "visit", visit.id, {
        patient: selectedPatient.full_name,
        diagnosis,
      });

      return visit;
    },
    onSuccess: () => {
      toast.success("Clinical visit recorded.");
      void qc.invalidateQueries({ queryKey: ["visits"] });
      void qc.invalidateQueries({ queryKey: ["patient"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["dashboard-metrics"] });
      setNewVisitOpen(false);
      resetVisitForm();
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to record visit.")),
  });

  const dateRange = resolveDateScope(dateScope);
  const rows = useMemo(() => {
    const real = data ?? [];
    const demo = showDemoData
      ? (getDemoVisits({
          from: dateRange?.start,
          to: dateRange?.end,
        }) as VisitRow[])
      : [];
    const merged = [...demo, ...real];
    if (!search.trim()) return merged;
    const t = search.trim().toLowerCase();
    return merged.filter(
      (r) =>
        r.patients?.full_name.toLowerCase().includes(t) ||
        r.patients?.patient_code.toLowerCase().includes(t) ||
        (r.diagnosis && r.diagnosis.toLowerCase().includes(t)) ||
        (r.chief_complaint && r.chief_complaint.toLowerCase().includes(t)) ||
        (r.treatment_performed && r.treatment_performed.toLowerCase().includes(t)) ||
        (r.treatments ?? []).some((tx) => tx.name.toLowerCase().includes(t)),
    );
  }, [data, showDemoData, dateRange?.start, dateRange?.end, search]);
  const kindCounts = visitKindCounts(rows);
  const visibleRows =
    kind === "consultation"
      ? rows.filter((v) => !visitHasTreatment(v))
      : kind === "treatment"
        ? rows.filter((v) => visitHasTreatment(v))
        : kind === "visited"
          ? latestVisitPerPatient(rows)
          : rows;
  const statsScopeLabel = dateScopeLabel(dateScope);
  const dateLabel = statsScopeLabel;

  function setKind(next?: VisitKindFilter) {
    void navigate({
      to: "/treatments",
      search: {
        ...(searchParams.patientId ? { patientId: searchParams.patientId } : {}),
        ...(next ? { kind: next } : {}),
      },
      replace: true,
    });
  }

  function resetVisitForm() {
    setSelectedPatient(null);
    setPatientSearch("");
    setVisitNature("new");
    setOngoingSelectedId("");
    setAttendingDoctor("");
    setVisitDate(todayISO());
    setChiefComplaint("");
    setDiagnosis("");
    setClinicalNotes("");
    setPostCare("");
    setTreatments([]);
  }

  return (
    <AppShell>
      <PageHeader
        title="Visits & Treatments"
        description="Record doctor clinical notes, diagnosis and treatment procedures."
        action={
          <Button onClick={() => setNewVisitOpen(true)}>
            <Plus className="size-4" aria-hidden />
            Record Visit
          </Button>
        }
      />

      {(() => {
        const filterControls = (
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <DateScopeFilter value={dateScope} onChange={setDateScope} />
            </div>
            <Select value={sortOrder} onValueChange={(value) => setSortOrder(value as "asc" | "desc")}>
              <SelectTrigger aria-label="Sort by date">
                <SelectValue placeholder="Sort by date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Earliest first</SelectItem>
                <SelectItem value="desc">Latest first</SelectItem>
              </SelectContent>
            </Select>
            <div className="min-w-0 sm:col-span-1 lg:col-span-2">
              <Input
                placeholder="Search"
                aria-label="Search visits"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        );
        const stats = (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            <button
              type="button"
              className={cn("min-w-0 text-left", !kind && "rounded-xl ring-2 ring-primary/30")}
              onClick={() => setKind(undefined)}
            >
              <Kpi
                label="Total"
                value={isLoading ? "—" : rows.length}
                icon={Users}
                accent="patients"
                hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">{statsScopeLabel}</p>}
              />
            </button>
            <button
              type="button"
              className={cn(
                "min-w-0 text-left",
                kind === "consultation" && "rounded-xl ring-2 ring-primary/30",
              )}
              onClick={() => setKind("consultation")}
            >
              <Kpi
                label="Pending"
                value={isLoading ? "—" : kindCounts.consultation}
                icon={UserCheck}
                accent="clinic"
                tone={!isLoading && kindCounts.consultation > 0 ? "warning" : undefined}
                hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Consultation</p>}
              />
            </button>
            <button
              type="button"
              className={cn(
                "col-span-2 min-w-0 text-left sm:col-span-1",
                kind === "treatment" && "rounded-xl ring-2 ring-primary/30",
              )}
              onClick={() => setKind("treatment")}
            >
              <Kpi
                label="Completed"
                value={isLoading ? "—" : kindCounts.treatment}
                icon={CheckCircle}
                accent="revenue"
                hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Treatment</p>}
              />
            </button>
          </div>
        );
        return (
          <>
            <div className="mb-4 lg:hidden">
              <button
                type="button"
                className="flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 px-3 text-left sm:h-9"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((open) => !open)}
              >
                <span className="truncate text-xs font-semibold text-ink-700">
                  {dateLabel}
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
              {filtersOpen ? <div className="mt-2">{filterControls}</div> : null}
              <div className="mt-3">{stats}</div>
            </div>
            <div className="mb-5 hidden space-y-4 lg:block">
              {filterControls}
              {stats}
            </div>
          </>
        );
      })()}

      {/* Visits List */}
      {isError ? (
        <ErrorState title="Unable to load clinical visits." onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingCards count={3} />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title="No clinical visits recorded"
          description="Record a doctor consultation, diagnosis and treatment."
          action={
            <Button onClick={() => setNewVisitOpen(true)}>
              <Plus className="size-4" aria-hidden />
              Record Visit
            </Button>
          }
        />
      ) : visibleRows.length === 0 ? (
        <EmptyState
          icon={Stethoscope}
          title={
            kind === "consultation"
              ? "No consultations match"
              : kind === "treatment"
                ? "No treatments match"
                : kind === "visited"
                  ? "No visited patients match"
                  : "No visits match"
          }
          description="Try another filter or search."
        />
      ) : (
        <div className="space-y-2">
          {visibleRows.map((v) => {
            const name = v.patients?.full_name ?? "Unknown patient";
            const treatment = visitTreatmentLabel(v);
            return (
              <div
                key={v.id}
                className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface-1 px-2.5 sm:px-3"
              >
                <PatientLine
                  name={name}
                  patientId={isDemoId(v.patients?.id) ? undefined : v.patients?.id}
                  meta={`${v.patients?.patient_code ?? "—"} · ${treatment}`}
                  figure={formatDate(v.visit_date)}
                  action={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="px-2 text-primary"
                      onClick={() => setDetailVisit(v)}
                    >
                      View detail
                    </Button>
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!detailVisit} onOpenChange={(open) => { if (!open) setDetailVisit(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Visit detail</DialogTitle>
            <DialogDescription>
              {detailVisit?.patients?.id ? (
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: detailVisit.patients.id }}
                  className="font-medium text-ink-700 hover:text-primary hover:underline"
                >
                  {detailVisit.patients.full_name}
                </Link>
              ) : (
                detailVisit?.patients?.full_name
              )}
              {detailVisit?.patients?.patient_code ? ` · ${detailVisit.patients.patient_code}` : ""}
              {detailVisit ? ` · ${formatDate(detailVisit.visit_date)}` : ""}
            </DialogDescription>
          </DialogHeader>
          {detailVisit ? (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-ink-500">Treatment</p>
                <p className="font-medium text-ink-900">{visitTreatmentLabel(detailVisit)}</p>
              </div>
              {detailVisit.doctor_notes?.trim() || detailVisit.profiles?.name ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Dentist</p>
                  <p>{detailVisit.doctor_notes?.trim() || detailVisit.profiles?.name}</p>
                </div>
              ) : null}
              {detailVisit.chief_complaint ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Chief complaint</p>
                  <p>{detailVisit.chief_complaint}</p>
                </div>
              ) : null}
              {detailVisit.diagnosis ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Diagnosis</p>
                  <p>{detailVisit.diagnosis}</p>
                </div>
              ) : null}
              {detailVisit.treatments && detailVisit.treatments.length > 0 ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Procedures</p>
                  <ul className="space-y-1">
                    {detailVisit.treatments.map((t) => (
                      <li key={t.id}>
                        {t.name}
                        {t.tooth_number ? ` · Tooth ${t.tooth_number}` : ""}
                        {t.cost ? ` · ${formatCurrency(t.cost, currency)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {detailVisit.clinical_notes ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Clinical notes</p>
                  <p className="whitespace-pre-wrap">{detailVisit.clinical_notes}</p>
                </div>
              ) : null}
              {detailVisit.post_care_instructions ? (
                <div>
                  <p className="text-xs font-medium text-ink-500">Post-care</p>
                  <p className="whitespace-pre-wrap">{detailVisit.post_care_instructions}</p>
                </div>
              ) : null}
              {detailVisit.patients?.id ? (
                <Button variant="outline" className="w-full" asChild>
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: detailVisit.patients.id }}
                    search={{ tab: "clinical" }}
                  >
                    Open patient chart
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Record Visit Modal */}
      <Dialog open={newVisitOpen} onOpenChange={(open) => { setNewVisitOpen(open); if (!open) resetVisitForm(); }}>
        <DialogContent className="max-w-2xl rounded-2xl border border-line bg-background p-6 shadow-2xl">
          <DialogHeader className="border-b border-line pb-4">
            <DialogTitle className="text-lg font-bold text-ink-900">Record Clinical Visit</DialogTitle>
            <DialogDescription className="text-xs text-ink-500">
              Record a new treatment or log a follow-up on an ongoing plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 max-h-[70vh] overflow-y-auto pr-1">

            {/* Patient */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-ink-700">Patient *</Label>
              {selectedPatient ? (
                <div className="flex items-center justify-between rounded-xl border border-line p-3 text-sm bg-surface-2/60">
                  <div>
                    <p className="font-semibold text-ink-900">{selectedPatient.full_name}</p>
                    <p className="text-xs text-ink-500">
                      {selectedPatient.patient_code} · {selectedPatient.phone}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs font-medium" onClick={() => setSelectedPatient(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    aria-label="Search patient"
                  />
                  {patientsQuery.isLoading ? (
                    <p className="text-sm text-ink-500">Searching…</p>
                  ) : (patientsQuery.data?.length ?? 0) > 0 ? (
                    <div className="max-h-40 divide-y divide-line overflow-y-auto border-y border-line">
                      {patientsQuery.data!.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="flex w-full flex-col items-start gap-0.5 py-2.5 text-left text-sm"
                          onClick={() => { setSelectedPatient(p); setPatientSearch(""); }}
                        >
                          <span className="w-full truncate font-medium text-ink-900">{p.full_name}</span>
                          <span className="w-full truncate text-ink-500">
                            {[p.patient_code, p.phone].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* Visit Nature — New / Ongoing */}
            <div className="rounded-xl border border-line overflow-hidden">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => { setVisitNature("new"); setOngoingSelectedId(""); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold transition-all ${
                    visitNature === "new"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-1 text-ink-500 hover:bg-surface-2"
                  }`}
                >
                  <span className={`size-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    visitNature === "new" ? "border-primary-foreground/70" : "border-line"
                  }`}>
                    {visitNature === "new" && <span className="size-1.5 rounded-full bg-primary-foreground block" />}
                  </span>
                  New Treatment
                </button>
                <div className="w-px bg-line" />
                <button
                  type="button"
                  onClick={() => { setVisitNature("ongoing"); setTreatments([]); }}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold transition-all ${
                    visitNature === "ongoing"
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-1 text-ink-500 hover:bg-surface-2"
                  }`}
                >
                  <span className={`size-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    visitNature === "ongoing" ? "border-primary-foreground/70" : "border-line"
                  }`}>
                    {visitNature === "ongoing" && <span className="size-1.5 rounded-full bg-primary-foreground block" />}
                  </span>
                  Ongoing Treatment
                </button>
              </div>
            </div>

            {/* ── ONGOING MODE ─────────────────────────────── */}
            {visitNature === "ongoing" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Select Ongoing Treatment *</Label>
                {!selectedPatient ? (
                  <p className="text-[11px] text-slate-400 italic py-1">Select a patient first to see their ongoing treatments.</p>
                ) : patientTreatmentsQuery.isLoading ? (
                  <p className="text-[11px] text-slate-400 italic py-1">Loading recurring treatments...</p>
                ) : (patientTreatmentsQuery.data?.length ?? 0) === 0 ? (
                  <p className="text-[11px] text-amber-600 italic py-1">
                    No recurring treatments found for this patient. First record a New Treatment and set it to Recurring.
                  </p>
                ) : (
                  <Select value={ongoingSelectedId} onValueChange={setOngoingSelectedId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select treatment..." />
                    </SelectTrigger>
                    <SelectContent>
                      {patientTreatmentsQuery.data!.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} — {formatDate(t.treatment_date)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {/* ── NEW MODE ─────────────────────────────────── */}
            {visitNature === "new" && (
              <>
                {/* Doctor */}
                <div className="space-y-1.5">
                  <Label htmlFor="doc" className="text-xs font-semibold text-slate-700">Attending Doctor</Label>
                  <Select value={attendingDoctor} onValueChange={setAttendingDoctor} disabled={clinicDoctors.length === 0}>
                    <SelectTrigger id="doc">
                      <SelectValue placeholder={clinicDoctors.length ? "Select doctor" : "Add doctor names in Settings"} />
                    </SelectTrigger>
                    <SelectContent>
                      {clinicDoctors.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Chief Complaint */}
                <div className="space-y-1.5">
                  <Label htmlFor="cc" className="text-xs font-semibold text-slate-700">Chief Complaint</Label>
                  <Input
                    id="cc"
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                  />
                </div>

                {/* Diagnosis */}
                <div className="space-y-1.5">
                  <Label htmlFor="diag" className="text-xs font-semibold text-slate-700">Diagnosis</Label>
                  <Input
                    id="diag"
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                </div>

                {/* Treatments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">Treatments Performed</Label>
                    {(catalogueQuery.data?.length ?? 0) > 0 && (
                      <Select
                        onValueChange={(val) => {
                          const item = catalogueQuery.data?.find((c) => c.id === val);
                          if (item) {
                            setTreatments((prev) => [
                              ...prev,
                              { name: item.name, cost: Number(item.default_cost), nature: "new", type: "one-time", duration: "3" },
                            ]);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-56">
                          <SelectValue placeholder="Add from catalogue..." />
                        </SelectTrigger>
                        <SelectContent>
                          {catalogueQuery.data!.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {catalogueOptionLabel(c, currency, catalogueQuery.data!)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <div className="space-y-2">
                    {treatments.map((row, idx) => (
                      <div key={idx} className="flex flex-col gap-2 rounded-xl border border-line/80 p-2.5 sm:flex-row sm:flex-wrap sm:items-center">
                        <Input
                          className="min-w-0 w-full flex-1"
                          value={row.name}
                          readOnly={row.name.trim().toLowerCase() === "consultation"}
                          placeholder="Treatment name"
                          onChange={(e) => setTreatments((prev) => prev.map((r, i) => i === idx ? { ...r, name: e.target.value } : r))}
                        />
                        {row.name.trim().toLowerCase() === "consultation" ? null : (
                          <>
                        <Select
                          value={row.type}
                          onValueChange={(val: "one-time" | "recurring") =>
                            setTreatments((prev) => prev.map((r, i) => i === idx ? { ...r, type: val } : r))
                          }
                        >
                          <SelectTrigger className="w-full sm:w-28">
                            <SelectValue placeholder="Type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="one-time">One-time</SelectItem>
                            <SelectItem value="recurring">Recurring</SelectItem>
                          </SelectContent>
                        </Select>
                        {row.type === "recurring" && (
                          <Select
                            value={row.duration}
                            onValueChange={(val: "3" | "6" | "9" | "12") =>
                              setTreatments((prev) => prev.map((r, i) => i === idx ? { ...r, duration: val } : r))
                            }
                          >
                            <SelectTrigger className="w-full sm:w-28">
                              <SelectValue placeholder="Duration" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="3">3 Months</SelectItem>
                              <SelectItem value="6">6 Months</SelectItem>
                              <SelectItem value="9">9 Months</SelectItem>
                              <SelectItem value="12">12 Months</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                          </>
                        )}

                        <button
                          type="button"
                          className="px-2 text-sm text-slate-400 transition-colors hover:text-red-500"
                          onClick={() => setTreatments((prev) => prev.filter((_, i) => i !== idx))}
                        >×</button>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-dashed border-slate-300 py-2 h-auto font-medium text-slate-500 hover:border-primary hover:text-primary sm:w-auto"
                      onClick={() =>
                        setTreatments((prev) => {
                          if (prev.some((row) => row.name.trim().toLowerCase() === "consultation")) {
                            return prev;
                          }
                          return [
                            ...prev,
                            {
                              name: "Consultation",
                              cost: 0,
                              nature: "new",
                              type: "one-time",
                              duration: "3",
                            },
                          ];
                        })
                      }
                    >
                      Consultation
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full rounded-xl border-dashed border-slate-300 py-2 h-auto font-medium text-slate-500 hover:border-primary hover:text-primary"
                      onClick={() =>
                        setTreatments((prev) => [
                          ...prev,
                          { name: "", cost: 0, nature: "new", type: "one-time", duration: "3" },
                        ])
                      }
                    >
                      + Add Treatment
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* Clinical Notes — always shown; ongoing sessions append to original visit */}
            <div className="space-y-1.5">
              <Label htmlFor="cnotes" className="text-xs font-semibold text-slate-700">Clinical Notes</Label>
              {visitNature === "ongoing" ? (
                <p className="text-[11px] text-muted-foreground">
                  New notes are added to the original visit record — existing complaint, diagnosis and post-care stay unchanged.
                </p>
              ) : null}
              <Textarea
                id="cnotes"
                value={clinicalNotes}
                onChange={(e) => setClinicalNotes(e.target.value)}
              />
            </div>

            {/* Post-Care — only for new visits */}
            {visitNature === "new" && (
              <div className="space-y-1.5">
                <Label htmlFor="pcare" className="text-xs font-semibold text-slate-700">Post-Care Instructions for Patient</Label>
                <Textarea
                  id="pcare"
                  value={postCare}
                  onChange={(e) => setPostCare(e.target.value)}
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 border-t pt-4">
            <Button variant="outline" className="rounded-xl" onClick={() => setNewVisitOpen(false)}>
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-primary font-semibold shadow-xs"
              onClick={() => createVisit.mutate()}
              disabled={createVisit.isPending || !selectedPatient}
            >
              {createVisit.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              Save Visit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

