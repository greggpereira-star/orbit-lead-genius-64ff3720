import { useState } from 'react';
import type { QuizBlock, QuizDesign, BlockVariant, BlockOption, FaqItem, ChartPoint, BlockShowIf, ShowIfOp } from '../types';
import { getSteps } from '../lib/steps';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus, FlaskConical, LayoutGrid, Image as ImageIcon, ListChecks, Eye, CornerDownRight, ChevronDown, ChevronRight } from 'lucide-react';
import { DESIGN_PRESETS } from '../design-presets';
import { BLOCK_LIBRARY } from '../blocks-library';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { MediaUploader } from './MediaUploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Palette, SlidersHorizontal } from 'lucide-react';
import { BUTTON_STYLE_OPTIONS, getButtonStyle } from '../lib/buttonStyles';

interface Props {
  quizId: string;
  block: QuizBlock | null;
  blocks?: QuizBlock[];
  design: QuizDesign;
  onChangeBlock: (patch: Partial<QuizBlock>) => void;
  onDeleteBlock: () => void;
  onChangeDesign: (patch: Partial<QuizDesign>) => void;
  className?: string;
}

export function QuizInspector({ quizId, block, blocks, design, onChangeBlock, onDeleteBlock, onChangeDesign, className }: Props) {
  return (
    <div className={className ?? 'w-80 border-l bg-card overflow-y-auto'}>
      {block ? (
        <BlockInspector quizId={quizId} block={block} allBlocks={blocks ?? []} onChange={onChangeBlock} onDelete={onDeleteBlock} />
      ) : (
        <DesignInspector design={design} onChange={onChangeDesign} />
      )}
    </div>
  );
}

function BlockInspector({
  quizId,
  block,
  allBlocks,
  onChange,
  onDelete,
}: {
  quizId: string;
  block: QuizBlock;
  allBlocks: QuizBlock[];
  onChange: (p: Partial<QuizBlock>) => void;
  onDelete: () => void;
}) {
  const hasOptions = block.type === 'single-choice' || block.type === 'multi-choice';
  const hasMedia = ['intro', 'image', 'audio', 'video', 'before-after', 'testimonial', 'carousel'].includes(block.type);
  const def = BLOCK_LIBRARY.find((d) => d.type === block.type);

  const ctaEligible = [
    'intro', 'cta', 'result', 'short-text', 'long-text', 'email', 'phone',
    'argument', 'argument-progress', 'level', 'notification', 'faq', 'form',
    'weight', 'height', 'pricing', 'reveal', 'ios-notification', 'carousel',
    'comparison', 'chart',
  ].includes(block.type);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          {def ? <def.icon className="h-4 w-4 text-primary" /> : <LayoutGrid className="h-4 w-4 text-primary" />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm truncate">{def?.label ?? 'Bloco'}</h3>
          <p className="text-xs text-muted-foreground truncate">{def?.description ?? block.type}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          aria-label="Excluir bloco"
          className="shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <Section title="Conteúdo" icon={LayoutGrid} first>
        {block.type === 'result' ? (
          <>
            <Field label="Título do resultado">
              <Input value={block.resultTitle ?? ''} onChange={(e) => onChange({ resultTitle: e.target.value })} />
            </Field>
            <Field label="Descrição do resultado">
              <Textarea rows={4} value={block.resultBody ?? ''} onChange={(e) => onChange({ resultBody: e.target.value })} />
            </Field>
          </>
        ) : block.type === 'custom' ? null : (
          <>
            <Field label="Título">
              <Input value={block.title ?? ''} onChange={(e) => onChange({ title: e.target.value })} />
            </Field>
            <Field label="Subtítulo">
              <Textarea rows={2} value={block.subtitle ?? ''} onChange={(e) => onChange({ subtitle: e.target.value })} />
            </Field>
          </>
        )}

        {(block.type === 'short-text' || block.type === 'long-text' || block.type === 'email' || block.type === 'phone') && (
          <Field label="Placeholder">
            <Input value={block.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} />
          </Field>
        )}

        {(block.type === 'weight' || block.type === 'height') && (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Mínimo">
                <Input
                  type="number"
                  value={block.sliderMin ?? (block.type === 'weight' ? 30 : 100)}
                  onChange={(e) => onChange({ sliderMin: Number(e.target.value) })}
                />
              </Field>
              <Field label="Máximo">
                <Input
                  type="number"
                  value={block.sliderMax ?? (block.type === 'weight' ? 200 : 250)}
                  onChange={(e) => onChange({ sliderMax: Number(e.target.value) })}
                />
              </Field>
              <Field label="Passo">
                <Input
                  type="number"
                  min={1}
                  value={block.sliderStep ?? 1}
                  onChange={(e) => onChange({ sliderStep: Math.max(1, Number(e.target.value)) })}
                />
              </Field>
            </div>
            <Field label="Valor inicial">
              <Input
                type="number"
                value={block.sliderDefaultValue ?? (block.type === 'weight' ? 70 : 170)}
                onChange={(e) => onChange({ sliderDefaultValue: Number(e.target.value) })}
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium">Permitir troca de unidade</p>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {block.type === 'weight' ? 'Mostra o alternador kg / lb' : 'Mostra o alternador cm / pol'}
                </p>
              </div>
              <Switch
                checked={block.allowUnitToggle !== false}
                onCheckedChange={(v) => onChange({ allowUnitToggle: v })}
              />
            </div>
          </>
        )}

        {ANSWERABLE_TYPES.has(block.type) && (
          <Field label="Variável de saída (opcional)">
            <Input
              value={block.outputVariable ?? ''}
              onChange={(e) => onChange({ outputVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })}
              placeholder="ex.: peso"
            />
            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
              {block.outputVariable
                ? <>Use <code className="rounded bg-muted px-1 py-0.5">{`{{${block.outputVariable}}}`}</code> em qualquer texto do quiz, ou <code className="rounded bg-muted px-1 py-0.5">{`{{calc(${block.outputVariable}...)}}`}</code> numa fórmula.</>
                : 'Dá um nome à resposta (só letras, números e _) pra usar em textos personalizados ou fórmulas de outras etapas.'}
            </p>
          </Field>
        )}

        {ctaEligible && (
          <Field label="Texto do botão">
            <Input value={block.ctaLabel ?? ''} onChange={(e) => onChange({ ctaLabel: e.target.value })} />
          </Field>
        )}

        {block.type === 'result' && (
          <>
            <Field label="Link do botão (URL)">
              <Input
                value={block.ctaUrl ?? ''}
                onChange={(e) => onChange({ ctaUrl: e.target.value })}
                placeholder="https://exemplo.com/obrigado"
              />
            </Field>
            <Field label="Etiqueta para lead quente (opcional)">
              <Input
                value={block.resultBadgeHot ?? ''}
                onChange={(e) => onChange({ resultBadgeHot: e.target.value })}
                placeholder="✨ Resultado pronto"
              />
            </Field>
            <Field label="Etiqueta para lead morno (opcional)">
              <Input
                value={block.resultBadgeWarm ?? ''}
                onChange={(e) => onChange({ resultBadgeWarm: e.target.value })}
                placeholder="✨ Resultado pronto"
              />
            </Field>
            <Field label="Etiqueta para lead frio (opcional)">
              <Input
                value={block.resultBadgeCold ?? ''}
                onChange={(e) => onChange({ resultBadgeCold: e.target.value })}
                placeholder="✨ Resultado pronto"
              />
            </Field>
          </>
        )}

        {block.type === 'rating' && (
          <Field label={`Escala máxima: ${block.maxRating ?? 5}`}>
            <Slider
              min={3}
              max={10}
              step={1}
              value={[block.maxRating ?? 5]}
              onValueChange={([v]) => onChange({ maxRating: v })}
            />
          </Field>
        )}

        {block.type === 'video' && (
          <Field label="Provedor">
            <Select value={block.mediaProvider ?? 'youtube'} onValueChange={(v) => onChange({ mediaProvider: v as QuizBlock['mediaProvider'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="vimeo">Vimeo</SelectItem>
                <SelectItem value="mp4">MP4 direto</SelectItem>
                <SelectItem value="file">Upload</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        )}

        {block.type === 'testimonial' && (
          <>
            <Field label="Autor">
              <Input value={block.testimonialAuthor ?? ''} onChange={(e) => onChange({ testimonialAuthor: e.target.value })} />
            </Field>
            <Field label="Cargo / Empresa">
              <Input value={block.testimonialRole ?? ''} onChange={(e) => onChange({ testimonialRole: e.target.value })} />
            </Field>
          </>
        )}

        {block.type === 'countdown' && (
          <>
            <Field label={`Duração: ${block.countdownMinutes ?? 15} min`}>
              <Slider min={1} max={120} step={1} value={[block.countdownMinutes ?? 15]} onValueChange={([v]) => onChange({ countdownMinutes: v, countdownEndsAt: undefined })} />
            </Field>
            <Field label="Ou data/hora final (ISO)">
              <Input value={block.countdownEndsAt ?? ''} onChange={(e) => onChange({ countdownEndsAt: e.target.value })} placeholder="2026-12-31T23:59:00Z" />
            </Field>
          </>
        )}

        {(block.type === 'argument-progress' || block.type === 'level') && (
          <Field label={`Progresso: ${block.progressValue ?? 50}%`}>
            <Slider min={0} max={100} step={5} value={[block.progressValue ?? 50]} onValueChange={([v]) => onChange({ progressValue: v })} />
          </Field>
        )}

        {block.type === 'level' && (
          <Field label="Rótulo do nível">
            <Input value={block.levelLabel ?? ''} onChange={(e) => onChange({ levelLabel: e.target.value })} placeholder="Ex: Intermediário" />
          </Field>
        )}

        {block.type === 'loading' && (
          <>
            <Field label={`Duração: ${block.loadingSeconds ?? 3}s`}>
              <Slider min={1} max={10} step={1} value={[block.loadingSeconds ?? 3]} onValueChange={([v]) => onChange({ loadingSeconds: v })} />
            </Field>
            <Field label="Etapas exibidas">
              <StringListEditor
                items={block.loadingSteps ?? []}
                onChange={(items) => onChange({ loadingSteps: items })}
                placeholder="Ex: Processando dados"
                addLabel="Adicionar etapa"
              />
            </Field>
          </>
        )}

        {block.type === 'faq' && (
          <Field label="Perguntas">
            <FaqEditor items={block.faqItems ?? []} onChange={(items) => onChange({ faqItems: items })} />
          </Field>
        )}

        {block.type === 'form' && (
          <Field label="Campos exibidos">
            <div className="space-y-2">
              {([
                ['name', 'Nome'],
                ['email', 'E-mail'],
                ['phone', 'Telefone'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={block.formFields?.[key] ?? true}
                    onCheckedChange={(checked) =>
                      onChange({ formFields: { ...(block.formFields ?? { name: true, email: true, phone: true }), [key]: Boolean(checked) } })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </Field>
        )}

        {block.type === 'pricing' && (
          <>
            <Field label="Preço">
              <Input value={block.pricingPrice ?? ''} onChange={(e) => onChange({ pricingPrice: e.target.value })} placeholder="R$ 97" />
            </Field>
            <Field label="Preço original (riscado)">
              <Input value={block.pricingOriginalPrice ?? ''} onChange={(e) => onChange({ pricingOriginalPrice: e.target.value })} placeholder="R$ 197" />
            </Field>
            <Field label="Período">
              <Input value={block.pricingPeriod ?? ''} onChange={(e) => onChange({ pricingPeriod: e.target.value })} placeholder="/mês" />
            </Field>
            <Field label="Benefícios">
              <StringListEditor
                items={block.pricingFeatures ?? []}
                onChange={(items) => onChange({ pricingFeatures: items })}
                placeholder="Ex: Suporte prioritário"
                addLabel="Adicionar benefício"
              />
            </Field>
          </>
        )}

        {block.type === 'reveal' && (
          <>
            <Field label="Texto do botão de revelar">
              <Input value={block.revealLabel ?? ''} onChange={(e) => onChange({ revealLabel: e.target.value })} />
            </Field>
            <Field label="Título revelado">
              <Input value={block.revealedTitle ?? ''} onChange={(e) => onChange({ revealedTitle: e.target.value })} />
            </Field>
            <Field label="Texto revelado">
              <Textarea rows={2} value={block.revealedBody ?? ''} onChange={(e) => onChange({ revealedBody: e.target.value })} />
            </Field>
          </>
        )}

        {block.type === 'ios-notification' && (
          <>
            <Field label="Nome do app">
              <Input value={block.notificationApp ?? ''} onChange={(e) => onChange({ notificationApp: e.target.value })} />
            </Field>
            <Field label="Horário exibido">
              <Input value={block.notificationTime ?? ''} onChange={(e) => onChange({ notificationTime: e.target.value })} placeholder="agora" />
            </Field>
          </>
        )}

        {block.type === 'comparison' && (
          <>
            <Field label="Rótulo (esquerda)">
              <Input value={block.comparisonLeftLabel ?? ''} onChange={(e) => onChange({ comparisonLeftLabel: e.target.value })} />
            </Field>
            <Field label="Itens (esquerda)">
              <StringListEditor
                items={block.comparisonLeftItems ?? []}
                onChange={(items) => onChange({ comparisonLeftItems: items })}
                addLabel="Adicionar item"
              />
            </Field>
            <Field label="Rótulo (direita)">
              <Input value={block.comparisonRightLabel ?? ''} onChange={(e) => onChange({ comparisonRightLabel: e.target.value })} />
            </Field>
            <Field label="Itens (direita)">
              <StringListEditor
                items={block.comparisonRightItems ?? []}
                onChange={(items) => onChange({ comparisonRightItems: items })}
                addLabel="Adicionar item"
              />
            </Field>
          </>
        )}

        {block.type === 'chart' && (
          <Field label="Dados do gráfico">
            <ChartDataEditor items={block.chartData ?? []} onChange={(items) => onChange({ chartData: items })} />
          </Field>
        )}

        {block.type === 'custom' && (
          <Field label="HTML customizado">
            <Textarea
              rows={10}
              className="font-mono text-xs"
              value={block.customHtml ?? ''}
              onChange={(e) => onChange({ customHtml: e.target.value })}
            />
          </Field>
        )}
      </Section>

      {hasMedia && (
        <Section title="Mídia" icon={ImageIcon}>
          {block.type === 'intro' && (
            <Field label="Imagem de capa">
              <MediaUploader
                quizId={quizId}
                accept="image"
                value={block.imageUrl}
                onChange={(url) => onChange({ imageUrl: url })}
              />
            </Field>
          )}
          {block.type === 'image' && (
            <Field label="Imagem">
              <MediaUploader
                quizId={quizId}
                accept="image"
                value={block.mediaUrl}
                onChange={(url) => onChange({ mediaUrl: url })}
              />
            </Field>
          )}
          {block.type === 'audio' && (
            <Field label="Áudio">
              <MediaUploader
                quizId={quizId}
                accept="audio"
                value={block.mediaUrl}
                onChange={(url) => onChange({ mediaUrl: url })}
              />
            </Field>
          )}
          {block.type === 'video' && (
            <Field label={block.mediaProvider === 'file' || block.mediaProvider === 'mp4' ? 'Vídeo' : 'URL do vídeo'}>
              {block.mediaProvider === 'file' ? (
                <MediaUploader
                  quizId={quizId}
                  accept="video"
                  value={block.mediaUrl}
                  onChange={(url) => onChange({ mediaUrl: url })}
                />
              ) : (
                <Input value={block.mediaUrl ?? ''} onChange={(e) => onChange({ mediaUrl: e.target.value })} placeholder="https://..." />
              )}
            </Field>
          )}
          {block.type === 'before-after' && (
            <>
              <Field label="Antes">
                <MediaUploader
                  quizId={quizId}
                  accept="image"
                  value={block.beforeUrl}
                  onChange={(url) => onChange({ beforeUrl: url })}
                />
              </Field>
              <Field label="Depois">
                <MediaUploader
                  quizId={quizId}
                  accept="image"
                  value={block.afterUrl}
                  onChange={(url) => onChange({ afterUrl: url })}
                />
              </Field>
            </>
          )}
          {block.type === 'testimonial' && (
            <Field label="Avatar">
              <MediaUploader
                quizId={quizId}
                accept="image"
                value={block.testimonialAvatar}
                onChange={(url) => onChange({ testimonialAvatar: url })}
                compact
              />
            </Field>
          )}
          {block.type === 'carousel' && (
            <Field label="Imagens">
              <CarouselEditor
                quizId={quizId}
                images={block.carouselImages ?? []}
                onChange={(images) => onChange({ carouselImages: images })}
              />
            </Field>
          )}
        </Section>
      )}

      {hasOptions && (
        <Section title="Opções" icon={ListChecks}>
          {(block.options ?? []).map((opt, i) => (
            <OptionEditor
              key={opt.id}
              quizId={quizId}
              option={opt}
              blockType={block.type}
              allBlocks={allBlocks}
              currentBlockId={block.id}
              onUpdate={(patch) => {
                const next = [...(block.options ?? [])];
                next[i] = { ...opt, ...patch };
                onChange({ options: next });
              }}
              onDelete={() => {
                const next = (block.options ?? []).filter((o) => o.id !== opt.id);
                onChange({ options: next });
              }}
            />
          ))}
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2"
            onClick={() =>
              onChange({
                options: [
                  ...(block.options ?? []),
                  { id: crypto.randomUUID(), label: `Opção ${(block.options?.length ?? 0) + 1}` },
                ],
              })
            }
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar opção
          </Button>
        </Section>
      )}

      <ShowIfSection block={block} allBlocks={allBlocks} onChange={onChange} />

      {block.type !== 'result' && (
        <AbTestSection quizId={quizId} block={block} onChange={onChange} />
      )}
    </div>
  );
}

// Tipos de bloco cuja resposta pode alimentar uma condição de exibição.
const ANSWERABLE_TYPES = new Set([
  'single-choice',
  'multi-choice',
  'rating',
  'short-text',
  'long-text',
  'email',
  'phone',
  'weight',
  'height',
]);

function stepLabelFor(allBlocks: QuizBlock[], blockIds: string[], index: number): string {
  const first = allBlocks.find((b) => b.id === blockIds[0]);
  const def = first ? BLOCK_LIBRARY.find((d) => d.type === first.type) : undefined;
  const title = first?.title || first?.resultTitle || def?.label || '';
  return `Etapa ${index + 1}${title ? ` · ${title}` : ''}`;
}

// Ramificação por opção: "quem responde X pula pra etapa Y".
function OptionJumpSelect({
  allBlocks,
  currentBlockId,
  value,
  onSelect,
}: {
  allBlocks: QuizBlock[];
  currentBlockId: string;
  value?: string;
  onSelect: (jumpToBlockId: string | undefined) => void;
}) {
  const steps = getSteps({ blocks: allBlocks });
  const currentStepIdx = steps.findIndex((s) => s.blockIds.includes(currentBlockId));
  const targets = steps.filter((_, i) => i !== currentStepIdx);
  if (targets.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 pl-1">
      <CornerDownRight className="h-3 w-3 text-muted-foreground shrink-0" />
      <Select
        value={value ?? 'flow'}
        onValueChange={(v) => onSelect(v === 'flow' ? undefined : v)}
      >
        <SelectTrigger className="h-7 text-[11px] text-muted-foreground border-dashed">
          <SelectValue placeholder="Seguir fluxo normal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="flow">Seguir fluxo normal</SelectItem>
          {targets.map((s) => (
            <SelectItem key={s.id} value={s.blockIds[0]}>
              Pular para {stepLabelFor(allBlocks, s.blockIds, steps.indexOf(s))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function miniChip(active: boolean) {
  return `rounded-md border px-2 py-1 text-[10.5px] font-medium text-center transition-colors ${
    active ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:border-primary/40 hover:text-foreground'
  }`;
}

// Editor de uma opção de escolha (padrão Funilix): cada opção é um mini-bloco com
// mídia (emoji OU imagem), pré-seleção, pontuação e ação de clique próprias —
// não só um rótulo de texto. Fica recolhida por padrão pra não pesar a lista
// quando há muitas opções; expande sob demanda.
function OptionEditor({
  quizId,
  option,
  blockType,
  allBlocks,
  currentBlockId,
  onUpdate,
  onDelete,
}: {
  quizId: string;
  option: BlockOption;
  blockType: QuizBlock['type'];
  allBlocks: QuizBlock[];
  currentBlockId: string;
  onUpdate: (patch: Partial<BlockOption>) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mediaTab, setMediaTab] = useState<'none' | 'emoji' | 'image'>(
    option.imageUrl ? 'image' : option.emoji ? 'emoji' : 'none'
  );
  const [actionTab, setActionTab] = useState<'flow' | 'step' | 'url'>(
    option.actionUrl ? 'url' : option.jumpToBlockId ? 'step' : 'flow'
  );

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-1.5 p-1.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted overflow-hidden">
          {option.imageUrl ? (
            <img src={option.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : option.emoji ? (
            <span className="text-sm">{option.emoji}</span>
          ) : (
            <ImageIcon className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <Input value={option.label} onChange={(e) => onUpdate({ label: e.target.value })} className="h-8" />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground p-1.5"
          aria-label={expanded ? 'Recolher opção' : 'Mais opções desta alternativa'}
          title={expanded ? 'Recolher' : 'Mídia, pré-seleção, pontuação, ação ao clicar…'}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Button size="sm" variant="ghost" onClick={onDelete} className="h-8 w-8 p-0 shrink-0" aria-label="Excluir opção">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2.5 p-2.5 pt-0 border-t mt-0">
          <Field label="Mídia">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className={miniChip(mediaTab === 'none')}
                onClick={() => { setMediaTab('none'); onUpdate({ emoji: undefined, imageUrl: undefined }); }}
              >
                Nenhuma
              </button>
              <button
                type="button"
                className={miniChip(mediaTab === 'emoji')}
                onClick={() => { setMediaTab('emoji'); onUpdate({ imageUrl: undefined }); }}
              >
                Emoji
              </button>
              <button
                type="button"
                className={miniChip(mediaTab === 'image')}
                onClick={() => { setMediaTab('image'); onUpdate({ emoji: undefined }); }}
              >
                Imagem
              </button>
            </div>
            {mediaTab === 'emoji' && (
              <Input
                value={option.emoji ?? ''}
                onChange={(e) => onUpdate({ emoji: e.target.value })}
                placeholder="🔥"
                className="mt-1.5 text-center"
              />
            )}
            {mediaTab === 'image' && (
              <div className="mt-1.5">
                <MediaUploader
                  quizId={quizId}
                  accept="image"
                  value={option.imageUrl}
                  onChange={(url) => onUpdate({ imageUrl: url || undefined })}
                  compact
                />
              </div>
            )}
          </Field>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium">Pré-selecionada</p>
              <p className="text-[11px] text-muted-foreground leading-snug">Já vem marcada quando a etapa abre</p>
            </div>
            <Switch checked={!!option.preselected} onCheckedChange={(v) => onUpdate({ preselected: v })} />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Pontuação">
              <Input
                type="number"
                value={option.score ?? ''}
                onChange={(e) => onUpdate({ score: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="0"
              />
            </Field>
            <Field label="Etiqueta (tag)">
              <Input
                value={option.tag ?? ''}
                onChange={(e) => onUpdate({ tag: e.target.value || undefined })}
                placeholder="ex.: premium"
              />
            </Field>
          </div>

          {blockType === 'single-choice' && (
            <Field label="Ação ao clicar">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className={miniChip(actionTab === 'flow')}
                  onClick={() => { setActionTab('flow'); onUpdate({ jumpToBlockId: undefined, actionUrl: undefined }); }}
                >
                  Seguir fluxo
                </button>
                <button
                  type="button"
                  className={miniChip(actionTab === 'step')}
                  onClick={() => { setActionTab('step'); onUpdate({ actionUrl: undefined }); }}
                >
                  Etapa específica
                </button>
                <button
                  type="button"
                  className={miniChip(actionTab === 'url')}
                  onClick={() => { setActionTab('url'); onUpdate({ jumpToBlockId: undefined }); }}
                >
                  URL externa
                </button>
              </div>
              {actionTab === 'step' && (
                <div className="mt-1.5">
                  <OptionJumpSelect
                    allBlocks={allBlocks}
                    currentBlockId={currentBlockId}
                    value={option.jumpToBlockId}
                    onSelect={(target) => onUpdate({ jumpToBlockId: target })}
                  />
                </div>
              )}
              {actionTab === 'url' && (
                <Input
                  className="mt-1.5"
                  value={option.actionUrl ?? ''}
                  onChange={(e) => onUpdate({ actionUrl: e.target.value })}
                  placeholder="https://exemplo.com"
                />
              )}
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

// Exibição condicional (padrão Funilix): mostra o bloco só quando a condição
// sobre uma resposta anterior for verdadeira.
function ShowIfSection({
  block,
  allBlocks,
  onChange,
}: {
  block: QuizBlock;
  allBlocks: QuizBlock[];
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const showIf: BlockShowIf = block.showIf ?? { enabled: false, fieldBlockId: '', op: 'eq', value: '' };
  const patch = (p: Partial<BlockShowIf>) => onChange({ showIf: { ...showIf, ...p } });

  const myIndex = allBlocks.findIndex((b) => b.id === block.id);
  const sources = allBlocks.filter((b, i) => (myIndex < 0 || i < myIndex) && ANSWERABLE_TYPES.has(b.type));
  const variableNames = allBlocks.filter((b) => b.outputVariable).map((b) => b.outputVariable!);
  const sourceBlock = allBlocks.find((b) => b.id === showIf.fieldBlockId);
  const sourceOptions = sourceBlock?.options ?? [];
  const isRange = showIf.op === 'between';
  const isFormula = !!showIf.useFormula;

  const OPS: { id: ShowIfOp; label: string }[] = [
    { id: 'eq', label: '= Igual' },
    { id: 'neq', label: '≠ Diferente' },
    { id: 'contains', label: '∋ Contém' },
    { id: 'gt', label: '> Maior que' },
    { id: 'gte', label: '≥ Maior ou igual' },
    { id: 'lt', label: '< Menor que' },
    { id: 'lte', label: '≤ Menor ou igual' },
  ];

  const chipClass = (active: boolean) =>
    `rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors text-left ${
      active
        ? 'border-primary bg-primary/10 text-primary'
        : 'border-input text-muted-foreground hover:border-primary/40 hover:text-foreground'
    }`;

  return (
    <Section title="Exibição condicional" icon={Eye}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium">Ativar condição</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Mostra este bloco somente quando a condição for verdadeira.
          </p>
        </div>
        <Switch checked={showIf.enabled} onCheckedChange={(v) => patch({ enabled: v })} />
      </div>

      {showIf.enabled &&
        (sources.length === 0 && !isFormula ? (
          <p className="text-[11px] text-muted-foreground rounded-lg border border-dashed p-2.5">
            Adicione, antes deste bloco, uma pergunta (escolha, avaliação, texto, peso…) para usar a resposta dela como
            condição — ou dê um nome de variável a uma pergunta anterior e use o modo Fórmula.
          </p>
        ) : (
          <>
            <Field label="Tipo de condição">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className={chipClass(!isFormula && !isRange)}
                  onClick={() => patch({ useFormula: false, op: 'eq', value2: undefined })}
                >
                  Simples
                </button>
                <button
                  type="button"
                  className={chipClass(!isFormula && isRange)}
                  onClick={() => patch({ useFormula: false, op: 'between' })}
                >
                  Faixa (entre)
                </button>
                <button
                  type="button"
                  className={chipClass(isFormula)}
                  onClick={() => patch({ useFormula: true, op: showIf.op === 'between' ? 'gte' : showIf.op })}
                >
                  Fórmula
                </button>
              </div>
            </Field>

            {isFormula ? (
              <Field label="Fórmula">
                <Input
                  value={showIf.expression ?? ''}
                  onChange={(e) => patch({ expression: e.target.value })}
                  placeholder="ex.: peso/(altura/100)^2"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {variableNames.length > 0
                    ? <>Variáveis disponíveis: {variableNames.map((n) => (
                        <code key={n} className="rounded bg-muted px-1 py-0.5 mr-1">{n}</code>
                      ))}</>
                    : 'Dê um nome de variável a uma pergunta anterior (campo "Variável de saída") pra poder usá-la aqui.'}
                </p>
              </Field>
            ) : (
              <Field label="Com base na resposta de">
                <Select
                  value={showIf.fieldBlockId || undefined}
                  onValueChange={(v) => patch({ fieldBlockId: v, value: '', value2: undefined })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o campo…" />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((b) => {
                      const def = BLOCK_LIBRARY.find((d) => d.type === b.type);
                      return (
                        <SelectItem key={b.id} value={b.id}>
                          {b.title || def?.label || b.type}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {!isRange && (
              <Field label="Operador">
                <div className="grid grid-cols-2 gap-1.5">
                  {OPS.map((op) => (
                    <button
                      key={op.id}
                      type="button"
                      className={chipClass(showIf.op === op.id)}
                      onClick={() => patch({ op: op.id })}
                    >
                      {op.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {isRange ? (
              <Field label="Entre os valores">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    placeholder="De"
                    value={String(showIf.value ?? '')}
                    onChange={(e) => patch({ value: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">e</span>
                  <Input
                    type="number"
                    placeholder="Até"
                    value={String(showIf.value2 ?? '')}
                    onChange={(e) => patch({ value2: e.target.value })}
                  />
                </div>
              </Field>
            ) : (
              <Field label="Comparar com">
                {!isFormula && sourceOptions.length > 0 && (showIf.op === 'eq' || showIf.op === 'neq' || showIf.op === 'contains') ? (
                  <Select value={showIf.value ? String(showIf.value) : undefined} onValueChange={(v) => patch({ value: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha a opção…" />
                    </SelectTrigger>
                    <SelectContent>
                      {sourceOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={String(showIf.value ?? '')}
                    onChange={(e) => patch({ value: e.target.value })}
                    placeholder="ex.: 70"
                  />
                )}
              </Field>
            )}
          </>
        ))}
    </Section>
  );
}

function Section({
  title,
  icon: Icon,
  first,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-3 ${first ? '' : 'border-t pt-5'}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AbTestSection({
  quizId,
  block,
  onChange,
}: {
  quizId: string;
  block: QuizBlock;
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const abTest = block.abTest ?? { enabled: false, variants: [] };

  const updateAbTest = (patch: Partial<NonNullable<QuizBlock['abTest']>>) => {
    onChange({ abTest: { ...abTest, ...patch } });
  };

  const updateVariant = (id: string, patch: Partial<BlockVariant>) => {
    updateAbTest({
      variants: abTest.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    });
  };

  const addVariant = () => {
    updateAbTest({
      variants: [...abTest.variants, { id: crypto.randomUUID(), title: block.title ?? '' }],
    });
  };

  const removeVariant = (id: string) => {
    updateAbTest({ variants: abTest.variants.filter((v) => v.id !== id) });
  };

  return (
    <div className="space-y-3 border-t pt-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5 text-muted-foreground" />
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Teste A/B</h4>
        </div>
        <Switch
          checked={abTest.enabled}
          onCheckedChange={(checked) => updateAbTest({ enabled: checked })}
        />
      </div>

      {abTest.enabled && (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            A versão "Original" (título/subtítulo/CTA/imagem atuais do bloco) é a primeira variação.
            Adicione alternativas abaixo — visitantes verão uma delas aleatoriamente.
          </p>
          {abTest.variants.map((variant, i) => (
            <div key={variant.id} className="rounded-lg border p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground">Variação {i + 1}</span>
                <Button size="sm" variant="ghost" onClick={() => removeVariant(variant.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                placeholder="Título"
                value={variant.title ?? ''}
                onChange={(e) => updateVariant(variant.id, { title: e.target.value })}
              />
              <Textarea
                placeholder="Subtítulo"
                rows={2}
                value={variant.subtitle ?? ''}
                onChange={(e) => updateVariant(variant.id, { subtitle: e.target.value })}
              />
              <Input
                placeholder="Texto do botão"
                value={variant.ctaLabel ?? ''}
                onChange={(e) => updateVariant(variant.id, { ctaLabel: e.target.value })}
              />
              <MediaUploader
                quizId={quizId}
                accept="image"
                value={variant.imageUrl}
                onChange={(url) => updateVariant(variant.id, { imageUrl: url })}
                compact
              />
            </div>
          ))}
          <Button size="sm" variant="outline" className="w-full gap-2" onClick={addVariant}>
            <Plus className="h-3.5 w-3.5" /> Adicionar variação
          </Button>
        </div>
      )}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 rounded border cursor-pointer"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

function DesignInspector({ design, onChange }: { design: QuizDesign; onChange: (p: Partial<QuizDesign>) => void }) {
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Palette className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm">Design</h3>
          <p className="text-xs text-muted-foreground">Selecione um bloco ou personalize o visual global</p>
        </div>
      </div>

      <Tabs defaultValue="presets">
        <TabsList className="w-full">
          <TabsTrigger value="presets" className="gap-1.5 flex-1"><Sparkles className="h-3.5 w-3.5" />Presets</TabsTrigger>
          <TabsTrigger value="cores" className="gap-1.5 flex-1"><Palette className="h-3.5 w-3.5" />Cores</TabsTrigger>
          <TabsTrigger value="estilo" className="gap-1.5 flex-1"><SlidersHorizontal className="h-3.5 w-3.5" />Estilo</TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="pt-3">
          <div className="grid grid-cols-2 gap-2">
            {DESIGN_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange(p.design)}
                className={`text-left p-2 rounded-lg border-2 transition-all ${
                  design.presetId === p.id ? 'border-primary' : 'border-transparent hover:border-border'
                }`}
              >
                <div className="flex gap-1 mb-1.5">
                  <div className="h-3 w-3 rounded" style={{ background: p.design.background }} />
                  <div className="h-3 w-3 rounded" style={{ background: p.design.primary }} />
                  <div className="h-3 w-3 rounded" style={{ background: p.design.surface }} />
                </div>
                <div className="text-xs font-semibold">{p.name}</div>
                <div className="text-[10px] text-muted-foreground line-clamp-1">{p.description}</div>
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cores" className="pt-3 space-y-4">
          <ColorField label="Cor primária" value={design.primary} onChange={(v) => onChange({ primary: v })} />
          <ColorField label="Fundo" value={design.background} onChange={(v) => onChange({ background: v })} />
          <ColorField label="Superfície (cards, opções)" value={design.surface} onChange={(v) => onChange({ surface: v })} />
          <ColorField label="Texto" value={design.text} onChange={(v) => onChange({ text: v })} />
          <ColorField label="Texto secundário" value={design.muted} onChange={(v) => onChange({ muted: v })} />
        </TabsContent>

        <TabsContent value="estilo" className="pt-3 space-y-4">
          <Field label={`Arredondamento: ${design.radius}px`}>
            <Slider min={0} max={32} step={2} value={[design.radius]} onValueChange={([v]) => onChange({ radius: v })} />
          </Field>

          <Field label="Estilo de botão">
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-0.5">
              {BUTTON_STYLE_OPTIONS.map((opt) => {
                const active = design.buttonStyle === opt.id;
                const { style, className } = getButtonStyle({ ...design, buttonStyle: opt.id });
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange({ buttonStyle: opt.id })}
                    className={`text-left p-2 rounded-lg border-2 transition-all ${
                      active ? 'border-primary bg-primary/5' : 'border-transparent hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-center py-2">
                      <span
                        className={`px-3 py-1.5 rounded text-[11px] font-semibold${className ? ` ${className}` : ''}`}
                        style={style}
                      >
                        Avançar
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-center">{opt.label}</div>
                    <div className="text-[10px] text-muted-foreground text-center line-clamp-1">{opt.description}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Barra de progresso">
            <Select value={design.progressStyle} onValueChange={(v) => onChange({ progressStyle: v as QuizDesign['progressStyle'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Barra</SelectItem>
                <SelectItem value="dots">Pontos</SelectItem>
                <SelectItem value="steps">Etapas</SelectItem>
                <SelectItem value="none">Nenhuma</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function StringListEditor({
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1">
          <Input
            value={item}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...items];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => onChange([...items, ''])}>
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

function FaqEditor({ items, onChange }: { items: FaqItem[]; onChange: (items: FaqItem[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} className="rounded-lg border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">Pergunta {i + 1}</span>
            <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((x) => x.id !== item.id))}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          <Input
            placeholder="Pergunta"
            value={item.question}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, question: e.target.value };
              onChange(next);
            }}
          />
          <Textarea
            placeholder="Resposta"
            rows={2}
            value={item.answer}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, answer: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), question: '', answer: '' }])}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar pergunta
      </Button>
    </div>
  );
}

function ChartDataEditor({ items, onChange }: { items: ChartPoint[]; onChange: (items: ChartPoint[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} className="flex gap-1">
          <Input
            placeholder="Rótulo"
            value={item.label}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, label: e.target.value };
              onChange(next);
            }}
            className="flex-1"
          />
          <Input
            type="number"
            placeholder="Valor"
            value={item.value}
            onChange={(e) => {
              const next = [...items];
              next[i] = { ...item, value: Number(e.target.value) };
              onChange(next);
            }}
            className="w-20"
          />
          <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((x) => x.id !== item.id))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), label: '', value: 0 }])}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar ponto
      </Button>
    </div>
  );
}

function CarouselEditor({
  quizId,
  images,
  onChange,
}: {
  quizId: string;
  images: string[];
  onChange: (images: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      {images.map((url, i) => (
        <div key={i} className="flex gap-1 items-start">
          <div className="flex-1">
            <MediaUploader
              quizId={quizId}
              accept="image"
              value={url}
              onChange={(u) => {
                const next = [...images];
                next[i] = u ?? '';
                onChange(next);
              }}
              compact
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => onChange(images.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => onChange([...images, ''])}>
        <Plus className="h-3.5 w-3.5" /> Adicionar imagem
      </Button>
    </div>
  );
}
