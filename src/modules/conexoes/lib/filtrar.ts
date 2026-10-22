import type { Conexao, EstadoDaConexao, TipoDeConexao } from "@/lib/whatsapp/cloud/conexoes";

export interface FiltroDeConexoes {
  busca: string;
  tipo: TipoDeConexao | "todos";
  estado: EstadoDaConexao | "todos";
}

export const FILTRO_VAZIO: FiltroDeConexoes = { busca: "", tipo: "todos", estado: "todos" };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca por nome, número, tipo ou provedor (pelo que a pessoa vê). O estado filtrado é o
 * EFETIVO (já corrigido pela Meta), por isso vem de fora.
 */
export function filtrarConexoes(
  lista: Conexao[],
  f: FiltroDeConexoes,
  estadoDe: (c: Conexao) => EstadoDaConexao,
): Conexao[] {
  const busca = semAcento(f.busca.trim());
  const digitos = f.busca.replace(/\D/g, "");
  return lista.filter((c) => {
    if (f.tipo !== "todos" && c.tipo !== f.tipo) return false;
    if (f.estado !== "todos" && estadoDe(c) !== f.estado) return false;
    if (!busca) return true;
    const palheiro = semAcento([c.nome, c.tipoRotulo, c.provedor, c.telefone ?? ""].join(" "));
    if (palheiro.includes(busca)) return true;
    return digitos.length >= 3 && (c.telefone ?? "").replace(/\D/g, "").includes(digitos);
  });
}

export const temFiltro = (f: FiltroDeConexoes) =>
  f.busca.trim() !== "" || f.tipo !== "todos" || f.estado !== "todos";
