import { useState, useRef } from "react";
import type {
  QuizBlock,
  QuizDesign,
  QuizStep,
  BlockVariant,
  BlockOption,
  FaqItem,
  ChartPoint,
  BlockShowIf,
  ShowIfOp,
  BlockLogicOp,
  BlockLogicRule,
  ItemDeConteudo,
  LinkSocial,
} from "../types";
import { MASCARAS, tamanhoDaMascara } from "../lib/fieldMask";
import { POSICOES, ANCORAS } from "../lib/blockPosition";
import { temCorPropria, coresDoDocumento, VOLTAR_AO_TEMA } from "../lib/temaDoBloco";
import { BLOCK_FONTS, TEXT_SLOTS, hasTextStyle } from "../lib/blockStyle";
import type { BlockStyle, TextStyle, TextSlot } from "../lib/blockStyle";
import { getSteps } from "../lib/steps";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Droppable, Draggable, type DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import { GripVertical, Copy, Workflow, RotateCcw, Code2 } from "lucide-react";
import { Rows3, AlignCenter as AlignCenterIcon } from "lucide-react";
import { Baseline } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Trash2,
  Plus,
  FlaskConical,
  LayoutGrid,
  Image as ImageIcon,
  ListChecks,
  Eye,
  CornerDownRight,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { DESIGN_PRESETS } from "../design-presets";
import { BLOCK_LIBRARY } from "../blocks-library";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { MediaUploader } from "./MediaUploader";
import { RichTextEditor } from "./RichTextEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Palette, SlidersHorizontal } from "lucide-react";
import { BUTTON_STYLE_OPTIONS, getButtonStyle } from "../lib/buttonStyles";
import { applyRichTextMark, type RichTextMark } from "../lib/richtext";
import {
  resolveContainerLayout,
  type Breakpoint,
  type ResolvedContainerLayout,
} from "../lib/containerLayout";
import { Bold, Italic, Underline } from "lucide-react";

interface Props {
  quizId: string;
  block: QuizBlock | null;
  blocks?: QuizBlock[];
  steps?: QuizStep[];
  design: QuizDesign;
  onChangeBlock: (patch: Partial<QuizBlock>) => void;
  onDeleteBlock: () => void;
  onChangeDesign: (patch: Partial<QuizDesign>) => void;
  onMoveBlockIntoContainer?: (blockId: string, containerId: string) => void;
  onRemoveChildFromContainer?: (blockId: string, containerId: string) => void;
  onReorderContainerChildren?: (containerId: string, fromIndex: number, toIndex: number) => void;
  onAddChildToContainer?: (containerId: string, defIndex: number) => void;
  onDeleteChildBlock?: (blockId: string) => void;
  onSelectBlock?: (blockId: string) => void;
  className?: string;
  /** Distingue as duas montagens do inspetor (coluna e gaveta) nos ids de arraste. */
  dndScope?: "desktop" | "mobile";
}

export function QuizInspector({
  quizId,
  block,
  blocks,
  steps,
  design,
  onChangeBlock,
  onDeleteBlock,
  onChangeDesign,
  onMoveBlockIntoContainer,
  onRemoveChildFromContainer,
  onReorderContainerChildren,
  onAddChildToContainer,
  onDeleteChildBlock,
  onSelectBlock,
  className,
  dndScope,
}: Props) {
  return (
    <div className={className ?? "w-80 border-l bg-card overflow-y-auto"}>
      {block ? (
        <BlockInspector
          quizId={quizId}
          block={block}
          design={design}
          allBlocks={blocks ?? []}
          allSteps={steps ?? []}
          onChange={onChangeBlock}
          onDelete={onDeleteBlock}
          onMoveBlockIntoContainer={onMoveBlockIntoContainer}
          onRemoveChildFromContainer={onRemoveChildFromContainer}
          onReorderContainerChildren={onReorderContainerChildren}
          onAddChildToContainer={onAddChildToContainer}
          onDeleteChildBlock={onDeleteChildBlock}
          onSelectBlock={onSelectBlock}
          dndScope={dndScope}
        />
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
  allSteps,
  onChange,
  onDelete,
  onMoveBlockIntoContainer,
  onRemoveChildFromContainer,
  onReorderContainerChildren,
  onAddChildToContainer,
  onDeleteChildBlock,
  dndScope = "desktop",
  onSelectBlock,
  design,
}: {
  quizId: string;
  block: QuizBlock;
  /** Tema do funil — serve de referência para as cores próprias do bloco. */
  design?: QuizDesign;
  allBlocks: QuizBlock[];
  allSteps: QuizStep[];
  onChange: (p: Partial<QuizBlock>) => void;
  onDelete: () => void;
  onMoveBlockIntoContainer?: (blockId: string, containerId: string) => void;
  onRemoveChildFromContainer?: (blockId: string, containerId: string) => void;
  onReorderContainerChildren?: (containerId: string, fromIndex: number, toIndex: number) => void;
  onAddChildToContainer?: (containerId: string, defIndex: number) => void;
  onDeleteChildBlock?: (blockId: string) => void;
  /** Distingue as duas montagens do inspetor (coluna e gaveta) nos ids de arraste. */
  dndScope?: "desktop" | "mobile";
  onSelectBlock?: (blockId: string) => void;
}) {
  const hasOptions = block.type === "single-choice" || block.type === "multi-choice";
  const hasMedia = [
    "intro",
    "image",
    "audio",
    "video",
    "before-after",
    "testimonial",
    "carousel",
    "audio-call",
  ].includes(block.type);
  const def = BLOCK_LIBRARY.find((d) => d.type === block.type);
  // Se este bloco é filho de algum Container, mostra um atalho pra voltar pro pai
  // — do contrário fica fácil "perder" o bloco depois de entrar pra editá-lo.
  const parentContainer = allBlocks.find((b) => b.childBlockIds?.includes(block.id));

  /* Variáveis oferecidas pelo botão fx: só as de blocos ANTERIORES a este —
     citar a resposta de um bloco que ainda não foi respondido renderiza vazio. */
  const availableVariables = (() => {
    const idx = allBlocks.findIndex((b) => b.id === block.id);
    return allBlocks
      .slice(0, idx >= 0 ? idx : allBlocks.length)
      .map((b) => b.outputVariable?.trim())
      .filter((v): v is string => !!v);
  })();

  const ctaEligible = [
    "button",
    "intro",
    "cta",
    "result",
    "short-text",
    "long-text",
    "email",
    "phone",
    "argument",
    "argument-progress",
    "level",
    "notification",
    "faq",
    "form",
    "weight",
    "height",
    "pricing",
    "reveal",
    "ios-notification",
    "audio-call",
    "carousel",
    "comparison",
    "chart",
  ].includes(block.type);

  return (
    <div className="p-4 space-y-5">
      {parentContainer && (
        <button
          type="button"
          onClick={() => onSelectBlock?.(parentContainer.id)}
          className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3 rotate-180" /> Dentro do Container
        </button>
      )}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          {def ? (
            <def.icon className="h-4 w-4 text-foreground" />
          ) : (
            <LayoutGrid className="h-4 w-4 text-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm truncate">{def?.label ?? "Bloco"}</h3>
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

      {/* Abas por bloco. Antes tudo era uma lista só: espaçamento e cor ficavam
          soterrados embaixo de conteúdo, opções e lógica, e na prática ninguém
          rolava até lá. */}
      <Tabs defaultValue="conteudo">
        <TabsList className="w-full">
          <TabsTrigger value="conteudo" className="flex-1 gap-1.5 text-xs">
            <LayoutGrid className="h-3.5 w-3.5" />
            Conteúdo
          </TabsTrigger>
          <TabsTrigger value="layout" className="flex-1 gap-1.5 text-xs">
            <Rows3 className="h-3.5 w-3.5" />
            Layout
          </TabsTrigger>
          <TabsTrigger value="aparencia" className="flex-1 gap-1.5 text-xs">
            <Palette className="h-3.5 w-3.5" />
            Aparência
          </TabsTrigger>
        </TabsList>

        <TabsContent value="layout" className="space-y-5 pt-4">
          <LayoutTab block={block} onChange={onChange} />
        </TabsContent>

        <TabsContent value="aparencia" className="space-y-5 pt-4">
          <AparenciaTab block={block} onChange={onChange} />
        </TabsContent>

        <TabsContent value="conteudo" className="space-y-5 pt-4">
          <Section title="Conteúdo" icon={LayoutGrid} first>
            {block.type === "result" ? (
              <>
                <Field label="Título do resultado">
                  <Input
                    value={block.resultTitle ?? ""}
                    onChange={(e) => onChange({ resultTitle: e.target.value })}
                  />
                </Field>
                {/* `key` no id do bloco: o editor monta seu conteúdo uma vez só (senão
                o cursor pularia a cada tecla). Trocar de bloco precisa remontar. */}
                <RichTextEditor
                  key={`${block.id}-body`}
                  label="Descrição do resultado"
                  value={block.resultBodyRich}
                  fallbackText={block.resultBody}
                  variables={availableVariables}
                  minHeight={120}
                  onChange={(doc, text) => onChange({ resultBodyRich: doc, resultBody: text })}
                />
              </>
            ) : block.type === "custom" ||
              block.type === "container" ||
              block.type === "spacer" ||
              block.type === "button" ? null : (
              /* Cada bloco mostra só o campo que ele DESENHA. O `Título` não
                 tem subtítulo e o `Texto` não tem título: deixar os dois
                 sempre visíveis dava um campo que aceita digitação e não
                 aparece em lugar nenhum, que é o jeito mais rápido de o
                 construtor parecer quebrado. */
              <>
                {block.type !== "paragraph" && (
                  <RichTextEditor
                    key={`${block.id}-title`}
                    label="Título"
                    value={block.titleRich}
                    fallbackText={block.title}
                    variables={availableVariables}
                    minHeight={68}
                    onChange={(doc, text) => onChange({ titleRich: doc, title: text })}
                  />
                )}
                {block.type !== "heading" && (
                  <RichTextEditor
                    key={`${block.id}-subtitle`}
                    label={block.type === "paragraph" ? "Texto" : "Subtítulo"}
                    value={block.subtitleRich}
                    fallbackText={block.subtitle}
                    variables={availableVariables}
                    minHeight={block.type === "paragraph" ? 120 : 68}
                    onChange={(doc, text) => onChange({ subtitleRich: doc, subtitle: text })}
                  />
                )}
              </>
            )}

            {(block.type === "short-text" ||
              block.type === "long-text" ||
              block.type === "email" ||
              block.type === "phone") && (
              <Field label="Placeholder">
                <Input
                  value={block.placeholder ?? ""}
                  onChange={(e) => onChange({ placeholder: e.target.value })}
                />
              </Field>
            )}

            {/* Máscara não vale em texto longo nem em e-mail: nenhum dos dois tem
            formato fixo, e uma máscara ali só atrapalharia a digitação. */}
            {(block.type === "short-text" || block.type === "phone") && (
              <>
                <Field label="Máscara">
                  <select
                    value={block.fieldMask ?? "livre"}
                    onChange={(e) =>
                      onChange({ fieldMask: e.target.value as NonNullable<QuizBlock["fieldMask"]> })
                    }
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  >
                    {MASCARAS.map((m) => (
                      <option key={m.valor} value={m.valor}>
                        {m.rotulo}
                        {m.exemplo ? ` — ${m.exemplo}` : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Limite de caracteres">
                  <Input
                    type="number"
                    value={block.maxLength ?? ""}
                    placeholder={String(tamanhoDaMascara(block.fieldMask) ?? "sem limite")}
                    onChange={(e) =>
                      onChange({
                        maxLength: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                  />
                </Field>
              </>
            )}

            {(block.type === "weight" || block.type === "height") && (
              <>
                <div className="grid grid-cols-3 gap-2.5">
                  <Field label="Mínimo">
                    <Input
                      type="number"
                      value={block.sliderMin ?? (block.type === "weight" ? 30 : 100)}
                      onChange={(e) => onChange({ sliderMin: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Máximo">
                    <Input
                      type="number"
                      value={block.sliderMax ?? (block.type === "weight" ? 200 : 250)}
                      onChange={(e) => onChange({ sliderMax: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label="Passo">
                    <Input
                      type="number"
                      min={1}
                      value={block.sliderStep ?? 1}
                      onChange={(e) =>
                        onChange({ sliderStep: Math.max(1, Number(e.target.value)) })
                      }
                    />
                  </Field>
                </div>
                <Field label="Valor inicial">
                  <Input
                    type="number"
                    value={block.sliderDefaultValue ?? (block.type === "weight" ? 70 : 170)}
                    onChange={(e) => onChange({ sliderDefaultValue: Number(e.target.value) })}
                  />
                </Field>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">Permitir troca de unidade</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      {block.type === "weight"
                        ? "Mostra o alternador kg / lb"
                        : "Mostra o alternador cm / pol"}
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
                  value={block.outputVariable ?? ""}
                  onChange={(e) =>
                    onChange({ outputVariable: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })
                  }
                  placeholder="ex.: peso"
                />
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {block.outputVariable ? (
                    <>
                      Use{" "}
                      <code className="rounded bg-muted px-1 py-0.5">{`{{${block.outputVariable}}}`}</code>{" "}
                      em qualquer texto do quiz, ou{" "}
                      <code className="rounded bg-muted px-1 py-0.5">{`{{calc(${block.outputVariable}...)}}`}</code>{" "}
                      numa fórmula.
                    </>
                  ) : (
                    "Dá um nome à resposta (só letras, números e _) pra usar em textos personalizados ou fórmulas de outras etapas."
                  )}
                </p>
              </Field>
            )}

            {ctaEligible && (
              <Field label="Texto do botão">
                <Input
                  value={block.ctaLabel ?? ""}
                  onChange={(e) => onChange({ ctaLabel: e.target.value })}
                />
              </Field>
            )}

            {block.type === "button" && (
              <Field label="Link do botão (URL)">
                <Input
                  value={block.ctaUrl ?? ""}
                  onChange={(e) => onChange({ ctaUrl: e.target.value })}
                  placeholder="deixe vazio para avançar a etapa"
                />
              </Field>
            )}

            {block.type === "result" && (
              <>
                <Field label="Link do botão (URL)">
                  <Input
                    value={block.ctaUrl ?? ""}
                    onChange={(e) => onChange({ ctaUrl: e.target.value })}
                    placeholder="https://exemplo.com/obrigado"
                  />
                </Field>
                <Field label="Etiqueta para lead quente (opcional)">
                  <Input
                    value={block.resultBadgeHot ?? ""}
                    onChange={(e) => onChange({ resultBadgeHot: e.target.value })}
                    placeholder="✨ Resultado pronto"
                  />
                </Field>
                <Field label="Etiqueta para lead morno (opcional)">
                  <Input
                    value={block.resultBadgeWarm ?? ""}
                    onChange={(e) => onChange({ resultBadgeWarm: e.target.value })}
                    placeholder="✨ Resultado pronto"
                  />
                </Field>
                <Field label="Etiqueta para lead frio (opcional)">
                  <Input
                    value={block.resultBadgeCold ?? ""}
                    onChange={(e) => onChange({ resultBadgeCold: e.target.value })}
                    placeholder="✨ Resultado pronto"
                  />
                </Field>
              </>
            )}

            {block.type === "multi-choice" && (
              <Field
                label={`Máximo de escolhas: ${block.maxSelections ? block.maxSelections : "sem limite"}`}
              >
                <Slider
                  min={0}
                  max={Math.max(3, (block.options ?? []).length)}
                  step={1}
                  value={[block.maxSelections ?? 0]}
                  onValueChange={([v]) => onChange({ maxSelections: v || undefined })}
                />
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Zero deixa sem limite. Com limite, as opções restantes ficam desabilitadas e o
                  quiz mostra quantas faltam — em vez de só prometer no texto.
                </p>
              </Field>
            )}

            {block.type === "rating" && (
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

            {block.type === "video" && (
              <Field label="Provedor">
                <Select
                  value={block.mediaProvider ?? "youtube"}
                  onValueChange={(v) =>
                    onChange({ mediaProvider: v as QuizBlock["mediaProvider"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="vimeo">Vimeo</SelectItem>
                    <SelectItem value="mp4">MP4 direto</SelectItem>
                    <SelectItem value="file">Upload</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            )}

            {block.type === "testimonial" && (
              <>
                <Field label="Autor">
                  <Input
                    value={block.testimonialAuthor ?? ""}
                    onChange={(e) => onChange({ testimonialAuthor: e.target.value })}
                  />
                </Field>
                <Field label="Cargo / Empresa">
                  <Input
                    value={block.testimonialRole ?? ""}
                    onChange={(e) => onChange({ testimonialRole: e.target.value })}
                  />
                </Field>
              </>
            )}

            {block.type === "countdown" && (
              <>
                <Field label={`Duração: ${block.countdownMinutes ?? 15} min`}>
                  <Slider
                    min={1}
                    max={120}
                    step={1}
                    value={[block.countdownMinutes ?? 15]}
                    onValueChange={([v]) =>
                      onChange({ countdownMinutes: v, countdownEndsAt: undefined })
                    }
                  />
                </Field>
                <Field label="Ou data/hora final (ISO)">
                  <Input
                    value={block.countdownEndsAt ?? ""}
                    onChange={(e) => onChange({ countdownEndsAt: e.target.value })}
                    placeholder="2026-12-31T23:59:00Z"
                  />
                </Field>
              </>
            )}

            {(block.type === "argument-progress" || block.type === "level") && (
              <Field label={`Progresso: ${block.progressValue ?? 50}%`}>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[block.progressValue ?? 50]}
                  onValueChange={([v]) => onChange({ progressValue: v })}
                />
              </Field>
            )}

            {block.type === "level" && (
              <>
                {/* Atalhos: mirar 25/50/75/100 no slider é chato e o número redondo
                é o que a maioria quer. */}
                <div className="grid grid-cols-4 gap-1.5">
                  {[25, 50, 75, 100].map((v) => (
                    <Button
                      key={v}
                      size="sm"
                      variant={block.progressValue === v ? "secondary" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => onChange({ progressValue: v })}
                    >
                      {v}%
                    </Button>
                  ))}
                </div>

                <Field label="Fórmula da porcentagem (opcional)">
                  <Input
                    value={block.meterFormula ?? ""}
                    onChange={(e) => onChange({ meterFormula: e.target.value })}
                    placeholder="Ex: {{calc(score*2)}}"
                  />
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Quando preenchida, substitui a porcentagem fixa acima — no canvas e no quiz
                    publicado. <code className="text-[11px]">score</code> é a pontuação acumulada;
                    variáveis de respostas anteriores também valem.
                  </p>
                </Field>

                <Field label="Texto do indicador">
                  <Input
                    value={block.levelLabel ?? ""}
                    onChange={(e) => onChange({ levelLabel: e.target.value })}
                    placeholder="Ex: Nível de insatisfação"
                  />
                </Field>

                <Field label="Legendas (separadas por vírgula)">
                  <Input
                    value={(block.meterCaptions ?? []).join(",")}
                    onChange={(e) =>
                      onChange({
                        // Guarda como lista pra renderização não precisar reparsear a
                        // cada quadro; o espaço em volta da vírgula é do digitador.
                        meterCaptions: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="Incomoda,Afeta autoestima,Evito praia"
                  />
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    Distribuídas embaixo da barra, da esquerda para a direita.
                  </p>
                </Field>
              </>
            )}

            {block.type === "loading" && (
              <>
                <Field label={`Duração: ${block.loadingSeconds ?? 3}s`}>
                  <Slider
                    min={1}
                    max={10}
                    step={1}
                    value={[block.loadingSeconds ?? 3]}
                    onValueChange={([v]) => onChange({ loadingSeconds: v })}
                  />
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

            {block.type === "faq" && (
              <Field label="Perguntas">
                <FaqEditor
                  items={block.faqItems ?? []}
                  onChange={(items) => onChange({ faqItems: items })}
                />
              </Field>
            )}

            {block.type === "form" && (
              <Field label="Campos exibidos">
                <div className="space-y-2">
                  {(
                    [
                      ["name", "Nome"],
                      ["email", "E-mail"],
                      ["phone", "Telefone"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={block.formFields?.[key] ?? true}
                        onCheckedChange={(checked) =>
                          onChange({
                            formFields: {
                              ...(block.formFields ?? { name: true, email: true, phone: true }),
                              [key]: Boolean(checked),
                            },
                          })
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </Field>
            )}

            {block.type === "pricing" && (
              <>
                <Field label="Moeda">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { v: undefined, r: "Texto" },
                        { v: "BRL", r: "R$" },
                        { v: "USD", r: "US$" },
                        { v: "EUR", r: "€" },
                      ] as const
                    ).map((o) => (
                      <Button
                        key={o.r}
                        type="button"
                        size="sm"
                        variant={block.pricingCurrency === o.v ? "default" : "outline"}
                        className="h-8 text-[11px]"
                        onClick={() => onChange({ pricingCurrency: o.v })}
                      >
                        {o.r}
                      </Button>
                    ))}
                  </div>
                </Field>
                {block.pricingCurrency ? (
                  <>
                    <Field label="Valor">
                      <Input
                        type="number"
                        step="0.01"
                        value={block.pricingAmount ?? ""}
                        onChange={(e) =>
                          onChange({
                            pricingAmount:
                              e.target.value === "" ? undefined : Number(e.target.value),
                          })
                        }
                        placeholder="97"
                      />
                    </Field>
                    <Field label="Prefixo">
                      <Input
                        value={block.pricingPrefix ?? ""}
                        onChange={(e) => onChange({ pricingPrefix: e.target.value })}
                        placeholder="a partir de"
                      />
                    </Field>
                    <Field label="Sufixo">
                      <Input
                        value={block.pricingSuffix ?? ""}
                        onChange={(e) => onChange({ pricingSuffix: e.target.value })}
                        placeholder="à vista"
                      />
                    </Field>
                  </>
                ) : (
                  <Field label="Preço">
                    <Input
                      value={block.pricingPrice ?? ""}
                      onChange={(e) => onChange({ pricingPrice: e.target.value })}
                      placeholder="R$ 97"
                    />
                  </Field>
                )}
                <Field label="Preço original (riscado)">
                  <Input
                    value={block.pricingOriginalPrice ?? ""}
                    onChange={(e) => onChange({ pricingOriginalPrice: e.target.value })}
                    placeholder="R$ 197"
                  />
                </Field>
                <Field label="Período">
                  <Input
                    value={block.pricingPeriod ?? ""}
                    onChange={(e) => onChange({ pricingPeriod: e.target.value })}
                    placeholder="/mês"
                  />
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

            {block.type === "spacer" && (
              <Field label={`Altura: ${block.spacerHeight ?? 32}px`}>
                <Slider
                  min={8}
                  max={160}
                  step={8}
                  value={[block.spacerHeight ?? 32]}
                  onValueChange={([v]) => onChange({ spacerHeight: v })}
                />
              </Field>
            )}

            {block.type === "container" && (
              <ContainerLayoutFields block={block} onChange={onChange} />
            )}

            {block.type === "reveal" && (
              <>
                <Field label="Texto do botão de revelar">
                  <Input
                    value={block.revealLabel ?? ""}
                    onChange={(e) => onChange({ revealLabel: e.target.value })}
                  />
                </Field>
                <Field label="Título revelado">
                  <Input
                    value={block.revealedTitle ?? ""}
                    onChange={(e) => onChange({ revealedTitle: e.target.value })}
                  />
                </Field>
                <Field label="Texto revelado">
                  <Textarea
                    rows={2}
                    value={block.revealedBody ?? ""}
                    onChange={(e) => onChange({ revealedBody: e.target.value })}
                  />
                </Field>
              </>
            )}

            {block.type === "ios-notification" && (
              <>
                <Field label="Nome do app">
                  <Input
                    value={block.notificationApp ?? ""}
                    onChange={(e) => onChange({ notificationApp: e.target.value })}
                  />
                </Field>
                <Field label="Horário exibido">
                  <Input
                    value={block.notificationTime ?? ""}
                    onChange={(e) => onChange({ notificationTime: e.target.value })}
                    placeholder="agora"
                  />
                </Field>
              </>
            )}

            {block.type === "audio-call" && (
              <Field label="Duração exibida">
                <Input
                  value={block.audioCallDuration ?? ""}
                  onChange={(e) => onChange({ audioCallDuration: e.target.value })}
                  placeholder="00:12"
                />
              </Field>
            )}

            {block.type === "comparison" && (
              <>
                <Field label="Rótulo (esquerda)">
                  <Input
                    value={block.comparisonLeftLabel ?? ""}
                    onChange={(e) => onChange({ comparisonLeftLabel: e.target.value })}
                  />
                </Field>
                <Field label="Itens (esquerda)">
                  <StringListEditor
                    items={block.comparisonLeftItems ?? []}
                    onChange={(items) => onChange({ comparisonLeftItems: items })}
                    addLabel="Adicionar item"
                  />
                </Field>
                <Field label="Rótulo (direita)">
                  <Input
                    value={block.comparisonRightLabel ?? ""}
                    onChange={(e) => onChange({ comparisonRightLabel: e.target.value })}
                  />
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

            {(block.type === "grid" || block.type === "cards") && (
              <>
                <Field label="Colunas">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([2, 3, 4] as const).map((n) => (
                      <Button
                        key={n}
                        type="button"
                        size="sm"
                        variant={(block.colunas ?? 2) === n ? "default" : "outline"}
                        className="h-8 text-[11px]"
                        onClick={() => onChange({ colunas: n })}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                  {(block.colunas ?? 2) > 2 && (
                    <p className="text-[11px] text-muted-foreground">
                      No celular cai para 2 — em 448px, quatro itens dariam 100px cada.
                    </p>
                  )}
                </Field>
                <Field label="Itens">
                  <ItensEditor
                    itens={block.itens ?? []}
                    comTexto={block.type === "cards"}
                    onChange={(itens) => onChange({ itens })}
                  />
                </Field>
              </>
            )}

            {block.type === "indicator" && (
              <>
                <Field label="Texto">
                  <Input
                    value={block.textoDoIndicador ?? ""}
                    onChange={(e) => onChange({ textoDoIndicador: e.target.value })}
                    placeholder="Você está aqui"
                  />
                </Field>
                <Field label="Emoji (opcional)">
                  <Input
                    value={block.emoji ?? ""}
                    onChange={(e) => onChange({ emoji: e.target.value })}
                    placeholder="📍"
                  />
                </Field>
              </>
            )}

            {block.type === "arrow" && (
              <>
                <Field label="Direção">
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        { v: "baixo", r: "↓" },
                        { v: "cima", r: "↑" },
                        { v: "esquerda", r: "←" },
                        { v: "direita", r: "→" },
                      ] as const
                    ).map((o) => (
                      <Button
                        key={o.v}
                        type="button"
                        size="sm"
                        variant={(block.direcaoDaSeta ?? "baixo") === o.v ? "default" : "outline"}
                        className="h-8 text-sm"
                        onClick={() => onChange({ direcaoDaSeta: o.v })}
                      >
                        {o.r}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field label="Tamanho (px)">
                  <Input
                    type="number"
                    value={block.tamanhoDoSimbolo ?? 32}
                    onChange={(e) => onChange({ tamanhoDoSimbolo: Number(e.target.value) || 32 })}
                  />
                </Field>
              </>
            )}

            {block.type === "emoji" && (
              <>
                <Field label="Emoji">
                  <Input
                    value={block.emoji ?? ""}
                    onChange={(e) => onChange({ emoji: e.target.value })}
                    placeholder="🎯"
                  />
                </Field>
                <Field label="Tamanho (px)">
                  <Input
                    type="number"
                    value={block.tamanhoDoSimbolo ?? 56}
                    onChange={(e) => onChange({ tamanhoDoSimbolo: Number(e.target.value) || 56 })}
                  />
                </Field>
              </>
            )}

            {block.type === "brand" && (
              <>
                <Field label="Logo">
                  <MediaUploader
                    quizId={quizId}
                    accept="image"
                    value={block.marcaUrl}
                    onChange={(url) => onChange({ marcaUrl: url || undefined })}
                    compact
                  />
                </Field>
                <Field label="Largura (px)">
                  <Input
                    type="number"
                    value={block.marcaLargura ?? 140}
                    onChange={(e) => onChange({ marcaLargura: Number(e.target.value) || 140 })}
                  />
                </Field>
                <Field label="Link ao clicar (opcional)">
                  <Input
                    value={block.marcaLink ?? ""}
                    onChange={(e) => onChange({ marcaLink: e.target.value || undefined })}
                    placeholder="https://"
                  />
                </Field>
              </>
            )}

            {block.type === "social" && (
              <Field label="Redes">
                <RedesEditor redes={block.redes ?? []} onChange={(redes) => onChange({ redes })} />
              </Field>
            )}

            {block.type === "summary" && (
              <p className="text-[11px] text-muted-foreground">
                Repete as perguntas já respondidas, com o rótulo da opção escolhida. Formulário e
                agendamento ficam de fora — eles têm tela própria. Sem nenhuma resposta ainda, o
                bloco não aparece.
              </p>
            )}

            {block.type === "chart" && (
              <>
                <Field label="Tipo de gráfico">
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { v: "bar", r: "Barra" },
                        { v: "line", r: "Linha" },
                        { v: "area", r: "Área" },
                        { v: "pie", r: "Pizza" },
                        { v: "radial", r: "Radial" },
                      ] as const
                    ).map((o) => (
                      <Button
                        key={o.v}
                        type="button"
                        size="sm"
                        variant={(block.chartType ?? "bar") === o.v ? "default" : "outline"}
                        className="h-8 text-[11px]"
                        onClick={() => onChange({ chartType: o.v })}
                      >
                        {o.r}
                      </Button>
                    ))}
                  </div>
                </Field>
                <Field label="Dados do gráfico">
                  <ChartDataEditor
                    items={block.chartData ?? []}
                    onChange={(items) => onChange({ chartData: items })}
                  />
                </Field>
                {/* Pizza e radial não têm eixo nem grade: oferecer os controles ali
                deixaria o usuário mexendo em algo que não muda nada na tela. */}
                {block.chartType !== "pie" && block.chartType !== "radial" && (
                  <>
                    <Toggle
                      label="Mostrar eixo X"
                      hint="Rótulos embaixo do gráfico"
                      checked={block.chartShowX !== false}
                      onChange={(v) => onChange({ chartShowX: v })}
                    />
                    <Toggle
                      label="Mostrar eixo Y"
                      hint="Escala numérica à esquerda"
                      checked={block.chartShowY !== false}
                      onChange={(v) => onChange({ chartShowY: v })}
                    />
                    <Toggle
                      label="Mostrar grade"
                      hint="Linhas de fundo para ler o valor"
                      checked={block.chartShowGrid !== false}
                      onChange={(v) => onChange({ chartShowGrid: v })}
                    />
                  </>
                )}
                <Toggle
                  label="Mostrar legenda"
                  hint="Nome de cada série abaixo do gráfico"
                  checked={block.chartShowLegend === true}
                  onChange={(v) => onChange({ chartShowLegend: v })}
                />
                <Field label="Altura (px)">
                  <Input
                    type="number"
                    value={block.chartHeight ?? 220}
                    onChange={(e) => onChange({ chartHeight: Number(e.target.value) || 220 })}
                  />
                </Field>
              </>
            )}

            {block.type === "scheduling" && (
              <>
                <Toggle
                  label="Permitir intervalo"
                  hint="Data de início e fim, em vez de um dia só"
                  checked={block.schedulingAllowRange === true}
                  onChange={(v) => onChange({ schedulingAllowRange: v })}
                />
                <Toggle
                  label="Permitir seleção de horário"
                  hint="Além do dia, o lead escolhe a hora"
                  checked={block.schedulingAllowTime !== false}
                  onChange={(v) => onChange({ schedulingAllowTime: v })}
                />
                <Toggle
                  label="Bloquear datas passadas"
                  hint="Impede marcar um dia que já passou"
                  checked={block.schedulingBlockPast !== false}
                  onChange={(v) => onChange({ schedulingBlockPast: v })}
                />
                <Field label="Dias da semana atendidos">
                  <div className="grid grid-cols-7 gap-1">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((letra, dia) => {
                      const atuais = block.schedulingWeekdays ?? [];
                      const ativo = atuais.length === 0 || atuais.includes(dia);
                      return (
                        <Button
                          key={dia}
                          type="button"
                          size="sm"
                          variant={ativo ? "default" : "outline"}
                          className="h-8 px-0 text-[11px]"
                          onClick={() => {
                            const base = atuais.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : atuais;
                            const prox = base.includes(dia)
                              ? base.filter((d) => d !== dia)
                              : [...base, dia].sort();
                            onChange({ schedulingWeekdays: prox });
                          }}
                        >
                          {letra}
                        </Button>
                      );
                    })}
                  </div>
                </Field>
                {block.schedulingAllowTime !== false && (
                  <>
                    <Field label="Horário de início">
                      <Input
                        type="time"
                        value={block.schedulingTimeStart ?? "09:00"}
                        onChange={(e) => onChange({ schedulingTimeStart: e.target.value })}
                      />
                    </Field>
                    <Field label="Horário de fim">
                      <Input
                        type="time"
                        value={block.schedulingTimeEnd ?? "18:00"}
                        onChange={(e) => onChange({ schedulingTimeEnd: e.target.value })}
                      />
                    </Field>
                    <Field label="Intervalo entre horários (min)">
                      <Input
                        type="number"
                        value={block.schedulingSlotMinutes ?? 30}
                        onChange={(e) =>
                          onChange({ schedulingSlotMinutes: Number(e.target.value) || 30 })
                        }
                      />
                    </Field>
                  </>
                )}
              </>
            )}

            {block.type === "custom" && (
              <Field label="HTML customizado">
                <Textarea
                  rows={10}
                  className="font-mono text-xs"
                  value={block.customHtml ?? ""}
                  onChange={(e) => onChange({ customHtml: e.target.value })}
                />
              </Field>
            )}
          </Section>

          {hasMedia && (
            <Section title="Mídia" icon={ImageIcon}>
              {block.type === "intro" && (
                <Field label="Imagem de capa">
                  <MediaUploader
                    quizId={quizId}
                    accept="image"
                    value={block.imageUrl}
                    onChange={(url) => onChange({ imageUrl: url })}
                  />
                </Field>
              )}
              {block.type === "image" && (
                <Field label="Imagem">
                  <MediaUploader
                    quizId={quizId}
                    accept="image"
                    value={block.mediaUrl}
                    onChange={(url) => onChange({ mediaUrl: url })}
                  />
                </Field>
              )}
              {block.type === "audio" && (
                <Field label="Áudio">
                  <MediaUploader
                    quizId={quizId}
                    accept="audio"
                    value={block.mediaUrl}
                    onChange={(url) => onChange({ mediaUrl: url })}
                  />
                </Field>
              )}
              {block.type === "video" && (
                <Field
                  label={
                    block.mediaProvider === "file" || block.mediaProvider === "mp4"
                      ? "Vídeo"
                      : "URL do vídeo"
                  }
                >
                  {block.mediaProvider === "file" ? (
                    <MediaUploader
                      quizId={quizId}
                      accept="video"
                      value={block.mediaUrl}
                      onChange={(url) => onChange({ mediaUrl: url })}
                    />
                  ) : (
                    <Input
                      value={block.mediaUrl ?? ""}
                      onChange={(e) => onChange({ mediaUrl: e.target.value })}
                      placeholder="https://..."
                    />
                  )}
                </Field>
              )}
              {block.type === "before-after" && (
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
              {block.type === "testimonial" && (
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
              {block.type === "audio-call" && (
                <Field label="Avatar do contato">
                  <MediaUploader
                    quizId={quizId}
                    accept="image"
                    value={block.imageUrl}
                    onChange={(url) => onChange({ imageUrl: url })}
                    compact
                  />
                </Field>
              )}
              {block.type === "carousel" && (
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

          {block.type === "container" && (
            <ContainerChildrenSection
              block={block}
              allBlocks={allBlocks}
              allSteps={allSteps}
              onMoveBlockIntoContainer={onMoveBlockIntoContainer}
              onRemoveChildFromContainer={onRemoveChildFromContainer}
              onReorderContainerChildren={onReorderContainerChildren}
              onAddChildToContainer={onAddChildToContainer}
              onDeleteChildBlock={onDeleteChildBlock}
              onSelectBlock={onSelectBlock}
            />
          )}

          {hasOptions && (
            <Section title="Opções" icon={ListChecks} count={(block.options ?? []).length}>
              {/* O id do droppable carrega o escopo porque o inspetor é montado DUAS
              vezes (coluna do desktop + gaveta do celular). Dois droppables com
              o mesmo id no mesmo contexto quebram a biblioteca de arraste. */}
              <Droppable droppableId={`options-${dndScope}`}>
                {(dropProvided) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className="space-y-2"
                  >
                    {(block.options ?? []).map((opt, i) => (
                      <Draggable key={opt.id} draggableId={`opt-${opt.id}`} index={i}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={
                              dragSnapshot.isDragging
                                ? "rounded-lg shadow-lg ring-2 ring-[var(--selecao-anel)]"
                                : ""
                            }
                          >
                            <OptionEditor
                              quizId={quizId}
                              option={opt}
                              blockType={block.type}
                              allBlocks={allBlocks}
                              currentBlockId={block.id}
                              dragHandleProps={dragProvided.dragHandleProps}
                              onUpdate={(patch) => {
                                const next = [...(block.options ?? [])];
                                next[i] = { ...opt, ...patch };
                                onChange({ options: next });
                              }}
                              onDuplicate={() => {
                                const next = [...(block.options ?? [])];
                                // Entra logo abaixo da original — é onde a pessoa
                                // está olhando, e mantém a ordem previsível.
                                next.splice(i + 1, 0, { ...opt, id: crypto.randomUUID() });
                                onChange({ options: next });
                              }}
                              onDelete={() => {
                                const next = (block.options ?? []).filter((o) => o.id !== opt.id);
                                onChange({ options: next });
                              }}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {dropProvided.placeholder}
                  </div>
                )}
              </Droppable>
              <Button
                size="sm"
                variant="outline"
                className="w-full gap-2"
                onClick={() =>
                  onChange({
                    options: [
                      ...(block.options ?? []),
                      {
                        id: crypto.randomUUID(),
                        label: `Opção ${(block.options?.length ?? 0) + 1}`,
                      },
                    ],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar opção
              </Button>
            </Section>
          )}

          {hasOptions && (
            <Section title="Comportamento" icon={SlidersHorizontal}>
              <Toggle
                label="Múltipla escolha"
                hint="Permite marcar mais de uma opção"
                checked={block.type === "multi-choice"}
                onChange={(v) => onChange({ type: v ? "multi-choice" : "single-choice" })}
              />
              <Toggle
                label="Obrigatório"
                hint="Só avança depois de escolher"
                checked={block.required === true}
                onChange={(v) => onChange({ required: v })}
              />
              {block.type === "single-choice" && (
                <Toggle
                  label="Autoavançar"
                  hint="Clicar na opção já passa para a próxima etapa"
                  checked={block.autoAdvance !== false}
                  onChange={(v) => onChange({ autoAdvance: v })}
                />
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Disposição</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(
                    [
                      { v: "lista", r: "Lista" },
                      { v: "grade-2", r: "2 col" },
                      { v: "grade-3", r: "3 col" },
                      { v: "grade-4", r: "4 col" },
                    ] as const
                  ).map((o) => (
                    <Button
                      key={o.v}
                      type="button"
                      size="sm"
                      variant={(block.optionsLayout ?? "lista") === o.v ? "default" : "outline"}
                      className="h-8 px-1 text-[11px]"
                      onClick={() => onChange({ optionsLayout: o.v })}
                    >
                      {o.r}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Formato da opção</Label>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      { v: "linha", r: "Linha" },
                      { v: "cartao", r: "Cartão com foto" },
                    ] as const
                  ).map((o) => (
                    <Button
                      key={o.v}
                      type="button"
                      size="sm"
                      variant={(block.optionCardStyle ?? "linha") === o.v ? "default" : "outline"}
                      className="h-8 text-[11px]"
                      onClick={() => onChange({ optionCardStyle: o.v })}
                    >
                      {o.r}
                    </Button>
                  ))}
                </div>
                {block.optionCardStyle === "cartao" &&
                  !(block.options ?? []).every((o) => o.imageUrl) && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Opção sem imagem continua aparecendo como linha — o cartão precisa da foto.
                    </p>
                  )}
              </div>
            </Section>
          )}

          <ShowIfSection block={block} allBlocks={allBlocks} onChange={onChange} />

          <CoresDoBlocoSection
            block={block}
            allBlocks={allBlocks}
            design={design}
            onChange={onChange}
          />

          <PosicaoSection block={block} onChange={onChange} />

          <Section title="Script no clique" icon={Code2}>
            <Textarea
              value={block.onClickScript ?? ""}
              onChange={(e) => onChange({ onClickScript: e.target.value || undefined })}
              rows={3}
              placeholder={
                "// roda ao clicar neste bloco\n// disponíveis: bloco, resposta\nwindow.dataLayer?.push({ event: 'quiz_clique', id: bloco.id });"
              }
              className="font-mono text-[11px]"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Roda também no preview, para você poder testar sem publicar. Um erro aqui é registrado
              no console e não derruba o funil do visitante.
            </p>
          </Section>

          <LogicRulesSection block={block} allBlocks={allBlocks} onChange={onChange} />

          {block.type !== "result" && (
            <AbTestSection quizId={quizId} block={block} onChange={onChange} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Patch parcial do estilo do bloco, preservando o que já estava configurado. */
function patchStyle(block: QuizBlock, patch: Partial<BlockStyle>): Partial<QuizBlock> {
  return { blockStyle: { ...(block.blockStyle ?? {}), ...patch } };
}

/**
 * Tipografia de UM elemento do bloco (título, subtítulo, opções, botão).
 *
 * Recolhido por padrão: são quatro grupos, e deixá-los abertos empurraria
 * Borda e Espaçamento para fora da vista. O ponto colorido no cabeçalho conta
 * quais têm ajuste sem precisar abrir um por um.
 */
function TextSlotFields({
  block,
  slot,
  label,
  onChange,
}: {
  block: QuizBlock;
  slot: TextSlot;
  label: string;
  onChange: (patch: Partial<QuizBlock>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual: TextStyle = block.blockStyle?.[slot] ?? {};
  const configurado = hasTextStyle(block, slot);

  const patch = (p: Partial<TextStyle>) => {
    const proximo = { ...atual, ...p };
    // Chave sem valor sai do objeto: um `undefined` gravado no schema vira
    // "definido como nada" e trava a herança do tema depois.
    for (const k of Object.keys(proximo) as (keyof TextStyle)[]) {
      if (proximo[k] === undefined || proximo[k] === "") delete proximo[k];
    }
    onChange(patchStyle(block, { [slot]: Object.keys(proximo).length ? proximo : undefined }));
  };

  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
      >
        {aberto ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="text-xs font-medium">{label}</span>
        {configurado && (
          <span
            aria-label="tem ajuste próprio"
            className="ml-auto h-1.5 w-1.5 rounded-full bg-foreground/40"
          />
        )}
      </button>

      {aberto && (
        <div className="space-y-3 border-t px-2.5 py-3">
          <Field label="Fonte">
            <Select
              value={atual.fontFamily ?? "__herda__"}
              onValueChange={(v) => patch({ fontFamily: v === "__herda__" ? undefined : v })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__herda__">Herdar do bloco</SelectItem>
                {BLOCK_FONTS.map((f) => (
                  <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <PxField
            label="Tamanho"
            value={atual.fontSize}
            onChange={(v) => patch({ fontSize: v })}
            placeholder="herda"
            max={96}
          />

          <Field label="Peso">
            <Select
              value={atual.weight ? String(atual.weight) : "__herda__"}
              onValueChange={(v) => patch({ weight: v === "__herda__" ? undefined : Number(v) })}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__herda__">Herdar do bloco</SelectItem>
                <SelectItem value="400">Normal</SelectItem>
                <SelectItem value="500">Médio</SelectItem>
                <SelectItem value="600">Semibold</SelectItem>
                <SelectItem value="700">Bold</SelectItem>
                <SelectItem value="800">Extra bold</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {atual.color ? (
            <ColorField label="Cor" value={atual.color} onChange={(v) => patch({ color: v })} />
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-full text-xs"
              onClick={() => patch({ color: "#111827" })}
            >
              Definir cor própria
            </Button>
          )}

          {configurado && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={() => onChange(patchStyle(block, { [slot]: undefined }))}
            >
              Voltar ao padrão
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Campo numérico em px que aceita ficar VAZIO — vazio = "não mexe nisso". */
function PxField({
  label,
  value,
  onChange,
  placeholder = "automático",
  max = 400,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  max?: number;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          min={0}
          max={max}
          value={value ?? ""}
          placeholder={placeholder}
          onChange={(e) => {
            const raw = e.target.value;
            // String vazia vira `undefined`, não 0: são coisas diferentes —
            // "sem margem definida" herda o layout, "margem 0" força colado.
            onChange(raw === "" ? undefined : Math.max(0, Math.min(max, Number(raw))));
          }}
          className="h-8"
        />
        <span className="shrink-0 text-[11px] text-muted-foreground">px</span>
      </div>
    </Field>
  );
}

function LayoutTab({
  block,
  onChange,
}: {
  block: QuizBlock;
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const s = block.blockStyle ?? {};
  return (
    <>
      <Section title="Espaçamento" icon={Rows3} first>
        <div className="grid grid-cols-2 gap-2.5">
          <PxField
            label="Acima"
            value={s.marginTop}
            onChange={(v) => onChange(patchStyle(block, { marginTop: v }))}
            placeholder="0"
          />
          <PxField
            label="Abaixo"
            value={s.marginBottom}
            onChange={(v) => onChange(patchStyle(block, { marginBottom: v }))}
            placeholder="0"
          />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <PxField
            label="Interno lateral"
            value={s.paddingX}
            onChange={(v) => onChange(patchStyle(block, { paddingX: v }))}
            placeholder="0"
            max={120}
          />
          <PxField
            label="Interno vertical"
            value={s.paddingY}
            onChange={(v) => onChange(patchStyle(block, { paddingY: v }))}
            placeholder="0"
            max={120}
          />
        </div>
      </Section>

      <Section title="Largura e alinhamento" icon={AlignCenterIcon}>
        <PxField
          label="Largura máxima"
          value={s.maxWidth}
          onChange={(v) => onChange(patchStyle(block, { maxWidth: v }))}
          placeholder="ocupa tudo"
          max={1200}
        />
        <Field label="Alinhamento">
          <div className="grid grid-cols-3 gap-1.5">
            {(["left", "center", "right"] as const).map((a) => (
              <Button
                key={a}
                size="sm"
                variant={s.align === a ? "secondary" : "outline"}
                className="h-8 text-xs"
                onClick={() =>
                  onChange(patchStyle(block, { align: s.align === a ? undefined : a }))
                }
              >
                {a === "left" ? "Esquerda" : a === "center" ? "Centro" : "Direita"}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Alinha o conteúdo. Para mover o bloco em si, defina também uma largura máxima.
          </p>
        </Field>
      </Section>
    </>
  );
}

function AparenciaTab({
  block,
  onChange,
}: {
  block: QuizBlock;
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const s = block.blockStyle ?? {};
  const limpar = (campo: keyof BlockStyle) => onChange(patchStyle(block, { [campo]: undefined }));

  return (
    <>
      <Section title="Cores" icon={Palette} first>
        <ColorField
          label="Fundo do bloco"
          value={s.background ?? "#ffffff"}
          onChange={(v) => onChange(patchStyle(block, { background: v }))}
        />
        <ColorField
          label="Cor do texto"
          value={s.textColor ?? "#111827"}
          onChange={(v) => onChange(patchStyle(block, { textColor: v }))}
        />
        {/* Sem isto não há volta: escolher uma cor uma vez prenderia o bloco a
            ela pra sempre, mesmo trocando o tema do quiz. */}
        {(s.background || s.textColor) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs text-muted-foreground"
            onClick={() =>
              onChange(patchStyle(block, { background: undefined, textColor: undefined }))
            }
          >
            Voltar às cores do tema
          </Button>
        )}
      </Section>

      <Section title="Tipografia" icon={Baseline}>
        <Field label="Fonte">
          <Select
            value={s.fontFamily ?? "__tema__"}
            onValueChange={(v) =>
              onChange(patchStyle(block, { fontFamily: v === "__tema__" ? undefined : v }))
            }
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__tema__">Do tema do quiz</SelectItem>
              {BLOCK_FONTS.map((f) => (
                <SelectItem key={f} value={f} style={{ fontFamily: f }}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Vale como padrão deste bloco. Para o quiz inteiro, use o painel de Design.
          </p>
        </Field>
        <PxField
          label="Tamanho do texto"
          value={s.fontSize}
          onChange={(v) => onChange(patchStyle(block, { fontSize: v }))}
          placeholder="do tema"
          max={72}
        />

        <div className="space-y-2 pt-1">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Ajuste elemento por elemento. O que estiver em branco segue o bloco.
          </p>
          {TEXT_SLOTS.map((slot) => (
            <TextSlotFields
              key={slot.key}
              block={block}
              slot={slot.key}
              label={slot.label}
              onChange={onChange}
            />
          ))}
        </div>
      </Section>

      <Section title="Borda" icon={SlidersHorizontal}>
        <PxField
          label="Espessura"
          value={s.borderWidth}
          onChange={(v) => onChange(patchStyle(block, { borderWidth: v }))}
          placeholder="sem borda"
          max={12}
        />
        {!!s.borderWidth && (
          <ColorField
            label="Cor da borda"
            value={s.borderColor ?? "#e5e7eb"}
            onChange={(v) => onChange(patchStyle(block, { borderColor: v }))}
          />
        )}
        <PxField
          label="Cantos arredondados"
          value={s.radius}
          onChange={(v) => onChange(patchStyle(block, { radius: v }))}
          placeholder="do tema"
          max={64}
        />
        {s.borderWidth !== undefined && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-full text-xs text-muted-foreground"
            onClick={() => limpar("borderWidth")}
          >
            Remover borda
          </Button>
        )}
      </Section>
    </>
  );
}

// Tipos de bloco cuja resposta pode alimentar uma condição de exibição.
const ANSWERABLE_TYPES = new Set([
  "single-choice",
  "multi-choice",
  "rating",
  "short-text",
  "long-text",
  "email",
  "phone",
  "weight",
  "height",
]);

function stepLabelFor(allBlocks: QuizBlock[], blockIds: string[], index: number): string {
  const first = allBlocks.find((b) => b.id === blockIds[0]);
  const def = first ? BLOCK_LIBRARY.find((d) => d.type === first.type) : undefined;
  const title = first?.title || first?.resultTitle || def?.label || "";
  return `Etapa ${index + 1}${title ? ` · ${title}` : ""}`;
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
      <Select value={value ?? "flow"} onValueChange={(v) => onSelect(v === "flow" ? undefined : v)}>
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

// Gestão dos componentes-filhos de um Container (Funilix parity): como o Builder
// não tem drag-and-drop pra dentro de um bloco aninhado, a composição é feita por
// aqui — adicionar um componente novo direto dentro, mover um bloco que já existe
// na mesma etapa pra dentro, reordenar e remover (sem excluir) ou excluir de vez.
function ContainerChildrenSection({
  block,
  allBlocks,
  allSteps,
  onMoveBlockIntoContainer,
  onRemoveChildFromContainer,
  onReorderContainerChildren,
  onAddChildToContainer,
  onDeleteChildBlock,
  onSelectBlock,
}: {
  block: QuizBlock;
  allBlocks: QuizBlock[];
  allSteps: QuizStep[];
  onMoveBlockIntoContainer?: (blockId: string, containerId: string) => void;
  onRemoveChildFromContainer?: (blockId: string, containerId: string) => void;
  onReorderContainerChildren?: (containerId: string, fromIndex: number, toIndex: number) => void;
  onAddChildToContainer?: (containerId: string, defIndex: number) => void;
  onDeleteChildBlock?: (blockId: string) => void;
  onSelectBlock?: (blockId: string) => void;
}) {
  const childIds = block.childBlockIds ?? [];
  const children = childIds
    .map((id) => allBlocks.find((b) => b.id === id))
    .filter((b): b is QuizBlock => !!b);

  const ownerStep = allSteps.find((s) => s.blockIds.includes(block.id));
  const siblingOptions = (ownerStep?.blockIds ?? [])
    .filter((id) => id !== block.id)
    .map((id) => allBlocks.find((b) => b.id === id))
    .filter((b): b is QuizBlock => !!b);

  const addableDefs = BLOCK_LIBRARY.filter((d) => d.type !== "container");

  return (
    <Section title="Componentes dentro" icon={LayoutGrid}>
      {children.length === 0 && (
        <p className="text-xs text-muted-foreground leading-snug">
          Container vazio. Adicione um componente novo ou mova um que já existe nesta etapa pra
          dentro dele.
        </p>
      )}
      <div className="space-y-1.5">
        {children.map((child, i) => {
          const def = BLOCK_LIBRARY.find((d) => d.type === child.type);
          return (
            <div key={child.id} className="flex items-center gap-1.5 rounded-lg border p-1.5">
              <button
                type="button"
                onClick={() => onSelectBlock?.(child.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground"
                title="Editar este componente"
              >
                {def && <def.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate text-xs">
                  {child.title || child.resultTitle || def?.label || child.type}
                </span>
              </button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                disabled={i === 0}
                aria-label="Mover para cima"
                onClick={() => onReorderContainerChildren?.(block.id, i, i - 1)}
              >
                <ChevronRight className="h-3 w-3 -rotate-90" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                disabled={i === children.length - 1}
                aria-label="Mover para baixo"
                onClick={() => onReorderContainerChildren?.(block.id, i, i + 1)}
              >
                <ChevronRight className="h-3 w-3 rotate-90" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                aria-label="Tirar do container (vira etapa própria)"
                title="Tirar do container"
                onClick={() => onRemoveChildFromContainer?.(child.id, block.id)}
              >
                <CornerDownRight className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                aria-label="Excluir componente"
                onClick={() => onDeleteChildBlock?.(child.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          );
        })}
      </div>

      <Field label="Adicionar componente novo">
        <Select onValueChange={(v) => onAddChildToContainer?.(block.id, Number(v))}>
          <SelectTrigger>
            <SelectValue placeholder="Escolher tipo…" />
          </SelectTrigger>
          <SelectContent>
            {addableDefs.map((d) => (
              <SelectItem key={d.type} value={String(BLOCK_LIBRARY.indexOf(d))}>
                {d.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {siblingOptions.length > 0 && (
        <Field label="Mover bloco existente pra dentro">
          <Select onValueChange={(v) => onMoveBlockIntoContainer?.(v, block.id)}>
            <SelectTrigger>
              <SelectValue placeholder="Escolher bloco desta etapa…" />
            </SelectTrigger>
            <SelectContent>
              {siblingOptions.map((b) => {
                const def = BLOCK_LIBRARY.find((d) => d.type === b.type);
                return (
                  <SelectItem key={b.id} value={b.id}>
                    {b.title || b.resultTitle || def?.label || b.type}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </Field>
      )}
    </Section>
  );
}

// Layout responsivo do Container (Funilix parity): Mobile é a base ("padrão"),
// Tablet/Desktop só herdam o que não foi customizado — troca de aba não perde o
// que já foi editado nas outras. `resolveContainerLayout` calcula os valores
// efetivos (já com a herança aplicada) pra sempre mostrar chips preenchidos,
// nunca um estado "vazio" mesmo quando a etapa herda tudo do Mobile.
function ContainerLayoutFields({
  block,
  onChange,
}: {
  block: QuizBlock;
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const [bp, setBp] = useState<Breakpoint>("mobile");
  const layout = resolveContainerLayout(block, bp);
  const hasOverride =
    bp !== "mobile" && !!(bp === "tablet" ? block.containerTablet : block.containerDesktop);

  function set(patch: Partial<ResolvedContainerLayout>) {
    if (bp === "mobile") {
      const map: Record<string, keyof QuizBlock> = {
        layoutMode: "containerLayoutMode",
        columns: "containerColumns",
        gap: "containerGap",
        align: "containerAlign",
        justify: "containerJustify",
      };
      const mapped: Partial<QuizBlock> = {};
      for (const [k, v] of Object.entries(patch)) mapped[map[k]] = v as never;
      onChange(mapped);
      return;
    }
    const key = bp === "tablet" ? "containerTablet" : "containerDesktop";
    onChange({ [key]: { ...(block[key] ?? {}), ...patch } });
  }

  function resetOverride() {
    const key = bp === "tablet" ? "containerTablet" : "containerDesktop";
    onChange({ [key]: undefined });
  }

  return (
    <>
      <Field label="Layout responsivo">
        <div className="grid grid-cols-3 gap-1.5">
          {(["mobile", "tablet", "desktop"] as const).map((b) => (
            <button key={b} type="button" className={miniChip(bp === b)} onClick={() => setBp(b)}>
              {BREAKPOINT_LABELS[b]}
            </button>
          ))}
        </div>
        {bp !== "mobile" && (
          <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
            {hasOverride ? (
              <>
                Personalizado pra {BREAKPOINT_LABELS[bp]}.{" "}
                <button
                  type="button"
                  onClick={resetOverride}
                  className="underline hover:text-foreground"
                >
                  Redefinir (herdar)
                </button>
              </>
            ) : (
              <>
                Herdando de {bp === "tablet" ? "Mobile" : "Tablet"} — mude um valor abaixo pra
                personalizar só {BREAKPOINT_LABELS[bp]}.
              </>
            )}
          </p>
        )}
      </Field>

      <Field label="Modo de layout">
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            className={miniChip(layout.layoutMode !== "grid")}
            onClick={() => set({ layoutMode: "flex" })}
          >
            Flex
          </button>
          <button
            type="button"
            className={miniChip(layout.layoutMode === "grid")}
            onClick={() => set({ layoutMode: "grid" })}
          >
            Grid
          </button>
        </div>
      </Field>
      {layout.layoutMode === "grid" && (
        <Field label="Colunas">
          <div className="grid grid-cols-5 gap-1.5">
            {[1, 2, 3, 4, 6].map((n) => (
              <button
                key={n}
                type="button"
                className={miniChip(layout.columns === n)}
                onClick={() => set({ columns: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="Espaçamento">
        <div className="grid grid-cols-6 gap-1.5">
          {[8, 12, 16, 24, 32, 40].map((n) => (
            <button
              key={n}
              type="button"
              className={miniChip(layout.gap === n)}
              onClick={() => set({ gap: n })}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Alinhamento (vertical)">
        <div className="grid grid-cols-4 gap-1.5">
          {(["start", "center", "end", "stretch"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={miniChip(layout.align === v)}
              onClick={() => set({ align: v })}
            >
              {ALIGN_LABELS[v]}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Justificação (horizontal)">
        <div className="grid grid-cols-4 gap-1.5">
          {(["start", "center", "end", "stretch"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={miniChip(layout.justify === v)}
              onClick={() => set({ justify: v })}
            >
              {ALIGN_LABELS[v]}
            </button>
          ))}
        </div>
      </Field>
    </>
  );
}

const BREAKPOINT_LABELS: Record<Breakpoint, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
};

const ALIGN_LABELS: Record<"start" | "center" | "end" | "stretch", string> = {
  start: "Início",
  center: "Centro",
  end: "Fim",
  stretch: "Esticar",
};

function miniChip(active: boolean) {
  return `rounded-md border px-2 py-1 text-[10.5px] font-medium text-center transition-colors ${
    active
      ? "border-[var(--selecao)] text-[var(--selecao)]"
      : "border-input text-muted-foreground hover:border-foreground/30 hover:text-foreground"
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
  dragHandleProps,
  onUpdate,
  onDuplicate,
  onDelete,
}: {
  quizId: string;
  option: BlockOption;
  blockType: QuizBlock["type"];
  allBlocks: QuizBlock[];
  currentBlockId: string;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  onUpdate: (patch: Partial<BlockOption>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [mediaTab, setMediaTab] = useState<"none" | "emoji" | "image">(
    option.imageUrl ? "image" : option.emoji ? "emoji" : "none",
  );
  const [actionTab, setActionTab] = useState<"flow" | "step" | "url">(
    option.actionUrl ? "url" : option.jumpToBlockId ? "step" : "flow",
  );
  const labelInputRef = useRef<HTMLInputElement>(null);

  function applyMark(mark: RichTextMark) {
    const el = labelInputRef.current;
    const start = el?.selectionStart ?? option.label.length;
    const end = el?.selectionEnd ?? option.label.length;
    const result = applyRichTextMark(option.label, start, end, mark);
    onUpdate({ label: result.text });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-1.5 p-1.5">
        {/* Alça sempre visível: escondida no hover ela não existe no toque —
            foi o mesmo defeito já corrigido nos cards do pipeline. */}
        <div
          {...dragHandleProps}
          className="shrink-0 cursor-grab p-0.5 text-muted-foreground/50 hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastar para reordenar"
          title="Arrastar para reordenar"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted overflow-hidden">
          {option.imageUrl ? (
            <img src={option.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : option.emoji ? (
            <span className="text-sm">{option.emoji}</span>
          ) : (
            <ImageIcon className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
        <Input
          ref={labelInputRef}
          value={option.label}
          onChange={(e) => onUpdate({ label: e.target.value })}
          className="h-8"
        />
        <div className="flex shrink-0 gap-0.5">
          <button
            type="button"
            onClick={() => applyMark("bold")}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Negrito"
            title="Negrito (**texto**)"
          >
            <Bold className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyMark("italic")}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Itálico"
            title="Itálico (_texto_)"
          >
            <Italic className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => applyMark("underline")}
            className="p-1.5 text-muted-foreground hover:text-foreground"
            aria-label="Sublinhado"
            title="Sublinhado (__texto__)"
          >
            <Underline className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 text-muted-foreground hover:text-foreground p-1.5"
          aria-label={expanded ? "Recolher opção" : "Mais opções desta alternativa"}
          title={expanded ? "Recolher" : "Mídia, pré-seleção, pontuação, ação ao clicar…"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDuplicate}
          className="h-8 w-8 shrink-0 p-0"
          aria-label="Duplicar opção"
          title="Duplicar — copia mídia, pontuação e ação junto"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label="Excluir opção"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {expanded && (
        <div className="space-y-2.5 p-2.5 pt-0 border-t mt-0">
          <Field label="Mídia">
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                className={miniChip(mediaTab === "none")}
                onClick={() => {
                  setMediaTab("none");
                  onUpdate({ emoji: undefined, imageUrl: undefined });
                }}
              >
                Nenhuma
              </button>
              <button
                type="button"
                className={miniChip(mediaTab === "emoji")}
                onClick={() => {
                  setMediaTab("emoji");
                  onUpdate({ imageUrl: undefined });
                }}
              >
                Emoji
              </button>
              <button
                type="button"
                className={miniChip(mediaTab === "image")}
                onClick={() => {
                  setMediaTab("image");
                  onUpdate({ emoji: undefined });
                }}
              >
                Imagem
              </button>
            </div>
            {mediaTab === "emoji" && (
              <Input
                value={option.emoji ?? ""}
                onChange={(e) => onUpdate({ emoji: e.target.value })}
                placeholder="🔥"
                className="mt-1.5 text-center"
              />
            )}
            {mediaTab === "image" && (
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
              <p className="text-[11px] text-muted-foreground leading-snug">
                Já vem marcada quando a etapa abre
              </p>
            </div>
            <Switch
              checked={!!option.preselected}
              onCheckedChange={(v) => onUpdate({ preselected: v })}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Pontuação">
              <Input
                type="number"
                value={option.score ?? ""}
                onChange={(e) =>
                  onUpdate({ score: e.target.value === "" ? undefined : Number(e.target.value) })
                }
                placeholder="0"
              />
            </Field>
            <Field label="Etiqueta (tag)">
              <Input
                value={option.tag ?? ""}
                onChange={(e) => onUpdate({ tag: e.target.value || undefined })}
                placeholder="ex.: premium"
              />
            </Field>
          </div>

          {blockType === "single-choice" && (
            <Field label="Ação ao clicar">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className={miniChip(actionTab === "flow")}
                  onClick={() => {
                    setActionTab("flow");
                    onUpdate({ jumpToBlockId: undefined, actionUrl: undefined });
                  }}
                >
                  Seguir fluxo
                </button>
                <button
                  type="button"
                  className={miniChip(actionTab === "step")}
                  onClick={() => {
                    setActionTab("step");
                    onUpdate({ actionUrl: undefined });
                  }}
                >
                  Etapa específica
                </button>
                <button
                  type="button"
                  className={miniChip(actionTab === "url")}
                  onClick={() => {
                    setActionTab("url");
                    onUpdate({ jumpToBlockId: undefined });
                  }}
                >
                  URL externa
                </button>
              </div>
              {actionTab === "step" && (
                <div className="mt-1.5">
                  <OptionJumpSelect
                    allBlocks={allBlocks}
                    currentBlockId={currentBlockId}
                    value={option.jumpToBlockId}
                    onSelect={(target) => onUpdate({ jumpToBlockId: target })}
                  />
                </div>
              )}
              {actionTab === "url" && (
                <Input
                  className="mt-1.5"
                  value={option.actionUrl ?? ""}
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
  const showIf: BlockShowIf = block.showIf ?? {
    enabled: false,
    fieldBlockId: "",
    op: "eq",
    value: "",
  };
  const patch = (p: Partial<BlockShowIf>) => onChange({ showIf: { ...showIf, ...p } });

  const myIndex = allBlocks.findIndex((b) => b.id === block.id);
  const sources = allBlocks.filter(
    (b, i) => (myIndex < 0 || i < myIndex) && ANSWERABLE_TYPES.has(b.type),
  );
  const variableNames = allBlocks.filter((b) => b.outputVariable).map((b) => b.outputVariable!);
  const sourceBlock = allBlocks.find((b) => b.id === showIf.fieldBlockId);
  const sourceOptions = sourceBlock?.options ?? [];
  const isRange = showIf.op === "between";
  const isFormula = !!showIf.useFormula;

  const OPS: { id: ShowIfOp; label: string }[] = [
    { id: "eq", label: "= Igual" },
    { id: "neq", label: "≠ Diferente" },
    { id: "contains", label: "∋ Contém" },
    { id: "gt", label: "> Maior que" },
    { id: "gte", label: "≥ Maior ou igual" },
    { id: "lt", label: "< Menor que" },
    { id: "lte", label: "≤ Menor ou igual" },
  ];

  const chipClass = (active: boolean) =>
    `rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors text-left ${
      active
        ? "border-[var(--selecao)] text-[var(--selecao)]"
        : "border-input text-muted-foreground hover:border-foreground/30 hover:text-foreground"
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
            Adicione, antes deste bloco, uma pergunta (escolha, avaliação, texto, peso…) para usar a
            resposta dela como condição — ou dê um nome de variável a uma pergunta anterior e use o
            modo Fórmula.
          </p>
        ) : (
          <>
            <Field label="Tipo de condição">
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  className={chipClass(!isFormula && !isRange)}
                  onClick={() => patch({ useFormula: false, op: "eq", value2: undefined })}
                >
                  Simples
                </button>
                <button
                  type="button"
                  className={chipClass(!isFormula && isRange)}
                  onClick={() => patch({ useFormula: false, op: "between" })}
                >
                  Faixa (entre)
                </button>
                <button
                  type="button"
                  className={chipClass(isFormula)}
                  onClick={() =>
                    patch({ useFormula: true, op: showIf.op === "between" ? "gte" : showIf.op })
                  }
                >
                  Fórmula
                </button>
              </div>
            </Field>

            {isFormula ? (
              <Field label="Fórmula">
                <Input
                  value={showIf.expression ?? ""}
                  onChange={(e) => patch({ expression: e.target.value })}
                  placeholder="ex.: peso/(altura/100)^2"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {variableNames.length > 0 ? (
                    <>
                      Variáveis disponíveis:{" "}
                      {variableNames.map((n) => (
                        <code key={n} className="rounded bg-muted px-1 py-0.5 mr-1">
                          {n}
                        </code>
                      ))}
                    </>
                  ) : (
                    'Dê um nome de variável a uma pergunta anterior (campo "Variável de saída") pra poder usá-la aqui.'
                  )}
                </p>
              </Field>
            ) : (
              <Field label="Com base na resposta de">
                <Select
                  value={showIf.fieldBlockId || undefined}
                  onValueChange={(v) => patch({ fieldBlockId: v, value: "", value2: undefined })}
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
                    value={String(showIf.value ?? "")}
                    onChange={(e) => patch({ value: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground shrink-0">e</span>
                  <Input
                    type="number"
                    placeholder="Até"
                    value={String(showIf.value2 ?? "")}
                    onChange={(e) => patch({ value2: e.target.value })}
                  />
                </div>
              </Field>
            ) : (
              <Field label="Comparar com">
                {!isFormula &&
                sourceOptions.length > 0 &&
                (showIf.op === "eq" || showIf.op === "neq" || showIf.op === "contains") ? (
                  <Select
                    value={showIf.value ? String(showIf.value) : undefined}
                    onValueChange={(v) => patch({ value: v })}
                  >
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
                    value={String(showIf.value ?? "")}
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
  count,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  first?: boolean;
  /** Contagem à direita do título (ex.: "4 opções"). */
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-3 ${first ? "" : "border-t pt-5"}`}>
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h4>
        {count !== undefined && (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {count} {count === 1 ? "opção" : "opções"}
          </span>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** Interruptor com rótulo e explicação — o padrão do cartão de Comportamento. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="mt-0.5 shrink-0"
      />
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

  const updateAbTest = (patch: Partial<NonNullable<QuizBlock["abTest"]>>) => {
    onChange({ abTest: { ...abTest, ...patch } });
  };

  const updateVariant = (id: string, patch: Partial<BlockVariant>) => {
    updateAbTest({
      variants: abTest.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    });
  };

  const addVariant = () => {
    updateAbTest({
      variants: [...abTest.variants, { id: crypto.randomUUID(), title: block.title ?? "" }],
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
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Teste A/B
          </h4>
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
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Variação {i + 1}
                </span>
                <Button size="sm" variant="ghost" onClick={() => removeVariant(variant.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Input
                placeholder="Título"
                value={variant.title ?? ""}
                onChange={(e) => updateVariant(variant.id, { title: e.target.value })}
              />
              <Textarea
                placeholder="Subtítulo"
                rows={2}
                value={variant.subtitle ?? ""}
                onChange={(e) => updateVariant(variant.id, { subtitle: e.target.value })}
              />
              <Input
                placeholder="Texto do botão"
                value={variant.ctaLabel ?? ""}
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

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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

function DesignInspector({
  design,
  onChange,
}: {
  design: QuizDesign;
  onChange: (p: Partial<QuizDesign>) => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Palette className="h-4 w-4 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-sm">Design</h3>
          <p className="text-xs text-muted-foreground">
            Selecione um bloco ou personalize o visual global
          </p>
        </div>
      </div>

      <Tabs defaultValue="presets">
        <TabsList className="w-full">
          <TabsTrigger value="presets" className="gap-1.5 flex-1">
            <Sparkles className="h-3.5 w-3.5" />
            Presets
          </TabsTrigger>
          <TabsTrigger value="cores" className="gap-1.5 flex-1">
            <Palette className="h-3.5 w-3.5" />
            Cores
          </TabsTrigger>
          <TabsTrigger value="estilo" className="gap-1.5 flex-1">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Estilo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="presets" className="pt-3">
          <div className="grid grid-cols-2 gap-2">
            {DESIGN_PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onChange(p.design)}
                className={`text-left p-2 rounded-lg border-2 transition-all ${
                  design.presetId === p.id
                    ? "border-[var(--selecao)]"
                    : "border-transparent hover:border-border"
                }`}
              >
                <div className="flex gap-1 mb-1.5">
                  <div className="h-3 w-3 rounded" style={{ background: p.design.background }} />
                  <div className="h-3 w-3 rounded" style={{ background: p.design.primary }} />
                  <div className="h-3 w-3 rounded" style={{ background: p.design.surface }} />
                </div>
                <div className="text-xs font-semibold">{p.name}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-1">
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="cores" className="pt-3 space-y-4">
          <ColorField
            label="Cor primária"
            value={design.primary}
            onChange={(v) => onChange({ primary: v })}
          />
          <ColorField
            label="Fundo"
            value={design.background}
            onChange={(v) => onChange({ background: v })}
          />
          <ColorField
            label="Superfície (cards, opções)"
            value={design.surface}
            onChange={(v) => onChange({ surface: v })}
          />
          <ColorField label="Texto" value={design.text} onChange={(v) => onChange({ text: v })} />
          <ColorField
            label="Texto secundário"
            value={design.muted}
            onChange={(v) => onChange({ muted: v })}
          />
        </TabsContent>

        <TabsContent value="estilo" className="pt-3 space-y-4">
          <Field label={`Arredondamento: ${design.radius}px`}>
            <Slider
              min={0}
              max={32}
              step={2}
              value={[design.radius]}
              onValueChange={([v]) => onChange({ radius: v })}
            />
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
                      active
                        ? "border-[var(--selecao)] bg-[var(--selecao-suave)]"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-center py-2">
                      <span
                        className={`px-3 py-1.5 rounded text-[11px] font-semibold${className ? ` ${className}` : ""}`}
                        style={style}
                      >
                        Avançar
                      </span>
                    </div>
                    <div className="text-[11px] font-semibold text-center">{opt.label}</div>
                    <div className="text-[11px] text-muted-foreground text-center line-clamp-1">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </Field>

          <Field label="Barra de progresso">
            <Select
              value={design.progressStyle}
              onValueChange={(v) => onChange({ progressStyle: v as QuizDesign["progressStyle"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(items.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() => onChange([...items, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </Button>
    </div>
  );
}

function FaqEditor({
  items,
  onChange,
}: {
  items: FaqItem[];
  onChange: (items: FaqItem[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.id} className="rounded-lg border p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">
              Pergunta {i + 1}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(items.filter((x) => x.id !== item.id))}
            >
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
        onClick={() => onChange([...items, { id: crypto.randomUUID(), question: "", answer: "" }])}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar pergunta
      </Button>
    </div>
  );
}

function ChartDataEditor({
  items,
  onChange,
}: {
  items: ChartPoint[];
  onChange: (items: ChartPoint[]) => void;
}) {
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
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(items.filter((x) => x.id !== item.id))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() => onChange([...items, { id: crypto.randomUUID(), label: "", value: 0 }])}
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
                next[i] = u ?? "";
                onChange(next);
              }}
              compact
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onChange(images.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={() => onChange([...images, ""])}
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar imagem
      </Button>
    </div>
  );
}

const ROTULO_DO_OPERADOR: Record<BlockLogicOp, string> = {
  eq: "é igual a",
  neq: "é diferente de",
  contains: "contém",
  gt: "é maior que",
  gte: "é maior ou igual a",
  lt: "é menor que",
  lte: "é menor ou igual a",
  between: "está entre",
};

const ROTULO_DO_MODO: Record<
  NonNullable<BlockLogicRule["kind"]>,
  { titulo: string; ajuda: string }
> = {
  resposta: { titulo: "Resposta", ajuda: "O que a pessoa marcou numa pergunta específica" },
  quantidade: { titulo: "Quantidade", ajuda: "Quantas vezes uma etiqueta apareceu nas respostas" },
  porcentagem: {
    titulo: "Porcentagem",
    ajuda: "A mesma contagem, como fatia das perguntas respondidas",
  },
  pontuacao: { titulo: "Pontuação", ajuda: "O percentual da pontuação sobre o máximo alcançável" },
};

/**
 * Regras de salto do bloco.
 *
 * O motor já avaliava `logicRules` desde sempre; o que nunca existiu foi uma
 * interface para escrevê-las — o único desvio configurável era o salto por
 * opção, que não dá conta de "quem marcou X em pelo menos metade das perguntas".
 */
function LogicRulesSection({
  block,
  allBlocks,
  onChange,
}: {
  block: QuizBlock;
  allBlocks: QuizBlock[];
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const regras = block.logicRules ?? [];

  /* Só blocos que carregam resposta servem de origem. Oferecer um parágrafo
     como campo de teste criaria uma regra que nunca bate, sem nenhum aviso. */
  const origens = allBlocks.filter((b) =>
    [
      "single-choice",
      "multi-choice",
      "rating",
      "short-text",
      "long-text",
      "email",
      "phone",
      "weight",
      "height",
    ].includes(b.type),
  );
  const destinos = allBlocks.filter((b) => b.id !== block.id);

  const etiquetas = [
    ...new Set(
      allBlocks.flatMap((b) =>
        (b.options ?? []).map((o) => o.tag).filter((t): t is string => !!t?.trim()),
      ),
    ),
  ].sort();

  const atualizar = (i: number, patch: Partial<BlockLogicRule>) =>
    onChange({ logicRules: regras.map((r, k) => (k === i ? { ...r, ...patch } : r)) });

  const remover = (i: number) => onChange({ logicRules: regras.filter((_, k) => k !== i) });

  const adicionar = () =>
    onChange({
      logicRules: [
        ...regras,
        {
          kind: "resposta",
          fieldBlockId: origens[0]?.id,
          op: "eq",
          value: "",
          jumpToBlockId: destinos[0]?.id ?? "",
        },
      ],
    });

  return (
    <Section title="Regras de salto" icon={Workflow}>
      {regras.length === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Sem regra, o quiz segue para a etapa seguinte. Uma regra desvia quem bate na condição.
        </p>
      )}

      {regras.map((regra, i) => {
        const modo = regra.kind ?? "resposta";
        return (
          <div key={i} className="space-y-2 rounded-lg border p-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Regra {i + 1}
              </span>
              <button
                onClick={() => remover(i)}
                className="text-muted-foreground transition-colors hover:text-destructive"
                aria-label={`Remover regra ${i + 1}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(ROTULO_DO_MODO) as NonNullable<BlockLogicRule["kind"]>[]).map((k) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={modo === k ? "default" : "outline"}
                  className="h-7 text-[11px]"
                  title={ROTULO_DO_MODO[k].ajuda}
                  onClick={() => atualizar(i, { kind: k })}
                >
                  {ROTULO_DO_MODO[k].titulo}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">{ROTULO_DO_MODO[modo].ajuda}</p>

            {modo === "resposta" && (
              <select
                value={regra.fieldBlockId ?? ""}
                onChange={(e) => atualizar(i, { fieldBlockId: e.target.value })}
                className="h-8 w-full rounded-md border bg-background px-2 text-xs"
              >
                <option value="">Escolha a pergunta…</option>
                {origens.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title || b.type}
                  </option>
                ))}
              </select>
            )}

            {(modo === "quantidade" || modo === "porcentagem") && (
              <>
                <select
                  value={regra.tag ?? ""}
                  onChange={(e) => atualizar(i, { tag: e.target.value })}
                  className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">Escolha a etiqueta…</option>
                  {etiquetas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {etiquetas.length === 0 && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    Nenhuma opção do quiz tem etiqueta ainda — sem etiqueta esta regra nunca bate.
                  </p>
                )}
              </>
            )}

            <div className="flex gap-1.5">
              <select
                value={regra.op}
                onChange={(e) => atualizar(i, { op: e.target.value as BlockLogicOp })}
                className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
              >
                {(Object.keys(ROTULO_DO_OPERADOR) as BlockLogicOp[]).map((op) => (
                  <option key={op} value={op}>
                    {ROTULO_DO_OPERADOR[op]}
                  </option>
                ))}
              </select>
              <Input
                value={String(regra.value ?? "")}
                onChange={(e) => atualizar(i, { value: e.target.value })}
                className="h-8 w-20 text-xs"
                placeholder={modo === "resposta" ? "valor" : modo === "quantidade" ? "nº" : "%"}
              />
              {regra.op === "between" && (
                <Input
                  type="number"
                  value={regra.value2 ?? ""}
                  onChange={(e) =>
                    atualizar(i, {
                      value2: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                  className="h-8 w-20 text-xs"
                  placeholder="até"
                />
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-[11px] text-muted-foreground">então vai para</span>
              <select
                value={regra.jumpToBlockId}
                onChange={(e) => atualizar(i, { jumpToBlockId: e.target.value })}
                className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">Escolha o destino…</option>
                {destinos.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title || b.resultTitle || b.type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={adicionar}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar regra
      </Button>

      {regras.length > 1 && (
        <p className="text-[11px] text-muted-foreground">
          Quando mais de uma regra bate, vale a última da lista.
        </p>
      )}
    </Section>
  );
}

/**
 * Onde o bloco fica na tela.
 *
 * `fixed`, e não `sticky`: sticky só gruda enquanto o contêiner que envolve o
 * elemento está em vista, e aqui esse contêiner é a coluna da etapa — a barra
 * descolaria no fim dela, justamente quando mais precisa aparecer.
 */
function PosicaoSection({
  block,
  onChange,
}: {
  block: QuizBlock;
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const atual = block.posicao ?? "fluxo";
  return (
    <Section title="Posição na tela" icon={LayoutGrid}>
      <div className="grid grid-cols-2 gap-1.5">
        {POSICOES.map((p) => (
          <Button
            key={p.valor}
            type="button"
            size="sm"
            variant={atual === p.valor ? "default" : "outline"}
            className="h-8 text-[11px]"
            title={p.ajuda}
            onClick={() => onChange({ posicao: p.valor })}
          >
            {p.rotulo}
          </Button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {POSICOES.find((p) => p.valor === atual)?.ajuda}
      </p>

      {atual === "flutuante" && (
        <Field label="Canto da janela">
          <select
            value={block.ancora ?? "abaixo-direita"}
            onChange={(e) =>
              onChange({ ancora: e.target.value as NonNullable<QuizBlock["ancora"]> })
            }
            className="h-8 w-full rounded-md border bg-background px-2 text-xs"
          >
            {ANCORAS.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </Field>
      )}

      {atual !== "fluxo" && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Fora do fluxo, este bloco não recebe o botão que avança a etapa — deixe pelo menos um
          bloco no fluxo para o visitante poder seguir.
        </p>
      )}
    </Section>
  );
}

/**
 * Cores próprias do bloco.
 *
 * O botão "Herdar do tema" existe porque, sem ele, desfazer uma customização
 * exigia apagar cada campo à mão e torcer para não esquecer nenhum — e um
 * campo esquecido deixa o bloco fora do tema sem que se perceba.
 *
 * As cores já usadas no funil aparecem para reaproveitar em vez de redigitar
 * o hexadecimal.
 */
function CoresDoBlocoSection({
  block,
  allBlocks,
  design,
  onChange,
}: {
  block: QuizBlock;
  allBlocks: QuizBlock[];
  design?: QuizDesign;
  onChange: (p: Partial<QuizBlock>) => void;
}) {
  const proprias = temCorPropria(block);
  const doDocumento = design ? coresDoDocumento(design, allBlocks, []) : [];

  const campo = (
    rotulo: string,
    chave: "corDeFundo" | "corDoTexto" | "corDeDestaque",
    herdaDe: string | undefined,
  ) => (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{rotulo}</Label>
        {block[chave] && (
          <button
            onClick={() => onChange({ [chave]: undefined })}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            herdar
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={block[chave] ?? herdaDe ?? "#000000"}
          onChange={(e) => onChange({ [chave]: e.target.value })}
          className="h-8 w-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          value={block[chave] ?? ""}
          placeholder={herdaDe ? `${herdaDe} (do tema)` : "do tema"}
          onChange={(e) => onChange({ [chave]: e.target.value || undefined })}
          className="h-8 flex-1 font-mono text-[11px]"
          spellCheck={false}
        />
      </div>
    </div>
  );

  return (
    <Section title="Cores do bloco" icon={Palette}>
      {!proprias && (
        <p className="text-[11px] text-muted-foreground">
          Este bloco segue o tema do funil. Defina uma cor para destoar só aqui.
        </p>
      )}

      {campo("Fundo", "corDeFundo", design?.surface)}
      {campo("Texto", "corDoTexto", design?.text)}
      {campo("Destaque", "corDeDestaque", design?.primary)}

      {!!doDocumento.length && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground">Cores do documento</Label>
          <div className="flex flex-wrap gap-1">
            {doDocumento.slice(0, 16).map((c) => (
              <button
                key={c}
                type="button"
                title={`${c} — usar como destaque`}
                onClick={() => onChange({ corDeDestaque: c })}
                className="h-5 w-5 rounded-md border transition-transform hover:scale-110"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}

      {proprias && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => onChange({ ...VOLTAR_AO_TEMA })}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Herdar do tema
        </Button>
      )}
    </Section>
  );
}

/** Itens de Grade e de Cards. */
function ItensEditor({
  itens,
  comTexto,
  onChange,
}: {
  itens: ItemDeConteudo[];
  comTexto: boolean;
  onChange: (i: ItemDeConteudo[]) => void;
}) {
  const atualizar = (i: number, patch: Partial<ItemDeConteudo>) =>
    onChange(itens.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-2">
      {itens.map((item, i) => (
        <div key={item.id} className="space-y-1.5 rounded-lg border p-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={item.emoji ?? ""}
              onChange={(e) => atualizar(i, { emoji: e.target.value })}
              className="h-8 w-12 text-center"
              placeholder="✅"
            />
            <Input
              value={item.titulo}
              onChange={(e) => atualizar(i, { titulo: e.target.value })}
              className="h-8 flex-1 text-xs"
              placeholder="Título"
            />
            <button
              onClick={() => onChange(itens.filter((_, k) => k !== i))}
              className="text-muted-foreground transition-colors hover:text-destructive"
              aria-label={`Remover item ${i + 1}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {comTexto && (
            <Input
              value={item.texto ?? ""}
              onChange={(e) => atualizar(i, { texto: e.target.value })}
              className="h-8 text-xs"
              placeholder="Texto de apoio"
            />
          )}
          <Input
            value={item.url ?? ""}
            onChange={(e) => atualizar(i, { url: e.target.value || undefined })}
            className="h-8 text-xs"
            placeholder="Link ao clicar (opcional)"
          />
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => onChange([...itens, { id: crypto.randomUUID(), titulo: "", emoji: "✅" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar item
      </Button>
    </div>
  );
}

const ROTULO_DA_REDE: Record<LinkSocial["rede"], string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  site: "Site",
  email: "E-mail",
};

/** Links de redes. Aceita só o usuário — o endereço completo é montado no player. */
function RedesEditor({
  redes,
  onChange,
}: {
  redes: LinkSocial[];
  onChange: (r: LinkSocial[]) => void;
}) {
  return (
    <div className="space-y-2">
      {redes.map((r, i) => (
        <div key={r.id} className="flex items-center gap-1.5">
          <select
            value={r.rede}
            onChange={(e) =>
              onChange(
                redes.map((x, k) =>
                  k === i ? { ...x, rede: e.target.value as LinkSocial["rede"] } : x,
                ),
              )
            }
            className="h-8 w-28 shrink-0 rounded-md border bg-background px-1.5 text-xs"
          >
            {(Object.keys(ROTULO_DA_REDE) as LinkSocial["rede"][]).map((k) => (
              <option key={k} value={k}>
                {ROTULO_DA_REDE[k]}
              </option>
            ))}
          </select>
          <Input
            value={r.url}
            onChange={(e) =>
              onChange(redes.map((x, k) => (k === i ? { ...x, url: e.target.value } : x)))
            }
            className="h-8 flex-1 text-xs"
            placeholder="@usuario ou endereço completo"
          />
          <button
            onClick={() => onChange(redes.filter((_, k) => k !== i))}
            className="text-muted-foreground transition-colors hover:text-destructive"
            aria-label={`Remover ${ROTULO_DA_REDE[r.rede]}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() =>
          onChange([...redes, { id: crypto.randomUUID(), rede: "instagram", url: "" }])
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar rede
      </Button>
    </div>
  );
}
