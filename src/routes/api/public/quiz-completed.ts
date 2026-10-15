import { createFileRoute } from '@tanstack/react-router';

/**
 * Fim do quiz: classifica o lead na faixa e dispara o WhatsApp da faixa.
 *
 * Roda no servidor por dois motivos que o navegador não resolve. A chave da
 * Evolution não pode chegar ao visitante, e a faixa não pode ser decidida por
 * ele — quem manda a pontuação é a página, e aceitar a faixa junto seria deixar
 * qualquer pessoa se declarar Lead A. O TETO e o PISO saem do schema publicado;
 * a pontuação em si vem da página — um visitante pode, no máximo, escolher a
 * faixa da MENSAGEM QUE ELE MESMO recebe, e não a de outra pessoa: o número de
 * destino é o do lead da sessão, nunca o do corpo da requisição, e há uma
 * mensagem por lead a cada 24h.
 */

interface Payload {
  quizId?: string;
  /** Sessão da resposta. O lead é encontrado por ela — id vindo do navegador não é fonte confiável. */
  sessionId?: string;
  score?: number;
  nome?: string;
  telefone?: string;
  /** Respostas exportadas como variáveis, para interpolar na mensagem. */
  variaveis?: Record<string, string>;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'content-type': 'application/json' } });

/** Troca `{{nome}}` pelo valor. Chave sem valor vira string vazia, nunca `{{nome}}` cru na mensagem. */
function interpolar(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => vars[k] ?? '');
}

/**
 * Atribui responsável ao lead do quiz.
 *
 * Isto rodava no navegador, dentro de `submitPublic`, e nunca funcionou uma
 * vez sequer: `routing_configs` e `lead_events` não têm grant para `anon`, e
 * as duas leituras voltavam 401. Como estavam dentro de um try/catch que só
 * avisava no console, o sintoma era um lead de quiz que simplesmente nascia
 * sem dono — sem erro visível em lugar nenhum.
 */
async function atribuirResponsavel(
  admin: { from: (t: string) => any; rpc: (f: string, a: unknown) => Promise<{ data: unknown }> },
  leadId: string,
  companyId: string,
  temperature: string | null,
): Promise<string | null> {
  const { data: cfg } = await admin
    .from('routing_configs')
    .select('id, strategy, fallback_user_id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();
  if (!cfg) return null;

  const c = cfg as { id: string; strategy: string; fallback_user_id: string | null };
  const preferTop = c.strategy === 'performance' || (c.strategy === 'hybrid' && temperature === 'hot');

  const { data: escolhido } = await admin.rpc('pick_next_routing_member', {
    p_config_id: c.id,
    p_prefer_top: preferTop,
  });

  const assignee = (escolhido as string | null) ?? c.fallback_user_id;
  if (!assignee) return null;

  await admin.from('leads').update({ assigned_to: assignee }).eq('id', leadId);
  await admin.from('lead_events').insert({
    lead_id: leadId,
    event_type: 'lead_assigned',
    description: `Lead atribuído (${c.strategy}${temperature ? ` · ${temperature}` : ''})`,
    metadata: { assigned_to: assignee, strategy: c.strategy, temperature },
  });
  return assignee;
}

export const Route = createFileRoute('/api/public/quiz-completed')({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        let body: Payload;
        try { body = (await request.json()) as Payload; }
        catch { return json({ error: 'invalid_json' }, 400); }

        if (!body.quizId) return json({ error: 'missing_quiz' }, 400);

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

        const { data: quiz } = await supabaseAdmin
          .from('quiz_funnels')
          .select('company_id, settings, published_version_id')
          .eq('id', body.quizId)
          .maybeSingle();
        if (!quiz) return json({ error: 'unknown_quiz' }, 404);

        const q = quiz as { company_id: string; settings: Record<string, unknown>; published_version_id: string | null };

        /* O lead é resolvido aqui em cima, e não lá embaixo junto da faixa,
           porque os três `return` de faixa que vêm a seguir são saídas
           legítimas — um quiz sem faixas configuradas não deve custar o
           responsável do lead. */
        let leadDoQuiz: { id: string; metadata: Record<string, unknown> | null; phone: string | null } | null = null;
        if (body.sessionId) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            // `quiz_id` e o filtro por metadata não estão no `types.ts` gerado
            // com essa forma; o cast é só de tipagem, a consulta é válida.
            .select('id, metadata, temperature, assigned_to, phone')
            .eq('quiz_id' as never, body.quizId)
            .eq('metadata->>session_id' as never, body.sessionId)
            .maybeSingle();
          if (lead) {
            const l = lead as { id: string; metadata: Record<string, unknown> | null; temperature: string | null; assigned_to: string | null; phone: string | null };
            leadDoQuiz = { id: l.id, metadata: l.metadata, phone: l.phone };
            // `assigned_to` já preenchido: a captura antecipada e a conclusão
            // chamam esta rota na mesma sessão, e trocar o dono no meio do
            // atendimento é pior do que não rodear de novo.
            if (!l.assigned_to) {
              try {
                await atribuirResponsavel(supabaseAdmin as never, l.id, q.company_id, l.temperature);
              } catch (err) {
                console.error(JSON.stringify({
                  scope: 'quiz-completed', msg: 'roteamento_falhou',
                  lead_id: l.id, erro: err instanceof Error ? err.message : String(err),
                }));
              }
            }

            // Despacho para o CV.CRM, pelo mesmo motivo: `cvcrm_integrations`
            // devolvia 401 para o visitante, então o lead do quiz nunca chegou
            // ao CRM do cliente.
            try {
              const { data: integ } = await supabaseAdmin
                .from('cvcrm_integrations')
                .select('is_active, connection_status')
                .eq('company_id', q.company_id)
                .maybeSingle();
              const i = integ as { is_active?: boolean; connection_status?: string } | null;
              if (i?.is_active && i.connection_status === 'connected') {
                await supabaseAdmin.functions.invoke('send-cvcrm-lead', {
                  body: { lead_id: l.id, tenant_id: q.company_id, trace_id: crypto.randomUUID() },
                });
              }
            } catch (err) {
              console.error(JSON.stringify({
                scope: 'quiz-completed', msg: 'cvcrm_falhou',
                lead_id: l.id, erro: err instanceof Error ? err.message : String(err),
              }));
            }
          }
        }

        const tiers = (q.settings?.score_tiers ?? []) as Array<{
          id: string; label: string; minPercent: number; whatsappTemplate?: string;
        }>;
        if (!tiers.length) return json({ status: 'sem_faixas' });

        // A pontuação máxima sai do schema PUBLICADO, não do que a página disse.
        const { data: versao } = await supabaseAdmin
          .from('quiz_versions')
          .select('schema')
          .eq('id', q.published_version_id ?? '')
          .maybeSingle();

        // A MESMA função que o quiz usa no navegador para pontuar.
        //
        // Tinha um cálculo próprio aqui, e ele estava errado: pegava só a maior
        // opção de cada bloco, inclusive nos de MÚLTIPLA escolha, onde o
        // respondente marca várias. O teto saía menor que o real, todo mundo
        // ficava com percentual inflado e subia de faixa indevidamente — um
        // lead de 34% aparecia como 57%. Duas implementações da mesma regra é
        // como isso acontece; agora existe uma só.
        const { maxPossibleScore, minPossibleScore, scorePercent } = await import('@/modules/quiz/engine');
        const schema = (versao as { schema?: unknown } | null)?.schema;
        /* As RESPOSTAS entram no cálculo do máximo: sem elas, o teto inclui
           blocos que a exibição condicional escondeu deste visitante, o
           percentual sai menor que o real e o lead cai numa faixa mais baixa —
           justamente a faixa que decide a mensagem enviada aqui embaixo.
           Elas vêm do metadata do lead, gravado por `quiz_capture_lead`; sem
           lead resolvido, resta o teto absoluto, que é o comportamento antigo. */
        const respostasDoLead = (leadDoQuiz?.metadata?.responses ?? null) as Record<string, unknown> | null;
        const max = schema
          ? maxPossibleScore(schema as never, respostasDoLead ?? undefined)
          : 0;
        if (max <= 0) return json({ status: 'sem_pontuacao' });

        /* O piso entra na conta: com opção de pontuação negativa, dividir só
           pelo máximo produz percentual negativo, que não bate em faixa
           nenhuma — o lead ficava sem classificação e sem mensagem, calado.
           Em quiz sem negativos o piso é 0 e a conta não muda. */
        const min = schema ? minPossibleScore(schema as never, respostasDoLead ?? undefined) : 0;
        const pct = scorePercent(body.score ?? 0, max, min);
        const faixa = [...tiers].sort((a, b) => b.minPercent - a.minPercent).find((t) => pct >= t.minPercent);
        if (!faixa) return json({ status: 'sem_faixa_correspondente' });

        // Registrado no lead antes do envio: a classificação vale mesmo que o
        // WhatsApp falhe, e é ela que o time comercial usa para priorizar.
        if (leadDoQuiz) {
          await supabaseAdmin
            .from('leads')
            .update({
              metadata: { ...(leadDoQuiz.metadata ?? {}), quiz_tier: faixa.label, quiz_score_pct: Math.round(pct) },
            } as never)
            .eq('id', leadDoQuiz.id);
        }

        /* O número é o do LEAD, nunca o do corpo da requisição.
           Esta rota é pública: aceitar `telefone` do corpo fazia dela um
           disparador de WhatsApp, com o número da empresa, para qualquer
           telefone e qualquer texto que alguém postasse — e sem limite. O lead
           é achado pela sessão e é quem de fato respondeu o quiz. Sem lead, não
           há para quem enviar. */
        const destino = leadDoQuiz?.phone?.trim() || '';
        if (!faixa.whatsappTemplate?.trim() || !destino) {
          return json({ status: 'classificado', faixa: faixa.label, enviou: false });
        }

        /* Uma mensagem por lead a cada 24h. O reclame é atômico (só um dos
           pedidos concorrentes vence): sem isso, 50 chamadas simultâneas liam
           "não enviado" e mandavam 50 mensagens ao mesmo número. */
        const agora = new Date().toISOString();
        const anterior = leadDoQuiz?.metadata?.quiz_tier_sent_at;
        const recente =
          typeof anterior === 'string' &&
          Date.now() - Date.parse(anterior) < 24 * 60 * 60 * 1000;
        if (recente) {
          return json({ status: 'classificado', faixa: faixa.label, enviou: false, motivo: 'ja_enviado' });
        }
        if (leadDoQuiz) {
          const reclamar = supabaseAdmin
            .from('leads')
            .update({
              metadata: { ...(leadDoQuiz.metadata ?? {}), quiz_tier: faixa.label, quiz_tier_sent_at: agora },
            } as never)
            .eq('id', leadDoQuiz.id);
          const { data: venceu } = await (typeof anterior === 'string'
            ? reclamar.eq('metadata->>quiz_tier_sent_at' as never, anterior)
            : reclamar.is('metadata->>quiz_tier_sent_at' as never, null)
          ).select('id');
          if (!venceu || venceu.length === 0) {
            return json({ status: 'classificado', faixa: faixa.label, enviou: false, motivo: 'ja_enviado' });
          }
        }

        const texto = interpolar(faixa.whatsappTemplate, {
          nome: body.nome ?? '',
          faixa: faixa.label,
          ...(body.variaveis ?? {}),
        });

        /* Falha de envio devolve a reserva: sem isto, uma queda de rede
           bloquearia a mensagem do lead por 24h sem ele ter recebido nada. */
        const liberar = async () => {
          if (!leadDoQuiz) return;
          const { quiz_tier_sent_at: _descartado, ...resto } = {
            ...(leadDoQuiz.metadata ?? {}),
            quiz_tier_sent_at: agora,
          } as Record<string, unknown>;
          await supabaseAdmin
            .from('leads')
            .update({ metadata: resto } as never)
            .eq('id', leadDoQuiz.id)
            .eq('metadata->>quiz_tier_sent_at' as never, agora);
        };

        try {
          /* Pelo canal da empresa e pela política de envio: quem pediu para
             parar não recebe a mensagem da faixa. Horário NÃO se aplica aqui —
             a pessoa acabou de concluir o quiz e espera a resposta agora. */
          const { resolverCanal } = await import('@/lib/whatsapp/canal');
          const { toWhatsAppNumber } = await import('@/lib/whatsapp/numero');
          const { numeroEmOptout } = await import('@/lib/whatsapp/politica');
          const numero = toWhatsAppNumber(destino);
          if (!numero || (await numeroEmOptout(supabaseAdmin as never, q.company_id, numero))) {
            await liberar().catch(() => {});
            return json({ status: 'classificado', faixa: faixa.label, enviou: false, motivo: 'opt_out_ou_numero_invalido' });
          }
          const canal = await resolverCanal(supabaseAdmin as never, q.company_id);
          if (!canal.ok) {
            await liberar().catch(() => {});
            return json({ status: 'classificado', faixa: faixa.label, enviou: false, motivo: canal.texto });
          }
          const r = await canal.provider.sendText(canal.canal, numero, texto);
          if (!r.ok) {
            await liberar().catch(() => {});
            console.error(JSON.stringify({
              scope: 'quiz-completed', msg: 'whatsapp_falhou',
              company_id: q.company_id, faixa: faixa.label, erro: r.error,
            }));
          }
          return json({ status: 'classificado', faixa: faixa.label, enviou: r.ok });
        } catch (err) {
          await liberar().catch(() => {});
          console.error(JSON.stringify({
            scope: 'quiz-completed', msg: 'whatsapp_excecao',
            erro: err instanceof Error ? err.message : String(err),
          }));
          // O lead já foi classificado e gravado. Falha de envio não é erro de página.
          return json({ status: 'classificado', faixa: faixa.label, enviou: false });
        }
      },
    },
  },
});
