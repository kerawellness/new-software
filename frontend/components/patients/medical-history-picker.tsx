import { ChevronDown, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEDICAL_HISTORY } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type SelectedCondition = { condition: string; category: string; notes?: string };

/** Expandable, searchable medical-history picker. Never a single huge dropdown. */
export function MedicalHistoryPicker({
  value,
  onChange,
}: {
  value: SelectedCondition[];
  onChange: (next: SelectedCondition[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // Custom condition entry states
  const [customCondition, setCustomCondition] = useState("");
  const [customCategory, setCustomCategory] = useState("Other");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return Object.entries(MEDICAL_HISTORY)
      .map(([category, items]) => [
        category,
        term ? items.filter((i) => i.toLowerCase().includes(term)) : items,
      ] as const)
      .filter(([, items]) => items.length > 0);
  }, [search]);

  const isSelected = (condition: string) => value.some((v) => v.condition === condition);

  const toggle = (condition: string, category: string) => {
    if (isSelected(condition)) {
      onChange(value.filter((v) => v.condition !== condition));
    } else {
      onChange([...value, { condition, category, notes: "" }]);
    }
  };

  const handleAddCustom = () => {
    const trimmed = customCondition.trim();
    if (!trimmed) return;

    if (value.some((v) => v.condition.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Condition is already selected.");
      return;
    }

    onChange([...value, { condition: trimmed, category: customCategory, notes: "" }]);
    setCustomCondition("");
  };

  return (
    <div className="space-y-4">
      {/* Search and List */}
      <div>
        <Input
          placeholder="Search"
          aria-label="Search medical conditions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Selected Conditions List with Notes */}
      {value.length > 0 ? (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Selected Conditions ({value.length})
          </p>
          <div className="divide-y text-xs">
            {value.map((v) => (
              <div
                key={v.condition}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-foreground block">{v.condition}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{v.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={v.notes || ""}
                    onChange={(e) => {
                      onChange(
                        value.map((item) =>
                          item.condition === v.condition
                            ? { ...item, notes: e.target.value }
                            : item
                        )
                      );
                    }}
                    className="min-w-0 flex-1 sm:w-64"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => toggle(v.condition, v.category)}
                    aria-label={`Remove ${v.condition}`}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Standard Categories Accordion */}
      <div className="divide-y rounded-xl border">
        {filtered.map(([category, items]) => {
          const expanded = open === category || !!search.trim();
          const count = value.filter((v) => v.category === category).length;
          return (
            <div key={category}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-3 text-left text-sm font-medium"
                onClick={() => setOpen(expanded && !search.trim() ? null : category)}
                aria-expanded={expanded}
              >
                <span className="flex items-center gap-2">
                  {category}
                  {count > 0 ? (
                    <Badge variant="secondary" className="tabular-nums">
                      {count}
                    </Badge>
                  ) : null}
                </span>
                <ChevronDown
                  className={cn("size-4 transition-transform", expanded && "rotate-180")}
                  aria-hidden
                />
              </button>
              {expanded ? (
                <div className="grid gap-1 px-3 pb-3 sm:grid-cols-2">
                  {items.map((item) => (
                    <label
                      key={item}
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={isSelected(item)}
                        onCheckedChange={() => toggle(item, category)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Manual / Custom Condition Entry */}
      <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Or Add Custom Condition
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={customCondition}
            onChange={(e) => setCustomCondition(e.target.value)}
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddCustom();
              }
            }}
          />
          <div className="flex gap-2">
            <Select value={customCategory} onValueChange={customCategory => setCustomCategory(customCategory)}>
              <SelectTrigger className="w-full min-w-0 sm:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {Object.keys(MEDICAL_HISTORY).map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddCustom}
              className="text-xs"
            >
              <Plus className="size-3.5 mr-1" /> Add
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

