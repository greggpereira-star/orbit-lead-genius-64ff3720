/** Formas serializáveis que o servidor entrega à tela. Sem tokens, por construção. */
export interface NumeroOficial {
  /** Conta (WABA) do número: é dela o token e são dela os templates. */
  account_id: string;
  phone_number_id: string;
  display_phone: string;
  mode: "coexistence" | "cloud_only";
  quality: string | null;
  messaging_tier: string | null;
  is_on_biz_app: boolean | null;
  status: "active" | "disconnected";
  disconnected_at: string | null;
  disconnection_reason: string | null;
  webhook_subscribed_at: string | null;
  history_progress: number | null;
  coexistence_synced_at: string | null;
  /** Só responde a quem escreveu: sem template e sem automação/campanha. */
  receive_only: boolean;
}

/** Rascunho salvo: ainda não foi à Meta. */
export interface RascunhoDeTemplate {
  id: string;
  name: string;
  definition: import("./templates").DefinicaoDeTemplate;
  updated_at: string;
}

export interface TemplateOficial {
  id: string;
  account_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  rejection_reason: string | null;
  quality: string | null;
  updated_at: string;
}
