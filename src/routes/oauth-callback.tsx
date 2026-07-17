import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

function OAuthCallbackAlias() {
  useEffect(() => {
    window.location.replace(`/integrations/meta/callback${window.location.search}`);
  }, []);

  return null;
}

export const Route = createFileRoute("/oauth-callback")({
  component: OAuthCallbackAlias,
});