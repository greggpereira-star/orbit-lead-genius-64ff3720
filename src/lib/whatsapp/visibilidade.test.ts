import { describe, expect, it } from "vitest";
import {
  decidirVisibilidade,
  normalizarConfig,
  VISIBILIDADE_PADRAO,
  type ConfigDeVisibilidade,
} from "./visibilidade";

const EU = "u-eu";
const OUTRO = "u-outro";
const SO_MINHAS: ConfigDeVisibilidade = { modo: "so_minhas", verFila: true };
const SEM_FILA: ConfigDeVisibilidade = { modo: "so_minhas", verFila: false };

const ver = (o: Partial<Parameters<typeof decidirVisibilidade>[0]>) =>
  decidirVisibilidade({
    config: SO_MINHAS,
    papel: "member",
    userId: EU,
    assignedTo: OUTRO,
    segue: false,
    mencionado: false,
    ...o,
  });

describe("visibilidade das conversas", () => {
  it("o padrão é todo mundo ver tudo (nada muda sem configurar)", () => {
    expect(VISIBILIDADE_PADRAO).toEqual({ modo: "todas", verFila: true });
    expect(ver({ config: VISIBILIDADE_PADRAO })).toBe(true);
  });

  it("dono e administrador veem tudo mesmo no modo restrito", () => {
    expect(ver({ papel: "owner" })).toBe(true);
    expect(ver({ papel: "admin", config: SEM_FILA, assignedTo: null })).toBe(true);
  });

  it("atendente vê a dele e não vê a de outro", () => {
    expect(ver({ assignedTo: EU })).toBe(true);
    expect(ver({ assignedTo: OUTRO })).toBe(false);
  });

  it("a fila (sem responsável) depende da opção", () => {
    expect(ver({ assignedTo: null, config: SO_MINHAS })).toBe(true);
    expect(ver({ assignedTo: null, config: SEM_FILA })).toBe(false);
  });

  it("seguir ou ser mencionado dá acesso à conversa de outro", () => {
    expect(ver({ segue: true })).toBe(true);
    expect(ver({ mencionado: true })).toBe(true);
    expect(ver({ segue: true, config: SEM_FILA, assignedTo: null })).toBe(true);
  });

  it("somente leitura (viewer) também é restrito", () => {
    expect(ver({ papel: "viewer", assignedTo: OUTRO })).toBe(false);
    expect(ver({ papel: "viewer", assignedTo: EU })).toBe(true);
  });

  it("configuração lida do banco: valor estranho cai no padrão seguro", () => {
    expect(normalizarConfig(null)).toEqual({ modo: "todas", verFila: true });
    expect(normalizarConfig({ modo: "xpto", ver_fila: "sim" })).toEqual({ modo: "todas", verFila: true });
    expect(normalizarConfig({ modo: "so_minhas", ver_fila: false })).toEqual({ modo: "so_minhas", verFila: false });
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("visibilidade: ligação no servidor e no banco", () => {
  const f = ler("src/lib/whatsapp-atendimento.functions.ts");
  const m = ler("supabase/migrations/20261026100000_visibilidade_das_conversas.sql");

  it("conferirConversa também confere a visibilidade, com a mesma mensagem de inexistente", () => {
    const corpo = f.slice(f.indexOf("async function conferirConversa"), f.indexOf("const idConversa"));
    expect(corpo).toContain("podeVerConversa(");
    expect(corpo).toContain("userId");
    expect(corpo.match(/Conversa não encontrada\./g)?.length).toBe(2);
  });

  it("toda chamada passa o usuário da sessão", () => {
    const chamadas = f.match(/await conferirConversa\([^)]*\)/g) ?? [];
    expect(chamadas.length).toBeGreaterThan(15);
    for (const c of chamadas) expect(c).toContain("context.userId");
  });

  it("mídia, cancelar agendada e vincular/criar lead não escapam da regra", () => {
    for (const nome of ["obterMidiaWhatsApp", "cancelarMensagemAgendadaWhatsApp", "criarLeadDaConversaWhatsApp", "vincularConversaAoLeadWhatsApp"]) {
      const ini = f.indexOf(`export const ${nome}`);
      const fim = f.indexOf("\nexport const ", ini + 1);
      expect(f.slice(ini, fim < 0 ? undefined : fim), nome).toContain("conferirConversa(");
    }
  });

  it("só administrador altera a regra", () => {
    const ini = f.indexOf("export const salvarVisibilidadeWhatsApp");
    expect(f.slice(ini)).toContain("empresaParaAdministrar(");
  });

  it("migration: padrão 'todas', sem escrita pelo navegador e políticas nas cinco tabelas", () => {
    expect(m).toContain("DEFAULT 'todas'");
    expect(m).toContain("GRANT SELECT ON public.wa_visibilidade TO authenticated");
    for (const t of ["wa_conversations", "wa_messages", "wa_message_status_events", "wa_notes", "wa_scheduled_messages"])
      expect(m, t).toContain(`ON public.${t}`);
  });
});
