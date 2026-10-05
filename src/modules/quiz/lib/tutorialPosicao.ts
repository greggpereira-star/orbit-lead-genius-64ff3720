export interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type Lado = "direita" | "esquerda" | "abaixo" | "acima" | "centro";

export interface PosicaoDoCartao {
  top: number;
  left: number;
  lado: Lado;
}

const FOLGA = 16;

/**
 * Onde encaixar o cartão do tutorial em relação ao elemento destacado.
 *
 * Escrito como função pura porque a parte que erra é a aritmética de borda, e
 * ela só aparece em telas estreitas ou com o alvo junto ao canto — caso que não
 * dá para pegar olhando o próprio navegador em tamanho de mesa.
 *
 * A ordem de tentativa é direita, esquerda, abaixo, acima: o construtor tem
 * painel à esquerda e canvas no meio, então o lado de fora costuma ser o que
 * não cobre o que está sendo explicado. Se nada couber, centraliza — cobrir o
 * alvo é pior do que o cartão sair da tela.
 */
export function posicaoDoCartao(
  alvo: Retangulo,
  cartao: { width: number; height: number },
  janela: { width: number; height: number },
): PosicaoDoCartao {
  const cabeDireita = alvo.left + alvo.width + FOLGA + cartao.width <= janela.width;
  const cabeEsquerda = alvo.left - FOLGA - cartao.width >= 0;
  const cabeAbaixo = alvo.top + alvo.height + FOLGA + cartao.height <= janela.height;
  const cabeAcima = alvo.top - FOLGA - cartao.height >= 0;

  const prender = (v: number, max: number) => Math.max(FOLGA, Math.min(v, max - FOLGA));

  if (cabeDireita) {
    return {
      lado: "direita",
      left: alvo.left + alvo.width + FOLGA,
      top: prender(alvo.top + alvo.height / 2 - cartao.height / 2, janela.height - cartao.height),
    };
  }
  if (cabeEsquerda) {
    return {
      lado: "esquerda",
      left: alvo.left - FOLGA - cartao.width,
      top: prender(alvo.top + alvo.height / 2 - cartao.height / 2, janela.height - cartao.height),
    };
  }
  if (cabeAbaixo) {
    return {
      lado: "abaixo",
      top: alvo.top + alvo.height + FOLGA,
      left: prender(alvo.left + alvo.width / 2 - cartao.width / 2, janela.width - cartao.width),
    };
  }
  if (cabeAcima) {
    return {
      lado: "acima",
      top: alvo.top - FOLGA - cartao.height,
      left: prender(alvo.left + alvo.width / 2 - cartao.width / 2, janela.width - cartao.width),
    };
  }
  return {
    lado: "centro",
    top: Math.max(FOLGA, janela.height / 2 - cartao.height / 2),
    left: Math.max(FOLGA, janela.width / 2 - cartao.width / 2),
  };
}

/**
 * As quatro faixas que escurecem tudo menos o alvo.
 *
 * A primeira versão usava o truque de uma `box-shadow` com espalhamento enorme.
 * Medido no navegador: com o alvo alto (o painel lateral, 852px) o véu
 * simplesmente NÃO pintava, e baixar o espalhamento para a largura da janela
 * não resolveu — a mesma sombra em vermelho pintava e em preto não. Em vez de
 * seguir explicando o compositor, quatro retângulos: não dependem de limite de
 * camada, e a aritmética cabe num teste.
 */
export function faixasDoVeu(
  alvo: Retangulo,
  janela: { width: number; height: number },
): Retangulo[] {
  const topo = Math.max(0, alvo.top);
  const base = Math.min(janela.height, alvo.top + alvo.height);
  const esq = Math.max(0, alvo.left);
  const dir = Math.min(janela.width, alvo.left + alvo.width);

  return [
    { top: 0, left: 0, width: janela.width, height: topo },
    { top: base, left: 0, width: janela.width, height: Math.max(0, janela.height - base) },
    { top: topo, left: 0, width: esq, height: Math.max(0, base - topo) },
    {
      top: topo,
      left: dir,
      width: Math.max(0, janela.width - dir),
      height: Math.max(0, base - topo),
    },
  ].filter((r) => r.width > 0 && r.height > 0);
}
