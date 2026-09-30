/** Public Supabase settings for the browser. `.env` VITE_* values win over baked build defaults. */
export function resolvePublicSupabaseUrl(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_URL;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv.trim();
  if (typeof __VSP_SUPABASE_URL__ === "string" && __VSP_SUPABASE_URL__.trim().length > 0) {
    return __VSP_SUPABASE_URL__.trim();
  }
  return "";
}

export function resolvePublicSupabaseKey(): string {
  const fromEnv = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) return fromEnv.trim();
  if (
    typeof __VSP_SUPABASE_PUBLISHABLE_KEY__ === "string" &&
    __VSP_SUPABASE_PUBLISHABLE_KEY__.trim().length > 0
  ) {
    return __VSP_SUPABASE_PUBLISHABLE_KEY__.trim();
  }
  return "";
}
