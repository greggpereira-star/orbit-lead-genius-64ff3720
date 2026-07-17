import { Navigate, createFileRoute } from "@tanstack/react-router";

function MetaOAuthCallbackAlias() {
  const search = typeof window === "undefined" ? "" : window.location.search;
  return <Navigate to={`/integrations/meta/callback${search}`} replace />;
}

export const Route = createFileRoute("/meta-oauth-callback")({
  component: MetaOAuthCallbackAlias,
});