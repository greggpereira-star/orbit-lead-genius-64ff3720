import type { Comparativo } from "@/modules/analytics/lib/comparativo";

/**
 * O que o leitor precisa saber para não ler a comparação errado: o que está sendo
 * comparado, o viés de coorte, e quando NÃO há comparação (e por quê).
 */
export function NotaDoComparativo({
  comparativo,
  dias,
}: {
  comparativo: Comparativo | undefined;
  dias: string;
}) {
  if (!comparativo) return null;

  if (!comparativo.disponivel) {
    return (
      <p className="text-xs text-muted-foreground">
        {comparativo.motivo === "incompleto"
          ? `Sem comparação com o período anterior: os dados começam em ${comparativo.dadosDesde.toLocaleDateString("pt-BR")}, e os ${dias} dias anteriores começariam antes disso.`
          : "Sem comparação com o período anterior: ainda não há leads suficientes para formar duas janelas."}
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      Comparado com os {dias} dias anteriores, contando leads criados em cada janela. Os leads do
      período anterior tiveram mais tempo para avançar, então qualificados e vendas tendem a
      favorecê-lo.
      {comparativo.baseAnteriorPequena &&
        ` O período anterior tem só ${comparativo.anterior.leads} leads: a variação balança com facilidade.`}
    </p>
  );
}
