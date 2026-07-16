import { useEffect, useMemo, useState } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { queryOptions } from '@tanstack/react-query';
import { quizService } from '../services/quizService';
import type { QuizBlock, QuizSchema } from '../types';
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

const playerQuery = (slug: string, preview: boolean) =>
  queryOptions({
    queryKey: ['quiz-public', slug, preview ? 'preview' : 'published'],
    queryFn: () =>
      preview ? quizService.getDraftBySlug(slug) : quizService.getPublishedBySlug(slug),
    staleTime: preview ? 0 : 60_000,
  });

export function QuizPlayer({ slug, preview = false }: { slug: string; preview?: boolean }) {
  const { data } = useSuspenseQuery(playerQuery(slug, preview));

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

  return (
    <>
      {preview && (
        <div className="fixed top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-yellow-500 text-black text-xs font-semibold shadow">
          Preview (rascunho)
        </div>
      )}
      <PlayerRunner quizId={data.quiz.id} companyId={data.quiz.company_id} schema={data.schema} preview={preview} />
    </>
  );
}

function PlayerRunner({
  quizId,
  companyId,
  schema,
  preview = false,
}: {
  quizId: string;
  companyId: string;
  schema: QuizSchema;
  preview?: boolean;
}) {
  const [state, setState] = useState<QuizRunState>(createInitialState);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const design = schema.design;
  const blocks = schema.blocks;
  const block = blocks[state.currentIndex];
  const isLast = state.currentIndex >= blocks.length - 1;

  useEffect(() => {
    if (preview) return;
    quizService.trackEvent({ quizId, companyId, eventType: 'start' }).catch(() => {});
  }, [quizId, companyId, preview]);

  useEffect(() => {
    if (preview) return;
    if (block) {
      quizService
        .trackEvent({ quizId, companyId, submissionId, eventType: 'block_view', blockId: block.id })
        .catch(() => {});
    }
  }, [block?.id, quizId, companyId, submissionId, preview]);

  if (!block) {
    return <EmptyState message="Quiz sem blocos" />;
  }

  const advance = async (response: unknown) => {
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
      const email = extract(finalState.responses, blocks, 'email');
      const phone = extract(finalState.responses, blocks, 'phone');
      const name = extract(finalState.responses, blocks, 'short-text');
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
      className="min-h-screen w-full flex items-center justify-center py-8 px-4"
      style={{ background: design.background, color: design.text }}
    >
      <div className="w-full max-w-2xl">
        <ProgressBar
          value={done ? 1 : (state.currentIndex + 1) / blocks.length}
          design={design}
        />
        <div className="mt-6">
          {done ? (
            <ResultView schema={schema} state={state} />
          ) : (
            <BlockView block={block} design={design} onSubmit={advance} saving={saving} />
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

  const canSubmit = useMemo(() => {
    if (block.type === 'multi-choice') return multi.length > 0 || !block.required;
    if (block.type === 'single-choice') return typeof value === 'string' && value.length > 0;
    if (block.type === 'rating') return typeof value === 'number';
    if (block.type === 'short-text' || block.type === 'long-text' || block.type === 'email' || block.type === 'phone') {
      return !block.required || (typeof value === 'string' && value.trim().length > 0);
    }
    return true;
  }, [block, value, multi]);

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
