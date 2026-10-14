import { aplicarMascara } from "./fieldMask";
import { normalizarTelefone } from "@/modules/crm/lib/identidadeDoLead";

/**
 * Telefone digitado num quiz: formatar enquanto digita e dizer se serve.
 *
 * Medido em 14/10: o lead de teste entrou com `2121121221212` — 13 dígitos,
 * que não é número nenhum — e o painel ainda deduziu "Rio de Janeiro, RJ" pelo
 * DDD 21. O bloco Formulário não tinha máscara, não tinha limite e só
 * conferia o e-mail; o bloco Telefone só exigia "não vazio". A máscara
 * existia, mas só agia no Texto curto com máscara de telefone, o caminho menos
 * usado dos três.
 *
 * Telefone inválido é lead que o vendedor não consegue chamar e que o
 * WhatsApp automático da faixa não alcança — o quiz inteiro serviu para nada.
 *
 * O tamanho válido (10 ou 11 dígitos, depois de tirar zero de operadora e +55)
 * vem de `normalizarTelefone`, a MESMA função que decide se dois leads são a
 * mesma pessoa. Duas definições de "telefone válido" produziriam um número que
 * o quiz aceita e o CRM não consegue casar.
 */

/** DDDs em uso no Brasil. Fora disto não existe linha, qualquer que seja o resto. */
const DDDS_VALIDOS = new Set([
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "21",
  "22",
  "24",
  "27",
  "28",
  "31",
  "32",
  "33",
  "34",
  "35",
  "37",
  "38",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "47",
  "48",
  "49",
  "51",
  "53",
  "54",
  "55",
  "61",
  "62",
  "63",
  "64",
  "65",
  "66",
  "67",
  "68",
  "69",
  "71",
  "73",
  "74",
  "75",
  "77",
  "79",
  "81",
  "82",
  "83",
  "84",
  "85",
  "86",
  "87",
  "88",
  "89",
  "91",
  "92",
  "93",
  "94",
  "95",
  "96",
  "97",
  "98",
  "99",
]);

export const AVISO_DO_TELEFONE = {
  incompleto: "Digite o DDD e o número, com 10 ou 11 dígitos.",
  ddd: "Confira o DDD: ele não existe.",
  celular: "Celular começa com 9 depois do DDD.",
  repetido: "Esse número não parece real. Confira.",
  internacional: "Confira o número: faltam ou sobram dígitos.",
} as const;

const ehInternacional = (bruto: string) => {
  const t = bruto.trim();
  return t.startsWith("+") && !t.startsWith("+55");
};

/**
 * Formata enquanto a pessoa digita.
 *
 * Número com `+` e país que não é o Brasil passa SEM mexer: o quiz é
 * brasileiro, mas barrar um número do exterior perderia o lead por uma regra
 * que não vale para ele.
 *
 * Quem cola "+55 (11) 99999-8888" ou "5511999998888" não pode ser cortado em
 * 11 dígitos na marra — o `55` do país entraria como DDD e o último algarismo
 * sumiria. Por isso o país e o zero de operadora saem ANTES de a máscara
 * contar.
 */
export function formatarEnquantoDigita(bruto: string): string {
  if (ehInternacional(bruto)) return bruto.slice(0, 20);

  let d = bruto.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2).replace(/^0+/, "");
  return aplicarMascara(d.slice(0, 11), "telefone");
}

/**
 * `null` quando serve; senão, o que a pessoa lê.
 *
 * Vazio é válido aqui: se o campo é obrigatório, quem decide é `required`, e
 * misturar as duas coisas mostraria "número inválido" para quem ainda nem
 * começou a digitar.
 */
export function validarTelefone(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;

  if (ehInternacional(t)) {
    const n = t.replace(/\D/g, "").length;
    return n >= 8 && n <= 15 ? null : AVISO_DO_TELEFONE.internacional;
  }

  const d = normalizarTelefone(t);
  if (!d) return AVISO_DO_TELEFONE.incompleto;

  if (!DDDS_VALIDOS.has(d.slice(0, 2))) return AVISO_DO_TELEFONE.ddd;

  /* 11 dígitos é celular, e celular tem 9 logo depois do DDD. 10 dígitos é
     fixo, ou celular antigo sem o nono dígito, e aceita 2 a 9 de primeiro
     algarismo — recusar só o 0 e o 1, que não existem. */
  if (d.length === 11 && d[2] !== "9") return AVISO_DO_TELEFONE.celular;
  if (d.length === 10 && (d[2] === "0" || d[2] === "1")) return AVISO_DO_TELEFONE.incompleto;

  // "11111111111", "99999999999": quem digita para passar de tela.
  if (/^(\d)\1+$/.test(d.slice(2))) return AVISO_DO_TELEFONE.repetido;

  return null;
}

/**
 * Quais blocos são campo de telefone.
 *
 * O bloco Telefone, e o Texto curto com máscara de telefone: este último é um
 * campo de texto que o autor transformou em telefone, e o resto do produto já
 * o trata assim (`extract` do player o conta como telefone).
 */
export function ehCampoDeTelefone(b: { type: string; fieldMask?: string | null }): boolean {
  return b.type === "phone" || (b.type === "short-text" && b.fieldMask === "telefone");
}

/**
 * O aviso que a tela mostra, ou `null`.
 *
 * Só aparece depois que a pessoa saiu do campo, ou quando o que digitou já tem
 * tamanho de número. Mostrar "DDD inexistente" no segundo dígito é acusar quem
 * ainda está escrevendo — e some assim que a pessoa corrige, porque o motivo é
 * recalculado a cada tecla.
 */
export function avisoVisivelDoTelefone(
  bruto: string | null | undefined,
  tocado: boolean,
): string | null {
  const motivo = validarTelefone(bruto);
  if (!motivo) return null;
  const digitos = (bruto ?? "").replace(/\D/g, "").length;
  return tocado || digitos >= 10 ? motivo : null;
}
