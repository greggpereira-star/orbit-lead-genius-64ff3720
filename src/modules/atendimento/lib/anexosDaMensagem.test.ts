import { describe, expect, it } from "vitest";
import { anexoDaMensagem } from "./anexosDaMensagem";

describe("anexoDaMensagem — localização", () => {
  it("monta as coordenadas e o link de mapa, com nome e endereço", () => {
    const a = anexoDaMensagem({
      type: "location",
      payload: {
        location: {
          latitude: -20.3155,
          longitude: -40.3128,
          name: "Praia da Costa",
          address: "Vila Velha, ES",
          url: "https://evil.example/x",
        },
      },
    });
    expect(a).toEqual({
      kind: "localizacao",
      latitude: -20.3155,
      longitude: -40.3128,
      nome: "Praia da Costa",
      endereco: "Vila Velha, ES",
      mapa: "https://www.google.com/maps?q=-20.3155,-40.3128",
    });
  });
  it("nunca usa o url do cliente no link", () => {
    const a = anexoDaMensagem({
      type: "location",
      payload: { location: { latitude: 1, longitude: 2, url: "javascript:alert(1)" } },
    });
    expect(a && a.kind === "localizacao" && a.mapa).toBe("https://www.google.com/maps?q=1,2");
  });
  it("sem coordenadas válidas não desenha nada", () => {
    expect(anexoDaMensagem({ type: "location", payload: { location: {} } })).toBeNull();
    expect(
      anexoDaMensagem({ type: "location", payload: { location: { latitude: 999, longitude: 1 } } }),
    ).toBeNull();
    expect(anexoDaMensagem({ type: "location", payload: null })).toBeNull();
  });
});

describe("anexoDaMensagem — contatos", () => {
  const contato = {
    name: { formatted_name: "Maria Silva", first_name: "Maria" },
    phones: [
      { phone: "+55 27 99999-0000", type: "CELL", wa_id: "5527999990000" },
      { wa_id: "5527888880000", type: "WORK" },
    ],
    emails: [{ email: "maria@exemplo.com" }],
    org: { company: "Exemplo SA" },
  };
  it("extrai nome, telefones com rótulo, e-mail e empresa", () => {
    const a = anexoDaMensagem({ type: "contacts", payload: { contacts: [contato] } });
    expect(a).toEqual({
      kind: "contatos",
      itens: [
        {
          nome: "Maria Silva",
          telefones: [
            { numero: "+55 27 99999-0000", rotulo: "Celular" },
            { numero: "+5527888880000", rotulo: "Trabalho" },
          ],
          email: "maria@exemplo.com",
          empresa: "Exemplo SA",
        },
      ],
    });
  });
  it("vários contatos; vazio ou lixo não vira cartão", () => {
    const a = anexoDaMensagem({
      type: "contacts",
      payload: { contacts: [contato, { name: { formatted_name: "João" } }, {}, "x"] },
    });
    expect(a && a.kind === "contatos" && a.itens.map((i) => i.nome)).toEqual([
      "Maria Silva",
      "João",
    ]);
    expect(anexoDaMensagem({ type: "contacts", payload: { contacts: [] } })).toBeNull();
  });
  it("outros tipos não têm anexo", () => {
    expect(anexoDaMensagem({ type: "text", payload: { text: { body: "oi" } } })).toBeNull();
  });
});
