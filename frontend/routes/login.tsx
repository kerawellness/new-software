import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { useSession } from "@/hooks/use-session";
import { ensureClinicProfileForSession } from "@/lib/ensure-clinic-profile";
import {
  resolvePublicSupabaseKey,
  resolvePublicSupabaseUrl,
} from "@/lib/supabase-public-config";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign In — VSP Software" },
      {
        name: "description",
        content: "Sign in with your authorized clinic credentials to access the dental management system.",
      },
    ],
  }),
  component: LoginPage,
});

function signInErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (
    status === 400 ||
    /invalid login credentials|invalid email or password|invalid login/i.test(raw)
  ) {
    return "Incorrect email or password.";
  }
  if (/failed to fetch|networkerror|load failed|could not resolve|err_name_not_resolved/i.test(raw)) {
    let host = "the clinic database";
    try {
      host = new URL(resolvePublicSupabaseUrl()).hostname;
    } catch {
      /* ignore */
    }
    return `Cannot reach ${host}. Hard-refresh this page (Ctrl+Shift+R). If you use the live website, wait for the latest deploy to finish, or sign in at http://localhost:8080 while developing locally.`;
  }
  return raw || "Sign-in failed.";
}

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const search = useSearch({ strict: false }) as { redirect?: string; reason?: string };
  const destination = search?.redirect || "/dashboard";
  const sessionNotice =
    search?.reason === "session"
      ? "Your session ended. Sign in again to continue — unsaved form data on other tabs may be lost."
      : null;

  useEffect(() => {
    if (!loading && session) {
      navigate({ to: destination, replace: true });
    }
  }, [session, loading, destination, navigate]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionNotice, setConnectionNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = resolvePublicSupabaseUrl();
    const key = resolvePublicSupabaseKey();
    if (!url || !key) {
      setConnectionNotice("Supabase settings are missing in this build.");
      return;
    }
    void fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.ok) {
          setConnectionNotice(`Clinic database returned an error (${res.status}). Check Supabase project status.`);
        } else {
          setConnectionNotice(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        let host = url;
        try {
          host = new URL(url).hostname;
        } catch {
          /* ignore */
        }
        setConnectionNotice(
          `This page cannot reach ${host}. Hard-refresh (Ctrl+Shift+R) or use http://localhost:8080 if you are developing locally.`,
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signInMutation = useMutation({
    mutationFn: async () => {
      setErrorMessage(null);

      const cleanEmail = email.trim();
      if (!cleanEmail) {
        throw new Error("Please enter your email address.");
      }
      if (!password) {
        throw new Error("Please enter your password.");
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: password,
      });

      if (error) throw error;
      await ensureClinicProfileForSession();
      return data;
    },
    onSuccess: () => {
      navigate({ to: destination, replace: true });
    },
    onError: (err) => {
      setErrorMessage(signInErrorMessage(err));
    },
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signInMutation.mutate();
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))]">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">VSP Software</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in</p>
        </div>

        {sessionNotice ? (
          <p role="status" className="text-sm text-ink-500">
            {sessionNotice}
          </p>
        ) : null}

        {connectionNotice ? (
          <p role="status" className="text-sm text-warning-text">
            {connectionNotice}
          </p>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="text-sm text-danger-text">
            {errorMessage}
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleFormSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              required
              autoComplete="username"
              value={email}
              aria-invalid={!!errorMessage}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Password</Label>
            <Input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              aria-invalid={!!errorMessage}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
            />
          </div>

          <Button
            id="submit-login-btn"
            type="submit"
            className="w-full"
            disabled={signInMutation.isPending}
          >
            {signInMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {signInMutation.isPending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
