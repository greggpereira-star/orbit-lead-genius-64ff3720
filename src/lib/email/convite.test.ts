import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { escaparHtml, linkSeguro, montarEmailDeConvite } from "./conviteDeEquipe";
import { enviarEmail, envioDeEmailConfigurado, REMETENTE_PADRAO } from "./resend.server";

const base = {
  empresa: "Sossae Empreendimentos",
  papel: "viewer",
  convidadoPor: "Gregg",
  link: "https://altleadflow.com.br/convite/abc123-DEF_456ghiJKL789mno",
  expiraEm: "2026-11-01T12:00:00Z",
};

describe("texto do e-mail de convite", () => {
  it("diz quem convidou, a empresa, o papel em português, o link e a validade", () => {
    const m = montarEmailDeConvite(base);
    expect(m.assunto).toBe("Gregg convidou você para Sossae Empreendimentos no ALT Leadflow");
    for (const parte of ["Gregg", "Sossae Empreendimentos", "Visualizador", base.link, "01/11/2026"]) {
      expect(m.html).toContain(parte);
      expect(m.texto).toContain(parte);
    }
    expect(m.texto).toContain("ignore esta mensagem");
  });

  it("escapa HTML de nomes e empresa: ninguém injeta marcação no e-mail", () => {
    const m = montarEmailDeConvite({ ...base, empresa: '<script>alert(1)</script>', convidadoPor: '"><img src=x onerror=1>' });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img src=x");
    expect(m.html).toContain("&lt;script&gt;");
    expect(escaparHtml(`a&b<c>"d'e`)).toBe("a&amp;b&lt;c&gt;&quot;d&#39;e");
  });

  it("o assunto não aceita quebra de linha (injeção de cabeçalho) nem passa de 150 caracteres", () => {
    const m = montarEmailDeConvite({ ...base, convidadoPor: "Fulano\r\nBcc: x@y.com", empresa: "E".repeat(300) });
    expect(m.assunto).not.toMatch(/[\r\n]/);
    expect(m.assunto.length).toBeLessThanOrEqual(150);
  });

  it("só aceita link https sem usuário e senha", () => {
    expect(() => linkSeguro("http://altleadflow.com.br/convite/x")).toThrow();
    expect(() => linkSeguro("https://user:pass@evil.com/x")).toThrow();
    expect(() => linkSeguro("javascript:alert(1)")).toThrow();
    expect(() => montarEmailDeConvite({ ...base, link: "http://x.com/y" })).toThrow();
    expect(linkSeguro(base.link)).toBe(base.link);
  });

  it("usa o fuso de Brasília para a data (meia-noite UTC ainda é o dia anterior)", () => {
    expect(montarEmailDeConvite({ ...base, expiraEm: "2026-11-02T01:00:00Z" }).texto).toContain("01/11/2026");
  });
});

describe("envio pela Resend", () => {
  const msg = { para: "a@b.com", assunto: "S", html: "<p>x</p>", texto: "x" };
  const env = { RESEND_API_KEY: "re_chave_de_teste_123456" };

  it("sem chave não está configurado e nem tenta a rede", async () => {
    const f = vi.fn();
    expect(envioDeEmailConfigurado({})).toBe(false);
    expect(envioDeEmailConfigurado({ RESEND_API_KEY: "  " })).toBe(false);
    expect(await enviarEmail(msg, { env: {}, fetchFn: f as never })).toEqual({ ok: false, motivo: "nao_configurado" });
    expect(f).not.toHaveBeenCalled();
  });

  it("envia com a chave no cabeçalho, remetente padrão e devolve o id", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    const r = await enviarEmail(msg, { env, fetchFn: f as never });
    expect(r).toEqual({ ok: true, id: "em_1" });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${env.RESEND_API_KEY}`);
    const corpo = JSON.parse(String(init.body));
    expect(corpo.from).toBe(REMETENTE_PADRAO);
    expect(corpo.to).toEqual(["a@b.com"]);
  });

  it("respeita EMAIL_REMETENTE quando definido", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 200 }));
    await enviarEmail(msg, { env: { ...env, EMAIL_REMETENTE: "Equipe <oi@altleadflow.com.br>" }, fetchFn: f as never });
    expect(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).from).toBe("Equipe <oi@altleadflow.com.br>");
  });

  it("recusa da API e falha de rede viram resultado, nunca exceção; o resultado não carrega a chave", async () => {
    const recusado = await enviarEmail(msg, { env, fetchFn: (async () => new Response("{}", { status: 422 })) as never });
    expect(recusado).toEqual({ ok: false, motivo: "recusado", status: 422 });
    const rede = await enviarEmail(msg, { env, fetchFn: (async () => { throw new Error(`falhou ${env.RESEND_API_KEY}`); }) as never });
    expect(rede).toEqual({ ok: false, motivo: "rede" });
    expect(JSON.stringify([recusado, rede])).not.toContain(env.RESEND_API_KEY);
  });
});

describe("ligação no servidor e na tela", () => {
  const ler = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  const f = ler("src/lib/equipe.functions.ts");
  const ini = f.indexOf("export const criarConvite");
  const criar = f.slice(ini, f.indexOf("\nexport const ", ini + 1));

  it("o e-mail só é enviado DEPOIS de o convite existir, e só se foi pedido", () => {
    expect(criar.indexOf("company_invites")).toBeLessThan(criar.indexOf("enviarEmail("));
    expect(criar).toContain("if (data.enviarEmail)");
  });
  it("o link do e-mail usa o endereço do servidor, não um valor vindo do navegador", () => {
    expect(criar).toContain("enderecoDoApp()");
    expect(criar).not.toMatch(/window\.|origin/);
    expect(f).toContain('process.env.SITE_URL');
  });
  it("tem limite por hora e registra o envio na auditoria sem o código secreto", () => {
    expect(f).toContain("LIMITE_DE_EMAILS_POR_HORA = 20");
    expect(criar).toContain('"convite_enviado_por_email"');
    const registro = criar.slice(criar.indexOf('action: "convite_enviado_por_email"'), criar.indexOf('action: "convite_enviado_por_email"') + 200);
    expect(registro).not.toContain("token");
  });
  it("falha do envio não desfaz o convite: devolve a situação e o link segue valendo", () => {
    expect(criar).toContain('situacaoDoEmail = r.ok ? "enviado" : "falhou"');
    expect(criar).toContain("situacaoDoEmail,");
  });
  it("a tela confirma o endereço antes de criar e avisa quando o envio não está configurado", () => {
    const t = ler("src/routes/_app.settings.equipe.tsx");
    expect(t).toContain("Confirme o e-mail");
    expect(t).toContain("Voltar e corrigir");
    expect(t).toContain("ainda não está configurado");
    expect(t).toContain("Reenviar");
  });
});
