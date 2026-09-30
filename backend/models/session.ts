import type { Role } from "@/lib/constants";

export type ClinicProfile = {
  id: string;
  clinic_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  roles: Role[];
  clinic: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    logo_url: string | null;
    patient_code_prefix: string;
    tax_enabled: boolean;
    tax_rate: number;
    tax_label: string;
    currency: string;
  } | null;
};
