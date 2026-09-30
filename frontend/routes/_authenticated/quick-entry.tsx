import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ChevronDown,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  Receipt,
  Sparkles,
  User,
  Wallet,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { friendlyError, logAudit } from "@/lib/audit";
import { clinicDoctorNames } from "@/lib/clinic-identity";
import { catalogueOptionLabel, formatCurrency, isPatientPhone, patientPhoneDigits, todayISO, whatsappLink } from "@/lib/format";
import { cn } from "@/lib/utils";
import { nextSharedPhone, splitFamilyPhone } from "@/lib/family-phone";
import { familyPhonesForBase, findPatientsByPhone } from "@/services/patients";

export const Route = createFileRoute("/_authenticated/quick-entry")({
  head: () => ({
    meta: [
      { title: "Quick Entry — VSP Software" },
      {
        name: "description",
        content: "Rapid front-desk walk-in registration and instant arrival in waiting room.",
      },
    ],
  }),
  component: QuickEntryPage,
});

type QuickTreatmentLine = {
  id: string;
  name: string;
  cost: string;
};

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const QE_MSG_ALLERGIES =
  "Please tick No known allergies below, or enter allergies under Medical History.";

function isQuickEntryFieldValidation(message: string): boolean {
  return (
    message === QE_MSG_ALLERGIES ||
    message.startsWith("Enter ") ||
    message.startsWith("Please ") ||
    message.startsWith("Select ") ||
    message.startsWith("Clinic profile")
  );
}

function newTreatmentLine(name = "", cost = "0"): QuickTreatmentLine {
  return { id: crypto.randomUUID(), name, cost };
}

function treatmentsSubtotal(lines: QuickTreatmentLine[]) {
  return money(
    lines.reduce((sum, line) => {
      if (!line.name.trim()) return sum;
      return sum + Math.max(0, Number(line.cost) || 0);
    }, 0),
  );
}

function invoiceItemsFromLines(lines: QuickTreatmentLine[]) {
  return lines
    .map((line) => ({
      description: line.name.trim(),
      quantity: 1,
      unit_price: money(Math.max(0, Number(line.cost) || 0)),
    }))
    .filter((item) => item.description.length > 0 && item.unit_price > 0);
}

function payableFromNet(net: number, taxEnabled: boolean, taxRate: number) {
  const tax = taxEnabled ? money((net * taxRate) / 100) : 0;
  return { net: money(net), tax, grand: money(net + tax) };
}

function FormCard({
  step,
  title,
  icon: Icon,
  iconClass,
  open,
  onToggle,
  children,
}: {
  step: number;
  title: string;
  icon: LucideIcon;
  iconClass: string;
  open?: boolean;
  onToggle?: () => void;
  children: ReactNode;
}) {
  const header = (
    <>
      <div className={cn("grid size-8 shrink-0 place-items-center rounded-full", iconClass)}>
        <Icon className="size-4" aria-hidden />
      </div>
      <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink-900">
        {step}. {title}
      </h3>
      {onToggle ? (
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-500 transition-transform duration-150", open && "rotate-180")}
          aria-hidden
        />
      ) : null}
    </>
  );

  return (
    <section className="rounded-2xl border border-line bg-surface-1 p-4 shadow-2xs sm:p-5">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open === true}
          className={cn(
            "flex w-full items-center gap-2.5 text-left",
            open && "mb-4 border-b border-line pb-3",
          )}
        >
          {header}
        </button>
      ) : (
        <div className="mb-4 flex items-center gap-2.5 border-b border-line pb-3">{header}</div>
      )}
      {!onToggle || open ? <div className="space-y-4">{children}</div> : null}
    </section>
  );
}

function QuickEntryPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  // Confirmation state shown after successful submit
  const [confirmation, setConfirmation] = useState<{
    patientId: string;
    patientCode: string;
    fullName: string;
    treatment: string;
    tax: number;
    cost: number;
    paid: number;
    method: string;
  } | null>(null);

  // 1. Patient Profile State
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [savePhoneOverride, setSavePhoneOverride] = useState<string | null>(null);
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);

  const cleanPhoneForCheck = patientPhoneDigits(phone);
  const duplicates = useQuery({
    queryKey: ["quick-entry-duplicate-phone", profile?.clinic_id, cleanPhoneForCheck],
    enabled: !!profile?.clinic_id && isPatientPhone(cleanPhoneForCheck),
    staleTime: 15_000,
    queryFn: () => findPatientsByPhone(profile!.clinic_id, cleanPhoneForCheck),
  });
  const familyPhones = useQuery({
    queryKey: ["quick-entry-family-phones", profile?.clinic_id, cleanPhoneForCheck],
    enabled: !!profile?.clinic_id && isPatientPhone(cleanPhoneForCheck),
    staleTime: 15_000,
    queryFn: () => familyPhonesForBase(profile!.clinic_id, cleanPhoneForCheck),
  });
  const duplicateMatches = duplicates.data ?? [];
  const hasDuplicates = duplicateMatches.length > 0;
  /** Show only the main number on file — hide family +N lines from the list. */
  const primaryDuplicateMatches = useMemo(
    () => duplicateMatches.filter((d) => splitFamilyPhone(d.phone).suffix === 0),
    [duplicateMatches],
  );
  const previewSharedPhone = useMemo(() => {
    if (!isPatientPhone(cleanPhoneForCheck) || !hasDuplicates) return cleanPhoneForCheck;
    const base = splitFamilyPhone(cleanPhoneForCheck).base;
    return nextSharedPhone(base, familyPhones.data ?? duplicateMatches.map((m) => m.phone));
  }, [cleanPhoneForCheck, duplicateMatches, familyPhones.data, hasDuplicates]);

  // 2. Medical History State
  const [hasHypertension, setHasHypertension] = useState(false);
  const [hasDiabetes, setHasDiabetes] = useState(false);
  const [hasAsthma, setHasAsthma] = useState(false);
  const [hasHeartDisease, setHasHeartDisease] = useState(false);
  const [otherConditions, setOtherConditions] = useState("");
  const [allergySubstance, setAllergySubstance] = useState("");
  const [currentMedication, setCurrentMedication] = useState("");
  const [selectedHabit, setSelectedHabit] = useState("none");
  const [dentalHistory, setDentalHistory] = useState<string[]>([]);
  const [dentalHistoryNotes, setDentalHistoryNotes] = useState("");
  const [showMedical, setShowMedical] = useState(false);

  // 3. Treatment Performed State
  const [treatmentLines, setTreatmentLines] = useState<QuickTreatmentLine[]>([]);
  const [attendingDoctor, setAttendingDoctor] = useState("");
  const [notes, setNotes] = useState("");

  // 4. Payment State
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentAmount, setPaymentAmount] = useState("0");

  const [fieldError, setFieldError] = useState<string | null>(null);
  const qeDirty = Boolean(
    fullName.trim() ||
      phone.trim() ||
      notes.trim() ||
      treatmentLines.some((line) => Boolean(line.name.trim() || Number(line.cost) > 0)),
  );
  useUnsavedChanges(qeDirty && !confirmation);

  const taxEnabled = Boolean(profile?.clinic?.tax_enabled);
  const taxRate = taxEnabled ? Number(profile?.clinic?.tax_rate ?? 0) : 0;
  const subtotal = treatmentsSubtotal(treatmentLines);
  const payable = payableFromNet(subtotal, taxEnabled, taxRate);

  useEffect(() => {
    setPaymentAmount(String(payable.grand));
  }, [payable.grand]);

  const clinicDoctors = clinicDoctorNames(profile?.clinic?.address);

  // Treatment catalogue query for selection
  const catalogueQuery = useQuery({
    queryKey: ["treatment-catalogue", "quick", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .select("id, name, default_cost")
        .eq("clinic_id", profile!.clinic_id)
        .eq("active", true)
        .eq("quick_entry", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Quick Walk-in Submit mutation
  const submitQuickEntry = useMutation({
    mutationFn: async () => {
      setFieldError(null);
      console.log("[QuickEntry] Mutation started");
      if (!fullName.trim() || fullName.trim().length < 2) {
        console.warn("[QuickEntry] Validation failed: full name is required");
        throw new Error("Enter patient's full name.");
      }
      const cleanPhone = patientPhoneDigits(phone);
      if (!isPatientPhone(cleanPhone)) {
        console.warn("[QuickEntry] Validation failed: phone number is required/invalid");
        throw new Error("Enter a 10-digit phone number.");
      }
      if (gender !== "male" && gender !== "female" && gender !== "other") {
        throw new Error("Select gender.");
      }
      if (!noKnownAllergies && !allergySubstance.trim()) {
        throw new Error(QE_MSG_ALLERGIES);
      }
      if (!profile?.clinic_id) {
        console.error("[QuickEntry] Mutation failed: clinic profile not ready");
        throw new Error("Clinic profile not ready.");
      }
      if (treatmentLines.some((line) => !line.name.trim())) {
        throw new Error("Enter a treatment name or remove the empty line.");
      }
      if (!treatmentLines.some((line) => line.name.trim())) {
        throw new Error("Select Consultation or add a treatment.");
      }

      const clinic_id = profile.clinic_id;
      const phoneToSave =
        savePhoneOverride ??
        (hasDuplicates
          ? previewSharedPhone
          : cleanPhone);

      const failAfter = (err: unknown): Error => {
        const reason = friendlyError(err, "Unknown error — check connection and try again.");
        return new Error(`Unable to save: ${reason}`);
      };

      try {
      const namedTreatments = treatmentLines.filter((line) => line.name.trim());
      const treatmentLabel = namedTreatments.map((line) => line.name.trim()).join(", ");
      const lineSubtotal = treatmentsSubtotal(treatmentLines);
      const invoiceItems = invoiceItemsFromLines(treatmentLines);
      const bill = payableFromNet(
        lineSubtotal,
        Boolean(profile.clinic?.tax_enabled),
        profile.clinic?.tax_enabled ? Number(profile.clinic.tax_rate ?? 0) : 0,
      );
      const pAmt = money(Math.max(0, Number(paymentAmount) || 0));
      if (pAmt > bill.grand + 0.001) {
        throw new Error("Payment cannot exceed balance due.");
      }
      if (!invoiceItems.length && pAmt > 0) {
        throw new Error("Payment cannot exceed balance due.");
      }

      const conditionInserts: { condition: string; category?: string; notes: string }[] = [];
      if (hasHypertension) conditionInserts.push({ condition: "Hypertension", notes: "Added via Quick Entry" });
      if (hasDiabetes) conditionInserts.push({ condition: "Diabetes", notes: "Added via Quick Entry" });
      if (hasAsthma) conditionInserts.push({ condition: "Asthma", notes: "Added via Quick Entry" });
      if (hasHeartDisease) conditionInserts.push({ condition: "Heart Disease", notes: "Added via Quick Entry" });
      if (otherConditions.trim()) {
        conditionInserts.push({ condition: otherConditions.trim(), notes: "Added via Quick Entry" });
      }
      for (const item of dentalHistory) {
        conditionInserts.push({
          condition: item,
          category: "Dental History",
          notes: "Added via Quick Entry",
        });
      }
      if (dentalHistoryNotes.trim()) {
        conditionInserts.push({
          condition: dentalHistoryNotes.trim(),
          category: "Dental History",
          notes: "Added via Quick Entry",
        });
      }

      const habits = [];
      if (selectedHabit === "smoking" || selectedHabit === "both") habits.push({ habit: "Smoking" });
      if (selectedHabit === "alcohol" || selectedHabit === "both") habits.push({ habit: "Alcohol" });

      const { data, error } = await supabase.rpc("save_quick_entry", {
        _full_name: fullName.trim(),
        _phone: phoneToSave,
        _gender: gender,
        _conditions: conditionInserts,
        _allergies: allergySubstance.trim()
          ? [{ substance: allergySubstance.trim(), notes: "Added via Quick Entry" }]
          : [],
        _medications: currentMedication.trim()
          ? [{ medication: currentMedication.trim(), notes: "Added via Quick Entry" }]
          : [],
        _habits: habits,
        _doctor_notes: attendingDoctor.trim() || null,
        _clinical_notes: notes.trim() || null,
        _treatment_label: treatmentLabel || null,
        _treatments: namedTreatments.map((line) => ({
          name: line.name.trim(),
          cost: money(Math.max(0, Number(line.cost) || 0)),
        })),
        _invoice_items: invoiceItems,
        _payment_amount: pAmt,
        _payment_method: paymentMethod,
        _visit_date: todayISO(),
      });
      if (error) throw error;

      const patient = z
        .object({
          id: z.string().uuid(),
          patient_code: z.string().min(1),
          full_name: z.string().min(1),
          invoice_number: z.string().nullable().optional(),
          tax: z.coerce.number(),
          cost: z.coerce.number(),
          paid: z.coerce.number(),
        })
        .parse(data);

      void logAudit(clinic_id, "quick_entry_express", "patient", patient.id, {
        patient_code: patient.patient_code,
        full_name: patient.full_name,
        treatment: treatmentLabel || null,
        subtotal: lineSubtotal,
        cost: patient.cost,
        paid: patient.paid,
        method: patient.paid > 0 ? paymentMethod : null,
        invoice_number: patient.invoice_number ?? null,
      });

      return {
        patient,
        treatment: treatmentLabel,
        tax: patient.tax,
        cost: patient.cost,
        paid: patient.paid,
        method: paymentMethod,
      };
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message === "This mobile is already on file." || message.includes("already on file")) {
          throw new Error("This mobile is already on file.");
        }
        throw failAfter(err);
      }
    },
    onSuccess: (result) => {
      setSavePhoneOverride(null);
      setConfirmation({
        patientId: result.patient.id,
        patientCode: result.patient.patient_code,
        fullName: result.patient.full_name,
        treatment: result.treatment,
        tax: result.tax,
        cost: result.cost,
        paid: result.paid,
        method: result.method,
      });
      // Refresh lists after the success screen is already showing.
      void qc.invalidateQueries({ queryKey: ["patients"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["visits"] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["treatments"] });
      void qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (err) => {
      console.error("[QuickEntry] Mutation error occurred:", err);
      const raw = err instanceof Error ? err.message : "";
      let msg: string;
      if (isQuickEntryFieldValidation(raw) || raw === "This mobile is already on file.") {
        msg = raw;
      } else if (raw.startsWith("Unable to save:")) {
        msg = raw;
      } else {
        msg = `Unable to save: ${friendlyError(err, "Check your connection and try again.")}`;
      }
      setFieldError(msg);
      toast.error(msg);
    },
  });

  if (confirmation) {
    const balance = Math.max(0, confirmation.cost - confirmation.paid);
    return (
      <AppShell>
        <PageHeader title="Entry Complete" description="Walk-in patient registered successfully." />
        <div className="max-w-lg mx-auto mt-4 rounded-2xl border border-success-line bg-success-surface p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-success text-success-foreground shadow-xs shrink-0">
              <Receipt className="size-6" />
            </div>
            <div>
              <p className="font-bold text-lg text-ink-900">{confirmation.fullName}</p>
              <p className="text-sm text-ink-500 font-medium">{confirmation.patientCode}</p>
            </div>
          </div>

          <div className="divide-y rounded-xl border border-success-line bg-surface-1 overflow-hidden text-sm">
            <div className="flex justify-between gap-3 px-4 py-3">
              <span className="text-ink-500 shrink-0">Treatment</span>
              <span className="font-semibold text-ink-900 text-right">
                {confirmation.treatment || "None"}
              </span>
            </div>
            {confirmation.tax > 0 ? (
              <div className="flex justify-between px-4 py-3">
                <span className="text-ink-500">Tax</span>
                <span className="font-semibold tabular-nums">{formatCurrency(confirmation.tax, profile?.clinic?.currency ?? "INR")}</span>
              </div>
            ) : null}
            <div className="flex justify-between px-4 py-3">
              <span className="text-ink-500">Total Amount</span>
              <span className="font-semibold tabular-nums">{formatCurrency(confirmation.cost, profile?.clinic?.currency ?? "INR")}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="text-ink-500">Paid ({confirmation.method})</span>
              <span className="font-semibold tabular-nums text-ink-900">{formatCurrency(confirmation.paid, profile?.clinic?.currency ?? "INR")}</span>
            </div>
            <div className="flex justify-between px-4 py-3">
              <span className="font-semibold text-ink-700">Balance due</span>
              <span className={`font-bold tabular-nums ${balance > 0 ? "text-destructive" : "text-ink-900"}`}>
                {formatCurrency(balance, profile?.clinic?.currency ?? "INR")}
              </span>
            </div>
          </div>

          {phone ? (
            <a
              href={whatsappLink(
                phone,
                confirmation.treatment
                  ? `Hi ${confirmation.fullName}, your visit has been recorded. Treatment: ${confirmation.treatment}. Amount paid: ${formatCurrency(confirmation.paid, profile?.clinic?.currency ?? "INR")}. Thank you!`
                  : `Hi ${confirmation.fullName}, your visit has been recorded. Amount paid: ${formatCurrency(confirmation.paid, profile?.clinic?.currency ?? "INR")}. Thank you!`,
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface-1 text-ink-700 text-sm font-medium px-4 py-2 hover:bg-surface-2 transition-colors"
            >
              <MessageCircle className="size-4" /> WhatsApp Receipt
            </a>
          ) : null}
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Quick Entry Workflow"
        description="Register walk-ins, log medical history, record completed procedures, and file payments in one press."
      />

      <form
        className="mx-auto max-w-4xl"
        onSubmit={(e) => {
          e.preventDefault();
          submitQuickEntry.mutate();
        }}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <FormCard
              step={1}
              title="Patient Demographics"
              icon={User}
              iconClass="bg-primary/10 text-primary"
            >

              <div className="space-y-1.5">
                <Label htmlFor="qname">Full Name *</Label>
                <Input
                  id="qname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  aria-invalid={!!fieldError && !fullName.trim()}
                  aria-describedby={fieldError ? "qe-field-error" : undefined}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qphone">Phone Number *</Label>
                  <Input
                    id="qphone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    placeholder="10-digit mobile"
                    value={phone}
                    onChange={(e) => setPhone(patientPhoneDigits(e.target.value))}
                    className={cn(hasDuplicates && "border-warning-line focus:border-warning-text")}
                    aria-invalid={!!fieldError && !isPatientPhone(phone)}
                  />
                  {hasDuplicates ? (
                    <div className="rounded-xl border border-warning-line bg-warning-surface/60 p-2.5 text-[11px] text-warning-text">
                      <p className="font-semibold">
                        This mobile is on file. You can save this walk-in as a family line (
                        {previewSharedPhone}).
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {primaryDuplicateMatches.map((d) => (
                          <li key={d.id} className="text-warning-text">
                            <span className="font-semibold">
                              {d.full_name} · {d.patient_code}
                            </span>
                            {d.phone ? ` · ${d.phone}` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="qgender">
                    Gender <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    {...(gender ? { value: gender } : {})}
                    onValueChange={(value) => {
                      setGender(value);
                      if (fieldError === "Select gender.") setFieldError(null);
                    }}
                  >
                    <SelectTrigger
                      id="qgender"
                      aria-invalid={fieldError === "Select gender."}
                      className={cn(
                        fieldError === "Select gender." && "border-destructive focus-visible:ring-destructive",
                      )}
                    >
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm",
                  fieldError === QE_MSG_ALLERGIES
                    ? "border-destructive bg-destructive/5"
                    : "border-line bg-surface-2/40",
                )}
              >
                <Checkbox
                  checked={noKnownAllergies}
                  onCheckedChange={(v) => {
                    setNoKnownAllergies(v === true);
                    if (v === true && fieldError === QE_MSG_ALLERGIES) setFieldError(null);
                  }}
                />
                <span>
                  <span className="font-medium text-ink-900">No known allergies</span>
                  <span className="mt-0.5 block text-xs text-ink-500">
                    Required unless you record allergies under Medical History.
                  </span>
                </span>
              </label>
            </FormCard>

            <FormCard
              step={2}
              title="Medical History (Optional)"
              icon={Heart}
              iconClass="bg-danger-surface text-danger-text"
              open={showMedical}
              onToggle={() => setShowMedical((v) => !v)}
            >
              <div className="space-y-2">
                <Label>Systemic Conditions</Label>
                <div className="grid grid-cols-2 gap-2.5 rounded-xl bg-background p-3">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasHypertension}
                      onCheckedChange={(v) => setHasHypertension(v === true)}
                    />
                    Hypertension
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasDiabetes}
                      onCheckedChange={(v) => setHasDiabetes(v === true)}
                    />
                    Diabetes
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasAsthma}
                      onCheckedChange={(v) => setHasAsthma(v === true)}
                    />
                    Asthma
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={hasHeartDisease}
                      onCheckedChange={(v) => setHasHeartDisease(v === true)}
                    />
                    Heart Disease
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="other_cond">Other Conditions</Label>
                <Input
                  id="other_cond"
                  value={otherConditions}
                  onChange={(e) => setOtherConditions(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="allergies">Allergies</Label>
                <Input
                  id="allergies"
                  value={allergySubstance}
                  onChange={(e) => setAllergySubstance(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="meds">Current Medications</Label>
                <Input
                  id="meds"
                  value={currentMedication}
                  onChange={(e) => setCurrentMedication(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="habit">Habits</Label>
                <Select value={selectedHabit} onValueChange={setSelectedHabit}>
                  <SelectTrigger id="habit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="smoking">Smoking</SelectItem>
                    <SelectItem value="alcohol">Alcohol</SelectItem>
                    <SelectItem value="both">Smoking & Alcohol</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Dental History</Label>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    "Extraction",
                    "Root Canal",
                    "Filling",
                    "Scaling",
                    "Braces",
                    "Implant",
                    "Bleeding gums",
                    "Sensitivity",
                  ].map((item) => (
                    <label
                      key={item}
                      className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={dentalHistory.includes(item)}
                        onCheckedChange={(v) =>
                          setDentalHistory((prev) =>
                            v === true
                              ? prev.includes(item)
                                ? prev
                                : [...prev, item]
                              : prev.filter((x) => x !== item),
                          )
                        }
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dental_notes">
                  Other dental notes
                </Label>
                <Input
                  id="dental_notes"
                  value={dentalHistoryNotes}
                  onChange={(e) => setDentalHistoryNotes(e.target.value)}
                />
              </div>
            </FormCard>
          </div>

          <div className="space-y-4">
            <FormCard
              step={3}
              title="Treatment Performed (Optional)"
              icon={Sparkles}
              iconClass="bg-tile-4-surface text-tile-4-text"
            >
              {(catalogueQuery.data?.length ?? 0) > 0 ? (
                <div className="space-y-1.5">
                  <Label>Select Procedure from Catalogue</Label>
                  <Select
                    onValueChange={(val) => {
                      const item = catalogueQuery.data?.find((c) => c.id === val);
                      if (!item) return;
                      setTreatmentLines((prev) => {
                        const empty =
                          prev.length === 1 &&
                          !prev[0]!.name.trim() &&
                          !(Number(prev[0]!.cost) > 0);
                        const next = empty
                          ? [newTreatmentLine(item.name, String(item.default_cost))]
                          : [...prev, newTreatmentLine(item.name, String(item.default_cost))];
                        const nextSub = treatmentsSubtotal(next);
                        const nextPay = payableFromNet(nextSub, taxEnabled, taxRate);
                        setPaymentAmount(String(nextPay.grand));
                        return next;
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Add from catalogue" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogueQuery.data!.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {catalogueOptionLabel(
                            c,
                            profile?.clinic?.currency ?? "INR",
                            catalogueQuery.data!,
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-3">
                {treatmentLines.map((line, index) => (
                  <div
                    key={line.id}
                    className={
                      treatmentLines.length > 1
                        ? "grid gap-3 sm:grid-cols-[1fr_8rem_auto]"
                        : "grid gap-3 sm:grid-cols-[1fr_8rem]"
                    }
                  >
                    <div className="space-y-1.5">
                      {index === 0 ? <Label htmlFor={`tx_name_${line.id}`}>Treatment name</Label> : <Label className="sr-only" htmlFor={`tx_name_${line.id}`}>Treatment name</Label>}
                      <Input
                        id={`tx_name_${line.id}`}
                        placeholder="Treatment name"
                        value={line.name}
                        readOnly={line.name.trim().toLowerCase() === "consultation"}
                        onChange={(e) => {
                          const name = e.target.value;
                          setTreatmentLines((prev) =>
                            prev.map((row) => (row.id === line.id ? { ...row, name } : row)),
                          );
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      {index === 0 ? <Label htmlFor={`tx_cost_${line.id}`}>Cost</Label> : <Label className="sr-only" htmlFor={`tx_cost_${line.id}`}>Cost</Label>}
                      <Input
                        id={`tx_cost_${line.id}`}
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.cost}
                        onChange={(e) => {
                          const cost = e.target.value;
                          setTreatmentLines((prev) =>
                            prev.map((row) => (row.id === line.id ? { ...row, cost } : row)),
                          );
                        }}
                      />
                    </div>
                    {treatmentLines.length > 1 ? (
                      <div className={index === 0 ? "flex items-end pb-0.5" : "flex items-center"}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-9 shrink-0 text-ink-500"
                          onClick={() =>
                            setTreatmentLines((prev) => prev.filter((row) => row.id !== line.id))
                          }
                          aria-label="Remove treatment"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() =>
                      setTreatmentLines((prev) => {
                        if (prev.some((line) => line.name.trim().toLowerCase() === "consultation")) {
                          return prev;
                        }
                        return [...prev, newTreatmentLine("Consultation")];
                      })
                    }
                  >
                    Consultation
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setTreatmentLines((prev) => [...prev, newTreatmentLine()])}
                  >
                    <Plus className="size-4" />
                    Add treatment
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="qdoc">Attending Doctor</Label>
                  <Select value={attendingDoctor} onValueChange={setAttendingDoctor} disabled={clinicDoctors.length === 0}>
                    <SelectTrigger id="qdoc">
                      <SelectValue placeholder={clinicDoctors.length ? "Select doctor" : "Add doctor names in Settings"} />
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
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="qnotes">Clinical Notes</Label>
                <Textarea
                  id="qnotes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </FormCard>

            <FormCard
              step={4}
              title="Billing & Payment (Optional)"
              icon={Wallet}
              iconClass="bg-success-surface text-success-text"
            >
              <div className="space-y-1.5">
                <Label>Bill total</Label>
                <p className="h-9 flex items-center text-sm font-semibold tabular-nums text-ink-900">
                  {formatCurrency(payable.grand, profile?.clinic?.currency ?? "INR")}
                </p>
              </div>
              {payable.tax > 0 ? (
                <p className="text-[11px] text-ink-500">
                  Treatments {formatCurrency(subtotal, profile?.clinic?.currency ?? "INR")}
                  {` + tax ${formatCurrency(payable.tax, profile?.clinic?.currency ?? "INR")}`}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pay_amt">Amount Paid</Label>
                  <Input
                    id="pay_amt"
                    type="number"
                    min={0}
                    step="0.01"
                    max={payable.grand}
                    value={paymentAmount}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next) && next > payable.grand) {
                        setPaymentAmount(String(payable.grand));
                        toast.message("Payment cannot exceed balance due.");
                        return;
                      }
                      setPaymentAmount(e.target.value);
                    }}
                  />
                  <p className="text-[11px] text-ink-500">
                    Full bill is filled automatically. You can type a lower amount.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pay_method">Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="pay_method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="upi">UPI / QR Code</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormCard>
          </div>
        </div>

        <div className="mt-6">
          <Button
            type="submit"
            className="w-full rounded-full font-semibold"
            disabled={submitQuickEntry.isPending}
          >
            {submitQuickEntry.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Zap className="size-4" aria-hidden />
                Complete Express Entry
              </>
            )}
          </Button>
          {fieldError || submitQuickEntry.isError ? (
            <p id="qe-field-error" className="mt-2 text-center text-xs font-medium text-destructive">
              {fieldError ?? friendlyError(submitQuickEntry.error, "Unable to complete Quick Entry.")}
            </p>
          ) : null}
        </div>
      </form>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>This mobile is already on file</DialogTitle>
            <DialogDescription>
              This number is already used. Register a new family member with{" "}
              <span className="font-semibold text-ink-900">{previewSharedPhone}</span>, or edit the
              phone.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 py-1">
            {primaryDuplicateMatches.map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-line bg-surface-2/50 px-3 py-2.5"
              >
                <p className="text-sm font-semibold text-ink-900">{d.full_name}</p>
                <p className="text-xs text-ink-500">
                  {d.patient_code}
                  {d.phone ? ` · ${d.phone}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDuplicateOpen(false)}>
              Edit phone
            </Button>
            <Button
              onClick={() => {
                setSavePhoneOverride(previewSharedPhone);
                setDuplicateOpen(false);
                submitQuickEntry.mutate();
              }}
              disabled={submitQuickEntry.isPending}
            >
              Save as family · {previewSharedPhone}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

