import { describe, it, expect } from "vitest";
import {
  quizDoCaminho,
  tipoDoArquivo,
  formatarTamanho,
  classificarArquivos,
  seguroApagar,
  type ArquivoDaBiblioteca,
} from "./biblioteca";

const EMP = "emp-1";
const arq = (caminho: string, extra: Partial<ArquivoDaBiblioteca> = {}): ArquivoDaBiblioteca => ({
  caminho,
  bytes: 1024,
  mimeType: "image/png",
  criadoEm: "2026-10-07T00:00:00Z",
  quizId: quizDoCaminho(caminho, EMP),
  deVisitante: caminho.includes("/respostas/"),
  ...extra,
});

describe("quizDoCaminho", () => {
  it("lê o quiz do meio do caminho", () => {
    expect(quizDoCaminho("emp-1/quiz-a/foto.png", EMP)).toBe("quiz-a");
    expect(quizDoCaminho("emp-1/quiz-a/respostas/v.webm", EMP)).toBe("quiz-a");
  });

  it("devolve null quando o caminho não é de outra empresa nem tem a forma esperada", () => {
    expect(quizDoCaminho("outra-emp/quiz-a/foto.png", EMP)).toBeNull();
    expect(quizDoCaminho("solto.png", EMP)).toBeNull();
    expect(quizDoCaminho("emp-1/solto.png", EMP)).toBeNull();
  });
});

describe("tipoDoArquivo", () => {
  it("usa o mime quando existe", () => {
    expect(tipoDoArquivo("video/webm", "a/b.bin")).toBe("video");
    expect(tipoDoArquivo("audio/mpeg", "a/b.bin")).toBe("audio");
  });

  it("cai na extensão quando o storage não guardou o tipo", () => {
    // Cartão sem prévia é cartão inútil; melhor adivinhar pela extensão.
    expect(tipoDoArquivo("", "a/b.WEBM")).toBe("video");
    expect(tipoDoArquivo("application/octet-stream", "a/b.jpg")).toBe("imagem");
  });

  it("desconhecido não vira imagem por acidente", () => {
    expect(tipoDoArquivo("", "a/b.zip")).toBe("outro");
  });
});

describe("formatarTamanho", () => {
  it("usa vírgula decimal, como se escreve em português", () => {
    expect(formatarTamanho(1024 * 1024 * 1.45)).toBe("1,4 MB");
  });
  it("escolhe a unidade pelo tamanho", () => {
    expect(formatarTamanho(900)).toBe("900 B");
    expect(formatarTamanho(1024 * 820)).toBe("820 KB");
  });
  it("não quebra com valor ausente", () => {
    expect(formatarTamanho(NaN)).toBe("—");
  });
});

describe("classificarArquivos", () => {
  const base = {
    companyId: EMP,
    quizzesExistentes: ["quiz-vivo"],
    schemasSerializados: ['{"blocks":[{"mediaUrl":"…/emp-1/quiz-vivo/usada.png?token=x"}]}'],
  };

  it("arquivo de quiz existente e referenciado: em uso, não órfão", () => {
    const [r] = classificarArquivos({ ...base, arquivos: [arq("emp-1/quiz-vivo/usada.png")] });
    expect(r).toMatchObject({ orfao: false, emUso: true, tipo: "imagem", nome: "usada.png" });
  });

  it("arquivo de quiz apagado e sem referência: órfão e livre", () => {
    const [r] = classificarArquivos({ ...base, arquivos: [arq("emp-1/quiz-morto/velha.png")] });
    expect(r).toMatchObject({ orfao: true, emUso: false });
  });

  it("órfão E em uso ao mesmo tempo — a cópia que aponta para o original apagado", () => {
    // É o caso que impede apagar por "órfão" sozinho: o quiz de origem sumiu,
    // mas uma cópia ainda referencia o arquivo.
    const r = classificarArquivos({
      ...base,
      schemasSerializados: ['{"blocks":[{"mediaUrl":"…/emp-1/quiz-morto/velha.png"}]}'],
      arquivos: [arq("emp-1/quiz-morto/velha.png")],
    })[0];
    expect(r).toMatchObject({ orfao: true, emUso: true });
  });

  it("marca resposta de visitante pelo caminho", () => {
    const [r] = classificarArquivos({
      ...base,
      arquivos: [arq("emp-1/quiz-vivo/respostas/v.webm")],
    });
    expect(r.deVisitante).toBe(true);
  });
});

describe("seguroApagar", () => {
  it("só leva o que é órfão E não referenciado", () => {
    const arquivos = classificarArquivos({
      companyId: EMP,
      quizzesExistentes: ["quiz-vivo"],
      schemasSerializados: ['{"u":"emp-1/quiz-morto/presa.png"}'],
      arquivos: [
        arq("emp-1/quiz-vivo/viva.png"),
        arq("emp-1/quiz-morto/presa.png"),
        arq("emp-1/quiz-morto/livre.png"),
      ],
    });
    expect(seguroApagar(arquivos).map((a) => a.nome)).toEqual(["livre.png"]);
  });
});
