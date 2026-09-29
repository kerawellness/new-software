import {
  arrivePendingPatientFn,
  registerPendingAtChairFn,
} from "@backend/controllers/arrive-pending-controller";
import type { PhoneMatchPatient } from "@backend/models/patient";
import { nextSharedPhone, splitFamilyPhone } from "@/lib/family-phone";
import { unwrapApi } from "@/services/api-client";
import { findPatientsByPhone } from "@/services/patients";

export type { PhoneMatchPatient };
export { nextSharedPhone, splitFamilyPhone };

export function isOnlineAppointment(appt: { notes?: string | null | undefined }): boolean {
  const n = (appt.notes ?? "").toLowerCase();
  return n.includes("[online]") || n.includes("online booking");
}

export function needsArriveIdentity(
  appt: {
    notes?: string | null | undefined;
    patients?: { id: string } | null;
    pending_patients?: { id: string } | null;
  },
  extra?: { fromOnlineConvert?: boolean | undefined },
): boolean {
  const online = isOnlineAppointment(appt) || extra?.fromOnlineConvert === true;
  return online && !appt.patients && !!appt.pending_patients?.id;
}

export function needsChairRegistration(appt: {
  patients?: { id: string } | null;
  pending_patients?: { id: string } | null;
}): boolean {
  return !appt.patients && !!appt.pending_patients?.id;
}

export async function findPatientsByPhoneBase(
  clinicId: string,
  phone: string,
): Promise<PhoneMatchPatient[]> {
  return findPatientsByPhone(clinicId, phone);
}

export async function arrivePendingPatient(opts: {
  clinicId: string;
  appointmentId: string;
  pendingPatientId: string;
  kind: "old" | "new";
  oldPatientId?: string | undefined;
  phoneMode?: "shared" | "own" | undefined;
  fullName: string;
  phone: string;
  email?: string | null;
}): Promise<string> {
  return unwrapApi(
    await arrivePendingPatientFn({
      data: {
        clinicId: opts.clinicId,
        appointmentId: opts.appointmentId,
        pendingPatientId: opts.pendingPatientId,
        kind: opts.kind,
        ...(opts.oldPatientId ? { oldPatientId: opts.oldPatientId } : {}),
        ...(opts.phoneMode ? { phoneMode: opts.phoneMode } : {}),
        fullName: opts.fullName,
        phone: opts.phone,
        email: opts.email ?? null,
      },
    }),
  );
}

export async function registerPendingAtChair(opts: {
  clinicId: string;
  appointmentId: string;
  pendingPatientId: string;
}): Promise<string> {
  return unwrapApi(await registerPendingAtChairFn({ data: opts }));
}
