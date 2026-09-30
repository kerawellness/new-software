import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const PUBLIC_SUPABASE_URL = "https://dohijfmjxrgmjtacfvxi.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvaGlqZm1qeHJnbWp0YWNmdnhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3Njk5OTUsImV4cCI6MjEwNjM0NTk5NX0.avTRIsmrb7w9SDsiSP3vGXRaB68Hy7uVx1vF9TWtnhU";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = fileEnv.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL || PUBLIC_SUPABASE_URL;
  const supabaseKey =
    fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    fileEnv.SUPABASE_PUBLISHABLE_KEY ||
    PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  return {
    define: {
      __VSP_SUPABASE_URL__: JSON.stringify(supabaseUrl),
      __VSP_SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(supabaseKey),
    },
    server: {
      port: 8080,
      host: true,
    },
    plugins:
      mode === "test"
        ? [tsconfigPaths()]
        : [
            tsconfigPaths(),
            tailwindcss(),
            tanstackStart({ srcDirectory: "frontend" }),
            viteReact(),
            nitro(process.env.VERCEL ? { preset: "vercel" } : {}),
          ],
  };
});
