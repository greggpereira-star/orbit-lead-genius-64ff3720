import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

/**
 * A regra de identidade existe em DOIS lugares, e precisa ser a mesma.
 *
 * O caminho principal de captura é uma função do banco (`quiz_capture_lead`),
 * e a criação manual é TypeScript. As duas comparam contato, então as duas
 * precisam normalizar igual — senão o produto deduplica num caminho e não no
 * outro, que é o pior dos mundos: o autor vê o comportamento uma vez e passa a
 * contar com ele sempre.
 *
 * A igualdade foi verificada rodando as duas sobre as mesmas 12 entradas em
 * 13/10 (inclusive "21 99999-8888" contra "11 99999-8888", que casariam por
 * engano se a regra fosse "últimos 10 dígitos"). Este teste trava a parte que
 * dá para travar sem banco: que as duas implementações continuem existindo,
 * com a mesma estrutura de decisão.
 */
const ts = readFileSync("src/modules/crm/lib/identidadeDoLead.ts", "utf8");
const sql = readFileSync("supabase/migrations/20261013120000_lead_sem_duplicata.sql", "utf8");
const service = readFileSync("src/modules/crm/services/leadService.ts", "utf8");

describe("a regra de telefone é a mesma nos dois lados", () => {
  it("os dois tiram zero de operadora", () => {
    expect(ts).toContain('.replace(/^0+/, "")');
    expect(sql).toContain("ltrim(regexp_replace");
  });

  it("os dois tiram o 55 só quando ainda sobra número plausível", () => {
    expect(ts).toContain('d.length > 11 && d.startsWith("55")');
    expect(sql).toContain("length(v) > 11 AND left(v, 2) = '55'");
  });

  it("os dois aceitam exatamente 10 ou 11 dígitos", () => {
    // É o que impede casar 11 99999-8888 (SP) com 21 99999-8888 (RJ), que
    // seria o resultado de cortar nos últimos 10.
    expect(ts).toContain("d.length === 10 || d.length === 11");
    expect(sql).toContain("length(v) IN (10, 11)");
  });

  it("nenhum dos dois casa por sufixo solto", () => {
    expect(ts, "voltou a casar por últimos N dígitos").not.toMatch(/slice\(-10\)|slice\(-11\)/);
    expect(sql, "voltou a casar por right(...)").not.toMatch(/right\(\s*regexp_replace/);
  });
});

describe("a deduplicação está ligada nos dois caminhos", () => {
  it("criação manual procura antes de inserir", () => {
    const i = service.indexOf("export async function createLead");
    const j = service.indexOf("supabase.from('leads').insert", i);
    expect(j, "não achei o insert").toBeGreaterThan(i);
    expect(service.slice(i, j)).toContain("acharLeadComMesmoContato");
  });

  it("a busca no banco é larga e a conferência é estreita", () => {
    /* O telefone fica gravado como foi digitado, com máscara: procurar pela
       forma normalizada não acharia nada. Busca-se pelo fim do número e
       confirma-se com `mesmaPessoa`, já normalizado. */
    expect(service).toContain("finalDoTelefone");
    expect(service).toContain("acharDuplicado");
  });

  it("a captura do quiz procura por contato quando a sessão não acha", () => {
    const i = sql.indexOf("l.metadata->>'session_id' = p_session_id");
    const j = sql.indexOf("v_email_norm IS NOT NULL", i);
    expect(j, "a busca por contato não vem depois da busca por sessão").toBeGreaterThan(i);
  });

  it("o nome já gravado não é sobrescrito", () => {
    /* Quem corrige nome à mão no CRM está consertando o que o visitante
       digitou errado. Deixar a submissão seguinte vencer anularia esse
       trabalho — e sem aviso, que é pior: ninguém confere de novo.

       A ordem do `coalesce` é a regra inteira: o campo da TABELA vem primeiro.
       Invertê-la devolve o defeito, e o ensaio em `scripts/ensaio-deduplicacao`
       reprova nos testes 8 e 9. */
    expect(sql).toContain(
      "name        = coalesce(nullif(btrim(name), ''), nullif(btrim(p_name), ''))",
    );
  });

  it("mas o lead sem nome continua sendo preenchido", () => {
    // É o caso da captura antecipada: o e-mail entra antes de existir nome.
    const i = sql.indexOf("name        = coalesce");
    expect(sql.slice(i, i + 120)).toContain("nullif(btrim(p_name), '')");
  });

  it("o lead mais antigo é o que fica", () => {
    // Ele já pode ter responsável, etapa e histórico.
    expect(sql).toContain("ORDER BY l.created_at ASC");
  });

  it("a criação manual avisa em vez de fundir sem perguntar", () => {
    expect(service).toContain("LeadDuplicadoError");
    const rota = readFileSync("src/routes/_app.leads.tsx", "utf8");
    expect(rota).toContain("LeadDuplicadoError");
    expect(rota, "o aviso não leva ao lead existente").toContain("Abrir o existente");
  });
});

describe("a migração se declara não aplicada", () => {
  it("diz que não foi executada e pede teste antes", () => {
    /* Ela altera o caminho mais crítico do produto e não pôde ser executada
       contra banco nenhum daqui. Quem for aplicar precisa ler isso. */
    expect(sql).toContain("NÃO foi executada contra banco");
    expect(sql).toContain("Aplique primeiro em ambiente de teste");
  });
});
