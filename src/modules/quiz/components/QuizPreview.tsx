import { useMemo } from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { GripVertical, Sparkles, Hourglass, CheckCircle2, Bell, Gift, BellRing, X, Eye, PhoneCall, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import type { QuizBlock, QuizDesign, QuizSchema } from '../types';
import { getSteps } from '../lib/steps';
import { RichText } from './RichText';
import { getContrastText, withAlpha } from '../lib/color';
import { getButtonStyle } from '../lib/buttonStyles';
import { parseRichText } from '../lib/richtext';
import { evaluatePercent } from '../lib/variables';
import { resolveBlockStyle } from '../lib/blockStyle';
import { resolveContainerLayout, type Breakpoint } from '../lib/containerLayout';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { CountdownTimer } from './CountdownTimer';

const CONTAINER_ALIGN_CSS: Record<string, React.CSSProperties['alignItems']> = {
  start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch',
};
const CONTAINER_JUSTIFY_CSS: Record<string, React.CSSProperties['justifyContent']> = {
  start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'space-between',
};

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
  // Em telas estreitas a paleta fica escondida atrás de um Sheet; quando fornecido,
  // o estado vazio mostra um botão de "Adicionar bloco" em vez de mandar o usuário
  // "arrastar da paleta" (que não está visível).
  onRequestAddBlock?: () => void;
  /**
   * Etapa mostrada no canvas. O canvas exibe UMA etapa por vez, porque é isso
   * que o visitante vê: uma tela. Empilhar todas com um tracinho entre elas
   * fazia parecer que o quiz era uma página comprida.
   */
  currentStepId?: string | null;
  onChangeStep?: (stepId: string) => void;
}

// Largura fixa do quiz em qualquer dispositivo (mesmo padrão de QuizPlayer.tsx) — o
// conteúdo real sempre renderiza nessa largura, então o preview do Builder simula a
// viewport de cada dispositivo por fora, mas mantém o quiz nessa largura por dentro.
const QUIZ_MAX_WIDTH = 448;

export function QuizPreview({
  schema, activeBlockId, onSelectBlock, device = 'desktop', onRequestAddBlock,
  currentStepId, onChangeStep,
}: Props) {
  const { design, blocks } = schema;
  // keepEmpty: uma etapa recém-criada precisa aparecer no canvas mesmo antes de
  // ganhar o primeiro bloco — senão o usuário cria a tela e não vê nada.
  const steps = useMemo(() => getSteps(schema, { keepEmpty: true }), [schema]);

  const stepIndex = useMemo(() => {
    const i = currentStepId ? steps.findIndex((s) => s.id === currentStepId) : -1;
    return i >= 0 ? i : 0;
  }, [steps, currentStepId]);
  const step = steps[stepIndex] ?? null;
  const stepBlocks = useMemo(
    () => (step ? step.blockIds.map((bid) => blocks.find((b) => b.id === bid)).filter((b): b is QuizBlock => !!b) : []),
    [step, blocks],
  );
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
    <div className="w-full h-full flex flex-col overflow-hidden" style={{ background: '#0a0a0a' }}>
      {/* Navegador de etapas: fica FORA do device-frame de propósito. Dentro
          dele, viraria parte da tela simulada e o usuário acharia que o
          visitante vê esses controles. */}
      {steps.length > 0 && (
        <div className="flex shrink-0 items-center justify-center gap-3 px-6 pt-4 pb-1">
          <button
            type="button"
            onClick={() => onChangeStep?.(steps[stepIndex - 1].id)}
            disabled={stepIndex === 0}
            aria-label="Etapa anterior"
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChangeStep?.(s.id)}
                aria-label={`Ir para ${s.name || `Etapa ${i + 1}`}`}
                aria-current={i === stepIndex ? 'true' : undefined}
                title={s.name || `Etapa ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/25 hover:bg-white/50'
                }`}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChangeStep?.(steps[stepIndex + 1].id)}
            disabled={stepIndex >= steps.length - 1}
            aria-label="Próxima etapa"
            className="rounded-lg p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <span className="ml-1 text-xs tabular-nums text-white/50">
            {step?.name || `Etapa ${stepIndex + 1}`} de {steps.length}
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-auto p-6">
      <div
        // m-auto (não items-center/justify-center no pai) centraliza o device-frame
        // quando ele cabe no painel, mas nunca corta o topo/lado quando ele é maior
        // que a área visível — um contêiner com overflow-auto + align/justify-center
        // no pai empurra o início do conteúdo pra fora da rolagem quando o filho
        // excede o tamanho do pai (bug clássico de centralização + overflow).
        className="m-auto rounded-2xl overflow-hidden shadow-2xl transition-all flex justify-center shrink-0"
        style={{ ...cssVars, width: viewportWidth, minHeight: 640, background: design.background, color: design.text, fontFamily: design.fontBody }}
      >
        <div className="w-full transition-all" style={{ maxWidth: QUIZ_MAX_WIDTH }}>
          <div className="p-6 border-b" style={{ borderColor: design.surface }}>
            {/* A barra de progresso reflete a etapa aberta: é o que o visitante
                veria nesse ponto do quiz, e não um valor decorativo fixo. */}
            <ProgressBar
              design={design}
              value={steps.length ? (stepIndex + 1) / steps.length : 0.15}
            />
          </div>
          {/* Um droppable POR ETAPA (`canvas-step-<id>`): com uma lista só, os
              índices do arraste eram globais e não batiam com a posição dentro
              da etapa — arrastar no canvas simplesmente não fazia nada. */}
          <Droppable droppableId={step ? `canvas-step-${step.id}` : 'canvas'}>
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
                    <p className="text-sm mb-4" style={{ color: design.muted }}>
                      Seu quiz ainda não tem nenhum bloco.
                    </p>
                    {onRequestAddBlock ? (
                      <button
                        onClick={onRequestAddBlock}
                        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold"
                        style={{ background: design.primary, color: getContrastText(design.primary) }}
                      >
                        + Adicionar bloco
                      </button>
                    ) : (
                      <p className="text-xs" style={{ color: design.muted }}>
                        Arraste um componente da paleta à esquerda, ou clique nele para adicionar.
                      </p>
                    )}
                  </div>
                ) : stepBlocks.length === 0 ? (
                  <div
                    className={`text-center py-20 rounded-xl border-2 border-dashed transition-colors ${
                      dropSnapshot.isDraggingOver ? 'border-primary/50 opacity-100' : 'opacity-60 border-transparent'
                    }`}
                  >
                    <p className="text-sm" style={{ color: design.muted }}>
                      {step?.name || `Etapa ${stepIndex + 1}`} está vazia.
                    </p>
                    <p className="mt-1 text-xs" style={{ color: design.muted }}>
                      Escolha um bloco na paleta — ele entra nesta etapa.
                    </p>
                  </div>
                ) : (
                    <div className="flex flex-col">
                        {stepBlocks.map((b, i) => {
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
                                  {b.showIf?.enabled && (
                                    <div
                                      className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded-full border border-amber-500/50 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-500"
                                      title="Este bloco só aparece quando a condição configurada for verdadeira"
                                    >
                                      <Eye className="h-2.5 w-2.5" /> condicional
                                    </div>
                                  )}
                                  {/* Estilo do bloco (abas Layout/Aparência) num
                                      embrulho: sem ele cada bloco teria que
                                      aplicar margem e cor por conta própria, e
                                      37 tipos divergiriam em uma semana. */}
                                  <div style={resolveBlockStyle(b)}>
                                    <BlockRenderer block={b} design={design} allBlocks={blocks} device={device} />
                                  </div>
                                </div>
                              )}
                            </Draggable>
                          );
                        })}
                    </div>
                )}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </div>
      </div>
    </div>
  );
}

export function ProgressBar({ design, value }: { design: QuizDesign; value: number }) {
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
  const { style, className } = getButtonStyle(design);
  return <button className={`px-6 py-3 font-semibold transition-all text-sm${className ? ` ${className}` : ''}`} style={style}>{children}</button>;
}

export function BlockRenderer({
  block,
  design,
  allBlocks,
  device = 'desktop',
}: {
  block: QuizBlock;
  design: QuizDesign;
  allBlocks?: QuizBlock[];
  device?: Breakpoint;
}) {
  const title = block.title || '(sem título)';
  const sub = block.subtitle;

  // Mesmo <RichText> do player — o canvas não pode ter renderizador próprio,
  // senão formatar aqui e ver outra coisa lá vira questão de tempo.
  const heading = (
    <div className="space-y-2">
      <RichText
        doc={block.titleRich}
        fallback={title}
        className="quiz-rich text-2xl font-bold leading-tight"
        style={{ color: design.text, fontFamily: design.fontHeading }}
      />
      {(block.subtitleRich || sub) && (
        <RichText
          doc={block.subtitleRich}
          fallback={sub}
          className="quiz-rich text-sm"
          style={{ color: design.muted }}
        />
      )}
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
          <RichText
            doc={block.titleRich}
            fallback={title}
            className="quiz-rich text-[1.75rem] leading-[1.15] tracking-[-0.02em] font-bold text-balance sm:text-4xl sm:leading-[1.1] max-w-[18ch] mx-auto"
            style={{ color: design.text, fontFamily: design.fontHeading }}
          />
          {(block.subtitleRich || sub) && (
            <RichText
              doc={block.subtitleRich}
              fallback={sub}
              className="quiz-rich text-base max-w-md mx-auto"
              style={{ color: design.muted }}
            />
          )}
          <Btn design={design}>{block.ctaLabel || 'Começar'}</Btn>
        </div>
      );
    case 'single-choice':
    case 'multi-choice':
      return (
        <div className="space-y-5">
          {heading}
          <div className="space-y-2">
            {opts.map((o) => {
              // Espelha o OptionCard do player: contorno fino, indicador de
              // forma (círculo = uma, quadrado = várias) e realce ao marcar.
              const marcado = !!o.preselected;
              const varias = block.type === 'multi-choice';
              return (
                <button
                  key={o.id}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 border transition-all hover:-translate-y-px"
                  style={{
                    borderRadius: design.radius,
                    borderColor: marcado ? design.primary : withAlpha(design.text, 0.12),
                    borderWidth: marcado ? 2 : 1,
                    color: design.text,
                    background: marcado ? withAlpha(design.primary, 0.06) : design.surface,
                    boxShadow: marcado ? `0 0 0 1px ${withAlpha(design.primary, 0.25)}` : '0 1px 2px rgb(0 0 0 / 0.04)',
                  }}
                >
                  <span
                    aria-hidden
                    className="shrink-0 grid place-items-center"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: varias ? 6 : 999,
                      border: `2px solid ${marcado ? design.primary : withAlpha(design.text, 0.25)}`,
                      background: marcado ? design.primary : 'transparent',
                    }}
                  >
                    {marcado &&
                      (varias ? (
                        <Check className="h-3 w-3" strokeWidth={3} style={{ color: getContrastText(design.primary) }} />
                      ) : (
                        <span className="block" style={{ width: 7, height: 7, borderRadius: 999, background: getContrastText(design.primary) }} />
                      ))}
                  </span>
                  {o.imageUrl ? (
                    <img src={o.imageUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                  ) : o.emoji ? (
                    <span className="shrink-0">{o.emoji}</span>
                  ) : null}
                  <span className="min-w-0 flex-1">{parseRichText(o.label)}</span>
                </button>
              );
            })}
            {opts.length === 0 && <p className="text-xs opacity-60" style={{ color: design.muted }}>Nenhuma opção — adicione no inspetor.</p>}
          </div>
          {/* Espelha o player: sem autoavançar, a escolha só segue pelo botão. */}
          {block.autoAdvance === false && (
            <div className="mt-5">
              <Btn design={design}>{block.ctaLabel || 'Continuar'}</Btn>
            </div>
          )}
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
              border: `1px solid ${withAlpha(design.text, 0.14)}`,
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
          {(block.titleRich || title) && (<RichText doc={block.titleRich} fallback={title} className="quiz-rich text-lg font-semibold" style={{ color: design.text }} />)}
          <CountdownTimer endsAt={block.countdownEndsAt} minutes={block.countdownMinutes ?? 15} color={design.primary} />
        </div>
      );
    case 'divider':
      return (
        <div className="py-6">
          <div className="h-px w-full" style={{ background: design.surface }} />
        </div>
      );

    case 'spacer':
      return <div style={{ height: block.spacerHeight ?? 32 }} />;

    case 'container': {
      const children = (block.childBlockIds ?? [])
        .map((id) => (allBlocks ?? []).find((b) => b.id === id))
        .filter((b): b is QuizBlock => !!b);
      const layout = resolveContainerLayout(block, device);
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
      return (
        <div style={layoutStyle}>
          {children.length === 0 ? (
            <div className="w-full rounded-lg border border-dashed py-6 text-center text-xs" style={{ borderColor: design.muted, color: design.muted }}>
              Container vazio
            </div>
          ) : (
            children.map((child) => (
              <div
                key={child.id}
                className={`h-full overflow-hidden flex flex-col justify-center ${isGrid ? '' : 'flex-1 min-w-[120px]'}`}
                style={{ background: design.surface, borderRadius: design.radius, padding: 16 }}
              >
                <BlockRenderer block={child} design={design} allBlocks={allBlocks} device={device} />
              </div>
            ))
          )}
        </div>
      );
    }

    case 'argument':
      // Espelha o player: aviso discreto, não uma segunda pergunta.
      return (
        <div
          className="flex gap-3.5 items-start px-4 py-4"
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
            <RichText
              doc={block.titleRich}
              fallback={title}
              className="quiz-rich text-base font-semibold leading-snug"
              style={{ color: design.text, fontFamily: design.fontHeading }}
            />
            {(block.subtitleRich || sub) && (
              <RichText doc={block.subtitleRich} fallback={sub} className="quiz-rich text-sm" style={{ color: design.muted }} />
            )}
          </div>
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
      /* No canvas não há respostas ainda, então a fórmula é avaliada com escopo
         vazio: dá pra ver se ela é válida, e o número real só aparece quando o
         visitante responde. Fórmula inválida cai no valor do slider. */
      const pct = evaluatePercent(block.meterFormula, {}) ?? block.progressValue ?? 50;
      const captions = (block.meterCaptions ?? []).filter((c) => c.trim());
      return (
        <div className="space-y-4">
          {heading}
          <div>
            <div className="flex items-center justify-between text-sm font-semibold" style={{ color: design.text }}>
              <span>{block.levelLabel ?? ''}</span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="mt-2 h-3 rounded-full overflow-hidden" style={{ background: design.surface }}>
              <div className="h-full transition-all" style={{ width: `${pct}%`, background: design.primary }} />
            </div>
            {captions.length > 0 && (
              <div
                className="mt-2 grid gap-1 text-[10px]"
                style={{ gridTemplateColumns: `repeat(${captions.length}, minmax(0, 1fr))`, color: design.muted }}
              >
                {captions.map((c, i) => (
                  <span
                    key={i}
                    className="truncate"
                    style={{ textAlign: i === 0 ? 'left' : i === captions.length - 1 ? 'right' : 'center' }}
                    title={c}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
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
    case 'height': {
      // Mockup estático da régua (a versão interativa de arrastar vive só no Player
      // real — aqui, dentro do canvas com drag-and-drop de blocos, evita disputar o
      // gesto de arraste com a biblioteca de reordenação).
      const isWeight = block.type === 'weight';
      const sliderMin = block.sliderMin ?? (isWeight ? 30 : 100);
      const sliderMax = block.sliderMax ?? (isWeight ? 200 : 250);
      const sliderVal = block.sliderDefaultValue ?? (isWeight ? 70 : 170);
      const unit = isWeight ? 'kg' : 'cm';
      return (
        <div className="space-y-3">
          {heading}
          <div className="text-center">
            <span className="text-4xl font-bold" style={{ color: design.text, fontFamily: design.fontHeading }}>{sliderVal}</span>
            <span className="text-base ml-1 opacity-60" style={{ color: design.muted }}>{unit}</span>
          </div>
          <div className="h-12 rounded-xl flex items-center justify-between px-4 text-xs" style={{ background: design.surface, color: design.muted }}>
            <span>{sliderMin}</span>
            <div className="flex-1 mx-3 h-1 rounded-full" style={{ background: design.primary + '33' }} />
            <span>{sliderMax}</span>
          </div>
        </div>
      );
    }

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

    case 'audio-call':
      return (
        <div className="space-y-4 text-center py-2">
          <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
            <span className="absolute inset-0 rounded-full" style={{ background: `${design.primary}22` }} />
            {block.imageUrl ? (
              <img src={block.imageUrl} alt={title} className="relative h-14 w-14 rounded-full object-cover" />
            ) : (
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full" style={{ background: design.primary }}>
                <PhoneCall className="h-6 w-6" style={{ color: getContrastText(design.primary) }} />
              </div>
            )}
          </div>
          <div>
            <div className="text-base font-bold" style={{ color: design.text, fontFamily: design.fontHeading }}>{title}</div>
            <div className="text-xs" style={{ color: design.muted }}>{sub || 'Chamada de voz'} · {block.audioCallDuration ?? '00:00'}</div>
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
      style={{ borderRadius: design.radius, background: design.surface, color: design.muted, border: `1px solid ${withAlpha(design.text, 0.14)}` }}
    >
      {label}
      {suffix && <span className="text-xs">{suffix}</span>}
    </div>
  );
}
