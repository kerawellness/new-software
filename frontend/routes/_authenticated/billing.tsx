import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Calendar,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Plus,
  Printer,
  Trash2,
  Wallet,
  Banknote,
  Check,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNewHotkey } from "@/hooks/use-new-hotkey";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useShowDemoData } from "@/hooks/use-show-demo-data";
import { toast } from "sonner";
import { format } from "date-fns";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ErrorState, LoadingCards, EmptyState } from "@/components/common/states";
import { DateScopeFilter } from "@/components/common/date-scope-filter";
import { Kpi } from "@/components/common/kpi";
import { PatientLine } from "@/components/common/patient-line";
import { PatientPicker } from "@/components/patients/patient-picker";
import { StatusChip } from "@/components/common/status-chip";
import { InvoiceBillFitFrame, InvoiceBillTemplate } from "@/components/billing/invoice-bill-template";
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
import { Progress } from "@/components/ui/progress";
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
import { usePatientSearch } from "@/hooks/use-patients-query";
import { useActiveStaff } from "@/hooks/use-staff-query";
import { friendlyError, logAudit } from "@/lib/audit";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { mergeClinicForBill } from "@/lib/clinic-identity";
import {
  addMonthsLocalISO,
  catalogueOptionLabel,
  formatCurrency,
  formatDate,
  todayISO,
} from "@/lib/format";
import { getDemoInvoices, getDemoInstallmentPlans, getDemoPayments } from "@/lib/demo-data";
import {
  applyDateColumnFilter,
  createDateScope,
  dateScopeLabel,
  resolveDateScope,
} from "@/lib/date-scope";
import {
  downloadInvoicePdfA4,
  printInvoiceA4,
  shareInvoiceImage,
} from "@/lib/share-invoice-image";
import { createInvoiceWithItems } from "@/services/invoices";
import { recordInvoicePayment } from "@/services/record-payment";

export const Route = createFileRoute("/_authenticated/billing")({
  validateSearch: (search: Record<string, unknown>): {
    patientId?: string;
    collectInvoiceId?: string;
  } => {
    const out: { patientId?: string; collectInvoiceId?: string } = {};
    if (typeof search["patientId"] === "string") out.patientId = search["patientId"];
    if (typeof search["collectInvoiceId"] === "string") {
      out.collectInvoiceId = search["collectInvoiceId"];
    }
    return out;
  },
  head: () => ({
    meta: [
      { title: "Billing & Invoices — VSP Software" },
      {
        name: "description",
        content: "Create invoices, record payments and track outstanding clinic balances.",
      },
    ],
  }),
  component: BillingPage,
});

type InvoiceRow = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  tax_amount: number;
  grand_total: number;
  paid_amount: number;
  balance_amount: number;
  status: "draft" | "unpaid" | "partial" | "paid" | "cancelled";
  patients: { id: string; full_name: string; patient_code: string; phone: string } | null;
};

type PatientOption = {
  id: string;
  full_name: string;
  patient_code: string;
  phone: string;
};

type ItemLine = {
  description: string;
  quantity: number;
  unit_price: number;
  sourceId?: string;
};

/** Remaining invoice balance split across unpaid installments. Last pending gets rounding remainder. */
function remainingBalancePerPendingInstallment(
  plan: {
    installments?: Array<{ id: string; status: string; due_date: string }>;
    invoices?: { balance_amount?: number } | null;
  },
  installmentId?: string,
): number {
  const pending = [...(plan.installments ?? [])]
    .filter((i) => i.status !== "paid")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const n = pending.length;
  const remaining = Math.max(0, Number(plan.invoices?.balance_amount ?? 0));
  if (n <= 0) return 0;
  const share = Math.round((remaining / n) * 100) / 100;
  if (!installmentId) return share;
  const isLast = pending[n - 1]?.id === installmentId;
  if (isLast) return Math.round((remaining - share * (n - 1)) * 100) / 100;
  return share;
}

function BillingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const { showDemoData } = useShowDemoData();
  const searchParams = useSearch({ from: "/_authenticated/billing" });
  const currency = profile?.clinic?.currency ?? "INR";

  const [search, setSearch] = useState("");
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState<InvoiceRow | null>(
    null,
  );

  // New Invoice Form State
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [items, setItems] = useState<ItemLine[]>([]);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  useNewHotkey(() => setNewInvoiceOpen(true));
  useUnsavedChanges(newInvoiceOpen && (!!selectedPatient || items.length > 0));
  const [paymentType, setPaymentType] = useState<"full" | "installment">("full");
  const [payNow, setPayNow] = useState<string>("0");
  const [planInstallments, setPlanInstallments] = useState<string>("1");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [doctorId, setDoctorId] = useState<string>("");

  // Pre-load patient if passed via search param (New Invoice)
  useEffect(() => {
    if (searchParams?.patientId && !searchParams?.collectInvoiceId) {
      void supabase
        .from("patients")
        .select("id, full_name, patient_code, phone")
        .eq("id", searchParams.patientId)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedPatient(data);
            setNewInvoiceOpen(true);
          }
        });
    }
  }, [searchParams?.patientId, searchParams?.collectInvoiceId]);

  // Payment Form State
  const [payAmount, setPayAmount] = useState("");
  const [payFieldError, setPayFieldError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const [activeTab, setActiveTab] = useState("outstanding");
  const [collectionScope, setCollectionScope] = useState(() => createDateScope("month"));
  const [targetInstallment, setTargetInstallment] = useState<any | null>(null);
  const [selectedPaymentForDetails, setSelectedPaymentForDetails] = useState<any | null>(null);
  const [transactionDetailsOpen, setTransactionDetailsOpen] = useState(false);
  const [billPreviewInvoiceId, setBillPreviewInvoiceId] = useState<string | null>(null);
  const [sharingInvoice, setSharingInvoice] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [dueMonth, setDueMonth] = useState(format(new Date(), "yyyy-MM"));

  // Deep-link Collect from Home / Flow / Patient profile
  useEffect(() => {
    const invoiceId = searchParams?.collectInvoiceId;
    if (!invoiceId) return;

    let cancelled = false;
    void (async () => {
      const { data: inv, error } = await supabase
        .from("invoices")
        .select(
          "id, invoice_number, invoice_date, total_amount, tax_amount, grand_total, paid_amount, balance_amount, status, patients(id, full_name, patient_code, phone)",
        )
        .eq("id", invoiceId)
        .single();

      if (cancelled || error || !inv) {
        if (!cancelled && error) toast.error("Could not open Collect for that invoice.");
        return;
      }

      const balance = Math.max(0, Number(inv.balance_amount) || 0);
      if (balance <= 0) {
        toast.message("This invoice is already settled.");
        void navigate({ to: "/billing", search: {}, replace: true });
        return;
      }

      const invoiceRow = inv as unknown as InvoiceRow;
      setSelectedInvoiceForPayment(invoiceRow);

      const { data: plan } = await supabase
        .from("installment_plans")
        .select("id, number_of_installments, installments(*)")
        .eq("invoice_id", invoiceId)
        .eq("status", "active")
        .maybeSingle();

      if (cancelled) return;

      if (plan?.installments?.length) {
        const pending = [...plan.installments]
          .filter((i) => i.status !== "paid")
          .sort((a, b) => a.due_date.localeCompare(b.due_date));
        const nextPending = pending[0];
        if (nextPending) {
          const nextDue = remainingBalancePerPendingInstallment(
            { installments: plan.installments, invoices: { balance_amount: balance } },
            nextPending.id,
          );
          setTargetInstallment({
            id: nextPending.id,
            amount: nextDue,
            paid_amount: nextPending.paid_amount || 0,
            planId: plan.id,
            totalCount: plan.number_of_installments,
            index: plan.installments.findIndex((i) => i.id === nextPending.id),
          });
          setPayAmount(String(Math.max(0, nextDue - (nextPending.paid_amount || 0))));
        } else {
          setTargetInstallment(null);
          setPayAmount(String(balance));
        }
      } else {
        setTargetInstallment(null);
        setPayAmount(String(balance));
      }

      setRecordPaymentOpen(true);
      void navigate({ to: "/billing", search: {}, replace: true });
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams?.collectInvoiceId, navigate]);

  // Patient search query for modal
  const patientsQuery = usePatientSearch(patientSearch, profile?.clinic_id);

  // All patients list — shown by default in modal before any search
  const allPatientsQuery = useQuery({
    queryKey: ["all-patients-billing", profile?.clinic_id],
    enabled: !!profile?.clinic_id && newInvoiceOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("patients")
        .select("id, full_name, patient_code, phone")
        .eq("clinic_id", profile!.clinic_id)
        .order("full_name", { ascending: true })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  // The list to show: search results when typing, all patients otherwise
  const patientListToShow = patientSearch.trim()
    ? (patientsQuery.data ?? [])
    : (allPatientsQuery.data ?? []);
  const patientListLoading = patientSearch.trim() ? patientsQuery.isLoading : allPatientsQuery.isLoading;

  // Staff Profiles Query for Doctor selection
  const staffQuery = useActiveStaff();

  // Patient treatments query
  const patientTreatmentsQuery = useQuery({
    queryKey: ["patient-treatments", selectedPatient?.id],
    enabled: !!selectedPatient?.id && !!profile?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatments")
        .select("id, name, cost, notes, status")
        .eq("patient_id", selectedPatient!.id)
        .eq("clinic_id", profile!.clinic_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((row) => row.notes !== "Recorded via Quick Entry Flow");
    },
  });

  // Treatment catalogue for adding line items
  const catalogueQuery = useQuery({
    queryKey: ["treatment-catalogue", "billing", profile?.clinic_id],
    staleTime: 0,
    enabled: !!profile?.clinic_id && newInvoiceOpen,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("treatment_catalogue")
        .select("id, name, default_cost")
        .eq("clinic_id", profile!.clinic_id)
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const PAYMENTS_HISTORY_LIMIT = 500;

  // Payments ledger query (Tab 1)
  const paymentsQuery = useQuery({
    queryKey: ["payments-history", profile?.clinic_id, PAYMENTS_HISTORY_LIMIT],
    enabled: !!profile?.clinic_id && activeTab === "history",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("*, patients(*), invoices(*)")
        .eq("clinic_id", profile!.clinic_id)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(PAYMENTS_HISTORY_LIMIT);
      if (error) throw error;
      return data ?? [];
    },
  });

  const collectionsQuery = useQuery({
    queryKey: ["billing-collections", profile?.clinic_id, collectionScope],
    enabled: !!profile?.clinic_id,
    queryFn: async () => {
      let query = supabase
        .from("payments")
        .select("amount, payment_method, payment_date")
        .eq("clinic_id", profile!.clinic_id);
      query = applyDateColumnFilter(query, "payment_date", collectionScope);
      const { data, error } = await query.limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Outstanding invoices query for rollup (default tab). Loads before plans.
  const outstandingInvoicesQuery = useQuery({
    queryKey: ["outstanding-invoices"],
    enabled: !!profile?.clinic_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, balance_amount, grand_total, patients(id, full_name, patient_code, phone)")
        .eq("clinic_id", profile!.clinic_id)
        .gt("balance_amount", 0)
        .order("balance_amount", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Active installment plans — after Due, or immediately if that tab is open.
  const plansQuery = useQuery({
    queryKey: ["active-installment-plans"],
    enabled:
      !!profile?.clinic_id &&
      (activeTab === "upcoming" ||
        activeTab === "plans" ||
        outstandingInvoicesQuery.isFetched),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installment_plans")
        .select("*, invoices(*, patients(*)), installments(*)")
        .eq("clinic_id", profile!.clinic_id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Hide fully collected bills (balance 0) from Active Plans / Upcoming Dues
      return (data ?? []).filter((p) => Number(p.invoices?.balance_amount ?? 0) > 0);
    },
  });

  // Full bill template preview (opened from Payment History)
  const billPreviewQuery = useQuery({
    queryKey: ["invoice-bill-preview", billPreviewInvoiceId],
    enabled: !!billPreviewInvoiceId,
    queryFn: async () => {
      const [inv, items, plan] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, patients(*), clinics(*)")
          .eq("id", billPreviewInvoiceId!)
          .single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", billPreviewInvoiceId!),
        supabase
          .from("installment_plans")
          .select("*, installments(*)")
          .eq("invoice_id", billPreviewInvoiceId!)
          .maybeSingle(),
      ]);
      if (inv.error) throw inv.error;

      const nextDue =
        [...(plan.data?.installments ?? [])]
          .filter((i) => i.status !== "paid")
          .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date ?? null;

      return {
        invoice: inv.data,
        items: items.data ?? [],
        paymentDueDate: nextDue,
      };
    },
  });

  // Calculate Subtotal and Taxes for New Invoice Form
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const taxRate = profile?.clinic?.tax_enabled ? Number(profile?.clinic?.tax_rate ?? 0) : 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const grandTotal = subtotal + taxAmount;

  const payNowAmount = Number(payNow) || 0;
  const balanceAmount = Math.max(0, grandTotal - payNowAmount);
  const numInstallmentsVal = Number.parseInt(planInstallments, 10) || 1;
  const eachMonthAmount = balanceAmount / numInstallmentsVal;

  useEffect(() => {
    if (paymentType === "full" && newInvoiceOpen) {
      setPayNow(String(grandTotal));
    }
  }, [items, paymentType, newInvoiceOpen, taxRate, grandTotal]);

  useEffect(() => {
    if (!newInvoiceOpen || paymentType !== "installment") return;
    if (grandTotal > 0 && balanceAmount <= 0) {
      setPaymentType("full");
      setPayNow(String(grandTotal));
      toast.message("Balance due is zero — only Full payment is available.");
    }
  }, [balanceAmount, grandTotal, newInvoiceOpen, paymentType]);

  // Create Invoice mutation
  const createInvoice = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) throw new Error("Select a patient for the invoice.");
      if (!items.length || items.some((i) => !i.description.trim())) {
        throw new Error("Add at least one treatment or line item.");
      }
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      if (payNowAmount > grandTotal + 0.001) {
        throw new Error("Paid amount cannot exceed the invoice total.");
      }

      // 1. Create invoice with items
      const selectedDoc = staffQuery.data?.find((d) => d.id === doctorId);
      const docPrefix = selectedDoc ? `[Doctor: ${selectedDoc.name}]` : "";
      const finalNotes = [docPrefix, invoiceNotes.trim()].filter(Boolean).join(" ");

      const inv = await createInvoiceWithItems({
        invoiceDate,
        notes: finalNotes || null,
        patientId: selectedPatient.id,
        items: items.map((i) => ({
          description: i.description.trim(),
          quantity: i.quantity,
          unit_price: i.unit_price,
        })),
      });

      if ((paymentType === "full" || balanceAmount <= 0) && payNowAmount > 0) {
        await recordInvoicePayment({
          clinicId: profile.clinic_id,
          recordedBy: profile.id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoice_number,
          patientId: selectedPatient.id,
          patientName: selectedPatient.full_name,
          balanceAmount: grandTotal,
          amount: payNowAmount,
          paymentMethod: paymentMethod,
          notes: "Full payment recorded at invoice creation.",
        });
      }

      if (paymentType === "installment" && balanceAmount > 0) {
        const { data: planData, error: planErr } = await supabase
          .from("installment_plans")
          .insert({
            clinic_id: profile.clinic_id,
            invoice_id: inv.id,
            number_of_installments: numInstallmentsVal,
            down_payment: payNowAmount,
            installment_amount: Math.round((balanceAmount / numInstallmentsVal) * 100) / 100,
            start_date: todayISO(),
            status: "active",
          })
          .select("id")
          .single();
        if (planErr) throw planErr;

        if (payNowAmount > 0) {
          await recordInvoicePayment({
            clinicId: profile.clinic_id,
            recordedBy: profile.id,
            invoiceId: inv.id,
            invoiceNumber: inv.invoice_number,
            patientId: selectedPatient.id,
            patientName: selectedPatient.full_name,
            balanceAmount: grandTotal,
            amount: payNowAmount,
            paymentMethod: paymentMethod,
            notes: "Down payment for installment plan.",
          });
        }

        const installmentRows = [];
        const start = todayISO();
        for (let i = 1; i <= numInstallmentsVal; i++) {
          installmentRows.push({
            clinic_id: profile.clinic_id,
            installment_plan_id: planData.id,
            due_date: addMonthsLocalISO(start, i),
            amount: Math.round((balanceAmount / numInstallmentsVal) * 100) / 100,
            paid_amount: 0,
            status: "pending" as const,
          });
        }
        const { error: instErr } = await supabase.from("installments").insert(installmentRows);
        if (instErr) throw instErr;
      }

      // Audit in background — the bill is already saved.
      void logAudit(profile.clinic_id, "invoice_created", "invoice", inv.id, {
        invoice_number: inv.invoice_number,
        patient: selectedPatient.full_name,
        grand_total: grandTotal,
      });

      return inv;
    },
    onSuccess: (inv) => {
      toast.success(`Payment recorded (${inv.invoice_number})`);
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["payments-history"] });
      void qc.invalidateQueries({ queryKey: ["billing-collections"] });
      void qc.invalidateQueries({ queryKey: ["active-installment-plans"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["patient"] });
      void qc.invalidateQueries({ queryKey: ["flow-balances"] });
      setNewInvoiceOpen(false);
      resetInvoiceForm();
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to create invoice.")),
  });

  // Record Payment mutation
  const recordPayment = useMutation({
    mutationFn: async () => {
      setPayFieldError(null);
      if (!selectedInvoiceForPayment) throw new Error("Select an invoice to pay.");
      const amt = Number(payAmount);
      if (Number.isNaN(amt) || amt <= 0) throw new Error("Enter a valid payment amount.");
      const maxBalance = Math.max(0, Number(selectedInvoiceForPayment.balance_amount) || 0);
      if (amt > maxBalance + 0.001) {
        throw new Error(`Payment cannot exceed balance due of ${formatCurrency(maxBalance, currency)}.`);
      }
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      if (!selectedInvoiceForPayment.patients?.id) throw new Error("Invoice patient is missing.");

      return recordInvoicePayment({
        clinicId: profile.clinic_id,
        recordedBy: profile.id,
        invoiceId: selectedInvoiceForPayment.id,
        invoiceNumber: selectedInvoiceForPayment.invoice_number,
        patientId: selectedInvoiceForPayment.patients.id,
        patientName: selectedInvoiceForPayment.patients.full_name ?? "Patient",
        balanceAmount: maxBalance,
        amount: amt,
        paymentMethod: payMethod,
        reference: payRef,
        notes: payNotes,
        targetInstallment,
      });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["payments-history"] });
      void qc.invalidateQueries({ queryKey: ["billing-collections"] });
      void qc.invalidateQueries({ queryKey: ["active-installment-plans"] });
      void qc.invalidateQueries({ queryKey: ["outstanding-invoices"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["patient", result.patientId] });
      void qc.invalidateQueries({ queryKey: ["invoice", result.invoiceId] });
      void qc.invalidateQueries({ queryKey: ["flow-balances"] });
      void qc.invalidateQueries({ queryKey: ["followups"] });

      setRecordPaymentOpen(false);
      resetPaymentForm();

      if (result.remaining <= 0) {
        toast.success(`${result.invoiceNumber} · Settled`);
        return;
      }

      const reminderDate = result.nextDueDate ?? addMonthsLocalISO(todayISO(), 1);
      toast.custom(
        (t) => (
          <div className="w-[min(100vw-2rem,22rem)] rounded-xl border border-line bg-surface-1 p-3 shadow-lg space-y-2">
            <p className="text-sm font-semibold text-ink-900">Payment recorded</p>
            <p className="text-xs text-ink-500">
              {result.invoiceNumber} · Balance due {formatCurrency(result.remaining, currency)}
            </p>
            <Button
              size="sm"
              variant="secondary"
              className="text-xs"
              onClick={async () => {
                toast.dismiss(t);
                const { error } = await supabase.from("follow_ups").insert({
                  clinic_id: result.clinicId,
                  patient_id: result.patientId,
                  reason: result.nextDueDate
                    ? `Installment due — ${result.invoiceNumber}`
                    : `Balance due — ${result.invoiceNumber}`,
                  due_date: reminderDate,
                  status: "pending",
                  notes: "Created after Collect payment",
                });
                if (error) {
                  toast.error(friendlyError(error, "Could not set reminder."));
                  return;
                }
                void qc.invalidateQueries({ queryKey: ["followups"] });
                void qc.invalidateQueries({ queryKey: ["followups-counts"] });
                void qc.invalidateQueries({ queryKey: ["dashboard"] });
                toast.success(`Reminder set for ${formatDate(reminderDate)}`);
              }}
            >
              Set reminder
            </Button>
          </div>
        ),
        { duration: 20_000 },
      );
    },
    onError: (err) => {
      const msg = friendlyError(err, "Unable to record payment.");
      setPayFieldError(msg);
      toast.error(msg);
    },
  });

  function resetInvoiceForm() {
    setSelectedPatient(null);
    setPatientSearch("");
    setInvoiceDate(todayISO());
    setItems([]);
    setInvoiceNotes("");
    setPaymentType("full");
    setPayNow("0");
    setPlanInstallments("1");
    setPaymentMethod("cash");
    setDoctorId("");
  }

  function addInvoiceItem(line: ItemLine) {
    setItems((prev) => {
      if (line.sourceId && prev.some((i) => i.sourceId === line.sourceId)) return prev;
      return [...prev, line];
    });
  }

  function updateInvoiceItem(index: number, patch: Partial<ItemLine>) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeInvoiceItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function resetPaymentForm() {
    setSelectedInvoiceForPayment(null);
    setPayAmount("");
    setPayMethod("cash");
    setPayRef("");
    setPayNotes("");
    setTargetInstallment(null);
  }

  function parseNoteTags(note: string | null) {
    if (!note) return { parentId: null, installmentText: null, cleanNote: "" };
    const parentMatch = note.match(/\[ParentId:([a-f0-9-]{36})\]/i);
    const instMatch = note.match(/\[Installment #?(\d+) of (\d+)\]/i);
    const downMatch = note.match(/\[Down Payment\]/i);
    const waterMatch = note.match(/\[Waterfall Payment\]/i);

    return {
      parentId: parentMatch ? parentMatch[1] : null,
      installmentText: instMatch ? `Installment ${instMatch[1]} of ${instMatch[2]}` : downMatch ? "Down Payment" : waterMatch ? "Waterfall Payment" : null,
      cleanNote: note.replace(/\[[^[\]]*\]/g, "").trim(),
    };
  }

  function normalizePhoneForWhatsApp(phone: string): string {
    return phone.replace(/\D/g, "");
  }

  async function handleShareInvoiceImage() {
    const bill = billPreviewQuery.data;
    const element = document.getElementById("invoice-bill-template");
    if (!bill || !element) {
      toast.error("Invoice image is not ready.");
      return;
    }

    setSharingInvoice(true);
    try {
      const result = await shareInvoiceImage({
        element,
        invoiceNumber: bill.invoice.invoice_number,
        patientName: bill.invoice.patients?.full_name ?? "Patient",
        clinicName: bill.invoice.clinics?.name ?? "Dental Clinic",
      });
      if (result === "shared") toast.success("Invoice image opened for sharing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to share the invoice image.");
    } finally {
      setSharingInvoice(false);
    }
  }

  async function handlePrintInvoice() {
    const bill = billPreviewQuery.data;
    const element = document.getElementById("invoice-bill-template");
    if (!bill || !element) {
      toast.error("Invoice is not ready.");
      return;
    }

    setPrintingInvoice(true);
    try {
      await printInvoiceA4(element, bill.invoice.invoice_number);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to print the invoice.");
    } finally {
      setPrintingInvoice(false);
    }
  }

  async function handleDownloadPdf() {
    const bill = billPreviewQuery.data;
    const element = document.getElementById("invoice-bill-template");
    if (!bill || !element) {
      toast.error("Invoice is not ready.");
      return;
    }

    setDownloadingPdf(true);
    try {
      await downloadInvoicePdfA4(element, bill.invoice.invoice_number);
      toast.success("A4 invoice PDF downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download the invoice PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  // Outstanding patient rollup calculation (Tab 3)
  const outstandingInvoices = useMemo(() => {
    const real = outstandingInvoicesQuery.data ?? [];
    if (!showDemoData) return real;
    const demo = getDemoInvoices().filter((inv) => inv.balance_amount > 0) as InvoiceRow[];
    return [...demo, ...real];
  }, [outstandingInvoicesQuery.data, showDemoData]);

  const paymentRows = useMemo(() => {
    const real = paymentsQuery.data ?? [];
    if (!showDemoData) return real;
    return [...(getDemoPayments() as typeof real), ...real];
  }, [paymentsQuery.data, showDemoData]);

  const collectionTotals = useMemo(() => {
    const range = resolveDateScope(collectionScope);
    const demo = showDemoData
      ? getDemoPayments().filter((payment) => {
          if (!range) return true;
          return payment.payment_date >= range.start && payment.payment_date <= range.end;
        })
      : [];
    let cash = 0;
    let upi = 0;
    let other = 0;
    for (const payment of [...demo, ...(collectionsQuery.data ?? [])]) {
      const amount = Number(payment.amount) || 0;
      if (payment.payment_method === "cash") cash += amount;
      else if (payment.payment_method === "upi") upi += amount;
      else other += amount;
    }
    return { cash, upi, other, total: cash + upi + other };
  }, [collectionsQuery.data, collectionScope, showDemoData]);

  const planRows = useMemo(() => {
    const real = plansQuery.data ?? [];
    if (!showDemoData) return real;
    return [...(getDemoInstallmentPlans() as typeof real), ...real];
  }, [plansQuery.data, showDemoData]);

  const outstandingByPatient = Object.values(
    outstandingInvoices.reduce((acc, inv) => {
      if (!inv.patients) return acc;
      const pid = inv.patients.id;
      if (!acc[pid]) {
        acc[pid] = {
          patient: inv.patients,
          totalDebt: 0,
          invoicesCount: 0,
        };
      }
      acc[pid].totalDebt += Number(inv.balance_amount);
      acc[pid].invoicesCount += 1;
      return acc;
    }, {} as Record<string, { patient: any; totalDebt: number; invoicesCount: number }>)
  );

  const activePlansCount = planRows.length;
  const upcomingDuesCount = useMemo(() => {
    const activePlans = planRows;
    return activePlans.flatMap((plan) => {
      const remaining = Math.max(0, Number(plan.invoices?.balance_amount ?? 0));
      if (remaining <= 0) return [];
      return (plan.installments ?? [])
        .filter((inst) => inst.status !== "paid" && inst.due_date.startsWith(dueMonth))
        .filter((inst) => remainingBalancePerPendingInstallment(plan, inst.id) > 0);
    }).length;
  }, [planRows, dueMonth]);

  return (
    <AppShell>
      <PageHeader
        title="Billing"
        description="Collect payments, track balances due, and issue invoices."
        action={
          <Button onClick={() => setNewInvoiceOpen(true)} className="w-full sm:w-auto">
            <Plus className="size-4" aria-hidden />
            New Invoice
          </Button>
        }
      />

      <div className="mb-4 space-y-3">
        <DateScopeFilter value={collectionScope} onChange={setCollectionScope} />
        {collectionsQuery.isError ? (
          <ErrorState
            title="Unable to load collections."
            onRetry={() => void collectionsQuery.refetch()}
          />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
            <Kpi
              label="Collected"
              value={collectionsQuery.isLoading ? "—" : formatCurrency(collectionTotals.total, currency)}
              icon={Wallet}
              accent="revenue"
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">{dateScopeLabel(collectionScope)}</p>}
            />
            <Kpi
              label="Cash"
              value={collectionsQuery.isLoading ? "—" : formatCurrency(collectionTotals.cash, currency)}
              icon={Banknote}
              accent="clinic"
            />
            <Kpi
              label="UPI"
              value={collectionsQuery.isLoading ? "—" : formatCurrency(collectionTotals.upi, currency)}
              icon={Wallet}
              accent="patients"
            />
            <Kpi
              label="Other"
              value={collectionsQuery.isLoading ? "—" : formatCurrency(collectionTotals.other, currency)}
              icon={Wallet}
              accent="growth"
              hint={<p className="text-[10px] text-ink-300 sm:text-[11px]">Card, bank, and other</p>}
            />
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full min-w-0">
        <TabsList className="mb-4 w-full">
          <TabsTrigger value="outstanding">Due ({outstandingByPatient.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Month ({upcomingDuesCount})</TabsTrigger>
          <TabsTrigger value="plans">Plans ({activePlansCount})</TabsTrigger>
          <TabsTrigger value="history">Paid</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-0 space-y-4">
          <div className="mb-2 flex min-w-0 flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Payment history
            </h3>
            <Input
              placeholder="Search"
              aria-label="Filter bills"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {paymentsQuery.isError ? (
            <ErrorState
              title="Unable to load payment history"
              description="Check your connection and try again."
              onRetry={() => void paymentsQuery.refetch()}
            />
          ) : paymentsQuery.isLoading ? (
            <LoadingCards count={3} />
          ) : paymentRows.length === 0 ? (
            <EmptyState
              title="No payments yet"
              description="Recorded payments will show up here."
              action={
                <Button className="rounded-xl" onClick={() => setNewInvoiceOpen(true)}>
                  <Plus className="mr-1 size-4" aria-hidden />
                  New Invoice
                </Button>
              }
            />
          ) : (() => {
            let list = paymentRows;
            if (search.trim()) {
              const t = search.trim().toLowerCase();
              list = list.filter((p) =>
                p.patients?.full_name.toLowerCase().includes(t) ||
                p.patients?.patient_code.toLowerCase().includes(t) ||
                (p.notes ?? "").toLowerCase().includes(t)
              );
            }
            if (list.length === 0) {
              return <EmptyState title="No matches" description="Try another search." />;
            }
            return (
              <div className="space-y-2">
                {list.map((p) => {
                  const tags = parseNoteTags(p.notes);
                  const method = PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method;
                  const metaParts = [
                    p.patients?.patient_code,
                    method,
                    formatDate(p.payment_date),
                    tags.installmentText,
                    !tags.installmentText ? tags.cleanNote : null,
                    p.invoices?.invoice_number ? `#${p.invoices.invoice_number}` : null,
                  ].filter(Boolean);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full rounded-xl border border-line bg-surface-1 px-3 text-left transition-colors duration-150 hover:bg-surface-2/60"
                      onClick={() => {
                        setSelectedPaymentForDetails(p);
                        setTransactionDetailsOpen(true);
                      }}
                    >
                      <PatientLine
                        name={p.patients?.full_name ?? "Unknown patient"}
                        meta={metaParts.join(" · ")}
                        figure={`+${formatCurrency(p.amount, currency)}`}
                        action={<ArrowUpRight className="size-4 text-ink-300" aria-hidden />}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="plans" className="space-y-4 mt-0">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Active installment programs
            </h3>
          </div>

          {plansQuery.isError ? (
            <ErrorState
              title="Unable to load installment plans"
              description="Check your connection and try again."
              onRetry={() => void plansQuery.refetch()}
            />
          ) : plansQuery.isLoading ? (
            <LoadingCards count={3} />
          ) : planRows.length === 0 ? (
            <EmptyState
              title="No active plans"
              description="Installment plans appear here when a balance is split across months."
              action={
                <Button className="rounded-xl" onClick={() => setNewInvoiceOpen(true)}>
                  <Plus className="mr-1 size-4" aria-hidden />
                  New Invoice
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {planRows.map((plan) => {
                const paidCount = (plan.installments ?? []).filter((i) => i.status === "paid").length;
                const totalCount = plan.number_of_installments ?? (plan.installments ?? []).length;
                const pendingCount = Math.max(0, totalCount - paidCount);
                const monthlyDue = remainingBalancePerPendingInstallment(plan);
                const remainingBalance = Math.max(0, Number(plan.invoices?.balance_amount ?? 0));
                const grandTotal = Math.max(0, Number(plan.invoices?.grand_total ?? 0));
                const paidPct =
                  grandTotal > 0
                    ? Math.min(100, Math.round(((grandTotal - remainingBalance) / grandTotal) * 100))
                    : totalCount > 0
                      ? Math.round((paidCount / totalCount) * 100)
                      : 0;

                const nextPending = [...(plan.installments ?? [])]
                  .filter((i) => i.status !== "paid")
                  .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0];
                const nextDue = nextPending
                  ? remainingBalancePerPendingInstallment(plan, nextPending.id)
                  : 0;
                const patientName = plan.invoices?.patients?.full_name ?? "Unknown patient";
                const patientCode = plan.invoices?.patients?.patient_code;
                const invoiceNumber = plan.invoices?.invoice_number;

                return (
                  <div
                    key={plan.id}
                    className="rounded-xl border border-line bg-surface-1 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink-900">{patientName}</p>
                        <p className="truncate text-[11px] leading-snug text-ink-500">
                          {[
                            patientCode,
                            invoiceNumber ? `Invoice: ${invoiceNumber}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-500">
                        {paidCount} Of {totalCount} Collected
                      </span>
                    </div>

                    <div className="mt-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-ink-500">Installment Progress</span>
                        <span className="font-semibold tabular-nums text-primary">{paidPct}% Paid</span>
                      </div>
                      <Progress value={paidPct} className="h-1" />
                    </div>

                    <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line pt-2.5">
                      <div className="min-w-0">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-500">
                          Monthly Due
                        </p>
                        <p className="mt-0.5 text-base font-bold tabular-nums text-ink-900">
                          {formatCurrency(monthlyDue, currency)}
                        </p>
                        <p className="truncate text-[10px] text-ink-500">
                          Remaining {formatCurrency(remainingBalance, currency)} · {pendingCount}{" "}
                          pending
                        </p>
                      </div>
                      <div className="min-w-0 text-right">
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-ink-500">
                          Next Due Date
                        </p>
                        <p className="mt-0.5 text-sm font-bold text-ink-900">
                          {nextPending ? formatDate(nextPending.due_date) : "—"}
                        </p>
                      </div>
                    </div>

                    {nextPending ? (
                      <Button
                        size="sm"
                        className="mt-2.5 h-9 w-full gap-1.5 rounded-lg text-xs font-semibold"
                        onClick={() => {
                          setTargetInstallment({
                            id: nextPending.id,
                            amount: nextDue,
                            paid_amount: nextPending.paid_amount || 0,
                            planId: plan.id,
                            totalCount: plan.number_of_installments,
                            index: plan.installments.findIndex((i) => i.id === nextPending.id),
                          });
                          setPayAmount(String(Math.max(0, nextDue - (nextPending.paid_amount || 0))));
                          setSelectedInvoiceForPayment(plan.invoices);
                          setRecordPaymentOpen(true);
                        }}
                      >
                        <Wallet className="size-3.5" aria-hidden />
                        Collect Installment
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="outstanding" className="space-y-4 mt-0">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-500">
              Balances due
            </h3>
          </div>

          {outstandingInvoicesQuery.isError ? (
            <ErrorState
              title="Unable to load balances due"
              description="Check your connection and try again."
              onRetry={() => void outstandingInvoicesQuery.refetch()}
            />
          ) : outstandingInvoicesQuery.isLoading ? (
            <LoadingCards count={3} />
          ) : outstandingByPatient.length === 0 ? (
            <EmptyState
              tone="positive"
              title="No balances due"
              description="Every invoice is settled."
            />
          ) : (
            <div className="space-y-2">
              {outstandingByPatient.map(({ patient, totalDebt, invoicesCount }) => (
                <div
                  key={patient.id}
                  className="rounded-xl border border-line bg-surface-1 px-3 transition-colors duration-150 hover:bg-danger-surface/40"
                >
                  <PatientLine
                    name={patient.full_name}
                    meta={[
                      patient.patient_code,
                      patient.phone || "No phone",
                      `${invoicesCount} open invoice${invoicesCount === 1 ? "" : "s"}`,
                    ].join(" · ")}
                    tone="danger"
                    figure={
                      <span className="flex flex-col items-end gap-1">
                        <StatusChip tone="danger">Due</StatusChip>
                        <span className="text-sm font-semibold tabular-nums text-danger-text">
                          {formatCurrency(totalDebt, currency)}
                        </span>
                      </span>
                    }
                    action={
                      patient.phone ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                          onClick={() => {
                            const cleanPhone = normalizePhoneForWhatsApp(patient.phone);
                            const msg = `Hi ${patient.full_name}, this is a reminder that your dental bill has a balance due of ${formatCurrency(totalDebt, currency)}. Please pay at your convenience or contact the clinic for help.`;
                            window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, "_blank");
                          }}
                        >
                          <MessageCircle className="size-3.5" aria-hidden /> Remind
                        </Button>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-4 mt-0">
          <div className="rounded-xl border border-line bg-surface-1 p-3">
            <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Calendar className="size-4 shrink-0 text-ink-500" />
                <span className="text-xs font-semibold text-ink-500 uppercase">Expected this month</span>
              </div>
              <Input
                type="month"
                className="w-full min-w-0 sm:w-44"
                value={dueMonth}
                onChange={(e) => setDueMonth(e.target.value)}
                aria-label="Expected month"
              />
            </div>
          </div>

          {plansQuery.isError ? (
            <ErrorState
              title="Unable to load upcoming dues"
              description="Check your connection and try again."
              onRetry={() => void plansQuery.refetch()}
            />
          ) : plansQuery.isLoading ? (
            <LoadingCards count={2} />
          ) : (() => {
            const activePlans = planRows;
            const upcomingInstallments = activePlans.flatMap((plan) => {
              const remainingBalance = Math.max(0, Number(plan.invoices?.balance_amount ?? 0));
              if (remainingBalance <= 0) return [];
              const pendingCount = (plan.installments ?? []).filter((i) => i.status !== "paid").length;
              return (plan.installments ?? []).map((inst, index) => {
                const recalculatedAmount = remainingBalancePerPendingInstallment(plan, inst.id);
                return {
                  ...inst,
                  plan,
                  index,
                  patient: plan.invoices?.patients,
                  invoice: plan.invoices,
                  recalculatedAmount,
                  pendingCount,
                  remainingBalance,
                };
              });
            }).filter((inst) =>
              inst.status !== "paid" &&
              inst.recalculatedAmount > 0 &&
              inst.due_date.startsWith(dueMonth)
            );

            const totalExpected = upcomingInstallments.reduce((sum, i) => sum + i.recalculatedAmount, 0);
            const uniquePatients = new Set(upcomingInstallments.map((i) => i.patient?.id).filter(Boolean)).size;
            const today = todayISO();

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-surface-1 p-4">
                    <p className="text-xs text-ink-500 uppercase tracking-wider font-medium">Total expected</p>
                    <p className="mt-2 text-lg font-bold tabular-nums text-ink-900 sm:text-xl">
                      {formatCurrency(totalExpected, currency)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-line bg-surface-1 p-4">
                    <p className="text-xs text-ink-500 uppercase tracking-wider font-medium">Patients</p>
                    <p className="mt-2 text-lg font-bold text-ink-900 sm:text-xl">
                      {uniquePatients}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-ink-500 uppercase tracking-wider px-1">
                    Installments due
                  </h4>
                  {upcomingInstallments.length === 0 ? (
                    <EmptyState
                      tone="positive"
                      title="Nothing due this month"
                      description="Pick another month, or create an installment plan on a new invoice."
                      action={
                        <Button className="rounded-xl" onClick={() => setNewInvoiceOpen(true)}>
                          <Plus className="mr-1 size-4" aria-hidden />
                          New Invoice
                        </Button>
                      }
                    />
                  ) : (
                    <div className="space-y-2">
                      {upcomingInstallments.map((inst) => {
                        const overdue = inst.due_date < today;
                        const metaParts = [
                          formatDate(inst.due_date),
                          inst.invoice?.invoice_number ? `#${inst.invoice.invoice_number}` : null,
                          `Installment ${inst.index + 1} of ${inst.plan.number_of_installments}`,
                        ].filter(Boolean);
                        return (
                          <div
                            key={inst.id}
                            className="rounded-xl border border-line bg-surface-1 px-3 transition-colors duration-150 hover:bg-surface-2/70"
                          >
                          <PatientLine
                            name={inst.patient?.full_name ?? "Unknown patient"}
                            meta={metaParts.join(" · ")}
                            tone={overdue ? "danger" : "warning"}
                            figure={
                              <span className="flex flex-col items-end gap-1">
                                <StatusChip tone={overdue ? "danger" : "warning"}>
                                  {overdue ? "Overdue" : "Due"}
                                </StatusChip>
                                <span className="text-sm font-semibold tabular-nums text-ink-900">
                                  {formatCurrency(inst.recalculatedAmount, currency)}
                                </span>
                              </span>
                            }
                            action={
                              <Button
                                size="sm"
                                className="gap-1 text-xs"
                                onClick={() => {
                                  setTargetInstallment({
                                    id: inst.id,
                                    amount: inst.recalculatedAmount,
                                    paid_amount: inst.paid_amount || 0,
                                    planId: inst.plan.id,
                                    totalCount: inst.plan.number_of_installments,
                                    index: inst.index,
                                  });
                                  setPayAmount(String(Math.max(0, inst.recalculatedAmount - (inst.paid_amount || 0))));
                                  setSelectedInvoiceForPayment(inst.invoice);
                                  setRecordPaymentOpen(true);
                                }}
                              >
                                Collect
                              </Button>
                            }
                          />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* New Invoice Modal — single long scroll */}
      <Dialog open={newInvoiceOpen} onOpenChange={(open) => { setNewInvoiceOpen(open); if (!open) resetInvoiceForm(); }}>
        <DialogContent className="flex max-h-[100dvh] max-w-lg flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-h-[min(90vh,900px)] sm:gap-0 sm:rounded-2xl sm:p-0">
          <DialogHeader className="shrink-0 space-y-1.5 border-b border-line px-4 pb-4 pt-4 text-left pr-14 sm:px-6 sm:pt-6">
            <DialogTitle className="text-lg font-bold text-ink-900">New Invoice</DialogTitle>
            <DialogDescription className="text-xs text-ink-500">
              Create an invoice and optionally record a payment.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              createInvoice.mutate();
            }}
          >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
            <PatientPicker
              required
              selected={selectedPatient}
              onClear={() => {
                setSelectedPatient(null);
                setItems([]);
                setPayNow("0");
              }}
              search={patientSearch}
              onSearchChange={setPatientSearch}
              results={patientListToShow}
              loading={patientListLoading}
              onSelect={(p) => {
                setSelectedPatient({
                  id: p.id,
                  full_name: p.full_name,
                  patient_code: p.patient_code ?? "",
                  phone: p.phone ?? "",
                });
                setPatientSearch("");
                setItems([]);
                setPayNow("0");
              }}
            />

            <div className="space-y-1.5">
              <Label htmlFor="invoice-date">Invoice date</Label>
              <Input
                id="invoice-date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>

            {selectedPatient ? (
              <div className="space-y-1.5">
                <Label>Patient treatments</Label>
                {patientTreatmentsQuery.isLoading ? (
                  <p className="text-[11px] text-ink-300 py-1">Loading treatments...</p>
                ) : (patientTreatmentsQuery.data?.filter((t) => t.notes !== "Recorded via Quick Entry Flow").length ?? 0) === 0 ? (
                  <p className="text-[11px] text-ink-300 italic py-1">No treatments on record for this patient.</p>
                ) : (
                  <div className="rounded-xl border border-line divide-y overflow-hidden">
                    {patientTreatmentsQuery.data!
                      .filter((t) => t.notes !== "Recorded via Quick Entry Flow")
                      .map((t) => {
                      const sid = `patient-${t.id}`;
                      const isAdded = items.some((i) => i.sourceId === sid);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (isAdded) {
                              setItems((prev) => prev.filter((i) => i.sourceId !== sid));
                            } else {
                              addInvoiceItem({ description: t.name, quantity: 1, unit_price: Number(t.cost ?? 0), sourceId: sid });
                            }
                          }}
                          className={`w-full flex items-center justify-between px-3 py-2.5 text-left text-xs transition-colors ${isAdded ? "bg-primary/8 border-l-2 border-primary" : "bg-surface-1 hover:bg-surface-2"}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`size-4 rounded flex items-center justify-center border shrink-0 transition-colors ${isAdded ? "bg-primary border-primary" : "border-line bg-surface-1"}`}>
                              {isAdded ? <Check className="size-3 text-white" aria-hidden /> : null}
                            </span>
                            <div className="min-w-0">
                              <p className="font-medium text-ink-700 truncate">{t.name}</p>
                              {t.notes ? <p className="text-[10px] text-ink-300 truncate">{t.notes}</p> : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full capitalize font-medium bg-surface-2 text-ink-500">{t.status?.replace("_", " ")}</span>
                            <span className="tabular-nums font-semibold text-ink-900">{formatCurrency(Number(t.cost ?? 0), currency)}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Invoice lines</Label>
                {(catalogueQuery.data?.length ?? 0) > 0 ? (
                  <Select
                    onValueChange={(val) => {
                      const c = catalogueQuery.data?.find((x) => x.id === val);
                      if (c) {
                        addInvoiceItem({
                          description: c.name,
                          quantity: 1,
                          unit_price: Number(c.default_cost ?? 0),
                          sourceId: `catalogue-${c.id}`,
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full sm:w-56">
                      <SelectValue placeholder="Add from catalogue" />
                    </SelectTrigger>
                    <SelectContent>
                      {catalogueQuery.data!.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {catalogueOptionLabel(c, currency, catalogueQuery.data!)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              {items.length === 0 ? (
                <p className="text-[11px] text-ink-300 italic py-2 px-3 rounded-xl border border-dashed border-line">
                  {selectedPatient ? "Tick treatments above or add a custom line." : "Select a patient first."}
                </p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto pr-0.5">
                  {items.map((row, idx) => (
                    <div
                      key={`${row.sourceId ?? "custom"}-${idx}`}
                      className="flex flex-col gap-2 rounded-xl border border-line/80 p-2.5 sm:flex-row sm:items-center"
                    >
                      <Input
                        className="min-w-0 w-full flex-1"
                        value={row.description}
                        onChange={(e) => updateInvoiceItem(idx, { description: e.target.value })}
                      />
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-ink-300 text-[10px]">Rs.</span>
                        <Input
                          type="number"
                          min={0}
                          className="min-w-0 flex-1 text-right sm:w-28 sm:flex-none"
                          value={row.unit_price}
                          onChange={(e) => updateInvoiceItem(idx, { unit_price: Number(e.target.value) })}
                        />
                        <button
                          type="button"
                          className="grid size-10 shrink-0 place-items-center text-ink-300 hover:text-danger-text transition-colors sm:size-9"
                          onClick={() => removeInvoiceItem(idx)}
                          aria-label="Remove"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedPatient}
                className="w-full rounded-xl border-dashed border-line hover:border-primary hover:text-primary text-ink-500 font-medium py-2 h-auto disabled:opacity-40"
                onClick={() =>
                  addInvoiceItem({ description: "", quantity: 1, unit_price: 0 })
                }
              >
                <Plus className="size-3.5 mr-1.5" />
                Add custom line
              </Button>

              {items.length > 0 ? (
                <div className="space-y-1 px-1 pt-0.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-ink-500">Subtotal ({items.length} item{items.length === 1 ? "" : "s"})</span>
                    <span className="font-semibold tabular-nums text-ink-900">{formatCurrency(subtotal, currency)}</span>
                  </div>
                  {taxRate > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-ink-500">
                        {profile?.clinic?.tax_label?.trim() || "GST"} ({taxRate}%)
                      </span>
                      <span className="font-semibold tabular-nums text-ink-900">{formatCurrency(taxAmount, currency)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label>Payment type</Label>
              <div className="rounded-xl border border-line overflow-hidden flex">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentType("full");
                    setPayNow(String(grandTotal));
                  }}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-all ${paymentType === "full" ? "bg-primary text-white" : "bg-surface-1 text-ink-500 hover:bg-surface-2"}`}
                >
                  Full payment
                </button>
                <div className="w-px bg-line" />
                <button
                  type="button"
                  onClick={() => {
                    if (grandTotal <= 0) {
                      toast.error("Add invoice lines before choosing Installment.");
                      return;
                    }
                    setPaymentType("installment");
                    setPayNow("0");
                  }}
                  disabled={grandTotal <= 0}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${paymentType === "installment" ? "bg-primary text-white" : "bg-surface-1 text-ink-500 hover:bg-surface-2"}`}
                >
                  Installment
                </button>
              </div>
              {paymentType === "installment" ? (
                <p className="text-[11px] text-ink-500">
                  Installment is only for remaining balance. If Pay now covers the full total, Full payment is used.
                </p>
              ) : null}
            </div>

            {paymentType === "installment" && (
              <div className="space-y-3 rounded-xl border border-line p-3 bg-surface-2/50">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-500">Total amount</Label>
                    <div className="flex h-10 items-center rounded-md border border-line bg-surface-1 px-3 text-sm font-medium tabular-nums text-ink-900 sm:h-9">
                      {formatCurrency(grandTotal, currency)}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-500">Pay now</Label>
                    <Input
                      type="number"
                      min={0}
                      max={grandTotal}
                      value={payNow}
                      onChange={(e) => {
                        const next = e.target.value;
                        const nextNum = Number(next) || 0;
                        if (nextNum > grandTotal) {
                          setPayNow(String(grandTotal));
                          setPaymentType("full");
                          toast.message("Full amount paid Ã¯Â¿Â½ switched to Full payment.");
                          return;
                        }
                        setPayNow(next);
                        if (grandTotal > 0 && nextNum >= grandTotal) {
                          setPaymentType("full");
                          setPayNow(String(grandTotal));
                          toast.message("Full amount paid Ã¯Â¿Â½ switched to Full payment.");
                        }
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-ink-500">Plan</Label>
                  <Select value={planInstallments} onValueChange={setPlanInstallments}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 Installment</SelectItem>
                      <SelectItem value="2">2 Installments</SelectItem>
                      <SelectItem value="3">3 Installments</SelectItem>
                      <SelectItem value="6">6 Installments</SelectItem>
                      <SelectItem value="9">9 Installments</SelectItem>
                      <SelectItem value="12">12 Installments</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {Number(payNow) > 0 ? (
                  <div className="space-y-1">
                    <Label className="text-xs text-ink-500">Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_METHODS.map((m) => (
                          <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            )}

            {paymentType === "full" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Total amount</Label>
                  <div className="h-10 flex items-center px-3 rounded-xl border border-line bg-surface-2/60 text-sm font-semibold tabular-nums text-ink-900">
                    {formatCurrency(grandTotal, currency)}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Paid</Label>
                  <Input
                    type="number"
                    min={0}
                    max={grandTotal}
                    value={payNow}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next) && next > grandTotal) {
                        setPayNow(String(grandTotal));
                        toast.message("Paid amount capped to invoice total.");
                        return;
                      }
                      setPayNow(e.target.value);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="rounded-xl border border-line bg-surface-2/60 p-3 space-y-1.5 text-xs">
              {paymentType === "installment" ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Total amount</span>
                    <span className="tabular-nums font-medium">{formatCurrency(grandTotal, currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-500">Paid</span>
                    <span className="tabular-nums font-medium text-ink-900">{formatCurrency(payNowAmount, currency)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5">
                    <span className="font-semibold text-ink-700">Balance due</span>
                    <span className={`tabular-nums font-bold ${balanceAmount > 0 ? "text-destructive" : "text-ink-900"}`}>
                      {formatCurrency(balanceAmount, currency)}
                    </span>
                  </div>
                  {balanceAmount > 0 && numInstallmentsVal > 0 ? (
                    <div className="flex justify-between text-[11px] text-ink-500">
                      <span>{numInstallmentsVal} installment{numInstallmentsVal === 1 ? "" : "s"} of</span>
                      <span className="tabular-nums font-medium text-primary">{formatCurrency(eachMonthAmount, currency)}</span>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="font-semibold text-ink-700">Balance due</span>
                  <span className={`tabular-nums font-bold ${balanceAmount > 0 ? "text-destructive" : "text-ink-900"}`}>
                    {formatCurrency(balanceAmount, currency)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-line bg-surface-2/80 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm sm:px-6">
            <div className="flex items-center gap-4">
              <span className="text-ink-500 text-xs">Total</span>
              <span className="font-bold tabular-nums text-ink-900">{formatCurrency(grandTotal, currency)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-ink-500 text-xs">Paid</span>
              <span className="font-bold tabular-nums text-ink-900">{formatCurrency(payNowAmount, currency)}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-ink-500 text-xs">Balance due</span>
              <span className={`font-bold tabular-nums ${balanceAmount > 0 ? "text-destructive" : "text-ink-900"}`}>
                {formatCurrency(balanceAmount, currency)}
              </span>
            </div>
          </div>

          <DialogFooter className="shrink-0 gap-2 border-t border-line px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end sm:space-x-2 sm:px-6">
            <Button type="button" variant="outline" onClick={() => setNewInvoiceOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createInvoice.isPending || !selectedPatient || items.length === 0}
            >
              {createInvoice.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
              Create Invoice
            </Button>
          </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Record Payment Modal — phone-first full sheet */}
      <Dialog open={recordPaymentOpen} onOpenChange={setRecordPaymentOpen}>
        <DialogContent className="max-w-md gap-0 p-0 sm:gap-4 sm:p-6">
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              recordPayment.mutate();
            }}
          >
            <DialogHeader className="shrink-0 space-y-1 border-b px-4 pb-3 pt-4 pr-14 text-left sm:border-0 sm:px-0 sm:pb-0 sm:pt-0 sm:pr-0">
              <DialogTitle className="text-base sm:text-lg">
                {targetInstallment
                  ? `Collect · Installment #${targetInstallment.index + 1}`
                  : `Collect · ${selectedInvoiceForPayment?.invoice_number}`}
              </DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {targetInstallment
                  ? `This month ${formatCurrency(targetInstallment.amount - targetInstallment.paid_amount, currency)}. Pay more only closes this month.`
                  : `Pay toward invoice ${selectedInvoiceForPayment?.invoice_number}.`}
              </DialogDescription>
            </DialogHeader>

            {selectedInvoiceForPayment ? (
              <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-0 sm:py-2">
                <div className="space-y-2 rounded-xl border p-3.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Patient</span>
                    <span className="text-right font-semibold">
                      {selectedInvoiceForPayment.patients?.full_name}
                    </span>
                  </div>
                  {targetInstallment ? (
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">This month due</span>
                      <span className="font-bold tabular-nums text-primary">
                        {formatCurrency(
                          Math.max(
                            0,
                            Number(targetInstallment.amount) -
                              (Number(targetInstallment.paid_amount) || 0),
                          ),
                          currency,
                        )}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-2 border-t pt-2">
                    <span className="text-muted-foreground">Balance due</span>
                    <span className="font-bold tabular-nums text-destructive">
                      {formatCurrency(selectedInvoiceForPayment.balance_amount, currency)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="pamt">Amount *</Label>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      onClick={() => {
                        const rem = Math.max(
                          0,
                          Number(selectedInvoiceForPayment.balance_amount) || 0,
                        );
                        setPayAmount(String(rem));
                      }}
                    >
                      Use remaining
                    </Button>
                  </div>
                  <Input
                    id="pamt"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    max={Math.max(0, Number(selectedInvoiceForPayment?.balance_amount) || 0)}
                    value={payAmount}
                    aria-invalid={!!payFieldError}
                    aria-describedby={payFieldError ? "pay-amount-error" : undefined}
                    onChange={(e) => {
                      setPayFieldError(null);
                      const maxBal = Math.max(
                        0,
                        Number(selectedInvoiceForPayment?.balance_amount) || 0,
                      );
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next) && next > maxBal) {
                        setPayAmount(String(maxBal));
                        toast.message("Amount capped to outstanding balance.");
                        return;
                      }
                      setPayAmount(e.target.value);
                    }}
                  />
                  {payFieldError ? (
                    <p id="pay-amount-error" className="text-xs font-medium text-destructive">
                      {payFieldError}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pmethod">Method *</Label>
                  <Select value={payMethod} onValueChange={setPayMethod}>
                    <SelectTrigger id="pmethod">
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

                <div className="space-y-2">
                  <Label htmlFor="pref">Reference</Label>
                  <Input
                    id="pref"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pnotes">Notes</Label>
                  <Textarea
                    id="pnotes"
                    rows={2}
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <DialogFooter className="sticky bottom-0 mt-auto shrink-0 gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:border-0 sm:px-0 sm:py-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRecordPaymentOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={recordPayment.isPending || !payAmount}
              >
                {recordPayment.isPending ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : null}
                Confirm payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transaction Details Modal */}
      <Dialog open={transactionDetailsOpen} onOpenChange={setTransactionDetailsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>View payment receipt and plan details.</DialogDescription>
          </DialogHeader>

          {selectedPaymentForDetails ? (
            <div className="space-y-4 py-2 text-xs">
              <div className="rounded-lg border p-3.5 surface-card space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Patient:</span>
                  <span className="font-semibold text-sm">{selectedPaymentForDetails.patients?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Date:</span>
                  <span>{formatDate(selectedPaymentForDetails.payment_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Method:</span>
                  <span className="capitalize">{PAYMENT_METHOD_LABELS[selectedPaymentForDetails.payment_method] ?? selectedPaymentForDetails.payment_method}</span>
                </div>
                {selectedPaymentForDetails.reference ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reference / Txn ID:</span>
                    <span>{selectedPaymentForDetails.reference}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-semibold border-t pt-2 mt-1">
                  <span className="text-foreground">Amount Paid:</span>
                  <span className="text-sm text-primary tabular-nums">{formatCurrency(selectedPaymentForDetails.amount, currency)}</span>
                </div>
              </div>

              {selectedPaymentForDetails.notes ? (
                <div className="rounded-lg border p-3 surface-card">
                  <p className="font-semibold text-muted-foreground mb-1">Receipt Notes</p>
                  <p className="text-foreground/80 italic">
                    {parseNoteTags(selectedPaymentForDetails.notes).cleanNote || "—"}
                  </p>
                </div>
              ) : null}

              {/* Installment Plan Info if linked */}
              {(() => {
                const tags = parseNoteTags(selectedPaymentForDetails.notes);
                if (tags.parentId) {
                  return (
                    <InstallmentPlanDetailsSection 
                      planId={tags.parentId}
                      installmentText={tags.installmentText}
                      currency={currency}
                    />
                  );
                }
                return null;
              })()}
            </div>
          ) : null}

          <DialogFooter className="gap-2 sm:justify-between">
            {selectedPaymentForDetails?.invoice_id ? (
              <Button
                className="gap-1.5"
                onClick={() => {
                  const id = selectedPaymentForDetails.invoice_id as string;
                  setTransactionDetailsOpen(false);
                  setBillPreviewInvoiceId(id);
                }}
              >
                <FileText className="size-4" aria-hidden />
                View Invoice Bill
              </Button>
            ) : (
              <span />
            )}
            <Button variant="outline" onClick={() => setTransactionDetailsOpen(false)}>
              Close Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoice bill template preview — autofit, no scroll */}
      <Dialog
        open={!!billPreviewInvoiceId}
        onOpenChange={(open) => {
          if (!open) setBillPreviewInvoiceId(null);
        }}
      >
        <DialogContent className="!fixed !inset-3 !left-3 !right-3 !top-3 !bottom-3 !flex !h-auto !max-h-none !w-auto !max-w-none !translate-x-0 !translate-y-0 !gap-0 !overflow-hidden !rounded-xl !border !bg-surface-2 !p-0 flex-col shadow-2xl sm:!inset-4 sm:!left-4 sm:!right-4 sm:!top-4 sm:!bottom-4 sm:!max-h-none sm:!max-w-none sm:!translate-x-0 sm:!translate-y-0 sm:!p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Invoice Bill</DialogTitle>
            <DialogDescription>Printable invoice bill template.</DialogDescription>
          </DialogHeader>

          <div className="grid shrink-0 grid-cols-2 gap-2 border-b bg-surface-1 p-3 pr-12 print:hidden sm:flex sm:flex-wrap sm:items-center sm:justify-end">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-1.5 sm:w-auto"
              onClick={handleShareInvoiceImage}
              disabled={!billPreviewQuery.data || sharingInvoice}
            >
              {sharingInvoice ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <MessageCircle className="size-4" aria-hidden />
              )}
              <span className="sm:hidden">WhatsApp</span>
              <span className="hidden sm:inline">WhatsApp Invoice</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-1.5 sm:w-auto"
              onClick={handlePrintInvoice}
              disabled={!billPreviewQuery.data || printingInvoice}
            >
              {printingInvoice ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Printer className="size-4" aria-hidden />
              )}
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center gap-1.5 sm:w-auto"
              onClick={handleDownloadPdf}
              disabled={!billPreviewQuery.data || downloadingPdf}
            >
              {downloadingPdf ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Download className="size-4" aria-hidden />
              )}
              <span className="sm:hidden">PDF</span>
              <span className="hidden sm:inline">Download PDF</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center sm:w-auto"
              onClick={() => setBillPreviewInvoiceId(null)}
            >
              Close
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden p-1.5 sm:p-3">
            {billPreviewQuery.isLoading ? (
              <div className="flex h-full items-center rounded-xl bg-surface-1 p-6">
                <LoadingCards count={2} />
              </div>
            ) : billPreviewQuery.isError || !billPreviewQuery.data ? (
              <div className="rounded-xl bg-surface-1 p-6 text-sm text-destructive">
                Unable to load invoice bill.
              </div>
            ) : (
              <InvoiceBillFitFrame className="h-full w-full rounded-lg bg-surface-2">
                <InvoiceBillTemplate
                  compact
                  clinic={mergeClinicForBill(
                    billPreviewQuery.data.invoice.clinics,
                    profile?.clinic,
                  )}
                  patient={billPreviewQuery.data.invoice.patients}
                  invoice={billPreviewQuery.data.invoice}
                  items={billPreviewQuery.data.items}
                  currency={currency}
                  paymentDueDate={billPreviewQuery.data.paymentDueDate}
                />
              </InvoiceBillFitFrame>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function InstallmentPlanDetailsSection({ 
  planId, 
  installmentText, 
  currency 
}: { 
  planId: string; 
  installmentText: string | null; 
  currency: string; 
}) {
  const { data: plan, isLoading } = useQuery({
    queryKey: ["installment-plan-lookup", planId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("installment_plans")
        .select("*, invoices(*, patients(*)), installments(*) ")
        .eq("id", planId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-xs text-muted-foreground animate-pulse">Loading linked plan details...</p>;
  if (!plan) return <p className="text-xs text-destructive">Linked payment plan not found.</p>;

  const paidCount = (plan.installments ?? []).filter((i) => i.status === "paid").length;
  const totalCount = plan.number_of_installments;
  
  return (
    <div className="rounded-lg border p-3.5 surface-card space-y-2 border-primary/20 bg-primary/5">
      <h4 className="font-semibold text-primary text-xs uppercase tracking-wider">
        Linked Payment Plan Details
      </h4>
      <div className="space-y-1 text-[11px]">
        {installmentText && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Progression:</span>
            <span className="font-semibold text-primary">{installmentText}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Overall Treatment Cost:</span>
          <span className="tabular-nums font-semibold">{formatCurrency(plan.invoices?.grand_total ?? 0, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Down Payment:</span>
          <span className="tabular-nums font-semibold">{formatCurrency(plan.down_payment ?? 0, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Installment Amount:</span>
          <span className="tabular-nums font-semibold">{formatCurrency(plan.installment_amount ?? 0, currency)}/month</span>
        </div>
        <div className="flex justify-between border-t pt-1.5 mt-1">
          <span className="text-muted-foreground">Total Paid:</span>
                        <span className="tabular-nums font-semibold text-ink-900">{formatCurrency(plan.invoices?.paid_amount ?? 0, currency)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Due:</span>
          <span className="tabular-nums font-bold text-destructive">{formatCurrency(plan.invoices?.balance_amount ?? 0, currency)}</span>
        </div>
      </div>
      <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden mt-1.5">
        <div 
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${Math.round((paidCount / totalCount) * 100)}%` }}
        />
      </div>
    </div>
  );
}
