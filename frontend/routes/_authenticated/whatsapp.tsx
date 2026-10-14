import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  ExternalLink,
  Loader2,
  MessageCircle,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { StatusChip } from "@/components/common/status-chip";
import { PatientPicker } from "@/components/patients/patient-picker";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-session";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { usePatientSearch } from "@/hooks/use-patients-query";
import { friendlyError, logAudit } from "@/lib/audit";
import { WHATSAPP_CATEGORIES, WHATSAPP_CATEGORY_LABELS, WHATSAPP_TRIGGERS, WHATSAPP_TRIGGER_LABELS, type WhatsAppTrigger } from "@/lib/constants";
import { getDemoWhatsAppTemplates, isDemoId } from "@/lib/demo-data";
import { formatCurrency, formatDate, formatTime, whatsappLink } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp Templates — VSP Software" },
      {
        name: "description",
        content: "Manage clinic WhatsApp templates for appointments, follow-ups and billing.",
      },
    ],
  }),
  component: WhatsAppPage,
});

type TemplateRow = {
  id: string;
  name: string;
  category: string;
  message: string;
  active: boolean;
  trigger_event?: string | null;
};

type PatientOption = {
  id: string;
  full_name: string;
  patient_code: string;
  phone: string;
};

function WhatsAppPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();
  const currency = profile?.clinic?.currency ?? "INR";

  const [newTemplateOpen, setNewTemplateOpen] = useState(false);

  // Template Form State
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState<string>("appointment");
  const [templateMessage, setTemplateMessage] = useState("");
  const [templateTriggerEvent, setTemplateTriggerEvent] = useState<string>("");
  const [editingTemplate, setEditingTemplate] = useState<TemplateRow | null>(null);

  const openCreateModal = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setTemplateCategory("appointment");
    setTemplateMessage("");
    setTemplateTriggerEvent("");
    setNewTemplateOpen(true);
  };

  const openEditModal = (tpl: TemplateRow) => {
    if (isDemoId(tpl.id)) {
      toast.message("Dummy templates are preview only — turn off Show dummy data to edit real ones.");
      return;
    }
    setEditingTemplate(tpl);
    setTemplateName(tpl.name);
    setTemplateCategory(tpl.category);
    setTemplateMessage(tpl.message);
    setTemplateTriggerEvent(tpl.trigger_event ?? "none");
    setNewTemplateOpen(true);
  };

  // Composer State
  const [selectedCategory, setSelectedCategory] = useState<string>("appointment");
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Context variables
  const [customDate, setCustomDate] = useState("");
  const [customTime, setCustomTime] = useState("");
  const [customAmount, setCustomAmount] = useState("");

  // Fetch Templates
  const templatesQuery = useQuery({
    queryKey: ["whatsapp-templates", profile?.clinic_id],
    enabled: !!profile?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .select("id, name, category, message, active")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({ ...row, trigger_event: null })) as TemplateRow[];
    },
  });

  // Patient Search Query
  const patientsQuery = usePatientSearch(patientSearch, profile?.clinic_id);

  // Create Template Mutation
  const createTemplate = useMutation({
    mutationFn: async () => {
      if (!templateName.trim()) throw new Error("Enter template name.");
      if (!templateMessage.trim()) throw new Error("Enter template message content.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      // Omit trigger_event until live DB has the column (PGRST204)
      const { data, error } = await supabase
        .from("whatsapp_templates")
        .insert({
          clinic_id: profile.clinic_id,
          name: templateName.trim(),
          category: templateCategory,
          message: templateMessage.trim(),
          active: true,
        })
        .select("id")
        .single();

      if (error) throw error;
      await logAudit(profile.clinic_id, "whatsapp_template_created", "whatsapp_template", data.id);
      return data;
    },
    onSuccess: () => {
      toast.success("WhatsApp template created.");
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      setNewTemplateOpen(false);
      setTemplateName("");
      setTemplateMessage("");
      setTemplateTriggerEvent("");
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to save template.")),
  });

  // Update Template Mutation
  const updateTemplate = useMutation({
    mutationFn: async () => {
      if (!editingTemplate) return;
      if (!templateName.trim()) throw new Error("Enter template name.");
      if (!templateMessage.trim()) throw new Error("Enter template message content.");
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");

      const { error } = await supabase
        .from("whatsapp_templates")
        .update({
          name: templateName.trim(),
          category: templateCategory,
          message: templateMessage.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingTemplate.id);

      if (error) throw error;
      await logAudit(profile.clinic_id, "whatsapp_template_updated", "whatsapp_template", editingTemplate.id);
    },
    onSuccess: () => {
      toast.success("WhatsApp template updated.");
      void qc.invalidateQueries({ queryKey: ["whatsapp-templates"] });
      setNewTemplateOpen(false);
      setEditingTemplate(null);
      setTemplateName("");
      setTemplateMessage("");
      setTemplateTriggerEvent("");
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to save template.")),
  });

  // Compute final interpolated message
  const templates = useMemo(() => {
    const real = templatesQuery.data ?? [];
    if (!showDemoData) return real;
    return [...(getDemoWhatsAppTemplates() as TemplateRow[]), ...real];
  }, [templatesQuery.data, showDemoData]);
  const activeTemplate = templates.find((t) => t.id === selectedTemplateId);
  const rawMessage = activeTemplate?.message ?? "Hello {patient_name}, reminder from {clinic_name}.";

  const interpolatedMessage = rawMessage
    .replace(/\{patient_name\}/g, selectedPatient?.full_name ?? "[Patient Name]")
    .replace(/\{clinic_name\}/g, profile?.clinic?.name ?? "VSP Software")
    .replace(/\{date\}/g, customDate ? formatDate(customDate) : "[Date]")
    .replace(/\{time\}/g, customTime ? formatTime(customTime) : "[Time]")
    .replace(/\{amount\}/g, customAmount ? formatCurrency(customAmount, currency) : "[Amount]");

  function handleSendWhatsApp() {
    if (!selectedPatient?.phone) {
      toast.error("Select a patient with a valid phone number.");
      return;
    }
    const link = whatsappLink(selectedPatient.phone, interpolatedMessage);
    window.open(link, "_blank");
    toast.success("Opening WhatsApp...");
  }

  return (
    <AppShell>
      <PageHeader
        title="WhatsApp Templates"
        description="Manage clinic message templates. Send from a patient, invoice, or follow-up when needed."
        action={
          <Button onClick={openCreateModal}>
            <Plus className="size-4" aria-hidden />
            New Template
          </Button>
        }
      />

      <Tabs defaultValue="templates">
        <TabsList className="grid w-full grid-cols-2 max-w-sm mb-4">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="composer">Send once</TabsTrigger>
        </TabsList>

        {/* Tab 1: Interactive Message Composer */}
        <TabsContent value="composer" className="space-y-4">
          <div className="surface-card grid gap-4 p-5 md:grid-cols-2">
            <div className="space-y-4">
              <h3 className="font-semibold text-sm flex items-center gap-1.5 text-primary">
                <MessageCircle className="size-4" aria-hidden /> 1. Select Patient & Template
              </h3>

              <PatientPicker
                required
                label="Recipient"
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

              {/* Template Category & Selection */}
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select
                  value={selectedCategory}
                  onValueChange={(cat) => {
                    setSelectedCategory(cat);
                    const first = templates.find((t) => t.category === cat);
                    if (first) setSelectedTemplateId(first.id);
                  }}
                >
                  <SelectTrigger aria-label="Category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {WHATSAPP_CATEGORY_LABELS[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Select Template</Label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger aria-label="Select Template">
                    <SelectValue placeholder="Choose a template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates
                      .filter((t) => t.category === selectedCategory)
                      .map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Variables Context Inputs */}
              <div className="grid gap-2 text-xs sm:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="cdate" className="text-[11px]">Date Variable</Label>
                  <Input
                    id="cdate"
                    type="date"
                    className=""
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ctime" className="text-[11px]">Time Variable</Label>
                  <Input
                    id="ctime"
                    type="time"
                    className=""
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="camt" className="text-[11px]">Amount ({currency})</Label>
                  <Input
                    id="camt"
                    type="number"
                    className=""
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Live Message Preview Box */}
            <div className="flex flex-col justify-between rounded-xl border bg-accent/20 p-4 space-y-4">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-1.5 mb-2">
                  <Sparkles className="size-4 text-primary" aria-hidden /> Live Message Preview
                </h3>
                <div className="rounded-lg border bg-card p-3 text-xs whitespace-pre-wrap font-sans text-foreground/90 shadow-sm leading-relaxed">
                  {interpolatedMessage}
                </div>
              </div>

              <Button
                className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white"
                onClick={handleSendWhatsApp}
                disabled={!selectedPatient}
              >
                <Send className="size-4" aria-hidden /> Send via WhatsApp Web / App
                <ExternalLink className="size-3 ml-1 opacity-70" />
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Manage Templates */}
        <TabsContent value="templates" className="space-y-3">
          {templatesQuery.isLoading ? (
            <LoadingCards count={3} />
          ) : templatesQuery.isError ? (
            <ErrorState
              title="Unable to load WhatsApp templates."
              onRetry={() => void templatesQuery.refetch()}
            />
          ) : templates.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No WhatsApp templates found"
              description="Create reusable message templates for your clinic."
              action={
                <Button onClick={openCreateModal}>
                  <Plus className="size-4" aria-hidden /> New Template
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {templates.map((tpl) => (
                <div key={tpl.id} className="surface-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm">{tpl.name}</h4>
                      <StatusChip tone="neutral">
                        {tpl.category.replace("_", " ")}
                      </StatusChip>
                      {tpl.trigger_event ? (
                        <StatusChip tone="neutral">
                          {WHATSAPP_TRIGGER_LABELS[tpl.trigger_event as WhatsAppTrigger]}
                        </StatusChip>
                      ) : null}
                    </div>
                    <Button variant="ghost" size="sm" className="px-2.5" onClick={() => openEditModal(tpl)}>
                      Edit
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap bg-muted/40 p-2.5 rounded-lg">
                    {tpl.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* New Template Modal */}
      <Dialog open={newTemplateOpen} onOpenChange={setNewTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit WhatsApp Template" : "New WhatsApp Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate ? "Update template details and automated background triggers." : "Create a reusable message template with variables like {patient_name}, {date}, {time}."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (editingTemplate) updateTemplate.mutate();
              else createTemplate.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="tname">Template Name *</Label>
              <Input
                id="tname"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tcat">Category</Label>
              <Select value={templateCategory} onValueChange={setTemplateCategory}>
                <SelectTrigger id="tcat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WHATSAPP_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {WHATSAPP_CATEGORY_LABELS[cat]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ttrigger">Suggested use (optional)</Label>
              <Select value={templateTriggerEvent} onValueChange={setTemplateTriggerEvent}>
                <SelectTrigger id="ttrigger">
                  <SelectValue placeholder="Manual send only" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manual send only</SelectItem>
                  {WHATSAPP_TRIGGERS.map((trig) => (
                    <SelectItem key={trig} value={trig}>
                      {WHATSAPP_TRIGGER_LABELS[trig]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tmsg">Message Content *</Label>
              <Textarea
                id="tmsg"
                className="min-h-28"
                value={templateMessage}
                onChange={(e) => setTemplateMessage(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Supported variables: &#123;patient_name&#125;, &#123;clinic_name&#125;, &#123;date&#125;, &#123;time&#125;, &#123;amount&#125;.
              </p>
            </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setNewTemplateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createTemplate.isPending || updateTemplate.isPending}
            >
              {(createTemplate.isPending || updateTemplate.isPending) ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              {editingTemplate ? "Save Changes" : "Save Template"}
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
