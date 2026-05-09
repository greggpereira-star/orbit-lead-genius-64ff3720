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
}

export const runInfrastructureCheck = async (): Promise<HealthReport> => {
  const report: HealthReport = {
    status: 'healthy',
    checks: { env: false, auth: false, database: false, storage: false },
    details: {},
    timestamp: new Date().toISOString(),
  };

  try {
    const config = getRuntimeConfig();
    report.checks.env = true;

    const authRes = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: config.supabaseAnonKey }
    });
    report.checks.auth = authRes.ok;
    if (!authRes.ok) report.details.auth = `Auth failed with status: ${authRes.status}`;

    const dbRes = await fetch(`${config.supabaseUrl}/rest/v1/?apikey=${config.supabaseAnonKey}`, {
      method: 'HEAD'
    });
    report.checks.database = dbRes.ok;
    if (!dbRes.ok) report.details.database = `Database REST failed with status: ${dbRes.status}`;

    if (!report.checks.auth || !report.checks.database) {
      report.status = report.checks.auth || report.checks.database ? 'degraded' : 'unhealthy';
    }

  } catch (err: any) {
    report.status = 'unhealthy';
    report.details.error = err.message;
  }

  return report;
};
