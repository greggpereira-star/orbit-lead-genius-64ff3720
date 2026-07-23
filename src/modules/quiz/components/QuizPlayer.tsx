import { useEffect, useMemo, useRef, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { quizService } from '../services/quizService';
import type { QuizBlock, QuizSchema, AccessRules } from '../types';
import {
  createInitialState,
  evaluateResponse,
  nextIndex,
  classifyTemperature,
  maxPossibleScore,
  type QuizRunState,
} from '../engine';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { CountdownTimer } from './CountdownTimer';
import { Sparkles, Hourglass, CheckCircle2, Bell, Gift, BellRing, X } from 'lucide-react';

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

const playerQuery = (slug: string, preview: boolean) =>
  queryOptions({
    queryKey: ['quiz-public', slug, preview ? 'preview' : 'published'],
    queryFn: () =>
      preview ? quizService.getDraftBySlug(slug) : quizService.getPublishedBySlug(slug),
    staleTime: preview ? 0 : 60_000,
  });

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
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-yellow-500 text-black text-xs font-semibold shadow">
          Preview (rascunho)
        </div>
      )}
      <PlayerRunner
        quizId={data.quiz.id}
        companyId={data.quiz.company_id}
        schema={data.schema}
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
  preview = false,
  tracking,
}: {
  quizId: string;
  companyId: string;
  schema: QuizSchema;
  preview?: boolean;
  tracking?: Record<string, string>;
}) {
  const [state, setState] = useState<QuizRunState>(createInitialState);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const design = schema.design;
  const blocks = schema.blocks;
  const block = blocks[state.currentIndex];
  const isLast = state.currentIndex >= blocks.length - 1;

  const geoRef = useRef<{ country?: string; city?: string }>({});

  useEffect(() => {
    if (preview) return;
    fetch('https://ipapi.co/json/')
      .then((r) => r.json())
      .then((data: { country_name?: string; city?: string }) => {
        geoRef.current = { country: data.country_name, city: data.city };
      })
      .catch(() => {});
  }, [preview]);

  const variantAssignments = useRef<Map<string, string>>(new Map());
  const variantId = useMemo(() => {
    if (!block?.abTest?.enabled || block.abTest.variants.length === 0) return 'control';
    const existing = variantAssignments.current.get(block.id);
    if (existing) return existing;
    const options = ['control', ...block.abTest.variants.map((v) => v.id)];
    const picked = options[Math.floor(Math.random() * options.length)];
    variantAssignments.current.set(block.id, picked);
    return picked;
  }, [block?.id]);

  const effectiveBlock = useMemo(() => {
    if (!block || variantId === 'control') return block;
    const variant = block.abTest?.variants.find((v) => v.id === variantId);
    if (!variant) return block;
    return {
      ...block,
      title: variant.title ?? block.title,
      subtitle: variant.subtitle ?? block.subtitle,
      ctaLabel: variant.ctaLabel ?? block.ctaLabel,
      imageUrl: variant.imageUrl ?? block.imageUrl,
    };
  }, [block, variantId]);

  useEffect(() => {
    if (preview) return;
    quizService.trackEvent({ quizId, companyId, eventType: 'start' }).catch(() => {});
  }, [quizId, companyId, preview]);

  useEffect(() => {
    if (preview) return;
    if (block) {
      quizService
        .trackEvent({
          quizId,
          companyId,
          submissionId,
          eventType: 'block_view',
          blockId: block.id,
          metadata: { variant_id: variantId },
        })
        .catch(() => {});
    }
  }, [block?.id, quizId, companyId, submissionId, preview, variantId]);

  if (!block) {
    return <EmptyState message="Quiz sem blocos" />;
  }

  const advance = async (response: unknown) => {
    if (!preview && block.abTest?.enabled) {
      quizService
        .trackEvent({
          quizId,
          companyId,
          submissionId,
          eventType: 'block_advance',
          blockId: block.id,
          metadata: { variant_id: variantId },
        })
        .catch(() => {});
    }
    const { scoreDelta, tags, jumpToBlockId } = evaluateResponse(block, response);
    const nextResponses = { ...state.responses, [block.id]: response };
    const nextState: QuizRunState = {
      ...state,
      responses: nextResponses,
      score: state.score + scoreDelta,
      tags: [...state.tags, ...tags],
      history: [...state.history, block.id],
    };
    if (isLast) {
      await finish(nextState);
      return;
    }
    const idx = nextIndex(schema, nextState, jumpToBlockId);
    setState({ ...nextState, currentIndex: idx });
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
    <div className="min-h-screen w-full flex justify-center" style={{ background: design.background, color: design.text }}>
      <div className="w-full flex flex-col" style={{ maxWidth: QUIZ_MAX_WIDTH, padding: '24px 16px' }}>
        <ProgressBar
          value={done ? 1 : (state.currentIndex + 1) / blocks.length}
          design={design}
        />
        <div className="mt-6 flex-1 flex flex-col">
          {done ? (
            <ResultView schema={schema} state={state} />
          ) : (
            <BlockView key={block.id} block={effectiveBlock} design={design} onSubmit={advance} saving={saving} />
          )}
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

function ProgressBar({ value, design }: { value: number; design: QuizSchema['design'] }) {
  if (design.progressStyle === 'none') return null;
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: design.surface }}>
      <div
        className="h-full transition-all duration-500"
        style={{ width: `${Math.min(100, value * 100)}%`, background: design.primary }}
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
}: {
  design: QuizSchema['design'];
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const style: React.CSSProperties = { borderRadius: design.radius };
  if (design.buttonStyle === 'gradient') {
    style.background = `linear-gradient(135deg, ${design.primary}, ${design.primary}cc)`;
    style.color = '#fff';
  } else if (design.buttonStyle === 'outline') {
    style.border = `2px solid ${design.primary}`;
    style.color = design.primary;
  } else if (design.buttonStyle === 'ghost') {
    style.color = design.primary;
  } else {
    style.background = design.primary;
    style.color = '#fff';
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full sm:w-auto px-8 py-3.5 font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
      style={style}
    >
      {children}
    </button>
  );
}

function BlockView({
  block,
  design,
  onSubmit,
  saving,
}: {
  block: QuizBlock;
  design: QuizSchema['design'];
  onSubmit: (response: unknown) => void;
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

  const heading = (
    <div className="space-y-3 mb-6">
      {block.title && <h2 className="text-2xl sm:text-3xl font-bold leading-tight">{block.title}</h2>}
      {block.subtitle && (
        <p className="text-base opacity-80" style={{ color: design.muted }}>
          {block.subtitle}
        </p>
      )}
    </div>
  );

  switch (block.type) {
    case 'intro':
      return (
        <div className="text-center py-8 space-y-6">
          {block.imageUrl && <img src={block.imageUrl} alt="" className="mx-auto max-h-52 rounded-xl" />}
          <h1 className="text-4xl font-bold">{block.title}</h1>
          {block.subtitle && (
            <p className="text-lg max-w-md mx-auto" style={{ color: design.muted }}>
              {block.subtitle}
            </p>
          )}
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Começar'}
          </PrimaryBtn>
        </div>
      );

    case 'single-choice':
      return (
        <div>
          {heading}
          <div className="space-y-2.5">
            {(block.options ?? []).map((o) => (
              <button
                key={o.id}
                onClick={() => onSubmit(o.id)}
                className="w-full text-left px-5 py-4 border-2 transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  borderRadius: design.radius,
                  borderColor: design.surface,
                  background: design.surface,
                  color: design.text,
                }}
              >
                {o.emoji && <span className="mr-2">{o.emoji}</span>}
                {o.label}
              </button>
            ))}
          </div>
        </div>
      );

    case 'multi-choice':
      return (
        <div>
          {heading}
          <div className="space-y-2.5 mb-6">
            {(block.options ?? []).map((o) => {
              const active = multi.includes(o.id);
              return (
                <button
                  key={o.id}
                  onClick={() =>
                    setMulti((m) => (m.includes(o.id) ? m.filter((x) => x !== o.id) : [...m, o.id]))
                  }
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
          <PrimaryBtn design={design} onClick={() => onSubmit(multi)} disabled={!canSubmit || saving}>
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
                  className="h-12 w-12 flex items-center justify-center text-lg font-bold border-2 transition-all"
                  style={{
                    borderRadius: design.radius,
                    borderColor: active ? design.primary : design.surface,
                    background: active ? design.primary : design.surface,
                    color: active ? '#fff' : design.text,
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(value)} disabled={!canSubmit || saving}>
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
          <input
            type={block.type === 'email' ? 'email' : block.type === 'phone' ? 'tel' : 'text'}
            placeholder={block.placeholder}
            value={String(value ?? '')}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-3.5 outline-none mb-6 text-base"
            style={{
              borderRadius: design.radius,
              background: design.surface,
              color: design.text,
              border: `1px solid ${design.surface}`,
            }}
          />
          <PrimaryBtn design={design} onClick={() => onSubmit(value)} disabled={!canSubmit || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'long-text':
      return (
        <div>
          {heading}
          <textarea
            rows={5}
            placeholder={block.placeholder}
            value={String(value ?? '')}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-3.5 outline-none resize-none mb-6 text-base"
            style={{
              borderRadius: design.radius,
              background: design.surface,
              color: design.text,
            }}
          />
          <PrimaryBtn design={design} onClick={() => onSubmit(value)} disabled={!canSubmit || saving}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
              alt=""
              className="w-full object-cover mb-6"
              style={{ borderRadius: design.radius }}
            />
          )}
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
            <p className="text-xl italic leading-relaxed">{block.title}</p>
            <div className="flex items-center gap-3">
              {block.testimonialAvatar && (
                <img
                  src={block.testimonialAvatar}
                  alt=""
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'divider':
      return (
        <div className="py-6">
          <div className="h-px w-full mb-6" style={{ background: design.surface }} />
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
            Continuar
          </PrimaryBtn>
        </div>
      );

    case 'cta':
    case 'result':
      return (
        <div className="text-center py-6 space-y-4">
          {heading}
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
            <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
            <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
              <input
                placeholder="Nome"
                value={formValue.name}
                onChange={(e) => setFormValue((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-4 py-3.5 outline-none text-base"
                style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}` }}
              />
            )}
            {ff.email && (
              <input
                type="email"
                placeholder="E-mail"
                value={formValue.email}
                onChange={(e) => setFormValue((f) => ({ ...f, email: e.target.value }))}
                className="w-full px-4 py-3.5 outline-none text-base"
                style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}` }}
              />
            )}
            {ff.phone && (
              <input
                type="tel"
                placeholder="Telefone"
                value={formValue.phone}
                onChange={(e) => setFormValue((f) => ({ ...f, phone: e.target.value }))}
                className="w-full px-4 py-3.5 outline-none text-base"
                style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}` }}
              />
            )}
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(formValue)} disabled={!canSubmit || saving}>
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
            <input
              type="number"
              placeholder={block.placeholder}
              value={String(value ?? '')}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-4 py-3.5 outline-none text-base"
              style={{ borderRadius: design.radius, background: design.surface, color: design.text, border: `1px solid ${design.surface}` }}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm opacity-60">
              {block.type === 'weight' ? 'kg' : 'cm'}
            </span>
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(value)} disabled={!canSubmit || saving}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );

    case 'pricing':
      return (
        <div className="text-center space-y-5">
          {block.title && <h2 className="text-xl font-semibold">{block.title}</h2>}
          <div className="flex items-end justify-center gap-2">
            <span className="text-4xl font-bold" style={{ color: design.primary }}>{block.pricingPrice ?? 'R$ 0'}</span>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
              className="w-full border-2 border-dashed rounded-xl p-10 transition-all hover:scale-[1.01]"
              style={{ borderColor: design.primary, borderRadius: design.radius }}
            >
              <Gift className="h-7 w-7 mx-auto mb-2" style={{ color: design.primary }} />
              {block.revealLabel || 'Revelar prêmio'}
            </button>
          )}
          {revealed && (
            <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
              <div className="text-base font-semibold">{block.title}</div>
              {block.subtitle && <div className="text-sm opacity-70">{block.subtitle}</div>}
            </div>
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
                alt=""
                className="h-56 w-72 shrink-0 object-cover"
                style={{ borderRadius: design.radius }}
              />
            ))}
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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
                  className="w-full rounded-t-md transition-all duration-700"
                  style={{ height: `${(p.value / max) * 100}%`, background: design.primary }}
                />
                <span className="text-xs opacity-60">{p.label}</span>
              </div>
            ))}
          </div>
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
            {block.ctaLabel || 'Continuar'}
          </PrimaryBtn>
        </div>
      );
    }

    case 'custom':
      return (
        <div>
          <div dangerouslySetInnerHTML={{ __html: block.customHtml ?? '' }} className="mb-6" />
          <PrimaryBtn design={design} onClick={() => onSubmit(true)}>
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

  return (
    <div className="text-center py-8 space-y-5">
      <div
        className="inline-block px-3 py-1 text-xs font-semibold rounded-full"
        style={{ background: design.primary, color: '#fff' }}
      >
        {temperature === 'hot' ? '🔥 Lead quente' : temperature === 'warm' ? '⚡ Lead morno' : '❄️ Lead frio'}
      </div>
      <h2 className="text-3xl sm:text-4xl font-bold">
        {resultBlock?.resultTitle ?? 'Seu resultado está pronto'}
      </h2>
      <p className="text-base max-w-md mx-auto" style={{ color: design.muted }}>
        {resultBlock?.resultBody ?? 'Obrigado por completar o quiz.'}
      </p>
      <div className="text-5xl font-bold pt-4" style={{ color: design.primary }}>
        {pct}%
      </div>
      {resultBlock?.ctaLabel && (
        <PrimaryBtn design={design}>{resultBlock.ctaLabel}</PrimaryBtn>
      )}
    </div>
  );
}
