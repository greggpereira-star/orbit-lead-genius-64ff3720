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
     const authRes = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
       headers: { apikey: config.supabaseAnonKey },
       signal: AbortSignal.timeout(5000)
     });
     report.latency.auth = Math.round(performance.now() - startAuth);
     report.checks.auth = authRes.ok;
     if (!authRes.ok) report.details.auth = `Auth failed with status: ${authRes.status}`;
 
     const startDb = performance.now();
     const dbRes = await fetch(`${config.supabaseUrl}/rest/v1/?apikey=${config.supabaseAnonKey}`, {
       method: 'HEAD',
       signal: AbortSignal.timeout(5000)
     });
     report.latency.database = Math.round(performance.now() - startDb);
     report.checks.database = dbRes.ok;
     if (!dbRes.ok) report.details.database = `Database REST failed with status: ${dbRes.status}`;
 
     if (!report.checks.auth || !report.checks.database) {
       report.status = report.checks.auth || report.checks.database ? 'degraded' : 'unhealthy';
     }
   } catch (err: any) {
     report.status = 'unhealthy';
     report.details.error = err.name === 'TimeoutError' ? "Connection Timeout" : err.message;
   }

  return report;
};
