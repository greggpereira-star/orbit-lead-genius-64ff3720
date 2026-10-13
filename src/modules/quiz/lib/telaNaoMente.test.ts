import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";

/**
 * Nenhuma tela afirma fazer o que não faz.
 *
 * Três formas disso foram encontradas em 13/10, e as três custam a mesma coisa
 * — a pessoa acredita e vai embora:
 *
 * 1. DADO INVENTADO. A tela de Segurança listava quatro registros de auditoria
 *    fixos ("Admin User conectou o Meta Pixel de 192.168.1.1 há 10 minutos").
 *    A de Automações listava quatro execuções, uma delas FALHANDO com "Invalid
 *    Access Token" — alarme falso que mandaria alguém caçar um problema de
 *    token inexistente. E três vendedores inventados como se fossem a equipe.
 *
 * 2. CONTROLE QUE NÃO GRAVA. Seis interruptores acendiam, mostravam um toast
 *    verde dizendo que a preferência fora salva, e nada era gravado. Quem
 *    ligasse "Avisos no WhatsApp" passaria a contar com um aviso que nunca
 *    viria. Pior ainda: "Ativar rodízio" era cópia FALSA de um recurso que
 *    existe de verdade em Roteamento, com motor e gravação próprios.
 *
 * 3. BOTÃO SEM AÇÃO. O "Salvar" do perfil não tinha `onClick`. Nenhum. Sem
 *    nem um erro, a leitura natural é que deu certo.
 *
 * Interruptor que mente custa mais que interruptor que falta: ninguém vai
 * procurar o que já acha que configurou.
 */
const PASTA = "src/routes";
const telasDeConfiguracao = readdirSync(PASTA).filter((f) => f.startsWith("_app.settings"));

const ler = (arquivo: string) => readFileSync(`${PASTA}/${arquivo}`, "utf8");

describe("telas de configuração não mentem", () => {
  it("a varredura achou as telas", () => {
    // Guarda contra o próprio varredor: pasta renomeada passaria vazia.
    expect(telasDeConfiguracao.length).toBeGreaterThanOrEqual(8);
  });

  for (const arquivo of telasDeConfiguracao) {
    const fonte = ler(arquivo);

    it(`${arquivo}: nenhum controle cujo único efeito é dizer que salvou`, () => {
      /* `toast.info` continua valendo — é aviso, não confirmação. O que não
         pode é `success`: ela afirma que algo foi gravado. */
      const mentirosos = [
        ...fonte.matchAll(
          /on(?:CheckedChange|Click|ValueChange)=\{\(\)\s*=>\s*toast\.success\([^)]*\)\}/g,
        ),
      ].map((m) => m[0]);
      expect(mentirosos, `em ${arquivo}: ${mentirosos.join(" | ")}`).toEqual([]);
    });

    it(`${arquivo}: nenhum botão de ação sem handler`, () => {
      const semAcao = [...fonte.matchAll(/<Button([^>]*)>\s*([^<>{}\n]{2,40}?)\s*<\/Button>/g)]
        .filter(([, attrs, texto]) => {
          const acao = /\b(Salvar|Save|Ativar|Enviar|Confirmar|Aplicar)\b/i.test(texto.trim());
          const inerte =
            !attrs.includes("onClick") &&
            !attrs.includes("asChild") &&
            !attrs.includes('type="submit"');
          return acao && inerte;
        })
        .map(([, , texto]) => texto.trim());
      expect(semAcao, `em ${arquivo}: ${semAcao.join(" | ")}`).toEqual([]);
    });
  }

  it("nenhuma lista de registros escrita à mão dentro do JSX", () => {
    /* A assinatura do dado inventado: array literal de objetos declarado no
       meio da marcação e desenhado com `.map`. Lista de OPÇÕES de interface
       (os modos de incorporação, as unidades de tempo) não tem este formato
       porque não carrega `id`, `user`, `name` com valor de pessoa. */
    const suspeitas: string[] = [];
    for (const arquivo of telasDeConfiguracao) {
      const fonte = ler(arquivo);
      for (const m of fonte.matchAll(/\{\[\s*\n\s*\{[\s\S]{40,1500}?\]\.map\(/g)) {
        if (/\b(user|lead|ip|time|status)\s*:\s*['"]/.test(m[0])) suspeitas.push(arquivo);
      }
    }
    expect([...new Set(suspeitas)], `dado inventado em: ${suspeitas.join(", ")}`).toEqual([]);
  });

  it("a distribuição de leads aponta para onde ela existe de verdade", () => {
    // `settings.routing` lê os membros reais e grava por `upsertConfig`. A
    // tela de Automações tinha uma cópia falsa; agora manda para a verdadeira.
    const automacoes = ler("_app.settings.automations.tsx");
    expect(automacoes).toContain('to="/settings/routing"');
    const roteamento = ler("_app.settings.routing.tsx");
    expect(roteamento, "a tela de roteamento deixou de gravar").toContain("upsertConfig");
  });
});
