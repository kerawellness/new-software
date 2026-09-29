import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * App-wide status color language (single source of truth).
 * Change tones here → updates Follow-ups, Appointments, Flow, Billing, Dashboard, Patient.
 *
 * Amber = watch · Red = act now · Blue = in progress · Green = done · Grey = normal
 */
export type StatusTone = "neutral" | "info" | "warning" | "danger" | "success";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-line bg-surface-2 text-ink-700",
  info: "border-info-line bg-info-surface font-bold text-info-text",
  warning: "border-warning-line bg-warning-surface font-bold text-warning-text",
  danger: "border-danger-line bg-danger-surface font-bold text-danger-text",
  success: "border-success-line bg-success-surface font-bold text-success-text",
};

export function StatusChip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-150 sm:px-2",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function flowStatusTone(
  flow: "schedule" | "waiting" | "engage" | "done",
): StatusTone {
  if (flow === "waiting") return "warning";
  if (flow === "engage") return "info";
  if (flow === "done") return "success";
  return "neutral";
}

export function appointmentStatusTone(
  status: "scheduled" | "confirmed" | "cancelled" | "no_show",
): StatusTone {
  if (status === "cancelled" || status === "no_show") return "danger";
  if (status === "confirmed") return "info";
  return "neutral";
}

export function followUpStatusTone(args: {
  status: string;
  overdue: boolean;
}): StatusTone {
  if (args.status === "completed") return "success";
  if (args.overdue || args.status === "overdue") return "danger";
  return "warning";
}

export function followUpStatusLabel(args: {
  status: string;
  overdue: boolean;
}): string {
  if (args.status === "completed") return "Done";
  if (args.overdue || args.status === "overdue") return "Late";
  return "Due";
}

export function treatmentStatusTone(status: string): StatusTone {
  if (status === "completed") return "success";
  if (status === "in_progress") return "info";
  if (status === "cancelled") return "danger";
  return "warning"; // planned
}

export function treatmentStatusLabel(status: string): string {
  return status.replaceAll("_", " ");
}

export function invoiceStatusTone(status: string, balanceAmount?: number): StatusTone {
  if (status === "paid" || (balanceAmount !== undefined && balanceAmount <= 0)) return "success";
  if (status === "cancelled") return "neutral";
  if (status === "partial") return "warning";
  if (status === "unpaid" || status === "draft") return "danger";
  return Number(balanceAmount) > 0 ? "danger" : "neutral";
}

export function invoiceStatusLabel(status: string, balanceAmount?: number): string {
  if (balanceAmount !== undefined && balanceAmount <= 0) return "Paid";
  if (status === "partial") return "Partial";
  if (status === "unpaid") return "Unpaid";
  if (status === "draft") return "Draft";
  if (status === "cancelled") return "Cancelled";
  if (status === "paid") return "Paid";
  return status.replaceAll("_", " ");
}

export function installmentStatusTone(status: string, dueDate?: string, today?: string): StatusTone {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (dueDate && today && dueDate < today && status !== "paid") return "danger";
  return "warning";
}

export function installmentStatusLabel(status: string, dueDate?: string, today?: string): string {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  if (dueDate && today && dueDate < today) return "Overdue";
  return "Due";
}

export function planStatusTone(status: string): StatusTone {
  if (status === "completed") return "success";
  if (status === "cancelled") return "neutral";
  if (status === "active") return "info";
  return "warning";
}
