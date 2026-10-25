// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Papel × configuração, pelos hooks de verdade (não só pelas funções puras):
 * o contexto de login e o banco entram simulados, e o que sai é o que a tela decide
 * mostrar. É o mais perto de "logar como atendente" que dá sem uma conta de teste.
 */
const estado: { papel: string | undefined; linha: Record<string, unknown> | null } = {
  papel: "owner",
  linha: null,
};

vi.mock("@/core/auth/hooks/useAuth", () => ({
  useAuth: () => ({ company: { id: "c1" }, membership: estado.papel ? { role: estado.papel } : null }),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: estado.linha, error: null }) }),
      }),
    }),
  },
}));

import {
  usePodeExcluirLeads,
  usePodeExportar,
  usePodeGerenciar,
  useSomenteLeitura,
} from "./usePermissoes";

function Sonda() {
  const r = {
    excluir: usePodeExcluirLeads(),
    exportar: usePodeExportar(),
    etapas: usePodeGerenciar("etapas"),
    etiquetas: usePodeGerenciar("etiquetas"),
    campos: usePodeGerenciar("campos"),
    leitura: useSomenteLeitura(),
  };
  return createElement("pre", { id: "r" }, JSON.stringify(r));
}

async function medir(papel: string | undefined, linha: Record<string, unknown> | null) {
  estado.papel = papel;
  estado.linha = linha;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(el);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: qc }, createElement(Sonda)));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
  const out = JSON.parse(el.querySelector("#r")!.textContent!);
  await act(async () => root.unmount());
  el.remove();
  return out as Record<string, boolean>;
}

const TUDO_LIGADO = {
  membros_excluem_leads: true,
  membros_exportam: true,
  membros_gerenciam_etapas: true,
  membros_criam_etiquetas: true,
  membros_criam_campos: true,
};
const TUDO_DESLIGADO = {
  membros_excluem_leads: false,
  membros_exportam: false,
  membros_gerenciam_etapas: false,
  membros_criam_etiquetas: false,
  membros_criam_campos: false,
};
const PODE_TUDO = { excluir: true, exportar: true, etapas: true, etiquetas: true, campos: true, leitura: false };

describe("papel × configuração, pelos hooks", () => {
  it("dono e administrador podem tudo, com qualquer configuração", async () => {
    for (const papel of ["owner", "admin"])
      for (const linha of [null, TUDO_DESLIGADO, TUDO_LIGADO])
        expect(await medir(papel, linha), `${papel}`).toEqual(PODE_TUDO);
  });

  it("atendente sem configuração (padrão): só etiqueta; nada de excluir, exportar, etapas, campos", async () => {
    expect(await medir("member", null)).toEqual({
      excluir: false, exportar: false, etapas: false, etiquetas: true, campos: false, leitura: false,
    });
  });

  it("atendente com tudo desligado: nem etiqueta nova", async () => {
    expect(await medir("member", TUDO_DESLIGADO)).toEqual({
      excluir: false, exportar: false, etapas: false, etiquetas: false, campos: false, leitura: false,
    });
  });

  it("atendente com tudo ligado: pode tudo e não é somente leitura", async () => {
    expect(await medir("member", TUDO_LIGADO)).toEqual(PODE_TUDO);
  });

  it("cada chave liga só a sua permissão", async () => {
    const so = (chave: string) => ({ ...TUDO_DESLIGADO, [chave]: true });
    expect(await medir("member", so("membros_excluem_leads"))).toMatchObject({ excluir: true, exportar: false, etapas: false, campos: false });
    expect(await medir("member", so("membros_exportam"))).toMatchObject({ excluir: false, exportar: true, etapas: false, campos: false });
    expect(await medir("member", so("membros_gerenciam_etapas"))).toMatchObject({ excluir: false, exportar: false, etapas: true, campos: false });
    expect(await medir("member", so("membros_criam_campos"))).toMatchObject({ excluir: false, exportar: false, etapas: false, campos: true });
  });

  it("visualizador é somente leitura e não pode nada, nem com tudo ligado", async () => {
    const sem = { excluir: false, exportar: false, etapas: false, etiquetas: false, campos: false, leitura: true };
    for (const linha of [null, TUDO_DESLIGADO, TUDO_LIGADO]) expect(await medir("viewer", linha)).toEqual(sem);
  });

  it("papel desconhecido ou ausente não ganha nada e não esconde a tela por engano", async () => {
    const r = await medir(undefined, TUDO_LIGADO);
    expect(r).toEqual({ excluir: false, exportar: false, etapas: false, etiquetas: false, campos: false, leitura: false });
  });
});
