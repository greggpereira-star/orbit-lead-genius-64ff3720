import { describe, it, expect } from 'vitest';
import { validarPublicacao } from './validarPublicacao';
import type { QuizBlock, QuizSchema, ScoreTier } from '../types';

const schema = (blocks: QuizBlock[], steps?: QuizSchema['steps']): QuizSchema =>
  ({ blocks, steps: steps ?? blocks.map((b) => ({ id: `s-${b.id}`, blockIds: [b.id] })) }) as QuizSchema;
const b = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, ...extra }) as unknown as QuizBlock;
const TIER: ScoreTier[] = [{ id: 't', label: 'A', minPercent: 50, whatsappTemplate: 'Oi' }] as ScoreTier[];

const bloqueia = (s: QuizSchema, t?: ScoreTier[]) => validarPublicacao(s, t).some((a) => a.nivel === 'bloqueia');

describe('validação antes de publicar', () => {
  it('quiz vazio não vai ao ar', () => {
    expect(bloqueia(schema([]))).toBe(true);
  });

  it('SEM bloco de captura não vai ao ar', () => {
    // É o caso que custou dias: o quiz roda, pontua, grava submissão — e nunca
    // gera lead, sem erro em lugar nenhum.
    const achados = validarPublicacao(schema([b('q', 'single-choice'), b('r', 'result')]), TIER);
    expect(achados.some((a) => a.nivel === 'bloqueia' && /captura/i.test(a.mensagem))).toBe(true);
  });

  it('`Texto curto` com máscara de telefone CONTA como captura', () => {
    // Player e validador precisam concordar: senão a validação barra um quiz
    // que funciona, ou libera um que não.
    expect(bloqueia(schema([b('t', 'short-text', { fieldMask: 'telefone' }), b('r', 'result')]), TIER)).toBe(false);
  });

  it('`Texto curto` sem máscara NÃO conta', () => {
    expect(bloqueia(schema([b('t', 'short-text'), b('r', 'result')]), TIER)).toBe(true);
  });

  it('etapa vazia AVISA e explica que é ignorada', () => {
    // Não barra: o player poda as vazias, então o visitante nunca vê tela em
    // branco. O problema é do autor, que criou uma tela e não preencheu.
    const s = schema([b('e', 'email'), b('r', 'result')], [
      { id: 's1', blockIds: ['e'] },
      { id: 's2', blockIds: [] },
      { id: 's3', blockIds: ['r'] },
    ]);
    const achados = validarPublicacao(s, TIER);
    expect(bloqueia(s, TIER)).toBe(false);
    expect(achados.some((a) => a.nivel === 'avisa' && /ignorada/.test(a.mensagem))).toBe(true);
  });

  it('salto apontando para componente inexistente não vai ao ar', () => {
    const s = schema([
      b('q', 'single-choice', { options: [{ id: 'o', label: 'x', jumpToBlockId: 'SUMIU' }] }),
      b('e', 'email'),
      b('r', 'result'),
    ]);
    expect(bloqueia(s, TIER)).toBe(true);
  });

  it('quiz completo passa sem nenhum achado', () => {
    expect(validarPublicacao(schema([b('q', 'single-choice'), b('e', 'email'), b('r', 'result')]), TIER)).toEqual([]);
  });

  it('faixa sem mensagem AVISA, não barra — é escolha legítima', () => {
    const semMsg: ScoreTier[] = [{ id: 't', label: 'A', minPercent: 50 }] as ScoreTier[];
    const achados = validarPublicacao(schema([b('e', 'email'), b('r', 'result')]), semMsg);
    expect(achados.every((a) => a.nivel === 'avisa')).toBe(true);
    expect(achados.some((a) => /WhatsApp/.test(a.mensagem))).toBe(true);
  });
});
