import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

function requiredSupabaseSetting(
  name: string,
  ...values: Array<string | undefined>
): string {
  const value = values.map((item) => item?.trim() ?? "").find((item) => item.length > 0);
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env for local builds, or in the host environment (Vercel → Settings → Environment Variables) before deploying.`,
    );
  }
  return value;
}

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const supabaseUrl =
    mode === "test"
      ? ""
      : requiredSupabaseSetting(
          "SUPABASE_URL",
          process.env.VITE_SUPABASE_URL,
          process.env.SUPABASE_URL,
          fileEnv["VITE_SUPABASE_URL"],
          fileEnv["SUPABASE_URL"],
        );
  const supabaseKey =
    mode === "test"
      ? ""
      : requiredSupabaseSetting(
          "SUPABASE_PUBLISHABLE_KEY",
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          process.env.SUPABASE_PUBLISHABLE_KEY,
          fileEnv["VITE_SUPABASE_PUBLISHABLE_KEY"],
          fileEnv["SUPABASE_PUBLISHABLE_KEY"],
        );

  return {
    test: {
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/e2e/**",
        "**/.{idea,git,cache,output,temp}/**",
      ],
    },
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
            nitro(process.env["VERCEL"] ? { preset: "vercel" } : {}),
          ],
  };
});
