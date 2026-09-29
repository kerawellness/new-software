import { z } from "zod";

export const dateScopeSchema = z.object({
  mode: z.enum(["all", "day", "month", "range"]),
  day: z.string(),
  month: z.string(),
  from: z.string(),
  to: z.string(),
});

export const listFollowUpsSchema = z.object({
  viewFilter: z.enum(["late", "due", "upcoming", "done"]),
  dateScope: dateScopeSchema,
  sortOrder: z.enum(["asc", "desc"]),
  search: z.string(),
  today: z.string().min(8),
});

export const createFollowUpSchema = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  patientName: z.string().min(1),
  reason: z.string().trim().min(1, "Enter follow-up reason."),
  dueDate: z.string().min(8, "Select a due date."),
  notes: z.string().trim(),
});

export const completeFollowUpSchema = z.object({
  id: z.string().uuid(),
  clinicId: z.string().uuid(),
});

export const rescheduleFollowUpSchema = z.object({
  id: z.string().uuid(),
  dueDate: z.string().min(8),
});
