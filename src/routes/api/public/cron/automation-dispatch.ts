import { createFileRoute } from '@tanstack/react-router';

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
}

interface Acao {
  id: string;
  action_type: string;
  config: Record<string, any>;
  sort_order: number;
}

type Resultado = { acao: string; status: 'ok' | 'pulada' | 'falhou'; detalhe?: string };

/** Troca `{{campo}}` pelo valor do payload. Campo ausente vira string vazia. */
function preencher(modelo: string, payload: Record<string, any>): string {
  return modelo.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, chave) => {
    const v = payload[chave];
    return v == null ? '' : String(v);
  });
}

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
        const segredo = process.env.CRON_SECRET || 'altflow_retry_sync_secret';
        if (request.headers.get('authorization') !== `Bearer ${segredo}`) {
          return new Response('Unauthorized', { status: 401 });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const admin = supabaseAdmin as any;

        const { data: pendentes, error } = await admin
          .from('automation_jobs')
          .select('id, company_id, rule_id, trigger_event, lead_id, payload, attempts')
          .eq('status', 'pending')
          // Teto de tentativas: sem ele, uma ação que nunca vai passar — webhook
          // de um domínio que saiu do ar, WhatsApp desconectado — ficaria sendo
          // reenviada para sempre.
          .lt('attempts', MAX_TENTATIVAS)
          .order('created_at', { ascending: true })
          .limit(LOTE);

        if (error) return json({ error: error.message }, 500);
        if (!pendentes?.length) return json({ processados: 0 });

        let feitos = 0;
        let falhas = 0;

        for (const job of pendentes as Job[]) {
          await admin
            .from('automation_jobs')
            .update({ status: 'running', attempts: job.attempts + 1, started_at: new Date().toISOString() })
            .eq('id', job.id);

          const resultados: Resultado[] = [];

          try {
            const { data: acoes } = await admin
              .from('automation_actions')
              .select('id, action_type, config, sort_order')
              .eq('rule_id', job.rule_id)
              .order('sort_order', { ascending: true });

            for (const acao of (acoes ?? []) as Acao[]) {
              resultados.push(await executar(admin, job, acao));
            }

            // Uma ação que falhou derruba o job para nova tentativa. As que
            // deram certo ficam registradas em `resultado` — assim a próxima
            // tentativa é auditável, e não um mistério.
            const algumaFalhou = resultados.some((r) => r.status === 'falhou');

            await admin
              .from('automation_jobs')
              .update({
                status: algumaFalhou ? 'pending' : 'done',
                resultado: resultados,
                last_error: algumaFalhou
                  ? resultados.filter((r) => r.status === 'falhou').map((r) => `${r.acao}: ${r.detalhe}`).join(' | ')
                  : null,
                finished_at: algumaFalhou ? null : new Date().toISOString(),
              })
              .eq('id', job.id);

            if (algumaFalhou) falhas++;
            else feitos++;
          } catch (err) {
            falhas++;
            await admin
              .from('automation_jobs')
              .update({
                status: job.attempts + 1 >= MAX_TENTATIVAS ? 'failed' : 'pending',
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
        const { error } = await admin.from('lead_tags').insert(
          etiquetas.map((t) => ({ lead_id: job.lead_id, company_id: job.company_id, tag_name: t })),
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

      case 'enviar_whatsapp': {
        const { isEvolutionConfigured, sendText } = await import('@/lib/evolution.server');
        if (!isEvolutionConfigured()) {
          return { acao: tipo, status: 'pulada', detalhe: 'Evolution não configurada' };
        }

        const { data: instancia } = await admin
          .from('whatsapp_instances')
          .select('instance_name, status')
          .eq('company_id', job.company_id)
          .maybeSingle();
        if (!instancia?.instance_name || instancia.status !== 'connected') {
          return { acao: tipo, status: 'pulada', detalhe: 'WhatsApp não conectado' };
        }

        // Destino: número fixo da configuração (alerta ao corretor) ou o
        // telefone do próprio lead.
        const destino = String(cfg.para ?? job.payload?.telefone ?? '').trim();
        const texto = preencher(String(cfg.mensagem ?? ''), job.payload ?? {}).trim();
        if (!destino || !texto) {
          return { acao: tipo, status: 'pulada', detalhe: 'sem destino ou sem mensagem' };
        }

        const r = await sendText(instancia.instance_name, destino, texto);
        if (!r.ok) return { acao: tipo, status: 'falhou', detalhe: r.error };

        // Registrado em whatsapp_messages, que é a tela que o cliente audita.
        await admin.from('whatsapp_messages').insert({
          company_id: job.company_id,
          lead_id: job.lead_id,
          direction: 'outbound',
          to_phone: destino,
          body: texto,
          status: 'sent',
          provider_message_id: r.data?.messageId ?? null,
          kind: 'automacao',
        });

        return { acao: tipo, status: 'ok', detalhe: destino };
      }

      case 'webhook': {
        const url = String(cfg.url ?? '').trim();
        if (!/^https:\/\//i.test(url)) {
          return { acao: tipo, status: 'falhou', detalhe: 'url deve ser https' };
        }

        const controlador = new AbortController();
        const prazo = setTimeout(() => controlador.abort(), 10_000);
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(cfg.header_nome && cfg.header_valor
                ? { [String(cfg.header_nome)]: String(cfg.header_valor) }
                : {}),
            },
            body: JSON.stringify({
              evento: job.trigger_event,
              lead_id: job.lead_id,
              dados: job.payload,
            }),
            signal: controlador.signal,
          });
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
