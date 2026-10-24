import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import {
  normalizarPermissoes,
  podeExcluirLeads,
  somenteLeitura,
  PERMISSOES_PADRAO,
  type PermissoesDaEmpresa,
} from "./permissoes";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const chavePermissoes = (companyId: string | undefined) => ["permissoes-da-empresa", companyId];

/** Permissões da empresa ativa. Enquanto carrega (ou se falhar) vale o padrão, o mais restrito. */
export function usePermissoesDaEmpresa(): PermissoesDaEmpresa & { carregando: boolean } {
  const { company } = useAuth();
  const companyId = company?.id;
  const q = useQuery({
    queryKey: chavePermissoes(companyId),
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_permissoes")
        .select("membros_excluem_leads")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return normalizarPermissoes(data);
    },
  });
  return { ...(q.data ?? PERMISSOES_PADRAO), carregando: q.isLoading };
}

export function usePodeExcluirLeads(): boolean {
  const { membership } = useAuth();
  const p = usePermissoesDaEmpresa();
  return podeExcluirLeads(membership?.role, p);
}

/** Verdadeiro só quando o papel é conhecido e é visualizador (carregando não esconde nada). */
export function useSomenteLeitura(): boolean {
  const { membership } = useAuth();
  return somenteLeitura(membership?.role);
}
