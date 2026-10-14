import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { type SelectedCondition } from "@/components/patients/medical-history-picker";
import { MedicalRecordsForm, DentalHistorySection, type AllergyRow, type MedicationRow, type HabitRow, type DentalHistoryRow } from "@/components/patients/medical-records-form";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { friendlyError, logAudit } from "@/lib/audit";
import {
  ALLERGY_OPTIONS,
  ALLERGY_SEVERITY,
  HABIT_OPTIONS,
  MEDICATION_OPTIONS,
  PATIENT_TYPES,
  PATIENT_TYPE_LABELS,
} from "@/lib/constants";
import { isPatientPhone, patientPhoneDigits } from "@/lib/format";
import { nextSharedPhone, splitFamilyPhone } from "@/lib/family-phone";
import { familyPhonesForBase, findPatientsByPhone } from "@/services/patients";

export const Route = createFileRoute("/_authenticated/patients/new")({
  head: () => ({
    meta: [
      { title: "New Patient — VSP Software" },
      {
        name: "description",
        content:
          "Register a new dental patient with medical history, allergies, medications and habits in one pass.",
      },
      { property: "og:title", content: "New Patient — VSP Software" },
      { property: "og:description", content: "Register a new dental patient record." },
    ],
  }),
  component: NewPatientPage,
});

const ALLERGY_CONFIRM_MSG =
  "Please tick No known allergies, or enter an allergy under Medical.";

const patientSchema = z.object({
  full_name: z.string().min(2, "Enter the patient's full name"),
  phone: z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number"),
  email: z.string().email("Enter a valid email").optional().or(z.literal("")),
  date_of_birth: z.string().optional().or(z.literal("")),
  gender: z.enum(["female", "male", "other"], { message: "Select gender." }),
  address: z.string().optional(),
  emergency_contact: z.string().optional(),
  patient_type: z.string(),
});

function NewPatientPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    address: "",
    emergency_contact: "",
    patient_type: "regular",
  });
  const [conditions, setConditions] = useState<SelectedCondition[]>([]);
  const [allergies, setAllergies] = useState<AllergyRow[]>([]);
  const [medications, setMedications] = useState<MedicationRow[]>([]);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [dentalHistory, setDentalHistory] = useState<DentalHistoryRow[]>([]);
  const [noKnownAllergies, setNoKnownAllergies] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [saveWithFamilyPhone, setSaveWithFamilyPhone] = useState(false);
  useUnsavedChanges(Boolean(form.full_name.trim() || form.phone.trim()));

  const set = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const phoneMatches = useQuery({
    queryKey: ["duplicate-check-phone", profile?.clinic_id, form.phone],
    enabled: !!profile?.clinic_id && isPatientPhone(form.phone),
    queryFn: () => findPatientsByPhone(profile!.clinic_id, form.phone),
  });
  const familyPhones = useQuery({
    queryKey: ["duplicate-family-phones", profile?.clinic_id, form.phone],
    enabled: !!profile?.clinic_id && isPatientPhone(form.phone),
    queryFn: () => familyPhonesForBase(profile!.clinic_id, form.phone),
  });
  const duplicates = useMemo(() => {
    return (phoneMatches.data ?? []).filter((row) => splitFamilyPhone(row.phone).suffix === 0);
  }, [phoneMatches.data]);
  const hasPhoneOnFile = (phoneMatches.data?.length ?? 0) > 0;
  const previewSharedPhone = useMemo(() => {
    if (!isPatientPhone(form.phone) || !hasPhoneOnFile) return patientPhoneDigits(form.phone);
    const base = splitFamilyPhone(form.phone).base;
    return nextSharedPhone(
      base,
      familyPhones.data ?? phoneMatches.data!.map((m) => m.phone),
    );
  }, [familyPhones.data, form.phone, hasPhoneOnFile, phoneMatches.data]);

  const create = useMutation({
    mutationFn: async () => {
      const parsed = patientSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Check the form");
      if (allergies.some((a) => !a.substance.trim())) {
        throw new Error("Enter the allergy substance, or remove the blank allergy.");
      }
      if (!noKnownAllergies && !allergies.some((a) => a.substance.trim())) {
        throw new Error(ALLERGY_CONFIRM_MSG);
      }
      if (!profile?.clinic_id) throw new Error("Your clinic profile is not ready yet.");

      const digits = patientPhoneDigits(form.phone);
      const phoneToSave =
        saveWithFamilyPhone && hasPhoneOnFile
          ? previewSharedPhone
          : digits;

      const { data, error } = await supabase.rpc("save_new_patient", {
        _full_name: form.full_name.trim(),
        _phone: phoneToSave,
        _email: form.email || null,
        _date_of_birth: form.date_of_birth || null,
        _gender: form.gender,
        _address: form.address || null,
        _emergency_contact: form.emergency_contact || null,
        _patient_type: form.patient_type,
        _conditions: conditions,
        _allergies: allergies
          .filter((a) => a.substance)
          .map((a) => ({
            substance: a.substance,
            reaction: a.reaction || null,
            severity: a.severity || null,
            notes: a.notes || null,
          })),
        _medications: medications
          .filter((m) => m.medication)
          .map((m) => ({
            medication: m.medication,
            dosage: m.dosage || null,
            frequency: m.frequency || null,
            duration: m.duration || null,
            notes: m.notes || null,
          })),
        _habits: habits
          .filter((h) => h.habit)
          .map((h) => ({
            habit: h.habit,
            notes: h.notes || null,
          })),
        _case_note: null,
      });
      if (error) {
        if (error.message.includes("already on file")) {
          throw new Error("Enter a different phone. This mobile is already on file.");
        }
        throw error;
      }

      const patient = z
        .object({
          id: z.string().uuid(),
          patient_code: z.string().min(1),
          full_name: z.string().min(1),
        })
        .parse(data);

      const dentalRows = dentalHistory.filter((row) => row.item.trim());
      if (dentalRows.length > 0) {
        const { error: dentalError } = await supabase.from("patient_dental_history").insert(
          dentalRows.map((row) => ({
            clinic_id: profile.clinic_id,
            patient_id: patient.id,
            item: row.item.trim(),
            notes: row.notes.trim() || null,
          })),
        );
        if (dentalError) {
          throw new Error(
            "Patient was saved, but dental history was not. Run supabase/sql-editor/07-dental-history.sql in Supabase, then add it from the patient profile.",
          );
        }
      }

      void logAudit(profile.clinic_id, "patient_created", "patient", patient.id, {
        patient_code: patient.patient_code,
      });
      return patient;
    },
    onSuccess: (patient) => {
      setSaveWithFamilyPhone(false);
      toast.success(`Patient created — ${patient.patient_code}`);
      void qc.invalidateQueries({ queryKey: ["patients"] });
      navigate({ to: "/patients/$patientId", params: { patientId: patient.id } });
    },
    onError: (error) => toast.error(friendlyError(error, "Unable to save patient.")),
  });

  function submit() {
    const parsed = patientSchema.safeParse(form);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the form");
      return;
    }
    if (allergies.some((a) => !a.substance.trim())) {
      toast.error("Enter the allergy substance, or remove the blank allergy.");
      return;
    }
    if (!noKnownAllergies && !allergies.some((a) => a.substance.trim())) {
      toast.error(ALLERGY_CONFIRM_MSG);
      return;
    }
    if (duplicates.length > 0) {
      setDuplicateOpen(true);
      return;
    }
    setSaveWithFamilyPhone(false);
    create.mutate();
  }

  return (
    <AppShell>
      <PageHeader title="New Patient" description="Enter once — reused everywhere in the clinic." />

      <Tabs defaultValue="basic" className="pb-20 lg:pb-0">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="medical">Medical</TabsTrigger>
          <TabsTrigger value="history">Dental</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="mt-4 space-y-4">
          <div className="surface-card grid gap-4 p-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="full_name">Full name *</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone *</Label>
              <Input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={10}
                placeholder="10-digit mobile"
                value={form.phone}
                onChange={(e) => set("phone", patientPhoneDigits(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pemail">Email</Label>
              <Input
                id="pemail"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => set("date_of_birth", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gender">
                Gender <span className="text-destructive">*</span>
              </Label>
              <Select
                {...(form.gender ? { value: form.gender } : {})}
                onValueChange={(v) => set("gender", v)}
              >
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ptype">Patient type</Label>
              <Select value={form.patient_type} onValueChange={(v) => set("patient_type", v)}>
                <SelectTrigger id="ptype">
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
              <Label htmlFor="emergency">Emergency contact</Label>
              <Input
                id="emergency"
                value={form.emergency_contact}
                onChange={(e) => set("emergency_contact", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <label className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-line bg-surface-2/40 p-3 text-sm sm:col-span-2">
              <Checkbox
                checked={noKnownAllergies}
                onCheckedChange={(v) => setNoKnownAllergies(v === true)}
              />
              <span>
                <span className="font-medium text-ink-900">No known allergies</span>
                <span className="mt-0.5 block text-xs text-ink-500">
                  Required unless you enter an allergy under Medical.
                </span>
              </span>
            </label>
          </div>

          {duplicates.length > 0 ? (
            <div className="surface-card border-warning/50 bg-warning/10 p-4">
              <p className="text-sm font-medium">Possible existing patient</p>
              {hasPhoneOnFile ? (
                <p className="mt-1 text-xs text-ink-600">
                  Same mobile on file — you can still save a family line as {previewSharedPhone}.
                </p>
              ) : null}
              <div className="mt-2 space-y-1">
                {duplicates.map((d) => (
                  <Link
                    key={d.id}
                    to="/patients/$patientId"
                    params={{ patientId: d.id }}
                    className="block text-sm underline"
                  >
                    {d.full_name} · {d.patient_code} · {d.phone}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="medical" className="mt-4">
          <MedicalRecordsForm
            conditions={conditions}
            onChangeConditions={setConditions}
            allergies={allergies}
            onChangeAllergies={setAllergies}
            medications={medications}
            onChangeMedications={setMedications}
            habits={habits}
            onChangeHabits={setHabits}
            dentalHistory={dentalHistory}
            onChangeDentalHistory={setDentalHistory}
            showDentalHistory={false}
          />
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <DentalHistorySection
            dentalHistory={dentalHistory}
            onChangeDentalHistory={setDentalHistory}
          />
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-10 mt-6 border-t border-line bg-background py-3 lg:static lg:bottom-auto lg:mt-5 lg:border-0 lg:py-0">
        <div className="flex min-w-0 flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" className="w-full min-w-0 sm:w-auto" asChild>
            <Link to="/patients">Cancel</Link>
          </Button>
          <Button className="w-full min-w-0 sm:flex-1" onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save patient
          </Button>
        </div>
      </div>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Possible existing patient</DialogTitle>
            <DialogDescription>
              This mobile number is already on file in this clinic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {duplicates.map((d) => (
              <Link
                key={d.id}
                to="/patients/$patientId"
                params={{ patientId: d.id }}
                className="surface-card flex items-center justify-between p-3 text-sm"
              >
                <span>{d.full_name}</span>
                <Badge variant="secondary">{d.patient_code}</Badge>
              </Link>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                const first = phoneMatches.data?.[0] ?? duplicates[0];
                if (first) {
                  setDuplicateOpen(false);
                  navigate({ to: "/patients/$patientId", params: { patientId: first.id } });
                }
              }}
            >
              Open existing patient
            </Button>
            <Button
              onClick={() => {
                setDuplicateOpen(false);
                setSaveWithFamilyPhone(hasPhoneOnFile);
                create.mutate();
              }}
            >
              {hasPhoneOnFile ? `Save as family · ${previewSharedPhone}` : "Continue creating new"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
