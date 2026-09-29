import type { RecordInvoicePaymentResult } from "@backend/models/payment";
import * as auditRepository from "@backend/repositories/audit-repository.server";
import * as paymentRepository from "@backend/repositories/payment-repository.server";
import * as profileRepository from "@backend/repositories/profile-repository.server";
import type { ClinicDb } from "@backend/types";
import type { RecordInvoicePaymentCommand } from "@backend/validators/payment-validators";

export async function recordInvoicePayment(
  db: ClinicDb,
  userId: string,
  input: RecordInvoicePaymentCommand,
): Promise<RecordInvoicePaymentResult> {
  const profile = await profileRepository.getProfileByUserId(db, userId);
  if (!profile?.clinic_id) throw new Error("Clinic session not active.");

  const invoice = await paymentRepository.getInvoiceForPayment(db, input.invoiceId);
  if (invoice.clinic_id !== profile.clinic_id) throw new Error("Invoice not found.");
  if (invoice.patient_id !== input.patientId) throw new Error("Patient does not match this invoice.");

  const clinicId = profile.clinic_id;
  const recordedBy = userId;

  const amt = Number(input.amount);
  if (Number.isNaN(amt) || amt <= 0) throw new Error("Enter a valid payment amount.");
  const maxBalance = await paymentRepository.getInvoiceBalance(db, input.invoiceId);
  if (amt > maxBalance + 0.001) {
    throw new Error(`Payment cannot exceed balance due.`);
  }

  const plan = await paymentRepository.findInstallmentPlanByInvoice(db, input.invoiceId);
  const planId = plan?.id;
  const targetInstallment = input.targetInstallment ?? null;
  let noteWithParent = (input.notes ?? "").trim();

  if (planId) {
    if (targetInstallment) {
      noteWithParent =
        `[Installment #${targetInstallment.index + 1} of ${targetInstallment.totalCount}][ParentId:${planId}] ${noteWithParent}`.trim();
    } else {
      noteWithParent = `[Waterfall Payment][ParentId:${planId}] ${noteWithParent}`.trim();
    }
  }

  await paymentRepository.insertPayment(db, {
    clinic_id: clinicId,
    patient_id: input.patientId,
    invoice_id: input.invoiceId,
    amount: amt,
    payment_method: input.paymentMethod,
    payment_date: input.paymentDate,
    reference: input.reference?.trim() || null,
    notes: noteWithParent || null,
    recorded_by: recordedBy,
  });

  if (plan && plan.installments && plan.installments.length > 0) {
    if (targetInstallment) {
      const dueShare = Math.max(0, Number(targetInstallment.amount) || 0);
      const alreadyPaid = Number(targetInstallment.paid_amount) || 0;
      const totalPaid = alreadyPaid + amt;
      const status = dueShare > 0 && totalPaid >= dueShare ? "paid" : "partial";
      await paymentRepository.updateInstallment(db, targetInstallment.id, {
        paid_amount: totalPaid,
        status,
        paid_at: status === "paid" ? input.paymentDate : null,
      });

      const rem = await paymentRepository.getInvoiceBalance(db, input.invoiceId);
      const allInst = await paymentRepository.listInstallments(db, plan.id);
      const unpaid = [...allInst]
        .filter((i) => i.status !== "paid")
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      const n = unpaid.length;
      if (n > 0 && rem <= 0) {
        for (const row of unpaid) {
          await paymentRepository.updateInstallment(db, row.id, {
            amount: 0,
            paid_amount: Number(row.paid_amount) || 0,
            status: "paid",
            paid_at: input.paymentDate,
          });
        }
      } else if (n > 0) {
        const share = Math.round((rem / n) * 100) / 100;
        for (let i = 0; i < unpaid.length; i++) {
          const row = unpaid[i]!;
          const newAmount = i === n - 1 ? Math.round((rem - share * (n - 1)) * 100) / 100 : share;
          await paymentRepository.updateInstallment(db, row.id, { amount: newAmount });
        }
      }
    } else {
      const sortedInstallments = [...plan.installments].sort(
        (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
      );
      let remaining = amt;
      for (const inst of sortedInstallments) {
        if (remaining <= 0) break;
        if (inst.status === "paid") continue;

        const due = inst.amount - (inst.paid_amount || 0);
        if (remaining >= due) {
          await paymentRepository.updateInstallment(db, inst.id, {
            paid_amount: inst.amount,
            status: "paid",
            paid_at: input.paymentDate,
          });
          remaining -= due;
        } else {
          await paymentRepository.updateInstallment(db, inst.id, {
            paid_amount: (inst.paid_amount || 0) + remaining,
            status: "partial",
          });
          remaining = 0;
        }
      }
    }

    const remAfterPay = await paymentRepository.getInvoiceBalance(db, input.invoiceId);
    if (remAfterPay <= 0) {
      await paymentRepository.markRemainingInstallmentsPaid(db, plan.id, input.paymentDate);
      await paymentRepository.completeInstallmentPlan(db, plan.id);
    } else {
      const updatedInsts = await paymentRepository.listInstallments(db, plan.id);
      const allPaid = updatedInsts.every((i) => i.status === "paid");
      if (allPaid) {
        await paymentRepository.completeInstallmentPlan(db, plan.id);
      }
    }
  }

  const fromQuickEntry = (input.notes ?? "").includes("Recorded via Quick Entry Flow");
  if (!fromQuickEntry) {
    const audit = await auditRepository.insertAuditLog(db, {
      clinic_id: clinicId,
      user_id: userId,
      action: "payment_recorded",
      entity_type: "invoice",
      entity_id: input.invoiceId,
      metadata: {
        amount: amt,
        method: input.paymentMethod,
        invoice_number: input.invoiceNumber,
      },
    });
    if (audit.error) {
      console.error("audit log failed", {
        action: "payment_recorded",
        entityType: "invoice",
        entityId: input.invoiceId,
        error: audit.error,
      });
    }
  }

  const remaining = await paymentRepository.getInvoiceBalance(db, input.invoiceId);
  let nextDueDate: string | null = null;
  if (plan?.id) {
    nextDueDate = await paymentRepository.getNextUnpaidDueDate(db, plan.id);
  }

  return {
    invoiceId: input.invoiceId,
    invoiceNumber: input.invoiceNumber,
    patientId: input.patientId,
    patientName: input.patientName,
    remaining,
    nextDueDate,
    clinicId,
  };
}
