import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const LINK_SITE_URL = "https://link.optivus.sbs";

export const Route = createFileRoute("/_authenticated/link")({
  head: () => ({
    meta: [
      { title: "Link — VSP Software" },
      {
        name: "description",
        content: "Open the Optivus Link website.",
      },
    ],
  }),
  component: LinkPage,
});

function LinkPage() {
  useEffect(() => {
    window.location.assign(LINK_SITE_URL);
  }, []);

  return (
    <p className="p-6 text-sm text-ink-500">
      Opening{" "}
      <a href={LINK_SITE_URL} className="text-primary underline">
        link.optivus.sbs
      </a>
      …
    </p>
  );
}
