import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

function LegacyFunctionOAuthCallbackAlias() {
  useEffect(() => {
    window.location.replace(`/integrations/meta/callback${window.location.search}`);
  }, []);

  return null;
}

export const Route = createFileRoute("/functions/v1/oauth-callback")({
  component: LegacyFunctionOAuthCallbackAlias,
});