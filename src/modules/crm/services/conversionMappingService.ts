/**
 * Configuração de conversão por etapa.
 *
 * O que dispara qual evento é DADO, não código: uma clínica configura "Avaliação
 * agendada", uma imobiliária "Visita ao decorado". O motor é o mesmo.
 */
import { supabase } from '@/integrations/supabase/client';

export interface ConversionMapping {
  id: string;
  company_id: string;
  stage_id: string;
  meta_event_name: string | null;
  google_conversion_action: string | null;
  send_deal_value: boolean;
  whatsapp_label: string | null;
  is_active: boolean;
}

/** Marca a etapa como conversão para o relatório, sem enviar nada para mídia. */
export const SO_MEDIR = '__so_medir__';

/** Evento com nome livre, digitado pelo usuário. */
export const EVENTO_PERSONALIZADO = '__personalizado__';

/**
 * Eventos padrão da Meta úteis num funil de lead.
 *
 * A lista anterior tinha cinco opções fixas e isso não cobria nicho nenhum:
 * "contrato enviado" numa imobiliária, "orçamento aprovado" numa clínica,
 * "matrícula" numa escola. A ordem aqui é a profundidade no funil, de raso para
 * fundo, porque é assim que a pessoa pensa ao montar o degrau.
 *
 * `Lead` NÃO está aqui de propósito: a Meta recusa esse nome quando a origem é
 * conversa de WhatsApp (`business_messaging`). `LeadSubmitted` é o equivalente
 * aceito.
 */
export const EVENTOS_META = [
  {
    valor: 'Contact',
    rotulo: 'Contato iniciado',
    explica: 'Envia Contact. A conversa começou — o degrau mais raso.',
  },
  {
    valor: 'LeadSubmitted',
    rotulo: 'Lead registrado',
    explica: 'Envia LeadSubmitted. Entrou no funil, ainda sem filtro.',
  },
  {
    valor: 'CompleteRegistration',
    rotulo: 'Cadastro completo',
    explica: 'Envia CompleteRegistration. Preencheu os dados que você precisa.',
  },
  {
    valor: 'QualifiedLead',
    rotulo: 'Lead qualificado',
    explica: 'Envia QualifiedLead. O degrau em que você sabe que a pessoa tem perfil — costuma ser o que mais melhora a entrega.',
  },
  {
    valor: 'Schedule',
    rotulo: 'Agendamento',
    explica: 'Envia Schedule. Marcou visita, avaliação ou reunião.',
  },
  {
    valor: 'SubmitApplication',
    rotulo: 'Proposta ou inscrição enviada',
    explica: 'Envia SubmitApplication. Mandou proposta, ficha, cadastro de crédito.',
  },
  {
    valor: 'InitiateCheckout',
    rotulo: 'Começou a fechar',
    explica: 'Envia InitiateCheckout. O passo antes da venda: contrato enviado, negociação aberta, carrinho iniciado.',
  },
  {
    valor: 'AddPaymentInfo',
    rotulo: 'Dados de pagamento',
    explica: 'Envia AddPaymentInfo. Informou como vai pagar.',
  },
  {
    valor: 'StartTrial',
    rotulo: 'Teste iniciado',
    explica: 'Envia StartTrial. Começou período de experiência.',
  },
  {
    valor: 'Subscribe',
    rotulo: 'Assinatura',
    explica: 'Envia Subscribe. Virou recorrência.',
  },
  {
    valor: 'Purchase',
    rotulo: 'Venda',
    explica: 'Envia Purchase. Ligue o valor ao lado para a Meta aprender com receita, não com volume.',
  },
] as const;

export async function listConversionMappings(companyId: string): Promise<ConversionMapping[]> {
  const { data, error } = await (supabase as any)
    .from('stage_conversion_mappings')
    .select('*')
    .eq('company_id', companyId);
  if (error) throw new Error(error.message);
  return (data ?? []) as ConversionMapping[];
}

export async function salvarConversionMapping(input: {
  companyId: string;
  stageId: string;
  metaEventName: string | null;
  whatsappLabel: string | null;
  sendDealValue: boolean;
}): Promise<void> {
  // "Não é conversão" apaga; "só medir" mantém a linha sem destino.
  //
  // A primeira versão apagava sempre que não havia evento, e isso virou
  // armadilha: o mesmo registro define a RÉGUA do relatório, não só o disparo.
  // Quem marcasse a etapa para medir e depois abrisse a tela perderia a régua
  // sem perceber, e o relatório voltaria a dizer "não há como saber".
  if (!input.metaEventName) {
    const { error } = await (supabase as any)
      .from('stage_conversion_mappings')
      .delete()
      .eq('company_id', input.companyId)
      .eq('stage_id', input.stageId);
    if (error) throw new Error(error.message);
    return;
  }

  // Só medir: a etapa conta como qualificada no relatório e nada é enviado.
  if (input.metaEventName === SO_MEDIR) {
    const { error } = await (supabase as any)
      .from('stage_conversion_mappings')
      .upsert(
        {
          company_id: input.companyId,
          stage_id: input.stageId,
          meta_event_name: null,
          whatsapp_label: input.whatsappLabel?.trim() || null,
          send_deal_value: input.sendDealValue,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'company_id,stage_id' },
      );
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await (supabase as any)
    .from('stage_conversion_mappings')
    .upsert(
      {
        company_id: input.companyId,
        stage_id: input.stageId,
        meta_event_name: input.metaEventName,
        whatsapp_label: input.whatsappLabel?.trim() || null,
        send_deal_value: input.sendDealValue,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'company_id,stage_id' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Modo de ensaio da empresa.
 *
 * Existe porque o pixel apontado é o de produção do cliente: conferir a corrente
 * mexendo um cartão manda conversão real para dentro do aprendizado da campanha,
 * e aprendizado sujo não tem desfazer. O código de teste da Meta cobre só a
 * Meta — o Google Ads não tem equivalente.
 */
export async function lerModoEnsaio(companyId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('companies')
    .select('conversion_dry_run')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return (data as { conversion_dry_run?: boolean } | null)?.conversion_dry_run === true;
}

export async function salvarModoEnsaio(companyId: string, ligado: boolean): Promise<void> {
  const { error } = await supabase
    .from('companies')
    .update({ conversion_dry_run: ligado })
    .eq('id', companyId);
  if (error) throw error;
}
