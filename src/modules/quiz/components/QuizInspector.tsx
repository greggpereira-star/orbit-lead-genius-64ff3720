import type { QuizBlock, QuizDesign, BlockVariant } from '../types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, GripVertical, FlaskConical } from 'lucide-react';
import { DESIGN_PRESETS } from '../design-presets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { MediaUploader } from './MediaUploader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Palette, SlidersHorizontal } from 'lucide-react';

interface Props {
  quizId: string;
  block: QuizBlock | null;
  design: QuizDesign;
  onChangeBlock: (patch: Partial<QuizBlock>) => void;
  onDeleteBlock: () => void;
  onChangeDesign: (patch: Partial<QuizDesign>) => void;
  className?: string;
}

export function QuizInspector({ quizId, block, design, onChangeBlock, onDeleteBlock, onChangeDesign, className }: Props) {
  return (
    <div className={className ?? 'w-80 border-l bg-card overflow-y-auto'}>
      {block ? (
        <BlockInspector quizId={quizId} block={block} onChange={onChangeBlock} onDelete={onDeleteBlock} />
      ) : (
        <DesignInspector design={design} onChange={onChangeDesign} />
      )}
    </div>
  );
}

function BlockInspector({
  quizId,
  block,
  onChange,
  onDelete,
}: {
  quizId: string;
  block: QuizBlock;
  onChange: (p: Partial<QuizBlock>) => void;
  onDelete: () => void;
}) {
  const hasOptions = block.type === 'single-choice' || block.type === 'multi-choice';
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-sm">Bloco</h3>
          <p className="text-xs text-muted-foreground">{block.type}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {block.type === 'result' ? (
        <>
          <Field label="Título do resultado">
            <Input value={block.resultTitle ?? ''} onChange={(e) => onChange({ resultTitle: e.target.value })} />
          </Field>
          <Field label="Descrição do resultado">
            <Textarea rows={4} value={block.resultBody ?? ''} onChange={(e) => onChange({ resultBody: e.target.value })} />
          </Field>
        </>
      ) : (
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

      {(block.type === 'intro' || block.type === 'cta' || block.type === 'result' ||
        block.type === 'short-text' || block.type === 'long-text' || block.type === 'email' || block.type === 'phone') && (
        <Field label="Texto do botão">
          <Input value={block.ctaLabel ?? ''} onChange={(e) => onChange({ ctaLabel: e.target.value })} />
        </Field>
      )}

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
        <>
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
        </>
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
        <>
          <Field label="Autor">
            <Input value={block.testimonialAuthor ?? ''} onChange={(e) => onChange({ testimonialAuthor: e.target.value })} />
          </Field>
          <Field label="Cargo / Empresa">
            <Input value={block.testimonialRole ?? ''} onChange={(e) => onChange({ testimonialRole: e.target.value })} />
          </Field>
          <Field label="Avatar">
            <MediaUploader
              quizId={quizId}
              accept="image"
              value={block.testimonialAvatar}
              onChange={(url) => onChange({ testimonialAvatar: url })}
              compact
            />
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

      {hasOptions && (
        <div className="space-y-2">
          <Label className="text-xs">Opções</Label>
          {(block.options ?? []).map((opt, i) => (
            <div key={opt.id} className="flex gap-1">
              <Input
                value={opt.label}
                onChange={(e) => {
                  const next = [...(block.options ?? [])];
                  next[i] = { ...opt, label: e.target.value };
                  onChange({ options: next });
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = (block.options ?? []).filter((o) => o.id !== opt.id);
                  onChange({ options: next });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
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
        </div>
      )}

      {block.type !== 'result' && (
        <AbTestSection quizId={quizId} block={block} onChange={onChange} />
      )}
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
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FlaskConical className="h-3.5 w-3.5 text-primary" />
          <Label className="text-xs font-semibold">Teste A/B</Label>
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
    <div className="p-4 space-y-4">
      <div>
        <h3 className="font-bold text-sm">Design</h3>
        <p className="text-xs text-muted-foreground">Selecione um bloco para editar seu conteúdo, ou personalize o visual global aqui.</p>
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
            <Select value={design.buttonStyle} onValueChange={(v) => onChange({ buttonStyle: v as QuizDesign['buttonStyle'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Sólido</SelectItem>
                <SelectItem value="gradient">Gradiente</SelectItem>
                <SelectItem value="outline">Contorno</SelectItem>
                <SelectItem value="ghost">Fantasma</SelectItem>
              </SelectContent>
            </Select>
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

// Silence unused import warning
void GripVertical;
