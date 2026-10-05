import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { quizService, captureQuizLead } from '../services/quizService';
import { usePixelTracking } from '@/modules/tracking/usePixelTracking';
import type { QuizBlock, QuizSchema, AccessRules, QuizDesign, BlockOption } from '../types';
import { getSteps } from '../lib/steps';
import { getContrastText, withAlpha } from '../lib/color';
import { getButtonStyle } from '../lib/buttonStyles';
import { designVars, contentWidth, verticalAlignClass } from '../lib/designVars';
import { estaNoFluxo, estiloDaPosicao } from '../lib/blockPosition';
import { aplicarMascara, tamanhoDaMascara, formatarPreco } from '../lib/fieldMask';
import { SchedulingField, type ValorAgendamento } from './SchedulingField';
import { parseRichText } from '../lib/richtext';
import { resolveContainerLayout, type Breakpoint } from '../lib/containerLayout';
import { resolveScope, interpolateText, evaluatePercent, type VariableScope } from '../lib/variables';
import { RichText } from './RichText';
import {
  ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from 'recharts';
import { resolveBlockStyle, resolveTextStyle } from '../lib/blockStyle';
import {
  createInitialState,
  evaluateResponse,
  recomputeScore,
  evaluateLogic,
  nextStepIndex,
  isBlockVisible,
  classifyTemperature,
  maxPossibleScore,
  type QuizRunState,
} from '../engine';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { CountdownTimer } from './CountdownTimer';
import { Sparkles, Hourglass, CheckCircle2, Bell, Gift, BellRing, X, Users, Star, Flame, PhoneCall, Mic, VolumeX, Check, PlayCircle, Image as ImageIcon, ArrowLeft } from 'lucide-react';
import type { SocialProofSettings, SocialProofMessage, SocialProofIcon, UrgencyBarSettings } from '../types';
import { DEFAULT_SOCIAL_PROOF, DEFAULT_URGENCY_BAR } from '../types';

const SOCIAL_PROOF_ICON_MAP: Record<SocialProofIcon, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  check: CheckCircle2,
  gift: Gift,
  users: Users,
  star: Star,
  fire: Flame,
  bell: Bell,
};

// Largura fixa do quiz em qualquer dispositivo (padrão validado por players de quiz-funnel
// como Funilix/Typeform): em telas largas o conteúdo fica centralizado com espaço nas
// laterais; em mobile ocupa 100% já que a viewport é menor que o máximo.
const QUIZ_MAX_WIDTH = 448;

type AccessState = 'checking' | 'allowed' | 'blocked';

function useAccessGate(rules: AccessRules | undefined, tracking: Record<string, string> | undefined, skip: boolean): AccessState {
  const [state, setState] = useState<AccessState>('checking');

  useEffect(() => {
    if (skip || !rules || !rules.enabled) {
      setState('allowed');
      return;
    }

    let cancelled = false;

    const fail = () => {
      if (!cancelled) setState('blocked');
    };

    const utmOk =
      (!rules.utmSource || (tracking?.utm_source ?? '').toLowerCase() === rules.utmSource.toLowerCase()) &&
      (!rules.utmCampaign || (tracking?.utm_campaign ?? '').toLowerCase() === rules.utmCampaign.toLowerCase());

    if (!utmOk) {
      fail();
      return;
    }

    if (rules.devices && rules.devices.length > 0) {
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const deviceType = isMobile ? 'mobile' : 'desktop';
      if (!rules.devices.includes(deviceType)) {
        fail();
        return;
      }
    }

    if (rules.countries && rules.countries.length > 0) {
      /* Esta chamada a terceiro FICA, ao contrário da que enriquecia a
         submissão com país e cidade (removida). A diferença é a finalidade:
         ali era coleta para relatório, aqui é a única forma de cumprir a
         restrição por país que o dono do quiz configurou — sem ela a regra não
         existe. Só dispara quando a restrição está ligada, e falha liberando. */
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      fetch('https://ipapi.co/json/', { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { country_code?: string } | null) => {
          clearTimeout(timeout);
          if (cancelled) return;
          const code = data?.country_code?.toUpperCase();
          if (code && rules.countries!.includes(code)) {
            setState('allowed');
          } else if (!code) {
            // Falha ao detectar país: não bloqueia (fail-open) para evitar travar visitantes legítimos
            setState('allowed');
          } else {
            setState('blocked');
          }
        })
        .catch(() => {
          clearTimeout(timeout);
          if (!cancelled) setState('allowed');
        });
      return () => {
        cancelled = true;
        clearTimeout(timeout);
        controller.abort();
      };
    }

    setState('allowed');
    return () => {
      cancelled = true;
    };
  }, [rules, tracking, skip]);

  return state;
}

const playerQuery = (slug: string, preview: boolean) => {
  const host = typeof window !== 'undefined' ? window.location.hostname : undefined;
  return queryOptions({
    queryKey: ['quiz-public', slug, preview ? 'preview' : 'published', host],
    queryFn: () =>
      preview ? quizService.getDraftBySlug(slug, host) : quizService.getPublishedBySlug(slug, host),
    staleTime: preview ? 0 : 60_000,
  });
};

export function QuizPlayer({
  slug,
  preview = false,
  tracking,
}: {
  slug: string;
  preview?: boolean;
  tracking?: Record<string, string>;
}) {
  const { data } = useSuspenseQuery(playerQuery(slug, preview));
  const accessRules = (data?.quiz.settings as { accessRules?: AccessRules } | undefined)?.accessRules;
  const accessState = useAccessGate(accessRules, tracking, preview || !data);

  useEffect(() => {
    if (accessState === 'blocked' && accessRules?.fallbackUrl) {
      window.location.href = accessRules.fallbackUrl;
    }
  }, [accessState, accessRules?.fallbackUrl]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white p-8">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Quiz não encontrado</h1>
          <p className="text-sm opacity-70">Verifique o link ou publique novamente o quiz.</p>
        </div>
      </div>
    );
  }

  if (accessState === 'checking' || accessState === 'blocked') {
    return <div className="min-h-screen bg-black" />;
  }

  return (
    <>
      {preview && (
        <div className="fixed top-2 right-2 z-50 px-3 py-1 rounded-full bg-[var(--aviso)] text-black text-xs font-semibold shadow">
          Preview (rascunho)
        </div>
      )}
      <PlayerRunner
        quizId={data.quiz.id}
        companyId={data.quiz.company_id}
        schema={data.schema}
        settings={data.quiz.settings as Record<string, unknown>}
        preview={preview}
        tracking={tracking}
      />
    </>
  );
}

function PlayerRunner({
  quizId,
  companyId,
  schema,
  settings,
  preview = false,
  tracking,
}: {
  quizId: string;
  companyId: string;
  schema: QuizSchema;
  settings?: Record<string, unknown>;
  preview?: boolean;
  tracking?: Record<string, string>;
}) {
  const [state, setState] = useState<QuizRunState>(createInitialState);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  /* Identidade da RESPOSTA, não da pessoa: é o que amarra a captura
     antecipada à conclusão para não virarem dois leads. Vive só nesta aba. */
  const sessionId = useRef<string>(crypto.randomUUID());
  /* Contato já enviado — evita repetir a mesma chamada a cada etapa. */
  const capturedContact = useRef<string | null>(null);
  /* A submissão é gravada UMA vez, venha o gatilho de onde vier. */
  const jaSalvou = useRef(false);

  const funnelPixels = useMemo(
    () => ({
      metaPixelId: settings?.meta_pixel_id as string | undefined,
      googleConversionId: settings?.google_conversion_id as string | undefined,
      googleLeadLabel: settings?.google_lead_label as string | undefined,
      googleCompleteLabel: settings?.google_complete_label as string | undefined,
    }),
    [settings],
  );
  const { trackStep, trackLead, trackComplete } = usePixelTracking({
    companyId,
    quizId,
    overrides: funnelPixels,
    tracking,
    enabled: !preview,
  });
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stepValidity, setStepValidity] = useState<Record<string, boolean>>({});

  const design = schema.design;
  const blocks = schema.blocks;
  const steps = useMemo(() => getSteps(schema), [schema]);
  const currentStep = steps[state.currentStepIndex];
  const stepBlocks = useMemo(
    () => (currentStep ? (currentStep.blockIds.map((id) => blocks.find((b) => b.id === id)).filter(Boolean) as QuizBlock[]) : []),
    [currentStep, blocks]
  );
  // Escopo do motor de variáveis/fórmulas: {nomeDaVariavel: valor}, recalculado a
  // cada resposta nova — usado tanto pra exibição condicional em modo fórmula
  // (ex.: IMC = peso/(altura/100)^2) quanto pra interpolar {{variavel}} nos textos.
  const scope = useMemo(() => resolveScope(blocks, state.responses, { score: state.score }), [blocks, state.responses, state.score]);

  // Exibição condicional: só renderiza (e pontua) blocos cuja condição é verdadeira
  // frente às respostas já registradas das etapas anteriores.
  const visibleStepBlocks = useMemo(
    () => stepBlocks.filter((b) => isBlockVisible(b, state.responses, scope)),
    [stepBlocks, state.responses, scope]
  );
  const isLastStep = state.currentStepIndex >= steps.length - 1;

  const stepHasVisibleBlocks = (stepIdx: number, responses: Record<string, unknown>): boolean => {
    const s = steps[stepIdx];
    if (!s) return false;
    const localScope = resolveScope(blocks, responses);
    return s.blockIds.some((bid) => {
      const b = blocks.find((x) => x.id === bid);
      return b ? isBlockVisible(b, responses, localScope) : false;
    });
  };

  const urgencyBar: UrgencyBarSettings = useMemo(
    () => ({ ...DEFAULT_URGENCY_BAR, ...(settings?.urgency_bar as Partial<UrgencyBarSettings> | undefined) }),
    [settings]
  );
  const socialProof: SocialProofSettings = useMemo(
    () => ({ ...DEFAULT_SOCIAL_PROOF, ...(settings?.social_proof as Partial<SocialProofSettings> | undefined) }),
    [settings]
  );

  const draftResponses = useRef<Record<string, unknown>>({});

  useEffect(() => {
    draftResponses.current = {};
    setStepValidity({});
  }, [state.currentStepIndex]);

  /* A geolocalização saía daqui, do navegador, por uma chamada a `ipapi.co` em
     TODA carga pública: o IP do visitante ia a um terceiro antes de qualquer
     aceite, o que não se sustenta sob a LGPD. E nem funcionava bem — medido na
     base: 1 de 5 submissões tinha país; nas outras a chamada voltou bloqueada.
     Removida. Se o recorte geográfico voltar a ser necessário, o lugar é o
     servidor, resolvendo pelo IP da requisição, sob o nosso controle e depois
     do consentimento. */

  // Etapa cujos blocos estão TODOS ocultos pela condição: pula pra próxima com
  // conteúdo visível (etapa condicional inteira que não se aplica a este visitante).
  useEffect(() => {
    if (done || stepBlocks.length === 0 || visibleStepBlocks.length > 0) return;
    let idx = state.currentStepIndex + 1;
    while (idx < steps.length && !stepHasVisibleBlocks(idx, state.responses)) idx += 1;
    if (idx < steps.length) {
      setState((s) => ({ ...s, currentStepIndex: idx }));
      return;
    }
    /* Não existe etapa adiante com conteúdo visível: isto é o fim do quiz, e
       não um lugar para ficar. Antes o `if` acima simplesmente não fazia nada
       e o visitante parava numa tela sem bloco, sem botão e sem conclusão —
       um beco sem saída que nem erro gerava. Encerrar aqui também garante que
       a resposta seja gravada, que é o que de fato importa. */
    void finish(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStepIndex, done, visibleStepBlocks.length]);

  /**
   * Volta para a etapa anterior que este visitante realmente viu.
   *
   * Não é `currentStepIndex - 1`: com salto condicional e etapa oculta, a
   * anterior na lista pode ser uma tela que ele nunca viu — voltar para ela
   * mostraria pergunta fora de contexto, ou cairia de novo no pulo automático
   * e devolveria a pessoa para onde ela estava, parecendo que o botão não
   * funciona. O histórico guarda o caminho de verdade.
   */
  const historicoDeEtapas = useRef<number[]>([]);
  const podeVoltar = historicoDeEtapas.current.length > 0 && !done;
  const voltarEtapa = () => {
    const anterior = historicoDeEtapas.current.pop();
    if (anterior === undefined) return;
    setState((s) => ({ ...s, currentStepIndex: anterior }));
  };

  const variantAssignments = useRef<Map<string, string>>(new Map());
  const effectiveBlocks = useMemo(() => {
    return visibleStepBlocks.map((b) => {
      if (!b.abTest?.enabled || b.abTest.variants.length === 0) return b;
      let variantId = variantAssignments.current.get(b.id);
      if (!variantId) {
        const options = ['control', ...b.abTest.variants.map((v) => v.id)];
        variantId = options[Math.floor(Math.random() * options.length)];
        variantAssignments.current.set(b.id, variantId);
      }
      if (variantId === 'control') return b;
      const variant = b.abTest.variants.find((v) => v.id === variantId);
      if (!variant) return b;
      return {
        ...b,
        title: variant.title ?? b.title,
        subtitle: variant.subtitle ?? b.subtitle,
        ctaLabel: variant.ctaLabel ?? b.ctaLabel,
        imageUrl: variant.imageUrl ?? b.imageUrl,
      };
    });
  }, [visibleStepBlocks]);

  /**
   * Altura das barras fixas, medida no DOM e devolvida como espaçamento.
   *
   * Fora do fluxo elas não ocupam espaço, e a barra do topo cobria o título da
   * pergunta. Medir é o único jeito honesto: a altura depende do bloco que o
   * usuário pôs ali, e chutar um valor daria tanto sobra quanto sobreposição.
   *
   * Os dois `ref` são `useCallback` com dependência vazia DE PROPÓSITO. Na
   * primeira versão eles eram recriados a cada render; o React reanexa um ref
   * de callback sempre que a identidade muda, cada reanexo media e chamava
   * `setState`, e isso renderizava de novo — laço infinito, erro React #185 na
   * cara do visitante. O observador antigo também precisa ser desconectado,
   * senão cada reanexo deixava mais um observando o mesmo elemento.
   */
  const [alturaFixa, setAlturaFixa] = useState({ topo: 0, rodape: 0 });
  const obsTopo = useRef<ResizeObserver | null>(null);
  const obsRodape = useRef<ResizeObserver | null>(null);

  const refTopo = useCallback((el: HTMLDivElement | null) => {
    obsTopo.current?.disconnect();
    obsTopo.current = null;
    if (!el) {
      setAlturaFixa((a) => (a.topo === 0 ? a : { ...a, topo: 0 }));
      return;
    }
    const medir = () => {
      const h = el.getBoundingClientRect().height;
      setAlturaFixa((a) => (Math.abs(a.topo - h) < 1 ? a : { ...a, topo: h }));
    };
    medir();
    obsTopo.current = new ResizeObserver(medir);
    obsTopo.current.observe(el);
  }, []);

  const refRodape = useCallback((el: HTMLDivElement | null) => {
    obsRodape.current?.disconnect();
    obsRodape.current = null;
    if (!el) {
      setAlturaFixa((a) => (a.rodape === 0 ? a : { ...a, rodape: 0 }));
      return;
    }
    const medir = () => {
      const h = el.getBoundingClientRect().height;
      setAlturaFixa((a) => (Math.abs(a.rodape - h) < 1 ? a : { ...a, rodape: h }));
    };
    medir();
    obsRodape.current = new ResizeObserver(medir);
    obsRodape.current.observe(el);
  }, []);

  useEffect(() => () => {
    obsTopo.current?.disconnect();
    obsRodape.current?.disconnect();
  }, []);

  /* Último bloco que de fato está no fluxo da etapa. É dele o botão que avança;
     um bloco fixo ou flutuante nunca deve assumir esse papel. */
  const ultimoNoFluxo = useMemo(() => {
    const noFluxo = effectiveBlocks.filter(estaNoFluxo);
    return noFluxo[noFluxo.length - 1]?.id ?? effectiveBlocks[effectiveBlocks.length - 1]?.id;
  }, [effectiveBlocks]);

  useEffect(() => {
    if (preview) return;
    quizService.trackEvent({ quizId, companyId, eventType: 'start', sessionId: sessionId.current }).catch(() => {});
  }, [quizId, companyId, preview]);

  // Cada etapa vista vira um ViewContent. Junto com o Lead e a conclusão, é o
  // que dá ao Meta material para otimizar por quem chega ao fim, e não só por
  // quem clica no anúncio.
  useEffect(() => {
    if (!currentStep) return;
    trackStep(state.currentStepIndex, currentStep.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id]);

  useEffect(() => {
    if (preview) return;
    for (const b of stepBlocks) {
      quizService
        .trackEvent({
          quizId,
          companyId,
          submissionId,
          eventType: 'block_view',
          blockId: b.id,
          sessionId: sessionId.current,
          metadata: { variant_id: variantAssignments.current.get(b.id) ?? 'control' },
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id, quizId, companyId, submissionId, preview]);

  if (stepBlocks.length === 0) {
    return <EmptyState message="Quiz sem blocos" />;
  }

  // Blocos "filhos" de um Container não aparecem em visibleStepBlocks (só o
  // Container aparece) — "achata" a lista trocando cada Container pelos seus
  // filhos visíveis, pra validação, pontuação e persistência de resposta
  // tratarem um bloco dentro de um Container exatamente como um bloco solto.
  const flatAnswerableBlocks = useMemo(() => {
    const out: QuizBlock[] = [];
    for (const b of visibleStepBlocks) {
      if (b.type === 'container') {
        out.push(
          ...(b.childBlockIds ?? [])
            .map((id) => blocks.find((x) => x.id === id))
            .filter((child): child is QuizBlock => !!child && isBlockVisible(child, state.responses, scope))
        );
      } else {
        out.push(b);
      }
    }
    return out;
  }, [visibleStepBlocks, blocks, state.responses, scope]);

  const allStepValid = flatAnswerableBlocks.every((b) => stepValidity[b.id] !== false);

  const advanceStep = async (finalDraft: Record<string, unknown>) => {
    let scoreDelta = 0;
    const tags: string[] = [];
    let jumpToBlockId: string | undefined;
    const nextResponses = { ...state.responses };
    for (const b of flatAnswerableBlocks) {
      const response = finalDraft[b.id];
      nextResponses[b.id] = response;
      const evaluated = evaluateResponse(b, response);
      scoreDelta += evaluated.scoreDelta;
      tags.push(...evaluated.tags);
      if (evaluated.jumpToBlockId) jumpToBlockId = evaluated.jumpToBlockId;
      if (!preview && b.abTest?.enabled) {
        quizService
          .trackEvent({
            quizId,
            companyId,
            submissionId,
            eventType: 'block_advance',
            blockId: b.id,
            sessionId: sessionId.current,
            metadata: { variant_id: variantAssignments.current.get(b.id) ?? 'control' },
          })
          .catch(() => {});
      }
    }
    /* Recalculado, não acumulado: com o botão voltar, somar o delta a cada
       avanço contaria a mesma resposta duas vezes e deixaria o visitante
       inflar a própria pontuação indo e voltando. `scoreDelta` e `tags` ainda
       existem acima porque o salto condicional depende deles nesta passagem. */
    const recalculado = recomputeScore(blocks, nextResponses);

    /* As regras de salto são avaliadas DEPOIS do laço, e não dentro dele.
       Dentro, cada bloco só enxergava as respostas dos anteriores — e uma regra
       por quantidade ou porcentagem precisa do acumulado fechado desta etapa.
       Vence a última regra que bate, na ordem dos blocos, que é o que
       `nextStepIndex` já documentava esperar. */
    const ctxLogica = {
      responses: nextResponses,
      blocks,
      score: recalculado.score,
      maxScore: maxPossibleScore(schema, nextResponses),
    };
    for (const b of flatAnswerableBlocks) {
      const salto = evaluateLogic(b, ctxLogica);
      if (salto) jumpToBlockId = salto;
    }
    const nextState: QuizRunState = {
      ...state,
      responses: nextResponses,
      score: recalculado.score,
      tags: recalculado.tags,
      history: [...state.history, ...flatAnswerableBlocks.map((b) => b.id)],
    };
    // Captura antecipada: assim que existe contato, o lead é gravado — mesmo
    // que a pessoa feche a página no meio. É exatamente esse visitante que
    // vale recuperar por e-mail depois.
    if (!preview) {
      const { email: emailNow, phone: phoneNow, name: nomeNow } = extrairContato(nextResponses, blocks);
      const chave = `${emailNow ?? ''}|${phoneNow ?? ''}`;
      if ((emailNow || phoneNow) && capturedContact.current !== chave) {
        capturedContact.current = chave;
        // Mesmo instante em que o lead nasce no CRM. Antes disso o Meta não
        // tem contato para casar; depois, o visitante já pode ter fechado.
        trackLead({ email: emailNow, phone: phoneNow }, { content_name: 'quiz_contato' });
        // Fire-and-forget: nunca segurar o avanço da etapa por causa disto.
        captureQuizLead({
          quizId,
          sessionId: sessionId.current,
          email: emailNow,
          phone: phoneNow,
          name: nomeNow,
          score: nextState.score,
          tracking,
          responses: nextResponses,
          completed: false,
        }).catch(() => {});
      }
    }

    if (isLastStep) {
      await finish(nextState);
      return;
    }
    let idx = nextStepIndex(steps, nextState, jumpToBlockId);
    // Pula etapas cujos blocos ficaram todos ocultos pela exibição condicional.
    while (idx < steps.length - 1 && !stepHasVisibleBlocks(idx, nextResponses)) idx += 1;
    if (!stepHasVisibleBlocks(idx, nextResponses)) {
      await finish(nextState);
      return;
    }
    // Registra de onde viemos ANTES de trocar de etapa: é isso que o botão
    // voltar consome, e é a única memória do caminho real deste visitante.
    historicoDeEtapas.current.push(state.currentStepIndex);
    const estadoFinal = { ...nextState, currentStepIndex: idx };
    setState(estadoFinal);
    /* Chegou na última etapa: grava agora. Se esta etapa tiver um bloco de
       resultado sem botão de avanço, não haverá um próximo clique — e esperar
       por ele é o que fazia o quiz perder todo mundo. */
    if (idx >= steps.length - 1 && !preview) {
      void finish(estadoFinal, false);
    }
  };

  /**
   * Grava a submissão.
   *
   * `mostrarTelaFinal` separa duas coisas que estavam juntas: SALVAR e trocar a
   * tela pela conclusão do sistema. Um quiz que termina num bloco `result`
   * desenhado pelo cliente — como o "diagnostico-beleza-natural", cujo último
   * bloco só tem o botão do WhatsApp — nunca chama o avanço de novo, então
   * `finish` jamais rodava e NADA era salvo: 7 pessoas percorreram o quiz
   * inteiro, preencheram nome, e-mail e telefone, e o CRM não registrou uma
   * linha. Agora a gravação acontece ao CHEGAR no fim, e a tela do cliente
   * continua sendo a que aparece.
   */
  const finish = async (finalState: QuizRunState, mostrarTelaFinal = true) => {
    if (jaSalvou.current) {
      if (mostrarTelaFinal) { setState(finalState); setDone(true); }
      return;
    }
    jaSalvou.current = true;
    setSaving(true);
    try {
      if (preview) {
        setState(finalState);
        if (mostrarTelaFinal) setDone(true);
        return;
      }
      const max = maxPossibleScore(schema);
      const temperature = classifyTemperature(finalState.score, max);
      const { email, phone, name } = extrairContato(finalState.responses, blocks);
      const enrichedTracking: Record<string, string> = {
        ...tracking,
        user_agent: navigator.userAgent,
      };
      const id = await quizService.submitPublic({
        quizId,
        companyId,
        responses: finalState.responses,
        score: finalState.score,
        tags: Array.from(new Set(finalState.tags)),
        temperature,
        email,
        phone,
        name,
        tracking: enrichedTracking,
        sessionId: sessionId.current,
      });
      setSubmissionId(id);
      await quizService
        .trackEvent({
          quizId,
          companyId,
          submissionId: id,
          eventType: 'complete',
          sessionId: sessionId.current,
          metadata: { score: finalState.score, temperature },
        })
        .catch(() => {});
      // Classificação por faixa e WhatsApp da faixa. Fire-and-forget: a tela de
      // resultado não espera pelo servidor de mensagens.
      void fetch('/api/public/quiz-completed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          quizId,
          sessionId: sessionId.current,
          score: finalState.score,
          nome: name,
          telefone: phone,
          variaveis: Object.fromEntries(
            Object.entries(resolveScope(blocks, finalState.responses)).map(([k, v]) => [k, String(v ?? '')]),
          ),
        }),
      }).catch(() => {});

      trackComplete({ email, phone }, {
        content_name: 'quiz_concluido',
        quiz_score: finalState.score,
        lead_temperature: temperature,
      });
      setState(finalState);
      if (mostrarTelaFinal) setDone(true);
    } catch (e) {
      /* Sem isto a exceção subia para o manipulador do clique e sumia. A trava
         volta atrás para a próxima tentativa poder gravar. */
      jaSalvou.current = false;
      console.error('Falha ao gravar a submissão do quiz', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex justify-center"
      style={{
        ...designVars(design),
        background: design.background,
        color: design.text,
        fontFamily: design.fontBody,
      }}
    >
      <div className="w-full flex flex-col sm:my-auto" style={{ maxWidth: contentWidth(design) }}>
        {!done && <UrgencyBar quizId={quizId} settings={urgencyBar} design={design} />}
        <div className={`flex-1 flex flex-col ${verticalAlignClass(design)}`} style={{ padding: '24px 16px' }}>
          {design.logoUrl && (
            <img
              src={design.logoUrl}
              alt=""
              className="mx-auto mb-5 h-auto object-contain"
              style={{ width: design.logoWidth ?? 120 }}
            />
          )}
          {/* Voltar fica ACIMA da barra de progresso, como nos funis de
              referência: é navegação da tela, não conteúdo da etapa. A etapa
              decide se aparece — na tela de resultado voltar não faz sentido. */}
          {podeVoltar && currentStep?.showBack !== false && (
            <button
              type="button"
              onClick={voltarEtapa}
              className="mb-3 -ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs font-medium opacity-60 transition-opacity hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ color: design.text, outlineColor: design.primary }}
              aria-label="Voltar para a etapa anterior"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          )}
          <ProgressBar
            value={done ? 1 : (state.currentStepIndex + 1) / steps.length}
            current={done ? steps.length - 1 : state.currentStepIndex}
            total={steps.length}
            design={design}
          />
          <div
            className="mt-6 flex-1 flex flex-col gap-6"
            style={{ paddingTop: alturaFixa.topo, paddingBottom: alturaFixa.rodape }}
          >
            {done ? (
              <ResultView schema={schema} state={state} />
            ) : (
              effectiveBlocks.map((b) => {
                /* O terminal é o último bloco DO FLUXO, não da lista: uma barra
                   fixa ou um selo flutuante no fim não pode herdar o botão que
                   avança a etapa só por estar por último no array. */
                const isTerminal = b.id === ultimoNoFluxo;
                const posicao = estiloDaPosicao(b, contentWidth(design));
                if (b.type === 'container') {
                  const conteudo = (
                    <ContainerView
                      key={b.id}
                      block={b}
                      allBlocks={blocks}
                      design={design}
                      scope={scope}
                      responses={state.responses}
                      terminal={isTerminal}
                      stepValid={allStepValid}
                      saving={saving}
                      onValidChange={(childId, valid) =>
                        setStepValidity((prev) => (prev[childId] === valid ? prev : { ...prev, [childId]: valid }))
                      }
                      onDraftChange={(childId, value) => {
                        if (value !== undefined) draftResponses.current[childId] = value;
                      }}
                      onContainerSubmit={() => {
                        if (isTerminal) void advanceStep({ ...draftResponses.current });
                      }}
                    />
                  );
                  // Container fora do fluxo precisa do embrulho posicionado; no
                  // fluxo, segue sem camada extra de DOM.
                  return posicao ? <div key={b.id} style={posicao}>{conteudo}</div> : conteudo;
                }
                return (
                  // Mesmo embrulho de estilo do canvas — um resolvedor só, para
                  // o que é ajustado no Builder ser o que o visitante vê.
                  <div
                    key={b.id}
                    ref={b.posicao === 'topo-fixo' ? refTopo : b.posicao === 'rodape-fixo' ? refRodape : undefined}
                    style={{ ...resolveBlockStyle(b), ...posicao }}
                  >
                  <BlockView
                    block={b}
                    design={design}
                    scope={scope}
                    respostaAnterior={state.responses[b.id]}
                    terminal={isTerminal}
                    stepValid={allStepValid}
                    saving={saving}
                    onValidChange={(valid) => setStepValidity((prev) => (prev[b.id] === valid ? prev : { ...prev, [b.id]: valid }))}
                    onDraftChange={(value) => {
                      if (value !== undefined) draftResponses.current[b.id] = value;
                    }}
                    onSubmit={(response) => {
                      draftResponses.current[b.id] = response;
                      if (isTerminal) void advanceStep({ ...draftResponses.current });
                    }}
                  />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      {!done && <SocialProofToasts settings={socialProof} design={design} />}
    </div>
  );
}

function UrgencyBar({
  quizId,
  settings,
  design,
}: {
  quizId: string;
  settings: UrgencyBarSettings;
  design: QuizSchema['design'];
}) {
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!settings.enabled) return;
    setHidden(false);
    const storageKey = `alt_quiz_urgency_${quizId}`;
    const durationMs = Math.max(1, settings.minutes) * 60 * 1000;

    let endsAt: number;
    try {
      const stored = Number(sessionStorage.getItem(storageKey));
      const startedAt = stored > 0 ? stored : Date.now();
      if (!(stored > 0)) sessionStorage.setItem(storageKey, String(startedAt));
      endsAt = startedAt + durationMs;
    } catch {
      endsAt = Date.now() + durationMs;
    }

    const tick = () => {
      const remaining = endsAt - Date.now();
      if (remaining <= 0) {
        if (settings.onExpire === 'restart') {
          const now = Date.now();
          try {
            sessionStorage.setItem(storageKey, String(now));
          } catch {
            /* sessionStorage indisponível (modo privado) — cronômetro continua só em memória */
          }
          endsAt = now + durationMs;
          setRemainingMs(durationMs);
        } else if (settings.onExpire === 'freeze') {
          setRemainingMs(0);
        } else {
          setHidden(true);
        }
      } else {
        setRemainingMs(remaining);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [settings.enabled, settings.minutes, settings.onExpire, quizId]);

  if (!settings.enabled || hidden || remainingMs === null) return null;

  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const clock =
    h > 0
      ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  return (
    <div
      className="sticky top-0 z-20 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-center"
      style={{ background: design.primary, color: '#fff' }}
    >
      <Hourglass className="h-4 w-4 shrink-0" />
      <span className="truncate">{settings.label}</span>
      <span className="tabular-nums font-mono shrink-0">{clock}</span>
    </div>
  );
}

function SocialProofToasts({
  settings,
  design,
}: {
  settings: SocialProofSettings;
  design: QuizSchema['design'];
}) {
  const [visible, setVisible] = useState<{ msg: SocialProofMessage; key: number } | null>(null);

  useEffect(() => {
    if (!settings.enabled || settings.messages.length === 0) return;
    let index = 0;
    let key = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const showNext = () => {
      const msg = settings.messages[index % settings.messages.length];
      index += 1;
      key += 1;
      setVisible({ msg, key });
      timers.push(
        setTimeout(() => {
          setVisible(null);
          timers.push(setTimeout(showNext, Math.max(1, settings.intervalSeconds) * 1000));
        }, Math.max(1, settings.displaySeconds) * 1000)
      );
    };

    timers.push(setTimeout(showNext, Math.max(0, settings.startDelaySeconds) * 1000));
    return () => {
      timers.forEach(clearTimeout);
      setVisible(null);
    };
  }, [settings.enabled, settings.messages, settings.startDelaySeconds, settings.displaySeconds, settings.intervalSeconds]);

  if (!settings.enabled || !visible) return null;

  const IconComp = SOCIAL_PROOF_ICON_MAP[visible.msg.icon] ?? CheckCircle2;
  const justify =
    settings.position === 'bottom-left' ? 'justify-start' : settings.position === 'bottom-right' ? 'justify-end' : 'justify-center';
  const verticalClass = settings.position === 'top-center' ? 'top-4' : 'bottom-4';

  return (
    <div className={`fixed inset-x-0 ${verticalClass} z-40 flex justify-center px-4 pointer-events-none`}>
      <div className={`w-full flex ${justify}`} style={{ maxWidth: QUIZ_MAX_WIDTH }}>
        <div
          key={visible.key}
          className="pointer-events-auto flex items-start gap-3 rounded-xl shadow-xl p-3.5 max-w-[300px] animate-in slide-in-from-bottom-4 fade-in duration-300 motion-reduce:slide-in-from-bottom-0"
          style={{ background: design.surface, color: design.text, border: `1px solid ${design.primary}22` }}
        >
          <div
            className="h-8 w-8 rounded-full shrink-0 flex items-center justify-center"
            style={{ background: design.primary + '22' }}
          >
            <IconComp className="h-4 w-4" style={{ color: design.primary }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold leading-snug">{visible.msg.title}</div>
            {visible.msg.body && <div className="text-xs opacity-70 mt-0.5">{visible.msg.body}</div>}
          </div>
          <button
            onClick={() => setVisible(null)}
            className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
            aria-label="Fechar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Valor de um bloco de contato, pelo tipo.
 *
 * Também aceita um `Texto curto` com máscara de telefone. Quem mascara um campo
 * como telefone está dizendo que ali vem um telefone, e antes isso não gerava
 * lead nenhum — a busca era só por TIPO de bloco, e o quiz rodava inteiro sem
 * capturar ninguém, em silêncio. Foi o que aconteceu no quiz de teste da onda 4
 * sem que eu percebesse ao montá-lo.
 */
function extract(responses: Record<string, unknown>, blocks: QuizBlock[], type: QuizBlock['type']): string | undefined {
  const candidatos = blocks.filter(
    (x) => x.type === type || (type === 'phone' && x.type === 'short-text' && x.fieldMask === 'telefone'),
  );
  for (const b of candidatos) {
    const v = responses[b.id];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/**
 * Contato do visitante, venha de onde vier.
 *
 * `extract` só procura blocos SOLTOS de e-mail e telefone. Um quiz que colhe o
 * contato num bloco `form` — cuja resposta é um objeto `{name, email, phone}` —
 * ficava invisível para ela. Medido no "diagnostico-beleza-natural": 7 pessoas
 * começaram, nenhuma virou lead, porque a captura antecipada só olhava
 * `extract` e nunca encontrava nada.
 */
function extrairContato(responses: Record<string, unknown>, blocks: QuizBlock[]) {
  const doForm = blocks
    .filter((b) => b.type === 'form')
    .map((b) => responses[b.id] as { name?: string; email?: string; phone?: string } | undefined)
    .find((r) => r && (r.email || r.phone));

  const limpar = (v?: string | null) => {
    const t = typeof v === 'string' ? v.trim() : '';
    return t || undefined;
  };

  /* O nome sai do primeiro `Texto curto` do quiz — mas NÃO de um que tenha
     máscara: um campo mascarado é um telefone, um CPF, um CEP, nunca um nome.
     Sem esta exclusão o lead nascia chamado "(27) 98877-5544", porque o mesmo
     campo servia de telefone e de nome ao mesmo tempo. */
  const semMascara = blocks.filter((b) => !b.fieldMask || b.fieldMask === 'livre');

  return {
    email: extract(responses, blocks, 'email') ?? limpar(doForm?.email),
    phone: extract(responses, blocks, 'phone') ?? limpar(doForm?.phone),
    name: extract(responses, semMascara, 'short-text') ?? limpar(doForm?.name),
  };
}

function ProgressBar({
  value,
  design,
  current = 0,
  total = 1,
}: {
  value: number;
  design: QuizSchema['design'];
  current?: number;
  total?: number;
}) {
  if (design.progressStyle === 'none') return null;
  const pct = Math.min(100, Math.round(value * 100));
  const a11yProps = {
    role: 'progressbar' as const,
    'aria-label': 'Progresso do quiz',
    'aria-valuenow': pct,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
  };

  if (design.progressStyle === 'dots') {
    return (
      <div className="flex gap-2 justify-center" {...a11yProps}>
        {Array.from({ length: Math.max(1, total) }).map((_, i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full transition-colors motion-reduce:transition-none"
            style={{ background: i <= current ? design.primary : design.surface }}
          />
        ))}
      </div>
    );
  }

  if (design.progressStyle === 'steps') {
    return (
      <div className="flex gap-1" {...a11yProps}>
        {Array.from({ length: Math.max(1, total) }).map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none"
            style={{ background: i <= current ? design.primary : design.surface }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="h-2 rounded-full overflow-hidden"
      style={{ background: design.surface, boxShadow: 'inset 0 1px 2px rgb(0 0 0 / 0.06)' }}
      {...a11yProps}
    >
      <div
        className="h-full transition-all duration-500 motion-reduce:transition-none"
        style={{ width: `${pct}%`, background: design.primary }}
      />
    </div>
  );
}

// Régua de arrastar (Funilix parity) pra peso/altura: uma fita com marcações que
// desliza sob um indicador central fixo. Arrastar move a fita (não um "polegar"),
// igual a um seletor de valor de balança/altímetro. As marcações finas usam um
// gradiente CSS repetido (sem 1 elemento por unidade); só as marcações principais
// (a cada ~10% da faixa) viram elementos de verdade, com o número embaixo.
const TICK_PX = 10;

function RulerSlider({
  value,
  min,
  max,
  step,
  design,
  ariaLabel,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  design: QuizSchema['design'];
  ariaLabel: string;
  onChange: (v: number) => void;
}) {
  const dragRef = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null);

  const clampSnap = (v: number) => {
    const snapped = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, snapped));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startValue: value };
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const delta = drag.startX - e.clientX; // arrastar pra esquerda revela valores maiores
    const next = clampSnap(drag.startValue + delta / TICK_PX);
    if (next !== value) onChange(next);
  };
  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const range = Math.max(1, max - min);
  const majorStep = Math.max(step, Math.round(range / 12 / step) * step || step);
  const majorTicks: number[] = [];
  for (let v = Math.ceil(min / majorStep) * majorStep; v <= max; v += majorStep) majorTicks.push(v);

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(clampSnap(value + step)); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(clampSnap(value - step)); }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-20 overflow-hidden rounded-2xl cursor-grab active:cursor-grabbing touch-none select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ background: design.surface, outlineColor: design.primary }}
    >
      <div
        className="absolute top-0 h-full"
        style={{
          width: `${(max - min) * TICK_PX}px`,
          // "left" (não transform: translateX) porque só "left" em % resolve contra a
          // largura do CONTÊINER pai — porcentagem num transform resolve contra a
          // largura do PRÓPRIO elemento (aqui, 1700px+), o que jogava a fita inteira
          // pra fora da área visível (bug real: nenhuma marcação aparecia na tela).
          left: `calc(50% - ${(value - min) * TICK_PX}px)`,
        }}
      >
        {/* marcações finas: uma tira curta ancorada embaixo, não a altura toda do track —
            sem background-size/position/repeat aqui, porque pra um
            repeating-linear-gradient isso recorta só uma fatia minúscula do padrão
            (bug real já visto: régua sem nenhuma marcação visível). Sem essas props, o
            próprio gradiente preenche a altura da tira e repete a cada 10px sozinho. */}
        <div
          className="absolute inset-x-0 bottom-0 h-4"
          style={{ backgroundImage: `repeating-linear-gradient(to right, ${design.muted}66 0, ${design.muted}66 1.5px, transparent 1.5px, transparent ${TICK_PX}px)` }}
        />
        {majorTicks.map((v) => (
          <div
            key={v}
            className="absolute bottom-0 flex flex-col items-center"
            style={{ left: `${(v - min) * TICK_PX}px`, transform: 'translateX(-50%)' }}
          >
            <span className="text-[10px] font-semibold mb-1 tabular-nums" style={{ color: design.muted }}>{v}</span>
            <div className="h-6 w-0.5 rounded-full" style={{ background: design.muted }} />
          </div>
        ))}
      </div>
      {/* indicador central fixo — o valor "selecionado" é sempre o que está sob ele */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full"
        style={{ background: design.primary }}
      />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="p-12 text-center opacity-60">{message}</div>;
}

function PrimaryBtn({
  design,
  children,
  onClick,
  disabled,
  hidden,
  textStyle,
}: {
  design: QuizSchema['design'];
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  hidden?: boolean;
  /** Tipografia do slot "Botão" — depois do estilo do tema, para vencê-lo. */
  textStyle?: React.CSSProperties;
}) {
  if (hidden) return null;
  const { style, className } = getButtonStyle(design);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full sm:w-auto px-8 py-3.5 font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2${className ? ` ${className}` : ''}`}
      style={{ ...style, outlineColor: design.primary, ...textStyle }}
    >
      {children}
    </button>
  );
}

const CONTAINER_ALIGN_CSS: Record<string, React.CSSProperties['alignItems']> = {
  start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch',
};
const CONTAINER_JUSTIFY_CSS: Record<string, React.CSSProperties['justifyContent']> = {
  start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'space-between',
};

// Breakpoints do layout responsivo do Container — mesmos limiares usados no resto
// do app pra distinguir mobile/tablet/desktop (ver device toggle do Builder).
const MOBILE_MAX = 640;
const TABLET_MAX = 1024;

function getBreakpoint(width: number): Breakpoint {
  if (width < MOBILE_MAX) return 'mobile';
  if (width < TABLET_MAX) return 'tablet';
  return 'desktop';
}

// Observa a largura real da janela do visitante pra resolver qual configuração de
// Container (Mobile/Tablet/Desktop) usar — só existe consumidor no client, então o
// valor inicial (antes do primeiro layout effect) assume mobile, o breakpoint mais
// restritivo, pra nunca flashar colunas demais numa tela pequena.
function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(() => (typeof window === 'undefined' ? 'mobile' : getBreakpoint(window.innerWidth)));
  useEffect(() => {
    const onResize = () => setBp(getBreakpoint(window.innerWidth));
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return bp;
}

// Renderiza um bloco Container (Funilix parity): reaproveita o BlockView pra cada
// filho, sempre em modo "rascunho" (terminal=false — nenhum filho avança a etapa
// sozinho). Se o Container for o bloco terminal da etapa, um único botão
// "Continuar" compartilhado aparece depois de todos os filhos.
function ContainerView({
  block,
  allBlocks,
  design,
  scope,
  responses,
  terminal,
  stepValid,
  saving,
  onValidChange,
  onDraftChange,
  onContainerSubmit,
}: {
  block: QuizBlock;
  allBlocks: QuizBlock[];
  design: QuizSchema['design'];
  scope: VariableScope;
  responses: Record<string, unknown>;
  terminal: boolean;
  stepValid: boolean;
  saving: boolean;
  onValidChange: (childId: string, valid: boolean) => void;
  onDraftChange: (childId: string, value: unknown) => void;
  onContainerSubmit: () => void;
}) {
  const children = (block.childBlockIds ?? [])
    .map((id) => allBlocks.find((b) => b.id === id))
    .filter((b): b is QuizBlock => !!b && isBlockVisible(b, responses, scope));

  const breakpoint = useBreakpoint();
  const layout = resolveContainerLayout(block, breakpoint);
  const isGrid = layout.layoutMode === 'grid';
  const layoutStyle: React.CSSProperties = isGrid
    ? { display: 'grid', gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`, gap: layout.gap }
    : {
        display: 'flex',
        flexWrap: 'wrap',
        gap: layout.gap,
        alignItems: CONTAINER_ALIGN_CSS[layout.align],
        justifyContent: CONTAINER_JUSTIFY_CSS[layout.justify],
      };

  const btnText = resolveTextStyle(block, 'button');

  return (
    <div className="space-y-6">
      <div style={layoutStyle}>
        {children.length === 0 && (
          <p className="text-sm opacity-50 py-6 text-center w-full">Container vazio</p>
        )}
        {children.map((child) => (
          <div
            key={child.id}
            className={`h-full overflow-hidden flex flex-col justify-center ${isGrid ? '' : 'flex-1 min-w-[160px]'}`}
            style={{ background: design.surface, borderRadius: design.radius, padding: 20 }}
          >
            <BlockView
              block={child}
              design={design}
              scope={scope}
              terminal={false}
              stepValid={stepValid}
              saving={saving}
              onValidChange={(valid) => onValidChange(child.id, valid)}
              onDraftChange={(value) => onDraftChange(child.id, value)}
              onSubmit={(value) => onDraftChange(child.id, value)}
            />
          </div>
        ))}
      </div>
      <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={onContainerSubmit}>
        {block.ctaLabel || 'Continuar'}
      </PrimaryBtn>
    </div>
  );
}

/**
 * Cartão de opção — único, para escolha simples e múltipla.
 *
 * Antes eram dois blocos de JSX quase iguais, e "quase" era o problema: o
 * polimento entrou só no de múltipla, e a escolha simples — a mais usada —
 * ficou sem altura mínima e sem anel de foco.
 *
 * O indicador não é enfeite. Sem ele, o cartão só muda de contorno ao ser
 * marcado, e nada na tela conta que dá para escolher mais de uma antes de a
 * pessoa tentar. Círculo diz "uma"; quadrado diz "várias" — é a convenção que
 * todo formulário usa, e quem responde no celular não lê instrução.
 */
/** Classe de grade para a disposição escolhida. */
function classeDaGrade(layout: QuizBlock['optionsLayout']): string {
  switch (layout) {
    case 'grade-2':
      return 'grid grid-cols-2 gap-2.5';
    case 'grade-3':
      // Três colunas em 448px dariam ~140px por cartão; no celular cai para duas.
      return 'grid grid-cols-2 sm:grid-cols-3 gap-2.5';
    case 'grade-4':
      return 'grid grid-cols-2 sm:grid-cols-4 gap-2.5';
    default:
      return 'space-y-2.5';
  }
}

function OptionCard({
  design,
  option,
  active,
  multiple,
  disabled,
  onClick,
  textStyle,
  cardStyle = 'linha',
}: {
  design: QuizDesign;
  option: BlockOption;
  active: boolean;
  multiple: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Tipografia do slot "Opções". */
  textStyle?: React.CSSProperties;
  /** 'cartao' = imagem grande em cima, rótulo numa barra embaixo. */
  cardStyle?: 'linha' | 'cartao';
}) {
  const marcador = (
    <span
      aria-hidden
      className="shrink-0 grid place-items-center transition-all duration-200 motion-reduce:transition-none"
      style={{
        width: 22,
        height: 22,
        borderRadius: multiple ? 6 : 999,
        border: `2px solid ${active ? design.primary : withAlpha(design.text, 0.25)}`,
        background: active ? design.primary : 'transparent',
      }}
    >
      {active &&
        (multiple ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: getContrastText(design.primary) }} />
        ) : (
          <span className="block" style={{ width: 8, height: 8, borderRadius: 999, background: getContrastText(design.primary) }} />
        ))}
    </span>
  );

  const comum = {
    onClick,
    disabled,
    ...(multiple
      ? { 'aria-pressed': active, 'aria-disabled': disabled }
      : { role: 'radio' as const, 'aria-checked': active }),
  };

  const moldura = {
    borderRadius: design.radius,
    outlineColor: design.primary,
    // Marcado ganha contorno cheio e um fundo levemente tingido: só a borda
    // de 2px é fraca demais num cartão claro, principalmente no sol.
    borderColor: active ? design.primary : withAlpha(design.text, 0.12),
    borderWidth: active ? 2 : 1,
    background: active ? withAlpha(design.primary, 0.06) : design.surface,
    color: design.text,
    // Sombra de sussurro: separa o cartão do fundo creme sem virar caixa.
    boxShadow: active ? `0 0 0 1px ${withAlpha(design.primary, 0.25)}` : '0 1px 2px rgb(0 0 0 / 0.04)',
  } as const;

  /* Cartão com foto: a imagem ocupa o topo inteiro e o rótulo vira uma barra
     embaixo, com o marcador dentro dela. Sem imagem o formato não se sustenta
     (sobraria um retângulo vazio), então cai para a linha de sempre. */
  if (cardStyle === 'cartao' && option.imageUrl) {
    return (
      <button
        {...comum}
        className={`group/opt flex w-full flex-col overflow-hidden border text-left transition-all duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2${
          disabled ? ' cursor-not-allowed opacity-40' : ' hover:-translate-y-px active:translate-y-0 active:scale-[0.99]'
        }`}
        style={moldura}
      >
        <img src={option.imageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
        <span
          className="flex items-center gap-2 px-3 py-2.5"
          style={{ background: active ? design.primary : withAlpha(design.text, 0.04) }}
        >
          <span
            aria-hidden
            className="grid shrink-0 place-items-center"
            style={{
              width: 18,
              height: 18,
              borderRadius: multiple ? 5 : 999,
              border: `2px solid ${active ? getContrastText(design.primary) : withAlpha(design.text, 0.3)}`,
              background: 'transparent',
            }}
          >
            {active && (
              <span
                className="block"
                style={{ width: 7, height: 7, borderRadius: multiple ? 2 : 999, background: getContrastText(design.primary) }}
              />
            )}
          </span>
          <span
            className="min-w-0 flex-1 text-sm font-semibold leading-tight"
            style={{ ...textStyle, color: active ? getContrastText(design.primary) : design.text }}
          >
            {parseRichText(option.label)}
          </span>
        </span>
      </button>
    );
  }

  return (
    <button
      {...comum}
      className={`w-full flex items-center gap-3.5 text-left px-4 py-3.5 min-h-[3.5rem] border transition-all duration-200 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2${
        disabled ? ' opacity-40 cursor-not-allowed' : ' hover:-translate-y-px active:translate-y-0 active:scale-[0.99]'
      }`}
      style={moldura}
    >
      {marcador}
      {option.imageUrl ? (
        <img src={option.imageUrl} alt="" className="h-10 w-10 rounded-md object-cover shrink-0" />
      ) : option.emoji ? (
        <span className="shrink-0">{option.emoji}</span>
      ) : null}
      <span className="min-w-0 flex-1" style={textStyle}>{parseRichText(option.label)}</span>
    </button>
  );
}

function BlockView({
  block,
  design,
  scope,
  terminal,
  stepValid = true,
  onSubmit,
  onValidChange,
  onDraftChange,
  saving,
  respostaAnterior,
}: {
  /** O que esta pessoa já respondeu neste bloco, quando voltou para cá. */
  respostaAnterior?: unknown;
  block: QuizBlock;
  design: QuizSchema['design'];
  scope: VariableScope;
  terminal: boolean;
  stepValid?: boolean;
  onSubmit: (response: unknown) => void;
  onValidChange?: (valid: boolean) => void;
  onDraftChange?: (value: unknown) => void;
  saving: boolean;
}) {
  // Opções marcadas como "pré-selecionada" no Inspector já chegam marcadas quando a
  // etapa abre — o inicializador do useState só roda uma vez por instância do bloco
  // (cada key={b.id} monta um BlockView novo), então isso não sobrescreve escolhas.
  /* Voltar sem trazer a resposta de volta seria pior que não ter botão: a
     pessoa vê a pergunta em branco e acha que perdeu o que respondeu. */
  const [value, setValue] = useState<unknown>(() => {
    if (respostaAnterior !== undefined && !Array.isArray(respostaAnterior)) return respostaAnterior;
    if (block.type === 'single-choice') return (block.options ?? []).find((o) => o.preselected)?.id ?? '';
    if (block.type === 'weight') return block.sliderDefaultValue ?? 70;
    if (block.type === 'height') return block.sliderDefaultValue ?? 170;
    return '';
  });
  const [multi, setMulti] = useState<string[]>(() => {
    if (Array.isArray(respostaAnterior)) return respostaAnterior as string[];
    return block.type === 'multi-choice' ? (block.options ?? []).filter((o) => o.preselected).map((o) => o.id) : [];
  });
  const [formValue, setFormValue] = useState(() => {
    const r = respostaAnterior as { name?: string; email?: string; phone?: string } | undefined;
    return {
      name: r?.name ?? '',
      email: r?.email ?? '',
      phone: r?.phone ?? '',
    };
  });
  const [revealed, setRevealed] = useState(false);
  // Régua de peso/altura: guarda a unidade EXIBIDA localmente; o valor sempre fica
  // salvo internamente na unidade métrica (kg/cm), pra não quebrar o motor de
  // variáveis/fórmulas caso o visitante alterne a unidade no meio do caminho.
  const [sliderUnit, setSliderUnit] = useState<'metric' | 'imperial'>('metric');

  useEffect(() => {
    if (block.type !== 'loading') return;
    const timer = setTimeout(() => onSubmit(true), (block.loadingSeconds ?? 3) * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.id]);

  const canSubmit = useMemo(() => {
    if (block.type === 'multi-choice') return multi.length > 0 || !block.required;
    if (block.type === 'single-choice') return typeof value === 'string' && value.length > 0;
    if (block.type === 'rating') return typeof value === 'number';
    // A régua sempre carrega um valor numérico válido (nunca fica "vazia" como um
    // campo de texto) — diferente dos campos de texto abaixo, que checam string.
    if (block.type === 'weight' || block.type === 'height') return typeof value === 'number';
    if (
      block.type === 'short-text' || block.type === 'long-text' || block.type === 'email' ||
      block.type === 'phone'
    ) {
      return !block.required || (typeof value === 'string' && value.trim().length > 0);
    }
    if (block.type === 'form') {
      const ff = block.formFields ?? { name: true, email: true, phone: true };
      return !ff.email || formValue.email.trim().length > 0;
    }
    if (block.type === 'reveal') return revealed;
    if (block.type === 'scheduling') {
      const a = value as ValorAgendamento | undefined;
      if (!block.required) return true;
      return !!a?.data && (!block.schedulingAllowTime || !!a.hora);
    }
    return true;
  }, [block, value, multi, formValue, revealed]);

  useEffect(() => {
    onValidChange?.(canSubmit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmit]);

  // Mantém o pai a par do valor atual mesmo quando este bloco não é o terminal
  // da etapa (seu próprio botão fica oculto nesse caso — ver `terminal` abaixo).
  const draftValue = useMemo(() => {
    if (block.type === 'multi-choice') return multi;
    if (block.type === 'form') return formValue;
    if (block.type === 'reveal') return revealed ? true : undefined;
    if (
      block.type === 'single-choice' || block.type === 'rating' || block.type === 'short-text' ||
      block.type === 'long-text' || block.type === 'email' || block.type === 'phone' ||
      block.type === 'weight' || block.type === 'height' || block.type === 'scheduling'
    ) {
      return value;
    }
    return true;
  }, [block.type, value, multi, formValue, revealed]);

  useEffect(() => {
    onDraftChange?.(draftValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftValue]);

  // Interpola {{variavel}} / {{calc(...)}} no título e subtítulo — personalização
  // dinâmica com base em respostas anteriores (ex.: "Seu IMC é {{calc(peso/(altura/100)^2)}}").
  const title = interpolateText(block.title, scope);
  const subtitle = interpolateText(block.subtitle, scope);
  /* Quando o bloco tem texto rico, ele manda; sem documento, cai no texto
     simples de sempre. Os dois passam pelo MESMO <RichText> que o Preview usa —
     é isso que garante que o que foi formatado é o que o visitante vê. */
  // Resolvidos uma vez por bloco: o tema entra como padrão e o que o usuário
  // configurou no elemento vence.
  const btnText = resolveTextStyle(block, 'button');
  const optText = resolveTextStyle(block, 'options');

  const heading = (
    <div className="space-y-2.5 mb-7 pt-1">
      {(block.titleRich || title) && (
        <RichText
          doc={block.titleRich}
          fallback={title}
          scope={scope}
          className="quiz-rich text-[1.375rem] leading-[1.2] tracking-[-0.015em] font-bold text-balance sm:text-3xl sm:leading-[1.15]"
          style={resolveTextStyle(block, 'title', { fontFamily: design.fontHeading })}
        />
      )}
      {(block.subtitleRich || subtitle) && (
        <RichText
          doc={block.subtitleRich}
          fallback={subtitle}
          scope={scope}
          className="quiz-rich text-[0.9375rem] leading-relaxed max-w-[42ch] text-pretty"
          style={resolveTextStyle(block, 'subtitle', { color: design.muted })}
        />
      )}
    </div>
  );

  switch (block.type) {
    case 'intro':
      return (
        <div className="text-center py-8 space-y-6">
          {block.imageUrl && (
            <img
              src={block.imageUrl}
              alt={block.title || 'Imagem de destaque'}
              className="mx-auto w-full max-h-72 object-cover rounded-xl"
            />
          )}
          <RichText
            doc={block.titleRich}
            fallback={title}
            scope={scope}
            className="quiz-rich text-[1.75rem] leading-[1.15] tracking-[-0.02em] font-bold text-balance sm:text-4xl sm:leading-[1.1] max-w-[18ch] sm:max-w-none mx-auto"
            style={resolveTextStyle(block, 'title', { fontFamily: design.fontHeading })}
          />
          {(block.subtitleRich || subtitle) && (
            <RichText
              doc={block.subtitleRich}
              fallback={subtitle}
              scope={scope}
              className="quiz-rich text-[1.0625rem] leading-relaxed max-w-[38ch] mx-auto text-pretty"
              style={resolveTextStyle(block, 'subtitle', { color: design.muted })}
            />
          )}
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Começar'}
          </PrimaryBtn>
        </div>
      );

    case 'single-choice':
      return (
        <div>
          {heading}
          <div className={classeDaGrade(block.optionsLayout)} role="radiogroup" aria-label={block.title || 'Opções'}>
            {(block.options ?? []).map((o) => (
              <OptionCard
                key={o.id}
                design={design}
                option={o}
                textStyle={optText}
                cardStyle={block.optionCardStyle}
                active={value === o.id}
                multiple={false}
                onClick={() => {
                  // Ação por opção (Funilix parity): uma URL externa navega na hora,
                  // sem passar pelo fluxo normal de avançar etapa.
                  if (o.actionUrl) {
                    window.location.href = o.actionUrl;
                    return;
                  }
                  setValue(o.id);
                  // Ausente = avança (comportamento de sempre). Só quem
                  // desliga o Autoavançar ganha o botão de continuar abaixo.
                  if (terminal && block.autoAdvance !== false) onSubmit(o.id);
                }}
              />
            ))}
          </div>
          {/* Com o Autoavançar desligado, a escolha precisa de confirmação —
              sem este botão a etapa viraria um beco sem saída. */}
          {block.autoAdvance === false && (
            <div className="mt-6">
              <PrimaryBtn
                design={design}
                textStyle={btnText}
                hidden={!terminal}
                disabled={!value || saving}
                onClick={() => onSubmit(value)}
              >
                {block.ctaLabel || 'Continuar'}
              </PrimaryBtn>
            </div>
          )}
        </div>
      );

    case 'multi-choice':
      return (
        <div>
          {heading}
          {/* Só aparece depois da primeira marcação. Com zero selecionadas o
              contador repetia o que o subtítulo já diz ("Escolha até três") e
              ainda ficava centralizado no meio de uma tela alinhada à esquerda.
              Como retorno da ação ele é útil; como instrução, é ruído. */}
          {(block.maxSelections ?? 0) > 0 && multi.length > 0 && (
            <p className="text-sm mb-3" aria-live="polite" style={{ color: design.muted }}>
              {multi.length} de {block.maxSelections} selecionadas
            </p>
          )}
          <div className={`${classeDaGrade(block.optionsLayout)} mb-6`} role="group" aria-label={block.title || 'Opções'}>
            {(block.options ?? []).map((o) => {
              const active = multi.includes(o.id);
              const limite = block.maxSelections ?? 0;
              return (
                <OptionCard
                  key={o.id}
                  design={design}
                  option={o}
                  textStyle={optText}
                  cardStyle={block.optionCardStyle}
                  active={active}
                  multiple
                  disabled={limite > 0 && !active && multi.length >= limite}
                  onClick={() =>
                    setMulti((m) => {
                      if (m.includes(o.id)) return m.filter((x) => x !== o.id);
                      // No limite, marcar mais é ignorado — a opção já aparece
                      // desabilitada, então isto só protege teclado e toque duplo.
                      if (limite > 0 && m.length >= limite) return m;
                      return [...m, o.id];
                    })
                  }
                />
              );
            })}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(multi)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'rating': {
      const max = block.maxRating ?? 5;
      return (
        <div>
          {heading}
          <div className="flex gap-2 justify-center flex-wrap mb-6">
            {Array.from({ length: max }).map((_, i) => {
              const n = i + 1;
              const active = value === n;
              return (
                <button
                  key={n}
                  onClick={() => setValue(n)}
                  aria-pressed={active}
                  className="h-12 w-12 flex items-center justify-center text-lg font-bold border-2 transition-all"
                  style={{
                    borderRadius: design.radius,
                    borderColor: active ? design.primary : design.surface,
                    background: active ? design.primary : design.surface,
                    color: active ? getContrastText(design.primary) : design.text,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'short-text':
    case 'email':
    case 'phone':
      return (
        <div>
          {heading}
          <label htmlFor={`field-${block.id}`} className="sr-only">{block.title || 'Campo de texto'}</label>
          <input
            id={`field-${block.id}`}
            type={block.type === 'email' ? 'email' : block.type === 'phone' ? 'tel' : 'text'}
            placeholder={block.placeholder}
            value={String(value ?? '')}
            maxLength={block.maxLength ?? tamanhoDaMascara(block.fieldMask)}
            inputMode={
              block.fieldMask && block.fieldMask !== 'livre' && block.fieldMask !== 'moeda'
                ? 'numeric'
                : undefined
            }
            onChange={(e) => setValue(aplicarMascara(e.target.value, block.fieldMask))}
            className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-6 text-base"
            style={{
              borderRadius: design.radius,
              background: design.surface,
              color: design.text,
              border: `1px solid ${withAlpha(design.text, 0.14)}`,
              outlineColor: design.primary,
            }}
          />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'long-text':
      return (
        <div>
          {heading}
          <label htmlFor={`field-${block.id}`} className="sr-only">{block.title || 'Resposta em texto'}</label>
          <textarea
            id={`field-${block.id}`}
            rows={5}
            placeholder={block.placeholder}
            value={String(value ?? '')}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 resize-none mb-6 text-base"
            style={{
              borderRadius: design.radius,
              background: design.surface,
              color: design.text,
              border: `1px solid ${withAlpha(design.text, 0.14)}`,
              outlineColor: design.primary,
            }}
          />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'video': {
      const url = block.mediaUrl ?? '';
      const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
      const vim = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
      const src = yt
        ? `https://www.youtube.com/embed/${yt[1]}`
        : vim
          ? `https://player.vimeo.com/video/${vim[1]}`
          : url;
      const isMp4 = /\.mp4($|\?)/i.test(url) || block.mediaProvider === 'mp4';
      return (
        <div>
          {heading}
          {/* Sem URL, um <iframe src=""> desenhava um retângulo preto sólido —
              a tela ficava com cara de quebrada justamente na hora em que o
              dono do funil confere o rascunho antes de subir os vídeos. */}
          <div
            className="relative w-full aspect-video overflow-hidden mb-6 grid place-items-center"
            style={{
              borderRadius: design.radius,
              background: url ? '#000' : withAlpha(design.text, 0.05),
              border: url ? undefined : `1px dashed ${withAlpha(design.text, 0.18)}`,
            }}
          >
            {!url ? (
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <PlayCircle className="h-8 w-8" style={{ color: withAlpha(design.text, 0.35) }} />
                <span className="text-sm" style={{ color: design.muted }}>Vídeo ainda não adicionado</span>
              </div>
            ) : isMp4 ? (
              <video src={src} controls className="w-full h-full" />
            ) : (
              <iframe src={src} className="w-full h-full" allowFullScreen title="video" />
            )}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'audio':
      return (
        <div>
          {heading}
          {block.mediaUrl && <audio src={block.mediaUrl} controls className="w-full mb-6" />}
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'image':
      return (
        <div>
          {heading}
          {block.mediaUrl && (
            <img
              src={block.mediaUrl}
              alt={block.title || 'Imagem'}
              className="w-full object-cover mb-6"
              style={{ borderRadius: design.radius }}
            />
          )}
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'before-after':
      return (
        <div>
          {heading}
          <div className="mb-6">
            <BeforeAfterSlider
              beforeUrl={block.beforeUrl ?? ''}
              afterUrl={block.afterUrl ?? ''}
              radius={design.radius}
            />
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'testimonial':
      return (
        <div>
          <figure
            className="relative px-5 py-5 sm:px-6 space-y-4 mb-6"
            style={{
              background: design.surface,
              borderRadius: design.radius,
              border: `1px solid ${withAlpha(design.text, 0.08)}`,
              boxShadow: '0 1px 2px rgb(0 0 0 / 0.04)',
            }}
          >
            <span
              aria-hidden
              className="absolute left-4 top-1 select-none leading-none font-serif"
              style={{ fontSize: '3rem', color: withAlpha(design.primary, 0.16) }}
            >
              &ldquo;
            </span>
            <blockquote className="relative text-[1.0625rem] sm:text-lg italic leading-relaxed text-pretty">
              {title}
            </blockquote>
            <figcaption className="flex items-center gap-3">
              {block.testimonialAvatar && (
                <img
                  src={block.testimonialAvatar}
                  alt=""
                  className="h-10 w-10 rounded-full object-cover"
                />
              )}
              <div>
                <div className="text-sm font-medium" style={{ color: design.muted }}>
                  {block.testimonialAuthor}
                </div>
                {block.testimonialRole && (
                  <div className="text-xs" style={{ color: design.muted }}>
                    {block.testimonialRole}
                  </div>
                )}
              </div>
            </figcaption>
          </figure>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'countdown':
      return (
        <div>
          {heading}
          <div className="mb-6">
            <CountdownTimer
              endsAt={block.countdownEndsAt}
              minutes={block.countdownMinutes ?? 15}
              color={design.primary}
            />
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'divider':
      return (
        <div className="py-6">
          <div className="h-px w-full mb-6" style={{ background: design.surface }} />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            Continuar
          </PrimaryBtn>
        </div>
      );

    case 'spacer':
      return (
        <div>
          <div style={{ height: block.spacerHeight ?? 32 }} />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            Continuar
          </PrimaryBtn>
        </div>
      );

    case 'cta':
    case 'result':
      return (
        <div className="text-center py-6 space-y-4">
          {heading}
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'argument':
      // Narração entre perguntas, não uma segunda pergunta. Antes usava o
      // heading cheio ao lado de um ícone de 48px: em 375px sobravam ~280px
      // para serifada de 1.375rem, o texto virava seis linhas estreitas e
      // disputava atenção com a pergunta logo abaixo. Agora é um aviso — painel
      // discreto, ícone empilhado no celular, texto em escala de leitura.
      return (
        <div className="space-y-6">
          <div
            className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-start px-4 py-4 sm:px-5"
            style={{
              borderRadius: design.radius,
              background: withAlpha(design.primary, 0.05),
              border: `1px solid ${withAlpha(design.primary, 0.14)}`,
            }}
          >
            <div
              className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: withAlpha(design.primary, 0.14) }}
            >
              <Sparkles className="h-4 w-4" style={{ color: design.primary }} />
            </div>
            <div className="space-y-1.5 min-w-0">
              {(block.titleRich || title) && (
                <RichText
                  doc={block.titleRich}
                  fallback={title}
                  scope={scope}
                  className="quiz-rich text-[1.0625rem] leading-snug font-semibold text-pretty sm:text-lg"
                  style={resolveTextStyle(block, 'title', { fontFamily: design.fontHeading })}
                />
              )}
              {(block.subtitleRich || subtitle) && (
                <RichText
                  doc={block.subtitleRich}
                  fallback={subtitle}
                  scope={scope}
                  className="quiz-rich text-[0.9375rem] leading-relaxed text-pretty"
                  style={{ color: design.muted }}
                />
              )}
            </div>
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'argument-progress': {
      const pct = block.progressValue ?? 50;
      return (
        <div>
          {heading}
          <div className="h-2.5 rounded-full overflow-hidden mb-6" style={{ background: design.surface }}>
            <div className="h-full transition-all duration-700 motion-reduce:transition-none" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'level': {
      // A fórmula manda quando existe; sem ela, ou quando não resulta em
      // número, vale o valor fixo do slider.
      const pct = evaluatePercent(block.meterFormula, scope) ?? block.progressValue ?? 50;
      const captions = (block.meterCaptions ?? []).filter((c) => c.trim());
      return (
        <div>
          {heading}
          <div className="flex items-center justify-between text-sm font-semibold mb-2">
            <span>{interpolateText(block.levelLabel ?? '', scope)}</span>
            <span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-3.5 rounded-full overflow-hidden" style={{ background: design.surface }}>
            <div className="h-full transition-all duration-700 motion-reduce:transition-none" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
          {captions.length > 0 && (
            <div
              className="mt-2 grid gap-1 text-[11px]"
              style={{ gridTemplateColumns: `repeat(${captions.length}, minmax(0, 1fr))`, color: design.muted }}
            >
              {captions.map((c, i) => (
                <span
                  key={i}
                  className="truncate"
                  // Primeira à esquerda, última à direita, intermediárias
                  // centradas: é assim que a legenda casa com a régua.
                  style={{ textAlign: i === 0 ? 'left' : i === captions.length - 1 ? 'right' : 'center' }}
                  title={c}
                >
                  {c}
                </span>
              ))}
            </div>
          )}
          <div className="mb-6" />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'loading':
      return (
        <div className="text-center py-10 space-y-6">
          <Hourglass className="h-10 w-10 mx-auto animate-spin" style={{ color: design.primary }} />
          {heading}
          <div className="space-y-2 text-left max-w-xs mx-auto">
            {(block.loadingSteps ?? []).map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm opacity-80">
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: design.primary }} />
                {step}
              </div>
            ))}
          </div>
        </div>
      );

    case 'notification':
      return (
        <div className="space-y-6">
          <div className="flex gap-3 items-start p-5 rounded-xl" style={{ background: design.surface }}>
            <div
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: design.primary + '22' }}
            >
              <Bell className="h-4 w-4" style={{ color: design.primary }} />
            </div>
            {heading}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'faq':
      return (
        <div>
          {heading}
          <div className="space-y-2 mb-6">
            {(block.faqItems ?? []).map((item) => (
              <details key={item.id} className="p-4 rounded-lg" style={{ background: design.surface }}>
                <summary className="text-sm font-semibold cursor-pointer">{item.question}</summary>
                <p className="text-sm mt-2 opacity-80">{item.answer}</p>
              </details>
            ))}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'form': {
      const ff = block.formFields ?? { name: true, email: true, phone: true };
      return (
        <div>
          {heading}
          <div className="space-y-3 mb-6">
            {ff.name && (
              <>
                <label htmlFor={`field-${block.id}-name`} className="sr-only">Nome</label>
                <input
                  id={`field-${block.id}-name`}
                  placeholder="Nome"
                  value={formValue.name}
                  onChange={(e) => setFormValue((f) => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-base"
                  style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${withAlpha(design.text, 0.14)}`, outlineColor: design.primary }}
                />
              </>
            )}
            {ff.email && (
              <>
                <label htmlFor={`field-${block.id}-email`} className="sr-only">E-mail</label>
                <input
                  id={`field-${block.id}-email`}
                  type="email"
                  placeholder="E-mail"
                  value={formValue.email}
                  onChange={(e) => setFormValue((f) => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-base"
                  style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${withAlpha(design.text, 0.14)}`, outlineColor: design.primary }}
                />
              </>
            )}
            {ff.phone && (
              <>
                <label htmlFor={`field-${block.id}-phone`} className="sr-only">Telefone</label>
                <input
                  id={`field-${block.id}-phone`}
                  type="tel"
                  placeholder="Telefone"
                  value={formValue.phone}
                  onChange={(e) => setFormValue((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-base"
                  style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${withAlpha(design.text, 0.14)}`, outlineColor: design.primary }}
                />
              </>
            )}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(formValue)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Enviar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'weight':
    case 'height': {
      // Régua de arrastar (Funilix parity): o valor sempre fica salvo em kg/cm —
      // só a EXIBIÇÃO converte pra lb/pol quando o visitante troca a unidade.
      const isWeight = block.type === 'weight';
      const metricMin = block.sliderMin ?? (isWeight ? 30 : 100);
      const metricMax = block.sliderMax ?? (isWeight ? 200 : 250);
      const metricStep = block.sliderStep ?? 1;
      const metricValue = typeof value === 'number' ? value : (isWeight ? 70 : 170);
      const allowUnitToggle = block.allowUnitToggle !== false;

      const KG_TO_LB = 2.20462;
      const CM_TO_IN = 0.393701;
      const toDisplay = (m: number) => (sliderUnit === 'imperial' ? m * (isWeight ? KG_TO_LB : CM_TO_IN) : m);
      const toMetric = (d: number) => (sliderUnit === 'imperial' ? d / (isWeight ? KG_TO_LB : CM_TO_IN) : d);

      const displayMin = Math.round(toDisplay(metricMin));
      const displayMax = Math.round(toDisplay(metricMax));
      const displayValue = Math.round(toDisplay(metricValue));
      const unitLabel = isWeight ? (sliderUnit === 'imperial' ? 'lb' : 'kg') : (sliderUnit === 'imperial' ? 'pol' : 'cm');

      return (
        <div>
          {heading}
          <div className="mb-6">
            {allowUnitToggle && (
              <div className="flex justify-center mb-4">
                <div className="inline-flex rounded-full p-1 gap-0.5" style={{ background: design.surface }}>
                  {(isWeight ? (['kg', 'lb'] as const) : (['cm', 'pol'] as const)).map((u, i) => {
                    const active = (i === 0) === (sliderUnit === 'metric');
                    return (
                      <button
                        key={u}
                        type="button"
                        onClick={() => setSliderUnit(i === 0 ? 'metric' : 'imperial')}
                        className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
                        style={{ background: active ? design.primary : 'transparent', color: active ? getContrastText(design.primary) : design.muted }}
                      >
                        {u}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="text-center mb-5">
              <span className="text-5xl font-bold tabular-nums" style={{ color: design.text, fontFamily: design.fontHeading }}>
                {displayValue}
              </span>
              <span className="text-lg ml-1.5 opacity-60">{unitLabel}</span>
            </div>
            <RulerSlider
              value={displayValue}
              min={displayMin}
              max={displayMax}
              step={1}
              design={design}
              ariaLabel={block.title || (isWeight ? 'Peso' : 'Altura')}
              onChange={(next) => setValue(Math.round(toMetric(next)))}
            />
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(metricValue)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'pricing':
      return (
        <div className="text-center space-y-5">
          {(block.titleRich || title) && (<RichText doc={block.titleRich} fallback={title} scope={scope} className="quiz-rich text-xl font-semibold" style={resolveTextStyle(block, 'title', { fontFamily: design.fontHeading })} />)}
          {formatarPreco(block).valor.trim() && (
            <div className="flex flex-wrap items-baseline justify-center gap-x-2 gap-y-1">
              {formatarPreco(block).prefixo && (
                <span className="text-sm opacity-70">{formatarPreco(block).prefixo}</span>
              )}
              <span className="text-4xl font-bold" style={{ color: design.primary, fontFamily: design.fontHeading }}>{formatarPreco(block).valor}</span>
              {formatarPreco(block).sufixo && (
                <span className="text-sm opacity-70">{formatarPreco(block).sufixo}</span>
              )}
              {block.pricingPeriod && <span className="text-base opacity-70">{block.pricingPeriod}</span>}
            </div>
          )}
          {block.pricingOriginalPrice && (
            <div className="text-sm line-through opacity-50">{block.pricingOriginalPrice}</div>
          )}
          <div className="space-y-2 text-left max-w-xs mx-auto">
            {(block.pricingFeatures ?? []).map((f, i) => (
              <div key={i} className="flex items-start gap-2 text-sm leading-snug">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-px" style={{ color: design.primary }} />
                {f}
              </div>
            ))}
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Quero essa oferta'}
          </PrimaryBtn>
        </div>
      );

    case 'reveal':
      return (
        <div className="text-center space-y-6">
          {heading}
          {revealed ? (
            <div className="p-6 rounded-xl space-y-2" style={{ background: design.surface }}>
              <div className="text-xl font-bold">{block.revealedTitle}</div>
              <p className="text-sm opacity-80">{block.revealedBody}</p>
            </div>
          ) : (
            <button
              onClick={() => setRevealed(true)}
              className="w-full border-2 border-dashed rounded-xl p-10 transition-all hover:scale-[1.01] motion-reduce:hover:scale-100"
              style={{ borderColor: design.primary, borderRadius: design.radius }}
            >
              <Gift className="h-7 w-7 mx-auto mb-2" style={{ color: design.primary }} />
              {block.revealLabel || 'Revelar prêmio'}
            </button>
          )}
          {revealed && (
            <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
              {block.ctaLabel || 'Continuar'}
            </PrimaryBtn>
          )}
        </div>
      );

    case 'ios-notification':
      return (
        <div className="space-y-6">
          <div className="p-4 rounded-2xl flex gap-3 items-start shadow-lg" style={{ background: design.surface }}>
            <div className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: design.primary }}>
              <BellRing className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold opacity-60">{block.notificationApp ?? 'App'}</span>
                <span className="text-[11px] opacity-50">{block.notificationTime ?? 'agora'}</span>
              </div>
              <div className="text-base font-semibold">{title}</div>
              {subtitle && <div className="text-sm opacity-70">{subtitle}</div>}
            </div>
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'audio-call':
      return (
        <div className="space-y-8 text-center">
          <div className="relative mx-auto flex h-24 w-24 items-center justify-center">
            <span className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: design.primary }} />
            <span className="absolute inset-0 rounded-full" style={{ background: `${design.primary}22` }} />
            {block.imageUrl ? (
              <img src={block.imageUrl} alt={title} className="relative h-20 w-20 rounded-full object-cover" />
            ) : (
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full" style={{ background: design.primary }}>
                <PhoneCall className="h-8 w-8" style={{ color: getContrastText(design.primary) }} />
              </div>
            )}
          </div>
          <div>
            <div className="text-xl font-bold" style={resolveTextStyle(block, 'title', { fontFamily: design.fontHeading })}>{title}</div>
            <div className="mt-1 text-sm opacity-60">{subtitle || 'Chamada de voz'} · {block.audioCallDuration ?? '00:00'}</div>
          </div>
          <div className="flex items-center justify-center gap-6">
            <div aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full opacity-40" style={{ background: design.surface }}>
              <VolumeX className="h-5 w-5" style={{ color: design.text }} />
            </div>
            <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
              <span className="inline-flex items-center gap-2"><Mic className="h-4 w-4" />{block.ctaLabel || 'Atender'}</span>
            </PrimaryBtn>
          </div>
        </div>
      );

    case 'carousel': {
      const imagens = block.carouselImages ?? [];
      return (
        <div>
          {heading}
          {imagens.length === 0 ? (
            // Sem imagens o bloco sumia da tela: no rascunho a etapa parecia um
            // título solto com um botão, e não dava pra saber que faltava algo.
            <div
              className="mb-6 h-40 grid place-items-center"
              style={{
                borderRadius: design.radius,
                background: withAlpha(design.text, 0.05),
                border: `1px dashed ${withAlpha(design.text, 0.18)}`,
              }}
            >
              <div className="flex flex-col items-center gap-2 px-6 text-center">
                <ImageIcon className="h-7 w-7" style={{ color: withAlpha(design.text, 0.35) }} />
                <span className="text-sm" style={{ color: design.muted }}>Imagens ainda não adicionadas</span>
              </div>
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto mb-6 -mx-1 px-1 snap-x snap-mandatory">
              {imagens.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt={block.title ? `${block.title} — imagem ${i + 1}` : `Imagem ${i + 1}`}
                  className="h-56 w-72 shrink-0 object-cover snap-start"
                  style={{ borderRadius: design.radius }}
                />
              ))}
            </div>
          )}
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'comparison':
      return (
        <div>
          {heading}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="p-4 rounded-lg space-y-2.5" style={{ background: design.surface }}>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{block.comparisonLeftLabel}</div>
              {(block.comparisonLeftItems ?? []).map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm leading-snug">
                  <X className="h-4 w-4 shrink-0 mt-px text-destructive" /> {item}
                </div>
              ))}
            </div>
            <div className="p-4 rounded-lg space-y-2.5" style={{ background: design.primary + '15' }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: design.primary }}>{block.comparisonRightLabel}</div>
              {(block.comparisonRightItems ?? []).map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-sm leading-snug">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-px" style={{ color: design.primary }} /> {item}
                </div>
              ))}
            </div>
          </div>
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'chart':
      return (
        <div>
          {heading}
          <ChartBlock block={block} design={design} />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'scheduling': {
      const agenda = (value as ValorAgendamento | undefined) ?? {};
      /* Só vale como respondido quando há dia — e, se o horário foi pedido,
         também o horário. Sem isso o visitante avançaria com meia marcação. */
      const completo = !!agenda.data && (!block.schedulingAllowTime || !!agenda.hora);
      return (
        <div>
          {heading}
          <div className="mb-6">
            <SchedulingField
              block={block}
              design={design}
              value={agenda}
              onChange={(v) => setValue(v)}
            />
          </div>
          <PrimaryBtn
            design={design}
            textStyle={btnText}
            hidden={!terminal}
            disabled={!completo || saving}
            onClick={() => onSubmit(agenda)}
          >
            {block.ctaLabel || 'Confirmar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'custom':
      return (
        <div>
          <div dangerouslySetInnerHTML={{ __html: block.customHtml ?? '' }} className="mb-6" />
          <PrimaryBtn design={design} textStyle={btnText} hidden={!terminal} onClick={() => onSubmit(true)}>
            Continuar
          </PrimaryBtn>
        </div>
      );

    default:
      return heading;
  }
}

function ResultView({ schema, state }: { schema: QuizSchema; state: QuizRunState }) {
  const design = schema.design;
  const resultBlock = schema.blocks.find((b) => b.type === 'result');
  const max = maxPossibleScore(schema);
  const temperature = classifyTemperature(state.score, max);
  const pct = max > 0 ? Math.round((state.score / max) * 100) : 0;
  // A tela de resultado é o lugar de maior valor pra personalização dinâmica —
  // "Baseado no seu peso de {{peso}}kg e IMC {{calc(peso/(altura/100)^2)}}...".
  const scope = resolveScope(schema.blocks, state.responses, { score: state.score });
  const resultTitle = interpolateText(resultBlock?.resultTitle, scope);
  const resultBody = interpolateText(resultBlock?.resultBody, scope);

  // O visitante nunca deveria ler que o sistema o classificou como "frio" — a badge é sempre
  // uma mensagem positiva por padrão; quem quiser diferenciar por faixa pode personalizar cada
  // uma no Inspector (ex: reforçar urgência pro lead "quente"), mas o padrão nunca envergonha.
  const defaultBadge = '✨ Resultado pronto';
  const badgeText =
    temperature === 'hot'
      ? resultBlock?.resultBadgeHot || defaultBadge
      : temperature === 'warm'
        ? resultBlock?.resultBadgeWarm || defaultBadge
        : resultBlock?.resultBadgeCold || defaultBadge;

  return (
    <div className="text-center py-8 space-y-5">
      <div
        className="inline-block px-3 py-1 text-xs font-semibold rounded-full"
        style={{ background: design.primary, color: getContrastText(design.primary) }}
      >
        {badgeText}
      </div>
      <h2 className="text-3xl sm:text-4xl font-bold" style={resultBlock ? resolveTextStyle(resultBlock, 'title', { fontFamily: design.fontHeading }) : { fontFamily: design.fontHeading }}>
        {resultTitle || 'Seu resultado está pronto'}
      </h2>
      <p
        className="text-base max-w-md mx-auto"
        style={resultBlock ? resolveTextStyle(resultBlock, 'subtitle', { color: design.muted }) : { color: design.muted }}
      >
        {resultBody || 'Obrigado por completar o quiz.'}
      </p>
      <div className="text-5xl font-bold pt-4" style={{ color: design.primary, fontFamily: design.fontHeading }}>
        {pct}%
      </div>
      {resultBlock?.ctaLabel && (
        <PrimaryBtn
          design={design}
          textStyle={resultBlock ? resolveTextStyle(resultBlock, 'button') : undefined}
          onClick={resultBlock.ctaUrl ? () => { window.location.href = resultBlock.ctaUrl!; } : undefined}
        >
          {resultBlock.ctaLabel}
        </PrimaryBtn>
      )}
    </div>
  );
}

/**
 * Gráfico do bloco `chart`.
 *
 * Antes eram barras desenhadas com `div` e altura em porcentagem: só servia
 * para barra, e nenhum eixo, grade ou legenda era possível. Agora passa pelo
 * recharts, que já é dependência do painel.
 */
function ChartBlock({ block, design }: { block: QuizBlock; design: QuizDesign }) {
  const pontos = (block.chartData ?? []).map((p) => ({ ...p, name: p.label }));
  if (!pontos.length) {
    return (
      <div
        className="mb-6 grid place-items-center rounded-xl border border-dashed py-10 text-xs opacity-60"
        style={{ borderColor: withAlpha(design.text, 0.2) }}
      >
        Nenhum dado no gráfico
      </div>
    );
  }

  const altura = block.chartHeight ?? 220;
  const eixoX = block.chartShowX !== false;
  const eixoY = block.chartShowY !== false;
  const grade = block.chartShowGrid !== false;
  const legenda = block.chartShowLegend === true;
  const cor = design.primary;
  /* Fatias de pizza precisam de cores distintas. Em vez de uma paleta fixa que
     brigaria com o tema, giram-se opacidades da cor do funil. */
  const corDaFatia = (i: number) => withAlpha(cor, 1 - (i % 5) * 0.16);

  const estiloDaDica = {
    background: design.surface,
    border: `1px solid ${withAlpha(design.text, 0.15)}`,
    borderRadius: 10,
    color: design.text,
    fontSize: 12,
  };

  /* Array, e não Fragment: o recharts procura eixo, grade e legenda entre os
     filhos DIRETOS do gráfico. Dentro de um `<>...</>` ele não acha nenhum, e
     some tudo em silêncio — o gráfico desenha só a série. */
  const comum = [
    grade ? <CartesianGrid key="g" strokeDasharray="3 3" stroke={withAlpha(design.text, 0.12)} /> : null,
    eixoX ? <XAxis key="x" dataKey="name" tick={{ fontSize: 11, fill: design.muted }} stroke={withAlpha(design.text, 0.2)} /> : null,
    eixoY ? <YAxis key="y" tick={{ fontSize: 11, fill: design.muted }} stroke={withAlpha(design.text, 0.2)} /> : null,
    // Sem `formatter`, a dica mostra a chave crua ("value : 20") em vez do
    // número sozinho — foi o que apareceu no teste.
    <Tooltip key="t" contentStyle={estiloDaDica} formatter={(v: number) => [v, '']} />,
    legenda ? <Legend key="l" wrapperStyle={{ fontSize: 11 }} /> : null,
  ];

  return (
    <div className="mb-6" style={{ height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        {block.chartType === 'line' ? (
          <LineChart data={pontos}>
            {comum}
            <Line type="monotone" dataKey="value" stroke={cor} strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        ) : block.chartType === 'area' ? (
          <AreaChart data={pontos}>
            {comum}
            <Area type="monotone" dataKey="value" stroke={cor} strokeWidth={2.5} fill={withAlpha(cor, 0.22)} />
          </AreaChart>
        ) : block.chartType === 'pie' ? (
          <PieChart>
            <Tooltip contentStyle={estiloDaDica} formatter={(v: number, n: string) => [v, n]} />
            {legenda && <Legend wrapperStyle={{ fontSize: 11 }} />}
            <Pie data={pontos} dataKey="value" nameKey="name" innerRadius="45%" outerRadius="80%" paddingAngle={2}>
              {pontos.map((p, i) => (
                <Cell key={p.id} fill={corDaFatia(i)} />
              ))}
            </Pie>
          </PieChart>
        ) : block.chartType === 'radial' ? (
          <RadialBarChart data={pontos} innerRadius="30%" outerRadius="95%" startAngle={90} endAngle={-270}>
            {legenda && <Legend wrapperStyle={{ fontSize: 11 }} />}
            <RadialBar dataKey="value" cornerRadius={6}>
              {pontos.map((p, i) => (
                <Cell key={p.id} fill={corDaFatia(i)} />
              ))}
            </RadialBar>
          </RadialBarChart>
        ) : (
          <BarChart data={pontos}>
            {comum}
            <Bar dataKey="value" fill={cor} radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
