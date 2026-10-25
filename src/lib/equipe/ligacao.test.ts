import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const f = ler("src/lib/equipe.functions.ts");
const corpo = (nome: string) => {
  const ini = f.indexOf(`export const ${nome}`);
  const fim = f.indexOf("\nexport const ", ini + 1);
  return f.slice(ini, fim < 0 ? undefined : fim);
};

describe("convites: servidor", () => {
  it("toda função de gestão exige login e papel de administração; só a consulta é pública", () => {
    for (const n of ["listarEquipe", "criarConvite", "revogarConvite", "alterarPapelDoMembro", "removerMembro"]) {
      expect(corpo(n), n).toContain("requireSupabaseAuth");
      expect(corpo(n), n).toContain("contextoDeAdministracao(");
    }
    const publica = corpo("consultarConvite");
    expect(publica).not.toContain("requireSupabaseAuth");
  });

  it("as regras de quem pode o quê são conferidas no servidor, não só na tela", () => {
    expect(corpo("criarConvite")).toContain("podeConvidar(");
    expect(corpo("revogarConvite")).toContain("podeConvidar(");
    expect(corpo("alterarPapelDoMembro")).toContain("podeAlterarPapel(");
    expect(corpo("removerMembro")).toContain("podeRemover(");
  });

  it("o código secreto nunca é gravado: só o hash; e o papel dono não existe no convite", () => {
    const c = corpo("criarConvite");
    expect(c).toContain("token_hash: await hashDoToken(token)");
    expect(c).not.toMatch(/token:\s*token[,\n]\s*\w+:/); // não vai para o insert
    expect(c).toContain('z.enum(["admin", "member", "viewer"])');
  });

  it("a consulta pública responde igual a qualquer convite inválido e só aceita pendente e vigente", () => {
    const p = corpo("consultarConvite");
    expect(p).toContain(".is(\"accepted_at\", null)");
    expect(p).toContain(".is(\"revoked_at\", null)");
    expect(p).toContain(".gt(\"expires_at\"");
    expect(p.match(/valido: false/g)?.length).toBe(1);
  });

  it("cada ato fica na trilha de auditoria", () => {
    for (const a of ["convite_criado", "convite_revogado", "papel_alterado", "membro_removido"]) expect(f).toContain(`"${a}"`);
  });
});

describe("convites: banco", () => {
  const m = ler("supabase/migrations/20261028100000_convites_de_equipe.sql").replace(/--.*$/gm, "");
  it("só o hash fica no banco, owner não é convidável e o navegador não escreve", () => {
    expect(m).toContain("token_hash text NOT NULL UNIQUE");
    expect(m).toContain("role IN ('admin', 'member', 'viewer')");
    expect(m).toContain("GRANT SELECT ON public.company_invites TO authenticated");
    expect(m).not.toMatch(/GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*TO authenticated/);
  });
  it("o cadastro comum não quebra por causa do convite (bloco que engole o erro)", () => {
    expect(m).toContain("EXCEPTION WHEN OTHERS THEN");
    expect(m).toContain("PERFORM public.vincular_convite_ao_novo_usuario(");
  });
  it("valida e-mail, validade, uso e revogação antes de vincular", () => {
    for (const c of ["accepted_at IS NULL", "revoked_at IS NULL", "expires_at > now()", "email = lower(btrim(p_email))"]) expect(m).toContain(c);
  });
});

describe("convites: telas", () => {
  it("a página pública cadastra levando o código nos metadados e pede sair se houver sessão", () => {
    const t = ler("src/routes/convite.$token.tsx");
    expect(t).toContain("invite_token: token");
    expect(t).toContain("Sair e continuar");
    expect(t).toContain("readOnly");
  });
  it("a tela Equipe só mostra gestão a administrador e usa as regras para esconder ações", () => {
    const t = ler("src/routes/_app.settings.equipe.tsx");
    expect(t).toContain("Só dono e administrador gerenciam a equipe.");
    expect(t).toContain("podeAlterarPapel(");
    expect(t).toContain("podeRemover(");
  });
});
