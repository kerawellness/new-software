/** GSTIN / UPI / doctors persist on `clinics.address` as extra lines until dedicated columns exist. */

function labeledValue(line: string, label: string): string | null {
  const prefix = `${label}:`;
  if (line.length < prefix.length) return null;
  if (line.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) return null;
  return line.slice(prefix.length).trim();
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
    const asGstin = labeledValue(trimmed, "GSTIN");
    if (asGstin !== null) {
      gstin = asGstin;
      continue;
    }
    const asUpi = labeledValue(trimmed, "UPI");
    if (asUpi !== null) {
      upi = asUpi;
      continue;
    }
    const asDoctor1 = labeledValue(trimmed, "DOCTOR1");
    if (asDoctor1 !== null) {
      doctor1 = asDoctor1;
      continue;
    }
    const asDoctor2 = labeledValue(trimmed, "DOCTOR2");
    if (asDoctor2 !== null) {
      doctor2 = asDoctor2;
      continue;
    }
    rest.push(line);
  }
  return { address: rest.join("\n").trim(), gstin, upi, doctor1, doctor2 };
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
