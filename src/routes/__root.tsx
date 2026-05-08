 import { AuthProvider } from "../core/auth/context/AuthContext";
 import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
 import { useEffect } from "react";
 import { initTracking } from "../core/tracking/pixel";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Alt Flow Lead" },
      { name: "description", content: "LeadFlow Intelligence is an enterprise SaaS platform for intelligent lead capture, CRM, and sales automation." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Alt Flow Lead" },
      { property: "og:description", content: "LeadFlow Intelligence is an enterprise SaaS platform for intelligent lead capture, CRM, and sales automation." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Alt Flow Lead" },
      { name: "twitter:description", content: "LeadFlow Intelligence is an enterprise SaaS platform for intelligent lead capture, CRM, and sales automation." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f6e4698d-713c-484f-86cd-d7617a252508/id-preview-5ad65da5--d6850840-86f1-4af9-84f6-1f9679aa532b.lovable.app-1778272059766.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/f6e4698d-713c-484f-86cd-d7617a252508/id-preview-5ad65da5--d6850840-86f1-4af9-84f6-1f9679aa532b.lovable.app-1778272059766.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

 function RootComponent() {
   const { queryClient } = Route.useRouteContext();
 
   useEffect(() => {
     initTracking();
   }, []);
 
   return (
     <QueryClientProvider client={queryClient}>
       <AuthProvider>
         <Outlet />
       </AuthProvider>
     </QueryClientProvider>
   );
 }
