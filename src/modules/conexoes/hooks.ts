import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listarConexoesWhatsApp,
  obterSaudeDaConexaoWhatsApp,
  obterValidadeDoTokenWhatsApp,
} from "@/lib/whatsapp-cloud.functions";
import type { Conexao } from "@/lib/whatsapp/cloud/conexoes";
import type { ValidadeDoToken } from "@/lib/whatsapp/cloud/validadeDoToken";
import type { SaudeDaConexao } from "@/lib/whatsapp/cloud/saudeDoNumero";

export const chavesDeConexoes = {
  lista: ["conexoes"] as const,
  saude: (id: string) => ["conexao-saude", id] as const,
};

export function useConexoes() {
  const buscar = useServerFn(listarConexoesWhatsApp);
  return useQuery({
    queryKey: chavesDeConexoes.lista,
    queryFn: () => buscar() as Promise<Conexao[]>,
    staleTime: 30_000,
  });
}

type RespostaDeSaude = { ok: true; saude: SaudeDaConexao } | { ok: false; texto: string };

/**
 * Saúde de cada conexão OFICIAL, lida da Meta. É uma chamada externa por número, então cada uma é
 * uma consulta própria (uma que falha não derruba as outras) e a lista não espera por elas.
 */
export function useSaudeDasConexoes(conexoes: Conexao[]) {
  const buscar = useServerFn(obterSaudeDaConexaoWhatsApp);
  const oficiais = conexoes.filter((c) => c.tipo === "oficial");
  const resultados = useQueries({
    queries: oficiais.map((c) => ({
      queryKey: chavesDeConexoes.saude(c.id),
      queryFn: () => buscar({ data: { phoneNumberId: c.id } }) as Promise<RespostaDeSaude>,
      staleTime: 60_000,
      retry: false,
    })),
  });
  const saudes = new Map<string, SaudeDaConexao | null>();
  oficiais.forEach((c, i) => {
    const d = resultados[i]?.data;
    saudes.set(c.id, d && d.ok ? d.saude : null);
  });
  return saudes;
}

export function useSaudeDaConexao(phoneNumberId: string | null) {
  const buscar = useServerFn(obterSaudeDaConexaoWhatsApp);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: chavesDeConexoes.saude(phoneNumberId ?? ""),
    enabled: Boolean(phoneNumberId),
    queryFn: () => buscar({ data: { phoneNumberId: phoneNumberId! } }) as Promise<RespostaDeSaude>,
    staleTime: 60_000,
    retry: false,
  });
  const d = q.data;
  return {
    saude: d && d.ok ? d.saude : null,
    carregando: q.isFetching,
    erro: q.isError ? "Não consegui consultar a Meta agora." : d && !d.ok ? d.texto : null,
    atualizar: () =>
      qc.invalidateQueries({ queryKey: chavesDeConexoes.saude(phoneNumberId ?? "") }),
  };
}

export function useValidadeDoToken(phoneNumberId: string | null) {
  const buscar = useServerFn(obterValidadeDoTokenWhatsApp);
  const q = useQuery({
    queryKey: ["conexao-token", phoneNumberId ?? ""],
    enabled: Boolean(phoneNumberId),
    queryFn: () =>
      buscar({ data: { phoneNumberId: phoneNumberId! } }) as Promise<
        { ok: true; validade: ValidadeDoToken } | { ok: false; texto: string }
      >,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const d = q.data;
  return {
    validade: d && d.ok ? d.validade : null,
    erro: q.isError ? "Não consegui consultar a Meta agora." : d && !d.ok ? d.texto : null,
  };
}
