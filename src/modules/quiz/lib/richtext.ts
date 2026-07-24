import { createElement, type ReactNode } from 'react';

// Rich-text leve (Funilix parity) para labels de opção: **negrito**, _itálico_,
// __sublinhado__. De propósito NÃO é HTML — evita qualquer risco de XSS sem
// precisar de sanitização, já que o autor do quiz é o próprio usuário do CRM.
const TOKEN_RE = /(\*\*.+?\*\*|__.+?__|_.+?_)/g;
// Regex separada (sem flag `g`) só pra checar presença de token — reaproveitar TOKEN_RE
// com `.test()` seria um bug clássico de JS: `g` torna `.test()` stateful via `lastIndex`,
// e como TOKEN_RE é reusada em toda renderização de opção, isso causaria falsos negativos
// intermitentes entre chamadas.
const HAS_TOKEN_RE = /\*\*.+?\*\*|__.+?__|_.+?_/;

export function parseRichText(text: string): ReactNode {
  if (!text || !HAS_TOKEN_RE.test(text)) return text;
  const parts = text.split(TOKEN_RE).filter((p) => p !== '');
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return createElement('strong', { key: i }, part.slice(2, -2));
    }
    if (part.startsWith('__') && part.endsWith('__')) {
      return createElement('u', { key: i }, part.slice(2, -2));
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return createElement('em', { key: i }, part.slice(1, -1));
    }
    return part;
  });
}

export type RichTextMark = 'bold' | 'italic' | 'underline';

const MARKERS: Record<RichTextMark, string> = {
  bold: '**',
  italic: '_',
  underline: '__',
};

// Envolve o trecho selecionado do input em `text` (entre `start` e `end`) com os
// marcadores da formatação escolhida. Sem seleção, insere um par de marcadores
// vazio na posição do cursor. Retorna o novo texto e onde reposicionar o cursor.
export function applyRichTextMark(
  text: string,
  start: number,
  end: number,
  mark: RichTextMark,
): { text: string; selectionStart: number; selectionEnd: number } {
  const marker = MARKERS[mark];
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const next = `${before}${marker}${selected}${marker}${after}`;
  if (selected) {
    return { text: next, selectionStart: start + marker.length, selectionEnd: start + marker.length + selected.length };
  }
  const cursor = start + marker.length;
  return { text: next, selectionStart: cursor, selectionEnd: cursor };
}
