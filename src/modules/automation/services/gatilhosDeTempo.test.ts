import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/core/observability/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import {
  ACOES,
  CAMPOS_POR_EVENTO,
  EVENTOS,
  MINUTOS_MAX,
  MINUTOS_MIN,
  erroDosMinutos,
  precisaDeMinutos,
} from './automationService';

describe('gatilhos por tempo na tela', () => {
  it('os dois entram no vocabulário, com campos para condição', () => {
    for (const e of ['customer_no_reply', 'window_expiring']) {
      expect(EVENTOS.some((x) => x.valor === e)).toBe(true);
      expect(CAMPOS_POR_EVENTO[e]).toContain('etapa');
    }
    expect(CAMPOS_POR_EVENTO.customer_no_reply).toContain('minutos_esperando');
    expect(CAMPOS_POR_EVENTO.window_expiring).toContain('minutos_restantes');
  });

  it('só os gatilhos por tempo pedem minutos', () => {
    expect(precisaDeMinutos('customer_no_reply')).toBe(true);
    expect(precisaDeMinutos('window_expiring')).toBe(true);
    expect(precisaDeMinutos('lead_created')).toBe(false);
    expect(precisaDeMinutos('tag_added')).toBe(false);
  });

  it('valida os minutos: inteiro entre 5 e 1380', () => {
    expect(erroDosMinutos(30)).toBeNull();
    expect(erroDosMinutos('45')).toBeNull();
    expect(erroDosMinutos(MINUTOS_MIN)).toBeNull();
    expect(erroDosMinutos(MINUTOS_MAX)).toBeNull();
    expect(erroDosMinutos(MINUTOS_MIN - 1)).toMatch(/entre 5 e 1380/);
    expect(erroDosMinutos(MINUTOS_MAX + 1)).toMatch(/entre 5 e 1380/);
    expect(erroDosMinutos('')).toMatch(/Informe/);
    expect(erroDosMinutos('abc')).toMatch(/Informe/);
    expect(erroDosMinutos(12.5)).toMatch(/Informe/);
    expect(erroDosMinutos(null)).toMatch(/Informe/);
  });

  it('a ação Notificar equipe está na lista', () => {
    expect(ACOES.some((a) => a.valor === 'notificar_equipe')).toBe(true);
  });

  it('os limites da tela são os mesmos do CHECK do banco', () => {
    const sql = readFileSync('supabase/migrations/20261024100000_gatilhos_de_tempo_e_avisos.sql', 'utf8');
    expect(sql).toContain(`BETWEEN ${MINUTOS_MIN} AND ${MINUTOS_MAX}`);
    for (const e of ['customer_no_reply', 'window_expiring']) expect(sql).toContain(`'${e}'`);
    expect(sql).toContain("'notificar_equipe'");
  });
});

describe('gatilhos "ao resolver" e "ao atribuir"', () => {
  it('entram no vocabulário com campos para condição', () => {
    for (const e of ['conversation_resolved', 'conversation_assigned']) {
      expect(EVENTOS.some((x) => x.valor === e)).toBe(true);
      expect(CAMPOS_POR_EVENTO[e]).toContain('etapa');
      expect(precisaDeMinutos(e)).toBe(false);
    }
    expect(CAMPOS_POR_EVENTO.conversation_assigned).toContain('responsavel_id');
    expect(CAMPOS_POR_EVENTO.conversation_assigned).toContain('responsavel_anterior_id');
  });

  it('o CHECK do banco aceita os dois e preserva o dos minutos', () => {
    const sql = readFileSync('supabase/migrations/20261024140000_gatilhos_resolver_e_atribuir.sql', 'utf8');
    for (const e of ['conversation_resolved', 'conversation_assigned']) expect(sql).toContain(`'${e}'`);
    // Troca pelo NOME: a busca por definição derrubaria o CHECK dos minutos junto.
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS automation_rules_trigger_event_check');
    expect(sql).not.toMatch(/ILIKE\s+'%trigger_event%'/);
    // Todos os eventos já existentes continuam na lista nova.
    for (const e of EVENTOS.map((x) => x.valor)) expect(sql).toContain(`'${e}'`);
  });
});
