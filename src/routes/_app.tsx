import { Outlet, createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/design-system/components/AppSidebar';
import { Topbar } from '@/design-system/components/Topbar';
import { CommandPalette } from '@/design-system/components/CommandPalette';
import { tracker } from '@/core/tracking/tracker';
import { Button } from '@/components/ui/button';
import { RefreshCcw, LogOut, ShieldAlert, Loader2 } from 'lucide-react';
import { logger } from '@/core/observability/logger';

export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  const { state, company, user, logout, refreshContext, error, traceId } = useAuth();
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (state === 'UNAUTHENTICATED') {
      logger.info('User is unauthenticated, redirecting to login', { traceId });
      router.navigate({ to: '/login' });
    }
  }, [state, router, traceId]);

  useEffect(() => {
    if (state === 'READY' && company) {
      tracker.init(company.id);
    }
  }, [state, company?.id]);

  // Loading States
  if (state === 'INITIALIZING' || state === 'AUTHENTICATING' || state === 'TENANT_LOADING') {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-6 max-w-sm text-center">
          <div className="relative">
             <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
             <div className="absolute inset-0 flex items-center justify-center">
               <div className="h-2 w-2 rounded-full bg-primary animate-ping" />
             </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold tracking-tight">Enterprise Session Hydration</p>
            <p className="text-[11px] text-muted-foreground font-medium animate-pulse italic">
              {state === 'TENANT_LOADING' ? 'Synchronizing multi-tenant context...' : 'Validating secure identity...'}
            </p>
          </div>
          <div className="pt-4 px-3 py-1.5 rounded-full bg-muted/50 border text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
            TraceID: {traceId}
          </div>
        </div>
      </div>
    );
  }

  // Error States
  if (state === 'ERROR' || (state === 'READY' && !company)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md w-full space-y-8 text-center animate-in fade-in zoom-in duration-500">
          <div className="mx-auto w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center shadow-inner">
            <ShieldAlert className="w-10 h-10 text-destructive" />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tighter">System Fault Detected</h1>
            <p className="text-muted-foreground font-medium">
              We encountered a barrier while loading your enterprise workspace.
            </p>
            <div className="mt-4 p-4 rounded-xl bg-destructive/[0.03] border border-destructive/10 text-left">
               <p className="text-[10px] font-bold text-destructive uppercase tracking-widest mb-2 underline">Diagnostic Report</p>
               <p className="text-xs font-mono text-foreground leading-relaxed">
                 {error || 'Identity confirmed but Tenant Context (Company) is missing for ' + user?.email}
               </p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <Button size="lg" onClick={() => {
              setRetryCount(prev => prev + 1);
              refreshContext();
            }} className="gap-2 font-bold h-12 shadow-lg shadow-primary/20">
              <RefreshCcw className={`w-4 h-4 ${retryCount > 0 ? 'animate-spin' : ''}`} />
              Re-establish Connection
            </Button>
            <Button variant="ghost" onClick={() => logout()} className="gap-2 text-muted-foreground h-12">
              <LogOut className="w-4 h-4" />
              Abandon Session
            </Button>
          </div>
          
          <div className="pt-6 border-t flex flex-col items-center gap-2">
            <p className="text-[9px] text-muted-foreground uppercase font-black tracking-[0.2em]">Reference Metrics</p>
            <div className="flex gap-4">
              <div className="text-[10px] font-mono text-muted-foreground">Trace: {traceId}</div>
              <div className="text-[10px] font-mono text-muted-foreground">Retries: {retryCount}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Deterministic Guard: We only reach here if state === READY and company exists
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
