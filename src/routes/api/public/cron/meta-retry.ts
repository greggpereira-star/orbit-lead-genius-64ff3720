import { createFileRoute } from '@tanstack/react-router';
import { listMetaImportJobs, retryMetaImportJob, importMetaFormLeads } from '@/lib/meta-forms.functions';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const Route = createFileRoute('/api/public/cron/meta-retry')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get('Authorization');
        
        // Simples proteção por Bearer token (deve ser configurado no pg_cron)
        // No mundo real, use um segredo mais forte vindo de env
        const CRON_SECRET = process.env.CRON_SECRET || 'altflow_retry_sync_secret';
        
        if (authHeader !== `Bearer ${CRON_SECRET}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        try {
          // 1. Buscar jobs falhos nas últimas 24h
          const { data: jobs, error } = await supabaseAdmin
            .from('meta_import_jobs')
            .select('*')
            .in('status', ['failed', 'completed_with_errors'])
            .gte('created_at', new Date(Date.now() - 86400000).toISOString())
            .limit(10); // Processar em pequenos lotes

          if (error) throw error;
          if (!jobs || jobs.length === 0) {
            return new Response(JSON.stringify({ message: 'No failed jobs to retry' }), { status: 200 });
          }

          const results = [];
          for (const job of jobs) {
            // Re-importar usando os parâmetros originais
            // Note: Usamos o service_role via importMetaFormLeads se ele for configurado para tal,
            // ou injetamos o admin client. No caso aqui, as server functions usam RLS, 
            // então precisamos de um handler que use supabaseAdmin.
            
            // Vamos implementar a lógica de retry diretamente com o admin client para garantir sucesso
            const importRes = await importMetaFormLeads({
              data: {
                formId: job.form_id,
                since: job.since,
                until: job.until,
                limit: 200
              }
            });
            
            results.push({ job_id: job.id, status: 'retried', result: importRes });
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
