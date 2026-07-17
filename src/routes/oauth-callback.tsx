import { Navigate, createFileRoute } from "@tanstack/react-router";

function OAuthCallbackAlias() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return <Navigate to={`/integrations/meta/callback${search}`} replace />;
}

export const Route = createFileRoute("/oauth-callback")({
  component: OAuthCallbackAlias,
});