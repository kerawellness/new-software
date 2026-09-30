import { DEFAULT_CLINIC_LOGO_SRC } from "@/lib/brand";
import { cn } from "@/lib/utils";

type ClinicLogoProps = {
  className?: string;
  alt?: string;
};

export function ClinicLogo({ className, alt = "VSP Software" }: ClinicLogoProps) {
  return (
    <img
      src={DEFAULT_CLINIC_LOGO_SRC}
      alt={alt}
      className={cn("object-contain", className)}
      width={36}
      height={36}
      decoding="async"
    />
  );
}
