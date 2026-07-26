import type { QuizBlock } from '../types';

// ============ Motor de variáveis + fórmulas (Funilix parity) ============
// Todo bloco de resposta pode exportar seu valor como uma variável nomeada
// (QuizBlock.outputVariable). Qualquer texto do quiz pode então referenciar
// essa variável via {{nome}} (interpolação direta) ou combinar várias delas
// numa fórmula via {{calc(expressão)}} — ex.: {{calc(peso/(altura/100)^2)}}
// pra calcular IMC ao vivo a partir de duas respostas anteriores. O mesmo
// calc(...) é usado (sem as chaves) no modo "fórmula" da exibição condicional.
//
// O parser abaixo é uma calculadora aritmética minimalista escrita à mão —
// nunca usa eval()/Function(): o conteúdo do quiz é autoral (o próprio dono
// do quiz escreve a fórmula), mas mesmo assim não vale a pena expor um
// caminho pra execução arbitrária de JS só por uma conta de padaria.

export type VariableScope = Record<string, number | string>;

const NUMERIC_TYPES = new Set(['weight', 'height', 'rating']);
const TEXT_TYPES = new Set(['short-text', 'long-text', 'email', 'phone']);

/**
 * Constrói o mapa {nomeDaVariavel: valor} a partir das respostas já dadas.
 * Blocos sem `outputVariable` configurado simplesmente não entram no mapa.
 */
export function resolveScope(
  blocks: QuizBlock[],
  responses: Record<string, unknown>,
  /**
   * Variáveis embutidas — hoje só `score`, a pontuação acumulada da sessão.
   * Sem isso, plotar a própria pontuação num medidor exigiria que o autor
   * criasse uma variável de saída pra um número que o motor já calcula.
   */
  builtins?: VariableScope,
): VariableScope {
  const scope: VariableScope = { ...builtins };
  for (const b of blocks) {
    const name = b.outputVariable?.trim();
    if (!name) continue;
    const raw = responses[b.id];
    if (raw === undefined || raw === null || raw === '') continue;

    if (b.type === 'single-choice' && typeof raw === 'string') {
      const opt = (b.options ?? []).find((o) => o.id === raw);
      const candidate = opt?.value ?? opt?.label ?? raw;
      scope[name] = toNumberOrString(candidate);
    } else if (b.type === 'multi-choice' && Array.isArray(raw)) {
      scope[name] = (raw as string[])
        .map((id) => (b.options ?? []).find((o) => o.id === id)?.label ?? id)
        .join(', ');
    } else if (NUMERIC_TYPES.has(b.type)) {
      scope[name] = toNumberOrString(raw);
    } else if (TEXT_TYPES.has(b.type)) {
      scope[name] = String(raw);
    } else {
      scope[name] = toNumberOrString(raw);
    }
  }
  return scope;
}

function toNumberOrString(v: unknown): number | string {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' ? n : String(v);
}

// ---------- Parser aritmético seguro (tokenizer + descida recursiva) ----------

type Token =
  | { type: 'num'; value: number }
  | { type: 'ident'; value: string }
  | { type: 'op'; value: string }
  | { type: 'lparen' }
  | { type: 'rparen' }
  | { type: 'comma' };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      tokens.push({ type: 'num', value: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/^%'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
      continue;
    }
    if (c === '(') {
      tokens.push({ type: 'lparen' });
      i++;
      continue;
    }
    if (c === ')') {
      tokens.push({ type: 'rparen' });
      i++;
      continue;
    }
    if (c === ',') {
      tokens.push({ type: 'comma' });
      i++;
      continue;
    }
    // caractere desconhecido (ex.: {{ }} residual): ignora, mantém o parser tolerante
    i++;
  }
  return tokens;
}

const FUNCS: Record<string, (...args: number[]) => number> = {
  round: (x) => Math.round(x),
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
};

class ExprParser {
  private pos = 0;
  constructor(
    private tokens: Token[],
    private scope: VariableScope
  ) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    return this.tokens[this.pos++];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.type === 'op' && t.value === v;
  }

  parse(): number {
    return this.parseExpr();
  }

  private parseExpr(): number {
    let val = this.parseTerm();
    while (this.isOp('+') || this.isOp('-')) {
      const op = (this.next() as { type: 'op'; value: string }).value;
      const rhs = this.parseTerm();
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  }

  private parseTerm(): number {
    let val = this.parsePower();
    while (this.isOp('*') || this.isOp('/') || this.isOp('%')) {
      const op = (this.next() as { type: 'op'; value: string }).value;
      const rhs = this.parsePower();
      val = op === '*' ? val * rhs : op === '/' ? val / rhs : val % rhs;
    }
    return val;
  }

  private parsePower(): number {
    const base = this.parseUnary();
    if (this.isOp('^')) {
      this.next();
      const exp = this.parsePower(); // associatividade à direita: 2^3^2 = 2^(3^2)
      return Math.pow(base, exp);
    }
    return base;
  }

  private parseUnary(): number {
    if (this.isOp('-')) {
      this.next();
      return -this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    const tok = this.peek();
    if (!tok) return NaN;
    if (tok.type === 'num') {
      this.next();
      return tok.value;
    }
    if (tok.type === 'lparen') {
      this.next();
      const val = this.parseExpr();
      if (this.peek()?.type === 'rparen') this.next();
      return val;
    }
    if (tok.type === 'ident') {
      this.next();
      if (this.peek()?.type === 'lparen') {
        this.next();
        const args: number[] = [];
        if (this.peek()?.type !== 'rparen') {
          args.push(this.parseExpr());
          while (this.peek()?.type === 'comma') {
            this.next();
            args.push(this.parseExpr());
          }
        }
        if (this.peek()?.type === 'rparen') this.next();
        const fn = FUNCS[tok.value];
        return fn ? fn(...args) : NaN;
      }
      const v = this.scope[tok.value];
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
  }
}

/**
 * Avalia uma expressão aritmética (ex.: "peso/(altura/100)^2") contra o escopo de
 * variáveis atual. Retorna NaN se a expressão for inválida ou alguma variável
 * referenciada ainda não tiver valor — nunca lança exceção.
 */
export function evaluateExpression(expr: string, scope: VariableScope): number {
  if (!expr || !expr.trim()) return NaN;
  try {
    const result = new ExprParser(tokenize(expr), scope).parse();
    return Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

function formatNumber(n: number): string {
  // evita cauda de ponto flutuante (25.000000000000004) sem forçar casas decimais fixas
  return String(Math.round(n * 100) / 100);
}

function findClosingBraces(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length - 1; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === '}' && text[i + 1] === '}' && depth <= 0) return i;
  }
  return -1;
}

function renderToken(inner: string, scope: VariableScope): string {
  const calcMatch = inner.match(/^calc\((.*)\)$/s);
  if (calcMatch) {
    const result = evaluateExpression(calcMatch[1], scope);
    return Number.isFinite(result) ? formatNumber(result) : '';
  }
  const v = scope[inner.trim()];
  return v === undefined ? '' : String(v);
}

/**
 * Substitui {{variavel}} e {{calc(expressão)}} pelo valor atual no texto. Textos
 * sem "{{" retornam inalterados (fast path) — chamado em todo título/subtítulo
 * renderizado no Player, então precisa ser barato no caso comum.
 */
export function interpolateText(text: string | undefined, scope: VariableScope): string {
  if (!text || !text.includes('{{')) return text ?? '';
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '{' && text[i + 1] === '{') {
      const close = findClosingBraces(text, i + 2);
      if (close === -1) {
        out += text.slice(i);
        break;
      }
      out += renderToken(text.slice(i + 2, close), scope);
      i = close + 2;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/**
 * Resolve a porcentagem de um medidor a partir de uma fórmula do autor.
 *
 * Aceita as duas formas que a pessoa naturalmente escreve: a expressão crua
 * (`score*2`) e a forma com chaves que ela já viu nos textos
 * (`{{calc(score*2)}}`). Exigir só uma delas garantiria suporte na semana
 * seguinte.
 *
 * Devolve `null` quando não há fórmula ou quando ela não resulta num número —
 * quem chama cai no valor fixo do slider em vez de mostrar uma barra vazia.
 * O resultado é limitado a 0–100: uma fórmula que estoure não pode desenhar
 * uma barra maior que a régua.
 */
export function evaluatePercent(formula: string | undefined, scope: VariableScope): number | null {
  const raw = formula?.trim();
  if (!raw) return null;

  let value: number;
  if (raw.includes('{{')) {
    const rendered = interpolateText(raw, scope).trim();
    // Vazio = a variável ainda não existe (é o caso do canvas, antes de
    // qualquer resposta). Number('') seria 0 e desenharia uma barra zerada no
    // lugar do valor fixo — pior que não ter fórmula.
    if (!rendered) return null;
    value = Number(rendered.replace('%', '').replace(',', '.'));
  } else {
    try {
      value = evaluateExpression(raw, scope);
    } catch {
      return null;
    }
  }

  if (!Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}
