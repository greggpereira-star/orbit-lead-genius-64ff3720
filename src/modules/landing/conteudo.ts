/**
 * Textos da página inicial do ALT Leadflow.
 *
 * Ficam em dados (e não só em JSX) para poderem ser testados: a página é lida
 * pela análise do app da Meta e por quem decide comprar, e não pode afirmar
 * nada que o sistema não faça. Regra da página: sem número de resultado, sem
 * depoimento e sem logo de cliente enquanto não houver prova autorizada.
 */
import { CONTATO, EMPRESA } from "../legal/conteudo";

/** Telefone comercial da empresa (o mesmo do cadastro do CNPJ e do portfólio da Meta). */
export const WHATSAPP_ALT = "5527999936693";
export const MENSAGEM_INICIAL = "Olá! Quero conhecer o ALT Leadflow.";
export const LINK_FALAR_COM_A_ALT = `https://wa.me/${WHATSAPP_ALT}?text=${encodeURIComponent(MENSAGEM_INICIAL)}`;
export const LINK_ENTRAR_NA_FILA = `https://wa.me/${WHATSAPP_ALT}?text=${encodeURIComponent(
  "Olá! Quero entrar na fila do atendimento pelo WhatsApp oficial do ALT Leadflow.",
)}`;

export const NAVEGACAO = [
  { rotulo: "As quatro perguntas", ancora: "#perguntas" },
  { rotulo: "WhatsApp oficial", ancora: "#whatsapp" },
  { rotulo: "Como começa", ancora: "#como-comeca" },
] as const;

export const HERO = {
  selo: "Para quem paga mídia",
  titulo: "De onde veio esse lead?",
  subtitulo:
    "O ALT Leadflow guarda o caminho de cada contato — do anúncio ao WhatsApp e à venda — para você decidir a verba com dado, e não com palpite.",
  nota: "Feito pela ALT Agency, agência de tráfego pago de Vila Velha/ES.",
} as const;

export interface Pergunta {
  numero: string;
  pergunta: string;
  resposta: string;
  nota: string;
}

export const INTRO_PERGUNTAS = {
  selo: "Como o gestor decide",
  titulo: "Quatro perguntas. Quatro respostas, na tela.",
} as const;

export const PERGUNTAS: readonly Pergunta[] = [
  {
    numero: "01",
    pergunta: "Qual anúncio trouxe esse lead?",
    resposta:
      "Formulário, quiz ou widget do site guardam, no próprio lead, as UTMs e os identificadores de clique do Google e da Meta. Quando o contato vem de um anúncio que abre o WhatsApp, o clique também fica registrado.",
    nota: "Origem guardada na captura, não reconstruída depois.",
  },
  {
    numero: "02",
    pergunta: "Quem respondeu, e quando?",
    resposta:
      "O atendimento acontece por conversa no WhatsApp, com visões da equipe: entrada, minhas, seguindo e menções. Cada conversa tem responsável, notas internas que o cliente nunca vê e mensagens agendadas.",
    nota: "Um inbox da equipe, com o lead ao lado.",
  },
  {
    numero: "03",
    pergunta: "Posso mandar mensagem agora?",
    resposta:
      "O sistema aplica as regras do canal por você. Com a janela de 24 horas aberta, o atendente escreve livremente. Fora dela, só um modelo aprovado pela Meta. E quem pediu para parar não recebe nada.",
    nota: "Regra do WhatsApp aplicada no envio, não no manual.",
  },
  {
    numero: "04",
    pergunta: "Essa venda voltou para o anúncio?",
    resposta:
      "Quando o negócio é ganho, o ALT Leadflow envia a conversão à Meta e ao Google com a origem que o lead guardou. O anúncio aprende com a venda, e não só com o clique.",
    nota: "Conversão devolvida, com o registro do envio.",
  },
];

export const WHATSAPP_EM_LIBERACAO = {
  selo: "Em liberação gradual",
  titulo: "Atendimento pela API oficial do WhatsApp",
  texto:
    "O número continua no aplicativo do celular e as conversas aparecem também no ALT Leadflow. Estamos liberando a conexão aos poucos, conforme a análise da Meta avança. Fale com a ALT para entrar na fila.",
  botao: "Entrar na fila",
} as const;

export const COMO_COMECA = {
  titulo: "Como começa",
  passos: [
    {
      numero: "1",
      titulo: "Você conversa com a ALT",
      texto: "Entendemos de onde vêm seus leads hoje e onde eles se perdem.",
    },
    {
      numero: "2",
      titulo: "Conectamos o que você já usa",
      texto: "Formulários, quiz, widget do site, anúncios com formulário e o seu WhatsApp.",
    },
    {
      numero: "3",
      titulo: "Seu time atende e mede no mesmo lugar",
      texto: "Cada lead com origem, responsável e etapa, e a venda de volta para o anúncio.",
    },
  ],
} as const;

export const CHAMADA_FINAL = {
  titulo: "Quer ver o caminho dos seus leads?",
  texto:
    "Fale com a ALT. Mostramos o sistema com os seus anúncios e o seu atendimento, e dizemos com franqueza se faz sentido para você.",
} as const;

export const RODAPE = {
  empresa: `Um produto de ${EMPRESA.razaoSocial} (${EMPRESA.nomeFantasia})`,
  cnpj: `CNPJ ${EMPRESA.cnpj} · ${EMPRESA.cidade}`,
  contato: CONTATO,
  links: [
    { rotulo: "Política de Privacidade", para: "/privacy" },
    { rotulo: "Termos de Serviço", para: "/terms" },
    { rotulo: "Exclusão de dados", para: "/data-deletion" },
  ],
} as const;

export const AVISO_DE_EXEMPLO = "Tela de exemplo, com dados ilustrativos.";
export const TITULO_DA_PAGINA = "ALT Leadflow — de onde veio esse lead?";
export const DESCRICAO_DA_PAGINA =
  "Do anúncio ao WhatsApp e à venda: o ALT Leadflow guarda a origem de cada lead, organiza o atendimento da equipe e devolve a conversão ao anúncio. Feito pela ALT Agency.";
