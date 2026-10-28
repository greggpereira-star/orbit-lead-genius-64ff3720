/**
 * Leitura do funil do período para quem decide.
 *
 * O funil antigo só desenhava barras proporcionais à maior etapa: com 639 leads na
 * primeira etapa e 3 na seguinte, a segunda virava 1 px e o gargalo — lead que
 * ninguém move — ficava invisível. Aqui a barra é a FATIA do total (com piso, para
 * etapa pequena continuar visível) e o que importa vira texto: onde está a maioria
 * e quantos estão parados há mais de 24 h.
 */
export interface EtapaDoFunil {
  stage_id: string;
  nome: string;
  kind: "open" | "won" | "lost" | string;
  ordem: number;
  leads: number;
  valor: number;
  parados_24h: number;
  /** Idade média na etapa, em horas (só etapa aberta). `null` sem lead. */
  horas_medias: number | null;
}

export interface LinhaDoFunil extends EtapaDoFunil {
  /** Fatia do total de leads do período, 0–100 com uma casa. */
  percentual: number;
  /** Largura da barra, 0–100. Etapa com lead nunca some: piso de 2%. */
  barra: number;
}

export interface AnaliseDoFunil {
  total: number;
  linhas: LinhaDoFunil[];
  /** Etapa ABERTA que concentra 80% ou mais dos leads (com pelo menos 10 leads no período). */
  gargalo: { nome: string; leads: number; percentual: number } | null;
  /** Leads em etapa aberta há mais de 24 h, e a etapa onde mais se acumulam. */
  parados: { total: number; etapa: string; naEtapa: number; horasMedias: number | null } | null;
  vendas: { quantidade: number; valor: number };
  emNegociacao: { quantidade: number; valor: number };
  perdidos: number;
}

export const LIMIAR_DE_GARGALO = 0.8;
export const MINIMO_PARA_GARGALO = 10;

const n = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v) || 0);

export function analisarFunil(brutas: EtapaDoFunil[]): AnaliseDoFunil {
  const etapas = brutas.map((e) => ({
    ...e,
    leads: n(e.leads),
    valor: n(e.valor),
    parados_24h: n(e.parados_24h),
    ordem: n(e.ordem),
    horas_medias:
      e.horas_medias === null || e.horas_medias === undefined ? null : Number(e.horas_medias),
  }));
  const total = etapas.reduce((s, e) => s + e.leads, 0);

  const linhas: LinhaDoFunil[] = etapas.map((e) => {
    const percentual = total > 0 ? Math.round((e.leads / total) * 1000) / 10 : 0;
    return { ...e, percentual, barra: e.leads > 0 ? Math.max(percentual, 2) : 0 };
  });

  const abertas = linhas.filter((l) => l.kind === "open");
  const maior = [...abertas].sort((a, b) => b.leads - a.leads)[0];
  const gargalo =
    maior && total >= MINIMO_PARA_GARGALO && maior.leads / total >= LIMIAR_DE_GARGALO
      ? { nome: maior.nome, leads: maior.leads, percentual: maior.percentual }
      : null;

  const totalParados = abertas.reduce((s, l) => s + l.parados_24h, 0);
  const pior = [...abertas].sort((a, b) => b.parados_24h - a.parados_24h)[0];
  const parados =
    totalParados > 0 && pior
      ? {
          total: totalParados,
          etapa: pior.nome,
          naEtapa: pior.parados_24h,
          horasMedias: pior.horas_medias,
        }
      : null;

  const soma = (lista: LinhaDoFunil[]) => ({
    quantidade: lista.reduce((s, l) => s + l.leads, 0),
    valor: lista.reduce((s, l) => s + l.valor, 0),
  });

  return {
    total,
    linhas,
    gargalo,
    parados,
    vendas: soma(linhas.filter((l) => l.kind === "won")),
    emNegociacao: soma(abertas),
    perdidos: linhas.filter((l) => l.kind === "lost").reduce((s, l) => s + l.leads, 0),
  };
}
