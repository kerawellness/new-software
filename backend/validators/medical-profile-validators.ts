import { z } from "zod";

const conditionRowSchema = z.object({
  condition: z.string().trim().min(1),
  category: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

const allergyRowSchema = z.object({
  substance: z.string().trim().min(1),
  severity: z.string().trim().optional().default(""),
  reaction: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

const medicationRowSchema = z.object({
  medication: z.string().trim().min(1),
  dosage: z.string().trim().optional().default(""),
  frequency: z.string().trim().optional().default(""),
  duration: z.string().trim().optional().default(""),
  notes: z.string().trim().optional().default(""),
});

const habitRowSchema = z.object({
  habit: z.string().trim().min(1),
  notes: z.string().trim().optional().default(""),
});

const dentalHistoryRowSchema = z.object({
  item: z.string().trim().min(1),
  notes: z.string().trim().optional().default(""),
});

export const replacePatientMedicalProfileSchema = z.object({
  patientId: z.string().uuid(),
  conditions: z.array(conditionRowSchema),
  allergies: z.array(allergyRowSchema),
  medications: z.array(medicationRowSchema),
  habits: z.array(habitRowSchema),
  dentalHistory: z.array(dentalHistoryRowSchema).default([]),
});

export type ReplacePatientMedicalProfileInput = z.infer<typeof replacePatientMedicalProfileSchema>;
