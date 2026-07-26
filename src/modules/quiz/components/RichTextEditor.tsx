/**
 * Editor de texto rico do painel de Propriedades.
 *
 * O que é editado é um `contentEditable`: seleção, acentuação, teclado de
 * celular e desfazer nativo saem de graça, e escrever isso à mão é fonte
 * infinita de bug. O que é SALVO nunca é o HTML dessa área — a cada mudança o
 * DOM é lido por `docFromDom`, que só aceita a lista branca. Colar do Word
 * traz o texto e as marcas conhecidas; classe, script e estilo alheio morrem
 * na leitura.
 *
 * O documento resultante é desenhado pelo mesmo `<RichText>` do Preview e do
 * quiz público — o que você formata aqui é o que o visitante vê.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, List, ListOrdered,
  AlignLeft, AlignCenter, AlignRight, Link2, Undo2, Redo2, Baseline, Highlighter, Variable,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { docFromDom, docToPlainText, type RichDoc, type RichNodeType } from '../lib/richdoc';

/** Fundo só da área de edição — ajuda a julgar contraste sem mudar o quiz. */
type Backdrop = 'padrao' | 'escuro' | 'pastel';

const BACKDROP_STYLE: Record<Backdrop, { background: string; color: string }> = {
  padrao: { background: '#ffffff', color: '#111827' },
  escuro: { background: '#111827', color: '#f9fafb' },
  pastel: { background: '#fdf6f0', color: '#3f2d23' },
};

const TEXT_COLORS = ['#111827', '#be1858', '#0ea5e9', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#ffffff'];
const HIGHLIGHTS = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecaca', '#e9d5ff', '#fed7aa'];

interface Props {
  value: RichDoc | null | undefined;
  /** Texto simples atual — usado na primeira edição, quando ainda não há documento. */
  fallbackText?: string;
  onChange: (doc: RichDoc, plainText: string) => void;
  /** Nomes de variáveis disponíveis para o botão fx. */
  variables?: string[];
  label?: string;
  minHeight?: number;
}

/** Envolve a seleção atual numa tag/estilo usando o próprio motor de edição. */
function exec(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  value, fallbackText, onChange, variables = [], label, minHeight = 92,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [backdrop, setBackdrop] = useState<Backdrop>('padrao');
  const [linkUrl, setLinkUrl] = useState('');
  const savedRange = useRef<Range | null>(null);

  /* O conteúdo inicial é escrito UMA vez. Reescrever a cada render mataria o
     cursor a cada tecla — o defeito mais comum em editor controlado por React. */
  useEffect(() => {
    const el = ref.current;
    if (!el || el.dataset.ready === '1') return;
    el.innerHTML = '';
    if (value?.nodes?.length) {
      for (const node of value.nodes) {
        el.appendChild(nodeToElement(node));
      }
    } else if (fallbackText) {
      const p = document.createElement('p');
      p.textContent = fallbackText;
      el.appendChild(p);
    } else {
      el.appendChild(document.createElement('p'));
    }
    el.dataset.ready = '1';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const emit = () => {
    const el = ref.current;
    if (!el) return;
    const doc = docFromDom(el);
    onChange(doc, docToPlainText(doc));
  };

  const rememberSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && ref.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const range = savedRange.current;
    if (!range) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const run = (command: string, arg?: string) => {
    ref.current?.focus();
    restoreSelection();
    exec(command, arg);
    emit();
  };

  const insertVariable = (name: string) => {
    ref.current?.focus();
    restoreSelection();
    exec('insertText', `{{${name}}}`);
    emit();
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const safe = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;
    run('createLink', safe);
    setLinkUrl('');
  };

  const skin = BACKDROP_STYLE[backdrop];

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-muted-foreground">{label}</p>}

      <div className="rounded-lg border bg-card">
        {/* ---- barra de ferramentas ---- */}
        <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5">
          <ToolButton onClick={() => run('undo')} label="Desfazer"><Undo2 className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('redo')} label="Refazer"><Redo2 className="h-3.5 w-3.5" /></ToolButton>
          <Divider />

          <Select
            onValueChange={(v) => run('formatBlock', v === 'p' ? '<p>' : `<${v}>`)}
            defaultValue="p"
          >
            <SelectTrigger className="h-7 w-[104px] text-xs" aria-label="Nível do texto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="p" className="text-xs">Parágrafo</SelectItem>
              <SelectItem value="h1" className="text-xs">Título 1</SelectItem>
              <SelectItem value="h2" className="text-xs">Título 2</SelectItem>
              <SelectItem value="h3" className="text-xs">Título 3</SelectItem>
            </SelectContent>
          </Select>
          <Divider />

          <ToolButton onClick={() => run('bold')} label="Negrito"><Bold className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('italic')} label="Itálico"><Italic className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('underline')} label="Sublinhado"><Underline className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('strikeThrough')} label="Tachado"><Strikethrough className="h-3.5 w-3.5" /></ToolButton>
          <Divider />

          <SwatchPicker
            label="Cor do texto"
            icon={<Baseline className="h-3.5 w-3.5" />}
            colors={TEXT_COLORS}
            onOpen={rememberSelection}
            onPick={(c) => run('foreColor', c)}
          />
          <SwatchPicker
            label="Marca-texto"
            icon={<Highlighter className="h-3.5 w-3.5" />}
            colors={HIGHLIGHTS}
            onOpen={rememberSelection}
            onPick={(c) => run('hiliteColor', c)}
          />
          <Divider />

          <ToolButton onClick={() => run('insertUnorderedList')} label="Lista com marcadores"><List className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('insertOrderedList')} label="Lista numerada"><ListOrdered className="h-3.5 w-3.5" /></ToolButton>
          <Divider />

          <ToolButton onClick={() => run('justifyLeft')} label="Alinhar à esquerda"><AlignLeft className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('justifyCenter')} label="Centralizar"><AlignCenter className="h-3.5 w-3.5" /></ToolButton>
          <ToolButton onClick={() => run('justifyRight')} label="Alinhar à direita"><AlignRight className="h-3.5 w-3.5" /></ToolButton>
          <Divider />

          <Popover onOpenChange={(o) => o && rememberSelection()}>
            <PopoverTrigger asChild>
              <button type="button" title="Link" aria-label="Link" className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Link2 className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-2 p-2" align="start">
              <p className="text-[11px] text-muted-foreground">Selecione o texto antes de aplicar o link.</p>
              <div className="flex gap-1.5">
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }}
                  placeholder="site.com.br"
                  className="h-8 text-xs"
                />
                <Button size="sm" className="h-8" onClick={applyLink}>Aplicar</Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* fx — o motor de variáveis já existe; aqui ele fica ao alcance da mão. */}
          <Popover onOpenChange={(o) => o && rememberSelection()}>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Inserir variável de uma resposta anterior"
                aria-label="Inserir variável"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Variable className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-2" align="start">
              {variables.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Nenhuma variável ainda. Dê um nome à resposta de um bloco anterior
                  (campo “Variável de saída”) para usá-la aqui.
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">O valor entra no texto ao responder.</p>
                  {variables.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        {/* ---- fundo de apoio ---- */}
        <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
          <span className="text-[11px] text-muted-foreground">
            Fundo de apoio <span className="opacity-70">— só na edição</span>
          </span>
          <div className="flex gap-0.5">
            {(['padrao', 'escuro', 'pastel'] as Backdrop[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBackdrop(b)}
                aria-pressed={backdrop === b}
                className={`rounded px-2 py-0.5 text-[11px] capitalize transition-colors ${
                  backdrop === b ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* ---- área de edição ---- */}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label ?? 'Editor de texto'}
          onInput={emit}
          onBlur={emit}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          className="rich-editor px-3 py-2.5 text-sm outline-none"
          style={{ ...skin, minHeight }}
        />
      </div>
    </div>
  );
}

function ToolButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      // onMouseDown + preventDefault: o clique não pode roubar o foco da área de
      // edição, senão a seleção some antes do comando rodar.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />;
}

function SwatchPicker({
  label, icon, colors, onPick, onOpen,
}: {
  label: string;
  icon: React.ReactNode;
  colors: string[];
  onPick: (color: string) => void;
  onOpen: () => void;
}) {
  return (
    <Popover onOpenChange={(o) => o && onOpen()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          title={label}
          aria-label={label}
          className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {icon}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex gap-1">
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(c)}
              aria-label={`${label} ${c}`}
              className="h-6 w-6 rounded border transition-transform hover:scale-110"
              style={{ background: c }}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Documento -> DOM inicial da área de edição (só na montagem). */
function nodeToElement(node: { type: RichNodeType; align?: string; spans?: unknown; items?: unknown }): HTMLElement {
  const spans = (node.spans ?? []) as { text: string; marks?: string[]; color?: string; highlight?: string; href?: string }[];
  const items = (node.items ?? []) as (typeof spans)[];

  const spanToNode = (s: (typeof spans)[number]): Node => {
    let inner: Node = document.createTextNode(s.text);
    const wrap = (tag: string) => {
      const w = document.createElement(tag);
      w.appendChild(inner);
      inner = w;
    };
    if (s.marks?.includes('bold')) wrap('b');
    if (s.marks?.includes('italic')) wrap('i');
    if (s.marks?.includes('underline')) wrap('u');
    if (s.marks?.includes('strike')) wrap('s');
    if (s.color || s.highlight) {
      const w = document.createElement('span');
      if (s.color) w.style.color = s.color;
      if (s.highlight) w.style.backgroundColor = s.highlight;
      w.appendChild(inner);
      inner = w;
    }
    if (s.href) {
      const a = document.createElement('a');
      a.href = s.href;
      a.appendChild(inner);
      inner = a;
    }
    return inner;
  };

  if (node.type === 'ul' || node.type === 'ol') {
    const list = document.createElement(node.type);
    if (node.align) list.style.textAlign = node.align;
    for (const item of items) {
      const li = document.createElement('li');
      item.forEach((s) => li.appendChild(spanToNode(s)));
      list.appendChild(li);
    }
    return list;
  }

  const el = document.createElement(node.type);
  if (node.align) el.style.textAlign = node.align;
  spans.forEach((s) => el.appendChild(spanToNode(s)));
  return el;
}
