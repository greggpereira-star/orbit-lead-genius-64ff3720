import { describe, expect, it } from "vitest";
import {
  cabecalhoPermitido,
  ehEnderecoPrivado,
  validarDestinoDeWebhook,
} from "./redeSegura.server";

describe("ehEnderecoPrivado", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
    "::ffff:127.0.0.1",
  ])("%s é privado", (ip) => expect(ehEnderecoPrivado(ip)).toBe(true));

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "172.15.0.1",
    "172.32.0.1",
    "100.63.0.1",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("%s é público", (ip) => expect(ehEnderecoPrivado(ip)).toBe(false));

  it("lixo não passa", () => expect(ehEnderecoPrivado("não-é-ip")).toBe(true));
});

describe("validarDestinoDeWebhook", () => {
  const publico = async () => ["93.184.216.34"];

  it("https público passa", async () => {
    expect(
      await validarDestinoDeWebhook("https://hooks.exemplo.com/leadflow", publico),
    ).toMatchObject({ ok: true });
  });

  it.each([
    ["http://exemplo.com/x", "https"],
    ["ftp://exemplo.com/x", "https"],
    ["https://user:pass@exemplo.com/x", "usuário"],
    ["https://169.254.169.254/latest/meta-data", "interno"],
    ["https://[::1]/x", "interno"],
    ["https://localhost/x", "interno"],
    ["https://kong:8000/x", "interno"],
    ["https://servico.internal/x", "interno"],
    ["https://nas.local/x", "interno"],
    ["lixo", "inválida"],
  ])("recusa %s", async (url, parte) => {
    const r = await validarDestinoDeWebhook(url, publico);
    expect(r.ok).toBe(false);
    expect((r as { motivo: string }).motivo).toContain(parte);
  });

  it("nome público que RESOLVE para endereço interno é recusado (rebinding simples)", async () => {
    const r = await validarDestinoDeWebhook("https://atacante.com/r", async () => ["10.0.0.5"]);
    expect(r).toMatchObject({ ok: false });
  });

  it("um endereço interno entre vários basta para recusar", async () => {
    const r = await validarDestinoDeWebhook("https://atacante.com/r", async () => [
      "93.184.216.34",
      "127.0.0.1",
    ]);
    expect(r.ok).toBe(false);
  });

  it("DNS que falha ou volta vazio recusa", async () => {
    expect(
      (
        await validarDestinoDeWebhook("https://x.com/", async () => {
          throw new Error("nx");
        })
      ).ok,
    ).toBe(false);
    expect((await validarDestinoDeWebhook("https://x.com/", async () => [])).ok).toBe(false);
  });
});

describe("cabecalhoPermitido", () => {
  it.each(["Authorization", "X-Api-Key", "x-signature"])("aceita %s", (n) =>
    expect(cabecalhoPermitido(n)).toBe(true),
  );
  it.each([
    "Host",
    "Content-Length",
    "Transfer-Encoding",
    "Connection",
    "x\r\ninjetado",
    "",
    "a b",
  ])("recusa %j", (n) => expect(cabecalhoPermitido(n)).toBe(false));
});
