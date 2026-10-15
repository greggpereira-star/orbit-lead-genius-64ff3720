import { createFileRoute } from '@tanstack/react-router';
import { autorizarCron, respostaDeRecusa } from '@/lib/cron.server';
import { executarAcoes, type ResultadoDeAcao } from '@/lib/automacao/executarAcoes';
import { acaoAtribuirConversa, acaoEnviarWhatsApp, preencher } from '@/lib/automacao/acoesDeWhatsApp';

/**
 * Executa a fila de automação.
 *
 * Roda separado do gatilho pelo mesmo motivo do despacho de conversão: as ações
 * precisam de segredo (chave da Evolution, webhook do cliente) que não pode
 * viver no navegador, e chamar API externa dentro da transação do lead
 * prenderia a gravação na latência da rede. O gatilho enfileira em
 * microssegundos; aqui é onde pode demorar e falhar.
 *
 * Antes disto havia dois "motores" no cliente — `automationService` e
 * `automationEngine` — consultando tabelas que não existiam, sem conferir o
 * erro, e saindo calados a cada captura.
 */

const LOTE = 25;
const MAX_TENTATIVAS = 4;

interface Job {
  id: string;
  company_id: string;
  rule_id: string;
  trigger_event: string;
  lead_id: string | null;
  payload: Record<string, any>;
  attempts: number;
  /** Resultado da tentativa anterior: o que já deu certo não se repete. */
  resultado?: ResultadoDeAcao[] | null;
}

interface Acao {
  id: string;
  action_type: string;
  config: Record<string, any>;
  sort_order: number;
}

type Resultado = { acao: string; status: 'ok' | 'pulada' | 'falhou'; detalhe?: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export const Route = createFileRoute('/api/public/cron/automation-dispatch')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const autorizacao = autorizarCron(request);
        if (!autorizacao.ok) return respostaDeRecusa(autorizacao);

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const admin = supabaseAdmin as any;

        // Job que caiu no meio de uma execução ficava `running` para sempre (a
        // consulta só lia `pending`) e a mensagem sumia sem aviso.
        await admin.rpc('liberar_jobs_de_automacao_presos', { p_minutos: 10 });

        const { pendentes, erro } = await reservarJobs(admin);
        if (erro) return json({ error: erro }, 500);
        if (!pendentes.length) return json({ processados: 0 });

        let feitos = 0;
        let falhas = 0;

        for (const job of pendentes) {
          let resultados: ResultadoDeAcao[] = [];

          try {
            // Filtra pela empresa do JOB: a ação de uma regra de outra empresa
            // (inserida com `rule_id` alheio) nunca roda com o número desta.
            const { data: acoes } = await admin
              .from('automation_actions')
              .select('id, action_type, config, sort_order')
              .eq('rule_id', job.rule_id)
              .eq('company_id', job.company_id)
              .order('sort_order', { ascending: true });

            const saida = await executarAcoes(
              (acoes ?? []) as Acao[],
              job.resultado,
              (acao) => executar(admin, job, acao as Acao),
              // Grava cada resultado no ato (melhor esforço).
              async (parciais) => {
                await admin.from('automation_jobs').update({ resultado: parciais }).eq('id', job.id);
              },
            );
            resultados = saida.resultados;

            // Uma ação que falhou derruba o job para nova tentativa. As que
            // deram certo ficam registradas em `resultado` — assim a próxima
            // tentativa é auditável, e não um mistério.
            const algumaFalhou = saida.algumaFalhou;
            // Esgotada a última tentativa, o job vira 'failed' e não 'pending'.
            // Deixá-lo em 'pending' faria a tela dizer "na fila" para sempre,
            // porque a consulta do lote filtra por `attempts < MAX_TENTATIVAS`
            // e ele nunca mais seria escolhido.
            const esgotou = job.attempts >= MAX_TENTATIVAS;
            const status = !algumaFalhou ? 'done' : esgotou ? 'failed' : 'pending';

            await admin
              .from('automation_jobs')
              .update({
                status,
                resultado: resultados,
                last_error: algumaFalhou
                  ? resultados.filter((r) => r.status === 'falhou').map((r) => `${r.acao}: ${r.detalhe}`).join(' | ')
                  : null,
                finished_at: status === 'pending' ? null : new Date().toISOString(),
              })
              .eq('id', job.id);

            if (algumaFalhou) falhas++;
            else feitos++;
          } catch (err) {
            falhas++;
            await admin
              .from('automation_jobs')
              .update({
                status: job.attempts >= MAX_TENTATIVAS ? 'failed' : 'pending',
                last_error: err instanceof Error ? err.message : String(err),
                resultado: resultados,
              })
              .eq('id', job.id);
          }
        }

        return json({ processados: pendentes.length, feitos, falhas });
      },
    },
  },
});

/**
 * Reserva os jobs de forma ATÔMICA no banco (`FOR UPDATE SKIP LOCKED`).
 *
 * O despachante lia os pendentes e só depois marcava `running`, sem conferir que
 * ainda estavam pendentes: duas execuções simultâneas pegavam os mesmos jobs e o
 * lead recebia a mensagem em dobro.
 *
 * Se a função ainda não existe (código implantado antes da migração), cai no
 * caminho antigo em vez de parar a automação — e avisa no log.
 */
async function reservarJobs(admin: any): Promise<{ pendentes: Job[]; erro?: string }> {
  const r = await admin.rpc('reservar_jobs_de_automacao', { p_limite: LOTE });
  if (!r.error) return { pendentes: (r.data ?? []) as Job[] };

  const ausente = r.error.code === 'PGRST202' || r.error.code === '42883' || /does not exist|Could not find/i.test(r.error.message ?? '');
  if (!ausente) return { pendentes: [], erro: r.error.message };

  console.warn(JSON.stringify({ scope: 'automation-dispatch', msg: 'reserva_atomica_ausente', aviso: 'aplicar a migração endurecer_acessos' }));
  const { data, error } = await admin
    .from('automation_jobs')
    .select('id, company_id, rule_id, trigger_event, lead_id, payload, attempts, resultado')
    .eq('status', 'pending')
    .lt('attempts', MAX_TENTATIVAS)
    .order('created_at', { ascending: true })
    .limit(LOTE);
  if (error) return { pendentes: [], erro: error.message };
  const jobs = (data ?? []) as Job[];
  for (const j of jobs) {
    await admin
      .from('automation_jobs')
      .update({ status: 'running', attempts: j.attempts + 1, started_at: new Date().toISOString() })
      .eq('id', j.id)
      .eq('status', 'pending');
    j.attempts += 1;
  }
  return { pendentes: jobs };
}

async function executar(admin: any, job: Job, acao: Acao): Promise<Resultado> {
  const cfg = acao.config ?? {};
  const tipo = acao.action_type;

  try {
    switch (tipo) {
      case 'etiquetar': {
        const etiquetas: string[] = Array.isArray(cfg.etiquetas)
          ? cfg.etiquetas.filter((t: unknown) => typeof t === 'string' && t.trim())
          : [];
        if (!job.lead_id || !etiquetas.length) {
          return { acao: tipo, status: 'pulada', detalhe: 'sem lead ou sem etiqueta' };
        }
        /* ignoreDuplicates: a etiqueta repetida (re-execução, ou o lead já a
           tinha) não pode derrubar a ação nem as etiquetas novas junto. */
        const { error } = await admin.from('lead_tags').upsert(
          etiquetas.map((t) => ({ lead_id: job.lead_id, company_id: job.company_id, tag_name: t })),
          { onConflict: 'lead_id,tag_name', ignoreDuplicates: true },
        );
        if (error) return { acao: tipo, status: 'falhou', detalhe: error.message };
        return { acao: tipo, status: 'ok', detalhe: etiquetas.join(', ') };
      }

      case 'mover_etapa': {
        if (!job.lead_id || !cfg.stage_id) {
          return { acao: tipo, status: 'pulada', detalhe: 'sem lead ou sem etapa' };
        }
        // Confere que a etapa é da MESMA empresa. Sem isto um id de etapa
        // colado de outra conta moveria o lead para um funil que não é dele.
        const { data: etapa } = await admin
          .from('stages')
          .select('id')
          .eq('id', cfg.stage_id)
          .eq('company_id', job.company_id)
          .maybeSingle();
        if (!etapa) return { acao: tipo, status: 'falhou', detalhe: 'etapa não é desta empresa' };

        const { error } = await admin
          .from('leads')
          .update({ stage_id: cfg.stage_id, stage_entered_at: new Date().toISOString() })
          .eq('id', job.lead_id)
          .eq('company_id', job.company_id);
        if (error) return { acao: tipo, status: 'falhou', detalhe: error.message };
        return { acao: tipo, status: 'ok' };
      }

      case 'atribuir_responsavel': {
        if (!job.lead_id) return { acao: tipo, status: 'pulada', detalhe: 'sem lead' };
        let userId: string | null = cfg.user_id ?? null;

        // Sem usuário fixo, usa o rodízio que já existe no banco.
        if (!userId && cfg.routing_config_id) {
          const { data } = await admin.rpc('pick_next_routing_member', {
            p_config_id: cfg.routing_config_id,
            p_prefer_top: Boolean(cfg.prefer_top),
          });
          userId = (data as string | null) ?? null;
        }
        if (!userId) return { acao: tipo, status: 'pulada', detalhe: 'nenhum responsável resolvido' };

        // O responsável precisa ser membro da empresa.
        const { data: membro } = await admin
          .from('memberships')
          .select('user_id')
          .eq('company_id', job.company_id)
          .eq('user_id', userId)
          .maybeSingle();
        if (!membro) return { acao: tipo, status: 'falhou', detalhe: 'responsável não é da empresa' };

        const { error } = await admin
          .from('leads')
          .update({ assigned_to: userId })
          .eq('id', job.lead_id)
          .eq('company_id', job.company_id);
        if (error) return { acao: tipo, status: 'falhou', detalhe: error.message };
        return { acao: tipo, status: 'ok', detalhe: userId };
      }

      case 'enviar_whatsapp':
      case 'enviar_template':
        return acaoEnviarWhatsApp(admin, job, cfg, tipo);

      case 'atribuir_conversa':
        return acaoAtribuirConversa(admin, job, cfg);

      case 'webhook': {
        // O destino é entrada não confiável (configurado por membro) e o
        // SERVIDOR faz a chamada: https, sem usuário/senha, sem endereço interno
        // (inclusive o que o nome resolve) e sem seguir redirecionamento.
        const { validarDestinoDeWebhook, cabecalhoPermitido } = await import('@/lib/redeSegura.server');
        const destino = await validarDestinoDeWebhook(String(cfg.url ?? '').trim());
        if (!destino.ok) {
          return { acao: tipo, status: 'falhou', detalhe: destino.motivo };
        }

        const nome = String(cfg.header_nome ?? '').trim();
        const extra: Record<string, string> =
          nome && cfg.header_valor && cabecalhoPermitido(nome)
            ? { [nome]: String(cfg.header_valor).replace(/[\r\n]/g, ' ') }
            : {};

        const controlador = new AbortController();
        const prazo = setTimeout(() => controlador.abort(), 10_000);
        try {
          const res = await fetch(destino.url, {
            method: 'POST',
            redirect: 'manual',
            headers: { ...extra, 'content-type': 'application/json' },
            body: JSON.stringify({
              evento: job.trigger_event,
              lead_id: job.lead_id,
              dados: job.payload,
            }),
            signal: controlador.signal,
          });
          if (res.status >= 300 && res.status < 400) {
            // O redirecionamento poderia levar para dentro da rede: não se segue.
            return { acao: tipo, status: 'falhou', detalhe: 'o destino respondeu com redirecionamento' };
          }
          if (!res.ok) {
            return { acao: tipo, status: 'falhou', detalhe: `HTTP ${res.status}` };
          }
          return { acao: tipo, status: 'ok', detalhe: `HTTP ${res.status}` };
        } finally {
          clearTimeout(prazo);
        }
      }

      default:
        // Não deveria acontecer: o `check` da tabela fecha o vocabulário.
        return { acao: tipo, status: 'falhou', detalhe: 'tipo de ação desconhecido' };
    }
  } catch (err) {
    return { acao: tipo, status: 'falhou', detalhe: err instanceof Error ? err.message : String(err) };
  }
}
