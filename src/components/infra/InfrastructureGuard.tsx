 import React, { useEffect, useState, useMemo } from 'react';
 import { useRouterState } from '@tanstack/react-router';
 import { BootstrapEngine, BootstrapState } from '@/core/bootstrap/bootstrap-engine';
 import { RefreshCw, ServerCrash, CheckCircle2, XCircle, ShieldCheck, Activity, AlertTriangle } from 'lucide-react';
 import { Badge } from '@/components/ui/badge';
 import { getRuntimeConfig } from '@/core/config/runtime-config';
import { Button } from '@/components/ui/button';

 export const InfrastructureGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [state, setState] = useState<BootstrapState>(BootstrapEngine.getState());
   const routerState = useRouterState();
   
   useEffect(() => {
     const unsubscribe = BootstrapEngine.subscribe(setState);
     BootstrapEngine.run();
     return unsubscribe;
   }, []);
 
   const isBypassPath = useMemo(() => {
     const bypassList = ['/', '/auth', '/login', '/signup'];
     return bypassList.includes(routerState.location.pathname);
   }, [routerState.location.pathname]);
 
   const isChecking = state.status !== 'ready' && state.status !== 'failed';
 
   if (isChecking) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background space-y-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium animate-pulse">Validating Infrastructure Integrity...</p>
      </div>
    );
  }

   if (state.status === 'ready' || (state.status === 'failed' && isBypassPath) || state.health?.status === 'degraded') {
     return <>{children}</>;
   }
 
   if (state.status === 'failed') {
     const config = state.config;
     const report = state.health;
 
     return (
      <div className="min-h-screen w-full bg-destructive/5 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-background border border-destructive/20 rounded-2xl shadow-2xl p-8 space-y-8">
          <div className="flex items-center gap-4 text-destructive">
            <ServerCrash className="h-12 w-12" />
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter text-destructive">System Configuration Failure</h1>
              <p className="text-sm font-medium opacity-80 text-destructive/80">Root Infrastructure Offline</p>
            </div>
          </div>

           <div className="space-y-6">
             <div className="grid gap-4">
               <div className="p-4 rounded-xl border bg-muted/30 space-y-3">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                     <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Variavéis de Ambiente</span>
                   </div>
                   <Badge variant={config.isValid ? "default" : "destructive"}>
                     {config.isValid ? "Configuradas" : "Ausentes"}
                   </Badge>
                 </div>
                 <div className="space-y-2 font-mono text-[10px]">
                   {config && (
                     <>
                       <div className="flex items-center justify-between text-muted-foreground">
                         <span>URL:</span>
                         <span className="truncate max-w-[200px]">{config.supabaseUrl}</span>
                       </div>
                       <div className="flex items-center justify-between text-muted-foreground">
                         <span>ENV:</span>
                         <span className="uppercase">{config.environment}</span>
                       </div>
                     </>
                   )}
                   <div className="flex items-center justify-between text-muted-foreground">
                     <span>ANON_KEY:</span>
                     <span>{config.supabaseAnonKey === 'placeholder-key' ? 'MISSING' : '********'}</span>
                   </div>
                 </div>
               </div>

               <div className="p-4 rounded-xl border bg-muted/30 space-y-4">
                 <div className="flex items-center gap-2">
                   <Activity className="h-4 w-4 text-muted-foreground" />
                   <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Status da Conexão</span>
                 </div>
                 
                 <div className="space-y-3">
                   <div className="flex items-center justify-between text-sm">
                     <span className="text-muted-foreground">Autenticação (Auth):</span>
                     {report.checks.auth ? (
                       <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                         <CheckCircle2 className="h-4 w-4" /> ATIVA
                       </span>
                     ) : (
                       <span className="flex items-center gap-1.5 text-destructive font-bold">
                         <XCircle className="h-4 w-4" /> FALHOU
                       </span>
                     )}
                   </div>
                   <div className="flex items-center justify-between text-sm">
                     <span className="text-muted-foreground">Banco de Dados (DB):</span>
                     {report.checks.database ? (
                       <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                         <CheckCircle2 className="h-4 w-4" /> ATIVO
                       </span>
                     ) : (
                       <span className="flex items-center gap-1.5 text-destructive font-bold">
                         <XCircle className="h-4 w-4" /> FALHOU
                       </span>
                     )}
                   </div>
                 </div>
               </div>
             </div>

             {report.details.error && (
               <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                 <p className="text-[11px] font-mono text-destructive leading-relaxed break-all">
                   <span className="font-bold">STACK_TRACE:</span> {report.details.error}
                 </p>
               </div>
             )}
           </div>

           <div className="space-y-4">
             <Button 
               onClick={() => BootstrapEngine.retry()} 
               disabled={isChecking}
               className="w-full h-12 font-bold shadow-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all active:scale-95"
             >
               <RefreshCw className={`mr-2 h-4 w-4 ${isChecking ? 'animate-spin' : ''}`} /> 
               {isChecking ? 'REINICIANDO RUNTIME...' : 'TENTAR RECONECTAR AGORA'}
             </Button>
             
             <div className="p-4 bg-muted rounded-lg border text-[11px] space-y-2">
               <p className="font-bold uppercase">Como resolver:</p>
               <ul className="list-disc pl-4 space-y-1 opacity-80">
                 <li>Verifique se o seu saldo no Lovable Cloud não expirou.</li>
                 <li>Certifique-se de que a integração Supabase está habilitada no painel.</li>
                 <li>Se estiver usando um projeto próprio, configure as chaves <code className="bg-background px-1">VITE_SUPABASE_URL</code> e <code className="bg-background px-1">VITE_SUPABASE_ANON_KEY</code>.</li>
               </ul>
             </div>
             
             <p className="text-center text-[10px] text-muted-foreground italic">
               A infraestrutura é necessária para autenticação e persistência de dados.
             </p>
           </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
