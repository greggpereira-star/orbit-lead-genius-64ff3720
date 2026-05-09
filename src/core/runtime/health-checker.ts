import { getRuntimeConfig } from '../config/runtime-config';

export interface HealthReport {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    env: boolean;
    auth: boolean;
    database: boolean;
    storage: boolean;
  };
   details: Record<string, string | null>;
   timestamp: string;
   latency: Record<string, number>;
 }

export const runInfrastructureCheck = async (): Promise<HealthReport> => {
  const report: HealthReport = {
    status: 'healthy',
    checks: { env: false, auth: false, database: false, storage: false },
    details: {},
     timestamp: new Date().toISOString(),
     latency: {},
   };

   try {
     const config = getRuntimeConfig();
     report.checks.env = config.isValid;
 
     if (!config.isValid || !config.supabaseUrl) {
       report.status = 'unhealthy';
       report.details.error = "Configuration missing: " + (config.errors?.join(', ') || 'VITE_SUPABASE_URL not found');
       return report;
     }
 
     const startAuth = performance.now();
      const [authRes, dbRes] = await Promise.all([
        fetch(`${config.supabaseUrl}/auth/v1/health`, {
          headers: { apikey: config.supabaseAnonKey },
          signal: AbortSignal.timeout(5000)
        }).catch(err => ({ ok: false, status: 0, error: err.message })),
        fetch(`${config.supabaseUrl}/rest/v1/?apikey=${config.supabaseAnonKey}`, {
          method: 'HEAD',
          signal: AbortSignal.timeout(5000)
        }).catch(err => ({ ok: false, status: 0, error: err.message }))
      ]);

      report.latency.auth = Math.round(performance.now() - startAuth);
      report.checks.auth = (authRes as any).ok;
      if (!(authRes as any).ok) report.details.auth = `Auth failed: ${(authRes as any).status || (authRes as any).error}`;

      report.checks.database = (dbRes as any).ok;
      if (!(dbRes as any).ok) report.details.database = `Database failed: ${(dbRes as any).status || (dbRes as any).error}`;
 
     if (!report.checks.auth || !report.checks.database) {
       report.status = report.checks.auth || report.checks.database ? 'degraded' : 'unhealthy';
     }
   } catch (err: any) {
     report.status = 'unhealthy';
     report.details.error = err.name === 'TimeoutError' ? "Connection Timeout" : err.message;
   }

  return report;
};
