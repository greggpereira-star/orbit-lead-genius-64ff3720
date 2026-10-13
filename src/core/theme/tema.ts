/**
 * Tema claro/escuro do aplicativo.
 *
 * O tema escuro inteiro já existia no `styles.css`: o bloco `.dark` redefine as
 * 49 variáveis de cor do `:root` (a 50ª é `--radius`, que não é cor), e as sete
 * derivadas por `color-mix` seguem sozinhas porque custom property resolve no
 * ponto de uso. O que nunca existiu foi como chegar nele — nenhuma linha do
 * código adicionava a classe `dark`. Um tema completo, inalcançável.
 *
 * Aqui só mora decisão pura, sem `window`: é o que permite testar a regra sem
 * navegador, e é o que o script anti-piscada repete em uma linha.
 */

export type PreferenciaDeTema = "claro" | "escuro" | "sistema";
export type TemaEfetivo = "claro" | "escuro";

/** Namespace no `localStorage`; seis projetos dividem domínios na mesma VPS. */
export const CHAVE_DO_TEMA = "altleadflow:tema";

export const CONSULTA_ESCURO = "(prefers-color-scheme: dark)";

/**
 * O que estava guardado, saneado.
 *
 * Valor inválido vira `sistema` em vez de erro: o que está no `localStorage`
 * veio de uma versão anterior ou de outra aba, e nenhum dos dois justifica
 * deixar a pessoa sem tema.
 */
export function lerPreferencia(bruto: string | null | undefined): PreferenciaDeTema {
  return bruto === "claro" || bruto === "escuro" || bruto === "sistema" ? bruto : "sistema";
}

/** A preferência mais o que o sistema operacional diz, resolvidos em um tema. */
export function temaEfetivo(
  preferencia: PreferenciaDeTema,
  sistemaPrefereEscuro: boolean,
): TemaEfetivo {
  if (preferencia === "sistema") return sistemaPrefereEscuro ? "escuro" : "claro";
  return preferencia;
}

/**
 * Script que roda ANTES da primeira pintura.
 *
 * Sem ele a página nasce clara e vira escura quando o React hidrata — e esse
 * clarão branco é pior do que não ter tema escuro, porque acontece em TODO
 * carregamento. Fica em `<head>`, antes de qualquer coisa.
 *
 * O React não controla o `className` do `<html>` (o shell não escreve esse
 * atributo), então mexer nele aqui não produz divergência de hidratação.
 *
 * A chave vem da constante acima, de propósito: o script é uma segunda
 * implementação da mesma regra, e duas implementações com chaves diferentes
 * dariam um tema que se aplica antes da pintura e se desfaz na hidratação.
 *
 * A condição é "escuro, ou qualquer coisa que não seja claro mais o sistema"
 * — não "escuro, ou sistema/vazio mais o sistema". A segunda forma parece
 * mais literal e estava errada: valor corrompido no armazenamento ("lixo", de
 * uma versão anterior) não casava com nenhum ramo, o script escolhia claro e
 * `lerPreferencia` escolhia sistema. Num sistema escuro isso produzia
 * exatamente o clarão que este script existe para evitar. O teste executa o
 * script de verdade e compara com o módulo em todas as entradas.
 */
export const SCRIPT_ANTI_PISCADA = `try{var p=localStorage.getItem(${JSON.stringify(
  CHAVE_DO_TEMA,
)});var e=p==="escuro"||(p!=="claro"&&matchMedia(${JSON.stringify(
  CONSULTA_ESCURO,
)}).matches);document.documentElement.classList.toggle("dark",e)}catch(_){}`;
