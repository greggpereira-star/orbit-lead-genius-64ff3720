 import React, { useEffect, useState, useMemo } from 'react';
 import { useRouterState } from '@tanstack/react-router';
import { runInfrastructureCheck, HealthReport } from '@/core/runtime/health-checker';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';

 export const InfrastructureGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
   const [report, setReport] = useState<HealthReport | null>(null);
   const [isChecking, setIsChecking] = useState(true);
   const routerState = useRouterState();
   
   // Paths that don't require infrastructure to be healthy (e.g. landing page)
   const isBypassPath = useMemo(() => {
     const bypassList = ['/'];
     return bypassList.includes(routerState.location.pathname);
   }, [routerState.location.pathname]);

  const check = async () => {
    setIsChecking(true);
    const result = await runInfrastructureCheck();
    setReport(result);
    setIsChecking(false);
  };

  useEffect(() => {
    check();
  }, []);

  if (isChecking) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background space-y-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary" />
        <p className="text-sm font-medium animate-pulse">Validating Infrastructure Integrity...</p>
      </div>
    );
  }

   // If healthy, or it's a bypass path, or it's just degraded, let it through
   if (report?.status === 'healthy' || report?.status === 'degraded' || (report?.status === 'unhealthy' && isBypassPath)) {
     return <>{children}</>;
   }
 
   if (report?.status === 'unhealthy') {
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

          <div className="space-y-4 bg-destructive/10 p-4 rounded-xl font-mono text-xs overflow-auto">
            <div className="flex justify-between border-b border-destructive/10 pb-2">
              <span className="text-destructive/80 font-bold">ENVIRONMENT (ENV)</span>
              <span className={report.checks.env ? "text-emerald-600" : "text-destructive font-black"}>{report.checks.env ? "PASSED" : "FAILED"}</span>
            </div>
            <div className="flex justify-between border-b border-destructive/10 pb-2">
              <span className="text-destructive/80 font-bold">SUPABASE AUTH</span>
              <span className={report.checks.auth ? "text-emerald-600" : "text-destructive font-black"}>{report.checks.auth ? "CONNECTED" : "UNREACHABLE"}</span>
            </div>
            <div className="flex justify-between border-b border-destructive/10 pb-2">
              <span className="text-destructive/80 font-bold">SUPABASE DATABASE</span>
              <span className={report.checks.database ? "text-emerald-600" : "text-destructive font-black"}>{report.checks.database ? "CONNECTED" : "UNREACHABLE"}</span>
            </div>
            {report.details.error && (
              <div className="pt-2 text-destructive font-bold break-all">
                ERROR: {report.details.error}
              </div>
            )}
          </div>

           <div className="space-y-4">
             <Button onClick={check} className="w-full h-12 font-bold shadow-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors">
               <RefreshCw className="mr-2 h-4 w-4" /> RE-VALIDATE INFRASTRUCTURE
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
