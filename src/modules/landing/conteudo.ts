/**
 * Textos da página inicial do ALT Leadflow.
 *
 * Tom: direto e provocador, na voz de quem compra mídia. Regra que não muda:
 * a provocação aponta para um problema real do leitor, e cada promessa tem um
 * recurso do sistema por trás. Sem número de resultado, sem depoimento, sem
 * logo de cliente e sem "garantido" enquanto não houver prova autorizada.
 * Em dados (e não só em JSX) para poderem ser testados.
 */
import { CONTATO, EMPRESA } from "../legal/conteudo";

/** Telefone comercial da empresa (o mesmo do cadastro do CNPJ e do portfólio da Meta). */
export const WHATSAPP_ALT = "5527999936693";
const wa = (texto: string) => `https://wa.me/${WHATSAPP_ALT}?text=${encodeURIComponent(texto)}`;
export const LINK_FALAR_COM_A_ALT = wa("Olá! Quero ver o ALT Leadflow com os meus anúncios.");
export const LINK_ENTRAR_NA_FILA = wa(
  "Olá! Quero entrar na fila do atendimento pelo WhatsApp oficial do ALT Leadflow.",
);

export const NAVEGACAO = [
  { rotulo: "O problema", ancora: "#problema" },
  { rotulo: "Recursos", ancora: "#recursos" },
  { rotulo: "WhatsApp oficial", ancora: "#whatsapp" },
  { rotulo: "Perguntas", ancora: "#perguntas" },
] as const;

export const HERO = {
  selo: "Para quem paga mídia e cansou de adivinhar",
  tituloA: "Você paga pelo clique.",
  tituloB: "O lead evapora no caminho.",
  subtitulo:
    "O ALT Leadflow liga cada anúncio ao lead, à conversa no WhatsApp e à venda — e devolve o resultado para a Meta e para o Google. Sem planilha. Sem “acho que foi o criativo”.",
  cta: "Quero ver com os meus anúncios",
  ctaSecundario: "Já sou cliente",
  micro: "Sem formulário: é uma conversa direta com a ALT no WhatsApp.",
} as const;

export const PALAVRAS_DO_HERO = ["no WhatsApp", "na planilha", "na demora", "numa aba esquecida"] as const;

export const FAIXA_DE_INTEGRACOES = [
  "Meta Lead Ads",
  "API de Conversões da Meta",
  "Google Ads",
  "WhatsApp Business",
  "UTMs",
  "Webhooks",
  "Quiz",
  "Formulários",
] as const;

export const PROBLEMA = {
  selo: "O problema",
  titulo: "Três lugares onde a sua verba vaza.",
  subtitulo: "E nenhum deles aparece no relatório do gerenciador de anúncios.",
  itens: [
    {
      titulo: "Lead sem origem",
      texto: "Entrou. De qual anúncio? Ninguém sabe, e você escala o criativo errado com a maior confiança do mundo.",
    },
    {
      titulo: "Lead sem dono",
      texto: "Sem fila e sem responsável, o contato esfria numa aba esquecida. O concorrente responde primeiro.",
    },
    {
      titulo: "Venda que não volta",
      texto: "O algoritmo otimiza por clique porque ninguém conta para ele quem comprou. Você paga caro para ele aprender errado.",
    },
  ],
} as const;

export const FLUXO = {
  selo: "A solução",
  titulo: "Do clique ao caixa. Num sistema só.",
  subtitulo: "Cada etapa guarda o que a anterior descobriu. No fim, a venda volta para o anúncio.",
  nos: [
    { titulo: "Anúncio", texto: "Meta Ads · Google Ads" },
    { titulo: "Captação", texto: "Quiz · formulário · widget" },
    { titulo: "Lead com origem", texto: "UTM · gclid · fbclid" },
    { titulo: "Conversa", texto: "WhatsApp, com a equipe" },
    { titulo: "Venda", texto: "Negócio ganho no funil" },
  ],
  retorno: "Conversão devolvida à Meta e ao Google",
} as const;

export interface Recurso {
  id: string;
  selo: string;
  titulo: string;
  texto: string;
  pontos: readonly string[];
}

export const RECURSOS_INTRO = {
  selo: "Recursos",
  titulo: "Tudo o que o seu lead atravessa. Em um lugar.",
} as const;

export const RECURSOS: readonly Recurso[] = [
  {
    id: "captacao",
    selo: "Captação",
    titulo: "Capte por qualquer porta. Não perca por nenhuma.",
    texto: "Quiz que qualifica, formulário no seu site, widget de WhatsApp e o formulário dos seus anúncios caem no mesmo funil, já com a origem colada.",
    pontos: [
      "Quiz com pontuação e etapas editáveis",
      "Formulário e widget embutidos no site que você já tem",
      "Formulário de anúncio da Meta (Lead Ads) entrando direto",
      "Formulário abandonado dispara uma automação de recuperação",
    ],
  },
  {
    id: "origem",
    selo: "Origem do lead",
    titulo: "Descubra qual anúncio pagou a conta.",
    texto: "UTMs e identificadores de clique do Google e da Meta ficam gravados no próprio lead, na hora da captura. Não é reconstrução depois, no chute.",
    pontos: [
      "utm_source, medium, campaign e content no lead",
      "gclid (Google) e fbclid (Meta) guardados",
      "Clique do anúncio que abre o WhatsApp registrado",
      "Origem visível na ficha, na lista e no atendimento",
    ],
  },
  {
    id: "atendimento",
    selo: "Atendimento",
    titulo: "Um inbox. O time inteiro. Nenhuma aba perdida.",
    texto: "Conversas do WhatsApp com responsável, visões da equipe e o lead ao lado. Quem respondeu, quando e o que ficou combinado: tudo registrado.",
    pontos: [
      "Visões: entrada, minhas, seguindo e menções",
      "Atribuição, notas internas e menção a colegas",
      "Respostas rápidas com “/” e mensagens agendadas",
      "Modelos aprovados e exportação da conversa em CSV",
    ],
  },
  {
    id: "funil",
    selo: "Funil",
    titulo: "Cada lead na etapa certa. Cada etapa com dono.",
    texto: "Quadro de negócios com pontuação do lead, temperatura e distribuição do time por disponibilidade. Ninguém pergunta “quem pega esse?”.",
    pontos: [
      "Pipeline em quadro, com etapas que você define",
      "Pontuação convertida em temperatura",
      "Distribuição de novos leads ao time",
      "Ficha do lead com histórico e origem",
    ],
  },
  {
    id: "automacao",
    selo: "Automações",
    titulo: "Tire o trabalho braçal da frente do seu time.",
    texto: "Quando algo acontece, o sistema age. Você escolhe o gatilho, as condições e o que fazer. Sem programar.",
    pontos: [
      "Gatilhos: lead criado, mudou de etapa, formulário abandonado, mensagem recebida",
      "Ações: etiquetar, mover de etapa, atribuir responsável, enviar WhatsApp ou modelo, chamar webhook",
      "Condições por score, temperatura, origem e mais",
    ],
  },
  {
    id: "conversoes",
    selo: "Conversões",
    titulo: "Devolva a venda para o anúncio.",
    texto: "Quando o negócio é ganho, o ALT Leadflow envia a conversão à Meta e ao Google com a origem que o lead guardou. O algoritmo aprende com dinheiro, e não só com clique.",
    pontos: [
      "Envio à Meta (API de Conversões) e ao Google Ads",
      "Origem do lead preservada no envio",
      "Registro de cada envio e do resultado",
    ],
  },
  {
    id: "regras",
    selo: "Regras do canal",
    titulo: "O envio errado nem sai.",
    texto: "O sistema aplica as regras do WhatsApp por você, antes de enviar. Atendente não precisa decorar manual, e o seu número não paga o erro dele.",
    pontos: [
      "Janela de 24 horas: texto livre só enquanto aberta",
      "Fora da janela, só modelo aprovado pela Meta",
      "“Sair” e “parar” respeitados: quem pediu não recebe",
      "Número “apenas receptivo” e teto de envio automático",
    ],
  },
  {
    id: "relatorios",
    selo: "Relatórios",
    titulo: "Veja o que paga conta. Em tela grande.",
    texto: "Painel de resultado por origem e modo TV para o time acompanhar o dia sem abrir relatório.",
    pontos: ["Análise por origem e campanha", "Modo TV para a sala do comercial"],
  },
];

export const WHATSAPP_EM_LIBERACAO = {
  selo: "Em liberação gradual",
  titulo: "WhatsApp oficial, com o número no seu celular.",
  texto:
    "A conexão pela API oficial da Meta mantém o número no aplicativo WhatsApp Business e mostra as conversas também aqui. Estamos liberando aos poucos, conforme a análise da Meta avança. Entre na fila agora.",
  botao: "Entrar na fila",
  requisito: "Para manter o aplicativo no celular, o número precisa estar no WhatsApp Business há pelo menos 7 dias.",
} as const;

export const PARA_QUEM = {
  selo: "Para quem",
  titulo: "Feito por quem compra mídia, para quem vive dela.",
  itens: [
    { titulo: "Gestores e agências", texto: "Mostre de onde veio cada lead e pare de explicar relatório por áudio." },
    { titulo: "Imobiliárias e construtoras", texto: "Lead de lançamento com origem, corretor responsável e conversa registrada." },
    { titulo: "Clínicas e negócios locais", texto: "Quem pediu retorno não fica no vácuo, e quem pediu para parar não recebe nada." },
    { titulo: "E-commerce e atacado", texto: "Contato de anúncio, carrinho e WhatsApp no mesmo funil, com a venda voltando ao anúncio." },
  ],
} as const;

export const COMO_COMECA = {
  selo: "Como começa",
  titulo: "Sem implantação de seis meses.",
  passos: [
    { numero: "1", titulo: "Conversa com a ALT", texto: "Você mostra onde os leads se perdem hoje. A gente mostra o sistema com os seus anúncios." },
    { numero: "2", titulo: "Conectamos o que você usa", texto: "Formulários, quiz, widget do site, anúncios com formulário e o seu WhatsApp." },
    { numero: "3", titulo: "O time atende e mede", texto: "Cada lead com origem, responsável e etapa. A venda volta para o anúncio." },
  ],
} as const;

export const PERGUNTAS_FREQUENTES = {
  selo: "Perguntas",
  titulo: "Perguntas diretas. Respostas diretas.",
  itens: [
    {
      pergunta: "O número sai do meu celular?",
      resposta: "Não. Na conexão oficial, o número continua no aplicativo WhatsApp Business e as conversas aparecem também no ALT Leadflow. Para isso, o número precisa estar no WhatsApp Business há pelo menos 7 dias.",
    },
    {
      pergunta: "É ferramenta de disparo em massa?",
      resposta: "Não. O sistema foi feito para atender e responder: aplica a janela de 24 horas, só envia modelo aprovado fora dela e respeita quem pediu para parar. Automação tem teto de envio.",
    },
    {
      pergunta: "Integra com Meta Lead Ads e Google Ads?",
      resposta: "Sim. Leads de formulário de anúncio da Meta entram no funil, e as conversões voltam para a Meta e para o Google com a origem do lead.",
    },
    {
      pergunta: "Preciso trocar o meu site?",
      resposta: "Não. Quiz, formulário e widget são embutidos no site que você já usa.",
    },
    {
      pergunta: "Quanto custa?",
      resposta: "Os planos ainda não estão publicados. Fale com a ALT e receba uma proposta para a sua operação.",
    },
    {
      pergunta: "Meus dados e os dos meus leads ficam seguros?",
      resposta: "Cada empresa só enxerga os próprios dados, as credenciais de conexão ficam cifradas e a exclusão de dados é pedida pela página de exclusão. Os detalhes estão na Política de Privacidade.",
    },
  ],
} as const;

export const CHAMADA_FINAL = {
  titulo: "Descubra, numa conversa, onde a sua verba vaza.",
  texto: "Mostramos o sistema com os seus anúncios e o seu atendimento, e dizemos com franqueza se faz sentido para você.",
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

export const AVISO_DE_EXEMPLO = "Tela ilustrativa, com dados de exemplo.";
export const TITULO_DA_PAGINA = "ALT Leadflow — do clique do anúncio à venda, sem vazar lead";
export const DESCRICAO_DA_PAGINA =
  "Origem de cada lead, atendimento da equipe no WhatsApp, funil, automações e a conversão devolvida à Meta e ao Google. Feito pela ALT Agency.";
