import { useCallback, useEffect, useState } from "react";
import type { PassoDoTutorial } from "../components/TutorialGuiado";

/** Versionada: subir o número reapresenta um tutorial reescrito a quem já viu. */
export const CHAVE_DO_TUTORIAL = "altleadflow:tutorial-construtor:v2";
const CHAVE = CHAVE_DO_TUTORIAL;
/** O tutorial aponta para o painel lateral, que é `hidden lg:block`. */
const LARGURA_MINIMA = 1024;

export const PASSOS_DO_CONSTRUTOR: PassoDoTutorial[] = [
  {
    alvo: "etapas",
    painel: "etapas",
    titulo: "As telas do seu quiz",
    texto:
      "Cada etapa é uma tela que a pessoa vê. Arraste para reordenar, clique para abrir. É aqui que o funil toma forma.",
  },
  {
    alvo: "componentes",
    painel: "blocos",
    titulo: "Componentes",
    texto:
      "Arraste daqui para a tela do meio: pergunta, imagem, depoimento, contador. A etapa selecionada é quem recebe.",
  },
  {
    alvo: "canvas",
    titulo: "A prévia é o editor",
    texto:
      "O que você vê é o que a pessoa vê. Clique em qualquer elemento aqui para editá-lo no painel da direita.",
  },
  {
    alvo: "inspetor",
    titulo: "Ajuste fino",
    texto:
      "Texto, cores, pontuação e regras de lógica do item selecionado. Sem nada selecionado, mostra o design do quiz inteiro.",
  },
  {
    alvo: "design",
    titulo: "Identidade visual",
    texto:
      "Cores, fontes e fundo de todo o funil — ou só de uma etapa, quando ela precisa destoar.",
  },
  {
    alvo: "publicar",
    titulo: "Publicar",
    texto:
      "Salvar guarda o rascunho; publicar põe no ar. Antes de publicar conferimos o básico — um quiz sem etapa de captura não gera lead, e isso a gente avisa.",
  },
];

/**
 * Mostra o passo a passo na primeira visita ao construtor.
 *
 * Fica em `localStorage` e não no banco de propósito: é preferência de máquina,
 * não dado de negócio, e não vale uma coluna nem uma ida ao servidor. O custo é
 * reaparecer em outro navegador — aceitável para seis cartões que se pula com
 * uma tecla.
 */
/**
 * A decisão de abrir, separada do React para caber num teste.
 *
 * `lerMarca` pode LANÇAR: em navegador com armazenamento bloqueado o acesso a
 * `localStorage` dá exceção. Nesse caso não abrimos — um tutorial que não tem
 * como ser marcado como visto voltaria a cada abertura.
 */
export function deveAbrirTutorial(largura: number, lerMarca: () => string | null): boolean {
  if (largura < LARGURA_MINIMA) return false;
  try {
    return !lerMarca();
  } catch {
    return false;
  }
}

export function useTutorial(pronto: boolean) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    if (!pronto || aberto) return;
    if (!deveAbrirTutorial(window.innerWidth, () => localStorage.getItem(CHAVE))) return;
    setAberto(true);
  }, [pronto, aberto]);

  const fechar = useCallback(() => {
    setAberto(false);
    try {
      localStorage.setItem(CHAVE, new Date().toISOString());
    } catch {
      /* sem armazenamento, só fecha */
    }
  }, []);

  /** Para o botão de ajuda: reabre mesmo já tendo sido visto. */
  const reabrir = useCallback(() => setAberto(true), []);

  return { aberto, fechar, reabrir };
}
