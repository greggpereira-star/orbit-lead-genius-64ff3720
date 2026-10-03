/**
 * Analytics.
 *
 * A versão anterior mostrava 2.845 leads, 842 qualificados, ROAS 4,8x e CAC de
 * R$ 1.250 — tudo inventado, sobra de template. O número real era 488 leads e
 * nenhum qualificado.
 *
 * Painel com número falso é pior que painel vazio: o vazio faz perguntar, o
 * falso faz decidir. Aqui tudo vem do banco, e o que não dá para calcular
 * aparece como "—" com o motivo, em vez de um zero que mente.
 */
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Users, Target, TrendingUp, DollarSign, Radar, Loader2, AlertCircle } from 'lucide-react';

import { useAuth } from '@/core/auth/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { NumeroHeroi } from '@/components/ui/numero-heroi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdIntelligenceCard } from '@/modules/analytics/components/AdIntelligenceCard';

interface Fatia { nome: string; valor: number }
interface Resumo {
  leads: number;
  /** `null` quando nenhuma etapa foi marcada como conversão. */
  qualificados: number | null;
  valor_total: number;
  com_identificador: number;
  tem_regua: boolean;
  por_origem: Fatia[];
  funil: Fatia[];
}

async function carregarResumo(companyId: string, dias: number): Promise<Resumo> {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const { data, error } = await (supabase as any).rpc('resumo_analytics', {
    p_company_id: companyId,
    p_desde: desde,
  });
  if (error) throw new Error(error.message);
  return data as Resumo;
}

function AnalyticsPage() {
  const { company } = useAuth();
  const companyId = company?.id ?? '';
  const [dias, setDias] = useState('30');

  const resumo = useQuery({
    queryKey: ['resumo-analytics', companyId, dias],
    queryFn: () => carregarResumo(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const r = resumo.data;
  const dinheiro = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  const taxa =
    r && r.qualificados !== null && r.leads > 0
      ? `${((r.qualificados / r.leads) * 100).toFixed(1)}%`
      : '—';

  const indicadores = [
    { titulo: 'Leads', valor: r ? String(r.leads) : '—', icone: Users },
    { titulo: 'Qualificados', valor: r?.qualificados === null ? '—' : String(r?.qualificados ?? '—'), icone: Target },
    { titulo: 'Taxa de qualificação', valor: taxa, icone: TrendingUp },
    { titulo: 'Valor em negócios', valor: r ? dinheiro(r.valor_total) : '—', icone: DollarSign },
    { titulo: 'Com origem rastreada', valor: r ? String(r.com_identificador) : '—', icone: Radar },
  ];

  const maiorFunil = Math.max(1, ...(r?.funil ?? []).map((f) => f.valor));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Todos os números vêm do seu banco. Nada aqui é exemplo.
          </p>
        </div>
        <Select value={dias} onValueChange={setDias}>
          <SelectTrigger className="h-9 w-40" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="365">Último ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {resumo.isLoading && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {/* O aviso vem ANTES dos números. Ver "Qualificados —" sem explicação faz
          a pessoa achar que o sistema está quebrado, quando falta configurar. */}
      {r && !r.tem_regua && (
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-muted-foreground">
            Nenhuma etapa do funil foi marcada como conversão, então não dá para medir
            qualificação. Configure em{' '}
            <span className="font-medium text-foreground">Pipeline → Gerenciar etapas</span>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {indicadores.map((i) => (
          <Card key={i.titulo}>
            <CardContent className="p-5">
              <NumeroHeroi
                rotulo={<><i.icone className="h-3.5 w-3.5" />{i.titulo}</>}
                valor={i.valor}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <AdIntelligenceCard companyId={companyId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Funil</CardTitle>
            <CardDescription>Onde os leads do período estão agora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(r?.funil ?? []).map((f) => (
              <div key={f.nome} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{f.nome}</span>
                  <span className="tabular-nums text-muted-foreground">{f.valor}</span>
                </div>
                {/* Barra proporcional à maior etapa, não ao total: com tudo numa
                    coluna só, dividir pelo total daria 100% e nenhuma informação. */}
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${(f.valor / maiorFunil) * 100}%` }} />
                </div>
              </div>
            ))}
            {!r?.funil?.length && !resumo.isLoading && (
              <p className="text-sm text-muted-foreground">Nenhuma etapa configurada.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Origem dos leads</CardTitle>
            <CardDescription>De onde vieram no período.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(r?.por_origem ?? []).map((o) => (
              <div key={o.nome} className="flex justify-between text-sm">
                <span className="capitalize">{o.nome}</span>
                <span className="tabular-nums font-medium">{o.valor}</span>
              </div>
            ))}
            {!r?.por_origem?.length && !resumo.isLoading && (
              <p className="text-sm text-muted-foreground">Nenhum lead no período.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_app/analytics')({
  component: AnalyticsPage,
});
