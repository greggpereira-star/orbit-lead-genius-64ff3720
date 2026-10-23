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
  aceitaHorarioComercial,
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
    // O CHECK vigente é o da migration mais nova: ela precisa listar TODOS os eventos da tela.
    const vigente = readFileSync('supabase/migrations/20261025100000_gatilhos_de_espera.sql', 'utf8');
    for (const e of EVENTOS.map((x) => x.valor)) expect(vigente, e).toContain(`'${e}'`);
    // Troca pelo NOME: a busca por definição derrubaria o CHECK dos minutos junto.
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS automation_rules_trigger_event_check');
    expect(sql).not.toMatch(/ILIKE\s+'%trigger_event%'/);
  });
});

describe('ações de conversa e horário de atendimento na tela', () => {
  it('as três ações novas estão na lista, e o banco as aceita', () => {
    const sql = readFileSync('supabase/migrations/20261024160000_acoes_de_conversa_e_horario.sql', 'utf8');
    for (const a of ['resolver_conversa', 'reabrir_conversa', 'avaliar_atendimento']) {
      expect(ACOES.some((x) => x.valor === a), a).toBe(true);
      expect(sql).toContain(`'${a}'`);
    }
    // O CHECK vigente é o da migration MAIS NOVA que o troca: ela precisa listar TODAS as ações da
    // tela (trocar o CHECK não pode tirar ação que já existia).
    const vigente = readFileSync('supabase/migrations/20261024200000_tarefas_por_lead.sql', 'utf8');
    for (const a of ACOES.map((x) => x.valor)) expect(vigente, a).toContain(`'${a}'`);
  });

  it('todo evento oferece dentro_do_horario como condição, sem ser o campo padrão', () => {
    for (const e of EVENTOS) {
      const campos = CAMPOS_POR_EVENTO[e.valor];
      expect(campos, e.valor).toContain('dentro_do_horario');
      expect(campos[0], e.valor).not.toBe('dentro_do_horario');
    }
  });

  it('o banco calcula o campo em todos os caminhos de enfileirar', () => {
    const sql = readFileSync('supabase/migrations/20261024160000_acoes_de_conversa_e_horario.sql', 'utf8');
    // central (enfileirar_automacao) + os dois payloads da varredura por tempo
    expect((sql.match(/dentro_do_horario/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(sql).toContain("v_conv.csat_requested_at IS NOT NULL");
    expect(sql).toContain('automacao_condicoes_passam(r.conditions, v_payload)');
  });
});

describe('gatilhos de espera: pendente, sem nova mensagem e horário de atendimento', () => {
  it('os dois novos pedem minutos e aceitam contar só o expediente', () => {
    for (const e of ['customer_silent', 'conversation_pending', 'customer_no_reply']) {
      expect(precisaDeMinutos(e), e).toBe(true);
      expect(aceitaHorarioComercial(e), e).toBe(true);
    }
    // A janela de 24h é relógio da Meta: não faz sentido contar só o expediente.
    expect(aceitaHorarioComercial('window_expiring')).toBe(false);
    expect(aceitaHorarioComercial('lead_created')).toBe(false);
  });

  it('cada um entrega o campo de espera para condição', () => {
    expect(CAMPOS_POR_EVENTO.customer_silent).toContain('minutos_sem_mensagem');
    expect(CAMPOS_POR_EVENTO.conversation_pending).toContain('minutos_pendente');
  });

  it('o banco valida os minutos dos quatro e o "horario_comercial" verdadeiro/falso', () => {
    const sql = readFileSync('supabase/migrations/20261025100000_gatilhos_de_espera.sql', 'utf8');
    expect(sql).toContain('BETWEEN 5 AND 1380');
    for (const e of ['customer_no_reply', 'window_expiring', 'conversation_pending', 'customer_silent'])
      expect(sql, e).toContain(`'${e}'`);
    expect(sql).toContain("IN ('true', 'false')");
    // pelo NOME: a busca por definição derrubaria outro CHECK
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS automation_rules_minutos_check');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS automation_rules_trigger_event_check');
  });
});

