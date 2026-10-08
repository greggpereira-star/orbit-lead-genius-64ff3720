import type { QuizBlock, QuizSchema, QuizStep, ScoreTier } from "../types";
import { getSteps } from "./steps";
import { saltosEntreEtapas, saltosParaTras, etapasEmCiclo, listarEtapas } from "./ciclosDeSalto";

export interface Achado {
  nivel: "bloqueia" | "avisa";
  mensagem: string;
}

/** Blocos que podem capturar contato. Sem um deles, o quiz não gera lead. */
const BLOCOS_DE_CAPTURA = ["email", "phone", "form"];

/**
 * Checagens antes de deixar um quiz ir ao ar.
 *
 * O caso que motivou isto: um quiz publicado SEM nenhum bloco de captura roda
 * normalmente, pontua, grava submissão — e nunca gera um lead. Não há erro em
 * lugar nenhum; o sintoma é só a lista de leads vazia, e levou dias para ser
 * encontrado. O inlead tem a mesma checagem, com as palavras
 * "Nenhuma etapa de captura identificada".
 *
 * Separado em `bloqueia` e `avisa` de propósito: um quiz sem faixa configurada
 * é uma escolha legítima, um quiz sem captura quase nunca é.
 */
export function validarPublicacao(schema: QuizSchema, tiers?: ScoreTier[]): Achado[] {
  const achados: Achado[] = [];
  /* `keepEmpty` para enxergar as etapas vazias: sem ele `getSteps` as poda e a
     checagem abaixo nunca via nenhuma — descoberto escrevendo o teste. */
  const steps: QuizStep[] = getSteps(schema, { keepEmpty: true });
  const blocos = schema.blocks ?? [];

  if (steps.length === 0 || blocos.length === 0) {
    achados.push({ nivel: "bloqueia", mensagem: "O quiz não tem nenhuma etapa com conteúdo." });
    // Sem etapa, as checagens seguintes não têm o que dizer.
    return achados;
  }

  /* `Texto curto` com máscara de telefone também captura — o player passou a
     aceitá-lo. Os dois lados precisam concordar, senão a validação barra um
     quiz que na prática funciona, ou libera um que não. */
  const temCaptura = blocos.some(
    (b) =>
      BLOCOS_DE_CAPTURA.includes(b.type) || (b.type === "short-text" && b.fieldMask === "telefone"),
  );
  if (!temCaptura) {
    achados.push({
      nivel: "bloqueia",
      mensagem:
        "Nenhuma etapa de captura identificada. Sem um bloco de E-mail, Telefone ou Formulário, " +
        "o quiz roda e pontua, mas nunca gera lead.",
    });
  }

  /* Etapa vazia AVISA, não barra — e a mensagem diz a verdade. A primeira
     versão afirmava que o visitante veria uma tela em branco; ele não vê:
     `getSteps` poda as vazias ao renderizar. O problema real é outro, e é do
     autor: ele criou uma tela e não preencheu. */
  const vazias = steps.filter((s) => s.blockIds.length === 0);
  if (vazias.length) {
    achados.push({
      nivel: "avisa",
      mensagem: `${vazias.length} etapa(s) sem nenhum componente — elas são ignoradas no quiz publicado.`,
    });
  }

  /* Dois blocos Botão na mesma etapa: só o ÚLTIMO avança, os outros precisam
     de link próprio para fazer alguma coisa. Antes o aviso aqui era outro — que
     um botão fora do fim sumia —, e ele existia para explicar um comportamento
     que não era intencional. Com o Botão explícito passando a ser o dono do
     avanço, aquilo deixou de acontecer, e o que resta é este caso bem mais
     estreito. */
  const etapasComBotaoMudo = steps.filter((st) => {
    const botoes = st.blockIds
      .map((id) => blocos.find((b) => b.id === id))
      .filter(
        (b): b is QuizBlock => !!b && b.type === "button" && (b.posicao ?? "fluxo") === "fluxo",
      );
    if (botoes.length < 2) return false;
    // O último avança; os anteriores só valem se levarem a algum lugar.
    return botoes.slice(0, -1).some((b) => !b.ctaUrl?.trim());
  });
  if (etapasComBotaoMudo.length) {
    achados.push({
      nivel: "avisa",
      mensagem:
        `${etapasComBotaoMudo.length} etapa(s) têm mais de um Botão sem link próprio — ` +
        "só o último avança a etapa, os outros não fazem nada.",
    });
  }

  // Salto apontando para bloco que não existe mais deixa o visitante preso.
  const ids = new Set(blocos.map((b) => b.id));
  const saltosQuebrados = blocos
    .flatMap((b) => [
      ...(b.options ?? []).map((o) => o.jumpToBlockId),
      ...(b.logicRules ?? []).map((r) => r.jumpToBlockId),
    ])
    .filter((id): id is string => !!id && !ids.has(id));
  if (saltosQuebrados.length) {
    achados.push({
      nivel: "bloqueia",
      mensagem: `${saltosQuebrados.length} salto(s) apontam para um componente que não existe mais.`,
    });
  }

  /* Laço fechado só por saltos: existe conjunto de respostas que faz a pessoa
     sair de uma etapa e voltar a ela para sempre. Num funil de captação isso
     não é incômodo, é perda total daquele visitante — por isso bloqueia.

     Voltar atrás, sozinho, só avisa: "responda de novo" é uso legítimo, e o
     que o autor precisa é notar que criou o caminho de volta. */
  const saltos = saltosEntreEtapas(steps, blocos);
  const ciclo = etapasEmCiclo(saltos);
  if (ciclo.length) {
    achados.push({
      nivel: "bloqueia",
      mensagem:
        `${listarEtapas(ciclo)} formam um laço de saltos: quem cair nele responde e volta ` +
        "para a mesma etapa sem nunca chegar ao fim.",
    });
  } else {
    const paraTras = saltosParaTras(saltos);
    if (paraTras.length) {
      const origens = [...new Set(paraTras.map((s) => s.de))].sort((a, b) => a - b);
      achados.push({
        nivel: "avisa",
        mensagem:
          `${listarEtapas(origens)} tem salto que volta para uma etapa anterior. ` +
          "Confirme que existe caminho de saída depois dela.",
      });
    }
  }

  const faixas = tiers ?? [];
  if (faixas.length) {
    const semMensagem = faixas.filter((t) => !t.whatsappTemplate?.trim());
    if (semMensagem.length) {
      achados.push({
        nivel: "avisa",
        mensagem: `${semMensagem.length} faixa(s) sem mensagem de WhatsApp — quem cair nelas não recebe nada.`,
      });
    }
  } else {
    achados.push({
      nivel: "avisa",
      mensagem: "Nenhuma faixa de pontuação configurada — todos os leads chegam sem classificação.",
    });
  }

  const temResultado = blocos.some((b) => b.type === "result");
  if (!temResultado) {
    achados.push({
      nivel: "avisa",
      mensagem: "Nenhum bloco de Resultado — o visitante termina sem ver um desfecho.",
    });
  }

  return achados;
}
