/**
 * Com que contexto a pessoa abriu o quiz: origem do clique e aparelho.
 *
 * O evento `start` só gravava a sessão. A UTM e o aparelho existiam apenas na
 * submissão — isto é, só de quem CONCLUIU — então o painel não conseguia dizer
 * de onde vinha quem abandonou, que é justamente quem se quer entender.
 *
 * Aparelho vem da largura da janela, não do user agent: é o que o Container
 * responsivo do próprio quiz usa, então "celular" aqui é o mesmo que a pessoa
 * efetivamente viu. Função pura: quem chama passa o que leu.
 */
export type Aparelho = "mobile" | "tablet" | "desktop";

export interface ContextoDaVisita {
  device: Aparelho;
  utm_source?: string;
  utm_campaign?: string;
}

const LIMITE = 100;
const MOBILE_MAX = 640;
const TABLET_MAX = 1024;

export function aparelhoPelaLargura(largura: number): Aparelho {
  if (largura < MOBILE_MAX) return "mobile";
  if (largura < TABLET_MAX) return "tablet";
  return "desktop";
}

export function contextoDaVisita(
  largura: number,
  tracking: Record<string, string> | undefined,
): ContextoDaVisita {
  const limpo = (v: string | undefined) => v?.trim().slice(0, LIMITE) || undefined;
  const origem = limpo(tracking?.utm_source);
  const campanha = limpo(tracking?.utm_campaign);
  return {
    device: aparelhoPelaLargura(largura),
    // Chave sem valor não entra: ausente e vazio contam diferente na leitura.
    ...(origem ? { utm_source: origem } : {}),
    ...(campanha ? { utm_campaign: campanha } : {}),
  };
}
