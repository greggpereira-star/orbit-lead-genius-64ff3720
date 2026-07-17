import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

function MetaOAuthCallbackAlias() {
  useEffect(() => {
    window.location.replace(`/integrations/meta/callback${window.location.search}`);
  }, []);

  return null;
}

export const Route = createFileRoute("/meta-oauth-callback")({
  component: MetaOAuthCallbackAlias,
});