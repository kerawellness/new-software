import { createFileRoute } from "@tanstack/react-router";

import { FlowBoard } from "@/components/flow/flow-board";
import { AppShell, PageHeader } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_authenticated/flow")({
  head: () => ({
    meta: [
      { title: "Patient Flow Board — VSP Software" },
      {
        name: "description",
        content: "Real-time clinical patient flow: Expected, Waiting, In Chair, Done.",
      },
    ],
  }),
  component: PatientFlowPage,
});

function PatientFlowPage() {
  return (
    <AppShell>
      <PageHeader
        title="Patient Flow"
        description="Expected → Waiting → In Chair → Done. Cards turn amber at 15 min wait, red at 30."
      />
      <div className="space-y-4">
        <FlowBoard />
      </div>
    </AppShell>
  );
}
