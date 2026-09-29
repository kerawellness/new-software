import { z } from "zod";

export const searchPatientsSchema = z.object({
  clinicId: z.string().uuid(),
  term: z.string(),
});

export const findPatientsByPhoneSchema = z.object({
  clinicId: z.string().uuid(),
  phone: z.string(),
});

export const arrivePendingPatientSchema = z.object({
  clinicId: z.string().uuid(),
  appointmentId: z.string().min(1),
  pendingPatientId: z.string().min(1),
  kind: z.enum(["old", "new"]),
  oldPatientId: z.string().uuid().optional(),
  phoneMode: z.enum(["shared", "own"]).optional(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string().nullable().optional(),
});

export const registerPendingAtChairSchema = z.object({
  clinicId: z.string().uuid(),
  appointmentId: z.string().min(1),
  pendingPatientId: z.string().min(1),
});
