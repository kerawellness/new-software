import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const PUBLIC_SUPABASE_URL = "https://ufyfmdjsipckoaxulbsm.supabase.co";
const PUBLIC_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVmeWZtZGpzaXBja29heHVsYnNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NTk4ODcsImV4cCI6MjEwNjIzNTg4N30.tKobGd6Ci9HUJy1zcJ0mVwsEKKzUY3AK6orpHdF3hww";

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
