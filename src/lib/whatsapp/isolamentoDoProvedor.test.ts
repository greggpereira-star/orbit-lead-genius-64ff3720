import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Só `src/lib/whatsapp/evolution-provider.ts` pode importar `evolution.server`.
 *
 * É o que faz a troca para a Cloud API ser uma troca de provedor, e não uma
 * caçada a 7 arquivos — e o que impede alguém de, por pressa, chamar a Evolution
 * direto e contornar a política de envio.
 */
function arquivos(dir: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === ".omc" || nome === "node_modules") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, saida);
    else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(caminho);
  }
  return saida;
}

describe("isolamento do provedor", () => {
  const fontes = arquivos("src").filter((f) => !f.endsWith("routeTree.gen.ts"));

  it("ninguém fora do provedor importa evolution.server", () => {
    const infratores = fontes.filter((f) => {
      if (f.endsWith("src/lib/whatsapp/evolution-provider.ts")) return false;
      if (f.endsWith("src/lib/evolution.server.ts")) return false;
      // Import de verdade (estático ou dinâmico), não menção em comentário.
      return /(from\s+|import\(\s*)["'][^"']*evolution\.server["']/.test(readFileSync(f, "utf8"));
    });
    expect(infratores).toEqual([]);
  });

  it("e o provedor de fato importa (o teste não é vácuo)", () => {
    expect(readFileSync("src/lib/whatsapp/evolution-provider.ts", "utf8")).toContain(
      "../evolution.server",
    );
  });
});
