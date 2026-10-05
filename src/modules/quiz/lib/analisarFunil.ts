import type { QuizSchema, QuizStep, ScoreTier } from '../types';
import { validarPublicacao } from './validarPublicacao';
import type { ConversaoDaEtapa } from './stepConversion';
import { MINIMO_PARA_NOTA } from './stepConversion';

export type Severidade = 'critico' | 'atencao' | 'sugestao';

export interface Achado {
  id: string;
  severidade: Severidade;
  titulo: string;
  /** Por que isso importa — sempre com o número que sustenta a afirmação. */
  detalhe: string;
  /** O que fazer. Concreto, nunca "melhore a copy". */
  acao: string;
  /** Índice da etapa a que se refere, quando houver. */
  etapa?: number;
}

export interface Analise {
  problemas: Achado[];
  funcionando: string[];
  /** Quantos visitantes sustentam a análise. Abaixo do mínimo, a parte de
   *  métricas é omitida em vez de inventar conclusão. */
  visitantes: number;
  temDadosSuficientes: boolean;
}

export interface EntradaDaAnalise {
  schema: QuizSchema;
  steps: QuizStep[];
  conversao: ConversaoDaEtapa[];
  tiers?: ScoreTier[];
  metricas?: {
    starts: number;
    completions: number;
    leadsCaptured: number;
  };
}

const ORDEM: Record<Severidade, number> = { critico: 0, atencao: 1, sugestao: 2 };

/** Etapas acima disto quase sempre custam mais abandono do que ganham em dados. */
const ETAPAS_DEMAIS = 15;

/**
 * Auditoria de conversão do funil.
 *
 * Determinística de propósito: toda afirmação daqui sai de uma contagem, e o
 * texto cita o número que a sustenta. É a mesma disciplina do resto do projeto
 * — nada é afirmado sem fonte. Uma camada de linguagem por cima pode depois
 * redigir e priorizar, mas não deve ser ela a decidir o que é verdade.
 */
export function analisarFunil(entrada: EntradaDaAnalise): Analise {
  const { schema, steps, conversao, tiers, metricas } = entrada;
  const problemas: Achado[] = [];
  const funcionando: string[] = [];

  // ---- Estrutura: reaproveita as mesmas regras que barram a publicação ----
  for (const a of validarPublicacao(schema, tiers)) {
    problemas.push({
      id: `estrutura:${a.mensagem.slice(0, 24)}`,
      severidade: a.nivel === 'bloqueia' ? 'critico' : 'atencao',
      titulo: a.nivel === 'bloqueia' ? 'Impede o funil de funcionar' : 'Vale conferir',
      detalhe: a.mensagem,
      acao: a.nivel === 'bloqueia' ? 'Corrija antes de publicar de novo.' : 'Revise no construtor.',
    });
  }

  // ---- Estrutura: desenho do funil ----
  if (steps.length > ETAPAS_DEMAIS) {
    problemas.push({
      id: 'funil-longo',
      severidade: 'atencao',
      titulo: 'Funil longo',
      detalhe: `${steps.length} etapas. Cada etapa é uma chance de abandono.`,
      acao: `Junte perguntas relacionadas numa etapa só e tente chegar a ${ETAPAS_DEMAIS} ou menos.`,
    });
  }

  const indiceDaCaptura = steps.findIndex((s) =>
    s.blockIds.some((bid) => {
      const b = schema.blocks.find((x) => x.id === bid);
      return b && ['email', 'phone', 'form'].includes(b.type);
    }),
  );
  if (indiceDaCaptura === 0) {
    problemas.push({
      id: 'captura-cedo',
      severidade: 'atencao',
      titulo: 'Pede contato antes de entregar valor',
      detalhe: 'A captura está na primeira etapa, antes de qualquer pergunta.',
      acao: 'Mova a captura para depois do diagnóstico: quem já respondeu investiu tempo e entrega o contato com menos atrito.',
      etapa: 0,
    });
  }

  const pontuaveis = schema.blocks.filter((b) =>
    ['single-choice', 'multi-choice', 'rating'].includes(b.type),
  );
  const semPontuacao = pontuaveis.filter(
    (b) => b.type !== 'rating' && !(b.options ?? []).some((o) => (o.score ?? 0) !== 0),
  );
  if ((tiers?.length ?? 0) > 0 && semPontuacao.length) {
    problemas.push({
      id: 'sem-pontuacao',
      severidade: 'atencao',
      titulo: 'Perguntas que não pontuam',
      detalhe: `${semPontuacao.length} de ${pontuaveis.length} perguntas têm todas as opções valendo zero, mas o quiz classifica por faixa.`,
      acao: 'Dê pontuação às opções dessas perguntas, senão elas não influenciam a faixa do lead.',
    });
  }

  // ---- Métricas ----
  const visitantes = conversao[0]?.visitantes ?? 0;
  const comNota = conversao.filter((c) => c.taxa !== null);
  const temDadosSuficientes = comNota.length > 0;

  if (!temDadosSuficientes) {
    /* A medição POR ETAPA depende de `session_id`, gravado só a partir de
       05/10/2026. Um funil com visitas antigas tem `starts` alto e zero
       visitante por etapa — dizer "nenhuma visita registrada" ali contradiz o
       próprio cartão do quiz, que mostra os inícios. */
    const inicios = metricas?.starts ?? 0;
    const detalhe =
      visitantes > 0
        ? `${visitantes} visitante(s) por etapa — são precisos ${MINIMO_PARA_NOTA} para uma taxa confiável.`
        : inicios > 0
          ? `${inicios} visita(s) no período, mas nenhuma com medição por etapa ainda.`
          : 'Nenhuma visita registrada no período (0 no período).';
    problemas.push({
      id: 'sem-dados',
      severidade: 'sugestao',
      titulo: 'Ainda sem dados para analisar a conversão',
      detalhe,
      acao:
        inicios > 0 && visitantes === 0
          ? 'A medição por etapa começou em 05/10/2026; visitas anteriores a isso não entram. Volte em alguns dias.'
          : 'Leve tráfego ao funil e volte aqui. Abaixo do mínimo, qualquer taxa seria ruído.',
    });
  } else {
    // A maior queda do funil, com nome e número.
    const pior = [...comNota].sort((a, b) => (a.taxa ?? 1) - (b.taxa ?? 1))[0];
    const iPior = conversao.indexOf(pior);
    if (pior.taxa !== null && pior.taxa < 0.7) {
      const perdidos = pior.visitantes - pior.avancaram;
      problemas.push({
        id: `queda:${pior.stepId}`,
        severidade: pior.taxa < 0.4 ? 'critico' : 'atencao',
        titulo: `Maior queda do funil: etapa ${iPior + 1}`,
        detalhe: `${steps[iPior]?.name ?? `Etapa ${iPior + 1}`} perde ${Math.round((1 - pior.taxa) * 100)}% — ${perdidos} de ${pior.visitantes} visitantes param aqui.`,
        acao:
          iPior === 0
            ? 'A primeira etapa é a promessa: se ela perde gente, o anúncio e a pergunta de abertura não estão combinando.'
            : 'Veja se a pergunta é longa, confusa, ou pede algo que a pessoa ainda não quer dar neste ponto.',
        etapa: iPior,
      });
    }

    // Etapas boas, para não parecer que tudo está errado.
    const boas = conversao
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.taxa !== null && c.taxa >= 0.9);
    for (const { c, i } of boas.slice(0, 3)) {
      funcionando.push(
        `Etapa ${i + 1} (${steps[i]?.name ?? 'sem nome'}) retém ${Math.round((c.taxa ?? 0) * 100)}% de ${c.visitantes} visitantes.`,
      );
    }
  }

  if (metricas && metricas.starts > 0) {
    const conclusao = metricas.completions / metricas.starts;
    const captura = metricas.leadsCaptured / metricas.starts;
    if (conclusao < 0.2) {
      problemas.push({
        id: 'conclusao-baixa',
        severidade: 'atencao',
        titulo: 'Poucos chegam ao fim',
        detalhe: `${metricas.completions} de ${metricas.starts} visitantes concluíram (${Math.round(conclusao * 100)}%).`,
        acao: 'Encurte o funil ou antecipe o que o visitante ganha ao terminar.',
      });
    } else if (conclusao >= 0.4) {
      funcionando.push(`${Math.round(conclusao * 100)}% dos visitantes concluem o quiz.`);
    }

    /* Concluir sem virar lead é o pior desperdício do funil: a pessoa fez o
       percurso inteiro e nada ficou. Quase sempre é a captura no lugar errado,
       ou um campo obrigatório demais. */
    if (metricas.completions > 0 && metricas.leadsCaptured < metricas.completions * 0.7) {
      problemas.push({
        id: 'conclui-sem-virar-lead',
        severidade: 'critico',
        titulo: 'Conclui mas não vira lead',
        detalhe: `${metricas.completions} conclusões geraram só ${metricas.leadsCaptured} leads.`,
        acao: 'Confira se o bloco de captura aparece antes do fim e se nenhum campo obrigatório está travando o envio.',
      });
    } else if (captura >= 0.3) {
      funcionando.push(`${Math.round(captura * 100)}% dos visitantes viram lead.`);
    }
  }

  problemas.sort((a, b) => ORDEM[a.severidade] - ORDEM[b.severidade]);
  return { problemas, funcionando, visitantes, temDadosSuficientes };
}
