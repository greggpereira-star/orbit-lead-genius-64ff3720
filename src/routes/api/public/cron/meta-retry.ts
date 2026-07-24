import { createFileRoute } from '@tanstack/react-router';
import { importMetaFormLeads } from '@/lib/meta-forms.functions';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/cron/meta-retry')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get('Authorization');
        
        // Simples proteção por Bearer token (deve ser configurado no pg_cron)
        const CRON_SECRET = process.env.CRON_SECRET || 'altflow_retry_sync_secret';
        
        if (authHeader !== `Bearer ${CRON_SECRET}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          // Tabela correta é meta_lead_import_jobs (meta_import_jobs nunca existiu —
          // isso fazia essa query falhar com "relation does not exist" toda vez,
          // então nenhum job falho jamais foi reprocessado). Também limita por
          // retry_count pra não tentar pra sempre um job com falha permanente
          // (token revogado, formulário removido, etc.) — usando any pra ignorar
          // tipos incompletos no schema.
          const MAX_RETRY_ATTEMPTS = 5;
          const { data: jobs, error } = await (supabaseAdmin as any)
            .from('meta_lead_import_jobs')
            .select('*')
            .in('status', ['failed', 'completed_with_errors'])
            .lt('retry_count', MAX_RETRY_ATTEMPTS)
            .gte('created_at', new Date(Date.now() - 86400000).toISOString())
            .limit(10);

          if (error) throw error;
          if (!jobs || jobs.length === 0) {
            return new Response(JSON.stringify({ message: 'No failed jobs to retry' }), { status: 200 });
          }

          const results = [];
          for (const job of jobs) {
            try {
              const importRes = await importMetaFormLeads({
                data: {
                  formId: job.form_id,
                  since: job.since,
                  until: job.until,
                  limit: 200
                }
              });
              results.push({ job_id: job.id, status: 'retried', result: importRes });
            } catch (jobErr: any) {
              results.push({ job_id: job.id, status: 'failed_retry', error: jobErr.message });
            } finally {
              // Incrementa sempre (sucesso ou falha) — o job original já foi
              // atualizado pra 'completed'/'failed' dentro de importMetaFormLeads;
              // aqui só contabilizamos a tentativa pra não retentar pra sempre.
              await (supabaseAdmin as any)
                .from('meta_lead_import_jobs')
                .update({ retry_count: (job.retry_count ?? 0) + 1 })
                .eq('id', job.id);
            }
          }

          return new Response(JSON.stringify({ results }), { status: 200 });
        } catch (err: any) {
          console.error('[cron-meta-retry] error:', err);
          return new Response(JSON.stringify({ error: err.message }), { status: 500 });
        }
      }
    }
  }
});
