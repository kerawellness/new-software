/** Default clinic / product logo served from `/public`. */
export const DEFAULT_CLINIC_LOGO_SRC = "/clinic-logo.png";

export function resolveClinicLogoUrl(logoUrl?: string | null): string {
  const trimmed = logoUrl?.trim();
  return trimmed || DEFAULT_CLINIC_LOGO_SRC;
}
