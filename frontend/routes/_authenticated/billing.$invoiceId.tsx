import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Calendar,
  Download,
  Layers,
  Loader2,
  MessageCircle,
  Plus,
  Printer,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingCards } from "@/components/common/states";
import {
  StatusChip,
  installmentStatusLabel,
  installmentStatusTone,
  planStatusTone,
} from "@/components/common/status-chip";
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
import { friendlyError, logAudit } from "@/lib/audit";
import { reversePayment } from "@/services/collect-invoice";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from "@/lib/constants";
import { mergeClinicForBill } from "@/lib/clinic-identity";
import { addMonthsLocalISO, formatCurrency, formatDate, todayISO } from "@/lib/format";
import { paise, splitMoney } from "@/lib/money";
import { recordInvoicePayment } from "@/services/record-payment";
import {
  downloadInvoicePdfA4,
  printInvoiceA4,
  shareInvoiceImage,
} from "@/lib/share-invoice-image";

export const Route = createFileRoute("/_authenticated/billing/$invoiceId")({
  validateSearch: (search: Record<string, unknown>): { share?: boolean } => {
    const share = search["share"];
    if (share === true || share === "true") return { share: true };
    return {};
  },
  head: () => ({
    meta: [
      { title: "Invoice Details — VSP Software" },
      {
        name: "description",
        content: "View itemized clinic invoice, installment schedule, payment history ledger and receipt printout.",
      },
    ],
  }),
  component: InvoiceDetailPage,
});

function InvoiceDetailPage() {
  const { invoiceId } = Route.useParams();
  const { share: openShare } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const currency = profile?.clinic?.currency ?? "INR";

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");

  // Installment Plan Modal state
  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [numInstallments, setNumInstallments] = useState("3");
  const [downPayment, setDownPayment] = useState("0");
  const [planStartDate, setPlanStartDate] = useState(todayISO());
  const [targetInstallment, setTargetInstallment] = useState<any | null>(null);
  const [sharingInvoice, setSharingInvoice] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const [inv, items, payments, plan] = await Promise.all([
        supabase
          .from("invoices")
          .select("*, patients(*), clinics(*)")
          .eq("id", invoiceId)
          .single(),
        supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId),
        supabase
          .from("payments")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("created_at", { ascending: false }),
        supabase
          .from("installment_plans")
          .select("*, installments(*)")
          .eq("invoice_id", invoiceId)
          .maybeSingle(),
      ]);

      if (inv.error) throw inv.error;

      return {
        invoice: inv.data,
        items: items.data ?? [],
        payments: payments.data ?? [],
        installmentPlan: plan.data ?? null,
      };
    },
  });

  // Auto-open WhatsApp PNG share when arriving with ?share=true
  useEffect(() => {
    if (!openShare || isLoading || !data) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const element = document.getElementById("invoice-bill-template");
        if (!element || cancelled) {
          void navigate({
            to: "/billing/$invoiceId",
            params: { invoiceId },
            search: {},
            replace: true,
          });
          return;
        }
        setSharingInvoice(true);
        try {
          const result = await shareInvoiceImage({
            element,
            invoiceNumber: data.invoice.invoice_number,
            patientName: data.invoice.patients?.full_name ?? "Patient",
            clinicName: data.invoice.clinics?.name ?? "Dental Clinic",
          });
          if (!cancelled && result === "shared") {
            toast.success("Invoice image opened for sharing.");
          }
        } catch (error) {
          if (!cancelled) {
            toast.error(error instanceof Error ? error.message : "Unable to share the invoice image.");
          }
        } finally {
          if (!cancelled) setSharingInvoice(false);
          void navigate({
            to: "/billing/$invoiceId",
            params: { invoiceId },
            search: {},
            replace: true,
          });
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [openShare, isLoading, data, invoiceId, navigate]);

  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!data?.invoice) return;
      if (!profile?.clinic_id) throw new Error("Clinic profile not ready.");
      const patient = data.invoice.patients;
      if (!patient?.id) throw new Error("Invoice patient is missing.");

      const amt = Number(payAmount);
      if (Number.isNaN(amt) || amt <= 0) throw new Error("Enter a valid payment amount.");

      return recordInvoicePayment({
        clinicId: profile.clinic_id,
        recordedBy: profile.id,
        invoiceId: data.invoice.id,
        invoiceNumber: data.invoice.invoice_number,
        patientId: patient.id,
        patientName: patient.full_name ?? "Patient",
        balanceAmount: Number(data.invoice.balance_amount) || 0,
        amount: amt,
        paymentMethod: payMethod,
        reference: payRef.trim() || null,
        notes: payNotes.trim() || null,
        targetInstallment: targetInstallment
          ? {
              id: targetInstallment.id,
              amount: targetInstallment.amount,
              paid_amount: targetInstallment.paid_amount,
              planId: targetInstallment.planId,
              totalCount: targetInstallment.totalCount,
              index: targetInstallment.index,
            }
          : null,
      });
    },
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["patient", result?.patientId] });
      void qc.invalidateQueries({ queryKey: ["payments-history"] });
      void qc.invalidateQueries({ queryKey: ["active-installment-plans"] });
      void qc.invalidateQueries({ queryKey: ["flow-balances"] });
      void qc.invalidateQueries({ queryKey: ["followups"] });
      setPaymentOpen(false);
      setPayAmount("");
      setPayRef("");
      setPayNotes("");
      setTargetInstallment(null);

      if (!result) return;

      const reminderDate =
        result.remaining > 0 ? (result.nextDueDate ?? addMonthsLocalISO(todayISO(), 1)) : null;

      toast.custom(
        (t) => (
          <div className="w-[min(100vw-2rem,22rem)] rounded-xl border border-line bg-surface-1 p-3 shadow-lg space-y-2">
            <p className="text-sm font-semibold text-ink-900">Payment recorded</p>
            <p className="text-xs text-ink-500">
              {result.invoiceNumber}
              {result.remaining > 0
                ? ` · Balance due ${formatCurrency(result.remaining, currency)}`
                : " · Settled"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                className="text-xs"
                onClick={() => {
                  toast.dismiss(t);
                  void navigate({
                    to: "/billing/$invoiceId",
                    params: { invoiceId },
                    search: { share: true },
                    replace: true,
                  });
                }}
              >
                WhatsApp
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => {
                  toast.dismiss(t);
                  void navigate({ to: "/flow" });
                }}
              >
                Flow
              </Button>
              {reminderDate ? (
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
              ) : null}
            </div>
          </div>
        ),
        { duration: 12_000 },
      );
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to record payment.")),
  });

  const undoPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      await reversePayment(paymentId);
    },
    onSuccess: () => {
      toast.success("Payment reversed. The balance is updated.");
      void qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      void qc.invalidateQueries({ queryKey: ["invoices"] });
      void qc.invalidateQueries({ queryKey: ["payments-history"] });
      void qc.invalidateQueries({ queryKey: ["billing-collections"] });
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to reverse payment.")),
  });

  const createInstallmentPlan = useMutation({
    mutationFn: async () => {
      if (!data?.invoice) return;
      if (!profile?.clinic_id) throw new Error("Clinic session not active.");

      const totalCount = Number.parseInt(numInstallments, 10);
      if (Number.isNaN(totalCount) || totalCount <= 1) throw new Error("Select at least 2 installments.");

      const dp = Number.parseFloat(downPayment) || 0;
      const invoiceBalance = Math.max(0, Number(data.invoice.balance_amount) || 0);
      if (dp > invoiceBalance + 0.001) {
        throw new Error("Down payment cannot exceed outstanding balance.");
      }
      const remainingBalance = paise(invoiceBalance - dp);
      if (remainingBalance <= 0) throw new Error("Down payment covers entire balance — use Full payment instead.");

      const shares = splitMoney(remainingBalance, totalCount);
      const monthlyAmount = shares[0] ?? 0;

      // 1. Create installment plan
      const { data: planData, error: planErr } = await supabase
        .from("installment_plans")
        .insert({
          clinic_id: profile.clinic_id,
          invoice_id: invoiceId,
          number_of_installments: totalCount,
          down_payment: dp,
          installment_amount: monthlyAmount,
          start_date: planStartDate,
          status: "active",
        })
        .select("id")
        .single();

      if (planErr) throw planErr;

      if (dp > 0) {
        const patient = data.invoice.patients;
        if (!patient?.id) throw new Error("Invoice patient is missing.");
        await recordInvoicePayment({
          clinicId: profile.clinic_id,
          recordedBy: profile.id,
          invoiceId: data.invoice.id,
          invoiceNumber: data.invoice.invoice_number,
          patientId: patient.id,
          patientName: patient.full_name ?? "Patient",
          balanceAmount: invoiceBalance,
          amount: dp,
          paymentMethod: "cash",
          notes: "Down payment for installment plan.",
        });
      }

      const rows = [];
      for (let i = 1; i <= totalCount; i++) {
        rows.push({
          clinic_id: profile.clinic_id,
          installment_plan_id: planData.id,
          due_date: addMonthsLocalISO(planStartDate, i),
          amount: shares[i - 1] ?? monthlyAmount,
          paid_amount: 0,
          status: "pending" as const,
        });
      }

      const { error: instErr } = await supabase.from("installments").insert(rows);
      if (instErr) throw instErr;
    },
    onSuccess: () => {
      toast.success("Installment plan created.");
      void qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
      setInstallmentOpen(false);
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to create installment plan.")),
  });

  if (isError)
    return (
      <AppShell>
        <ErrorState title="Unable to load invoice details." onRetry={() => refetch()} />
      </AppShell>
    );

  if (isLoading || !data)
    return (
      <AppShell>
        <LoadingCards count={3} />
      </AppShell>
    );

  const { invoice, items, payments, installmentPlan } = data;
  const clinic = mergeClinicForBill(invoice.clinics, profile?.clinic);
  const patient = invoice.patients;

  const nextDueDate =
    [...(installmentPlan?.installments ?? [])]
      .filter((i) => i.status !== "paid")
      .sort((a, b) => a.due_date.localeCompare(b.due_date))[0]?.due_date ?? null;

  async function handleShareInvoiceImage() {
    const element = document.getElementById("invoice-bill-template");
    if (!element) {
      toast.error("Invoice image is not ready.");
      return;
    }

    setSharingInvoice(true);
    try {
      const result = await shareInvoiceImage({
        element,
        invoiceNumber: invoice.invoice_number,
        patientName: patient?.full_name ?? "Patient",
        clinicName: clinic?.name ?? "Dental Clinic",
      });
      if (result === "shared") toast.success("Invoice image opened for sharing.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to share the invoice image.");
    } finally {
      setSharingInvoice(false);
    }
  }

  async function handlePrintInvoice() {
    const element = document.getElementById("invoice-bill-template");
    if (!element) {
      toast.error("Invoice is not ready.");
      return;
    }

    setPrintingInvoice(true);
    try {
      await printInvoiceA4(element, invoice.invoice_number);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to print the invoice.");
    } finally {
      setPrintingInvoice(false);
    }
  }

  async function handleDownloadPdf() {
    const element = document.getElementById("invoice-bill-template");
    if (!element) {
      toast.error("Invoice is not ready.");
      return;
    }

    setDownloadingPdf(true);
    try {
      await downloadInvoicePdfA4(element, invoice.invoice_number);
      toast.success("A4 invoice PDF downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to download the invoice PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <AppShell>
      <div className="mb-4 print:hidden">
        <Button asChild variant="ghost" size="sm" className="gap-1 px-0">
          <Link to="/billing">
            <ArrowLeft className="size-4" aria-hidden /> Back to Billing
          </Link>
        </Button>
      </div>

      <div className="print:hidden">
        <PageHeader
          title={`Invoice ${invoice.invoice_number}`}
          description={`Issued on ${formatDate(invoice.invoice_date)}`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleShareInvoiceImage} disabled={sharingInvoice}>
                {sharingInvoice ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <MessageCircle className="size-4" aria-hidden />
                )}
                WhatsApp Invoice
              </Button>
              <Button variant="outline" onClick={handlePrintInvoice} disabled={printingInvoice}>
                {printingInvoice ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Printer className="size-4" aria-hidden />
                )}
                Print
              </Button>
              <Button variant="outline" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                Download PDF
              </Button>
              {Number(invoice.balance_amount) > 0 && !installmentPlan ? (
                <Button variant="secondary" onClick={() => setInstallmentOpen(true)}>
                  <Layers className="size-4" aria-hidden /> Create Installment Plan
                </Button>
              ) : null}
              {Number(invoice.balance_amount) > 0 ? (
                <Button
                  onClick={() => {
                    setTargetInstallment(null);
                    setPayAmount(invoice.balance_amount.toString());
                    setPaymentOpen(true);
                  }}
                >
                  <Wallet className="size-4" aria-hidden /> Record Payment
                </Button>
              ) : null}
            </div>
          }
        />
      </div>

      <div className="print:contents">
        <InvoiceBillFitFrame className="h-[min(70dvh,calc(100dvh-11rem))] w-full overflow-hidden rounded-xl border bg-surface-2 p-1.5 sm:p-2 print:h-auto print:max-h-none print:border-0 print:bg-transparent print:p-0">
          <InvoiceBillTemplate
            compact
            clinic={clinic}
            patient={patient}
            invoice={invoice}
            items={items}
            currency={currency}
            paymentDueDate={nextDueDate}
          />
        </InvoiceBillFitFrame>
      </div>

      {/* Installment Plan Card if active */}
      {installmentPlan ? (
        <div className="mt-6 surface-card p-4 space-y-3 print:hidden">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Layers className="size-4 text-primary" aria-hidden />
              Installment Payment Schedule ({installmentPlan.number_of_installments} parts)
            </h3>
            <StatusChip tone={planStatusTone(installmentPlan.status)} className="capitalize">
              {installmentPlan.status}
            </StatusChip>
          </div>

          <div className="divide-y rounded-lg border text-xs">
            {(installmentPlan.installments ?? []).map((inst, index) => (
              <div key={inst.id} className="flex items-center justify-between p-3 surface-card gap-4">
                <div>
                  <p className="font-semibold">Installment #{index + 1}</p>
                  <p className="text-muted-foreground">Due Date: {formatDate(inst.due_date)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-semibold tabular-nums text-sm">{formatCurrency(inst.amount, currency)}</p>
                    <StatusChip
                      tone={installmentStatusTone(inst.status, inst.due_date, todayISO())}
                      className="mt-0.5 capitalize"
                    >
                      {installmentStatusLabel(inst.status, inst.due_date, todayISO())}
                    </StatusChip>
                  </div>
                  {inst.status !== "paid" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="px-2.5 text-xs"
                      onClick={() => {
                        setTargetInstallment({ id: inst.id, amount: inst.amount, paid_amount: inst.paid_amount || 0, index });
                        setPayAmount(String(inst.amount - (inst.paid_amount || 0)));
                        setPaymentOpen(true);
                      }}
                    >
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Payment History Ledger */}
      <div className="mt-6 surface-card p-4 space-y-3 print:hidden">
        <h3 className="text-sm font-semibold">Payment History Ledger</h3>
        {payments.length ? (
          <div className="divide-y rounded-lg border text-xs">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between p-3 surface-card">
                <div>
                  <p className="font-semibold">{formatCurrency(p.amount, currency)}</p>
                  <p className="text-muted-foreground capitalize">
                    {PAYMENT_METHOD_LABELS[p.payment_method] ?? p.payment_method} · {formatDate(p.payment_date)}
                  </p>
                  {p.reference ? <p className="text-[11px] text-muted-foreground">Ref: {p.reference}</p> : null}
                  {p.notes ? <p className="text-[11px] text-muted-foreground italic">{p.notes}</p> : null}
                </div>
                {Number(p.amount) > 0 && !String(p.notes ?? "").includes("[reversal-of:") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={undoPayment.isPending}
                    onClick={() => {
                      if (window.confirm("Reverse this payment? The amount due will go back up.")) {
                        undoPayment.mutate(p.id);
                      }
                    }}
                  >
                    Undo
                  </Button>
                ) : (
                  <StatusChip tone={Number(p.amount) < 0 ? "warning" : "success"}>
                    {Number(p.amount) < 0 ? "Reversal" : "Paid"}
                  </StatusChip>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No payments recorded for this invoice yet.</p>
        )}
      </div>

      {/* Record Payment Dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {targetInstallment 
                ? `Record Payment for Installment #${targetInstallment.index + 1}`
                : `Record Payment for ${invoice.invoice_number}`}
            </DialogTitle>
            <DialogDescription>
              {targetInstallment
                ? `Due amount is ${formatCurrency(targetInstallment.amount - targetInstallment.paid_amount, currency)}.`
                : `Current balance due is ${formatCurrency(invoice.balance_amount, currency)}.`}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              recordPayment.mutate();
            }}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="pay-amt">Amount ({currency}) *</Label>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-[11px]"
                  onClick={() => {
                    const rem = Math.max(0, Number(invoice.balance_amount) || 0);
                    setPayAmount(String(rem));
                  }}
                >
                  Use remaining {formatCurrency(Number(invoice.balance_amount) || 0, currency)}
                </Button>
              </div>
              {targetInstallment ? (
                <p className="text-[11px] text-muted-foreground">
                  This month due{" "}
                  <span className="font-semibold text-foreground">
                    {formatCurrency(
                      Math.max(
                        0,
                        Number(targetInstallment.amount) - (Number(targetInstallment.paid_amount) || 0),
                      ),
                      currency,
                    )}
                  </span>
                  {" · "}
                  Balance due{" "}
                  <span className="font-semibold text-destructive">
                    {formatCurrency(Number(invoice.balance_amount) || 0, currency)}
                  </span>
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Balance due{" "}
                  <span className="font-semibold text-destructive">
                    {formatCurrency(Number(invoice.balance_amount) || 0, currency)}
                  </span>
                </p>
              )}
              <Input
                id="pay-amt"
                type="number"
                step="0.01"
                min={0}
                max={Math.max(0, Number(invoice.balance_amount) || 0)}
                required
                value={payAmount}
                onChange={(e) => {
                  const maxBal = Math.max(0, Number(invoice.balance_amount) || 0);
                  const next = Number(e.target.value);
                  if (!Number.isNaN(next) && next > maxBal) {
                    setPayAmount(String(maxBal));
                    toast.message("Amount capped to outstanding balance.");
                    return;
                  }
                  setPayAmount(e.target.value);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Max {formatCurrency(Number(invoice.balance_amount) || 0, currency)}
              </p>
            </div>

            <div className="space-y-1">
              <Label htmlFor="pay-meth">Payment Method *</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger id="pay-meth">
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

            <div className="space-y-1">
              <Label htmlFor="pay-ref">Reference / Transaction ID</Label>
              <Input
                id="pay-ref"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="pay-notes">Payment Notes</Label>
              <Textarea
                id="pay-notes"
                value={payNotes}
                onChange={(e) => setPayNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setPaymentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={recordPayment.isPending}>
                {recordPayment.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                Save Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Installment Plan Dialog */}
      <Dialog open={installmentOpen} onOpenChange={setInstallmentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Setup Installment Plan</DialogTitle>
            <DialogDescription>
              Divide remaining balance of {formatCurrency(invoice.balance_amount, currency)} into monthly installments.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-3 text-xs"
            onSubmit={(e) => {
              e.preventDefault();
              createInstallmentPlan.mutate();
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="num-inst">Number of Installments *</Label>
              <Select value={numInstallments} onValueChange={setNumInstallments}>
                <SelectTrigger id="num-inst">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2">2 Installments</SelectItem>
                  <SelectItem value="3">3 Installments</SelectItem>
                  <SelectItem value="4">4 Installments</SelectItem>
                  <SelectItem value="6">6 Installments</SelectItem>
                  <SelectItem value="12">12 Installments</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="inst-start">First Installment Due Date *</Label>
              <Input
                id="inst-start"
                type="date"
                required
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
              />
            </div>

            <div className="rounded-lg p-3 bg-muted/50 border text-xs space-y-1">
              <p className="font-semibold text-foreground">Plan Estimate:</p>
              <p className="text-muted-foreground">
                Each installment:{" "}
                <strong className="text-primary">
                  {formatCurrency(
                    Math.round((Number(invoice.balance_amount) / Number.parseInt(numInstallments, 10)) * 100) / 100,
                    currency,
                  )}
                </strong>{" "}
                per month.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setInstallmentOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInstallmentPlan.isPending}>
                {createInstallmentPlan.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                Create Plan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
