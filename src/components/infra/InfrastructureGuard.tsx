import React, { useEffect, useState } from 'react';
import { runInfrastructureCheck, HealthReport } from '@/core/runtime/health-checker';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const InfrastructureGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [isChecking, setIsChecking] = useState(true);

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
            <p className="text-center text-[10px] text-muted-foreground italic">
              Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in project settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
