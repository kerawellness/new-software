import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = fileEnv.VITE_SUPABASE_URL || fileEnv.SUPABASE_URL || "";
  const supabaseKey =
    fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY || fileEnv.SUPABASE_PUBLISHABLE_KEY || "";

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
