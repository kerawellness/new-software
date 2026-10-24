import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  Check,
  Download,
  Globe,
  Loader2,
  Pencil,
  Plus,
  ShieldAlert,
  Stethoscope,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingCards } from "@/components/common/states";
import { InvoiceBillFitFrame, InvoiceBillTemplate } from "@/components/billing/invoice-bill-template";
import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { resolveClinicLogoUrl } from "@/lib/brand";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { friendlyError, logAudit } from "@/lib/audit";
import { CURRENCIES, TREATMENT_CATEGORIES } from "@/lib/constants";
import { downloadClinicBackup } from "@/lib/clinic-backup";
import { composeClinicAddress, parseClinicBillExtras } from "@/lib/clinic-identity";
import { formatCurrency, isPatientPhone, patientPhoneDigits, todayISO } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: (search: Record<string, unknown>): { tab?: "catalogue" | "backup" } => {
    if (search["tab"] === "catalogue" || search["tab"] === "backup") return { tab: search["tab"] };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Settings — VSP Software" },
      {
        name: "description",
        content: "Configure clinic preferences, tax rates and the treatment catalogue.",
      },
    ],
  }),
  component: SettingsPage,
});

type TreatmentRow = {
  id: string;
  name: string;
  category: string;
  default_cost: number;
  active: boolean;
  quick_entry: boolean;
};

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [backupMode, setBackupMode] = useState<"overall" | "month" | "between">("overall");
  const [backupMonth, setBackupMonth] = useState(() => todayISO().slice(0, 7));
  const [backupFrom, setBackupFrom] = useState(() => todayISO().slice(0, 7));
  const [backupTo, setBackupTo] = useState(() => todayISO().slice(0, 7));
  const [backupBusy, setBackupBusy] = useState(false);

  const [addTreatmentOpen, setAddTreatmentOpen] = useState(false);
  const [editTreatmentOpen, setEditTreatmentOpen] = useState(false);
  const [selectedTreatmentForEdit, setSelectedTreatmentForEdit] = useState<TreatmentRow | null>(null);

  // Clinic Form State
  const [clinicName, setClinicName] = useState("");
  const [yourName, setYourName] = useState("");
  const [phone, setPhone] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [gstin, setGstin] = useState("");
  const [upiId, setUpiId] = useState("");
  const [doctor1, setDoctor1] = useState("");
  const [doctor2, setDoctor2] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("18");
  const [taxLabel, setTaxLabel] = useState("GST");

  // New Treatment Form State
  const [tName, setTName] = useState("");
  const [tCategory, setTCategory] = useState("general");
  const [tCost, setTCost] = useState("1000");
  const [tQuickEntry, setTQuickEntry] = useState(true);

  // Edit Treatment Form State
  const [editTName, setEditTName] = useState("");
  const [editTCost, setEditTCost] = useState("");
  const [editTQuickEntry, setEditTQuickEntry] = useState(false);

  // Query Clinic Info
  const clinicQuery = useQuery({
    queryKey: ["clinic-settings", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clinics")
        .select("*")
        .eq("id", profile!.clinic_id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (clinicQuery.data) {
      const c = clinicQuery.data;
      setClinicName(c.name ?? "");
      setPhone(patientPhoneDigits(c.phone ?? ""));
      setEmail(c.email ?? "");
      const extras = parseClinicBillExtras(c.address);
      setAddress(extras.address);
      setGstin(extras.gstin);
      setUpiId(extras.upi);
      setDoctor1(extras.doctor1);
      setDoctor2(extras.doctor2);
      setLogoUrl(c.logo_url ?? "");
      setCurrency(c.currency ?? "INR");
      setTaxEnabled(!!c.tax_enabled);
      setTaxRate(c.tax_rate ? String(c.tax_rate) : "18");
      setTaxLabel(c.tax_label ?? "GST");
    }
  }, [clinicQuery.data]);

  useEffect(() => {
    if (profile?.name) setYourName(profile.name);
  }, [profile?.name]);

  const savedClinic = clinicQuery.data;
  const savedExtras = savedClinic ? parseClinicBillExtras(savedClinic.address) : null;
  const settingsDirty =
    !!savedClinic &&
    (clinicName !== (savedClinic.name ?? "") ||
      phone !== patientPhoneDigits(savedClinic.phone ?? "") ||
      email !== (savedClinic.email ?? "") ||
      address !== (savedExtras?.address ?? "") ||
      gstin !== (savedExtras?.gstin ?? "") ||
      upiId !== (savedExtras?.upi ?? "") ||
      doctor1 !== (savedExtras?.doctor1 ?? "") ||
      doctor2 !== (savedExtras?.doctor2 ?? "") ||
      logoUrl !== (savedClinic.logo_url ?? "") ||
      currency !== (savedClinic.currency ?? "INR") ||
      taxEnabled !== !!savedClinic.tax_enabled ||
      taxRate !== (savedClinic.tax_rate ? String(savedClinic.tax_rate) : "18") ||
      taxLabel !== (savedClinic.tax_label ?? "GST") ||
      yourName.trim() !== (profile?.name ?? ""));
  useUnsavedChanges(settingsDirty);

  const previewNet = 1000;
  const previewRate = taxEnabled ? Number(taxRate) || 0 : 0;
  const previewTax = taxEnabled ? Math.round(((previewNet * previewRate) / 100) * 100) / 100 : 0;
  const previewGrand = Math.round((previewNet + previewTax) * 100) / 100;

  function onLogoFile(file: File | undefined) {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const isJpeg = file.type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg");
    const isPng = file.type === "image/png" || name.endsWith(".png");
    if (!isPdf && !isJpeg && !isPng) {
      toast.error("Choose a JPG, PNG, or PDF file.");
      return;
    }
    if (file.size > 1_500_000) {
      toast.error("Logo must be under 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (isPdf) {
        setLogoUrl(result);
        return;
      }
      const img = new Image();
      img.onload = () => {
        const max = 512;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setLogoUrl(result);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setLogoUrl(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.85));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  }

  // Query Treatment Catalogue
  const catalogueQuery = useQuery({
    queryKey: ["treatment-catalogue", "all", profile?.clinic_id],
    staleTime: 0,
    enabled: !!profile?.clinic_id,
    queryFn: async (): Promise<TreatmentRow[]> => {
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .select("id, name, default_cost, active, quick_entry")
        .eq("clinic_id", profile!.clinic_id)
        .order("name", { ascending: true });

      if (error) throw error;

      return (data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        category: "general",
        default_cost: Number(r.default_cost),
        active: r.active,
        quick_entry: !!r.quick_entry,
      }));
    },
  });

  const catalogueRows = Array.isArray(catalogueQuery.data) ? catalogueQuery.data : [];
  const quickEntryRows = catalogueRows.filter((t) => t.quick_entry && t.active);

  // Save Clinic Settings mutation
  const saveClinic = useMutation({
    mutationFn: async () => {
      if (!clinicName.trim()) throw new Error("Clinic name required.");
      if (!isPatientPhone(phone)) throw new Error("Enter a 10-digit phone number.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      const { data: updatedClinic, error } = await supabase
        .from("clinics")
        .update({
          name: clinicName.trim(),
          phone,
          email: email.trim() || null,
          address: composeClinicAddress(address, gstin, upiId, doctor1, doctor2),
          logo_url: logoUrl.trim() || null,
          currency,
          tax_enabled: taxEnabled,
          tax_rate: taxEnabled ? Number(taxRate) : 0,
          tax_label: taxLabel.trim() || "GST",
        })
        .eq("id", profile.clinic_id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updatedClinic) {
        throw new Error("Clinic settings were not saved. Sign out and sign in again, then retry.");
      }

      const trimmedName = yourName.trim();
      if (trimmedName.length < 2) throw new Error("Enter your name.");
      if (trimmedName !== (profile.name ?? "")) {
        const { error: nameError } = await supabase
          .from("profiles")
          .update({ name: trimmedName })
          .eq("id", profile.id);
        if (nameError) throw nameError;
      }

      await logAudit(profile.clinic_id, "clinic_settings_updated", "clinic", profile.clinic_id);
    },
    onSuccess: () => {
      toast.success(`"${clinicName.trim()}" clinic settings saved.`);
      void qc.invalidateQueries({ queryKey: ["clinic-settings"] });
      void qc.invalidateQueries({ queryKey: ["profile"] });
      void qc.invalidateQueries({ queryKey: ["invoice"] });
      void qc.invalidateQueries({ queryKey: ["invoice-bill-preview"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to save clinic settings.")),
  });

  // Add Treatment mutation
  const addTreatment = useMutation({
    mutationFn: async () => {
      if (!tName.trim()) throw new Error("Procedure name required.");
      const cost = Number(tCost);
      if (Number.isNaN(cost) || cost < 0) throw new Error("Enter a valid cost.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      const nameKey = tName.trim().toLowerCase();
      const duplicate = catalogueRows.find(
        (t) => t.name.trim().toLowerCase() === nameKey,
      );
      if (duplicate) {
        throw new Error(
          `“${duplicate.name}” already exists at ${formatCurrency(duplicate.default_cost, currency)}. Edit that procedure to change the price, or use a different name.`,
        );
      }

      const { data, error } = await supabase
        .from("treatment_catalogue")
        .insert({
          clinic_id: profile.clinic_id,
          name: tName.trim(),
          default_cost: cost,
          active: true,
          quick_entry: tQuickEntry,
        })
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success(`"${tName.trim()}" added to treatment catalogue.`);
      void qc.invalidateQueries({ queryKey: ["treatment-catalogue"] });
      setAddTreatmentOpen(false);
      setTName("");
      setTQuickEntry(true);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to add procedure.")),
  });

  const openEditModal = (treatment: TreatmentRow) => {
    setSelectedTreatmentForEdit(treatment);
    setEditTName(treatment.name);
    setEditTCost(treatment.default_cost.toString());
    setEditTQuickEntry(treatment.quick_entry);
    setEditTreatmentOpen(true);
  };

  const editTreatment = useMutation({
    mutationFn: async () => {
      if (!selectedTreatmentForEdit) throw new Error("Select a treatment to edit.");
      if (!editTName.trim()) throw new Error("Procedure name required.");
      const cost = Number(editTCost);
      if (Number.isNaN(cost) || cost < 0) throw new Error("Enter a valid cost.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      const { data, error } = await supabase
        .from("treatment_catalogue")
        .update({
          name: editTName.trim(),
          default_cost: cost,
          quick_entry: editTQuickEntry,
        })
        .eq("id", selectedTreatmentForEdit.id)
        .eq("clinic_id", profile.clinic_id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Could not save treatment. Apply the latest database update, then try again.");
    },
    onSuccess: () => {
      toast.success("Treatment updated successfully.");
      void qc.invalidateQueries({ queryKey: ["treatment-catalogue"] });
      setEditTreatmentOpen(false);
      setSelectedTreatmentForEdit(null);
      setEditTName("");
      setEditTCost("");
      setEditTQuickEntry(false);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to update treatment.")),
  });

  // Toggle Quick Entry display mutation
  const toggleTreatmentQuickEntry = useMutation({
    mutationFn: async ({ id, quick_entry }: { id: string; quick_entry: boolean }) => {
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .update({ quick_entry })
        .eq("id", id)
        .eq("clinic_id", profile.clinic_id)
        .select("id, quick_entry")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "Could not save Quick Entry. Apply the latest database update, then try again.",
        );
      }
      return data;
    },
    onMutate: async ({ id, quick_entry }) => {
      await qc.cancelQueries({ queryKey: ["treatment-catalogue"] });
      const previous = qc.getQueryData<TreatmentRow[]>(["treatment-catalogue", "all", profile?.clinic_id]);
      qc.setQueryData<TreatmentRow[]>(["treatment-catalogue", "all", profile?.clinic_id], (old) =>
        (old ?? []).map((row) => (row.id === id ? { ...row, quick_entry } : row)),
      );
      return { previous };
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.quick_entry ? "Added to Quick Entry." : "Removed from Quick Entry.");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["treatment-catalogue", "all", profile?.clinic_id], ctx.previous);
      }
      toast.error(friendlyError(err, "Unable to update procedure."));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["treatment-catalogue"] });
    },
  });

  // Toggle Treatment Active mutation
  const toggleTreatmentActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .update({ active })
        .eq("id", id)
        .eq("clinic_id", profile.clinic_id)
        .select("id, active")
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        throw new Error(
          "Could not save Active. Apply the latest database update, then try again.",
        );
      }
      return data;
    },
    onMutate: async ({ id, active }) => {
      await qc.cancelQueries({ queryKey: ["treatment-catalogue"] });
      const previous = qc.getQueryData<TreatmentRow[]>(["treatment-catalogue", "all", profile?.clinic_id]);
      qc.setQueryData<TreatmentRow[]>(["treatment-catalogue", "all", profile?.clinic_id], (old) =>
        (old ?? []).map((row) => (row.id === id ? { ...row, active } : row)),
      );
      return { previous };
    },
    onSuccess: () => {
      toast.success("Catalogue updated.");
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["treatment-catalogue", "all", profile?.clinic_id], ctx.previous);
      }
      toast.error(friendlyError(err, "Unable to update procedure."));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["treatment-catalogue"] });
    },
  });

  const deleteTreatment = useMutation({
    mutationFn: async (item: { id: string; name: string }) => {
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .delete()
        .eq("id", item.id)
        .eq("clinic_id", profile.clinic_id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Could not delete that treatment.");
    },
    onSuccess: (_data, item) => {
      toast.success(`"${item.name}" deleted.`);
      void qc.invalidateQueries({ queryKey: ["treatment-catalogue"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to delete treatment.")),
  });

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Clinic details, treatments, and backup."
      />

      <Tabs
        value={tab === "catalogue" || tab === "backup" ? tab : "clinic"}
        onValueChange={(value) => {
          void navigate({
            to: "/settings",
            search: value === "catalogue" || value === "backup" ? { tab: value } : {},
            replace: true,
          });
        }}
        className="min-w-0"
      >
        <TabsList className="mb-4 w-full max-w-full">
          <TabsTrigger value="clinic">Clinic</TabsTrigger>
          <TabsTrigger value="catalogue">Treatments</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
        </TabsList>

        {/* Tab 1: Clinic & Taxes */}
        <TabsContent value="clinic" className="space-y-4">
          {clinicQuery.isLoading ? (
            <LoadingCards count={2} />
          ) : clinicQuery.isError ? (
            <ErrorState title="Unable to load clinic settings." onRetry={() => clinicQuery.refetch()} />
          ) : (
            <form
              className="surface-card max-w-xl space-y-4 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                saveClinic.mutate();
              }}
            >
              <h3 className="font-semibold text-sm flex items-center gap-2 text-primary border-b pb-2">
                <Building2 className="size-4" aria-hidden /> Clinic Info & Billing Preferences
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="your-name">Your name *</Label>
                <Input
                  id="your-name"
                  value={yourName}
                  onChange={(e) => setYourName(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Home shows Good day and the first word of this name.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sname">Clinic Name *</Label>
                <Input
                  id="sname"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sdoctor1">Doctor 1</Label>
                  <Input
                    id="sdoctor1"
                    placeholder="Dr. name"
                    value={doctor1}
                    onChange={(e) => setDoctor1(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sdoctor2">Doctor 2</Label>
                  <Input
                    id="sdoctor2"
                    placeholder="Optional"
                    value={doctor2}
                    onChange={(e) => setDoctor2(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                These names appear only as Attending Doctor when recording a treatment.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sphone">Phone Number</Label>
                  <Input
                    id="sphone"
                    type="text"
                    inputMode="numeric"
                    autoComplete="tel"
                    maxLength={10}
                    placeholder="10-digit mobile"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="semail">Clinic Email</Label>
                  <Input
                    id="semail"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="saddr">Address</Label>
                <Textarea
                  id="saddr"
                  rows={3}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <h4 className="pt-1 text-xs font-semibold uppercase tracking-wider text-ink-500">
                Bill appearance
              </h4>

              <div className="space-y-1.5">
                <Label htmlFor="slogo">Logo</Label>
                <input
                  ref={logoInputRef}
                  id="slogo"
                  type="file"
                  accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
                  className="sr-only"
                  onChange={(e) => {
                    onLogoFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => logoInputRef.current?.click()}>
                    Choose from gallery
                  </Button>
                  {logoUrl ? (
                    <Button type="button" variant="outline" onClick={() => setLogoUrl("")}>
                      Remove
                    </Button>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  JPG, PNG, or PDF. Shown on printed and shared invoices. If empty, the default VSP logo
                  is used.
                </p>
                {!logoUrl.trim() || !isPdfLogoPreview(logoUrl) ? (
                  <img
                    src={resolveClinicLogoUrl(logoUrl)}
                    alt="Invoice logo preview"
                    className="mt-2 h-14 w-14 rounded-lg object-contain shadow-xs"
                  />
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">PDF logo selected for invoices.</p>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sgstin">GSTIN</Label>
                  <Input
                    id="sgstin"
                    placeholder="29ABCDE1234F1Z5"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="supi">UPI ID</Label>
                  <Input
                    id="supi"
                    placeholder="clinic@upi"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <Label htmlFor="stax">Enable tax</Label>
                  <p className="text-sm text-muted-foreground">Add GST on the bill at the rate below.</p>
                </div>
                <Switch id="stax" checked={taxEnabled} onCheckedChange={setTaxEnabled} />
              </div>

              {taxEnabled ? (
                <div className="space-y-1.5">
                  <Label htmlFor="staxrate">Tax rate (%)</Label>
                  <Input
                    id="staxrate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value.replace(/[^\d.]/g, ""))}
                  />
                </div>
              ) : null}

              <div className="space-y-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-ink-500">Subtotal</span>
                  <span className="tabular-nums">{formatCurrency(previewNet, currency)}</span>
                </div>
                {taxEnabled ? (
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-500">
                      {taxLabel.trim() || "GST"} ({previewRate}%)
                    </span>
                    <span className="tabular-nums">{formatCurrency(previewTax, currency)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between gap-3">
                    <span className="text-ink-500">GST</span>
                    <span>Off</span>
                  </div>
                )}
                <div className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(previewGrand, currency)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-ink-700">Bill preview</p>
                <div className="overflow-hidden rounded-xl border border-line bg-surface-2 p-2">
                  <InvoiceBillFitFrame className="h-56 w-full sm:h-72">
                    <InvoiceBillTemplate
                      compact
                      clinic={{
                        name: clinicName || "Dental Clinic",
                        address: composeClinicAddress(address, gstin, upiId, doctor1, doctor2),
                        phone,
                        email,
                        logo_url: logoUrl.trim() || null,
                        tax_enabled: taxEnabled,
                        tax_label: taxLabel,
                        tax_rate: Number(taxRate) || 0,
                      }}
                      patient={{
                        full_name: "Sample Patient",
                        patient_code: "PT-0000",
                        phone: "9999999999",
                      }}
                      invoice={{
                        invoice_number: "PREVIEW",
                        invoice_date: todayISO(),
                        total_amount: previewNet,
                        tax_amount: previewTax,
                        grand_total: previewGrand,
                        paid_amount: 0,
                        balance_amount: previewGrand,
                      }}
                      items={[
                        {
                          id: "preview-1",
                          description: "Consultation",
                          quantity: 1,
                          unit_price: 1000,
                          amount: 1000,
                        },
                      ]}
                      currency={currency}
                    />
                  </InvoiceBillFitFrame>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="scurr">Default Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="scurr">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label} ({c.value})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staxlabel">Tax Label</Label>
                  <Input
                    id="staxlabel"
                    value={taxLabel}
                    onChange={(e) => setTaxLabel(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit" disabled={saveClinic.isPending} className="w-full">
                  {saveClinic.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </form>
          )}

        </TabsContent>

        {/* Treatments */}
        <TabsContent value="catalogue" className="space-y-4">
          <div className="mb-2 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Stethoscope className="size-4 text-primary" aria-hidden /> Treatments & Quick Entry
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Choose which procedures appear in Quick Entry.
              </p>
            </div>
            <Button size="sm" className="w-full sm:w-auto" onClick={() => setAddTreatmentOpen(true)}>
              <Plus className="size-4" aria-hidden /> Add Treatment
            </Button>
          </div>

          {catalogueQuery.isLoading ? (
            <LoadingCards count={3} />
          ) : catalogueQuery.isError ? (
            <ErrorState title="Unable to load treatment catalogue." onRetry={() => catalogueQuery.refetch()} />
          ) : (
            <div className="space-y-4">
              
              {/* Section 1: Quick Entry List */}
              <div className="min-w-0 space-y-3 rounded-2xl border border-line bg-surface-2/40 p-3 sm:p-4">
                <div className="flex items-center gap-2 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
                  <Zap className="size-3.5 shrink-0" />
                  <h4>Quick Entry List</h4>
                </div>
                
                {quickEntryRows.length === 0 ? (
                  <p className="px-0.5 py-2 text-xs italic text-muted-foreground">
                    No procedures enabled for Quick Entry yet. Turn on both Quick Entry and Active.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {quickEntryRows.map((item) => (
                      <div key={item.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-line bg-surface-1 p-3 text-xs">
                        <span className="min-w-0 truncate font-medium text-ink-900">{item.name}</span>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className="font-semibold tabular-nums text-ink-500">
                            {formatCurrency(item.default_cost, currency)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="px-2 text-destructive hover:bg-destructive/10"
                            title="Remove from Quick Entry"
                            onClick={() => toggleTreatmentQuickEntry.mutate({ id: item.id, quick_entry: false })}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Section 2: All Procedures List */}
              <div className="min-w-0 space-y-3 rounded-2xl border border-line bg-surface-1 p-3 sm:p-4">
                <div className="flex items-center gap-2 border-b border-line pb-2 text-xs font-semibold uppercase tracking-wider text-primary">
                  <Stethoscope className="size-3.5 shrink-0" />
                  <h4>All Dental Procedures</h4>
                </div>

                {catalogueRows.length === 0 ? (
                  <EmptyState
                    icon={Stethoscope}
                    title="No treatments in catalogue"
                    description="Add standard dental procedures and default costs to get started."
                    action={
                      <Button size="sm" onClick={() => setAddTreatmentOpen(true)}>
                        <Plus className="size-4" aria-hidden /> Add Treatment
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-2.5">
                    {catalogueRows.map((item) => (
                      <div
                        key={item.id}
                        className="min-w-0 space-y-3 rounded-xl border border-line bg-surface-2/40 p-3.5 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0"
                      >
                        <div className="min-w-0 pl-0.5">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-ink-900">{item.name}</p>
                            {item.quick_entry ? (
                              <Badge
                                variant="secondary"
                                className="flex items-center gap-0.5 border-line bg-surface-2 px-1.5 py-0 text-[9px] text-ink-500"
                              >
                                <Zap className="size-2" /> Quick
                              </Badge>
                            ) : null}
                            <Badge variant="outline" className="border-line text-[10px] capitalize text-ink-700">
                              {item.category}
                            </Badge>
                          </div>
                          <p className="mt-1.5 text-sm font-bold tabular-nums text-ink-900 sm:text-base">
                            {formatCurrency(item.default_cost, currency)}
                          </p>
                        </div>

                        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full justify-center border-line bg-surface-1 sm:w-auto"
                            onClick={() => openEditModal(item)}
                          >
                            <Pencil className="mr-1.5 size-3.5" />
                            Edit
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="w-full justify-center border-line bg-surface-1 text-destructive hover:bg-destructive/10 sm:w-auto"
                            disabled={deleteTreatment.isPending}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `Delete ${item.name}? It will leave Settings and Quick Entry. Visits already recorded stay as they are.`,
                                )
                              ) {
                                return;
                              }
                              deleteTreatment.mutate({ id: item.id, name: item.name });
                            }}
                          >
                            Delete
                          </Button>

                          <div
                            role="button"
                            tabIndex={0}
                            className="flex h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface-1 px-3 text-left sm:h-9 sm:w-auto sm:min-w-[10rem]"
                            aria-pressed={item.quick_entry}
                            onClick={() =>
                              toggleTreatmentQuickEntry.mutate({
                                id: item.id,
                                quick_entry: !item.quick_entry,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleTreatmentQuickEntry.mutate({
                                  id: item.id,
                                  quick_entry: !item.quick_entry,
                                });
                              }
                            }}
                          >
                            <span className="text-xs font-medium text-ink-700">Quick Entry</span>
                            <Switch
                              checked={item.quick_entry}
                              tabIndex={-1}
                              className="pointer-events-none"
                              aria-hidden
                            />
                          </div>

                          <div
                            role="button"
                            tabIndex={0}
                            className="flex h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-line bg-surface-1 px-3 text-left sm:h-9 sm:w-auto sm:min-w-[7.5rem]"
                            aria-pressed={item.active}
                            onClick={() =>
                              toggleTreatmentActive.mutate({
                                id: item.id,
                                active: !item.active,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                toggleTreatmentActive.mutate({
                                  id: item.id,
                                  active: !item.active,
                                });
                              }
                            }}
                          >
                            <span className="text-xs font-medium text-ink-700">Active</span>
                            <Switch
                              checked={item.active}
                              tabIndex={-1}
                              className="pointer-events-none"
                              aria-hidden
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}
        </TabsContent>

        <TabsContent value="backup" className="space-y-4">
          <div className="surface-card max-w-xl space-y-3 p-5">
            <h3 className="flex items-center gap-2 border-b pb-2 text-sm font-semibold text-primary">
              <Download className="size-4" aria-hidden /> Backup
            </h3>
            <p className="text-sm text-ink-500">
              Downloads organized CSV files in one zip: patients, appointments, visits,
              treatments, bills, payments, follow-ups, and medical notes. Open the zip in Excel.
              This file is a spreadsheet copy. The copy you restore the clinic from
              is Supabase → Database → Backups. One month uses that month’s dates. Between months
              uses every date from the start month through the end month. Overall is every date.
              The treatment price list is always the current list.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="backup-scope">What to include</Label>
                <Select
                  value={backupMode}
                  onValueChange={(value) => {
                    if (value === "month" || value === "between" || value === "overall") setBackupMode(value);
                  }}
                >
                  <SelectTrigger id="backup-scope">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overall">Overall</SelectItem>
                    <SelectItem value="month">One month</SelectItem>
                    <SelectItem value="between">Between months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {backupMode === "month" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="backup-month">Month</Label>
                  <Input
                    id="backup-month"
                    type="month"
                    value={backupMonth}
                    onChange={(e) => setBackupMonth(e.target.value)}
                  />
                </div>
              ) : null}
              {backupMode === "between" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="backup-from">From month</Label>
                    <Input
                      id="backup-from"
                      type="month"
                      value={backupFrom}
                      onChange={(e) => setBackupFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="backup-to">To month</Label>
                    <Input
                      id="backup-to"
                      type="month"
                      value={backupTo}
                      onChange={(e) => setBackupTo(e.target.value)}
                    />
                  </div>
                </>
              ) : null}
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={backupBusy || !profile?.clinic_id}
              onClick={() => {
                const clinicId = profile?.clinic_id;
                if (!clinicId || backupBusy) return;
                const monthOk = /^\d{4}-\d{2}$/;
                if (backupMode === "month" && !monthOk.test(backupMonth)) {
                  toast.error("Choose a month first.");
                  return;
                }
                if (backupMode === "between" && (!monthOk.test(backupFrom) || !monthOk.test(backupTo))) {
                  toast.error("Choose a start month and an end month.");
                  return;
                }
                const fromMonth = backupFrom <= backupTo ? backupFrom : backupTo;
                const toMonth = backupFrom <= backupTo ? backupTo : backupFrom;
                setBackupBusy(true);
                const scope =
                  backupMode === "month"
                    ? { mode: "month" as const, month: backupMonth }
                    : backupMode === "between"
                      ? { mode: "between" as const, from: fromMonth, to: toMonth }
                      : { mode: "overall" as const };
                void downloadClinicBackup(clinicId, scope)
                  .then(() => {
                    void logAudit(clinicId, "backup_downloaded", "clinic", clinicId, {
                      scope: backupMode,
                      month: backupMode === "month" ? backupMonth : null,
                      from: backupMode === "between" ? fromMonth : null,
                      to: backupMode === "between" ? toMonth : null,
                    });
                    toast.success(
                      backupMode === "month"
                        ? `Backup for ${backupMonth} downloaded.`
                        : backupMode === "between"
                          ? `Backup from ${fromMonth} to ${toMonth} downloaded.`
                          : "Overall backup downloaded.",
                    );
                  })
                  .catch((err) => toast.error(friendlyError(err, "Unable to download backup.")))
                  .finally(() => setBackupBusy(false));
              }}
            >
              {backupBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" aria-hidden />}
              Download backup
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Add Treatment Modal */}
      <Dialog open={addTreatmentOpen} onOpenChange={setAddTreatmentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Treatment Procedure</DialogTitle>
            <DialogDescription>Add a new procedure to your clinic's billing catalogue.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              addTreatment.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="tpname">Procedure Name *</Label>
              <Input
                id="tpname"
                value={tName}
                onChange={(e) => setTName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpcat">Category</Label>
              <Select value={tCategory} onValueChange={setTCategory}>
                <SelectTrigger id="tpcat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TREATMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c} className="capitalize">
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tpcost">Default Cost ({currency}) *</Label>
              <Input
                id="tpcost"
                type="number"
                min={0}
                step="0.01"
                value={tCost}
                onChange={(e) => setTCost(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div>
                <Label htmlFor="tqe">Quick Entry</Label>
                <p className="text-sm text-muted-foreground">Show in the walk-in check-in list.</p>
              </div>
              <Switch id="tqe" checked={tQuickEntry} onCheckedChange={setTQuickEntry} />
            </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setAddTreatmentOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addTreatment.isPending}>
              {addTreatment.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Procedure
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Treatment Modal */}
      <Dialog open={editTreatmentOpen} onOpenChange={setEditTreatmentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Treatment Procedure</DialogTitle>
            <DialogDescription>Modify the name and default cost of this procedure.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              editTreatment.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="etpname">Procedure Name *</Label>
              <Input
                id="etpname"
                value={editTName}
                onChange={(e) => setEditTName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="etpcost">Default Cost ({currency}) *</Label>
              <Input
                id="etpcost"
                type="number"
                min={0}
                step="0.01"
                value={editTCost}
                onChange={(e) => setEditTCost(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div>
                <Label htmlFor="etqe">Quick Entry</Label>
                <p className="text-sm text-muted-foreground">Show in the walk-in check-in list.</p>
              </div>
              <Switch id="etqe" checked={editTQuickEntry} onCheckedChange={setEditTQuickEntry} />
            </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEditTreatmentOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editTreatment.isPending}>
              {editTreatment.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function isPdfLogoPreview(url: string) {
  const value = url.trim().toLowerCase();
  return value.startsWith("data:application/pdf") || value.endsWith(".pdf");
}
