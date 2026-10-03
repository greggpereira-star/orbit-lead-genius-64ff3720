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

/**
 * Eventos que a Meta aceita em mensageria.
 *
 * `Lead` NÃO está aqui, e a ausência é proposital: a Meta recusa esse nome
 * quando a fonte é `business_messaging`. Oferecer na lista geraria uma
 * configuração que falha só na hora do envio, dias depois, sem ninguém ligar
 * uma coisa à outra.
 */
/** Marca a etapa como conversão para o relatório, sem enviar nada para mídia. */
export const SO_MEDIR = '__so_medir__';

export const EVENTOS_META = [
  { valor: 'QualifiedLead', rotulo: 'Lead qualificado', dica: 'o lead passou no seu filtro' },
  { valor: 'LeadSubmitted', rotulo: 'Lead registrado', dica: 'entrou no funil' },
  { valor: 'Schedule', rotulo: 'Agendamento', dica: 'marcou visita, avaliação, reunião' },
  { valor: 'Purchase', rotulo: 'Venda', dica: 'fechou — manda o valor junto' },
  { valor: 'Contact', rotulo: 'Contato', dica: 'conversa iniciada' },
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
