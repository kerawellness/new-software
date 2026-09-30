/** Server-side Supabase URL/key. Prefer process.env from `.env` over baked build defaults. */
export function resolveServerSupabaseUrl(): string {
  return (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    (typeof __VSP_SUPABASE_URL__ !== "undefined" ? __VSP_SUPABASE_URL__ : "")
  ).trim();
}

export function resolveServerSupabasePublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (typeof __VSP_SUPABASE_PUBLISHABLE_KEY__ !== "undefined"
      ? __VSP_SUPABASE_PUBLISHABLE_KEY__
      : "")
  ).trim();
}
