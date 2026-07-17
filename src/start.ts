import { createStart, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { renderErrorPage } from "@/lib/error-page";
import { consumeLastCapturedError } from "@/lib/error-capture";
import { attachAppSupabaseAuth } from "@/lib/function-auth-attacher";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof Response || (error != null && typeof error === "object" && ("statusCode" in error || "status" in error))) {
      throw error;
    }

    const request = getRequest();
    const acceptHeader = request.headers.get("accept") ?? "";
    const requestPath = new URL(request.url).pathname;
    const isServerFunctionRequest =
      requestPath.includes("_serverFn") ||
      requestPath.includes("/_server") ||
      !acceptHeader.includes("text/html");

    if (isServerFunctionRequest) {
      throw error;
    }

    console.error(error);
    const lastError = consumeLastCapturedError() || error;
    const diagnostic = lastError instanceof Error 
      ? (lastError.stack || lastError.message) 
      : (lastError ? String(lastError) : 'Unknown Server Error');
    
    return new Response(renderErrorPage(diagnostic), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, attachAppSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
