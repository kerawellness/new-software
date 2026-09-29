import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/hooks/use-session";
import { friendlyError } from "@/lib/audit";
import { isPatientPhone, patientPhoneDigits } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  arrivePendingPatient,
  findPatientsByPhoneBase,
  nextSharedPhone,
  splitFamilyPhone,
} from "@/services/arrive-pending-patient";

export type ArrivePendingTarget = {
  id: string;
  pending_patients: {
    id: string;
    full_name: string;
    phone: string;
    email?: string | null;
  } | null;
};

export function ArrivePendingDialog({
  appointment,
  onClose,
}: {
  appointment: ArrivePendingTarget | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const pending = appointment?.pending_patients ?? null;
  const [kind, setKind] = useState<"old" | "new" | null>(null);
  const [phoneMode, setPhoneMode] = useState<"shared" | "own">("shared");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [oldPatientId, setOldPatientId] = useState<string | null>(null);

  useEffect(() => {
    setKind(null);
    setPhoneMode("shared");
    setOldPatientId(null);
    setFullName(pending?.full_name ?? "");
    setPhone(patientPhoneDigits(pending?.phone ?? ""));
  }, [appointment?.id, pending?.full_name, pending?.phone]);

  const matchQuery = useQuery({
    queryKey: ["arrive-phone-matches", profile?.clinic_id, pending?.phone],
    enabled: !!profile?.clinic_id && !!pending?.phone && !!appointment,
    queryFn: () => findPatientsByPhoneBase(profile!.clinic_id, pending!.phone),
  });

  const matches = matchQuery.data ?? [];
  const hasMatch = matches.length > 0;
  const previewNewPhone = useMemo(() => {
    if (!pending?.phone || matches.length === 0) return pending?.phone ?? "";
    return nextSharedPhone(
      splitFamilyPhone(pending.phone).base,
      matches.map((m) => m.phone),
    );
  }, [pending?.phone, matches]);

  const arrive = useMutation({
    mutationFn: async () => {
      if (!appointment?.pending_patients || !profile?.clinic_id) {
        throw new Error("Clinic profile not active.");
      }
      const saveKind = hasMatch ? kind : "new";
      if (!saveKind) throw new Error("Choose Old patient or New patient.");
      const savePhoneMode = saveKind === "new" && hasMatch ? phoneMode : "own";
      return arrivePendingPatient({
        clinicId: profile.clinic_id,
        appointmentId: appointment.id,
        pendingPatientId: appointment.pending_patients.id,
        kind: saveKind,
        ...(oldPatientId ? { oldPatientId } : {}),
        ...(saveKind === "new" ? { phoneMode: savePhoneMode } : {}),
        fullName: saveKind === "old"
          ? (matches.find((m) => m.id === oldPatientId)?.full_name ?? fullName)
          : fullName,
        phone:
          saveKind === "new" && hasMatch && phoneMode === "shared"
            ? previewNewPhone
            : phone,
        email: pending?.email ?? null,
      });
    },
    onSuccess: (name) => {
      toast.success(`Arrived — Waiting · ${name}`);
      void qc.invalidateQueries({ queryKey: ["appointments"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["flow"] });
      void qc.invalidateQueries({ queryKey: ["patients"] });
      onClose();
    },
    onError: (err) => toast.error(friendlyError(err, "Unable to mark arrival.")),
  });

  const canSubmit = hasMatch
    ? kind === "old"
      ? !!oldPatientId
      : kind === "new" &&
        fullName.trim().length >= 2 &&
        (phoneMode === "shared" || isPatientPhone(phone))
    : fullName.trim().length >= 2 && isPatientPhone(phone);

  return (
    <Dialog open={!!appointment} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Verify patient</DialogTitle>
          <DialogDescription>
            Check who is here. If this number is already in the clinic, pick Old patient or save a new one.
          </DialogDescription>
        </DialogHeader>
        {pending ? (
          <div className="space-y-3 text-xs">
            <div className="space-y-1 rounded-lg border border-line bg-surface-2/50 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Booked as
              </p>
              <p className="text-sm font-semibold text-ink-900">{pending.full_name}</p>
              <p className="text-ink-500">{pending.phone}</p>
            </div>

            {matchQuery.isFetching ? (
              <p className="text-ink-500">Checking this number…</p>
            ) : hasMatch ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-ink-900">This number is on file</p>
                <div className="space-y-1.5">
                  {matches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left",
                        oldPatientId === m.id && kind === "old"
                          ? "border-primary bg-primary/5"
                          : "border-line bg-surface-1",
                      )}
                      onClick={() => {
                        setKind("old");
                        setOldPatientId(m.id);
                        setPhone(m.phone);
                      }}
                    >
                      <p className="text-sm font-semibold text-ink-900">{m.full_name}</p>
                      <p className="text-ink-500">
                        {m.patient_code} · {m.phone}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    variant={kind === "old" ? "default" : "outline"}
                    className="rounded-xl"
                    onClick={() => {
                      setKind("old");
                      if (!oldPatientId && matches[0]) {
                        setOldPatientId(matches[0].id);
                        setPhone(matches[0].phone);
                      }
                    }}
                  >
                    Old patient
                  </Button>
                  <Button
                    type="button"
                    variant={kind === "new" ? "default" : "outline"}
                    className="rounded-xl"
                    onClick={() => {
                      setKind("new");
                      setOldPatientId(null);
                      setPhoneMode("shared");
                      setFullName(pending.full_name);
                      setPhone(pending.phone);
                    }}
                  >
                    New patient
                  </Button>
                </div>
              </div>
            ) : null}

            {(!hasMatch || kind === "new") ? (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="arrive-verify-name">Name *</Label>
                  <Input
                    id="arrive-verify-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                {hasMatch ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant={phoneMode === "shared" ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => setPhoneMode("shared")}
                      >
                        Same number +1
                      </Button>
                      <Button
                        type="button"
                        variant={phoneMode === "own" ? "default" : "outline"}
                        className="rounded-xl"
                        onClick={() => {
                          setPhoneMode("own");
                          setPhone("");
                        }}
                      >
                        New number
                      </Button>
                    </div>
                    {phoneMode === "shared" ? (
                      <p className="rounded-lg border border-line bg-surface-2/50 px-3 py-2 text-ink-700">
                        Save as new patient with{" "}
                        <span className="font-semibold">{previewNewPhone}</span>
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="arrive-verify-phone">New phone *</Label>
                        <Input
                          id="arrive-verify-phone"
                          value={phone}
                          onChange={(e) => setPhone(patientPhoneDigits(e.target.value))}
                          type="tel"
                          inputMode="numeric"
                          autoComplete="tel"
                          maxLength={10}
                          placeholder="10-digit mobile"
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="arrive-verify-phone">Phone *</Label>
                    <Input
                      id="arrive-verify-phone"
                      value={phone}
                      onChange={(e) => setPhone(patientPhoneDigits(e.target.value))}
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={10}
                      placeholder="10-digit mobile"
                    />
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => arrive.mutate()} disabled={!canSubmit || arrive.isPending}>
            {arrive.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Mark Arrived
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
