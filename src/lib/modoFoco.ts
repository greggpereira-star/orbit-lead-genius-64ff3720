import { useSyncExternalStore } from "react";

/**
 * Tela cheia da aplicação (esconde menu lateral e barra superior), para telas que
 * precisam de toda a largura, como o atendimento do WhatsApp.
 *
 * Fica em memória, e não em cookie nem URL: ao recarregar a página volta ao normal,
 * e quem sai da tela que pediu a tela cheia a desliga (ver `Atendimento`). Assim uma
 * outra página nunca nasce sem menu.
 */
let telaCheia = false;
const ouvintes = new Set<() => void>();

export function definirTelaCheia(valor: boolean): void {
  if (telaCheia === valor) return;
  telaCheia = valor;
  ouvintes.forEach((f) => f());
}

export const telaCheiaAtiva = (): boolean => telaCheia;

export function useTelaCheia(): boolean {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f);
      return () => ouvintes.delete(f);
    },
    () => telaCheia,
    () => false,
  );
}

/** Liga ou desliga também a tela cheia do NAVEGADOR (esconde a barra de abas). Falha em silêncio. */
export async function alternarTelaCheiaDoNavegador(ligar: boolean): Promise<void> {
  if (typeof document === "undefined") return;
  try {
    if (ligar && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!ligar && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* não suportado ou recusado: a tela cheia da aplicação já vale por si */
  }
}
