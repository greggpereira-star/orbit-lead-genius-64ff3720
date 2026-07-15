import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "@/lib/error-page";
import { consumeLastCapturedError } from "@/lib/error-capture";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
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
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
