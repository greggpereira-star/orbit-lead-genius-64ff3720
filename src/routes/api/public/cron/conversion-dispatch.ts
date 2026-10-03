import { createFileRoute } from '@tanstack/react-router';

/**
 * Despacha as conversões que o gatilho de etapa enfileirou.
 *
 * Roda separado do gatilho de propósito. A transição de etapa acontece numa
 * transação do banco, e chamar a Meta de dentro dela prenderia a transação na
 * latência de uma API externa — o usuário veria o card travar ao arrastar, e um
 * timeout da Meta derrubaria a própria mudança de etapa. A fila desacopla: mover
 * o lead é instantâneo e nunca falha por causa de rede.
 */

const LOTE = 25;

export const Route = createFileRoute('/api/public/cron/conversion-dispatch')({
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
          .from('conversion_dispatches')
          .select('id, company_id, lead_id, stage_id, event_id, occurred_at, attempts')
          .eq('status', 'pending')
          // Teto de tentativas: sem isto, uma conversão que nunca vai passar
          // (token revogado, conversão apagada no Google) ficaria sendo
          // reenviada para sempre, gastando cota e enchendo log.
          .lt('attempts', 5)
          .order('created_at', { ascending: true })
          .limit(LOTE);

        if (error) return json({ error: error.message }, 500);
        if (!pendentes?.length) return json({ processados: 0 });

        const { sendMetaCapiEvent } = await import('@/lib/meta-capi.server');
        let enviados = 0, falhas = 0, pulados = 0, ensaiados = 0;

        for (const d of pendentes as Array<Record<string, any>>) {
          try {
            const [{ data: mapa }, { data: lead }, { data: empresa }] = await Promise.all([
              admin.from('stage_conversion_mappings')
                .select('meta_event_name, google_conversion_action, send_deal_value, whatsapp_label')
                .eq('company_id', d.company_id).eq('stage_id', d.stage_id)
                .eq('is_active', true).maybeSingle(),
              admin.from('leads')
                .select('email, phone, gclid, deal_value, deal_currency')
                .eq('id', d.lead_id).maybeSingle(),
              admin.from('companies')
                .select('conversion_dry_run')
                .eq('id', d.company_id).maybeSingle(),
            ]);

            // Ensaio é por empresa e lido AQUI, no momento do envio — não no
            // momento em que a transição entrou na fila. Quem desliga o ensaio
            // quer que o próximo despacho valha, não que a fila acumulada de
            // antes valha retroativamente.
            const ensaio = empresa?.conversion_dry_run === true;

            // A configuração pode ter sido desligada entre enfileirar e
            // despachar. Pular é o certo: o usuário mudou de ideia.
            if (!mapa) {
              await marcar(admin, d.id, 'skipped', { motivo: 'mapeamento removido ou desligado' });
              pulados++; continue;
            }

            // A página do Facebook dona da conversa.
            //
            // A Meta EXIGE `page_id` ou `whatsapp_business_account_id` em
            // `user_data` quando a fonte é `business_messaging` — sem um dos
            // dois o evento volta 400 com subcódigo 2804116. Descoberto no
            // teste ponta a ponta, não em produção.
            const { data: pagina } = await admin
              .from('meta_lead_pages')
              .select('page_id')
              .eq('company_id', d.company_id)
              .order('created_at', { ascending: true })
              .limit(1).maybeSingle();

            // O clique de anúncio mais recente desse lead. É ele que carrega o
            // `ctwa_clid` e transforma a correspondência de probabilística em
            // determinística.
            // Os últimos cliques do lead, não só o mais recente.
            //
            // A pessoa pode ter chegado por um anúncio do Google (gclid) e
            // voltado por um da Meta (ctwa_clid), ou o contrário. Pegar só o
            // último faria o identificador do outro canal sumir, e o canal
            // ficaria sem conversão sem ninguém notar. Cada destino procura o
            // identificador que entende.
            const { data: cliques } = await admin
              .from('whatsapp_ad_clicks')
              .select('ctwa_clid, gclid, clicked_at')
              .eq('lead_id', d.lead_id)
              .order('clicked_at', { ascending: false })
              .limit(10);

            const historico = (cliques ?? []) as Array<{ ctwa_clid: string | null; gclid: string | null }>;
            const clique = {
              ctwa_clid: historico.find((c) => c.ctwa_clid)?.ctwa_clid ?? null,
              gclid: historico.find((c) => c.gclid)?.gclid ?? null,
            };

            let metaResultado: unknown = null;
            if (mapa.meta_event_name) {
              const r = await sendMetaCapiEvent({
                companyId: d.company_id,
                eventName: mapa.meta_event_name,
                eventId: d.event_id,
                // O instante da TRANSIÇÃO, não o do envio. O cron roda minutos
                // depois, e carimbar a hora errada desloca a atribuição.
                eventTime: Math.floor(new Date(d.occurred_at).getTime() / 1000),
                email: lead?.email ?? null,
                phone: lead?.phone ?? null,
                // Mensageria só quando há as DUAS coisas. Com clid mas sem
                // página, a Meta recusa; melhor cair no caminho de site, que
                // ainda casa por telefone, do que perder o evento inteiro.
                messaging: clique?.ctwa_clid && pagina?.page_id
                  ? { ctwaClid: clique.ctwa_clid, pageId: pagina.page_id }
                  : null,
                customData: mapa.send_deal_value && lead?.deal_value
                  ? { value: Number(lead.deal_value), currency: lead.deal_currency || 'BRL' }
                  : null,
                dryRun: ensaio,
              });
              // Guarda a RESPOSTA da Meta, não só o código. Um "meta_http_400"
              // sozinho não diz se o problema é o evento, o identificador ou o
              // dataset — e sem o corpo a investigação vira adivinhação.
              metaResultado = {
                status: r.status,
                http: r.httpStatus,
                erro: r.error ?? null,
                resposta: r.response ?? null,
              };
              if (r.status === 'rehearsal') ensaiados++;
              else if (r.ok) enviados++; else falhas++;
            }

            // Google Ads: conversão offline da mesma transição.
            //
            // O `gclid` vem do clique do redirect — é a porta do Google, que não
            // tem botão nativo de WhatsApp. Cai para o `leads.gclid` quando o
            // lead entrou por outro caminho (formulário, quiz).
            let googleResultado: unknown = null;
            if (mapa.google_conversion_action) {
              const { enviarConversaoGoogle } = await import('@/lib/google-ads.server');
              const g = await enviarConversaoGoogle({
                companyId: d.company_id,
                tipo: mapa.send_deal_value ? 'sale' : 'lead',
                leadId: d.lead_id,
                acao: mapa.google_conversion_action,
                // A chave de dedup é o evento, não o lead: com conversão por
                // etapa o mesmo lead converte várias vezes, e usar o leadId faria
                // o Google tratar todas como a mesma e descartar as seguintes.
                orderId: d.event_id,
                gclid: clique?.gclid ?? lead?.gclid ?? null,
                email: lead?.email ?? null,
                phone: lead?.phone ?? null,
                quando: new Date(d.occurred_at),
                valor: mapa.send_deal_value && lead?.deal_value ? Number(lead.deal_value) : null,
                moeda: lead?.deal_currency || 'BRL',
                ensaio,
              });
              googleResultado = { status: g.status, detalhe: g.detalhe ?? null, conversao: g.conversao ?? null };
              if (g.status === 'enviada') enviados++;
              else if (g.status === 'ensaio') ensaiados++; else falhas++;
            }

            // Espelha a etapa como etiqueta no WhatsApp.
            //
            // É o mesmo estado visto do outro lado: o time comercial abre o
            // aparelho e vê em que pé está o lead, sem precisar do CRM. Roda
            // aqui, junto do envio, porque já temos o lead e o mapeamento — e
            // porque aplicar etiqueta é chamada de rede, que não pode acontecer
            // dentro da transação que move o card.
            let etiquetaResultado: unknown = null;
            if (mapa.whatsapp_label && lead?.phone) {
              const { data: instancia } = await admin
                .from('whatsapp_instances')
                .select('instance_name, status')
                .eq('company_id', d.company_id)
                .maybeSingle();

              if (!instancia?.instance_name) {
                etiquetaResultado = { status: 'pulado', motivo: 'empresa sem instância de WhatsApp' };
              } else {
                const { aplicarEtiquetaPorNome } = await import('@/lib/evolution.server');
                const r = await aplicarEtiquetaPorNome(
                  instancia.instance_name,
                  lead.phone,
                  mapa.whatsapp_label,
                );
                etiquetaResultado = r.ok
                  ? { status: 'aplicada', etiqueta: mapa.whatsapp_label }
                  : { status: 'falhou', erro: r.error };
              }
            }

            // A etiqueta NÃO entra no critério de sucesso do despacho. Ela é
            // conveniência operacional; a conversão é o que não pode se perder.
            // Marcar o despacho como falho porque a etiqueta não colou faria o
            // evento ser reenviado para a Meta — e evento duplicado ensina errado.
            // Sucesso exige que CADA destino configurado tenha dado certo. Um
            // "sent" com o Google falhando esconderia metade do problema, e é
            // justamente a metade que o gestor de mídia precisa saber.
            const metaOk = !mapa.meta_event_name
              || ['sent', 'rehearsal'].includes((metaResultado as any)?.status);
            const googleOk = !mapa.google_conversion_action
              || ['enviada', 'ensaio'].includes((googleResultado as any)?.status);
            const ok = metaOk && googleOk;
            // `rehearsal` em vez de `sent`: o relatório conta `sent`, e marcar
            // ensaio como envio diria que a conversão chegou na Meta quando
            // ela nunca saiu desta máquina.
            await admin.from('conversion_dispatches').update({
              status: ok ? (ensaio ? 'rehearsal' : 'sent') : 'failed',
              meta_result: metaResultado,
              google_result: googleResultado,
              label_result: etiquetaResultado,
              attempts: (d.attempts ?? 0) + 1,
              dispatched_at: new Date().toISOString(),
              last_error: ok
                ? null
                : [
                    metaOk ? null : `Meta: ${(metaResultado as any)?.erro ?? 'falhou'}`,
                    googleOk ? null : `Google: ${(googleResultado as any)?.detalhe ?? (googleResultado as any)?.status ?? 'falhou'}`,
                  ].filter(Boolean).join(' · '),
            }).eq('id', d.id);

            console.info(JSON.stringify({
              scope: 'conversion-dispatch', msg: ok ? 'enviado' : 'falhou',
              company_id: d.company_id, evento: mapa.meta_event_name,
              com_ctwa_clid: Boolean(clique?.ctwa_clid),
              com_page_id: Boolean(pagina?.page_id),
              etiqueta: (etiquetaResultado as any)?.status ?? null,
              google: (googleResultado as any)?.status ?? null,
              com_gclid: Boolean(clique?.gclid ?? lead?.gclid),
            }));
          } catch (err) {
            falhas++;
            await admin.from('conversion_dispatches').update({
              status: 'failed',
              attempts: (d.attempts ?? 0) + 1,
              last_error: err instanceof Error ? err.message : String(err),
            }).eq('id', d.id);
          }
        }

        return json({ processados: pendentes.length, enviados, falhas, pulados, ensaiados });
      },
    },
  },
});

async function marcar(admin: any, id: string, status: string, extra: Record<string, unknown>) {
  await admin.from('conversion_dispatches')
    .update({ status, meta_result: extra, dispatched_at: new Date().toISOString() })
    .eq('id', id);
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
