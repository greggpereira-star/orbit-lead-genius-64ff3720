// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const salvar = vi.fn(async (_: unknown) => ({ ok: true, adicionadas: 1, removidas: 0 }));
const listar = vi.fn(async () => [
  { page_id: "109877207517445", nome: "Drª Taciane Ladislau Magescky", categoria: "Psicóloga", selecionada: false, deOutraEmpresa: false },
  { page_id: "821676401282292", nome: "Sossae Empreendimentos", categoria: null, selecionada: false, deOutraEmpresa: true },
]);

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createServerFn: () => ({}),
}));
vi.mock("@/lib/meta-oauth.functions", () => ({
  listMetaPageCandidates: () => listar(),
  saveMetaPages: (a: unknown) => salvar(a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EscolherPaginasMeta } from "./EscolherPaginasMeta";

async function montar() {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const el = document.createElement("div");
  document.body.appendChild(el);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRoot(el);
  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <EscolherPaginasMeta aberto aoMudar={() => undefined} obrigatorio />
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
  salvar.mockClear();
});

describe("EscolherPaginasMeta", () => {
  it("lista as páginas, trava a de outra empresa e só envia a marcada", async () => {
    await montar();
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("Drª Taciane Ladislau Magescky");
    expect(texto).toContain("Sossae Empreendimentos");
    expect(texto).toContain("Já vinculada a outra empresa");

    const caixas = [...document.querySelectorAll<HTMLElement>('button[role="checkbox"]')];
    expect(caixas).toHaveLength(2);
    expect(caixas[0].hasAttribute("disabled")).toBe(false);
    expect(caixas[1].hasAttribute("disabled")).toBe(true);

    await act(async () => caixas[0].click());
    const botao = [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Salvar"))!;
    expect(botao.textContent).toContain("(1)");
    await act(async () => botao.click());
    expect(salvar).toHaveBeenCalledWith({ data: { pageIds: ["109877207517445"] } });
  });
});
