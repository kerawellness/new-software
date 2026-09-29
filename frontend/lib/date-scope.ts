import { formatDate, todayISO } from "@/lib/format";

export type DateScopeMode = "all" | "day" | "month" | "range";

export type DateScope = {
  mode: DateScopeMode;
  day: string;
  month: string;
  from: string;
  to: string;
};

export function createDateScope(mode: DateScopeMode = "day"): DateScope {
  const today = todayISO();
  return {
    mode,
    day: today,
    month: today.slice(0, 7),
    from: today,
    to: today,
  };
}

export function monthBounds(yearMonth: string): { start: string; end: string } {
  const parts = yearMonth.split("-").map(Number);
  const y = parts[0] ?? new Date().getFullYear();
  const m = parts[1] ?? new Date().getMonth() + 1;
  const start = `${yearMonth}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yearMonth}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

/** null = no date constraint (All). */
export function resolveDateScope(scope: DateScope): { start: string; end: string } | null {
  if (scope.mode === "all") return null;

  if (scope.mode === "day") {
    const day = scope.day || todayISO();
    return { start: day, end: day };
  }

  if (scope.mode === "month") {
    return monthBounds(scope.month || todayISO().slice(0, 7));
  }

  const start = scope.from || todayISO();
  const end = scope.to || todayISO();
  return start <= end ? { start, end } : { start: end, end: start };
}

export function dateScopeLabel(scope: DateScope): string {
  const range = resolveDateScope(scope);
  if (!range) return "All dates";

  if (scope.mode === "day") {
    return range.start === todayISO() ? "Today" : formatDate(range.start);
  }

  if (scope.mode === "month") {
    try {
      const [y, m] = range.start.split("-").map(Number);
      const d = new Date(y!, (m ?? 1) - 1, 1);
      return d.toLocaleString("default", { month: "short", year: "numeric" });
    } catch {
      return scope.month;
    }
  }

  if (range.start === range.end) return formatDate(range.start);
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

type DateFilterQuery = {
  eq: (column: string, value: string) => DateFilterQuery;
  gte: (column: string, value: string) => DateFilterQuery;
  lte: (column: string, value: string) => DateFilterQuery;
};

/** Filter a date-only column (yyyy-MM-dd). */
export function applyDateColumnFilter<T extends DateFilterQuery>(
  query: T,
  column: string,
  scope: DateScope,
): T {
  const range = resolveDateScope(scope);
  if (!range) return query;
  if (range.start === range.end) {
    return query.eq(column, range.start) as T;
  }
  return query.gte(column, range.start).lte(column, range.end) as T;
}

/** Filter a timestamptz column using local day bounds. */
export function applyTimestampColumnFilter<T extends DateFilterQuery>(
  query: T,
  column: string,
  scope: DateScope,
): T {
  const range = resolveDateScope(scope);
  if (!range) return query;
  return query
    .gte(column, `${range.start}T00:00:00`)
    .lte(column, `${range.end}T23:59:59.999`) as T;
}
