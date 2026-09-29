const WAS_RE = /^\[was:(\d{4}-\d{2}-\d{2})\]\s*/;

/** Previous due date is stored on the follow-up notes so the row can badge it. */
export function splitPreviousDue(notes: string | null | undefined): {
  previousDue: string | null;
  notes: string;
} {
  const raw = notes ?? "";
  const match = WAS_RE.exec(raw);
  if (!match?.[1]) return { previousDue: null, notes: raw.trim() };
  return { previousDue: match[1], notes: raw.replace(WAS_RE, "").trim() };
}

export function withPreviousDue(
  notes: string | null | undefined,
  previousDue: string | null,
): string | null {
  const rest = splitPreviousDue(notes).notes;
  if (!previousDue) return rest || null;
  return rest ? `[was:${previousDue}] ${rest}` : `[was:${previousDue}]`;
}
