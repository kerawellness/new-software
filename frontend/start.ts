import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { errorCodeFor, publicErrorMessage } from "@backend/errors";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    const message = publicErrorMessage(error);
    const isServerFn =
      request.method === "POST" &&
      (request.headers.get("x-tsr-redirect") != null ||
        request.url.includes("_serverFnId") ||
        request.headers.get("accept")?.includes("application/json") === true);
    if (isServerFn || message.includes("Unauthorized")) {
      const code = errorCodeFor(error, message);
      const status = code === "AUTH_REQUIRED" ? 401 : 500;
      return new Response(JSON.stringify({ success: false, error: { code, message } }), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Start installs this automatically when frontend/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, csrfMiddleware],
}));
