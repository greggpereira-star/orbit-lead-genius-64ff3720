import type { QuizBlock, QuizSchema } from "./types";
import { DESIGN_PRESETS } from "./design-presets";

/**
 * Modelos de QUIZ INTEIRO.
 *
 * Os seis que existiam na base tinham `blocks: []` — "Usar Template" criava um
 * quiz vazio com nome bonito, e nada avisava. Estes são escritos em código, e
 * não digitados em SQL, para três coisas que a planilha não dá: o tipo confere
 * na compilação, o teste verifica que todo modelo é publicável, e a mudança
 * fica no histórico.
 *
 * A estrutura segue o que os funis de referência fazem: abertura com promessa,
 * perguntas que PONTUAM, tela de análise, resultado e captura perto do fim —
 * nunca na primeira etapa.
 */

export interface ModeloDeQuiz {
  slug: string;
  name: string;
  niche: string;
  description: string;
  emoji: string;
  presetId: string;
  build: () => QuizSchema;
}

let n = 0;
const id = (p: string) => `${p}-${++n}`;

type OpcaoSimples = [rotulo: string, pontos: number, etiqueta?: string];

function pergunta(titulo: string, opcoes: OpcaoSimples[], subtitulo?: string): QuizBlock {
  return {
    id: id("q"),
    type: "single-choice",
    title: titulo,
    subtitle: subtitulo,
    required: true,
    options: opcoes.map(([label, score, tag]) => ({ id: id("o"), label, score, tag })),
  };
}

const abertura = (titulo: string, sub: string, cta: string): QuizBlock => ({
  id: id("intro"),
  type: "intro",
  title: titulo,
  subtitle: sub,
  ctaLabel: cta,
});

const analise = (titulo: string, passos: string[]): QuizBlock => ({
  id: id("load"),
  type: "loading",
  title: titulo,
  loadingSeconds: 3,
  loadingSteps: passos,
});

const captura = (titulo: string, sub: string, cta: string): QuizBlock => ({
  id: id("form"),
  type: "form",
  title: titulo,
  subtitle: sub,
  ctaLabel: cta,
  required: true,
  formFields: { name: true, email: true, phone: true },
});

const resultado = (titulo: string, texto: string): QuizBlock => ({
  id: id("res"),
  type: "result",
  resultTitle: titulo,
  resultBody: texto,
  ctaLabel: "Falar agora",
});

/** Uma etapa por bloco, na ordem — é o formato que o construtor espera. */
function montar(presetId: string, blocos: QuizBlock[], nomes: string[]): QuizSchema {
  const preset = DESIGN_PRESETS.find((p) => p.id === presetId);
  // Sem isto, um preset escrito errado cai no tema padrão em silêncio — foi o que
  // aconteceu na primeira versão deste arquivo, e a compilação não acusou nada.
  if (!preset) throw new Error(`Modelo de quiz aponta para um preset inexistente: ${presetId}`);
  const design = preset.design;
  return {
    design,
    results: [],
    blocks: blocos,
    steps: blocos.map((b, i) => ({
      id: `s-${b.id}`,
      blockIds: [b.id],
      name: nomes[i],
      // Voltar da tela de resultado não faz sentido: o lead já foi gravado.
      ...(b.type === "result" ? { showBack: false } : {}),
    })),
  };
}

export const MODELOS_DE_QUIZ: ModeloDeQuiz[] = [
  {
    slug: "imobiliario-premium",
    name: "Imobiliário — qualificação de comprador",
    niche: "imobiliario",
    emoji: "🏡",
    presetId: "minimal-light",
    description: "Separa quem compra agora de quem só está olhando, antes do corretor ligar.",
    build: () =>
      montar(
        "minimal-light",
        [
          abertura(
            "Descubra o imóvel certo para o seu momento",
            "Três minutos de perguntas, e a nossa equipe já chega com opções que cabem no seu bolso.",
            "Começar",
          ),
          pergunta("Você compraria para morar ou para investir?", [
            ["Para morar", 8, "morar"],
            ["Para investir", 10, "investir"],
            ["Ainda não sei", 3],
          ]),
          pergunta("Quando pretende fechar negócio?", [
            ["Nos próximos 30 dias", 15, "urgente"],
            ["Em até 3 meses", 10],
            ["Entre 3 e 12 meses", 5],
            ["Só pesquisando", 0, "frio"],
          ]),
          pergunta("Já tem a entrada disponível?", [
            ["Sim, em dinheiro", 15, "tem-entrada"],
            ["Vou usar o FGTS", 10],
            ["Ainda estou juntando", 3],
            ["Preciso de 100% financiado", 1],
          ]),
          pergunta("Seu crédito já foi aprovado?", [
            ["Sim, aprovado", 15, "aprovado"],
            ["Em análise", 8],
            ["Ainda não comecei", 2],
          ]),
          analise("Cruzando seu perfil com os imóveis disponíveis…", [
            "Lendo suas respostas",
            "Filtrando por faixa de valor",
            "Separando as melhores opções",
          ]),
          captura(
            "Para onde enviamos as opções?",
            "A equipe entra em contato com imóveis que batem com o que você respondeu.",
            "Quero ver as opções",
          ),
          resultado(
            "Perfil montado",
            "Separamos imóveis compatíveis com o seu momento. Um corretor vai te chamar no WhatsApp.",
          ),
        ],
        ["Abertura", "Objetivo", "Prazo", "Entrada", "Crédito", "Análise", "Captura", "Resultado"],
      ),
  },
  {
    slug: "estetica-avaliacao",
    name: "Estética — diagnóstico facial",
    niche: "estetica",
    emoji: "✨",
    presetId: "rose",
    description: "Transforma a queixa em diagnóstico e o diagnóstico em avaliação agendada.",
    build: () =>
      montar(
        "rose",
        [
          abertura(
            "Descubra o que faria diferença no seu rosto",
            "Sem promessa de milagre: um diagnóstico para você decidir com segurança.",
            "Quero meu diagnóstico",
          ),
          pergunta("O que mais te incomoda hoje?", [
            ["Rosto cansado", 10, "cansaco"],
            ["Linhas de expressão", 10, "rugas"],
            ["Lábios sem definição", 8, "labios"],
            ["Perda de contorno", 10, "contorno"],
            ["Não sei explicar", 5],
          ]),
          pergunta("Quanto isso interfere no seu dia?", [
            ["Penso com frequência", 15, "alta-dor"],
            ["Incomoda em fotos", 10],
            ["Só às vezes", 5],
            ["Quase nada", 2],
          ]),
          pergunta("Qual seu maior receio?", [
            ["Ficar artificial", 8, "medo-artificial"],
            ["Não ver resultado", 8],
            ["Dor ou recuperação", 6],
            ["Nenhum, só quero começar", 12, "pronto"],
          ]),
          pergunta("Quando pretende iniciar?", [
            ["Assim que possível", 15, "urgente"],
            ["Nos próximos 30 dias", 10],
            ["Ainda pesquisando", 3, "frio"],
          ]),
          analise("Organizando suas respostas…", [
            "Lendo suas respostas",
            "Cruzando com os protocolos",
            "Montando seu diagnóstico",
          ]),
          captura(
            "Seu diagnóstico está pronto",
            "Deixe seu contato para receber o resultado e verificar horários de avaliação.",
            "Ver meu diagnóstico",
          ),
          resultado(
            "Perfil identificado",
            "Uma avaliação individual vai dizer o que realmente faz sentido — e o que não é necessário.",
          ),
        ],
        ["Abertura", "Queixa", "Intensidade", "Receio", "Prazo", "Análise", "Captura", "Resultado"],
      ),
  },
  {
    slug: "mentoria-high-ticket",
    name: "Mentoria — aplicação high ticket",
    niche: "mentoria",
    emoji: "🎯",
    presetId: "aurora",
    description: "Filtra quem tem faturamento e disposição de investir, antes da call.",
    build: () =>
      montar(
        "aurora",
        [
          abertura(
            "Veja se a mentoria faz sentido para o seu momento",
            "Não é para todo mundo. As perguntas abaixo dizem em dois minutos.",
            "Fazer a aplicação",
          ),
          pergunta("Qual seu faturamento mensal hoje?", [
            ["Acima de R$ 100 mil", 20, "alto"],
            ["Entre R$ 30 e 100 mil", 15],
            ["Entre R$ 10 e 30 mil", 8],
            ["Abaixo de R$ 10 mil", 2, "baixo"],
            ["Ainda não faturo", 0, "frio"],
          ]),
          pergunta("Qual o maior gargalo agora?", [
            ["Não consigo escalar", 12, "escala"],
            ["Dependo só de mim", 12, "operacao"],
            ["Falta previsibilidade", 10],
            ["Não sei por onde começar", 4],
          ]),
          pergunta("Quanto tempo por semana você dedicaria?", [
            ["Mais de 10 horas", 15, "dedicado"],
            ["De 5 a 10 horas", 10],
            ["Menos de 5 horas", 3],
          ]),
          pergunta("Está disposto a investir para resolver isso?", [
            ["Sim, já reservei verba", 20, "pronto"],
            ["Sim, dependendo do valor", 12],
            ["Ainda não", 2, "frio"],
          ]),
          analise("Avaliando sua aplicação…", [
            "Conferindo faturamento",
            "Analisando o gargalo",
            "Verificando encaixe",
          ]),
          captura(
            "Aplicação quase pronta",
            "Deixe seu contato para receber o resultado da aplicação.",
            "Enviar aplicação",
          ),
          resultado(
            "Aplicação recebida",
            "Vamos analisar e responder. Se houver encaixe, enviamos um convite para conversar.",
          ),
        ],
        [
          "Abertura",
          "Faturamento",
          "Gargalo",
          "Dedicação",
          "Investimento",
          "Análise",
          "Captura",
          "Resultado",
        ],
      ),
  },
  {
    slug: "marketing-diagnostico",
    name: "Marketing — diagnóstico de aquisição",
    niche: "marketing",
    emoji: "📈",
    presetId: "ocean",
    description: "Mede a maturidade de aquisição e mostra o buraco antes de propor a solução.",
    build: () =>
      montar(
        "ocean",
        [
          abertura(
            "Descubra onde seu marketing está perdendo cliente",
            "Oito perguntas. No fim você vê a sua nota e o que corrigir primeiro.",
            "Ver meu diagnóstico",
          ),
          pergunta("Você tem uma fonte previsível de clientes?", [
            ["Sim, previsível", 10, "maduro"],
            ["Vem, mas oscila", 6],
            ["Depende de indicação", 3],
            ["Não tenho", 0, "critico"],
          ]),
          pergunta("Já investe em tráfego pago?", [
            ["Sim, com gestor", 10],
            ["Sim, por conta própria", 6],
            ["Já tentei e parei", 3, "frustrado"],
            ["Nunca investi", 1],
          ]),
          pergunta("Você mede o custo por lead?", [
            ["Sim, acompanho semanalmente", 12, "mede"],
            ["Olho de vez em quando", 6],
            ["Não sei o que é", 0, "critico"],
          ]),
          pergunta("O que travou até aqui?", [
            ["Falta de verba", 4],
            ["Falta de tempo", 6],
            ["Já gastei e não voltou", 8, "queimado"],
            ["Não sei o que fazer", 5],
          ]),
          analise("Calculando sua nota de aquisição…", [
            "Somando suas respostas",
            "Comparando com o mercado",
            "Calculando sua nota",
          ]),
          captura(
            "Seu diagnóstico está pronto",
            "Deixe o contato para receber a nota e o plano de correção.",
            "Ver minha nota",
          ),
          resultado(
            "Diagnóstico concluído",
            "Identificamos onde o seu funil perde cliente. Vamos te mostrar por onde começar.",
          ),
        ],
        [
          "Abertura",
          "Previsibilidade",
          "Tráfego",
          "Medição",
          "Trava",
          "Análise",
          "Captura",
          "Resultado",
        ],
      ),
  },
  {
    slug: "saude-triagem",
    name: "Saúde — triagem de avaliação",
    niche: "saude",
    emoji: "🩺",
    presetId: "emerald",
    description: "Organiza queixa, tempo e urgência antes da consulta — sem prometer diagnóstico.",
    build: () =>
      montar(
        "emerald",
        [
          abertura(
            "Organize sua queixa antes da consulta",
            "Isto não substitui avaliação profissional. Serve para a equipe chegar preparada.",
            "Começar",
          ),
          pergunta("Há quanto tempo você sente isso?", [
            ["Menos de uma semana", 6],
            ["De uma semana a um mês", 10],
            ["De um a seis meses", 12, "cronico"],
            ["Mais de seis meses", 15, "cronico"],
          ]),
          pergunta("Quanto atrapalha sua rotina?", [
            ["Não consigo trabalhar", 20, "urgente"],
            ["Atrapalha bastante", 14],
            ["Atrapalha um pouco", 8],
            ["Quase nada", 3],
          ]),
          pergunta("Já procurou atendimento para isso?", [
            ["Sim, sem melhora", 12, "recorrente"],
            ["Sim, melhorou e voltou", 10],
            ["Não, é a primeira vez", 6],
          ]),
          pergunta("Com que urgência quer ser atendido?", [
            ["O quanto antes", 15, "urgente"],
            ["Nesta semana", 10],
            ["Sem pressa", 4],
          ]),
          analise("Organizando as informações para a equipe…", [
            "Registrando a queixa",
            "Classificando a urgência",
            "Enviando para a equipe",
          ]),
          captura(
            "Quase lá",
            "Deixe seu contato para a equipe retornar com os horários disponíveis.",
            "Quero ser atendido",
          ),
          resultado(
            "Informações registradas",
            "A equipe vai entrar em contato para agendar. Em caso de urgência, procure atendimento presencial.",
          ),
        ],
        [
          "Abertura",
          "Duração",
          "Impacto",
          "Histórico",
          "Urgência",
          "Análise",
          "Captura",
          "Resultado",
        ],
      ),
  },
  {
    slug: "ecommerce-produto-ideal",
    name: "E-commerce — produto ideal",
    niche: "ecommerce",
    emoji: "🛍️",
    presetId: "sunset",
    description: "Recomenda o produto certo e captura o contato de quem ainda não comprou.",
    build: () =>
      montar(
        "sunset",
        [
          abertura(
            "Descubra qual é o seu produto ideal",
            "Quatro perguntas e a gente diz qual combina com você.",
            "Descobrir",
          ),
          pergunta("Para quem é a compra?", [
            ["Para mim", 10],
            ["Para presentear", 8, "presente"],
            ["Para a casa", 8],
          ]),
          pergunta("O que pesa mais na sua decisão?", [
            ["Qualidade", 12, "qualidade"],
            ["Preço", 8, "preco"],
            ["Entrega rápida", 10, "prazo"],
            ["Marca", 8],
          ]),
          pergunta("Qual faixa de investimento?", [
            ["Acima de R$ 500", 15, "alto-ticket"],
            ["De R$ 200 a R$ 500", 10],
            ["Até R$ 200", 5],
          ]),
          pergunta("Quando pretende comprar?", [
            ["Hoje", 15, "urgente"],
            ["Esta semana", 10],
            ["Ainda pesquisando", 3, "frio"],
          ]),
          analise("Buscando o produto que combina com você…", [
            "Lendo suas preferências",
            "Comparando o catálogo",
            "Escolhendo a recomendação",
          ]),
          captura(
            "Sua recomendação está pronta",
            "Deixe o contato para receber a recomendação e um cupom de primeira compra.",
            "Ver recomendação",
          ),
          resultado(
            "Encontramos seu produto",
            "Enviamos a recomendação no seu WhatsApp, junto do cupom.",
          ),
        ],
        ["Abertura", "Para quem", "Critério", "Faixa", "Prazo", "Análise", "Captura", "Resultado"],
      ),
  },
];
