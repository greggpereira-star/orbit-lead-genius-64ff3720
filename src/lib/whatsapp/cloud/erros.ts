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

/**
 * A mensagem da Graph API chega em inglês e fala em "objeto", "operação" e "permissões
 * faltando" — o que não diz a quem está conectando o que fazer. Aqui as causas mais comuns
 * viram uma frase com o próximo passo; o que não for reconhecido volta como a Meta mandou,
 * para não esconder um erro novo atrás de um texto bonito.
 */
export function mensagemDaMetaEmPortugues(
  codigo: number | null | undefined,
  original: string | null | undefined,
  http?: number,
): string {
  const m = (original ?? "").toLowerCase();
  const bruto = original ?? (http ? `HTTP ${http}` : "Erro da Meta");

  if (
    /unsupported (get|post|delete) request/.test(m) ||
    /does not exist, cannot be loaded due to missing permissions/.test(m)
  ) {
    return "O token não tem acesso a este recurso (o ID não existe ou o token não tem permissão sobre ele). Gere o token pela conta certa — a Etapa 1 do app ou um usuário do sistema com acesso à conta — e confira os IDs.";
  }
  if (
    codigo === 190 ||
    /error validating access token|session has expired|access token.*(expired|invalid)/.test(m)
  ) {
    return "O token expirou ou foi revogado. Gere um token novo e conecte de novo.";
  }
  if (
    codigo === 10 ||
    codigo === 200 ||
    /\(#?(10|200)\)|requires .*permission|permissions? error/.test(m)
  ) {
    return "O token não tem as permissões necessárias (whatsapp_business_management e whatsapp_business_messaging). Gere um token com elas.";
  }
  if (codigo === 4 || codigo === 17 || codigo === 32 || codigo === 613 || codigo === 80007) {
    return "A Meta limitou as chamadas por excesso de uso. Tente de novo em alguns minutos.";
  }
  return bruto;
}
