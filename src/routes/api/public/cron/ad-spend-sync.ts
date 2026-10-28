import { createFileRoute } from '@tanstack/react-router';
import { autorizarCron, respostaDeRecusa } from '@/lib/cron.server';

/**
 * Importa o gasto por anúncio de todas as empresas que escolheram uma conta.
 *
 * Uma vez por dia basta, mas a janela é de 7 dias de propósito: a Meta revisa o
 * gasto dos últimos dias (cobrança, estornos, tráfego inválido), e reimportar a
 * semana mantém o número do relatório igual ao do Gerenciador de Anúncios.
 */

const JANELA_DIARIA_EM_DIAS = 7;

export const Route = createFileRoute('/api/public/cron/ad-spend-sync')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const autorizacao = autorizarCron(request);
        if (!autorizacao.ok) return respostaDeRecusa(autorizacao);

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { sincronizarGastoDaEmpresa } = await import('@/lib/gasto-sync.server');
        const admin = supabaseAdmin as any;

        const { data: contas, error } = await admin
          .from('meta_assets')
          .select('company_id')
          .eq('asset_type', 'ad_account')
          .eq('is_active', true);
        if (error) return json({ error: error.message }, 500);

        const empresas = [...new Set((contas ?? []).map((c: { company_id: string }) => c.company_id))] as string[];
        const resultados: Array<Record<string, unknown>> = [];
        // Em série: cada empresa já faz várias chamadas à Meta, e paralelizar
        // empresas só aproximaria o limite de requisições do app.
        for (const companyId of empresas) {
          const r = await sincronizarGastoDaEmpresa(admin, companyId, JANELA_DIARIA_EM_DIAS);
          resultados.push({ company_id: companyId, ...r });
          if (!r.ok) {
            console.warn(JSON.stringify({ scope: 'ad-spend-sync', msg: 'sincronizacao_falhou', company_id: companyId, motivo: r.motivo }));
          }
        }
        return json({ empresas: empresas.length, resultados });
      },
    },
  },
});

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
}
