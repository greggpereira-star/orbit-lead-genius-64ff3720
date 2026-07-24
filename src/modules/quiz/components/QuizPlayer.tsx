import { useEffect, useMemo, useRef, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { quizService } from '../services/quizService';
import type { QuizBlock, QuizSchema, AccessRules } from '../types';
import { getSteps } from '../lib/steps';
import { getContrastText } from '../lib/color';
import { resolveScope, interpolateText, type VariableScope } from '../lib/variables';
import {
  createInitialState,
  evaluateResponse,
  evaluateLogic,
  nextStepIndex,
  isBlockVisible,
  classifyTemperature,
  maxPossibleScore,
  type QuizRunState,
} from '../engine';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { CountdownTimer } from './CountdownTimer';
import { Sparkles, Hourglass, CheckCircle2, Bell, Gift, BellRing, X, Users, Star, Flame } from 'lucide-react';
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
        <div className="fixed top-2 right-2 z-50 px-3 py-1 rounded-full bg-yellow-500 text-black text-xs font-semibold shadow">
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
  const scope = useMemo(() => resolveScope(blocks, state.responses), [blocks, state.responses]);

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

  const geoRef = useRef<{ country?: string; city?: string }>({});
  const draftResponses = useRef<Record<string, unknown>>({});

  useEffect(() => {
    draftResponses.current = {};
    setStepValidity({});
  }, [state.currentStepIndex]);

  useEffect(() => {
    if (preview) return;
    fetch('https://ipapi.co/json/')
      .then((r) => r.json())
      .then((data: { country_name?: string; city?: string }) => {
        geoRef.current = { country: data.country_name, city: data.city };
      })
      .catch(() => {});
  }, [preview]);

  // Etapa cujos blocos estão TODOS ocultos pela condição: pula pra próxima com
  // conteúdo visível (etapa condicional inteira que não se aplica a este visitante).
  useEffect(() => {
    if (done || stepBlocks.length === 0 || visibleStepBlocks.length > 0) return;
    let idx = state.currentStepIndex + 1;
    while (idx < steps.length && !stepHasVisibleBlocks(idx, state.responses)) idx += 1;
    if (idx < steps.length) setState((s) => ({ ...s, currentStepIndex: idx }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentStepIndex, done, visibleStepBlocks.length]);

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

  useEffect(() => {
    if (preview) return;
    quizService.trackEvent({ quizId, companyId, eventType: 'start' }).catch(() => {});
  }, [quizId, companyId, preview]);

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
          metadata: { variant_id: variantAssignments.current.get(b.id) ?? 'control' },
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep?.id, quizId, companyId, submissionId, preview]);

  if (stepBlocks.length === 0) {
    return <EmptyState message="Quiz sem blocos" />;
  }

  const allStepValid = visibleStepBlocks.every((b) => stepValidity[b.id] !== false);

  const advanceStep = async (finalDraft: Record<string, unknown>) => {
    let scoreDelta = 0;
    const tags: string[] = [];
    let jumpToBlockId: string | undefined;
    const nextResponses = { ...state.responses };
    for (const b of visibleStepBlocks) {
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
            metadata: { variant_id: variantAssignments.current.get(b.id) ?? 'control' },
          })
          .catch(() => {});
      }
      const logicJump = evaluateLogic(b, nextResponses);
      if (logicJump) jumpToBlockId = logicJump;
    }
    const nextState: QuizRunState = {
      ...state,
      responses: nextResponses,
      score: state.score + scoreDelta,
      tags: [...state.tags, ...tags],
      history: [...state.history, ...visibleStepBlocks.map((b) => b.id)],
    };
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
    setState({ ...nextState, currentStepIndex: idx });
  };

  const finish = async (finalState: QuizRunState) => {
    setSaving(true);
    try {
      if (preview) {
        setState(finalState);
        setDone(true);
        return;
      }
      const max = maxPossibleScore(schema);
      const temperature = classifyTemperature(finalState.score, max);
      const formBlock = blocks.find((b) => b.type === 'form');
      const formResponse = formBlock
        ? (finalState.responses[formBlock.id] as { name?: string; email?: string; phone?: string } | undefined)
        : undefined;
      const email = extract(finalState.responses, blocks, 'email') ?? formResponse?.email;
      const phone = extract(finalState.responses, blocks, 'phone') ?? formResponse?.phone;
      const name = extract(finalState.responses, blocks, 'short-text') ?? formResponse?.name;
      const enrichedTracking: Record<string, string> = {
        ...tracking,
        user_agent: navigator.userAgent,
      };
      if (geoRef.current.country) enrichedTracking.geo_country = geoRef.current.country;
      if (geoRef.current.city) enrichedTracking.geo_city = geoRef.current.city;
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
      });
      setSubmissionId(id);
      await quizService
        .trackEvent({
          quizId,
          companyId,
          submissionId: id,
          eventType: 'complete',
          metadata: { score: finalState.score, temperature },
        })
        .catch(() => {});
      setState(finalState);
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex justify-center"
      style={{ background: design.background, color: design.text, fontFamily: design.fontBody }}
    >
      <div className="w-full flex flex-col" style={{ maxWidth: QUIZ_MAX_WIDTH }}>
        {!done && <UrgencyBar quizId={quizId} settings={urgencyBar} design={design} />}
        <div className="flex-1 flex flex-col" style={{ padding: '24px 16px' }}>
          <ProgressBar
            value={done ? 1 : (state.currentStepIndex + 1) / steps.length}
            current={done ? steps.length - 1 : state.currentStepIndex}
            total={steps.length}
            design={design}
          />
          <div className="mt-6 flex-1 flex flex-col gap-6">
            {done ? (
              <ResultView schema={schema} state={state} />
            ) : (
              effectiveBlocks.map((b, i) => {
                const isTerminal = i === effectiveBlocks.length - 1;
                return (
                  <BlockView
                    key={b.id}
                    block={b}
                    design={design}
                    scope={scope}
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

function extract(responses: Record<string, unknown>, blocks: QuizBlock[], type: QuizBlock['type']): string | undefined {
  const b = blocks.find((x) => x.type === type);
  if (!b) return undefined;
  const v = responses[b.id];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
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
      className="h-1.5 rounded-full overflow-hidden"
      style={{ background: design.surface }}
      {...a11yProps}
    >
      <div
        className="h-full transition-all duration-500 motion-reduce:transition-none"
        style={{ width: `${pct}%`, background: design.primary }}
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
}: {
  design: QuizSchema['design'];
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  hidden?: boolean;
}) {
  if (hidden) return null;
  const style: React.CSSProperties = { borderRadius: design.radius };
  if (design.buttonStyle === 'gradient') {
    style.background = `linear-gradient(135deg, ${design.primary}, ${design.primary}cc)`;
    style.color = getContrastText(design.primary);
  } else if (design.buttonStyle === 'outline') {
    style.border = `2px solid ${design.primary}`;
    style.color = design.primary;
  } else if (design.buttonStyle === 'ghost') {
    style.color = design.primary;
  } else {
    style.background = design.primary;
    style.color = getContrastText(design.primary);
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full sm:w-auto px-8 py-3.5 font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ ...style, outlineColor: design.primary }}
    >
      {children}
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
}: {
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
  const [value, setValue] = useState<unknown>('');
  const [multi, setMulti] = useState<string[]>([]);
  const [formValue, setFormValue] = useState({ name: '', email: '', phone: '' });
  const [revealed, setRevealed] = useState(false);

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
    if (
      block.type === 'short-text' || block.type === 'long-text' || block.type === 'email' ||
      block.type === 'phone' || block.type === 'weight' || block.type === 'height'
    ) {
      return !block.required || (typeof value === 'string' && value.trim().length > 0);
    }
    if (block.type === 'form') {
      const ff = block.formFields ?? { name: true, email: true, phone: true };
      return !ff.email || formValue.email.trim().length > 0;
    }
    if (block.type === 'reveal') return revealed;
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
      block.type === 'weight' || block.type === 'height'
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
  const heading = (
    <div className="space-y-3 mb-6">
      {title && (
        <h2 className="text-2xl sm:text-3xl font-bold leading-tight" style={{ fontFamily: design.fontHeading }}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="text-base opacity-80" style={{ color: design.muted }}>
          {subtitle}
        </p>
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
          <h1 className="text-4xl font-bold" style={{ fontFamily: design.fontHeading }}>{title}</h1>
          {subtitle && (
            <p className="text-lg max-w-md mx-auto" style={{ color: design.muted }}>
              {subtitle}
            </p>
          )}
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Começar'}
          </PrimaryBtn>
        </div>
      );

    case 'single-choice':
      return (
        <div>
          {heading}
          <div className="space-y-2.5" role="radiogroup" aria-label={block.title || 'Opções'}>
            {(block.options ?? []).map((o) => {
              const active = value === o.id;
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    setValue(o.id);
                    if (terminal) onSubmit(o.id);
                  }}
                  role="radio"
                  aria-checked={active}
                  className="w-full text-left px-5 py-4 border-2 transition-all hover:scale-[1.01] active:scale-[0.99] motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
                  style={{
                    borderRadius: design.radius,
                    borderColor: active ? design.primary : design.surface,
                    background: design.surface,
                    color: design.text,
                  }}
                >
                  {o.emoji && <span className="mr-2">{o.emoji}</span>}
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>
      );

    case 'multi-choice':
      return (
        <div>
          {heading}
          <div className="space-y-2.5 mb-6" role="group" aria-label={block.title || 'Opções'}>
            {(block.options ?? []).map((o) => {
              const active = multi.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() =>
                    setMulti((m) => (m.includes(o.id) ? m.filter((x) => x !== o.id) : [...m, o.id]))
                  }
                  aria-pressed={active}
                  className="w-full text-left px-5 py-4 border-2 transition-all"
                  style={{
                    borderRadius: design.radius,
                    borderColor: active ? design.primary : design.surface,
                    background: design.surface,
                    color: design.text,
                  }}
                >
                  {o.emoji && <span className="mr-2">{o.emoji}</span>}
                  {o.label}
                </button>
              );
            })}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(multi)} disabled={!canSubmit || !stepValid || saving}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
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
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-6 text-base"
            style={{
              borderRadius: design.radius,
              background: design.surface,
              color: design.text,
              border: `1px solid ${design.surface}`,
              outlineColor: design.primary,
            }}
          />
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
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
              outlineColor: design.primary,
            }}
          />
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
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
          <div className="relative w-full aspect-video overflow-hidden bg-black mb-6" style={{ borderRadius: design.radius }}>
            {isMp4 ? (
              <video src={src} controls className="w-full h-full" />
            ) : (
              <iframe src={src} className="w-full h-full" allowFullScreen title="video" />
            )}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'testimonial':
      return (
        <div>
          <div
            className="p-6 space-y-4 mb-6"
            style={{ background: design.surface, borderRadius: design.radius }}
          >
            <p className="text-xl italic leading-relaxed">{title}</p>
            <div className="flex items-center gap-3">
              {block.testimonialAvatar && (
                <img
                  src={block.testimonialAvatar}
                  alt={block.testimonialAuthor || 'Depoimento'}
                  className="h-10 w-10 rounded-full object-cover"
                />
              )}
              <div>
                <div className="text-sm font-semibold">{block.testimonialAuthor}</div>
                {block.testimonialRole && (
                  <div className="text-xs" style={{ color: design.muted }}>
                    {block.testimonialRole}
                  </div>
                )}
              </div>
            </div>
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'divider':
      return (
        <div className="py-6">
          <div className="h-px w-full mb-6" style={{ background: design.surface }} />
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            Continuar
          </PrimaryBtn>
        </div>
      );

    case 'cta':
    case 'result':
      return (
        <div className="text-center py-6 space-y-4">
          {heading}
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'argument':
      return (
        <div className="space-y-6">
          <div className="flex gap-4 items-start">
            <div
              className="h-12 w-12 shrink-0 rounded-full flex items-center justify-center"
              style={{ background: design.primary + '22' }}
            >
              <Sparkles className="h-5 w-5" style={{ color: design.primary }} />
            </div>
            {heading}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'level': {
      const pct = block.progressValue ?? 50;
      return (
        <div>
          {heading}
          <div className="flex items-center justify-between text-sm font-semibold mb-2">
            <span>{block.levelLabel ?? ''}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3.5 rounded-full overflow-hidden mb-6" style={{ background: design.surface }}>
            <div className="h-full transition-all duration-700 motion-reduce:transition-none" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
                  style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}`, outlineColor: design.primary }}
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
                  style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}`, outlineColor: design.primary }}
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
                  style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}`, outlineColor: design.primary }}
                />
              </>
            )}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(formValue)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Enviar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'weight':
    case 'height':
      return (
        <div>
          {heading}
          <div className="relative mb-6">
            <label htmlFor={`field-${block.id}`} className="sr-only">{block.title || (block.type === 'weight' ? 'Peso' : 'Altura')}</label>
            <input
              id={`field-${block.id}`}
              type="number"
              placeholder={block.placeholder}
              value={String(value ?? '')}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-base"
              style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}`, outlineColor: design.primary }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm opacity-60">
              {block.type === 'weight' ? 'kg' : 'cm'}
            </span>
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(value)} disabled={!canSubmit || !stepValid || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'pricing':
      return (
        <div className="text-center space-y-5">
          {title && <h2 className="text-xl font-semibold" style={{ fontFamily: design.fontHeading }}>{title}</h2>}
          <div className="flex items-end justify-center gap-2">
            <span className="text-4xl font-bold" style={{ color: design.primary, fontFamily: design.fontHeading }}>{block.pricingPrice ?? 'R$ 0'}</span>
            <span className="text-base opacity-70">{block.pricingPeriod}</span>
          </div>
          {block.pricingOriginalPrice && (
            <div className="text-sm line-through opacity-50">{block.pricingOriginalPrice}</div>
          )}
          <div className="space-y-2 text-left max-w-xs mx-auto">
            {(block.pricingFeatures ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: design.primary }} />
                {f}
              </div>
            ))}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
            <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'carousel':
      return (
        <div>
          {heading}
          <div className="flex gap-3 overflow-x-auto mb-6 -mx-1 px-1">
            {(block.carouselImages ?? []).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={block.title ? `${block.title} — imagem ${i + 1}` : `Imagem ${i + 1}`}
                className="h-56 w-72 shrink-0 object-cover"
                style={{ borderRadius: design.radius }}
              />
            ))}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'comparison':
      return (
        <div>
          {heading}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-4 rounded-lg space-y-2" style={{ background: design.surface }}>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-60">{block.comparisonLeftLabel}</div>
              {(block.comparisonLeftItems ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <X className="h-4 w-4 shrink-0 text-red-400" /> {item}
                </div>
              ))}
            </div>
            <div className="p-4 rounded-lg space-y-2" style={{ background: design.primary + '15' }}>
              <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: design.primary }}>{block.comparisonRightLabel}</div>
              {(block.comparisonRightItems ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: design.primary }} /> {item}
                </div>
              ))}
            </div>
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'chart': {
      const points = block.chartData ?? [];
      const max = Math.max(1, ...points.map((p) => p.value));
      return (
        <div>
          {heading}
          <div className="flex items-end gap-6 h-44 mb-6">
            {points.map((p) => (
              <div key={p.id} className="flex-1 flex flex-col items-center justify-end gap-2 h-full">
                <span className="text-sm font-semibold">{p.value}</span>
                <div
                  className="w-full rounded-t-md transition-all duration-700 motion-reduce:transition-none"
                  style={{ height: `${(p.value / max) * 100}%`, background: design.primary }}
                />
                <span className="text-xs opacity-60">{p.label}</span>
              </div>
            ))}
          </div>
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'custom':
      return (
        <div>
          <div dangerouslySetInnerHTML={{ __html: block.customHtml ?? '' }} className="mb-6" />
          <PrimaryBtn design={design} hidden={!terminal} onClick={() => onSubmit(true)}>
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
  const scope = resolveScope(schema.blocks, state.responses);
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
      <h2 className="text-3xl sm:text-4xl font-bold" style={{ fontFamily: design.fontHeading }}>
        {resultTitle || 'Seu resultado está pronto'}
      </h2>
      <p className="text-base max-w-md mx-auto" style={{ color: design.muted }}>
        {resultBody || 'Obrigado por completar o quiz.'}
      </p>
      <div className="text-5xl font-bold pt-4" style={{ color: design.primary, fontFamily: design.fontHeading }}>
        {pct}%
      </div>
      {resultBlock?.ctaLabel && (
        <PrimaryBtn
          design={design}
          onClick={resultBlock.ctaUrl ? () => { window.location.href = resultBlock.ctaUrl!; } : undefined}
        >
          {resultBlock.ctaLabel}
        </PrimaryBtn>
      )}
    </div>
  );
}
