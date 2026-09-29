import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { StatusChip } from "@/components/common/status-chip";
import { cn } from "@/lib/utils";

export type KpiAccent = "patients" | "clinic" | "revenue" | "followups" | "balance" | "growth";

const ACCENTS: Record<
  KpiAccent,
  { icon: string; bar: string; soft: string }
> = {
  patients: {
    icon: "bg-info-surface text-info-text",
    bar: "bg-info-text",
    soft: "border-info-line/70",
  },
  clinic: {
    icon: "bg-warning-surface text-warning-text",
    bar: "bg-warning-text",
    soft: "border-warning-line/70",
  },
  revenue: {
    icon: "bg-success-surface text-success-text",
    bar: "bg-success-text",
    soft: "border-success-line/70",
  },
  followups: {
    icon: "bg-warning-surface text-warning-text",
    bar: "bg-warning-text",
    soft: "border-warning-line/70",
  },
  balance: {
    icon: "bg-danger-surface text-danger-text",
    bar: "bg-danger-text",
    soft: "border-danger-line/70",
  },
  growth: {
    icon: "bg-primary/10 text-primary",
    bar: "bg-primary",
    soft: "border-primary/30",
  },
};

export function Kpi({
  label,
  value,
  icon: Icon,
  accent,
  tone,
  actionLabel,
  actionTo,
  hint,
  showToneChip,
  className,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent: KpiAccent;
  tone?: "danger" | "warning" | "success" | undefined;
  actionLabel?: string;
  actionTo?: string;
  hint?: ReactNode;
  showToneChip?: boolean;
  className?: string;
}) {
  const a = ACCENTS[accent];
  const alert =
    tone === "danger"
      ? "border-danger-line bg-danger-surface/40"
      : tone === "warning"
        ? "border-warning-line bg-warning-surface/40"
        : tone === "success"
          ? "border-success-line bg-success-surface/30"
          : a.soft;

  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col justify-between gap-2 overflow-hidden rounded-xl border bg-surface-1 p-3 shadow-2xs transition-all duration-150 hover:shadow-xs sm:gap-3 sm:p-4",
        alert,
        className,
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1", a.bar)} aria-hidden />
      <div>
        <div className="flex items-center justify-between gap-2 pl-1.5">
          <span className="text-[11px] font-semibold text-ink-500 sm:text-xs">{label}</span>
          {showToneChip && tone ? (
            <StatusChip tone={tone}>
              {tone === "danger" ? "Watch" : tone === "warning" ? "Caution" : "Good"}
            </StatusChip>
          ) : (
            <div className={cn("grid size-7 place-items-center rounded-lg sm:size-8", a.icon)}>
              <Icon className="size-3.5" aria-hidden />
            </div>
          )}
        </div>
        <p
          className={cn(
            "mt-2 pl-1.5 text-lg font-bold tracking-tight tabular-nums sm:mt-3 sm:text-xl md:text-2xl",
            tone === "danger"
              ? "text-danger-text"
              : tone === "warning"
                ? "text-warning-text"
                : tone === "success"
                  ? "text-success-text"
                  : "text-ink-900",
          )}
        >
          {value}
        </p>
      </div>
      {hint ? <div className="pl-1.5">{hint}</div> : null}
      {actionLabel && actionTo ? (
        <Link
          to={actionTo}
          className="flex w-fit items-center gap-1 pl-1.5 text-[11px] font-semibold text-primary hover:underline"
        >
          {actionLabel}
          <ArrowRight className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
