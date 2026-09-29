import { ZodError } from "zod";

export function publicErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (!error) return fallback;
  if (error instanceof ZodError) return error.issues[0]?.message ?? fallback;
  const message =
    typeof error === "string" ? error : ((error as { message?: string }).message ?? "");
  if (!message) return fallback;
  if (message.includes("duplicate key")) return "This record already exists.";
  if (message.includes("row-level security") || message.includes("permission denied"))
    return "You do not have permission to do this.";
  if (message.includes("violates foreign key")) return "A linked record is missing.";
  if (message.toLowerCase().includes("invalid login")) return "Incorrect email or password.";
  if (message.includes("Payment cannot exceed balance due")) {
    return "Payment cannot exceed balance due.";
  }
  if (
    /^(Please|Select|Add|Enter|Choose|Paid amount|Payment amount|Clinic profile|Patient|Invoice|Booking clinic|Appointment details|No active clinic)/.test(
      message,
    )
  ) {
    return message.length <= 160 ? message : fallback;
  }
  return fallback;
}

export function errorCodeFor(error: unknown, message: string): string {
  if (error instanceof ZodError) return "VALIDATION_ERROR";
  const raw = typeof error === "string" ? error : ((error as { message?: string }).message ?? "");
  if (raw.includes("Unauthorized")) return "AUTH_REQUIRED";
  if (message.includes("Payment cannot exceed balance due")) return "PAYMENT_EXCEEDS_BALANCE";
  if (message.includes("already exists")) return "CONFLICT";
  if (message.includes("permission")) return "FORBIDDEN";
  if (message.includes("linked record")) return "RELATED_RECORD_MISSING";
  return "INTERNAL";
}
