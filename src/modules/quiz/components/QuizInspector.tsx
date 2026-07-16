import type { QuizBlock, QuizDesign } from '../types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Trash2, Plus, GripVertical } from 'lucide-react';
import { DESIGN_PRESETS } from '../design-presets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { MediaUploader } from './MediaUploader';

interface Props {
  quizId: string;
  block: QuizBlock | null;
  design: QuizDesign;
  onChangeBlock: (patch: Partial<QuizBlock>) => void;
  onDeleteBlock: () => void;
  onChangeDesign: (patch: Partial<QuizDesign>) => void;
}

export function QuizInspector({ block, design, onChangeBlock, onDeleteBlock, onChangeDesign }: Props) {
  return (
    <div className="w-80 border-l bg-card overflow-y-auto">
      {block ? (
        <BlockInspector block={block} onChange={onChangeBlock} onDelete={onDeleteBlock} />
      ) : (
        <DesignInspector design={design} onChange={onChangeDesign} />
      )}
    </div>
  );
}

function BlockInspector({
  block,
  onChange,
  onDelete,
}: {
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
        <Field label="Imagem (URL)">
          <Input value={block.imageUrl ?? ''} onChange={(e) => onChange({ imageUrl: e.target.value })} placeholder="https://..." />
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

      {(block.type === 'video' || block.type === 'audio' || block.type === 'image') && (
        <Field label={block.type === 'video' ? 'URL do vídeo' : block.type === 'audio' ? 'URL do áudio (MP3)' : 'URL da imagem'}>
          <Input value={block.mediaUrl ?? ''} onChange={(e) => onChange({ mediaUrl: e.target.value })} placeholder="https://..." />
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
            </SelectContent>
          </Select>
        </Field>
      )}
      {block.type === 'before-after' && (
        <>
          <Field label="Imagem ANTES (URL)">
            <Input value={block.beforeUrl ?? ''} onChange={(e) => onChange({ beforeUrl: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="Imagem DEPOIS (URL)">
            <Input value={block.afterUrl ?? ''} onChange={(e) => onChange({ afterUrl: e.target.value })} placeholder="https://..." />
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
          <Field label="Avatar (URL)">
            <Input value={block.testimonialAvatar ?? ''} onChange={(e) => onChange({ testimonialAvatar: e.target.value })} placeholder="https://..." />
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
    </div>
  );
}

function DesignInspector({ design, onChange }: { design: QuizDesign; onChange: (p: Partial<QuizDesign>) => void }) {
  return (
    <div className="p-4 space-y-4">
      <div>
        <h3 className="font-bold text-sm">Design</h3>
        <p className="text-xs text-muted-foreground">Selecione um bloco para editar seu conteúdo, ou personalize o visual global aqui.</p>
      </div>

      <div>
        <Label className="text-xs mb-2 block">Presets</Label>
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
      </div>

      <Field label="Cor primária">
        <div className="flex gap-2">
          <input
            type="color"
            value={design.primary}
            onChange={(e) => onChange({ primary: e.target.value })}
            className="h-9 w-12 rounded border cursor-pointer"
          />
          <Input value={design.primary} onChange={(e) => onChange({ primary: e.target.value })} />
        </div>
      </Field>

      <Field label="Fundo">
        <div className="flex gap-2">
          <input
            type="color"
            value={design.background}
            onChange={(e) => onChange({ background: e.target.value })}
            className="h-9 w-12 rounded border cursor-pointer"
          />
          <Input value={design.background} onChange={(e) => onChange({ background: e.target.value })} />
        </div>
      </Field>

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
