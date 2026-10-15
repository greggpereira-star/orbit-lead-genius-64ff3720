/**
 * Erros da Cloud API → decisão do produto.
 *
 * Fonte: ERROR-CODES.md do repositório de referência e documentação da Meta.
 * A pergunta que importa é "tentar de novo?" — retentar `131047` ou `131050`
 * só piora a qualidade do número.
 */
export type ClasseDeErro =
  | "fora_da_janela" // 131047: só template
  | "numero_nao_whatsapp" // 131030
  | "optout_de_marketing" // 131050
  | "limite_de_taxa" // 130429, 131056: esperar e tentar de novo
  | "template" // 132000/132012/132015…: configuração do template
  | "autenticacao" // token inválido/expirado
  | "temporario" // 5xx e afins: pode tentar de novo
  | "desconhecido";

export interface ErroMeta {
  classe: ClasseDeErro;
  /** Vale tentar de novo, com espera? */
  retentavel: boolean;
  texto: string;
}

export function classificarErroMeta(
  codigo: number | null | undefined,
  httpStatus?: number,
): ErroMeta {
  switch (codigo) {
    case 131047:
      return {
        classe: "fora_da_janela",
        retentavel: false,
        texto: "Fora da janela de 24h: só é possível enviar um template aprovado.",
      };
    case 131030:
      return {
        classe: "numero_nao_whatsapp",
        retentavel: false,
        texto: "Este número não está no WhatsApp.",
      };
    case 131050:
      return {
        classe: "optout_de_marketing",
        retentavel: false,
        texto: "O contato parou de receber mensagens de marketing.",
      };
    case 130429:
    case 131056:
      return {
        classe: "limite_de_taxa",
        retentavel: true,
        texto: "Limite de envio atingido; nova tentativa em instantes.",
      };
    case 190:
    case 102:
      return {
        classe: "autenticacao",
        retentavel: false,
        texto: "O acesso à conta do WhatsApp expirou. Reconecte o número.",
      };
    case 132000:
    case 132001:
    case 132005:
    case 132007:
    case 132012:
    case 132015:
    case 132016:
    case 132068:
      return {
        classe: "template",
        retentavel: false,
        texto: "Problema no template (parâmetros, idioma ou aprovação).",
      };
  }
  if (httpStatus && httpStatus >= 500) {
    return {
      classe: "temporario",
      retentavel: true,
      texto: "A Meta está instável; nova tentativa em instantes.",
    };
  }
  return { classe: "desconhecido", retentavel: false, texto: "Falha ao enviar pelo WhatsApp." };
}
