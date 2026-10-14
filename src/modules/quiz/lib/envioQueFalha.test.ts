import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * O que acontece quando o envio da submissão falha.
 *
 * É o pior momento possível para falhar — o visitante respondeu o quiz inteiro
 * — e era tratado como se não importasse: a exceção ia para o `console.error`
 * e mais nada. Na tela, o botão parava de girar e nada acontecia. Ele ficava na
 * última etapa sem explicação, sem saber se terminou.
 *
 * E havia o agravante, que é o defeito de verdade: o progresso guardado era
 * apagado ANTES da gravação. Rede caindo no último clique — que é quando mais
 * cai — deixava o visitante sem submissão E sem o que tinha respondido.
 * Recarregar a página o devolvia ao começo de um quiz que ele acabara de
 * terminar.
 */
const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");

const finish = (() => {
  const i = player.indexOf("const finish = async (");
  const j = player.indexOf("\n  };", i);
  if (i < 0 || j < 0) throw new Error("não achei o finish");
  return player.slice(i, j);
})();

describe("o progresso só é descartado depois de gravar", () => {
  it("o teste está olhando o finish inteiro", () => {
    // Guarda contra o próprio varredor: fatia errada passaria vazia.
    expect(finish).toContain("submitPublic");
    expect(finish).toContain("limparProgresso");
  });

  it("limparProgresso vem DEPOIS de submitPublic", () => {
    /* A ordem é o conserto inteiro. Invertida, a falha de rede custa duas
       coisas em vez de uma: a submissão e as respostas. */
    const envio = finish.indexOf("submitPublic");
    const limpeza = finish.indexOf("limparProgresso");
    expect(limpeza, "o progresso está sendo apagado antes de gravar").toBeGreaterThan(envio);
  });

  it("e depois de a submissão existir, não só de a chamada começar", () => {
    // `setSubmissionId(id)` só roda com o id em mãos.
    const id = finish.indexOf("setSubmissionId(id)");
    const limpeza = finish.indexOf("limparProgresso");
    expect(limpeza).toBeGreaterThan(id);
  });

  it("a limpeza continua acontecendo no finish, e não só quando a tela final aparece", () => {
    /* Com um bloco de Resultado na última etapa o quiz termina sem passar pela
       tela final interna: `done` segue falso e o progresso ficaria no navegador
       as 24h inteiras. O sinal honesto de "acabou" é ter gravado. */
    expect(finish).toContain("if (!preview) limparProgresso(quizId);");
  });
});

describe("a falha aparece para quem respondeu", () => {
  it("o erro vira estado, não só console", () => {
    expect(finish).toContain("setErroAoGravar(true)");
    expect(player).toContain("const [erroAoGravar, setErroAoGravar] = useState(false)");
  });

  it("o estado é limpo a cada tentativa", () => {
    // Senão o aviso de uma falha antiga ficaria na tela durante a retentativa.
    expect(finish).toContain("setErroAoGravar(false)");
  });

  it("a tela mostra o aviso e oferece tentar de novo", () => {
    expect(player).toContain("Não consegui enviar suas respostas.");
    expect(player).toContain("Tentar de novo");
    expect(player, "o aviso não é anunciado por leitor de tela").toContain('role="alert"');
  });

  it("a retentativa é possível: a trava volta atrás na falha", () => {
    /* `jaSalvou` existe para não gravar duas vezes. Se ela não voltasse atrás,
       o botão de tentar de novo não faria nada — e seria mais uma tela que
       mente. */
    const i = finish.indexOf("} catch");
    expect(finish.slice(i, i + 400)).toContain("jaSalvou.current = false");
  });

  it("o aviso diz para NÃO recarregar", () => {
    // As respostas só existem na memória desta aba nesse ponto: recarregar é
    // exatamente o que as perde.
    expect(player).toContain("não recarregue a");
  });
});
