import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PickerPatient = {
  id: string;
  full_name: string;
  patient_code?: string | null;
  phone?: string | null;
};

export function PatientPicker({
  id = "patient-search",
  label = "Patient",
  required,
  selected,
  onClear,
  search,
  onSearchChange,
  results,
  loading,
  onSelect,
  createSlot,
}: {
  id?: string;
  label?: string;
  required?: boolean;
  selected: PickerPatient | null;
  onClear: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  results: PickerPatient[];
  loading?: boolean;
  onSelect: (patient: PickerPatient) => void;
  createSlot?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </Label>
        {!selected ? createSlot : null}
      </div>
      {selected ? (
        <div className="flex items-center justify-between gap-2 border-b border-line py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">{selected.full_name}</p>
            <p className="truncate text-sm text-ink-500">
              {[selected.patient_code, selected.phone].filter(Boolean).join(" · ") || "No phone"}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Change
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            id={id}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            autoComplete="off"
            enterKeyHint="search"
            aria-label={`Search ${label.toLowerCase()}`}
          />
          {loading ? (
            <p className="text-sm text-ink-500">Searching…</p>
          ) : results.length === 0 ? (
            search.trim() ? <p className="text-sm text-ink-500">No patients found.</p> : null
          ) : (
            <div className="max-h-40 divide-y divide-line overflow-y-auto border-y border-line">
              {results.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 py-2.5 text-left text-sm"
                  onClick={() => onSelect(p)}
                >
                  <span className="w-full truncate font-medium text-ink-900">{p.full_name}</span>
                  <span className="w-full truncate text-ink-500">
                    {[p.patient_code, p.phone].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
