import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Trophy, Target, Settings2, Loader2, Save } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface ScoringRule {
  id?: string;
  field_id: string;
  rule_type: string;
  condition: { value: any };
  score_delta: number;
  tag_to_apply?: string;
}

interface FormScoringPanelProps {
  formId: string;
  companyId: string;
  fields: any[];
}

export function FormScoringPanel({ formId, companyId, fields }: FormScoringPanelProps) {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchRules = async () => {
      const { data, error } = await supabase
        .from('form_scoring_rules')
        .select('*')
        .eq('form_id', formId);
      
      if (data) setRules(data);
      setLoading(false);
    };
    fetchRules();
  }, [formId]);

  const addRule = () => {
    setRules([...rules, { 
      field_id: fields[0]?.id || '', 
      rule_type: 'answer_equals', 
      condition: { value: '' }, 
      score_delta: 10 
    }]);
  };

  const updateRule = (index: number, data: Partial<ScoringRule>) => {
    const newRules = [...rules];
    newRules[index] = { ...newRules[index], ...data };
    setRules(newRules);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      // Clean up and save
      await supabase.from('form_scoring_rules').delete().eq('form_id', formId);
      
      const { error } = await supabase.from('form_scoring_rules').insert(
        rules.map(r => ({
          ...r,
          form_id: formId,
          company_id: companyId
        }))
      );

      if (error) throw error;
      toast.success('Regras de scoring salvas com sucesso');
    } catch (err: any) {
      toast.error('Erro ao salvar regras: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin inline mr-2" /> Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold">Lead Scoring Builder</h3>
          <p className="text-xs text-muted-foreground">Configure como cada resposta afeta a pontuação do lead.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={addRule} className="gap-2">
            <Plus className="h-4 w-4" /> Adicionar Regra
          </Button>
          <Button size="sm" onClick={saveRules} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar Regras
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {rules.length === 0 ? (
          <Card className="p-12 border-dashed bg-muted/30 text-center">
            <Trophy className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground">Nenhuma regra configurada. Comece adicionando uma regra acima.</p>
          </Card>
        ) : (
          rules.map((rule, idx) => (
            <Card key={idx} className="p-4 bg-card shadow-sm border group">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Label className="text-[10px] uppercase font-bold tracking-widest opacity-60">Campo</Label>
                  <select 
                    className="w-full h-9 rounded-md border bg-background text-sm px-3"
                    value={rule.field_id}
                    onChange={(e) => updateRule(idx, { field_id: e.target.value })}
                  >
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>{f.label}</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 min-w-[150px]">
                  <Label className="text-[10px] uppercase font-bold tracking-widest opacity-60">Condição</Label>
                  <select 
                    className="w-full h-9 rounded-md border bg-background text-sm px-3"
                    value={rule.rule_type}
                    onChange={(e) => updateRule(idx, { rule_type: e.target.value })}
                  >
                    <option value="answer_equals">Igual a</option>
                    <option value="answer_contains">Contém</option>
                    <option value="number_greater_than">Maior que</option>
                  </select>
                </div>

                <div className="flex-1 min-w-[150px]">
                  <Label className="text-[10px] uppercase font-bold tracking-widest opacity-60">Valor</Label>
                  <Input 
                    className="h-9"
                    value={rule.condition.value}
                    onChange={(e) => updateRule(idx, { condition: { value: e.target.value } })}
                  />
                </div>

                <div className="w-24">
                  <Label className="text-[10px] uppercase font-bold tracking-widest opacity-60">Score +/-</Label>
                  <Input 
                    type="number"
                    className="h-9"
                    value={rule.score_delta}
                    onChange={(e) => updateRule(idx, { score_delta: parseInt(e.target.value) })}
                  />
                </div>

                <div className="pt-6">
                  <Button variant="ghost" size="icon" onClick={() => removeRule(idx)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
