/**
 * Documento de texto rico do Alt Quiz.
 *
 * NÃO guardamos HTML. O texto é um documento estruturado com lista branca de
 * nós e marcas, renderizado como elementos React — a mesma regra que já valia
 * no `richtext.ts` das opções, só que expressiva o bastante para título, cor,
 * marca-texto, link, lista e alinhamento.
 *
 * Por que não HTML:
 *  - o editor é `contentEditable`, então o usuário COLA do Word, do Google Docs
 *    e de páginas quaisquer; guardar o HTML colado significaria guardar `<script>`,
 *    `onerror=` e estilos alheios, e depender de sanitizador para não virar XSS —
 *    inclusive no SSR do quiz público, que é anônimo;
 *  - com um documento estruturado, o que não está na lista branca simplesmente
 *    não sobrevive à leitura do DOM. A limpeza é consequência do formato, não de
 *    um filtro que alguém precisa lembrar de aplicar.
 *
 * O mesmo documento é renderizado por `<RichText>` no Builder, no Preview e no
 * player. Um renderizador só é o que garante que o que você edita é o que o
 * visitante vê.
 */

export type RichMark = 'bold' | 'italic' | 'underline' | 'strike' | 'sup' | 'sub';

export interface RichSpan {
  text: string;
  marks?: RichMark[];
  /** Cor do texto (#rrggbb). */
  color?: string;
  /** Marca-texto (#rrggbb). */
  highlight?: string;
  /** Link — só http(s) e mailto sobrevivem à leitura. */
  href?: string;
  /**
   * Imagem no meio do texto. Quando presente, este trecho É a imagem — `text`
   * vira o texto alternativo. Só http(s) sobrevive à leitura, pela mesma razão
   * do link: `src` é um vetor tão bom quanto `href` pra injeção.
   */
  img?: string;
}

export type RichNodeType = 'p' | 'h1' | 'h2' | 'h3' | 'ul' | 'ol' | 'code';
export type RichAlign = 'left' | 'center' | 'right';

export interface RichNode {
  type: RichNodeType;
  align?: RichAlign;
  /** Conteúdo de p/h1/h2/h3. */
  spans?: RichSpan[];
  /** Itens de ul/ol — cada item é uma linha de spans. */
  items?: RichSpan[][];
}

export interface RichDoc {
  /** Versão do formato. Serve para migrar sem adivinhação se o schema mudar. */
  v: 1;
  nodes: RichNode[];
}

const MARK_BY_TAG: Record<string, RichMark> = {
  B: 'bold', STRONG: 'bold',
  I: 'italic', EM: 'italic',
  U: 'underline',
  S: 'strike', STRIKE: 'strike', DEL: 'strike',
  SUP: 'sup', SUB: 'sub',
};

const BLOCK_BY_TAG: Record<string, RichNodeType> = {
  P: 'p', DIV: 'p',
  H1: 'h1', H2: 'h2', H3: 'h3',
  UL: 'ul', OL: 'ol',
  PRE: 'code',
};

/** Só http(s) e mailto. Qualquer outro esquema (javascript:, data:) é descartado. */
function safeHref(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  // Link relativo do próprio funil também serve, desde que não vire protocolo.
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return undefined;
}

/**
 * Só http(s) para `src` de imagem. `data:` fica de fora de propósito: além de
 * inflar o schema, é o caminho clássico de embutir SVG com script dentro.
 */
function safeImgSrc(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const url = raw.trim();
  return /^https?:\/\//i.test(url) ? url : undefined;
}

/** Normaliza cor para #rrggbb; devolve undefined para qualquer coisa fora disso. */
function safeColor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  // O contentEditable devolve rgb(...) em vários navegadores.
  const m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return undefined;
  const hex = (n: string) => Math.min(255, Number(n)).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

interface InlineState {
  marks: Set<RichMark>;
  color?: string;
  highlight?: string;
  href?: string;
}

function readInline(node: Node, state: InlineState, out: RichSpan[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    if (!text) return;
    const span: RichSpan = { text };
    if (state.marks.size) span.marks = [...state.marks];
    if (state.color) span.color = state.color;
    if (state.highlight) span.highlight = state.highlight;
    if (state.href) span.href = state.href;
    out.push(span);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  if (el.tagName === 'BR') {
    out.push({ text: '\n' });
    return;
  }
  if (el.tagName === 'IMG') {
    const src = safeImgSrc(el.getAttribute('src'));
    // Sem src válido a imagem simplesmente não existe no documento — não vale
    // guardar um <img> quebrado só porque alguém colou de um lugar estranho.
    if (src) out.push({ text: el.getAttribute('alt') || '', img: src, href: state.href });
    return;
  }

  const next: InlineState = {
    marks: new Set(state.marks),
    color: state.color,
    highlight: state.highlight,
    href: state.href,
  };

  const mark = MARK_BY_TAG[el.tagName];
  if (mark) next.marks.add(mark);
  if (el.tagName === 'A') next.href = safeHref(el.getAttribute('href')) ?? state.href;

  // `style` inline é lido, mas só destas três propriedades — o resto do estilo
  // colado de fora é ignorado de propósito.
  const style = el.style;
  const color = safeColor(style?.color);
  if (color) next.color = color;
  const bg = safeColor(style?.backgroundColor);
  if (bg) next.highlight = bg;
  const weight = style?.fontWeight;
  if (weight === 'bold' || Number(weight) >= 600) next.marks.add('bold');
  if (style?.fontStyle === 'italic') next.marks.add('italic');
  const deco = style?.textDecorationLine || style?.textDecoration;
  if (deco?.includes('underline')) next.marks.add('underline');
  if (deco?.includes('line-through')) next.marks.add('strike');

  el.childNodes.forEach((child) => readInline(child, next, out));
}

/** Junta spans vizinhos com formatação idêntica — documento menor e diff mais limpo. */
function mergeSpans(spans: RichSpan[]): RichSpan[] {
  const out: RichSpan[] = [];
  for (const s of spans) {
    // Imagem é um trecho por si: não tem texto pra fundir e `text` nela é o alt.
    if (s.img) { out.push({ ...s }); continue; }
    if (!s.text) continue;
    const prev = out[out.length - 1];
    const same =
      prev &&
      !prev.img &&
      prev.color === s.color &&
      prev.highlight === s.highlight &&
      prev.href === s.href &&
      (prev.marks ?? []).join(',') === (s.marks ?? []).join(',');
    if (same) prev.text += s.text;
    else out.push({ ...s });
  }
  return out;
}

function readAlign(el: HTMLElement): RichAlign | undefined {
  const a = el.style?.textAlign;
  if (a === 'center' || a === 'right' || a === 'left') return a;
  return undefined;
}

/**
 * Lê o DOM do editor e devolve o documento. Tudo que não estiver na lista
 * branca (script, iframe, style, classes, atributos) some aqui — é este passo
 * que torna colar de qualquer lugar uma operação segura.
 */
export function docFromDom(root: HTMLElement): RichDoc {
  const nodes: RichNode[] = [];

  const pushLeaf = (type: RichNodeType, el: HTMLElement) => {
    const spans: RichSpan[] = [];
    el.childNodes.forEach((c) => readInline(c, { marks: new Set() }, spans));
    const merged = mergeSpans(spans);
    if (!merged.length) return;
    nodes.push({ type, align: readAlign(el), spans: merged });
  };

  const pushList = (type: 'ul' | 'ol', el: HTMLElement) => {
    const items: RichSpan[][] = [];
    el.querySelectorAll(':scope > li').forEach((li) => {
      const spans: RichSpan[] = [];
      li.childNodes.forEach((c) => readInline(c, { marks: new Set() }, spans));
      const merged = mergeSpans(spans);
      if (merged.length) items.push(merged);
    });
    if (items.length) nodes.push({ type, align: readAlign(el), items });
  };

  const walk = (parent: HTMLElement) => {
    let loose: RichSpan[] = [];
    const flushLoose = () => {
      const merged = mergeSpans(loose);
      if (merged.length) nodes.push({ type: 'p', spans: merged });
      loose = [];
    };

    parent.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        readInline(child, { marks: new Set() }, loose);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      const blockType = BLOCK_BY_TAG[el.tagName];

      if (!blockType) {
        // Elemento inline (span, b, a…) solto no nível do bloco.
        readInline(el, { marks: new Set() }, loose);
        return;
      }
      flushLoose();
      if (blockType === 'ul' || blockType === 'ol') pushList(blockType, el);
      else pushLeaf(blockType, el);
    });

    flushLoose();
  };

  walk(root);
  return { v: 1, nodes };
}

/** Texto puro do documento — alimenta título de etapa, aria-label e busca. */
export function docToPlainText(doc: RichDoc | undefined | null): string {
  if (!doc?.nodes?.length) return '';
  const lines: string[] = [];
  for (const n of doc.nodes) {
    if (n.items) lines.push(...n.items.map((it) => it.map((s) => s.text).join('')));
    else if (n.spans) lines.push(n.spans.map((s) => s.text).join(''));
  }
  return lines.join('\n').trim();
}

/** Documento de uma linha, para migrar um campo de texto simples sem perder nada. */
export function docFromPlainText(text: string, type: RichNodeType = 'p'): RichDoc {
  const lines = (text ?? '').split('\n').filter((l) => l.length > 0);
  return {
    v: 1,
    nodes: lines.length ? lines.map((l) => ({ type, spans: [{ text: l }] })) : [],
  };
}

export function isEmptyDoc(doc: RichDoc | undefined | null): boolean {
  return docToPlainText(doc).length === 0;
}
