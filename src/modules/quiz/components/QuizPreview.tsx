import { useMemo } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Sparkles, Hourglass, CheckCircle2, Bell, Gift, BellRing, X } from 'lucide-react';
import type { QuizBlock, QuizDesign, QuizSchema } from '../types';
import { getSteps } from '../lib/steps';
import { getContrastText } from '../lib/color';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { CountdownTimer } from './CountdownTimer';

function getVideoEmbed(url: string, provider?: string): { kind: 'iframe' | 'mp4'; src: string } | null {
  if (!url) return null;
  if (provider === 'mp4' || /\.mp4($|\?)/i.test(url)) return { kind: 'mp4', src: url };
  const yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  if (yt) return { kind: 'iframe', src: `https://www.youtube.com/embed/${yt[1]}` };
  const vim = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vim) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vim[1]}` };
  return { kind: 'iframe', src: url };
}

interface Props {
  schema: QuizSchema;
  activeBlockId?: string | null;
  onSelectBlock?: (id: string) => void;
  device?: 'mobile' | 'tablet' | 'desktop';
}

// Largura fixa do quiz em qualquer dispositivo (mesmo padrão de QuizPlayer.tsx) — o
// conteúdo real sempre renderiza nessa largura, então o preview do Builder simula a
// viewport de cada dispositivo por fora, mas mantém o quiz nessa largura por dentro.
const QUIZ_MAX_WIDTH = 448;

export function QuizPreview({ schema, activeBlockId, onSelectBlock, device = 'desktop' }: Props) {
  const { design, blocks } = schema;
  const steps = useMemo(() => getSteps(schema), [schema]);
  // hover:bg-white/5 fica invisível em fundos claros (Clean Beauty, Mono, Minimal Light,
  // Candy) — escolhe a tinta de hover pelo mesmo teste de luminância do contraste de botão.
  const hoverTintClass = getContrastText(design.background) === '#1a1a1a' ? 'hover:bg-black/5' : 'hover:bg-white/5';

  const viewportWidth = device === 'mobile' ? 390 : device === 'tablet' ? 820 : 1280;

  const cssVars = useMemo(
    () =>
      ({
        '--q-primary': design.primary,
        '--q-bg': design.background,
        '--q-surface': design.surface,
        '--q-text': design.text,
        '--q-muted': design.muted,
        '--q-radius': `${design.radius}px`,
      }) as React.CSSProperties,
    [design]
  );

  return (
    <div className="w-full h-full flex items-center justify-center overflow-auto p-6" style={{ background: '#0a0a0a' }}>
      <div
        className="rounded-2xl overflow-hidden shadow-2xl transition-all flex justify-center"
        style={{ ...cssVars, width: viewportWidth, minHeight: 640, background: design.background, color: design.text, fontFamily: design.fontBody }}
      >
        <div className="w-full transition-all" style={{ maxWidth: QUIZ_MAX_WIDTH }}>
          <div className="p-6 border-b" style={{ borderColor: design.surface }}>
            <ProgressBar design={design} value={0.15} />
          </div>
          <Droppable droppableId="canvas">
            {(dropProvided, dropSnapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`p-8 min-h-[200px] transition-colors ${dropSnapshot.isDraggingOver ? 'bg-primary/5' : ''}`}
              >
                {blocks.length === 0 ? (
                  <div
                    className={`text-center py-20 rounded-xl border-2 border-dashed transition-colors ${
                      dropSnapshot.isDraggingOver ? 'border-primary/50 opacity-100' : 'opacity-60 border-transparent'
                    }`}
                  >
                    <p className="text-sm" style={{ color: design.muted }}>
                      Arraste um componente da paleta até aqui, ou clique nele para adicionar →
                    </p>
                  </div>
                ) : (
                  steps.map((step, stepIdx) => (
                    <div key={step.id} className={stepIdx > 0 ? 'mt-8 pt-8 border-t border-dashed' : ''} style={{ borderColor: design.surface }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wide mb-4 opacity-50" style={{ color: design.muted }}>
                        Etapa {stepIdx + 1}
                      </div>
                      <div className="flex flex-col">
                        {step.blockIds.map((blockId) => {
                          const b = blocks.find((x) => x.id === blockId);
                          if (!b) return null;
                          const i = blocks.findIndex((x) => x.id === blockId);
                          return (
                            <Draggable key={b.id} draggableId={b.id} index={i}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  onClick={() => onSelectBlock?.(b.id)}
                                  className={`group relative cursor-pointer rounded-xl p-3 transition-all ${
                                    activeBlockId === b.id ? '' : hoverTintClass
                                  } ${dragSnapshot.isDragging ? 'shadow-2xl bg-[var(--q-bg)]' : ''}`}
                                  style={{
                                    ...dragProvided.draggableProps.style,
                                    ...(activeBlockId === b.id ? { boxShadow: `0 0 0 2px ${design.primary}` } : {}),
                                  }}
                                >
                                  <div
                                    {...dragProvided.dragHandleProps}
                                    className="absolute left-1 top-1 z-10 opacity-40 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing p-1.5 rounded-md select-none"
                                    style={{ background: design.surface }}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GripVertical className="h-4 w-4" style={{ color: design.muted }} />
                                  </div>
                                  <BlockRenderer block={b} design={design} />
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ design, value }: { design: QuizDesign; value: number }) {
  if (design.progressStyle === 'none') return null;
  if (design.progressStyle === 'dots') {
    return (
      <div className="flex gap-2 justify-center">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: i / 5 < value ? design.primary : design.surface }}
          />
        ))}
      </div>
    );
  }
  if (design.progressStyle === 'steps') {
    return (
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i / 5 < value ? design.primary : design.surface }}
          />
        ))}
      </div>
    );
  }
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: design.surface }}>
      <div
        className="h-full transition-all"
        style={{ width: `${value * 100}%`, background: design.primary }}
      />
    </div>
  );
}

function Btn({ design, children }: { design: QuizDesign; children: React.ReactNode }) {
  const base = 'px-6 py-3 font-semibold transition-all text-sm';
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
  return <button className={base} style={style}>{children}</button>;
}

function BlockRenderer({ block, design }: { block: QuizBlock; design: QuizDesign }) {
  const title = block.title || '(sem título)';
  const sub = block.subtitle;

  const heading = (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold leading-tight" style={{ color: design.text, fontFamily: design.fontHeading }}>{title}</h2>
      {sub && <p className="text-sm" style={{ color: design.muted }}>{sub}</p>}
    </div>
  );

  const opts = block.options ?? [];

  switch (block.type) {
    case 'intro':
      return (
        <div className="text-center space-y-6 py-8">
          {block.imageUrl && (
            <img
              src={block.imageUrl}
              alt={block.title || 'Imagem de destaque'}
              className="mx-auto w-full max-h-72 object-cover rounded-xl"
            />
          )}
          <h1 className="text-4xl font-bold" style={{ color: design.text, fontFamily: design.fontHeading }}>{title}</h1>
          {sub && <p className="text-base max-w-md mx-auto" style={{ color: design.muted }}>{sub}</p>}
          <Btn design={design}>{block.ctaLabel || 'Começar'}</Btn>
        </div>
      );
    case 'single-choice':
    case 'multi-choice':
      return (
        <div className="space-y-5">
          {heading}
          <div className="space-y-2">
            {opts.map((o) => (
              <button
                key={o.id}
                className="w-full text-left px-4 py-3 border-2 transition-all hover:scale-[1.01]"
                style={{ borderRadius: design.radius, borderColor: design.surface, color: design.text, background: design.surface }}
              >
                {o.emoji && <span className="mr-2">{o.emoji}</span>}
                {o.label}
              </button>
            ))}
            {opts.length === 0 && <p className="text-xs opacity-60" style={{ color: design.muted }}>Nenhuma opção — adicione no inspetor.</p>}
          </div>
        </div>
      );
    case 'short-text':
    case 'email':
    case 'phone':
      return (
        <div className="space-y-5">
          {heading}
          <input
            placeholder={block.placeholder || 'Digite sua resposta...'}
            className="w-full px-4 py-3 outline-none"
            style={{
              borderRadius: design.radius,
              background: design.surface,
              color: design.text,
              border: `1px solid ${design.surface}`,
            }}
          />
          <Btn design={design}>{block.ctaLabel || 'Continuar'}</Btn>
        </div>
      );
    case 'long-text':
      return (
        <div className="space-y-5">
          {heading}
          <textarea
            rows={4}
            placeholder={block.placeholder || 'Digite sua resposta...'}
            className="w-full px-4 py-3 outline-none resize-none"
            style={{ borderRadius: design.radius, background: design.surface, color: design.text }}
          />
          <Btn design={design}>{block.ctaLabel || 'Continuar'}</Btn>
        </div>
      );
    case 'rating': {
      const max = block.maxRating ?? 5;
      return (
        <div className="space-y-5">
          {heading}
          <div className="flex gap-2 justify-center">
            {Array.from({ length: max }).map((_, i) => (
              <div
                key={i}
                className="h-12 w-12 flex items-center justify-center text-xl font-bold"
                style={{ borderRadius: design.radius, background: design.surface, color: design.text }}
              >
                {i + 1}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'cta':
      return (
        <div className="text-center space-y-4 py-6">
          {heading}
          <Btn design={design}>{block.ctaLabel || 'Quero saber mais'}</Btn>
        </div>
      );
    case 'result':
      return (
        <div className="space-y-4 text-center py-6">
          <div
            className="inline-block px-3 py-1 text-xs font-semibold rounded-full"
            style={{ background: design.primary, color: getContrastText(design.primary) }}
          >
            ✨ Resultado pronto
          </div>
          <h2 className="text-3xl font-bold" style={{ color: design.text, fontFamily: design.fontHeading }}>{block.resultTitle || title}</h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: design.muted }}>{block.resultBody || sub || 'Personalize este resultado no inspetor.'}</p>
          <Btn design={design}>{block.ctaLabel || 'Continuar'}</Btn>
        </div>
      );
    case 'video': {
      const embed = block.mediaUrl ? getVideoEmbed(block.mediaUrl, block.mediaProvider) : null;
      return (
        <div className="space-y-4">
          {(block.title || sub) && heading}
          <div className="relative w-full aspect-video overflow-hidden bg-black" style={{ borderRadius: design.radius }}>
            {embed?.kind === 'iframe' ? (
              <iframe src={embed.src} className="w-full h-full" allowFullScreen title="video" />
            ) : embed?.kind === 'mp4' ? (
              <video src={embed.src} controls poster={block.posterUrl} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-xs opacity-60" style={{ color: design.muted }}>
                Cole a URL do vídeo no inspetor
              </div>
            )}
          </div>
        </div>
      );
    }
    case 'audio':
      return (
        <div className="space-y-4">
          {heading}
          {block.mediaUrl ? (
            <audio src={block.mediaUrl} controls className="w-full" />
          ) : (
            <div className="text-xs opacity-60" style={{ color: design.muted }}>Cole a URL do áudio no inspetor</div>
          )}
        </div>
      );
    case 'image':
      return (
        <div className="space-y-3">
          {(block.title || sub) && heading}
          {block.mediaUrl && (
            <img src={block.mediaUrl} alt={block.title || 'Imagem'} className="w-full object-cover" style={{ borderRadius: design.radius }} />
          )}
        </div>
      );
    case 'before-after':
      return (
        <div className="space-y-4">
          {heading}
          <BeforeAfterSlider beforeUrl={block.beforeUrl ?? ''} afterUrl={block.afterUrl ?? ''} radius={design.radius} />
        </div>
      );
    case 'testimonial':
      return (
        <div className="p-6 space-y-4" style={{ background: design.surface, borderRadius: design.radius }}>
          <p className="text-lg italic leading-relaxed" style={{ color: design.text }}>{title}</p>
          <div className="flex items-center gap-3">
            {block.testimonialAvatar && (
              <img src={block.testimonialAvatar} alt={block.testimonialAuthor || 'Depoimento'} className="h-10 w-10 rounded-full object-cover" />
            )}
            <div>
              <div className="text-sm font-semibold" style={{ color: design.text }}>{block.testimonialAuthor}</div>
              {block.testimonialRole && (
                <div className="text-xs" style={{ color: design.muted }}>{block.testimonialRole}</div>
              )}
            </div>
          </div>
        </div>
      );
    case 'countdown':
      return (
        <div className="space-y-3 text-center">
          {title && <h2 className="text-lg font-semibold" style={{ color: design.text }}>{title}</h2>}
          <CountdownTimer endsAt={block.countdownEndsAt} minutes={block.countdownMinutes ?? 15} color={design.primary} />
        </div>
      );
    case 'divider':
      return (
        <div className="py-6">
          <div className="h-px w-full" style={{ background: design.surface }} />
        </div>
      );

    case 'argument':
      return (
        <div className="flex gap-4 items-start">
          <div
            className="h-11 w-11 shrink-0 rounded-full flex items-center justify-center"
            style={{ background: design.primary + '22' }}
          >
            <Sparkles className="h-5 w-5" style={{ color: design.primary }} />
          </div>
          {heading}
        </div>
      );

    case 'argument-progress': {
      const pct = block.progressValue ?? 50;
      return (
        <div className="space-y-4">
          {heading}
          <div className="h-2 rounded-full overflow-hidden" style={{ background: design.surface }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
        </div>
      );
    }

    case 'level': {
      const pct = block.progressValue ?? 50;
      return (
        <div className="space-y-4">
          {heading}
          <div className="flex items-center justify-between text-sm font-semibold" style={{ color: design.text }}>
            <span>{block.levelLabel ?? ''}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-3 rounded-full overflow-hidden" style={{ background: design.surface }}>
            <div className="h-full transition-all" style={{ width: `${pct}%`, background: design.primary }} />
          </div>
        </div>
      );
    }

    case 'loading':
      return (
        <div className="space-y-4 text-center py-6">
          <Hourglass className="h-8 w-8 mx-auto animate-pulse" style={{ color: design.primary }} />
          {heading}
          <div className="space-y-2 text-left max-w-xs mx-auto">
            {(block.loadingSteps ?? []).map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-sm" style={{ color: design.muted }}>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: design.primary }} />
                {step}
              </div>
            ))}
          </div>
        </div>
      );

    case 'notification':
      return (
        <div className="flex gap-3 items-start p-4 rounded-xl" style={{ background: design.surface }}>
          <div
            className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center"
            style={{ background: design.primary + '22' }}
          >
            <Bell className="h-4 w-4" style={{ color: design.primary }} />
          </div>
          {heading}
        </div>
      );

    case 'faq':
      return (
        <div className="space-y-4">
          {heading}
          <div className="space-y-2">
            {(block.faqItems ?? []).map((item) => (
              <div key={item.id} className="p-3 rounded-lg" style={{ background: design.surface }}>
                <div className="text-sm font-semibold" style={{ color: design.text }}>{item.question}</div>
                <div className="text-xs mt-1" style={{ color: design.muted }}>{item.answer}</div>
              </div>
            ))}
          </div>
        </div>
      );

    case 'form': {
      const ff = block.formFields ?? { name: true, email: true, phone: true };
      return (
        <div className="space-y-3">
          {heading}
          {ff.name && <FormFieldPreview design={design} label="Nome" />}
          {ff.email && <FormFieldPreview design={design} label="E-mail" />}
          {ff.phone && <FormFieldPreview design={design} label="Telefone" />}
          <Btn design={design}>{block.ctaLabel || 'Enviar'}</Btn>
        </div>
      );
    }

    case 'weight':
      return (
        <div className="space-y-3">
          {heading}
          <FormFieldPreview design={design} label={block.placeholder || 'Ex: 70'} suffix="kg" />
        </div>
      );

    case 'height':
      return (
        <div className="space-y-3">
          {heading}
          <FormFieldPreview design={design} label={block.placeholder || 'Ex: 170'} suffix="cm" />
        </div>
      );

    case 'pricing':
      return (
        <div className="p-6 rounded-xl space-y-4 text-center" style={{ background: design.surface }}>
          <div className="text-sm font-semibold" style={{ color: design.text, fontFamily: design.fontHeading }}>{title}</div>
          <div className="flex items-end justify-center gap-1.5">
            <span className="text-3xl font-bold" style={{ color: design.primary, fontFamily: design.fontHeading }}>{block.pricingPrice ?? 'R$ 0'}</span>
            <span className="text-sm" style={{ color: design.muted }}>{block.pricingPeriod}</span>
          </div>
          {block.pricingOriginalPrice && (
            <div className="text-xs line-through" style={{ color: design.muted }}>{block.pricingOriginalPrice}</div>
          )}
          <div className="space-y-1.5 text-left max-w-xs mx-auto">
            {(block.pricingFeatures ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-xs" style={{ color: design.text }}>
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: design.primary }} />
                {f}
              </div>
            ))}
          </div>
          <Btn design={design}>{block.ctaLabel || 'Quero essa oferta'}</Btn>
        </div>
      );

    case 'reveal':
      return (
        <div className="text-center space-y-4 py-4">
          {heading}
          <div
            className="border-2 border-dashed rounded-xl p-8"
            style={{ borderColor: design.primary, color: design.muted }}
          >
            <Gift className="h-6 w-6 mx-auto mb-2" style={{ color: design.primary }} />
            {block.revealLabel || 'Revelar prêmio'}
          </div>
        </div>
      );

    case 'ios-notification':
      return (
        <div className="p-3 rounded-2xl flex gap-3 items-start shadow-lg" style={{ background: design.surface }}>
          <div
            className="h-9 w-9 rounded-xl shrink-0 flex items-center justify-center"
            style={{ background: design.primary }}
          >
            <BellRing className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold" style={{ color: design.muted }}>{block.notificationApp ?? 'App'}</span>
              <span className="text-[10px]" style={{ color: design.muted }}>{block.notificationTime ?? 'agora'}</span>
            </div>
            <div className="text-sm font-semibold" style={{ color: design.text }}>{title}</div>
            {sub && <div className="text-xs" style={{ color: design.muted }}>{sub}</div>}
          </div>
        </div>
      );

    case 'carousel':
      return (
        <div className="space-y-3">
          {heading}
          <div className="flex gap-2 overflow-x-auto">
            {(block.carouselImages ?? []).map((url, i) => (
              <img
                key={i}
                src={url}
                alt={block.title ? `${block.title} — imagem ${i + 1}` : `Imagem ${i + 1}`}
                className="h-32 w-44 shrink-0 object-cover"
                style={{ borderRadius: design.radius }}
              />
            ))}
          </div>
        </div>
      );

    case 'comparison':
      return (
        <div className="space-y-4">
          {heading}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-lg space-y-1.5" style={{ background: design.surface }}>
              <div className="text-xs font-semibold mb-1" style={{ color: design.muted }}>{block.comparisonLeftLabel}</div>
              {(block.comparisonLeftItems ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: design.text }}>
                  <X className="h-3 w-3 shrink-0 text-red-400" /> {item}
                </div>
              ))}
            </div>
            <div className="p-3 rounded-lg space-y-1.5" style={{ background: design.primary + '15' }}>
              <div className="text-xs font-semibold mb-1" style={{ color: design.primary }}>{block.comparisonRightLabel}</div>
              {(block.comparisonRightItems ?? []).map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs" style={{ color: design.text }}>
                  <CheckCircle2 className="h-3 w-3 shrink-0" style={{ color: design.primary }} /> {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      );

    case 'chart': {
      const points = block.chartData ?? [];
      const max = Math.max(1, ...points.map((p) => p.value));
      return (
        <div className="space-y-4">
          {heading}
          <div className="flex items-end gap-4 h-32">
            {points.map((p) => (
              <div key={p.id} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full">
                <span className="text-xs font-semibold" style={{ color: design.text }}>{p.value}</span>
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{ height: `${(p.value / max) * 100}%`, background: design.primary }}
                />
                <span className="text-[10px]" style={{ color: design.muted }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'custom':
      return <div dangerouslySetInnerHTML={{ __html: block.customHtml ?? '' }} />;

    default:
      return heading;
  }
}

function FormFieldPreview({ design, label, suffix }: { design: QuizDesign; label: string; suffix?: string }) {
  return (
    <div
      className="w-full px-4 py-3 flex items-center justify-between text-sm"
      style={{ borderRadius: design.radius, background: design.surface, color: design.muted, border: `1px solid ${design.surface}` }}
    >
      {label}
      {suffix && <span className="text-xs">{suffix}</span>}
    </div>
  );
}
