import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { EXPLICACAO, estadoDoAviso, lerPreferencia, podeAvisar } from "./avisoDoNavegador";

/**
 * O aviso no navegador JÁ existia e era incondicional: mensagem nova tocava
 * som e abria notificação sempre. O interruptor de Configurações não governava
 * nada — mostrava um toast verde e não gravava.
 */
describe("a permissão do navegador manda", () => {
  it("bloqueado é bloqueado, mesmo querendo receber", () => {
    // Mostrar "ligado" aqui seria pior que não ter o interruptor: a pessoa
    // pararia de procurar o problema por acreditar nele.
    expect(estadoDoAviso("denied", true)).toBe("bloqueado");
    expect(podeAvisar(estadoDoAviso("denied", true))).toBe(false);
  });

  it("sem suporte no navegador não vira ligado", () => {
    expect(estadoDoAviso(null, true)).toBe("sem-suporte");
    expect(podeAvisar(estadoDoAviso(null, true))).toBe(false);
  });

  it("permissão ainda não pedida não é ligado nem desligado", () => {
    expect(estadoDoAviso("default", true)).toBe("a-perguntar");
    expect(podeAvisar(estadoDoAviso("default", true))).toBe(false);
  });

  it("com permissão, quem decide é a pessoa", () => {
    expect(estadoDoAviso("granted", true)).toBe("ligado");
    expect(estadoDoAviso("granted", false)).toBe("desligado");
    expect(podeAvisar(estadoDoAviso("granted", true))).toBe(true);
    expect(podeAvisar(estadoDoAviso("granted", false))).toBe(false);
  });

  it("todo estado tem explicação — estado mudo não ajuda ninguém", () => {
    for (const permissao of ["granted", "denied", "default", null] as const) {
      for (const quer of [true, false]) {
        expect(EXPLICACAO[estadoDoAviso(permissao, quer)]).toBeTruthy();
      }
    }
  });
});

describe("a preferência guardada", () => {
  it("o padrão é ligado, como era antes", () => {
    // Guardado vazio significa "nunca escolheu", e o comportamento anterior
    // era avisar. Mudar o padrão desligaria o aviso de quem já contava com ele.
    for (const v of [null, undefined, "", "1"]) expect(lerPreferencia(v)).toBe(true);
  });

  it("só o desligamento explícito desliga", () => {
    expect(lerPreferencia("0")).toBe(false);
  });
});

describe("o emissor obedece a preferência", () => {
  const emissor = readFileSync("src/modules/chat/hooks/useInboxNotifications.ts", "utf8");
  const tela = readFileSync("src/routes/_app.settings.notifications.tsx", "utf8");

  it("consulta antes de tocar e notificar", () => {
    expect(emissor).toContain("avisoLigado()");
    const i = emissor.indexOf("playChime();");
    expect(i).toBeGreaterThan(0);
    expect(emissor.slice(i - 200, i)).toContain("avisoLigado()");
  });

  it("a permissão não é mais pedida ao abrir o painel", () => {
    /* Pedir sem a pessoa ter pedido nada é o jeito mais rápido de levar um
       "bloquear" — e bloqueio não se desfaz pelo site. */
    expect(emissor).not.toContain("Notification.requestPermission()");
    expect(tela, "o pedido saiu do painel e não entrou na tela").toContain(
      "Notification.requestPermission()",
    );
  });

  it("a tela não promete e-mail e WhatsApp, e diz por quê", () => {
    expect(tela).toContain("Depende de um servidor de envio");
    expect(tela).toContain("Depende de uma API de WhatsApp");
  });

  it("a tela avisa que a escolha é por aparelho", () => {
    expect(tela).toContain("Vale só neste aparelho");
  });
});
