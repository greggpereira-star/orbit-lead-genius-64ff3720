import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/design-system/components/AppSidebar';
import { Topbar } from '@/design-system/components/Topbar';
import { CommandPalette } from '@/design-system/components/CommandPalette';
import { tracker } from '@/core/tracking/tracker';
import { Button } from '@/components/ui/button';
import { RefreshCcw, LogOut, ShieldAlert } from 'lucide-react';
import { logger } from '@/core/observability/logger';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  const { isAuthenticated, isLoading, company, user, logout, refreshSession, configError } = useAuth();
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      logger.info('Not authenticated, redirecting to login');
      router.navigate({ to: '/login' });
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (isAuthenticated && company) {
      tracker.init(company.id);
    }
  }, [isAuthenticated, company?.id]);

  if (configError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Configuration Error</h1>
            <p className="text-muted-foreground">{configError}</p>
          </div>
          <p className="text-xs font-mono bg-muted p-3 rounded text-left overflow-auto">
            ENV: {window.location.hostname}
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground italic animate-pulse">Initializing enterprise session...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Handle case where auth is OK but tenant context failed to load
  if (!company) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full space-y-6 text-center animate-in fade-in zoom-in duration-500">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <ShieldAlert className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">No Company Context</h1>
            <p className="text-muted-foreground">
              We couldn't find an associated company for your account (<b>{user?.email}</b>).
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={() => {
              setRetryCount(prev => prev + 1);
              refreshSession();
            }} className="gap-2 font-bold">
              <RefreshCcw className="w-4 h-4" />
              Retry Connection
            </Button>
            <Button variant="ghost" onClick={() => logout()} className="gap-2 text-muted-foreground">
              <LogOut className="w-4 h-4" />
              Sign out and try another account
            </Button>
          </div>
          {retryCount > 0 && (
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
              Attempt {retryCount} failed. Database sync may be pending.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="flex flex-col h-screen overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-auto p-6 bg-background/50">
            <Outlet />
          </main>
        </div>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
