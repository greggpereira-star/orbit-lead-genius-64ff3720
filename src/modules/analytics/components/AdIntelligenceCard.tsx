import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Loader2, Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  relatorioDeCusto,
  marcarNomesRepetidos,
  totaisDeCusto,
} from "@/modules/analytics/services/adIntelligenceService";
import { GastoDoAnuncio } from "@/modules/analytics/components/GastoDoAnuncio";
import { ErroDeConsulta } from "@/modules/analytics/components/ErroDeConsulta";
import {
  AMOSTRA_MINIMA,
  alternarOrdem,
  amostraPequena,
  gastouSemLead,
  ordenarLinhas,
  totalDaTabela,
  type ColunaOrdenavel,
  type Ordem,
} from "@/modules/analytics/lib/anuncios";

/**
 * Qual anúncio traz lead que QUALIFICA.
 *
 * Volume de conversa é a métrica que engana: o anúncio mais barato por conversa
 * costuma ser o que atrai curioso. Esta tabela põe os dois números lado a lado
 * para a decisão de verba sair do segundo, e não do primeiro.
 *
 * Ela não decide por quem lê: mostra quantos leads existem por trás de cada custo
 * ("amostra pequena"), destaca o dinheiro que não trouxe lead e deixa ordenar.
 */
/** `dias` vem da página: um período só para todos os cards (antes cada card tinha o seu). */
export function AdIntelligenceCard({ companyId, dias }: { companyId: string; dias: string }) {
  const qc = useQueryClient();
  const [ordem, setOrdem] = useState<Ordem | null>(null);

  const relatorio = useQuery({
    queryKey: ["relatorio-anuncios", companyId, dias],
    queryFn: () => relatorioDeCusto(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });

  const linhas = useMemo(
    () => ordenarLinhas(marcarNomesRepetidos(relatorio.data ?? []), ordem),
    [relatorio.data, ordem],
  );
  const totais = useMemo(() => totaisDeCusto(relatorio.data ?? []), [relatorio.data]);
  const soma = useMemo(() => totalDaTabela(relatorio.data ?? []), [relatorio.data]);
  const temGasto = totais !== null;
  const temVenda = linhas.some((l) => l.vendas > 0);
  const semRegua = linhas.length > 0 && linhas.every((l) => l.taxa_qualificacao === null);

  const dinheiro = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  // Custo unitário pede centavos: R$ 7 e R$ 7,80 por lead são decisões diferentes.
  const dinheiroFino = (v: number) =>
    v.toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Função e NÃO componente: um componente declarado aqui dentro seria um tipo novo a
  // cada render, o React remontaria o botão a cada clique e o foco do teclado se perderia.
  const cabecalho = (coluna: ColunaOrdenavel, texto: string) => {
    const ativo = ordem?.coluna === coluna ? ordem.direcao : null;
    const Icone = ativo === "asc" ? ArrowUp : ativo === "desc" ? ArrowDown : ArrowUpDown;
    return (
      <th
        key={coluna}
        scope="col"
        aria-sort={ativo === "asc" ? "ascending" : ativo === "desc" ? "descending" : "none"}
        className="whitespace-nowrap pb-2 pr-3 text-right font-medium"
      >
        <button
          type="button"
          onClick={() => setOrdem(alternarOrdem(ordem, coluna))}
          className="inline-flex min-h-11 items-center gap-1 rounded px-1 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring md:min-h-0"
        >
          {texto}
          <Icone className={`h-3 w-3 ${ativo ? "text-foreground" : "opacity-50"}`} aria-hidden />
        </button>
      </th>
    );
  };

  // A primeira coluna fica à vista quando a tabela rola para o lado (celular).
  const fixa = "sticky left-0 z-[1] bg-[var(--superficie-cartao)]";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" aria-hidden />
              Qualidade por anúncio
            </CardTitle>
            <CardDescription>
              Quantos leads cada anúncio trouxe e quantos chegaram na etapa que você considera
              qualificada.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <GastoDoAnuncio
          onAtualizou={() => qc.invalidateQueries({ queryKey: ["relatorio-anuncios", companyId] })}
        />

        {totais && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Investido", dinheiro(totais.gasto)],
              [
                "Custo por lead",
                totais.custoPorLeadGeral === null ? "—" : dinheiroFino(totais.custoPorLeadGeral),
              ],
              [
                "Custo por qualificado",
                totais.custoPorQualificadoGeral === null
                  ? "—"
                  : dinheiroFino(totais.custoPorQualificadoGeral),
              ],
              [
                "ROAS (vendas ÷ gasto)",
                totais.roasGeral === null
                  ? "—"
                  : `${totais.roasGeral.toFixed(2).replace(".", ",")}x`,
              ],
            ].map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{rotulo}</div>
                <div className="mt-0.5 text-lg font-semibold tabular-nums">{valor}</div>
              </div>
            ))}
          </div>
        )}
        {totais && totais.gastoSemLead > 0 && (
          <p className="mb-3 text-xs text-muted-foreground">
            {dinheiro(totais.gastoSemLead)} foram gastos em anúncios que não trouxeram nenhum lead
            neste período.
          </p>
        )}

        {/* Sem régua a coluna de qualificação não tem como existir. Dizer isso,
            com o caminho para resolver, é melhor que uma tabela de zeros que
            parece dizer que nenhum anúncio presta. */}
        {semRegua && (
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-[var(--aviso-borda)] bg-[var(--aviso-suave)] p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aviso)]" aria-hidden />
            <p className="text-muted-foreground">
              Nenhuma etapa foi marcada como conversão ainda, então não dá para dizer quem
              qualificou. Configure em{" "}
              <span className="font-medium text-foreground">Pipeline → Gerenciar etapas</span>.
            </p>
          </div>
        )}

        {relatorio.isError && (
          <ErroDeConsulta
            titulo="Não foi possível carregar o relatório de anúncios."
            aoTentar={() => void relatorio.refetch()}
            tentando={relatorio.isFetching}
          />
        )}

        {relatorio.isLoading && (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Carregando…
          </div>
        )}

        {!relatorio.isLoading && !relatorio.isError && linhas.length === 0 && (
          <p className="py-6 text-sm text-muted-foreground">Nenhum lead de anúncio no período.</p>
        )}

        {linhas.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Desempenho de cada anúncio no período: gasto, leads, custo por lead, qualificados
                  e vendas. Os cabeçalhos com botão ordenam a tabela.
                </caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className={`${fixa} min-w-[10rem] pb-2 pr-3 font-medium`}>
                      Anúncio
                    </th>
                    {temGasto && cabecalho("gasto", "Gasto")}
                    {cabecalho("leads", "Leads")}
                    {temGasto && cabecalho("custo_lead", "Custo/lead")}
                    {cabecalho("qualificados", "Qualificados")}
                    {temGasto && cabecalho("custo_qualificado", "Custo/qualif.")}
                    {cabecalho("taxa", "Taxa")}
                    {temVenda && (
                      <th
                        scope="col"
                        className="whitespace-nowrap pb-2 pr-3 text-right font-medium"
                      >
                        Vendas
                      </th>
                    )}
                    <th
                      scope="col"
                      className="whitespace-nowrap pb-2 text-right font-medium"
                      title="Valor dos leads que chegaram à etapa qualificada (pipeline). Não é receita: a receita está em Vendas."
                    >
                      Pipeline
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.ad_id + l.campanha + l.rede} className="border-b last:border-0">
                      <th scope="row" className={`${fixa} py-2.5 pr-3 text-left font-normal`}>
                        <div className="font-medium">{l.ad_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.campanha}
                          {/* Nome repetido não é bug da tabela: o cliente duplicou
                              o criativo. O id desempata sem poluir quem não repete. */}
                          {l.repetido && l.ad_id !== "(sem anúncio)" && (
                            <> · id {l.ad_id.slice(-6)}</>
                          )}
                        </div>
                        {gastouSemLead(l) && (
                          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-[var(--aviso)]">
                            <AlertCircle className="h-3 w-3" aria-hidden /> Gastou e não trouxe lead
                          </div>
                        )}
                        {amostraPequena(l) && (
                          <Badge
                            variant="outline"
                            className="mt-1 font-normal"
                            title={`Menos de ${AMOSTRA_MINIMA} leads: o custo e a taxa variam muito com poucos casos. É uma regra prática, não uma garantia.`}
                          >
                            Amostra pequena
                          </Badge>
                        )}
                      </th>
                      {temGasto && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {l.gasto === null ? "—" : dinheiro(l.gasto)}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-right tabular-nums">{l.conversas}</td>
                      {temGasto && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {l.custo_por_lead === null ? "—" : dinheiroFino(l.custo_por_lead)}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-right font-medium tabular-nums">
                        {l.taxa_qualificacao === null ? "—" : l.qualificados}
                      </td>
                      {temGasto && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {l.custo_por_qualificado === null
                            ? "—"
                            : dinheiroFino(l.custo_por_qualificado)}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {l.taxa_qualificacao === null ? "—" : `${l.taxa_qualificacao}%`}
                      </td>
                      {temVenda && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {l.vendas > 0
                            ? `${l.vendas} · ${l.valor_ganho > 0 ? dinheiro(l.valor_ganho) : "sem valor"}`
                            : "—"}
                        </td>
                      )}
                      <td className="py-2.5 text-right tabular-nums">
                        {l.valor_total > 0 ? dinheiro(l.valor_total) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {linhas.length > 1 && (
                  <tfoot>
                    <tr className="border-t-2 font-medium">
                      <th scope="row" className={`${fixa} py-2.5 pr-3 text-left`}>
                        Total
                      </th>
                      {temGasto && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {dinheiro(totais.gasto)}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-right tabular-nums">{soma.leads}</td>
                      {temGasto && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {totais.custoPorLeadGeral === null
                            ? "—"
                            : dinheiroFino(totais.custoPorLeadGeral)}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {semRegua ? "—" : soma.qualificados}
                      </td>
                      {temGasto && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {totais.custoPorQualificadoGeral === null
                            ? "—"
                            : dinheiroFino(totais.custoPorQualificadoGeral)}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {soma.taxa === null ? "—" : `${soma.taxa}%`}
                      </td>
                      {temVenda && (
                        <td className="py-2.5 pr-3 text-right tabular-nums">
                          {soma.vendas} ·{" "}
                          {soma.valorGanho > 0 ? dinheiro(soma.valorGanho) : "sem valor"}
                        </td>
                      )}
                      <td className="py-2.5 text-right tabular-nums">
                        {soma.valorPipeline > 0 ? dinheiro(soma.valorPipeline) : "—"}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {temGasto && (
              <p className="mt-2 text-xs text-muted-foreground">
                O custo por lead do total divide o gasto por todos os leads do período, inclusive os
                sem anúncio identificado; por isso não é a média das linhas.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
