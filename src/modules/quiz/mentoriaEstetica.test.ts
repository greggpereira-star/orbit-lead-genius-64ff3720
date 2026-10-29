import { describe, it, expect } from "vitest";
import { FAIXAS_MENTORIA, ID, OPCAO, montarQuizMentoria } from "./mentoriaEstetica";
import {
  classifyTier,
  isBlockVisible,
  maxPossibleScore,
  minPossibleScore,
  recomputeScore,
  type QuizResponses,
} from "./engine";
import { validarPublicacao } from "./lib/validarPublicacao";
import { resolveScope } from "./lib/variables";
import { getSteps } from "./lib/steps";

const schema = montarQuizMentoria();

/** Caminho do visitante: só as etapas com bloco visível, como o player faz. */
function percorrer(r: QuizResponses) {
  const escopo = resolveScope(schema.blocks, r);
  const etapas = getSteps(schema).filter((s) =>
    s.blockIds.some((id) => {
      const b = schema.blocks.find((x) => x.id === id)!;
      return isBlockVisible(b, r, escopo);
    }),
  );
  const { score, tags } = recomputeScore(schema.blocks, r);
  const max = maxPossibleScore(schema, r);
  const min = minPossibleScore(schema, r);
  const faixa = classifyTier(score, max, FAIXAS_MENTORIA, min);
  const visiveis = schema.blocks.filter((b) => isBlockVisible(b, r, escopo)).map((b) => b.id);
  return { etapas, score, tags, max, faixa: faixa?.label, visiveis };
}

const base = {
  [ID.tecnica]: OPCAO.dupla,
  [ID.formacao]: "m-form-biomed",
  [ID.estagio]: "m-est-cursos",
  [ID.habilitacao]: OPCAO.habilitadoSim,
  [ID.data]: "m-data-sim",
  [ID.investDupla]: "m-inv-d-sim",
  [ID.conversa]: "m-conv-sim",
  [ID.contato]: "m-ct-whats",
  [ID.cidade]: "Linhares/ES",
} satisfies QuizResponses;

describe("quiz da Mentoria Método & Decisão", () => {
  it("passa na validação de publicação, com as faixas, sem bloqueio", () => {
    const achados = validarPublicacao(schema, FAIXAS_MENTORIA);
    expect(achados.filter((a) => a.nivel === "bloqueia")).toEqual([]);
    // O único aviso é de propósito: nenhuma faixa dispara WhatsApp automático
    // até existir template APROVADO na API oficial e a Taciane validar o texto.
    expect(achados.map((a) => a.mensagem)).toEqual([
      "3 faixa(s) sem mensagem de WhatsApp — quem cair nelas não recebe nada.",
    ]);
  });

  it("usa ids únicos e todas as etapas têm nome", () => {
    const ids = schema.blocks.flatMap((b) => [b.id, ...(b.options ?? []).map((o) => o.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of getSteps(schema, { keepEmpty: true })) expect(s.name).toBeTruthy();
  });

  it("fecha 100 pontos no melhor caminho (a tabela do plano comercial)", () => {
    expect(maxPossibleScore(schema, base)).toBe(100);
  });

  it("Dupla, registro ativo, disponível, avalia, pede proposta: 100% e prioritário", () => {
    const r = percorrer(base);
    expect(r.score).toBe(100);
    expect(r.faixa).toBe("Prioritário");
    expect(r.tags).toEqual(
      expect.arrayContaining([
        "INTERESSE_DUPLA",
        "HABILITACAO_A_VERIFICAR",
        "DATA_PROXIMA_TURMA",
        "CONDICAO_COMERCIAL",
        "SOLICITOU_CONVERSA",
      ]),
    );
  });

  it("mostra só a pergunta de preço que cabe ao interesse (dupla × individual)", () => {
    const dupla = percorrer(base);
    expect(dupla.visiveis).toContain(ID.investDupla);
    expect(dupla.visiveis).not.toContain(ID.investIndividual);

    const toxina = percorrer({
      ...base,
      [ID.tecnica]: "m-tecnica-toxina",
      [ID.investDupla]: undefined,
      [ID.investIndividual]: "m-inv-i-sim",
    });
    expect(toxina.visiveis).toContain(ID.investIndividual);
    expect(toxina.visiveis).not.toContain(ID.investDupla);
  });

  it("individual com tudo positivo continua prioritário (94 de 100)", () => {
    const r = percorrer({
      ...base,
      [ID.tecnica]: "m-tecnica-preench",
      [ID.investDupla]: undefined,
      [ID.investIndividual]: "m-inv-i-sim",
    });
    expect(r.score).toBe(94);
    expect(r.max).toBe(100);
    expect(r.faixa).toBe("Prioritário");
    expect(r.tags).toContain("INTERESSE_PREENCHIMENTO");
  });

  it("sem registro: pontua sem os 20, etiqueta PRATICA_PENDENTE e troca aviso e resultado", () => {
    const r = percorrer({ ...base, [ID.habilitacao]: "m-hab-nao" });
    expect(r.score).toBe(80);
    expect(r.tags).toContain("PRATICA_PENDENTE");
    expect(r.tags).not.toContain("HABILITACAO_A_VERIFICAR");
    expect(r.visiveis).toContain(ID.avisoHabilitacao);
    expect(r.visiveis).toContain(ID.resultadoPendente);
    expect(r.visiveis).not.toContain(ID.resultadoOk);
    // com registro, o aviso some e o resultado é o outro
    const ok = percorrer(base);
    expect(ok.visiveis).not.toContain(ID.avisoHabilitacao);
    expect(ok.visiveis).toContain(ID.resultadoOk);
  });

  it("a faixa sozinha não libera prática: pendente alto continua com a etiqueta e o resultado de triagem", () => {
    const r = percorrer({ ...base, [ID.habilitacao]: "m-hab-andamento" });
    expect(r.faixa).toBe("Prioritário");
    expect(r.tags).toContain("PRATICA_PENDENTE");
    expect(r.visiveis).toContain(ID.resultadoPendente);
  });

  it("curioso: outra data, fora do orçamento, só informações → qualificar mais", () => {
    const r = percorrer({
      ...base,
      [ID.tecnica]: "m-tecnica-toxina",
      [ID.estagio]: "m-est-inicio",
      [ID.habilitacao]: "m-hab-nao",
      [ID.data]: "m-data-outra",
      [ID.investDupla]: undefined,
      [ID.investIndividual]: "m-inv-i-nao",
      [ID.conversa]: "m-conv-info",
    });
    expect(r.score).toBe(14 + 0 + 0 + 0 + 5 + 10);
    expect(r.faixa).toBe("Qualificar mais");
    expect(r.tags).toEqual(
      expect.arrayContaining(["SENSIVEL_PRECO", "DATA_FUTURA", "PRATICA_PENDENTE", "SEG01_INICIO"]),
    );
  });

  it("perfil intermediário cai no consultivo", () => {
    const r = percorrer({
      ...base,
      [ID.tecnica]: "m-tecnica-toxina",
      [ID.investDupla]: undefined,
      [ID.investIndividual]: "m-inv-i-talvez",
      [ID.data]: "m-data-aval",
      [ID.conversa]: "m-conv-info",
    });
    // 14 + 20 + 6 + 5 + 5 + 10 = 60 de 100
    expect(r.score).toBe(60);
    expect(r.faixa).toBe("Consultivo");
  });

  it("não deixa o caminho do visitante com mais de uma pergunta de preço nem de resultado", () => {
    for (const r of [base, { ...base, [ID.habilitacao]: "m-hab-nao" }]) {
      const v = percorrer(r).visiveis;
      expect(v.filter((i) => i === ID.investDupla || i === ID.investIndividual)).toHaveLength(1);
      expect(v.filter((i) => i === ID.resultadoOk || i === ID.resultadoPendente)).toHaveLength(1);
    }
  });

  it("as faixas cobrem 0% (ninguém fica sem classificação)", () => {
    expect(Math.min(...FAIXAS_MENTORIA.map((f) => f.minPercent))).toBe(0);
  });

  it("não promete habilitação em nenhum texto", () => {
    const texto = JSON.stringify(schema).toLowerCase();
    expect(texto).not.toMatch(/garant|certificad|habilita(ção|cao) (garantida|incluída)/);
    expect(texto).toContain("não concede habilitação");
  });

  it("não repete o aviso de habilitação em tela nenhuma além do necessário", () => {
    const vezes = (r: QuizResponses) =>
      percorrer(r).visiveis
        .map((id) => JSON.stringify(schema.blocks.find((b) => b.id === id)).toLowerCase())
        .filter((t) => t.includes("não concede habilitação")).length;
    expect(vezes(base)).toBe(1); // só na tela final
    expect(vezes({ ...base, [ID.habilitacao]: "m-hab-nao" })).toBe(1); // só no aviso
  });

  it("as duas telas finais abrem o WhatsApp de atendimento, sem dado do lead na URL", () => {
    const finais = schema.blocks.filter((b) => b.type === "result");
    expect(finais).toHaveLength(2);
    for (const b of finais) {
      const url = new URL(b.ctaUrl!);
      expect(url.origin + url.pathname).toBe("https://wa.me/5527997390013");
      expect(url.searchParams.get("text")).toContain("Mentoria Método & Decisão");
      expect(b.ctaUrl).not.toMatch(/\{\{|nome|email|score/i);
    }
  });
});
