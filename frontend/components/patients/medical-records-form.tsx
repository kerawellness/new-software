import { Plus, Trash2 } from "lucide-react";
import { MedicalHistoryPicker, type SelectedCondition } from "./medical-history-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ALLERGY_OPTIONS,
  ALLERGY_SEVERITY,
  HABIT_OPTIONS,
  MEDICATION_OPTIONS,
} from "@/lib/constants";

export type AllergyRow = {
  substance: string;
  severity: string;
  reaction: string;
  notes: string;
};

export type MedicationRow = {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  notes: string;
};

export type HabitRow = {
  habit: string;
  notes: string;
};

interface MedicalRecordsFormProps {
  conditions: SelectedCondition[];
  onChangeConditions: (next: SelectedCondition[]) => void;
  allergies: AllergyRow[];
  onChangeAllergies: (next: AllergyRow[]) => void;
  medications: MedicationRow[];
  onChangeMedications: (next: MedicationRow[]) => void;
  habits: HabitRow[];
  onChangeHabits: (next: HabitRow[]) => void;
}

export function MedicalRecordsForm({
  conditions,
  onChangeConditions,
  allergies,
  onChangeAllergies,
  medications,
  onChangeMedications,
  habits,
  onChangeHabits,
}: MedicalRecordsFormProps) {
  // Allergy helpers
  const addAllergy = () => {
    onChangeAllergies([
      ...allergies,
      { substance: "", severity: "Moderate", reaction: "", notes: "" },
    ]);
  };

  const updateAllergy = (idx: number, fields: Partial<AllergyRow>) => {
    onChangeAllergies(
      allergies.map((row, i) => (i === idx ? { ...row, ...fields } : row))
    );
  };

  const removeAllergy = (idx: number) => {
    onChangeAllergies(allergies.filter((_, i) => i !== idx));
  };

  // Medication helpers
  const addMedication = () => {
    onChangeMedications([
      ...medications,
      { medication: "", dosage: "", frequency: "", duration: "", notes: "" },
    ]);
  };

  const updateMedication = (idx: number, fields: Partial<MedicationRow>) => {
    onChangeMedications(
      medications.map((row, i) => (i === idx ? { ...row, ...fields } : row))
    );
  };

  const removeMedication = (idx: number) => {
    onChangeMedications(medications.filter((_, i) => i !== idx));
  };

  // Habit helpers
  const isHabitChecked = (standardHabit: string) => {
    return habits.some((h) => h.habit === standardHabit);
  };

  const getHabitNotes = (standardHabit: string) => {
    return habits.find((h) => h.habit === standardHabit)?.notes || "";
  };

  const toggleStandardHabit = (standardHabit: string) => {
    if (isHabitChecked(standardHabit)) {
      onChangeHabits(habits.filter((h) => h.habit !== standardHabit));
    } else {
      onChangeHabits([...habits, { habit: standardHabit, notes: "" }]);
    }
  };

  const updateStandardHabitNotes = (standardHabit: string, notes: string) => {
    onChangeHabits(
      habits.map((h) => (h.habit === standardHabit ? { ...h, notes } : h))
    );
  };

  const addCustomHabit = () => {
    onChangeHabits([...habits, { habit: "", notes: "" }]);
  };

  const updateCustomHabit = (idx: number, fields: Partial<HabitRow>) => {
    onChangeHabits(
      habits.map((row, i) => (i === idx ? { ...row, ...fields } : row))
    );
  };

  const removeCustomHabit = (idx: number) => {
    onChangeHabits(habits.filter((_, i) => i !== idx));
  };

  // Get custom habits (not in standard constants)
  const customHabits = habits.filter((h) => !HABIT_OPTIONS.includes(h.habit));

  return (
    <div className="space-y-6">
      {/* Medical History */}
      <section className="surface-card p-4 rounded-xl border space-y-3">
        <h2 className="text-sm font-semibold text-foreground border-b pb-2">Medical History</h2>
        <MedicalHistoryPicker value={conditions} onChange={onChangeConditions} />
      </section>

      {/* Allergies */}
      <section className="surface-card p-4 rounded-xl border space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-sm font-semibold text-foreground">Allergies</h2>
          <Button type="button" size="sm" variant="outline" onClick={addAllergy}>
            <Plus className="size-4 mr-1" aria-hidden /> Add Allergy
          </Button>
        </div>
        {allergies.length === 0 ? (
          <p className="text-xs text-muted-foreground">No allergies recorded.</p>
        ) : (
          <div className="space-y-4">
            {allergies.map((row, idx) => (
              <div key={idx} className="grid gap-3 rounded-lg border p-3 bg-muted/10 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Select Allergen</Label>
                  <Select
                    value={ALLERGY_OPTIONS.includes(row.substance) ? row.substance : ""}
                    onValueChange={(v) => updateAllergy(idx, { substance: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose standard allergen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLERGY_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Or Type Allergen *</Label>
                  <Input
                    value={row.substance}
                    onChange={(e) => updateAllergy(idx, { substance: e.target.value })}
                    className="bg-background"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Severity</Label>
                  <Select
                    value={row.severity}
                    onValueChange={(v) => updateAllergy(idx, { severity: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLERGY_SEVERITY.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Reaction / Symptoms</Label>
                  <Input
                    value={row.reaction}
                    onChange={(e) => updateAllergy(idx, { reaction: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2 flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-[11px] text-muted-foreground">Clinical Notes</Label>
                    <Input
                      value={row.notes}
                      onChange={(e) => updateAllergy(idx, { notes: e.target.value })}
                      className="bg-background"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 h-9 w-9 shrink-0"
                    onClick={() => removeAllergy(idx)}
                    aria-label="Remove allergy"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Medications */}
      <section className="surface-card p-4 rounded-xl border space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <h2 className="text-sm font-semibold text-foreground">Active Medications</h2>
          <Button type="button" size="sm" variant="outline" onClick={addMedication}>
            <Plus className="size-4 mr-1" aria-hidden /> Add Medication
          </Button>
        </div>
        {medications.length === 0 ? (
          <p className="text-xs text-muted-foreground">No medications recorded.</p>
        ) : (
          <div className="space-y-4">
            {medications.map((row, idx) => (
              <div key={idx} className="grid gap-3 rounded-lg border p-3 bg-muted/10 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Select Medication</Label>
                  <Select
                    value={MEDICATION_OPTIONS.includes(row.medication) ? row.medication : ""}
                    onValueChange={(v) => updateMedication(idx, { medication: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose standard drug..." />
                    </SelectTrigger>
                    <SelectContent>
                      {MEDICATION_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Or Type Medication Name *</Label>
                  <Input
                    value={row.medication}
                    onChange={(e) => updateMedication(idx, { medication: e.target.value })}
                    className="bg-background"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Dosage</Label>
                  <Input
                    value={row.dosage}
                    onChange={(e) => updateMedication(idx, { dosage: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Frequency</Label>
                  <Input
                    value={row.frequency}
                    onChange={(e) => updateMedication(idx, { frequency: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">Duration</Label>
                  <Input
                    value={row.duration}
                    onChange={(e) => updateMedication(idx, { duration: e.target.value })}
                    className="bg-background"
                  />
                </div>

                <div className="space-y-1 flex gap-2 items-end">
                  <div className="flex-1">
                    <Label className="text-[11px] text-muted-foreground">Clinical Notes</Label>
                    <Input
                      value={row.notes}
                      onChange={(e) => updateMedication(idx, { notes: e.target.value })}
                      className="bg-background"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 h-9 w-9 shrink-0"
                    onClick={() => removeMedication(idx)}
                    aria-label="Remove medication"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Habits */}
      <section className="surface-card p-4 rounded-xl border space-y-4">
        <h2 className="text-sm font-semibold text-foreground border-b pb-2">Habits</h2>

        {/* Predefined Habits Checkboxes */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Common Habits
          </Label>
          <div className="grid gap-3 sm:grid-cols-2">
            {HABIT_OPTIONS.map((option) => {
              const checked = isHabitChecked(option);
              return (
                <div
                  key={option}
                  className="flex flex-col gap-1.5 rounded-lg border p-3 bg-muted/5 hover:bg-accent/40"
                >
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleStandardHabit(option)}
                    />
                    {option}
                  </label>
                  {checked ? (
                    <Input
                      value={getHabitNotes(option)}
                      onChange={(e) => updateStandardHabitNotes(option, e.target.value)}
                      className="mt-1"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom Habits */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Other / Custom Habits
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addCustomHabit}
              className="px-2"
            >
              <Plus className="size-3.5 mr-1" /> Add Custom
            </Button>
          </div>

          {customHabits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No other habits recorded.</p>
          ) : (
            <div className="space-y-2">
              {habits.map((row, idx) => {
                // Render only custom ones
                if (HABIT_OPTIONS.includes(row.habit)) return null;
                return (
                  <div key={idx} className="flex gap-2 items-center bg-muted/5 border rounded-lg p-2.5">
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <Input
                        value={row.habit}
                        onChange={(e) => updateCustomHabit(idx, { habit: e.target.value })}
                        required
                      />
                      <Input
                        value={row.notes}
                        onChange={(e) => updateCustomHabit(idx, { notes: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:bg-destructive/10"
                      onClick={() => removeCustomHabit(idx)}
                      aria-label="Remove habit"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
