/**
 * Corte da Evolution (decisão de 15/10/2026: corte seco por cliente).
 *
 * Desligar a instância da Evolution é IRREVERSÍVEL — a sessão pareada por QR
 * some, e reconectar exige o celular na mão. Por isso o corte só roda quando
 * cada pré-requisito é um FATO medido no banco, e não uma opinião:
 * o número oficial funciona de verdade, ponta a ponta, antes de o antigo sair.
 */

export interface FatosDoCorte {
  /** Existe número oficial ativo (não desconectado). */
  numeroAtivo: boolean;
  /** O app foi inscrito nos webhooks da WABA. */
  webhookInscrito: boolean;
  /** Mensagens RECEBIDAS reais (cliente) pelo canal oficial nos últimos 7 dias. */
  recebidasNaSemana: number;
  /** Mensagens ENVIADAS pelo canal oficial com entrega confirmada (delivered/read). */
  entreguesNaSemana: number;
  /** Templates aprovados — sem eles nada retoma conversa fora da janela. */
  templatesAprovados: number;
  /** Saudação/alerta legados ainda ligados (vão parar com o corte). */
  legadoLigado: boolean;
  /** Regras de automação com a ação de texto livre (vão ficar "puladas" fora da janela). */
  regrasComTextoLivre: number;
  /** Ainda há instância da Evolution para remover. */
  temInstanciaEvolution: boolean;
  /** A chave de cifra e o segredo do webhook estão configurados no servidor. */
  ambienteCompleto: boolean;
}

export interface ItemDoCorte {
  id: string;
  texto: string;
  ok: boolean;
  /** Bloqueia o corte quando não atendido. Os outros são avisos. */
  bloqueante: boolean;
  /** O que fazer, quando não está ok. */
  acao?: string;
}

export function avaliarProntidaoDoCorte(f: FatosDoCorte): {
  itens: ItemDoCorte[];
  pronto: boolean;
} {
  const itens: ItemDoCorte[] = [
    {
      id: "ambiente",
      texto: "Servidor configurado (chave de cifra e token do webhook)",
      ok: f.ambienteCompleto,
      bloqueante: true,
      acao: "Defina WA_TOKEN_KEY e WA_WEBHOOK_VERIFY_TOKEN no servidor.",
    },
    {
      id: "numero",
      texto: "Número oficial conectado e ativo",
      ok: f.numeroAtivo,
      bloqueante: true,
      acao: "Conecte o número em Configurações › WhatsApp oficial.",
    },
    {
      id: "webhook",
      texto: "Recebimento de mensagens ativo na Meta",
      ok: f.webhookInscrito,
      bloqueante: true,
      acao: "Reconecte o número para inscrever o aplicativo nos webhooks.",
    },
    {
      id: "recebeu",
      texto: "Chegou ao menos 1 mensagem de cliente pelo canal oficial na última semana",
      ok: f.recebidasNaSemana >= 1,
      bloqueante: true,
      acao: "Peça a alguém para escrever para o número e confirme que a mensagem aparece no atendimento.",
    },
    {
      id: "entregou",
      texto: "Ao menos 1 mensagem enviada pelo canal oficial foi entregue na última semana",
      ok: f.entreguesNaSemana >= 1,
      bloqueante: true,
      acao: "Responda uma conversa pelo atendimento e confirme a entrega (✓✓).",
    },
    {
      id: "template",
      texto: "Há ao menos 1 template aprovado para retomar conversas",
      ok: f.templatesAprovados >= 1,
      bloqueante: true,
      acao: "Crie um template e aguarde a aprovação da Meta.",
    },
    {
      id: "legado",
      texto: "Saudação e alerta antigos (texto livre) desligados ou substituídos por regras",
      ok: !f.legadoLigado,
      bloqueante: false,
      acao: "Eles deixam de funcionar com o corte. Crie regras com 'Enviar template'.",
    },
    {
      id: "texto_livre",
      texto: "Nenhuma regra depende de texto livre fora da janela de 24h",
      ok: f.regrasComTextoLivre === 0,
      bloqueante: false,
      acao: `${f.regrasComTextoLivre} regra(s) usam 'Enviar texto': fora da janela elas serão puladas. Prefira template.`,
    },
  ];

  const pronto = itens.filter((i) => i.bloqueante).every((i) => i.ok) && f.temInstanciaEvolution;
  return { itens, pronto };
}

/** A frase que a pessoa precisa digitar. Em branco/maiúsculas não conta. */
export const FRASE_DO_CORTE = "CORTAR EVOLUTION";

export function confirmacaoConfere(digitado: string): boolean {
  return digitado.trim() === FRASE_DO_CORTE;
}
