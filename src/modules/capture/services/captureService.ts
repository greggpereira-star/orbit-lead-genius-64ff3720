import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';
import { cvcrmService } from '@/modules/cvcrm/services/cvcrmService';
import { automationService } from '@/modules/automation/services/automationService';
import { resolveEntryStageId, newLeadBoardOrder } from '@/modules/crm/services/stageService';

export interface LeadSubmission {
  name: string;
  email?: string;
  phone?: string;
  metadata?: Record<string, any>;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  gclid?: string;
  /** iOS troca o `gclid` por um destes dois. Ver migração 20261004120000. */
  wbraid?: string;
  gbraid?: string;
  fbclid?: string;
  /**
   * Chave de deduplicação do evento de conversão.
   *
   * O Pixel dispara `Lead` pelo navegador e pelo servidor com o MESMO id para a
   * Meta contar um só. Guardá-lo no lead é o que permite, depois, dizer qual
   * evento do Gerenciador corresponde a qual linha do CRM — sem isso a
   * reconciliação é impossível.
   */
  event_id?: string;
}

export interface ResultadoEnvioPublico {
  success: boolean;
  leadId?: string;
  submissionId?: string;
  score?: number;
  temperature?: string;
  tags?: string[];
  error?: any;
}

export const captureService = {
  /**
   * Envio do formulário público.
   *
   * Uma chamada, uma transação: lead + etiquetas + submissão + evento de
   * histórico. Antes eram quatro gravações separadas do navegador, cada uma
   * podendo falhar sozinha — e nenhuma delas podia dar certo, porque o papel
   * `anon` não tem grant em `form_submissions`, `lead_tags` nem `lead_events`
   * (medido em 04/10/2026).
   *
   * A pontuação não vem mais daqui. Ela é calculada dentro da função, com as
   * regras que já estão no banco: quem preenche não tem como editar a própria
   * qualificação antes de enviar. O contato também é resolvido no servidor,
   * pelo TIPO do campo — antes dependia de o cliente ter nomeado o campo
   * exatamente `name` ou `full_name`.
   */
  async submitPublicForm(p: {
    slug: string;
    sessionId: string;
    answers: Record<string, unknown>;
    tracking?: Record<string, unknown>;
    eventId?: string;
  }): Promise<ResultadoEnvioPublico> {
    const { data, error } = await (supabase as any).rpc('form_submit_publico', {
      p_slug: p.slug,
      p_session_id: p.sessionId,
      p_answers: p.answers ?? {},
      p_tracking: p.tracking ?? {},
      p_event_id: p.eventId ?? null,
    });

    if (error) {
      logger.error('CaptureService: form_submit_publico falhou', {
        slug: p.slug,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    const r = (data ?? {}) as Record<string, any>;
    if (!r.ok) {
      logger.warn('CaptureService: envio público recusado', { slug: p.slug, erro: r.erro });
      return { success: false, error: r.erro ?? 'recusado' };
    }

    return {
      success: true,
      leadId: r.lead_id,
      submissionId: r.submission_id,
      score: r.score,
      temperature: r.temperature,
      tags: Array.isArray(r.tags) ? r.tags : [],
    };
  },

  /**
   * Captura por usuário autenticado (`CaptureForm`, dentro do painel).
   *
   * O formulário público NÃO passa mais por aqui — ele usa
   * `submitPublicForm`. Este caminho depende de grants de tabela que só o
   * papel `authenticated` tem.
   */
  async submitLead(
    companyId: string, 
    data: LeadSubmission, 
    trackingData: any = {}
  ): Promise<{ success: boolean; leadId?: string; submissionId?: string; error?: any }> {
    try {
      // 1. Calculate Score based on form rules if form_id is present
      let score = 0;
      let tags: string[] = [];
      let temperature = 'cold';

      // Pontuação pela MESMA função que o caminho público usa. O cálculo no
      // navegador tinha dois defeitos que o mantinham sempre em zero: lia
      // `answers[rule.field_id]` quando as respostas são indexadas pelo nome do
      // campo, e ignorava `form_field_options.score`. Uma implementação só, no
      // servidor, não divergir é a razão de existir.
      if (data.metadata?.form_id) {
        const { data: p, error: pErr } = await (supabase as any).rpc('pontuar_formulario', {
          p_form_id: data.metadata.form_id,
          p_answers: data.metadata.answers || {},
        });
        if (pErr) {
          logger.warn('CaptureService: pontuação falhou, lead entra sem score', {
            formId: data.metadata.form_id,
            error: pErr.message,
          });
        } else if (p) {
          score = Number(p.score ?? 0);
          tags = Array.isArray(p.tags) ? p.tags : [];
          temperature = p.temperature ?? 'cold';
        }
      }

      // 2. Etapa de entrada configurada neste formulário (aba Publicação).
      //    Sem isto o lead nascia com stage_id NULL e ficava invisível no
      //    pipeline, mesmo tendo sido capturado com sucesso.
      let entryStageId: string | null = null;
      try {
        let preferred: string | null = null;
        if (data.metadata?.form_id) {
          const { data: formRow } = await supabase
            .from('forms')
            .select('settings')
            .eq('id', data.metadata.form_id)
            .maybeSingle();
          preferred =
            ((formRow?.settings as Record<string, unknown> | undefined)
              ?.default_stage_id as string | undefined) ?? null;
        }
        // Via RPC: quem preenche o formulário público é anônimo e não tem
        // permissão de leitura em `stages`.
        entryStageId = await resolveEntryStageId(companyId, preferred);
      } catch (e) {
        // Captura não pode falhar por causa da etapa: sem ela o lead aparece
        // em "Sem etapa" no board, que é recuperável. Perder o lead não é.
        logger.warn('Não foi possível resolver a etapa de entrada do lead', {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      // 3. Insert Lead
      const lead = {
        id: crypto.randomUUID(),
        company_id: companyId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        utm_source: data.utm_source || trackingData.utm_source,
        utm_medium: data.utm_medium || trackingData.utm_medium,
        utm_campaign: data.utm_campaign || trackingData.utm_campaign,
        gclid: data.gclid || trackingData.gclid,
        wbraid: data.wbraid || trackingData.wbraid,
        gbraid: data.gbraid || trackingData.gbraid,
        fbclid: data.fbclid || trackingData.fbclid,
        event_id: data.event_id ?? null,
        metadata: { ...data.metadata, ...trackingData.metadata, tags },
        referrer: trackingData.referrer,
        landing_page: trackingData.landing_page,
        status: 'new',
        stage_id: entryStageId,
        stage_entered_at: new Date().toISOString(),
        board_order: newLeadBoardOrder(),
        score,
        temperature
      };
      const { error: leadError } = await supabase.from('leads').insert(lead);

      if (leadError) throw leadError;

      // 3. Insert Tag rules (persist tags to lead_tags table)
      if (tags.length > 0) {
        // Falha aqui não derruba a captura — o lead já está gravado e as
        // etiquetas também vão no `metadata`. Mas tem que aparecer no log: sem
        // o erro conferido, etiqueta sumida ficava indistinguível de regra de
        // pontuação que não casou com nada.
        const { error: tagError } = await supabase.from('lead_tags').insert(
          tags.map(tag => ({ lead_id: lead.id, tag_name: tag }))
        );
        if (tagError) {
          logger.error('CaptureService: lead_tags insert failed', {
            leadId: lead.id,
            tags,
            error: tagError.message,
          });
        }
      }

      // 4. Save Final Submission record
      const submissionId = crypto.randomUUID();
      const { error: subError } = await supabase
        .from('form_submissions')
        .insert({
          id: submissionId,
          company_id: companyId,
          form_id: data.metadata?.form_id,
          lead_id: lead.id,
          answers: data.metadata?.answers || {},
          score,
          temperature,
          tags,
          tracking: trackingData
        });
      if (subError) logger.error('CaptureService: form_submissions insert failed', { error: subError.message });

      // 5. Create lead event
      await supabase.from('lead_events').insert({
        lead_id: lead.id,
        event_type: 'capture',
        description: `Lead captured with score ${score} (${temperature})`,
        metadata: { submission_id: submissionId }
      });

      // 6. Async actions
      // CV.CRM Sync
      if (data.metadata?.cv_crm_integration) {
        cvcrmService.syncLead(companyId, lead.id).catch(err => {
          logger.error('CaptureService: CV.CRM sync failed', { leadId: lead.id, error: err.message });
        });
      }

      // Automations
      automationService.processTrigger(companyId, {
        type: 'lead_created',
        data: { ...lead, submission_id: submissionId }
      }).catch(console.error);

      return { success: true, leadId: lead.id, submissionId };
    } catch (err: any) {
      logger.error('CaptureService: submitLead failed', { error: err.message, companyId });
      return { success: false, error: err.message };
    }
  }
};
