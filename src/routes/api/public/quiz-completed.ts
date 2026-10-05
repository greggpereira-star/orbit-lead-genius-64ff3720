import { createFileRoute } from '@tanstack/react-router';

/**
 * Fim do quiz: classifica o lead na faixa e dispara o WhatsApp da faixa.
 *
 * Roda no servidor por dois motivos que o navegador não resolve. A chave da
 * Evolution não pode chegar ao visitante, e a faixa não pode ser decidida por
 * ele — quem manda a pontuação é a página, e aceitar a faixa junto seria deixar
 * qualquer pessoa se declarar Lead A. Aqui a pontuação é recalculada contra o
 * schema publicado antes de qualquer coisa.
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

/** `altflow_` + uuid sem hífen — mesmo formato que `whatsapp.functions.ts` usa. */
const instanceNameFor = (companyId: string) => `altflow_${companyId.replace(/-/g, '').slice(0, 20)}`;

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
        let leadDoQuiz: { id: string; metadata: Record<string, unknown> | null } | null = null;
        if (body.sessionId) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            // `quiz_id` e o filtro por metadata não estão no `types.ts` gerado
            // com essa forma; o cast é só de tipagem, a consulta é válida.
            .select('id, metadata, temperature, assigned_to')
            .eq('quiz_id' as never, body.quizId)
            .eq('metadata->>session_id' as never, body.sessionId)
            .maybeSingle();
          if (lead) {
            const l = lead as { id: string; metadata: Record<string, unknown> | null; temperature: string | null; assigned_to: string | null };
            leadDoQuiz = { id: l.id, metadata: l.metadata };
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
        const { maxPossibleScore } = await import('@/modules/quiz/engine');
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

        const pct = ((body.score ?? 0) / max) * 100;
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

        if (!faixa.whatsappTemplate?.trim() || !body.telefone) {
          return json({ status: 'classificado', faixa: faixa.label, enviou: false });
        }

        const texto = interpolar(faixa.whatsappTemplate, {
          nome: body.nome ?? '',
          faixa: faixa.label,
          ...(body.variaveis ?? {}),
        });

        try {
          const { sendText } = await import('@/lib/evolution.server');
          const r = await sendText(instanceNameFor(q.company_id), body.telefone, texto);
          if (!r.ok) {
            console.error(JSON.stringify({
              scope: 'quiz-completed', msg: 'whatsapp_falhou',
              company_id: q.company_id, faixa: faixa.label, erro: r.error,
            }));
          }
          return json({ status: 'classificado', faixa: faixa.label, enviou: r.ok });
        } catch (err) {
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
