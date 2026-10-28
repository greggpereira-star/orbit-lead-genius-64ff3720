/**
 * Analytics.
 *
 * A versão anterior mostrava 2.845 leads, 842 qualificados, ROAS 4,8x e CAC de
 * R$ 1.250 — tudo inventado, sobra de template. O número real era 488 leads e
 * nenhum qualificado.
 *
 * Painel com número falso é pior que painel vazio: o vazio faz perguntar, o
 * falso faz decidir. Aqui tudo vem do banco, e o que não dá para calcular
 * aparece como "—" com o motivo, em vez de um zero que mente. Consulta que FALHA
 * também não pode parecer "sem dados": mostra erro, com a opção de tentar de novo.
 *
 * O período é UM só, na URL (`?dias=7`), e vale para a página inteira.
 */
import { useMemo } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Users, Target, TrendingUp, DollarSign, Radar, Loader2, AlertCircle } from 'lucide-react';

import { useAuth } from '@/core/auth/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { NumeroHeroi } from '@/components/ui/numero-heroi';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AdIntelligenceCard } from '@/modules/analytics/components/AdIntelligenceCard';
import { NotaDoComparativo } from '@/modules/analytics/components/NotaDoComparativo';
import { ErroDeConsulta } from '@/modules/analytics/components/ErroDeConsulta';
import { FunilDoPeriodo } from '@/modules/analytics/components/FunilDoPeriodo';
import { OrigemDosLeadsCard } from '@/modules/analytics/components/OrigemDosLeadsCard';
import { TempoDeRespostaCard } from '@/modules/analytics/components/TempoDeRespostaCard';
import { fatiasDeCanal } from '@/modules/analytics/lib/canais';
import { variacaoEmPontos, variacaoPercentual } from '@/modules/analytics/lib/comparativo';
import { analisarFunil } from '@/modules/analytics/lib/funil';
import { analisarResposta } from '@/modules/analytics/lib/resposta';
import {
  PERIODOS,
  fraseDoPeriodo,
  normalizarPeriodo,
  periodoDaUrl,
  periodoParaUrl,
  type PeriodoNaUrl,
} from '@/modules/analytics/lib/periodo';
import { comparativoDoPeriodo } from '@/modules/analytics/services/comparativoService';
import { funilDoPeriodo } from '@/modules/analytics/services/funilService';
import { origemDosLeads } from '@/modules/analytics/services/origemService';
import { tempoDeResposta } from '@/modules/analytics/services/respostaService';

interface Resumo {
  leads: number;
  /** `null` quando nenhuma etapa foi marcada como conversão. */
  qualificados: number | null;
  tem_regua: boolean;
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

const dinheiro = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function AnalyticsPage() {
  const { company } = useAuth();
  const companyId = company?.id ?? '';
  const dias = periodoDaUrl(Route.useSearch().dias);
  const navigate = Route.useNavigate();
  const mudarPeriodo = (v: string) =>
    void navigate({ search: { dias: periodoParaUrl(normalizarPeriodo(v)) }, replace: true });

  const resumo = useQuery({
    queryKey: ['resumo-analytics', companyId, dias],
    queryFn: () => carregarResumo(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  // Mesma consulta do card "Origem por canal" (chave idêntica): a tile e o card nunca divergem.
  const origem = useQuery({
    queryKey: ['origem-dos-leads', companyId, dias],
    queryFn: () => origemDosLeads(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const funil = useQuery({
    queryKey: ['funil-do-periodo', companyId, dias],
    queryFn: () => funilDoPeriodo(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const resposta = useQuery({
    queryKey: ['tempo-de-resposta', companyId, dias],
    queryFn: () => tempoDeResposta(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const comparativo = useQuery({
    queryKey: ['comparativo-do-periodo', companyId, dias],
    queryFn: () => comparativoDoPeriodo(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const analiseDeResposta = useMemo(
    () => (resposta.data ? analisarResposta(resposta.data) : null),
    [resposta.data],
  );

  const analise = useMemo(() => (funil.data ? analisarFunil(funil.data) : null), [funil.data]);
  const canais = origem.data ? fatiasDeCanal(origem.data) : null;
  const origemIdentificada =
    canais && canais.total > 0
      ? `${(((canais.total - canais.naoRastreados) / canais.total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
      : '—';

  const r = resumo.data;
  const taxa =
    r && r.qualificados !== null && r.leads > 0
      ? `${((r.qualificados / r.leads) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : '—';

  const vendasGanhas = analise ? dinheiro(analise.vendas.valor) : '—';
  const notaDeVendas = analise
    ? `${analise.vendas.quantidade} ${analise.vendas.quantidade === 1 ? 'venda' : 'vendas'} · ${dinheiro(analise.emNegociacao.valor)} em negociação`
    : undefined;

  // Comparação com o período anterior: só quando a janela anterior está completa.
  const cmp = comparativo.data?.disponivel ? comparativo.data : null;
  const contra = (variacao: string | null, antes: string) => (
    <span className="block">
      {variacao ?? 'sem base'} · antes: {antes}
    </span>
  );
  const pct = (v: number | null) =>
    v === null ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const deltaLeads = cmp && contra(variacaoPercentual(cmp.atual.leads, cmp.anterior.leads), String(cmp.anterior.leads));
  const deltaQualificados =
    cmp && cmp.atual.qualificados !== null && cmp.anterior.qualificados !== null
      ? contra(variacaoPercentual(cmp.atual.qualificados, cmp.anterior.qualificados), String(cmp.anterior.qualificados))
      : null;
  const deltaTaxa = cmp && contra(variacaoEmPontos(cmp.atual.taxa, cmp.anterior.taxa), pct(cmp.anterior.taxa));
  const deltaVendas = cmp && contra(variacaoPercentual(cmp.atual.valorGanho, cmp.anterior.valorGanho), dinheiro(cmp.anterior.valorGanho));
  const deltaOrigem =
    cmp && contra(variacaoEmPontos(cmp.atual.origemIdentificada, cmp.anterior.origemIdentificada), pct(cmp.anterior.origemIdentificada));

  const indicadores = [
    { titulo: 'Leads', valor: r ? String(r.leads) : '—', nota: deltaLeads || undefined, icone: Users },
    { titulo: 'Qualificados', valor: r?.qualificados === null ? '—' : String(r?.qualificados ?? '—'), nota: deltaQualificados || undefined, icone: Target },
    { titulo: 'Taxa de qualificação', valor: taxa, nota: deltaTaxa || undefined, icone: TrendingUp },
    {
      titulo: 'Vendas ganhas',
      valor: vendasGanhas,
      nota: notaDeVendas ? (
        <>
          <span className="block">{notaDeVendas}</span>
          {deltaVendas}
        </>
      ) : (
        deltaVendas || undefined
      ),
      icone: DollarSign,
    },
    { titulo: 'Origem identificada', valor: origemIdentificada, nota: deltaOrigem || undefined, icone: Radar },
  ];

  const falhou = resumo.isError || origem.isError || comparativo.isError;
  const tentando = resumo.isFetching || origem.isFetching || comparativo.isFetching;
  const tentarDeNovo = () => {
    if (resumo.isError) void resumo.refetch();
    if (origem.isError) void origem.refetch();
    if (comparativo.isError) void comparativo.refetch();
  };

  const atualizadoEm = resumo.dataUpdatedAt
    ? new Date(resumo.dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            {atualizadoEm ? `Atualizado às ${atualizadoEm}` : 'Carregando…'} · leads criados {fraseDoPeriodo(dias)}
          </p>
        </div>
        <Select value={dias} onValueChange={mudarPeriodo}>
          <SelectTrigger className="h-11 w-40 md:h-9" aria-label="Período de todos os números desta página">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => (
              <SelectItem key={p.valor} value={p.valor}>
                {p.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {resumo.isLoading && (
        <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      )}

      {falhou && <ErroDeConsulta aoTentar={tentarDeNovo} tentando={tentando} />}

      {/* O aviso vem ANTES dos números. Ver "Qualificados —" sem explicação faz
          a pessoa achar que o sistema está quebrado, quando falta configurar. */}
      {r && !r.tem_regua && (
        <div className="flex items-start gap-2.5 rounded-lg border border-[var(--aviso-borda)] bg-[var(--aviso-suave)] p-3 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aviso)]" aria-hidden />
          <p className="text-muted-foreground">
            Nenhuma etapa do funil foi marcada como conversão, então não dá para medir qualificação. Configure em{' '}
            <span className="font-medium text-foreground">Pipeline → Gerenciar etapas</span>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {indicadores.map((i, posicao) => (
          // Com 5 tiles, a última ocuparia meia linha sozinha no celular: ela fecha a linha.
          <Card key={i.titulo} className={posicao === indicadores.length - 1 ? 'col-span-2 xl:col-span-1' : undefined}>
            <CardContent className="p-5">
              <NumeroHeroi
                rotulo={
                  <>
                    <i.icone className="h-3.5 w-3.5" aria-hidden />
                    {i.titulo}
                  </>
                }
                valor={i.valor}
                nota={i.nota}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <NotaDoComparativo comparativo={comparativo.data} dias={dias} />

      <FunilDoPeriodo
        analise={analise}
        carregando={funil.isLoading}
        erro={funil.isError}
        aoTentar={() => void funil.refetch()}
        tentando={funil.isFetching}
      />

      <TempoDeRespostaCard
        analise={analiseDeResposta}
        carregando={resposta.isLoading}
        erro={resposta.isError}
        aoTentar={() => void resposta.refetch()}
        tentando={resposta.isFetching}
      />

      <AdIntelligenceCard companyId={companyId} dias={dias} />

      <OrigemDosLeadsCard companyId={companyId} dias={dias} />
    </div>
  );
}

export const Route = createFileRoute('/_app/analytics')({
  // Entrada opcional: links sem `?dias` (menu, paleta de comandos) continuam válidos e caem no padrão.
  validateSearch: (busca: { dias?: unknown }): { dias?: PeriodoNaUrl } => ({
    dias: periodoParaUrl(normalizarPeriodo(busca.dias)),
  }),
  component: AnalyticsPage,
});
