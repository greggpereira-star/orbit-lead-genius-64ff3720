import { describe, it, expect } from 'vitest';
import { montarResumo } from '../components/QuizPlayer';
import type { QuizBlock } from '../types';

const b = (o: Partial<QuizBlock>) => o as QuizBlock;

describe('sumário das respostas', () => {
  const blocks = [
    b({ id: 'q1', type: 'single-choice', title: 'Qual sua dor?', options: [{ id: 'o1', label: 'Rugas' }, { id: 'o2', label: 'Manchas' }] }),
    b({ id: 'q2', type: 'multi-choice', title: 'O que importa?', options: [{ id: 'a', label: 'Preço' }, { id: 'c', label: 'Prazo' }] }),
    b({ id: 'nome', type: 'short-text', title: 'Seu nome' }),
  ];

  it('mostra o RÓTULO da opção, não o id guardado', () => {
    // "o1" não diz nada a ninguém.
    const r = montarResumo(blocks, { q1: 'o1' });
    expect(r).toEqual([{ pergunta: 'Qual sua dor?', resposta: 'Rugas' }]);
  });

  it('múltipla escolha vira lista separada por vírgula', () => {
    const r = montarResumo(blocks, { q2: ['a', 'c'] });
    expect(r[0].resposta).toBe('Preço, Prazo');
  });

  it('texto entra como foi digitado', () => {
    expect(montarResumo(blocks, { nome: 'Maria' })[0].resposta).toBe('Maria');
  });

  it('pergunta não respondida não aparece', () => {
    expect(montarResumo(blocks, { q1: 'o1' })).toHaveLength(1);
  });

  it('resposta vazia não aparece', () => {
    expect(montarResumo(blocks, { nome: '   ' })).toHaveLength(0);
  });

  it('formulário e agendamento ficam de fora — têm tela própria', () => {
    const comForm = [...blocks, b({ id: 'f', type: 'form', title: 'Contato' })];
    const r = montarResumo(comForm, { f: { name: 'Maria', email: 'a@b.c' } });
    expect(r).toHaveLength(0);
  });

  it('bloco sem título cai no tipo, em vez de sair em branco', () => {
    const semTitulo = [b({ id: 'x', type: 'short-text' })];
    expect(montarResumo(semTitulo, { x: 'algo' })[0].pergunta).toBe('short-text');
  });
});
