import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * No inbox, enviar, encerrar, transferir e puxar visitante falhavam em
 * silêncio: sem `catch`, a promessa rejeitada sumia e o atendente achava que
 * tinha respondido/encerrado. `closeConversation` e `markRead` nem olhavam o
 * erro do banco.
 */
const inbox = readFileSync("src/routes/_app.inbox.tsx", "utf8");
const servico = readFileSync("src/modules/chat/services/chatService.ts", "utf8");

describe("inbox não falha em silêncio", () => {
  it("as quatro ações avisam o erro", () => {
    for (const rotulo of [
      "Não foi possível enviar",
      "Não foi possível encerrar",
      "Não foi possível transferir",
      "Não foi possível iniciar",
    ]) {
      expect(inbox, rotulo).toContain(rotulo);
    }
  });

  it("o serviço lança o erro do banco em encerrar e marcar como lida", () => {
    const fecha = servico.slice(servico.indexOf("async closeConversation"));
    expect(fecha.slice(0, 500)).toContain("if (error) throw error;");
    const le = servico.slice(
      servico.indexOf("async markRead"),
      servico.indexOf("async closeConversation"),
    );
    expect(le).toContain("if (error) throw error;");
  });

  it("marcar como lida não vira rejeição solta", () => {
    expect(inbox).toContain("chatService.markRead(conversation.id, 'agent').catch(() => {});");
  });

  it("o foco volta ao campo depois de enviar", () => {
    expect(inbox).toMatch(
      /finally \{\s*setSending\(false\);[\s\S]{0,200}inputRef\.current\?\.focus\(\)/,
    );
  });

  it("Tab só completa quando a lista de respostas está visível", () => {
    expect(inbox).toContain("e.key === 'Tab' && showReplies && filteredReplies.length > 0");
  });
});
