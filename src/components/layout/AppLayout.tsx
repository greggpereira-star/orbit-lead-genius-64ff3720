import { Outlet, useRouter } from '@tanstack/react-router';
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

export function AppLayout() {
   const { state, company, membership, user, logout, refreshContext, error, traceId } = useAuth();
  const router = useRouter();
  const [retryCount, setRetryCount] = useState(0);

   const needsLogin = state === 'UNAUTHENTICATED';
   const needsVerify = state === 'EMAIL_SENT' || state === 'WAITING_EMAIL_CONFIRMATION';

   useEffect(() => {
     if (needsLogin) {
       logger.info('User is unauthenticated, redirecting to login', { traceId });
       router.navigate({ to: '/login', replace: true });
     } else if (needsVerify) {
       logger.info('Email verification required, redirecting', { traceId });
       router.navigate({ to: '/verify-email', replace: true });
     }
   }, [needsLogin, needsVerify, router, traceId]);

   if (needsLogin || needsVerify) {
     return (
       <div className="flex h-screen items-center justify-center bg-background">
         <Loader2 className="h-6 w-6 text-primary animate-spin" />
       </div>
     );
   }

  useEffect(() => {
    if (state === 'READY' && company) {
      tracker.init(company.id);
    }
  }, [state, company?.id]);

   const isLoadingState = [
     'BOOTSTRAP_START',
     'INITIALIZING',
     'SESSION_LOADING',
     'AUTHENTICATING',
     'PROFILE_LOADING',
     'TENANT_VALIDATING',
     'TENANT_RECOVERING',
    'MEMBERSHIP_RECOVERING',
    'ROLE_RECOVERING',
    'PERMISSIONS_RECOVERING',
    'DASHBOARD_BOOTSTRAP',
    'WORKSPACE_READY'
  ].includes(state as string);

    if (isLoadingState && state !== 'READY' && state !== 'AUTHENTICATED') {
    const getMessage = () => {
      switch (state) {
        case 'BOOTSTRAP_START': return 'Iniciando bootstrap enterprise...';
        case 'SESSION_LOADING': return 'Recuperando sessão segura...';
        case 'AUTHENTICATING': return 'Autenticando credenciais...';
        case 'PROFILE_LOADING': return 'Carregando perfil do usuário...';
        case 'TENANT_VALIDATING': return 'Validando workspace...';
        case 'TENANT_RECOVERING': return 'Recuperando workspace...';
        case 'MEMBERSHIP_RECOVERING': return 'Verificando acessos...';
        default: return 'Sincronizando ambiente...';
      }
    };
 
     return (
       <div className="flex h-screen items-center justify-center bg-background">
         <div className="flex flex-col items-center gap-6 max-w-sm text-center animate-in fade-in duration-700">
           <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-primary/10 border-t-primary animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-3 w-3 rounded-full bg-primary animate-pulse" />
              </div>
           </div>
           <div className="space-y-2">
             <p className="text-base font-black tracking-tighter uppercase">Enterprise Integrity Check</p>
             <p className="text-xs text-muted-foreground font-medium animate-pulse">
               {getMessage()}
             </p>
           </div>
           <div className="flex flex-col gap-2 items-center">
             <div className="px-3 py-1 rounded-md bg-muted/50 border text-[9px] font-mono text-muted-foreground uppercase tracking-widest">
               State: {state}
             </div>
             <div className="text-[9px] font-mono text-muted-foreground/40">Trace: {traceId}</div>
           </div>
         </div>
       </div>
     );
   }

   if (state === 'ERROR') {
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

   const userRole = membership?.role;
   
   if ((state === 'READY' || state === 'AUTHENTICATED') && !company) {
     return (
       <div className="flex h-screen items-center justify-center bg-background">
         <div className="flex flex-col items-center gap-4 text-center">
           <Loader2 className="h-8 w-8 text-primary animate-spin" />
           <div className="space-y-1">
             <p className="text-sm font-bold">Sincronizando Workspace...</p>
             <p className="text-xs text-muted-foreground">Estabelecendo conexão segura com seu tenant.</p>
           </div>
         </div>
       </div>
     );
   }

   return (
     <SidebarProvider>
       <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen relative z-0 pointer-events-auto">
          <Topbar />
          <main className="flex-1 p-4 md:p-6 bg-background/50">
            <div className="max-w-7xl mx-auto">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
       <CommandPalette />
     </SidebarProvider>
  );
}
