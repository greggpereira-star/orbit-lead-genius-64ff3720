import { supabase } from '@/lib/supabase';
import { logger } from '@/core/observability/logger';

/**
 * Regras de automação.
 *
 * O que estava aqui antes consultava a tabela `automations`, que nunca existiu
 * no banco — e sem conferir o erro, então saía calado a cada captura de lead.
 * Havia um segundo "motor" em `automationEngine.ts` com outro schema, também
 * inexistente.
 *
 * O despacho NÃO acontece mais no navegador. O gatilho `leads_automacao`
 * enfileira em `automation_jobs` e o trabalhador
 * `/api/public/cron/automation-dispatch` executa: as ações precisam de segredo
 * que não pode viver no cliente, e assim lead que entra pelo quiz, pelo chat ou
 * pelo WhatsApp também dispara — antes só o formulário disparava.
 */

export const EVENTOS = [
  { valor: 'lead_created', rotulo: 'Lead criado', ajuda: 'Qualquer lead novo, de qualquer origem.' },
  { valor: 'stage_changed', rotulo: 'Mudou de etapa', ajuda: 'O card foi movido no pipeline.' },
  { valor: 'form_abandoned', rotulo: 'Formulário abandonado', ajuda: 'Parou de preencher e não voltou em 30 min.' },
  {
    valor: 'tag_added',
    rotulo: 'Etiqueta aplicada',
    ajuda: 'Alguém (ou outra automação) pôs uma etiqueta no lead. Use a condição "etiqueta é igual a …": maiúsculas não importam.',
  },
  {
    valor: 'customer_no_reply',
    rotulo: 'Cliente sem resposta',
    ajuda: 'O cliente escreveu e ninguém da equipe respondeu depois de X minutos. Resposta pelo celular conta; mensagem automática não.',
    minutos: true,
  },
  {
    valor: 'window_expiring',
    rotulo: 'Janela de 24h expirando',
    ajuda: 'Faltam X minutos ou menos para fechar a janela de 24h de uma conversa em aberto.',
    minutos: true,
  },
  {
    valor: 'conversation_resolved',
    rotulo: 'Conversa resolvida',
    ajuda: 'Alguém marcou a conversa do WhatsApp como resolvida. Reabrir e resolver de novo dispara outra vez.',
  },
  {
    valor: 'conversation_assigned',
    rotulo: 'Conversa atribuída',
    ajuda: 'A conversa do WhatsApp passou a ter um responsável (ou trocou de responsável). Tirar o responsável não dispara.',
  },
  {
    valor: 'whatsapp_message_received',
    rotulo: 'Mensagem recebida no WhatsApp',
    ajuda: 'O cliente escreveu. Só mensagens dele: respostas da equipe e histórico importado não contam.',
  },
] as const;

export const OPERADORES = [
  { valor: 'igual', rotulo: 'é igual a' },
  { valor: 'diferente', rotulo: 'é diferente de' },
  { valor: 'contem', rotulo: 'contém' },
  { valor: 'maior_que', rotulo: 'é maior que' },
  { valor: 'menor_que', rotulo: 'é menor que' },
  { valor: 'preenchido', rotulo: 'está preenchido' },
  { valor: 'vazio', rotulo: 'está vazio' },
] as const;

/** Os campos que cada evento entrega. Fora desta lista a condição nunca casa. */
export const CAMPOS_POR_EVENTO: Record<string, string[]> = {
  lead_created: ['score', 'temperatura', 'origem', 'nome', 'email', 'telefone',
                 'utm_source', 'utm_medium', 'utm_campaign', 'landing_page', 'dentro_do_horario'],
  stage_changed: ['etapa', 'score', 'temperatura', 'nome', 'email', 'telefone', 'dentro_do_horario'],
  form_abandoned: ['formulario', 'passo', 'score', 'temperatura', 'utm_source', 'utm_campaign', 'dentro_do_horario'],
  customer_no_reply: ['minutos_esperando', 'etapa', 'score', 'temperatura', 'origem', 'veio_de_anuncio', 'nome', 'email', 'telefone', 'dentro_do_horario'],
  window_expiring: ['minutos_restantes', 'etapa', 'score', 'temperatura', 'origem', 'veio_de_anuncio', 'nome', 'email', 'telefone', 'dentro_do_horario'],
  conversation_resolved: ['etapa', 'score', 'temperatura', 'origem', 'veio_de_anuncio', 'nome', 'email', 'telefone', 'responsavel_id', 'dentro_do_horario'],
  conversation_assigned: ['responsavel_id', 'responsavel_anterior_id', 'etapa', 'score', 'temperatura', 'origem', 'veio_de_anuncio', 'nome', 'email', 'telefone', 'dentro_do_horario'],
  tag_added: ['etiqueta', 'etapa', 'score', 'temperatura', 'origem', 'nome', 'email', 'telefone', 'dentro_do_horario'],
  whatsapp_message_received: ['texto', 'primeira_mensagem', 'veio_de_anuncio', 'tipo_mensagem',
                              'nome', 'email', 'telefone', 'score', 'temperatura', 'origem', 'dentro_do_horario'],
};

export const ACOES = [
  { valor: 'etiquetar', rotulo: 'Aplicar etiqueta' },
  { valor: 'mover_etapa', rotulo: 'Mover para etapa' },
  { valor: 'atribuir_responsavel', rotulo: 'Atribuir responsável' },
  { valor: 'enviar_whatsapp', rotulo: 'Enviar texto no WhatsApp (janela de 24h aberta)' },
  { valor: 'enviar_template', rotulo: 'Enviar template do WhatsApp' },
  { valor: 'atribuir_conversa', rotulo: 'Atribuir conversa do WhatsApp' },
  { valor: 'notificar_equipe', rotulo: 'Notificar equipe (aviso no sino)' },
  { valor: 'resolver_conversa', rotulo: 'Resolver a conversa' },
  { valor: 'reabrir_conversa', rotulo: 'Reabrir a conversa' },
  { valor: 'avaliar_atendimento', rotulo: 'Pedir avaliação do atendimento (nota de 1 a 5)' },
  { valor: 'webhook', rotulo: 'Chamar webhook' },
] as const;

/**
 * Condição sobre a etiqueta guarda o valor em minúsculas e sem espaço nas pontas: o gatilho do
 * banco manda `etiqueta` assim, e o operador `igual` do motor diferencia maiúsculas. Sem isso,
 * "Orçamento" na regra nunca casaria com a etiqueta "orçamento" do lead.
 */
export function normalizarCondicoes(condicoes: Condicao[]): Condicao[] {
  return condicoes
    .filter((c) => c.campo && c.operador)
    .map((c) =>
      c.campo === 'etiqueta' && typeof c.valor === 'string'
        ? { ...c, valor: c.valor.trim().toLowerCase() }
        : c,
    );
}

/** Os gatilhos por tempo precisam dos minutos; os outros não têm parâmetro. */
export function precisaDeMinutos(evento: string): boolean {
  return EVENTOS.some((e) => e.valor === evento && 'minutos' in e && e.minutos === true);
}

export const MINUTOS_MIN = 5;
export const MINUTOS_MAX = 1380;

/** `null` quando está bom; senão o texto do erro. O banco recusa o mesmo (CHECK), mas aqui avisa antes. */
export function erroDosMinutos(minutos: unknown): string | null {
  const n = Number(minutos);
  if (minutos === '' || minutos == null || !Number.isInteger(n))
    return 'Informe os minutos, em número inteiro.';
  if (n < MINUTOS_MIN || n > MINUTOS_MAX)
    return `Os minutos ficam entre ${MINUTOS_MIN} e ${MINUTOS_MAX}.`;
  return null;
}

export interface Condicao {
  campo: string;
  operador: string;
  valor?: string;
}

export interface Acao {
  id?: string;
  action_type: string;
  config: Record<string, any>;
  sort_order: number;
}

export interface Regra {
  id: string;
  company_id: string;
  name: string;
  descricao: string | null;
  trigger_event: string;
  conditions: Condicao[];
  /** Parâmetro do gatilho por tempo: `{ minutos: 30 }`. */
  trigger_config?: { minutos?: number } | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  automation_actions?: Acao[];
}

export interface Execucao {
  id: string;
  regra: string;
  evento: string;
  lead_id: string | null;
  lead_nome: string | null;
  status: string;
  tentativas: number;
  erro: string | null;
  resultado: Array<{ acao: string; status: string; detalhe?: string }> | null;
  criado_em: string;
  terminado_em: string | null;
}

export const automationService = {
  async listarRegras(companyId: string): Promise<Regra[]> {
    const { data, error } = await supabase
      .from('automation_rules')
      .select('*, automation_actions(*)')
      .eq('company_id', companyId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Falha ao listar regras de automação', { error: error.message, companyId });
      throw error;
    }
    return (data ?? []) as unknown as Regra[];
  },

  async salvarRegra(p: {
    id?: string;
    companyId: string;
    name: string;
    descricao?: string;
    trigger_event: string;
    conditions: Condicao[];
    /** Só os gatilhos por tempo levam parâmetro (minutos). */
    minutos?: number | null;
    priority: number;
    is_active: boolean;
    acoes: Acao[];
  }): Promise<string> {
    const base = {
      company_id: p.companyId,
      name: p.name.trim(),
      descricao: p.descricao?.trim() || null,
      trigger_event: p.trigger_event,
      // Condição sem campo escolhido não é gravada: ela nunca casaria e ficaria
      // na tela parecendo que filtra algo.
      conditions: normalizarCondicoes(p.conditions),
      trigger_config: precisaDeMinutos(p.trigger_event) ? { minutos: p.minutos ?? null } : {},
      priority: p.priority,
      is_active: p.is_active,
      updated_at: new Date().toISOString(),
    };

    let ruleId = p.id;
    if (ruleId) {
      const { error } = await supabase.from('automation_rules').update(base).eq('id', ruleId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase
        .from('automation_rules')
        .insert(base)
        .select('id')
        .single();
      if (error) throw error;
      ruleId = (data as { id: string }).id;
    }

    // Ações: apaga e regrava. São poucas, a ordem importa, e assim não sobra
    // ação removida na tela.
    const { error: delErro } = await supabase
      .from('automation_actions')
      .delete()
      .eq('rule_id', ruleId);
    if (delErro) throw delErro;

    const validas = p.acoes.filter((a) => a.action_type);
    if (validas.length) {
      const { error } = await supabase.from('automation_actions').insert(
        validas.map((a, i) => ({
          rule_id: ruleId,
          company_id: p.companyId,
          action_type: a.action_type,
          config: a.config ?? {},
          sort_order: i,
        })),
      );
      if (error) throw error;
    }

    return ruleId!;
  },

  async alternarAtiva(id: string, ativa: boolean): Promise<void> {
    const { error } = await supabase
      .from('automation_rules')
      .update({ is_active: ativa, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  },

  async excluirRegra(id: string): Promise<void> {
    const { error } = await supabase.from('automation_rules').delete().eq('id', id);
    if (error) throw error;
  },

  async listarExecucoes(companyId: string, limite = 50): Promise<Execucao[]> {
    const { data, error } = await (supabase as any).rpc('automacao_execucoes', {
      p_company_id: companyId,
      p_limite: limite,
    });
    if (error) {
      logger.error('Falha ao listar execuções de automação', { error: error.message });
      throw error;
    }
    return (data ?? []) as Execucao[];
  },
};
