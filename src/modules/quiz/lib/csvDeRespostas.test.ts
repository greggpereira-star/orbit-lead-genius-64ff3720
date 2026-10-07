import { describe, it, expect } from "vitest";
import {
  montarCsvDeRespostas,
  perguntasDoSchema,
  valorLegivel,
  tituloDaColuna,
  type LinhaDeExport,
} from "./csvDeRespostas";
import type { QuizBlock, QuizSchema } from "../types";

const escolha = {
  id: "q1",
  type: "single-choice",
  title: "Qual seu objetivo?",
  options: [
    { id: "o1", label: "Aumentar vendas" },
    { id: "o2", label: "Reduzir custos" },
  ],
} as QuizBlock;

const multi = {
  id: "q2",
  type: "multi-choice",
  title: "O que te trava?",
  options: [
    { id: "m1", label: "Verba" },
    { id: "m2", label: "Tempo" },
  ],
} as QuizBlock;

const video = { id: "v1", type: "video-answer", title: "Grave um vídeo" } as QuizBlock;
const agenda = { id: "a1", type: "scheduling", title: "Quando?" } as QuizBlock;
const enfeite = { id: "d1", type: "divider" } as QuizBlock;
const titulo = { id: "h1", type: "heading", title: "Bem-vindo" } as QuizBlock;

const schema = {
  blocks: [titulo, escolha, enfeite, multi, agenda, video],
  design: {},
} as QuizSchema;

const linha = (answers: Record<string, unknown>): LinhaDeExport => ({
  created_at: "2026-10-06T14:10:00Z",
  status: "completed",
  score: 20,
  temperature: "hot",
  answers: { _contact: { name: "Ana", email: "a@b.com", phone: "11999" }, ...answers },
  tracking: { utm_source: "meta" },
});

describe("perguntasDoSchema", () => {
  it("leva só os blocos que coletam resposta", () => {
    expect(perguntasDoSchema(schema).map((b) => b.id)).toEqual(["q1", "q2", "a1", "v1"]);
  });
  it("não quebra sem schema", () => {
    expect(perguntasDoSchema(null)).toEqual([]);
  });
});

describe("valorLegivel", () => {
  it("traduz o id da opção para o rótulo", () => {
    // A escolha única guarda `o1`. Exportar o id obriga quem recebe a cruzar
    // com o schema na mão.
    expect(valorLegivel(escolha, "o1")).toBe("Aumentar vendas");
  });

  it("junta múltipla escolha com ponto e vírgula", () => {
    // Vírgula separaria a célula no CSV.
    expect(valorLegivel(multi, ["m1", "m2"])).toBe("Verba; Tempo");
  });

  it('agendamento vira data e hora, não "[object Object]"', () => {
    expect(valorLegivel(agenda, { data: "2026-10-20", hora: "14:00" })).toBe("2026-10-20 14:00");
  });

  it("mantém a URL do vídeo, que é o que serve para assistir", () => {
    const url = "https://x/storage/v1/object/sign/quiz-media/a/b.webm?token=abc";
    expect(valorLegivel(video, url)).toBe(url);
  });

  it('vazio não vira "undefined" na célula', () => {
    expect(valorLegivel(escolha, undefined)).toBe("");
    expect(valorLegivel(escolha, null)).toBe("");
  });

  it("valor que não está entre as opções sai como veio", () => {
    expect(valorLegivel(escolha, "resposta livre")).toBe("resposta livre");
  });
});

describe("tituloDaColuna", () => {
  it("usa a pergunta", () => {
    expect(tituloDaColuna(escolha, 0)).toBe("Qual seu objetivo?");
  });
  it("bloco sem título ganha nome, em vez de coluna anônima", () => {
    expect(tituloDaColuna({ id: "x", type: "short-text" } as QuizBlock, 2)).toBe("Pergunta 3");
  });
});

describe("montarCsvDeRespostas", () => {
  it("o cabeçalho traz as fixas e depois as perguntas, na ordem do funil", () => {
    const csv = montarCsvDeRespostas(schema, []);
    expect(csv.split("\n")[0]).toBe(
      '"data","nome","email","telefone","score","temperatura","completo","utm_source","utm_campaign","Qual seu objetivo?","O que te trava?","Quando?","Grave um vídeo"',
    );
  });

  it("a linha traz contato E respostas", () => {
    const csv = montarCsvDeRespostas(schema, [linha({ q1: "o1", q2: ["m2"] })]);
    const l = csv.split("\n")[1];
    expect(l).toContain('"Ana"');
    expect(l).toContain('"Aumentar vendas"');
    expect(l).toContain('"Tempo"');
  });

  it("as colunas vêm do SCHEMA, não das chaves de cada resposta", () => {
    // Duas submissões que responderam blocos diferentes precisam ter a mesma
    // coluna significando a mesma coisa — senão o arquivo mente no meio.
    const csv = montarCsvDeRespostas(schema, [linha({ q1: "o1" }), linha({ q2: ["m1"] })]);
    const colunas = csv.split("\n").map((l) => l.split('","').length);
    expect(new Set(colunas).size).toBe(1);
  });

  it("aspas na resposta não quebram a célula", () => {
    const csv = montarCsvDeRespostas(schema, [linha({ q1: 'diz "oi"' })]);
    expect(csv).toContain('"diz ""oi"""');
  });

  it("não quebra sem schema — vira o CSV antigo, só com as fixas", () => {
    const csv = montarCsvDeRespostas(null, [linha({})]);
    expect(csv.split("\n")[0].split(",")).toHaveLength(9);
  });
});

describe("valorLegivel com objetos", () => {
  const bloco = { id: "b", type: "form", options: [] } as unknown as QuizBlock;

  it("formulário vira contato legível, não JSON", () => {
    const r = valorLegivel(bloco, {
      name: "Teste Roteamento",
      email: "quiz.rot@altagency.com.br",
      phone: "27988886666",
    });
    expect(r).toBe("Teste Roteamento · quiz.rot@altagency.com.br · 27988886666");
    expect(r).not.toContain("{");
  });

  it("formulário parcial não inventa separador sobrando", () => {
    expect(valorLegivel(bloco, { email: "a@b.c" })).toBe("a@b.c");
  });

  it("agendamento continua ganhando do contato", () => {
    expect(valorLegivel(bloco, { data: "10/10", hora: "14h", name: "x" })).toBe("10/10 14h");
  });

  it("forma desconhecida ainda cai no JSON, como rede de segurança", () => {
    expect(valorLegivel(bloco, { foo: 1 })).toBe('{"foo":1}');
  });
});
