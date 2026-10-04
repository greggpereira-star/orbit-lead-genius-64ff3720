import { supabase } from '@/lib/supabase';

/**
 * Direitos do titular — acesso (art. 18, II) e eliminação (art. 18, VI).
 *
 * O que estava aqui não funcionava em nenhuma das três funções, e nada disso
 * aparecia porque nenhum arquivo chamava o serviço. Medido em 04/10/2026:
 *
 *   exportData     selecionava `lead_tracking(*)`, tabela que não existe;
 *   deleteData     gravava em `audit_logs` um campo `metadata` (a coluna é
 *                  `changes`) e sem `company_id`, que é NOT NULL — o registro
 *                  falhava DEPOIS do delete, então o dado sumia sem rastro;
 *   recordConsent  gravava em `lgpd_consents`, tabela que não existe.
 *
 * Agora tudo passa por função `SECURITY DEFINER` que confere a associação à
 * empresa, e o pedido fica registrado em `solicitacoes_do_titular`.
 *
 * O consentimento em si é gravado pelo próprio envio do formulário
 * (`form_submit_publico`), na mesma transação do lead — por isso
 * `recordConsent` não existe mais aqui: um registro de consentimento escrito
 * por fora, depois, não prova o que a pessoa viu na hora.
 */

export interface SolicitacaoDoTitular {
  id: string;
  lead_ref: string;
  tipo: 'acesso' | 'eliminacao';
  solicitado_por: string | null;
  resumo: Record<string, unknown> | null;
  motivo: string | null;
  created_at: string;
}

export const lgpdService = {
  /** Tudo o que a empresa guarda sobre a pessoa, num único JSON. */
  async exportarDados(leadId: string): Promise<Record<string, unknown>> {
    const { data, error } = await (supabase as any).rpc('exportar_dados_do_titular', {
      p_lead_id: leadId,
    });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  },

  /**
   * Baixa o export como arquivo. É o formato que o titular pode pedir — um
   * JSON legível, não uma tela que só existe dentro do painel.
   */
  async baixarExport(leadId: string, nomeDoLead?: string | null): Promise<void> {
    const dados = await this.exportarDados(leadId);
    const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const base = (nomeDoLead || leadId).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    a.download = `dados-${base || leadId}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  /**
   * Elimina o lead e tudo que cai em cascata.
   *
   * A prova do consentimento NÃO é apagada: `lead_consents.lead_id` virou
   * `on delete set null` e `lead_ref` mantém o vínculo com o pedido. Apagar a
   * prova junto inviabilizaria demonstrar que o tratamento anterior ao pedido
   * era lícito — e o art. 16 permite conservar o necessário para cumprir
   * obrigação legal.
   */
  async eliminarDados(leadId: string, motivo?: string): Promise<Record<string, unknown>> {
    const { data, error } = await (supabase as any).rpc('eliminar_dados_do_titular', {
      p_lead_id: leadId,
      p_motivo: motivo ?? null,
    });
    if (error) throw new Error(error.message);
    return data as Record<string, unknown>;
  },

  async listarSolicitacoes(companyId: string, limite = 50): Promise<SolicitacaoDoTitular[]> {
    const { data, error } = await supabase
      .from('solicitacoes_do_titular')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(limite);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SolicitacaoDoTitular[];
  },
};
