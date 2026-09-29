import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The Patient Line — the app's signature list-row pattern: an identity tile,
 * a name + meta line, and a right-aligned figure/action slot.
 *
 * Use this everywhere the "patient, a number, one action" shape repeats:
 * dashboard lists, flow cards, billing rows, follow-up rows, appointment
 * cards, payment history. One shape, one set of proportions, everywhere.
 *
 * Color is reserved for `tone` — only set it for a genuinely exceptional row
 * (overdue, waiting 30+ min). Normal rows should pass no tone at all.
 *
 * Mobile: identity + name on the first row; figure/actions wrap on a second
 * row so buttons never shove the name off-screen.
 */

const TILE_CLASSES = [
  "bg-tile-1-surface text-tile-1-text",
  "bg-tile-2-surface text-tile-2-text",
  "bg-tile-3-surface text-tile-3-text",
  "bg-tile-4-surface text-tile-4-text",
  "bg-tile-5-surface text-tile-5-text",
  "bg-tile-6-surface text-tile-6-text",
] as const;

function hashToTileIndex(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash % TILE_CLASSES.length;
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0);
  if (!first) return "?";
  const last = parts.at(-1);
  if (!last || last === first) return first.slice(0, 2).toUpperCase();
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

/** Identity tile: color is a hash of the name, purely for scannability — never status. */
export function PatientTile({ name, className }: { name: string; className?: string }) {
  const tileClass = TILE_CLASSES[hashToTileIndex(name || "?")];
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-[10px] text-xs font-semibold sm:size-10 sm:text-sm",
        tileClass,
        className,
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

export function PatientLine({
  name,
  patientId,
  meta,
  figure,
  action,
  tone,
  className,
}: {
  /** Patient / row display name. Also seeds the identity tile color and initials. */
  name: string;
  /** When set, tapping the name opens the patient master profile. */
  patientId?: string | undefined;
  /** Secondary line, e.g. "PT-0042 · 98765 43210" or "PT-0042 · Scaling". */
  meta?: ReactNode;
  /** Right-aligned figure (amount, time, date). Rendered above `action` if both are present. */
  figure?: ReactNode;
  /** Right-aligned single primary action (button/link). Keep to one. */
  action?: ReactNode;
  /** Only for a genuinely exceptional row. Omit for normal rows — most rows have no tone. */
  tone?: "danger" | "warning" | "info" | "success" | undefined;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-lg py-2.5 transition-colors duration-150 sm:flex-row sm:items-center sm:gap-3",
        tone === "danger" &&
          "border-l-[3px] border-l-danger-text bg-danger-surface/50 pl-2.5",
        tone === "warning" &&
          "border-l-[3px] border-l-warning-text bg-warning-surface/50 pl-2.5",
        tone === "info" &&
          "border-l-[3px] border-l-info-text bg-info-surface/40 pl-2.5",
        tone === "success" &&
          "border-l-[3px] border-l-success-text bg-success-surface/40 pl-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        <PatientTile name={name} />
        <div className="min-w-0 flex-1">
          {patientId ? (
            <Link
              to="/patients/$patientId"
              params={{ patientId }}
              onClick={(e) => e.stopPropagation()}
              className="block truncate text-sm font-semibold leading-snug text-ink-900 hover:text-primary hover:underline"
            >
              {name}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold leading-snug text-ink-900">{name}</p>
          )}
          {meta ? (
            <p className="line-clamp-2 text-xs leading-snug text-ink-500 sm:truncate sm:line-clamp-none">
              {meta}
            </p>
          ) : null}
        </div>
      </div>
      {figure || action ? (
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 pl-11 sm:shrink-0 sm:justify-end sm:pl-0">
          {figure ? (
            <span
              className={cn(
                "min-w-0 text-xs font-semibold tabular-nums sm:text-sm",
                tone === "danger"
                  ? "text-danger-text"
                  : tone === "warning"
                    ? "text-warning-text"
                    : tone === "info"
                      ? "text-info-text"
                      : tone === "success"
                        ? "text-success-text"
                        : "text-ink-900",
              )}
            >
              {figure}
            </span>
          ) : (
            <span />
          )}
          {action ? <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">{action}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
