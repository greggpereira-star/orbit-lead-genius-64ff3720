import { useMemo } from 'react';
import type { QuizBlock, QuizDesign, QuizSchema } from '../types';
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

export function QuizPreview({ schema, activeBlockId, onSelectBlock, device = 'desktop' }: Props) {
  const { design, blocks } = schema;

  const width = device === 'mobile' ? 380 : device === 'tablet' ? 720 : 960;

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
        className="rounded-2xl overflow-hidden shadow-2xl transition-all"
        style={{ ...cssVars, width, minHeight: 640, background: design.background, color: design.text }}
      >
        <div className="p-6 border-b" style={{ borderColor: design.surface }}>
          <ProgressBar design={design} value={0.15} />
        </div>
        <div className="p-8 space-y-8">
          {blocks.length === 0 ? (
            <div className="text-center py-20 opacity-60">
              <p className="text-sm" style={{ color: design.muted }}>
                Adicione blocos ao seu quiz na barra lateral esquerda →
              </p>
            </div>
          ) : (
            blocks.map((b) => (
              <div
                key={b.id}
                onClick={() => onSelectBlock?.(b.id)}
                className={`cursor-pointer rounded-xl p-4 -m-4 transition-all ${
                  activeBlockId === b.id ? 'ring-2' : 'hover:bg-white/5'
                }`}
                style={{
                  ...(activeBlockId === b.id ? { boxShadow: `0 0 0 2px ${design.primary}` } : {}),
                }}
              >
                <BlockRenderer block={b} design={design} />
              </div>
            ))
          )}
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
  return <button className={base} style={style}>{children}</button>;
}

function BlockRenderer({ block, design }: { block: QuizBlock; design: QuizDesign }) {
  const title = block.title || '(sem título)';
  const sub = block.subtitle;

  const heading = (
    <div className="space-y-2">
      <h2 className="text-2xl font-bold leading-tight" style={{ color: design.text }}>{title}</h2>
      {sub && <p className="text-sm" style={{ color: design.muted }}>{sub}</p>}
    </div>
  );

  const opts = block.options ?? [];

  switch (block.type) {
    case 'intro':
      return (
        <div className="text-center space-y-6 py-8">
          {block.imageUrl && <img src={block.imageUrl} alt="" className="mx-auto max-h-40 rounded-xl" />}
          <h1 className="text-4xl font-bold" style={{ color: design.text }}>{title}</h1>
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
          <div className="inline-block px-3 py-1 text-xs font-semibold rounded-full" style={{ background: design.primary, color: '#fff' }}>
            Resultado
          </div>
          <h2 className="text-3xl font-bold" style={{ color: design.text }}>{block.resultTitle || title}</h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: design.muted }}>{block.resultBody || sub || 'Personalize este resultado no inspetor.'}</p>
          <Btn design={design}>{block.ctaLabel || 'Continuar'}</Btn>
        </div>
      );
    case 'video': {
      const embed = block.mediaUrl ? getVideoEmbed(block.mediaUrl, block.mediaProvider) : null;
      return (
        <div className="space-y-4">
          {(title || sub) && heading}
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
          {(title || sub) && heading}
          {block.mediaUrl && (
            <img src={block.mediaUrl} alt="" className="w-full object-cover" style={{ borderRadius: design.radius }} />
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
              <img src={block.testimonialAvatar} alt="" className="h-10 w-10 rounded-full object-cover" />
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
      return <div className="h-px w-full" style={{ background: design.surface }} />;
    default:
      return heading;
  }
}
