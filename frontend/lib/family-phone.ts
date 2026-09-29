export function splitFamilyPhone(phone: string): { base: string; suffix: number } {
  const trimmed = phone.trim();
  const tagged = trimmed.match(/^(.*)\+(\d+)$/);
  const core = tagged ? tagged[1]! : trimmed;
  const suffix = tagged ? Number(tagged[2]) : 0;
  const digits = core.replace(/\D/g, "");
  const base = digits.length >= 10 ? digits.slice(-10) : digits;
  return { base, suffix };
}

export function nextSharedPhone(base: string, existingPhones: string[]): string {
  let maxSuffix = 0;
  for (const phone of existingPhones) {
    const part = splitFamilyPhone(phone);
    if (part.base !== base) continue;
    if (part.suffix > maxSuffix) maxSuffix = part.suffix;
  }
  return `${base}+${maxSuffix + 1}`;
}

/** User-facing hint when the stored value uses a family +N suffix. */
export function familyPhoneLabel(storedPhone: string): string | null {
  const { base, suffix } = splitFamilyPhone(storedPhone);
  if (suffix <= 0) return null;
  return `Family line +${suffix} (${base}+${suffix})`;
}
