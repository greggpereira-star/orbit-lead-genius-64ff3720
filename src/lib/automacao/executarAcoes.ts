/**
 * Executa as ações de uma regra para um job, SEM repetir o que já deu certo.
 *
 * O laço antigo rodava TODAS as ações a cada tentativa. Com uma regra
 * "enviar mensagem → mover etapa", uma falha em "mover etapa" fazia o job ser
 * retentado e a mensagem sair DE NOVO — até 4 vezes. Para envio ao cliente isso
 * é pior que a falha original: é spam para quem o produto deveria proteger.
 *
 * Aqui, o resultado de cada ação é identificado pelo id dela. Na tentativa
 * seguinte, quem já terminou em `ok` (ou foi `pulada` por decisão) é carregado
 * sem executar; só `falhou` e o que nunca rodou vai de novo.
 */

export interface ResultadoDeAcao {
  /** Id da ação (`automation_actions.id`). */
  id: string;
  acao: string;
  status: "ok" | "pulada" | "falhou";
  detalhe?: string;
}

export interface AcaoDoJob {
  id: string;
  action_type: string;
  sort_order: number;
}

export interface SaidaDoJob {
  resultados: ResultadoDeAcao[];
  algumaFalhou: boolean;
  /** Quantas ações foram realmente executadas nesta tentativa. */
  executadas: number;
}

export async function executarAcoes(
  acoes: AcaoDoJob[],
  anteriores: ResultadoDeAcao[] | null | undefined,
  executarUma: (acao: AcaoDoJob) => Promise<Omit<ResultadoDeAcao, "id">>,
): Promise<SaidaDoJob> {
  const feitas = new Map<string, ResultadoDeAcao>();
  for (const r of Array.isArray(anteriores) ? anteriores : []) {
    // `pulada` NÃO se repete: foi uma decisão (opt-out, fora do horário). Rodar
    // de novo no próximo minuto trocaria "decidimos não enviar" por "enviou
    // porque o horário abriu" — e o lead teria sido avisado fora do combinado.
    if (r && typeof r.id === "string" && (r.status === "ok" || r.status === "pulada"))
      feitas.set(r.id, r);
  }

  const resultados: ResultadoDeAcao[] = [];
  let executadas = 0;
  for (const acao of acoes) {
    const anterior = feitas.get(acao.id);
    if (anterior) {
      resultados.push(anterior);
      continue;
    }
    const r = await executarUma(acao);
    executadas += 1;
    resultados.push({ ...r, id: acao.id });
  }

  return { resultados, algumaFalhou: resultados.some((r) => r.status === "falhou"), executadas };
}
