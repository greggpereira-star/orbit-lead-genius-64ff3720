/**
 * Contrato de um provedor de WhatsApp.
 *
 * O produto fala com isto, nunca com a Evolution nem com a Graph API direto.
 * Hoje há uma implementação (Evolution). A Cloud API oficial entra como segunda,
 * por empresa, sem tocar nos chamadores.
 *
 * Nada aqui lança: devolve `{ ok, error }`, porque os chamadores são disparos
 * em fluxo de criação de lead e WhatsApp nunca pode derrubar a gravação.
 */

export type ProvedorId = "evolution" | "cloud";

/** Resposta de uma consulta ao banco (a forma que o PostgREST devolve). */
export interface RespostaDb {
  data: unknown;
  error: unknown;
}

/**
 * O pedaço do cliente Supabase que esta camada usa.
 *
 * Estrutural de propósito: a camada recebe o cliente de serviço do chamador e
 * não importa o pacote — assim os testes passam um objeto de mentira.
 */
export interface ConsultaDb extends PromiseLike<RespostaDb> {
  select(colunas: string): ConsultaDb;
  eq(coluna: string, valor: unknown): ConsultaDb;
  in(coluna: string, valores: unknown[]): ConsultaDb;
  limit(n: number): ConsultaDb;
  maybeSingle(): PromiseLike<RespostaDb>;
}
export interface AdminDb {
  from(tabela: string): unknown;
}

/** Endereço de envio de uma empresa. Específico do provedor, opaco para o resto. */
export interface CanalWhatsApp {
  provider: ProvedorId;
  /** Evolution: nome da instância. Cloud: `phone_number_id` (futuro). */
  referencia: string;
}

export interface ResultadoDeEnvio {
  ok: boolean;
  data?: { messageId: string | null };
  error?: string;
}

export interface Etiqueta {
  id: string;
  name: string;
}

export interface WhatsAppProvider {
  readonly id: ProvedorId;
  /** O provedor tem credenciais no ambiente? (Não diz se responde.) */
  estaConfigurado(): boolean;
  sendText(canal: CanalWhatsApp, para: string, texto: string): Promise<ResultadoDeEnvio>;

  /**
   * Capacidades que nem todo provedor tem. Etiquetas, por exemplo, só existem
   * no canal não-oficial: a Evolution lança "Method not available" no canal
   * Cloud (comentário em `evolution.server.ts`).
   */
  listarEtiquetas?(
    canal: CanalWhatsApp,
  ): Promise<{ ok: boolean; data?: Etiqueta[]; error?: string }>;
  aplicarEtiqueta?(
    canal: CanalWhatsApp,
    telefone: string,
    nome: string,
    acao: "add" | "remove",
  ): Promise<{ ok: boolean; data?: { labelId: string }; error?: string }>;
}
