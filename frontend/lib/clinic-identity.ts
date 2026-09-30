/** GSTIN / UPI / doctors persist on `clinics.address` as extra lines until dedicated columns exist. */

const GSTIN_LINE_LABELS = ["GSTIN", "GST NO", "GST NO.", "GST NUMBER", "GSTIN NO", "GSTIN NO."] as const;

/** Indian GSTIN — 15 characters. */
const GSTIN_VALUE_PATTERN = /\b(\d{2}[A-Z0-9]{13})\b/i;

function labeledValue(line: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    const prefix = `${label}:`;
    if (line.length < prefix.length) continue;
    if (line.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) continue;
    return line.slice(prefix.length).trim();
  }
  return null;
}

export function parseClinicBillExtras(address: string | null | undefined): {
  address: string;
  gstin: string;
  upi: string;
  doctor1: string;
  doctor2: string;
} {
  const lines = (address ?? "").split(/\r?\n/);
  let gstin = "";
  let upi = "";
  let doctor1 = "";
  let doctor2 = "";
  const rest: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const asGstin = labeledValue(trimmed, GSTIN_LINE_LABELS);
    if (asGstin !== null) {
      gstin = asGstin;
      continue;
    }
    const asUpi = labeledValue(trimmed, ["UPI"]);
    if (asUpi !== null) {
      upi = asUpi;
      continue;
    }
    const asDoctor1 = labeledValue(trimmed, ["DOCTOR1"]);
    if (asDoctor1 !== null) {
      doctor1 = asDoctor1;
      continue;
    }
    const asDoctor2 = labeledValue(trimmed, ["DOCTOR2"]);
    if (asDoctor2 !== null) {
      doctor2 = asDoctor2;
      continue;
    }
    rest.push(line);
  }

  if (!gstin) {
    for (const line of lines) {
      const match = line.match(GSTIN_VALUE_PATTERN);
      if (match && match[1]!.length === 15) {
        gstin = match[1]!.toUpperCase();
        break;
      }
    }
  }

  return { address: rest.join("\n").trim(), gstin, upi, doctor1, doctor2 };
}

export type ClinicBillSource = {
  name?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  tax_enabled?: boolean | null;
  tax_label?: string | null;
  tax_rate?: number | null;
};

/** Prefer live clinic profile (Settings) over embedded invoice clinic rows (may be cached). */
export function mergeClinicForBill(
  embedded: ClinicBillSource | null | undefined,
  live: ClinicBillSource | null | undefined,
): ClinicBillSource | null | undefined {
  if (!embedded && !live) return null;
  const fromInvoice = embedded ?? {};
  const fromProfile = live ?? {};

  return {
    name: fromInvoice.name ?? fromProfile.name ?? undefined,
    address: fromProfile.address?.trim() ? fromProfile.address : fromInvoice.address,
    phone: fromProfile.phone?.trim() ? fromProfile.phone : fromInvoice.phone,
    email: fromProfile.email?.trim() ? fromProfile.email : fromInvoice.email,
    logo_url: fromProfile.logo_url?.trim() ? fromProfile.logo_url : fromInvoice.logo_url,
    tax_enabled: fromProfile.tax_enabled ?? fromInvoice.tax_enabled,
    tax_label: fromProfile.tax_label ?? fromInvoice.tax_label,
    tax_rate: fromProfile.tax_rate ?? fromInvoice.tax_rate,
  };
}

export function composeClinicAddress(
  address: string,
  gstin: string,
  upi: string,
  doctor1 = "",
  doctor2 = "",
): string | null {
  const parts = [address.trim()];
  if (doctor1.trim()) parts.push(`DOCTOR1: ${doctor1.trim()}`);
  if (doctor2.trim()) parts.push(`DOCTOR2: ${doctor2.trim()}`);
  if (gstin.trim()) parts.push(`GSTIN: ${gstin.trim()}`);
  if (upi.trim()) parts.push(`UPI: ${upi.trim()}`);
  return parts.filter(Boolean).join("\n") || null;
}

export function clinicDoctorNames(address: string | null | undefined): string[] {
  const extras = parseClinicBillExtras(address);
  return [extras.doctor1, extras.doctor2].map((n) => n.trim()).filter(Boolean);
}
