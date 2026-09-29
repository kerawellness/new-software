import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { AppShell, PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/connect")({
  head: () => ({
    meta: [
      { title: "Connect — VSP Software" },
      { name: "description", content: "Connect is coming soon." },
    ],
  }),
  component: ConnectPage,
});

function ConnectPage() {
  return (
    <AppShell>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1 px-0">
          <Link to="/more">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </Link>
        </Button>
      </div>
      <PageHeader title="Connect" description="Coming soon." />
      <div className="rounded-2xl border border-line bg-surface-1 px-6 py-16 text-center">
        <p className="text-lg font-semibold text-ink-900">Coming soon</p>
      </div>
    </AppShell>
  );
}
