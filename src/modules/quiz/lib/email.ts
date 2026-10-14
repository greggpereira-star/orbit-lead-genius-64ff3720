/**
 * E-mail digitado num quiz: dizer se serve, e apontar o erro de digitação.
 *
 * Medido em 14/10, na base: ZERO e-mails com formato inválido, porque os
 * formulários da Meta já validam. O que aparece são erros de digitação que
 * PARECEM válidos — 3 de 558 leads com `gmial.com` e parentes — e esses nenhuma
 * regra de formato pega: `ana@gmial.com` é um e-mail bem formado, só que de
 * ninguém. A confirmação, o resultado e a automação vão para o vazio.
 *
 * Por isso há duas peças, de naturezas diferentes:
 *
 * - `validarEmail` BARRA o que não é e-mail (sem `@`, sem domínio, com espaço);
 * - `sugerirCorrecao` só SUGERE, nunca barra. Quem digita `gmail.co` pode ter
 *   um domínio próprio que ninguém conhece; recusar seria perder o lead por
 *   achismo.
 *
 * O bloco Formulário e o bloco E-mail só conferiam "não vazio". O campo é
 * `type="email"`, mas isso só vale para envio de `<form>`, e o botão do quiz
 * não é um — então `abc` passava.
 */

export const AVISO_DO_EMAIL = {
  semArroba: "Falta o @ no e-mail.",
  semDominio: "Confira o final do e-mail, como em nome@gmail.com.",
  espaco: "O e-mail não pode ter espaço.",
  geral: "Esse e-mail não parece certo. Confira.",
} as const;

/**
 * Formato prático, não a RFC inteira.
 *
 * A gramática completa aceita coisas que ninguém usa e que quase sempre são
 * erro (aspas, comentários, domínio sem ponto). Aqui: parte local com os
 * caracteres que de fato existem em caixa de e-mail, domínio com rótulos de
 * letras, números e hífen, e um final de pelo menos duas letras.
 */
const FORMATO =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** `null` quando serve; senão, o que a pessoa lê. Vazio serve: quem decide é `required`. */
export function validarEmail(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (!t) return null;

  if (/\s/.test(t)) return AVISO_DO_EMAIL.espaco;
  if (!t.includes("@")) return AVISO_DO_EMAIL.semArroba;
  if (t.split("@").length !== 2) return AVISO_DO_EMAIL.geral;

  const [local, dominio] = t.split("@");
  if (!local || !dominio) return AVISO_DO_EMAIL.geral;
  if (!dominio.includes(".")) return AVISO_DO_EMAIL.semDominio;

  // Ponto no começo, no fim ou repetido na parte local: o formato aceitaria.
  if (local.startsWith(".") || local.endsWith(".") || t.includes("..")) return AVISO_DO_EMAIL.geral;
  if (t.length > 254 || local.length > 64) return AVISO_DO_EMAIL.geral;

  return FORMATO.test(t) ? null : AVISO_DO_EMAIL.geral;
}

/**
 * Erros de digitação conhecidos, da forma errada para a certa.
 *
 * Lista FECHADA e curta, de propósito. A alternativa — distância de edição
 * contra os provedores grandes — sugeriria `gmail.com` para `gmx.com` e
 * `hotmail.com` para `hotmart.com`, domínios reais de gente real. Aqui só
 * entra o que quase certamente é engano, e a sugestão nunca é imposta.
 */
const CORRECOES: Record<string, string> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmal.com": "gmail.com",
  "gamil.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.com.br": "gmail.com",
  "gmail.cm": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.con": "outlook.com",
  "yaho.com": "yahoo.com",
  "yahho.com": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "icloud.con": "icloud.com",
  "iclod.com": "icloud.com",
};

/**
 * O e-mail corrigido, ou `null` quando não há o que sugerir.
 *
 * Só olha o domínio: a parte antes do `@` é da pessoa e nenhuma regra tem
 * como saber que está errada.
 */
export function sugerirCorrecao(bruto: string | null | undefined): string | null {
  const t = (bruto ?? "").trim();
  if (validarEmail(t) !== null || !t.includes("@")) return null;

  const [local, dominio] = t.split("@");
  const certo = CORRECOES[dominio.toLowerCase()];
  return certo ? `${local}@${certo}` : null;
}

/**
 * O aviso de formato que a tela mostra, ou `null`.
 *
 * Aparece depois de a pessoa sair do campo, ou quando o e-mail já parece
 * terminado (tem `@` e um ponto depois dele). Medido no Chromium: clicar no
 * botão desabilitado TIRA o foco do campo, então o `blur` basta — mas o iOS
 * Safari se comporta diferente e não deu para medir aqui, e botão desabilitado
 * sem motivo é tela que mente por omissão. Por isso o segundo gatilho.
 */
export function avisoVisivelDoEmail(
  bruto: string | null | undefined,
  tocado: boolean,
): string | null {
  const motivo = validarEmail(bruto);
  if (!motivo) return null;
  const pareceTerminado = /@.+\..+/.test((bruto ?? "").trim());
  return tocado || pareceTerminado ? motivo : null;
}
