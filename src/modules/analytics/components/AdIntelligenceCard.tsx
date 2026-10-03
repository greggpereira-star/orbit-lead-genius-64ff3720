import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Megaphone, AlertCircle, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { relatorioAnuncios, marcarNomesRepetidos } from '@/modules/analytics/services/adIntelligenceService';

/**
 * Qual anúncio traz lead que QUALIFICA.
 *
 * Volume de conversa é a métrica que engana: o anúncio mais barato por conversa
 * costuma ser o que atrai curioso. Esta tabela põe os dois números lado a lado
 * para a decisão de verba sair do segundo, e não do primeiro.
 */
export function AdIntelligenceCard({ companyId }: { companyId: string }) {
  const [dias, setDias] = useState('90');

  const relatorio = useQuery({
    queryKey: ['relatorio-anuncios', companyId, dias],
    queryFn: () => relatorioAnuncios(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const linhas = useMemo(() => marcarNomesRepetidos(relatorio.data ?? []), [relatorio.data]);
  const semRegua = linhas.length > 0 && linhas.every((l) => l.taxa_qualificacao === null);

  const dinheiro = (v: number) =>
    v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              Qualidade por anúncio
            </CardTitle>
            <CardDescription>
              Quantos viraram conversa e quantos chegaram na etapa que você considera qualificada.
            </CardDescription>
          </div>
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="h-9 w-36" aria-label="Período do relatório">
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
      </CardHeader>

      <CardContent>
        {/* Sem régua a coluna de qualificação não tem como existir. Dizer isso,
            com o caminho para resolver, é melhor que uma tabela de zeros que
            parece dizer que nenhum anúncio presta. */}
        {semRegua && (
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-muted-foreground">
              Nenhuma etapa foi marcada como conversão ainda, então não dá para dizer quem
              qualificou. Configure em{' '}
              <span className="font-medium text-foreground">Pipeline → Gerenciar etapas</span>.
            </p>
          </div>
        )}

        {relatorio.isLoading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}

        {!relatorio.isLoading && linhas.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Nenhum lead de anúncio no período.</p>
        )}

        {linhas.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Anúncio</th>
                  <th className="pb-2 pr-3 text-right font-medium">Conversas</th>
                  <th className="pb-2 pr-3 text-right font-medium">Qualificados</th>
                  <th className="pb-2 pr-3 text-right font-medium">Taxa</th>
                  <th className="pb-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.ad_id + l.campanha} className="border-b last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{l.ad_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.campanha}
                        {/* Nome repetido não é bug da tabela: o cliente duplicou
                            o criativo. O id desempata sem poluir quem não repete. */}
                        {l.repetido && l.ad_id !== '(sem anúncio)' && <> · id {l.ad_id.slice(-6)}</>}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{l.conversas}</td>
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums">
                      {l.taxa_qualificacao === null ? '—' : l.qualificados}
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {l.taxa_qualificacao === null ? '—' : `${l.taxa_qualificacao}%`}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {l.valor_total > 0 ? dinheiro(l.valor_total) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
