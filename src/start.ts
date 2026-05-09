import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "@/lib/error-page";
import { consumeLastCapturedError } from "@/lib/error-capture";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    const lastError = consumeLastCapturedError();
    const diagnostic = lastError instanceof Error ? lastError.message : String(lastError);
    
    return new Response(renderErrorPage(diagnostic), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware],
}));
