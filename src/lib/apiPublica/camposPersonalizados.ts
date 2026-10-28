/**
 * Valida os campos personalizados vindos da API contra as definições da empresa.
 *
 * Mesmas regras de `definir_campo_do_lead` no banco (número, data, lista de
 * opções, texto até 500), aplicadas ANTES de gravar: a API cria o lead e os
 * campos numa operação só, e não pode deixar um lead pela metade porque um
 * campo veio errado.
 */
export interface DefinicaoDeCampoApi {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options: string[];
}

export type ResultadoDeCampos =
  | { ok: true; valores: Record<string, string | number>; remover: string[] }
  | { ok: false; erro: string };

export function validarCamposPersonalizados(
  recebidos: Record<string, string | number | null>,
  definicoes: readonly DefinicaoDeCampoApi[],
): ResultadoDeCampos {
  const porChave = new Map(definicoes.map((d) => [d.key, d]));
  const valores: Record<string, string | number> = {};
  const remover: string[] = [];

  for (const [chave, bruto] of Object.entries(recebidos)) {
    const def = porChave.get(chave);
    if (!def)
      return { ok: false, erro: `custom_fields.${chave}: campo não existe ou está inativo` };

    const txt = bruto == null ? "" : String(bruto).trim();
    if (txt === "") {
      remover.push(chave);
      continue;
    }

    if (def.type === "number") {
      if (!/^-?[0-9]+([.,][0-9]+)?$/.test(txt)) {
        return { ok: false, erro: `custom_fields.${chave}: ${def.label} deve ser um número` };
      }
      valores[chave] = Number(txt.replace(",", "."));
    } else if (def.type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(txt) || Number.isNaN(Date.parse(txt)) || !dataExiste(txt)) {
        return {
          ok: false,
          erro: `custom_fields.${chave}: ${def.label} deve ser uma data AAAA-MM-DD`,
        };
      }
      valores[chave] = txt;
    } else if (def.type === "select") {
      if (!def.options.includes(txt)) {
        return {
          ok: false,
          erro: `custom_fields.${chave}: "${txt}" não é uma opção de ${def.label}`,
        };
      }
      valores[chave] = txt;
    } else {
      if (txt.length > 500) {
        return { ok: false, erro: `custom_fields.${chave}: texto muito longo (máx. 500)` };
      }
      valores[chave] = txt;
    }
  }
  return { ok: true, valores, remover };
}

/** `2026-02-31` passa no formato mas não existe; o Date.parse do V8 o aceita e vira 3 de março. */
function dataExiste(iso: string): boolean {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Aplica o resultado sobre os campos atuais do lead (merge; vazio remove a chave). */
export function mesclarCampos(
  atuais: Record<string, unknown> | null | undefined,
  r: Extract<ResultadoDeCampos, { ok: true }>,
): Record<string, unknown> {
  const saida: Record<string, unknown> = { ...(atuais ?? {}), ...r.valores };
  for (const k of r.remover) delete saida[k];
  return saida;
}
