import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { useSession } from "@/hooks/use-session";
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
      return data;
    },
    onSuccess: () => {
      navigate({ to: destination, replace: true });
    },
    onError: (err) => {
      const raw = err instanceof Error ? err.message : "";
      if (raw.toLowerCase().includes("invalid login")) {
        setErrorMessage("Incorrect email or password.");
        return;
      }
      if (/failed to fetch|networkerror|load failed|err_name_not_resolved/i.test(raw)) {
        setErrorMessage("The clinic database could not be reached. Refresh and try again.");
        return;
      }
      setErrorMessage(raw || "Invalid email or password.");
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
