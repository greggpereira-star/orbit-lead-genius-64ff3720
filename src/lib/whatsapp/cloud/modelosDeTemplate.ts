/**
 * Pontos de partida para quem nunca criou um template: a página em branco é o maior
 * obstáculo do cadastro. Cada modelo é uma definição COMPLETA e válida (exemplos incluídos);
 * o autor só ajusta o texto. O de carrinho deixa a URL do botão vazia de propósito: um
 * endereço de mentira passaria na validação e iria à Meta.
 */
import type { DefinicaoDeTemplate } from "./templates";

export interface ModeloDeTemplate {
  id: string;
  titulo: string;
  /** Uma linha: quando usar. */
  descricao: string;
  def: Omit<DefinicaoDeTemplate, "idioma">;
}

export const MODELOS_DE_TEMPLATE: readonly ModeloDeTemplate[] = [
  {
    id: "confirmacao_pedido",
    titulo: "Confirmação de pedido",
    descricao: "Avisa que o pedido foi recebido.",
    def: {
      nome: "pedido_confirmado_v1",
      categoria: "UTILITY",
      corpo:
        "Olá {{1}}, recebemos o seu pedido {{2}}. Assim que ele for enviado, avisamos por aqui.",
      exemplosDoCorpo: ["Ana", "12345"],
    },
  },
  {
    id: "lembrete_agendamento",
    titulo: "Lembrete de agendamento",
    descricao: "Lembra o horário e pede confirmação.",
    def: {
      nome: "lembrete_agendamento_v1",
      categoria: "UTILITY",
      corpo:
        "Olá {{1}}, lembrando do seu atendimento em {{2}} às {{3}}. Pode confirmar a sua presença?",
      exemplosDoCorpo: ["Ana", "sábado, 25/10", "10h"],
      botoes: [
        { tipo: "QUICK_REPLY", texto: "Confirmar" },
        { tipo: "QUICK_REPLY", texto: "Preciso remarcar" },
      ],
    },
  },
  {
    id: "boas_vindas",
    titulo: "Boas-vindas",
    descricao: "Responde a quem acabou de chamar.",
    def: {
      nome: "boas_vindas_v1",
      categoria: "UTILITY",
      corpo: "Olá {{1}}, tudo bem? Aqui é da {{2}}. Recebemos o seu contato e já vamos te atender.",
      exemplosDoCorpo: ["Ana", "Alt Flow"],
    },
  },
  {
    id: "novidade",
    titulo: "Novidade ou oferta",
    descricao: "Divulga uma oferta (Marketing).",
    def: {
      nome: "novidade_v1",
      categoria: "MARKETING",
      corpo:
        "Olá {{1}}, temos uma novidade para você: {{2}}. Responda esta mensagem para saber mais.",
      exemplosDoCorpo: ["Ana", "10% de desconto na primeira compra"],
      rodape: "Para não receber mais, responda SAIR.",
    },
  },
  {
    id: "carrinho",
    titulo: "Retomada de carrinho",
    descricao: "Convida a finalizar a compra (Marketing).",
    def: {
      nome: "retomada_carrinho_v1",
      categoria: "MARKETING",
      corpo:
        "Olá {{1}}, você deixou itens no carrinho. Finalize a sua compra pelo botão abaixo e garanta o seu pedido.",
      exemplosDoCorpo: ["Ana"],
      botoes: [{ tipo: "URL", texto: "Finalizar compra", valor: "" }],
    },
  },
] as const;
