import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DateScope, DateScopeMode } from "@/lib/date-scope";
import { todayISO } from "@/lib/format";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: { value: DateScopeMode; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "range", label: "Between" },
  { value: "all", label: "All" },
];

export function DateScopeFilter({
  value,
  onChange,
  className,
}: {
  value: DateScope;
  onChange: (next: DateScope) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      <Select
        value={value.mode}
        onValueChange={(mode) => onChange({ ...value, mode: mode as DateScopeMode })}
      >
        <SelectTrigger aria-label="Date filter mode" className="w-full sm:w-36">
          <SelectValue placeholder="Date filter" />
        </SelectTrigger>
        <SelectContent>
          {MODE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.mode === "day" ? (
        <Input
          type="date"
          className="relative w-full min-w-0 sm:w-44"
          aria-label="Filter date"
          value={value.day}
          onChange={(e) => onChange({ ...value, day: e.target.value || todayISO() })}
        />
      ) : null}

      {value.mode === "month" ? (
        <Input
          type="month"
          className="relative w-full min-w-0 sm:min-w-[12.5rem] sm:w-52"
          aria-label="Filter month"
          value={value.month}
          onChange={(e) =>
            onChange({ ...value, month: e.target.value || todayISO().slice(0, 7) })
          }
        />
      ) : null}

      {value.mode === "range" ? (
        <>
          <Input
            type="date"
            className="relative w-full min-w-0 sm:w-44"
            aria-label="From date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value || todayISO() })}
          />
          <Input
            type="date"
            className="relative w-full min-w-0 sm:w-44"
            aria-label="To date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value || todayISO() })}
          />
        </>
      ) : null}
    </div>
  );
}
