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

interface RespostaSonda { ok: boolean; status: number; error?: string }

/**
 * Uma sonda com direito a segunda chance.
 *
 * A primeira versão declarava o app inteiro fora do ar na primeira falha, e o
 * estado ficava travado — só o botão "Tentar reconectar" saía de lá. O caso
 * comum não era queda de infraestrutura: era aba em segundo plano. O navegador
 * suspende a aba, o `AbortSignal.timeout` continua contando o tempo parado, e
 * as duas sondas abortam juntas no retorno. Do lado de fora, isso é
 * indistinguível de um servidor morto — e o usuário voltava para uma tela de
 * diagnóstico com o CRM funcionando perfeitamente atrás dela.
 *
 * Uma repetição resolve isso sem mascarar problema de verdade: se a API está
 * mesmo fora, as duas tentativas falham e o relatório continua honesto. O
 * limite subiu para 8s porque 5s é apertado para uma conexão móvel fria.
 */
async function sondar(url: string, headers: Record<string, string>): Promise<RespostaSonda> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      // Resposta do servidor, mesmo que de erro, já é sinal de que ele está de
      // pé; só repetimos quando não houve resposta nenhuma.
      if (tentativa === 1) {
        return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  return { ok: false, status: 0, error: 'inalcançável' };
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
      // `apikey` sozinho passa pelo Kong mas não define o papel no PostgREST.
      // O cliente do Supabase manda os dois em toda requisição; a sonda tem
      // que mandar também, senão não está medindo o mesmo caminho que o app usa.
      const headers = {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
      };
       const [authRes, dbRes] = await Promise.all([
        sondar(`${config.supabaseUrl}/auth/v1/health`, headers),
         // `quiz_funnels`, não `companies`.
         //
         // O papel `anon` não tem privilégio em `companies` — e não deve ter:
         // é a tabela dos assinantes. A sonda antiga levava 401 (Postgres
         // 42501) em toda carga de página, o que deixava `database: false`
         // permanentemente. O sistema ficava pendurado num único check vivo, e
         // qualquer soluço dele derrubava o app inteiro para `unhealthy`.
         // `quiz_funnels` é o que o visitante realmente lê, então responder
         // 200 aqui significa que o caminho que importa está de pé.
         sondar(`${config.supabaseUrl}/rest/v1/quiz_funnels?select=id&limit=1`, headers),
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
