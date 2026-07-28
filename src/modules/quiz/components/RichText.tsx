/**
 * Renderizador único do texto rico.
 *
 * O MESMO componente desenha o texto no Builder, no Preview e no quiz público.
 * Não é preciosismo: o defeito clássico de editor rico é a pessoa formatar numa
 * tela e o visitante ver outra coisa, porque cada lado tem seu próprio
 * renderizador. Aqui só existe um.
 *
 * Nada de `dangerouslySetInnerHTML` — o documento vira elementos React.
 */
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import type { RichDoc, RichSpan } from '../lib/richdoc';
import { interpolateText, type VariableScope } from '../lib/variables';

const HEADING_TAG: Record<string, string> = { h1: 'h1', h2: 'h2', h3: 'h3', p: 'p' };

/** Quebra manual vira <br>. O HTML colapsa "\n"; sem isso o texto simples perde o ritmo que a pessoa escreveu. */
function comQuebras(texto: string): ReactNode[] {
  return texto.split('\n').map((linha, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {linha}
    </Fragment>
  ));
}

function spanStyle(span: RichSpan): CSSProperties | undefined {
  const style: CSSProperties = {};
  if (span.color) style.color = span.color;
  if (span.highlight) {
    style.backgroundColor = span.highlight;
    // Respiro lateral: marca-texto colado na letra fica sujo na leitura.
    style.padding = '0 0.15em';
    style.borderRadius = '0.2em';
  }
  return Object.keys(style).length ? style : undefined;
}

function renderSpans(spans: RichSpan[], scope: VariableScope | undefined, keyPrefix: string): ReactNode[] {
  return spans.map((span, i) => {
    if (span.img) {
      return (
        <img
          key={`${keyPrefix}-${i}`}
          src={span.img}
          alt={span.text || ''}
          // `inline-block` + `max-width` pra imagem colada no meio do texto não
          // estourar a coluna do quiz, que é estreita de propósito.
          className="inline-block max-w-full align-middle"
          style={{ borderRadius: '0.25em' }}
        />
      );
    }
    const text = scope ? interpolateText(span.text, scope) : span.text;
    // A quebra manual (Shift+Enter) vira <br> de verdade, não "\n" invisível.
    let node: ReactNode = comQuebras(text);

    const marks = span.marks ?? [];
    if (marks.includes('bold')) node = <strong>{node}</strong>;
    if (marks.includes('italic')) node = <em>{node}</em>;
    if (marks.includes('underline')) node = <u>{node}</u>;
    if (marks.includes('strike')) node = <s>{node}</s>;
    if (marks.includes('sup')) node = <sup>{node}</sup>;
    if (marks.includes('sub')) node = <sub>{node}</sub>;

    const style = spanStyle(span);

    if (span.href) {
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={span.href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ ...style, textDecoration: 'underline' }}
        >
          {node}
        </a>
      );
    }

    return style ? (
      <span key={`${keyPrefix}-${i}`} style={style}>{node}</span>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{node}</Fragment>
    );
  });
}

interface Props {
  doc: RichDoc | null | undefined;
  /** Variáveis do quiz — quando presente, `{{nome}}` e `{{calc(...)}}` são resolvidos. */
  scope?: VariableScope;
  className?: string;
  /** Tipografia e cor vindas do tema do quiz — não podem se perder aqui. */
  style?: CSSProperties;
  /** Texto simples usado quando o bloco ainda não tem documento rico. */
  fallback?: string;
}

export function RichText({ doc, scope, className, style, fallback }: Props) {
  if (!doc?.nodes?.length) {
    if (!fallback) return null;
    const text = scope ? interpolateText(fallback, scope) : fallback;
    return <p className={className} style={style}>{comQuebras(text)}</p>;
  }

  return (
    <div className={className} style={style}>
      {doc.nodes.map((node, i) => {
        const key = `n${i}`;
        const style: CSSProperties | undefined = node.align ? { textAlign: node.align } : undefined;

        if (node.type === 'ul' || node.type === 'ol') {
          const ListTag = node.type;
          return (
            <ListTag
              key={key}
              style={{ ...style, paddingLeft: '1.25em', listStyleType: node.type === 'ul' ? 'disc' : 'decimal' }}
            >
              {(node.items ?? []).map((item, j) => (
                <li key={j}>{renderSpans(item, scope, `${key}-${j}`)}</li>
              ))}
            </ListTag>
          );
        }

        if (node.type === 'code') {
          return (
            <pre key={key} style={style} className="quiz-rich-code">
              <code>{renderSpans(node.spans ?? [], scope, key)}</code>
            </pre>
          );
        }

        const Tag = (HEADING_TAG[node.type] ?? 'p') as 'p' | 'h1' | 'h2' | 'h3';
        return (
          <Tag key={key} style={style}>
            {renderSpans(node.spans ?? [], scope, key)}
          </Tag>
        );
      })}
    </div>
  );
}
