import type { QuizSchema, QuizStep, ScoreTier } from '../types';
import { getSteps } from './steps';

export interface Achado {
  nivel: 'bloqueia' | 'avisa';
  mensagem: string;
}

/** Blocos que podem capturar contato. Sem um deles, o quiz não gera lead. */
const BLOCOS_DE_CAPTURA = ['email', 'phone', 'form'];

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
    achados.push({ nivel: 'bloqueia', mensagem: 'O quiz não tem nenhuma etapa com conteúdo.' });
    // Sem etapa, as checagens seguintes não têm o que dizer.
    return achados;
  }

  /* `Texto curto` com máscara de telefone também captura — o player passou a
     aceitá-lo. Os dois lados precisam concordar, senão a validação barra um
     quiz que na prática funciona, ou libera um que não. */
  const temCaptura = blocos.some(
    (b) => BLOCOS_DE_CAPTURA.includes(b.type) || (b.type === 'short-text' && b.fieldMask === 'telefone'),
  );
  if (!temCaptura) {
    achados.push({
      nivel: 'bloqueia',
      mensagem:
        'Nenhuma etapa de captura identificada. Sem um bloco de E-mail, Telefone ou Formulário, ' +
        'o quiz roda e pontua, mas nunca gera lead.',
    });
  }

  /* Etapa vazia AVISA, não barra — e a mensagem diz a verdade. A primeira
     versão afirmava que o visitante veria uma tela em branco; ele não vê:
     `getSteps` poda as vazias ao renderizar. O problema real é outro, e é do
     autor: ele criou uma tela e não preencheu. */
  const vazias = steps.filter((s) => s.blockIds.length === 0);
  if (vazias.length) {
    achados.push({
      nivel: 'avisa',
      mensagem: `${vazias.length} etapa(s) sem nenhum componente — elas são ignoradas no quiz publicado.`,
    });
  }

  // Salto apontando para bloco que não existe mais deixa o visitante preso.
  const ids = new Set(blocos.map((b) => b.id));
  const saltosQuebrados = blocos.flatMap((b) => [
    ...(b.options ?? []).map((o) => o.jumpToBlockId),
    ...(b.logicRules ?? []).map((r) => r.jumpToBlockId),
  ]).filter((id): id is string => !!id && !ids.has(id));
  if (saltosQuebrados.length) {
    achados.push({
      nivel: 'bloqueia',
      mensagem: `${saltosQuebrados.length} salto(s) apontam para um componente que não existe mais.`,
    });
  }

  const faixas = tiers ?? [];
  if (faixas.length) {
    const semMensagem = faixas.filter((t) => !t.whatsappTemplate?.trim());
    if (semMensagem.length) {
      achados.push({
        nivel: 'avisa',
        mensagem: `${semMensagem.length} faixa(s) sem mensagem de WhatsApp — quem cair nelas não recebe nada.`,
      });
    }
  } else {
    achados.push({
      nivel: 'avisa',
      mensagem: 'Nenhuma faixa de pontuação configurada — todos os leads chegam sem classificação.',
    });
  }

  const temResultado = blocos.some((b) => b.type === 'result');
  if (!temResultado) {
    achados.push({
      nivel: 'avisa',
      mensagem: 'Nenhum bloco de Resultado — o visitante termina sem ver um desfecho.',
    });
  }

  return achados;
}
