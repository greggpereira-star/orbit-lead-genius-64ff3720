import { supabase } from '@/lib/supabase';
import type { PixelConfig } from '@/core/tracking/pixels';

/**
 * Pixel do Meta e conversões do Google Ads.
 *
 * Tudo passa por RPC em vez de `from('integrations')` direto por um motivo só:
 * um `select('config')` traria o access token da Conversions API para dentro do
 * navegador em toda visita à tela. As funções devolvem os IDs públicos e, do
 * token, apenas se ele existe.
 */

export interface CompanyPixelSettings {
  metaPixelId: string;
  metaTestEventCode: string;
  /** O token nunca volta do servidor — só a informação de que já foi salvo. */
  metaTokenConfigured: boolean;
  googleConversionId: string;
  googleLeadLabel: string;
  googleCompleteLabel: string;
}

const EMPTY: CompanyPixelSettings = {
  metaPixelId: '',
  metaTestEventCode: '',
  metaTokenConfigured: false,
  googleConversionId: '',
  googleLeadLabel: '',
  googleCompleteLabel: '',
};

export const pixelService = {
  async getCompanySettings(companyId: string): Promise<CompanyPixelSettings> {
    const { data, error } = await (supabase as any).rpc('company_pixel_settings', {
      p_company_id: companyId,
    });
    if (error) {
      console.error('Falha ao ler configuração de pixels', error);
      return EMPTY;
    }
    return { ...EMPTY, ...((data ?? {}) as Partial<CompanyPixelSettings>) };
  },

  /**
   * `metaAccessToken` vazio significa "mantém o que já está gravado". É o que
   * deixa trocar o Pixel ID sem redigitar o token.
   */
  async saveCompanySettings(
    companyId: string,
    input: {
      metaPixelId: string;
      metaAccessToken?: string;
      metaTestEventCode: string;
      googleConversionId: string;
      googleLeadLabel: string;
      googleCompleteLabel: string;
    },
  ): Promise<{ ok: boolean; error?: string }> {
    const { error } = await (supabase as any).rpc('save_company_pixel_settings', {
      p_company_id: companyId,
      p_meta_pixel_id: input.metaPixelId,
      p_meta_access_token: input.metaAccessToken?.trim() ? input.metaAccessToken.trim() : null,
      p_meta_test_event_code: input.metaTestEventCode,
      p_google_conversion_id: input.googleConversionId,
      p_google_lead_label: input.googleLeadLabel,
      p_google_complete_label: input.googleCompleteLabel,
    });
    if (error) {
      console.error('Falha ao salvar configuração de pixels', error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  /** Configuração padrão da empresa, do jeito que a página pública precisa. */
  async getPublicConfig(companyId: string): Promise<PixelConfig> {
    const { data, error } = await (supabase as any).rpc('public_pixel_config', {
      p_company_id: companyId,
    });
    if (error) return {};
    return (data ?? {}) as PixelConfig;
  },
};

/**
 * O funil manda quando define o próprio pixel; a empresa entra no que ele
 * deixou em branco.
 *
 * Campo vazio no funil é "herda", não "desliga" — quem quer desligar a medição
 * de um funil apaga o pixel da empresa ou usa outro ID. Tratar vazio como
 * desligado faria qualquer funil novo nascer sem medição nenhuma.
 */
export function mergePixelConfig(company: PixelConfig, funnel?: Partial<PixelConfig> | null): PixelConfig {
  const pick = (a?: string, b?: string) => {
    const chosen = a?.trim() || b?.trim();
    return chosen || undefined;
  };
  return {
    metaPixelId: pick(funnel?.metaPixelId, company.metaPixelId),
    googleConversionId: pick(funnel?.googleConversionId, company.googleConversionId),
    googleLeadLabel: pick(funnel?.googleLeadLabel, company.googleLeadLabel),
    googleCompleteLabel: pick(funnel?.googleCompleteLabel, company.googleCompleteLabel),
  };
}
