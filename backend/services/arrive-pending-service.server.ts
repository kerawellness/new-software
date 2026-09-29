import * as appointmentRepository from "@backend/repositories/appointment-repository.server";
import * as auditRepository from "@backend/repositories/audit-repository.server";
import * as patientRepository from "@backend/repositories/patient-repository.server";
import type { ClinicDb } from "@backend/types";
import { isDemoId } from "@/lib/demo-data";
import { nextSharedPhone, splitFamilyPhone } from "@/lib/family-phone";
import { isPatientPhone, patientPhoneDigits } from "@/lib/format";
import {
  familyPhonesForBase,
  findPatientsByPhoneBase,
} from "@backend/services/patient-service.server";

export async function arrivePendingPatient(
  db: ClinicDb,
  userId: string,
  opts: {
    clinicId: string;
    appointmentId: string;
    pendingPatientId: string;
    kind: "old" | "new";
    oldPatientId?: string | undefined;
    phoneMode?: "shared" | "own" | undefined;
    fullName: string;
    phone: string;
    email?: string | null | undefined;
  },
): Promise<string> {
  if (isDemoId(opts.appointmentId)) {
    throw new Error(
      "Dummy rows are preview only — turn off Show dummy data to change real appointments.",
    );
  }

  let patientId: string;
  let patientName: string;
  let savePhone = opts.phone.trim();
  const fullName = opts.fullName.trim();
  if (fullName.length < 2) throw new Error("Enter the patient name.");

  if (opts.kind === "old") {
    if (!opts.oldPatientId) throw new Error("Select the old patient.");
    const existing = await patientRepository.getPatientById(db, opts.clinicId, opts.oldPatientId);
    patientId = existing.id;
    patientName = existing.full_name;
    savePhone = existing.phone;
  } else {
    if (opts.phoneMode === "own") {
      if (!isPatientPhone(savePhone)) throw new Error("Enter a 10-digit phone number.");
      savePhone = patientPhoneDigits(savePhone);
    } else if (savePhone.length < 6) {
      throw new Error("Enter the patient phone.");
    }
    if (opts.phoneMode !== "own") {
      const patients = await findPatientsByPhoneBase(db, opts.clinicId, savePhone);
      if (patients.length > 0) {
        const family = await familyPhonesForBase(db, opts.clinicId, savePhone);
        savePhone = nextSharedPhone(splitFamilyPhone(savePhone).base, family);
      }
    }

    await patientRepository.updatePendingPatient(db, opts.pendingPatientId, {
      full_name: fullName,
      phone: savePhone,
      email: opts.email?.trim() || null,
    });

    const now = new Date().toISOString();
    await appointmentRepository.updateAppointmentArrival(db, opts.appointmentId, {
      flow_status: "waiting",
      arrived_at: now,
      appointment_status: "confirmed",
    });

    const audit = await auditRepository.insertAuditLog(db, {
      clinic_id: opts.clinicId,
      user_id: userId,
      action: "patient_arrived",
      entity_type: "appointment",
      entity_id: opts.appointmentId,
      metadata: {
        patient: fullName,
        from_pending: true,
        kind: "new",
      },
    });
    if (audit.error) {
      console.error("audit log failed", {
        action: "patient_arrived",
        entityType: "appointment",
        entityId: opts.appointmentId,
        error: audit.error,
      });
    }
    return fullName;
  }

  await patientRepository.updatePendingPatient(db, opts.pendingPatientId, {
    full_name: patientName,
    phone: savePhone,
  });

  const now = new Date().toISOString();
  await appointmentRepository.updateAppointmentArrival(db, opts.appointmentId, {
    patient_id: patientId,
    pending_patient_id: null,
    flow_status: "waiting",
    arrived_at: now,
    appointment_status: "confirmed",
  });

  const audit = await auditRepository.insertAuditLog(db, {
    clinic_id: opts.clinicId,
    user_id: userId,
    action: "patient_arrived",
    entity_type: "appointment",
    entity_id: opts.appointmentId,
    metadata: {
      patient: patientName,
      from_pending: true,
      kind: opts.kind,
    },
  });
  if (audit.error) {
    console.error("audit log failed", {
      action: "patient_arrived",
      entityType: "appointment",
      entityId: opts.appointmentId,
      error: audit.error,
    });
  }

  return patientName;
}

export async function registerPendingAtChair(
  db: ClinicDb,
  opts: {
    clinicId: string;
    appointmentId: string;
    pendingPatientId: string;
  },
): Promise<string> {
  if (isDemoId(opts.appointmentId)) {
    throw new Error(
      "Dummy rows are preview only — turn off Show dummy data to move real patients.",
    );
  }

  const pending = await patientRepository.getPendingPatient(db, opts.pendingPatientId);
  const patientCode = await patientRepository.nextPatientCode(db);
  const created = await patientRepository.insertPatient(db, {
    clinic_id: opts.clinicId,
    patient_code: patientCode,
    full_name: pending.full_name ?? "",
    phone: pending.phone,
    email: pending.email || null,
    patient_type: pending.patient_type || "regular",
  });

  const now = new Date().toISOString();
  await appointmentRepository.updateAppointmentArrival(db, opts.appointmentId, {
    patient_id: created.id,
    pending_patient_id: null,
    flow_status: "engage",
    engaged_at: now,
    appointment_status: "confirmed",
  });

  await patientRepository.deletePendingPatient(db, opts.pendingPatientId);
  return created.full_name;
}
