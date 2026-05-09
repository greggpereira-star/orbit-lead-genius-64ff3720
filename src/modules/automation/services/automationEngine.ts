import { supabase } from '@/lib/supabase';

export interface AutomationTrigger {
  event: string;
  payload: any;
  companyId: string;
}

export const automationEngine = {
  async dispatch(trigger: AutomationTrigger) {
    console.log('[AutomationEngine] Dispatching event:', trigger.event);
    
    // 1. Fetch Active Rules
    const { data: rules } = await supabase
      .from('automation_rules')
      .select(`
        *,
        conditions:automation_conditions(*),
        actions:automation_actions(*)
      `)
      .eq('company_id', trigger.companyId)
      .eq('trigger_event', trigger.event)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (!rules || rules.length === 0) return;

    // 2. Process Rules Async
    for (const rule of rules) {
      this.executeRule(rule, trigger);
    }
  },

  async executeRule(rule: any, trigger: AutomationTrigger) {
    const executionId = crypto.randomUUID();
    const startTime = Date.now();

    try {
      // 3. Register Execution
      await supabase.from('automation_executions').insert({
        id: executionId,
        rule_id: rule.id,
        company_id: trigger.companyId,
        trigger_payload: trigger.payload,
        status: 'running',
        started_at: new Date().toISOString()
      });

      // 4. Validate Conditions
      const passed = rule.conditions.every((cond: any) => {
        const val = trigger.payload[cond.field];
        switch (cond.operator) {
          case 'eq': return val == cond.value;
          case 'gt': return val > Number(cond.value);
          case 'lt': return val < Number(cond.value);
          case 'contains': return String(val).includes(cond.value);
          default: return false;
        }
      });

      if (!passed) {
        await this.finalizeExecution(executionId, 'skipped', startTime);
        return;
      }

      // 5. Execute Actions
      for (const action of rule.actions) {
        await this.processAction(action, trigger.payload);
      }

      await this.finalizeExecution(executionId, 'completed', startTime);

    } catch (error: any) {
      console.error('[AutomationEngine] Execution failed:', error);
      await this.finalizeExecution(executionId, 'failed', startTime, error.message);
      
      // Send to Dead Letter Queue if failed
      await supabase.from('dead_letter_queue').insert({
        origin_table: 'automation_executions',
        origin_id: executionId,
        company_id: trigger.companyId,
        payload: { rule, trigger },
        last_error: error.message
      });
    }
  },

  async processAction(action: any, payload: any) {
    // Action Processor (resumo)
    switch (action.action_type) {
      case 'send_whatsapp':
        console.log('Sending WhatsApp via integration...');
        break;
      case 'assign_broker':
        console.log('Assigning broker...');
        break;
      case 'trigger_webhook':
        console.log('Triggering external webhook...');
        break;
    }
  },

  async finalizeExecution(id: string, status: string, startTime: number, error?: string) {
    await supabase.from('automation_executions').update({
      status,
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startTime,
      error_log: error ? [{ time: new Date().toISOString(), message: error }] : []
    }).eq('id', id);
  }
};
