import type { QuizBlock } from "../types";

/**
 * Qual resposta do quiz é o NOME de quem respondeu.
 *
 * A regra antiga era "o primeiro Texto curto do quiz". Errou duas vezes, de
 * formas diferentes:
 *
 * - o lead nascia chamado "(27) 98877-5544", porque um campo de telefone
 *   também era Texto curto. Corrigido na época excluindo campos com máscara;
 * - o lead nasceu chamado "@geadasd", o Instagram da pessoa, porque "Seu
 *   Instagram (opcional)" também é um Texto curto sem máscara — e a máscara
 *   `livre` é a ÚNICA possível para texto: não existe máscara de nome nem de
 *   Instagram para distinguir um do outro.
 *
 * Nos dois casos o remendo seria mais uma exclusão. Aqui muda a natureza da
 * regra: em vez de adivinhar por exclusão, só se aceita um campo que SE
 * DECLARA nome.
 *
 * Por que importa além da tela: o nome entra em `{{nome}}` na mensagem de
 * WhatsApp da faixa. Um nome errado não fica só no CRM — vira "Olá, @geadasd!"
 * na primeira mensagem que a pessoa recebe.
 *
 * Preferir SEM nome a nome errado: lead sem nome ainda tem e-mail e telefone,
 * e quem corrige à mão o nome o vê; nome errado parece certo.
 */

/** Pergunta que pede o nome da PESSOA, não de outra coisa. */
const PEDE_NOME = /\bnome\b|\bchama(r|mos)?\b|\bname\b/i;

/** "Nome da empresa", "usuário do Instagram": têm a palavra, não são a pessoa. */
const NAO_E_A_PESSOA =
  /empresa|neg[oó]cio|marca|loja|clínica|clinica|instagram|perfil|usu[aá]rio|site|pet\b|cachorro|filh[oa]/i;

function pareceNomeDePessoa(b: QuizBlock): boolean {
  const texto = [b.title, b.placeholder].filter(Boolean).join(" ");
  return PEDE_NOME.test(texto) && !NAO_E_A_PESSOA.test(texto);
}

export interface NomeDoForm {
  name?: string;
}

/**
 * Ordem, da mais para a menos confiável:
 *
 * 1. o campo "nome" do bloco Formulário — existe para isso, é explícito;
 * 2. um Texto curto cuja variável de saída é `nome` — o autor declarou;
 * 3. um Texto curto cuja PERGUNTA pede o nome da pessoa.
 *
 * Nenhum dos três: devolve `undefined`.
 */
export function escolherNome(
  responses: Record<string, unknown>,
  blocks: QuizBlock[],
  doForm?: NomeDoForm,
): string | undefined {
  const limpo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

  const doFormulario = limpo(doForm?.name);
  if (doFormulario) return doFormulario;

  /* Só texto livre: campo com máscara é telefone, CPF, CEP — nunca um nome. */
  const textos = blocks.filter(
    (b) => b.type === "short-text" && (!b.fieldMask || b.fieldMask === "livre"),
  );

  for (const b of textos) {
    if (b.outputVariable?.trim().toLowerCase() === "nome") {
      const v = limpo(responses[b.id]);
      if (v) return v;
    }
  }

  for (const b of textos) {
    if (!pareceNomeDePessoa(b)) continue;
    const v = limpo(responses[b.id]);
    if (v) return v;
  }

  return undefined;
}
