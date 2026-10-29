import type { QuizBlock, QuizSchema, ScoreTier } from "./types";
import { DESIGN_PRESETS } from "./design-presets";

/**
 * Quiz de qualificação da Mentoria Método & Decisão (Taciane Ladislau, Linhares/ES).
 *
 * Escrito em código, e não só no construtor, por três motivos: o teste anda o
 * quiz inteiro com perfis diferentes e confere pontuação, etiquetas e faixa;
 * a regra de pontos do plano comercial fica documentada ao lado dos números; e
 * o mesmo arquivo serve de fonte para o quiz da conta dela.
 *
 * PONTUAÇÃO = intenção de compra, NUNCA autorização profissional. Quem não
 * confirma registro ativo recebe a etiqueta PRATICA_PENDENTE e a tela final
 * muda, independentemente da faixa: a prática só avança com avaliação humana.
 *
 * Tabela do plano (soma 100):
 *   interesse na Dupla ........ 20   (individuais valem 14: continuam prioridade)
 *   disponibilidade p/ turma .. 20
 *   habilitação informada ..... 20   (a verificar com comprovação)
 *   avalia o investimento ..... 15
 *   pede conversa/proposta .... 15
 *   respondeu a qualificação .. 10   (canal de contato preferido — todas valem 10)
 *
 * Faixas (percentual do máximo ALCANÇÁVEL por esse visitante): 80+ prioritário,
 * 50–79 consultivo, abaixo disso qualificar mais, sem insistência.
 */

const PRESET = "rose";

export const ID = {
  intro: "m-intro",
  tecnica: "m-tecnica",
  formacao: "m-formacao",
  estagio: "m-estagio",
  habilitacao: "m-habilitacao",
  avisoHabilitacao: "m-aviso-habilitacao",
  avisoBotao: "m-aviso-botao",
  data: "m-data",
  investDupla: "m-invest-dupla",
  investIndividual: "m-invest-individual",
  conversa: "m-conversa",
  contato: "m-contato",
  cidade: "m-cidade",
  consentimento: "m-consentimento",
  form: "m-form",
  resultadoOk: "m-resultado-ok",
  resultadoPendente: "m-resultado-pendente",
} as const;

/** Ids de opção que as regras de exibição precisam citar. */
export const OPCAO = {
  dupla: "m-tecnica-dupla",
  habilitadoSim: "m-hab-sim",
} as const;

type Opcao = { id: string; label: string; score: number; tag?: string };

const escolha = (
  id: string,
  titulo: string,
  opcoes: Opcao[],
  extra: Partial<QuizBlock> = {},
): QuizBlock => ({
  id,
  type: "single-choice",
  title: titulo,
  required: true,
  options: opcoes,
  ...extra,
});

/* A frase legal aparece em DOIS lugares, de propósito: no aviso de quem não
   confirmou registro e na tela final de quem confirmou. Repetida em toda tela
   vira ruído, e ruído faz o visitante parar de ler justamente o que importa. */
const AVISO_HABILITACAO =
  "A mentoria não concede habilitação profissional; a prática depende da sua formação e das regras do seu conselho.";

/* Número de atendimento informado pela Taciane (27 99739-0013). A mensagem é
   genérica de propósito: nome, perfil ou pontuação do lead nunca entram na URL. */
export const WHATSAPP_ATENDIMENTO = "5527997390013";
const LINK_WHATSAPP =
  `https://wa.me/${WHATSAPP_ATENDIMENTO}?text=` +
  encodeURIComponent("Olá! Respondi o quiz da Mentoria Método & Decisão e quero falar com a equipe.");

export const FAIXAS_MENTORIA: ScoreTier[] = [
  { id: "faixa-prioridade", label: "Prioritário", minPercent: 80, color: "#16a34a" },
  { id: "faixa-consultivo", label: "Consultivo", minPercent: 50, color: "#d97706" },
  { id: "faixa-qualificar", label: "Qualificar mais", minPercent: 0, color: "#64748b" },
];

export function montarQuizMentoria(): QuizSchema {
  const preset = DESIGN_PRESETS.find((p) => p.id === PRESET);
  if (!preset) throw new Error(`Preset inexistente: ${PRESET}`);

  const blocos: QuizBlock[] = [
    {
      id: ID.intro,
      type: "intro",
      title: "Mentoria Método & Decisão — última edição de 2026",
      subtitle: "Presencial em Linhares/ES, até 2 participantes. Responda em 2 minutos e receba a modalidade certa para o seu perfil.",
      ctaLabel: "Começar",
    },
    escolha(ID.tecnica, "Qual técnica você deseja aperfeiçoar?", [
      { id: "m-tecnica-toxina", label: "Toxina Botulínica", score: 14, tag: "INTERESSE_TOXINA" },
      { id: "m-tecnica-preench", label: "Preenchimento Facial", score: 14, tag: "INTERESSE_PREENCHIMENTO" },
      { id: OPCAO.dupla, label: "As duas técnicas", score: 20, tag: "INTERESSE_DUPLA" },
    ]),
    escolha(ID.formacao, "Qual é a sua formação?", [
      { id: "m-form-biomed", label: "Biomedicina", score: 0, tag: "FORMACAO_BIOMEDICINA" },
      { id: "m-form-farm", label: "Farmácia", score: 0, tag: "FORMACAO_FARMACIA" },
      { id: "m-form-enf", label: "Enfermagem", score: 0, tag: "FORMACAO_ENFERMAGEM" },
      { id: "m-form-odonto", label: "Odontologia", score: 0, tag: "FORMACAO_ODONTOLOGIA" },
      { id: "m-form-fisio", label: "Fisioterapia", score: 0, tag: "FORMACAO_FISIOTERAPIA" },
      { id: "m-form-outra", label: "Outra", score: 0, tag: "FORMACAO_OUTRA" },
    ]),
    escolha(ID.estagio, "Em que momento você está na estética avançada?", [
      { id: "m-est-inicio", label: "Estou começando agora", score: 0, tag: "SEG01_INICIO" },
      { id: "m-est-cursos", label: "Já fiz cursos e quero me aperfeiçoar", score: 0, tag: "SEG02_APERFEICOAMENTO" },
      { id: "m-est-atua", label: "Já atuo e quero ampliar minhas técnicas", score: 0, tag: "SEG03_EXPANSAO" },
    ]),
    escolha(ID.habilitacao, "Hoje você tem registro ativo no conselho da sua profissão?", [
      { id: OPCAO.habilitadoSim, label: "Sim, registro ativo", score: 20, tag: "HABILITACAO_A_VERIFICAR" },
      { id: "m-hab-andamento", label: "Estou em processo de registro", score: 0, tag: "PRATICA_PENDENTE" },
      { id: "m-hab-nao", label: "Ainda não tenho registro", score: 0, tag: "PRATICA_PENDENTE" },
    ]),
    // Só para quem não confirmou registro: explica o limite antes de seguir.
    {
      id: ID.avisoHabilitacao,
      type: "alert",
      title: "Um aviso rápido",
      subtitle: AVISO_HABILITACAO + " Sem registro ativo, a equipe avalia caso a caso o que é possível.",
      showIf: { enabled: true, fieldBlockId: ID.habilitacao, op: "neq", value: OPCAO.habilitadoSim },
    },
    {
      id: ID.avisoBotao,
      type: "button",
      ctaLabel: "Entendi, continuar",
      showIf: { enabled: true, fieldBlockId: ID.habilitacao, op: "neq", value: OPCAO.habilitadoSim },
    },
    escolha(ID.data, "Você consegue estar em Linhares/ES na próxima turma? (14/11, a confirmar)", [
      { id: "m-data-sim", label: "Sim, consigo participar", score: 20, tag: "DATA_PROXIMA_TURMA" },
      { id: "m-data-aval", label: "Ainda estou avaliando", score: 6, tag: "DATA_AVALIANDO" },
      { id: "m-data-outra", label: "Preciso de outra data", score: 0, tag: "DATA_FUTURA" },
    ]),
    // Mesma pergunta, dois textos: só o preço que interessa a cada interesse.
    escolha(
      ID.investDupla,
      "Mentoria Dupla: R$ 5.000 (as duas individuais somam R$ 6.000). Quer conhecer as condições?",
      [
        { id: "m-inv-d-sim", label: "Sim, quero as condições", score: 15, tag: "CONDICAO_COMERCIAL" },
        { id: "m-inv-d-talvez", label: "Preciso entender melhor", score: 5 },
        { id: "m-inv-d-nao", label: "Fora do orçamento agora", score: 0, tag: "SENSIVEL_PRECO" },
      ],
      { showIf: { enabled: true, fieldBlockId: ID.tecnica, op: "eq", value: OPCAO.dupla } },
    ),
    escolha(
      ID.investIndividual,
      "Mentoria individual: R$ 3.000 por técnica. Quer conhecer as condições?",
      [
        { id: "m-inv-i-sim", label: "Sim, quero as condições", score: 15, tag: "CONDICAO_COMERCIAL" },
        { id: "m-inv-i-talvez", label: "Preciso entender melhor", score: 5 },
        { id: "m-inv-i-nao", label: "Fora do orçamento agora", score: 0, tag: "SENSIVEL_PRECO" },
      ],
      { showIf: { enabled: true, fieldBlockId: ID.tecnica, op: "neq", value: OPCAO.dupla } },
    ),
    escolha(ID.conversa, "Quer receber a proposta da equipe?", [
      { id: "m-conv-sim", label: "Sim, quero a proposta", score: 15, tag: "SOLICITOU_CONVERSA" },
      { id: "m-conv-info", label: "Só informações por enquanto", score: 5 },
    ]),
    escolha(ID.contato, "Como prefere ser atendida?", [
      { id: "m-ct-whats", label: "WhatsApp", score: 10, tag: "CANAL_WHATSAPP" },
      { id: "m-ct-lig", label: "Ligação", score: 10, tag: "CANAL_LIGACAO" },
      { id: "m-ct-email", label: "E-mail", score: 10, tag: "CANAL_EMAIL" },
    ]),
    {
      id: ID.cidade,
      type: "short-text",
      title: "Em qual cidade você mora?",
      placeholder: "Cidade / UF",
      required: true,
    },
    {
      id: ID.consentimento,
      type: "multi-choice",
      title: "Quer receber novidades?",
      subtitle: "Opcional. Seus dados são usados só para falar da mentoria; você pode pedir a exclusão quando quiser.",
      required: false,
      options: [
        {
          id: "m-consent-sim",
          label: "Sim, avisem sobre novas turmas",
          score: 0,
          tag: "CONSENTE_COMUNICACAO",
        },
      ],
    },
    {
      id: ID.form,
      type: "form",
      title: "Para onde enviamos as informações?",
      ctaLabel: "Quero conhecer a mentoria",
      required: true,
      formFields: { name: true, email: true, phone: true, phoneRequired: true },
    },
    {
      id: ID.resultadoOk,
      type: "result",
      resultTitle: "Recebemos o seu perfil",
      resultBody:
        "A equipe da Taciane vai te chamar para apresentar as datas e as condições. " + AVISO_HABILITACAO,
      ctaLabel: "Falar com a equipe",
      ctaUrl: LINK_WHATSAPP,
      showIf: { enabled: true, fieldBlockId: ID.habilitacao, op: "eq", value: OPCAO.habilitadoSim },
    },
    {
      id: ID.resultadoPendente,
      type: "result",
      resultTitle: "Recebemos o seu interesse",
      resultBody: "Antes de qualquer reserva, a equipe vai conversar com você sobre o que é possível na sua situação.",
      ctaLabel: "Falar com a equipe",
      ctaUrl: LINK_WHATSAPP,
      showIf: { enabled: true, fieldBlockId: ID.habilitacao, op: "neq", value: OPCAO.habilitadoSim },
    },
  ];

  const nomes: Record<string, string> = {
    [ID.intro]: "Abertura",
    [ID.tecnica]: "Técnica",
    [ID.formacao]: "Formação",
    [ID.estagio]: "Momento",
    [ID.habilitacao]: "Registro",
    [ID.avisoHabilitacao]: "Aviso de habilitação",
    [ID.data]: "Turma",
    [ID.investDupla]: "Investimento (dupla)",
    [ID.investIndividual]: "Investimento (individual)",
    [ID.conversa]: "Proposta",
    [ID.contato]: "Canal",
    [ID.cidade]: "Cidade",
    [ID.consentimento]: "Consentimento",
    [ID.form]: "Contato",
    [ID.resultadoOk]: "Resultado",
    [ID.resultadoPendente]: "Resultado (triagem)",
  };

  // O botão do aviso vive na mesma etapa do alerta.
  const steps = blocos
    .filter((b) => b.id !== ID.avisoBotao)
    .map((b) => ({
      id: `s-${b.id}`,
      blockIds: b.id === ID.avisoHabilitacao ? [b.id, ID.avisoBotao] : [b.id],
      name: nomes[b.id],
      ...(b.type === "result" ? { showBack: false } : {}),
    }));

  return { design: preset.design, results: [], blocks: blocos, steps };
}
