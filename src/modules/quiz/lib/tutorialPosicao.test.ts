import { describe, it, expect } from "vitest";
import { posicaoDoCartao, faixasDoVeu, recorteVisivel } from "./tutorialPosicao";

const JANELA = { width: 1440, height: 900 };
const CARTAO = { width: 320, height: 180 };

describe("posicaoDoCartao", () => {
  it("põe à direita quando há espaço — o lado que não cobre o alvo", () => {
    const p = posicaoDoCartao({ top: 100, left: 0, width: 288, height: 600 }, CARTAO, JANELA);
    expect(p.lado).toBe("direita");
    expect(p.left).toBe(288 + 16);
  });

  it("cai para a esquerda quando o alvo está encostado na borda direita", () => {
    const p = posicaoDoCartao({ top: 100, left: 1200, width: 240, height: 300 }, CARTAO, JANELA);
    expect(p.lado).toBe("esquerda");
    expect(p.left).toBe(1200 - 16 - 320);
  });

  it("usa abaixo quando o alvo é uma faixa larga no topo", () => {
    const p = posicaoDoCartao({ top: 0, left: 0, width: 1440, height: 56 }, CARTAO, JANELA);
    expect(p.lado).toBe("abaixo");
    expect(p.top).toBe(56 + 16);
  });

  it("usa acima quando a faixa larga está no rodapé", () => {
    const p = posicaoDoCartao({ top: 844, left: 0, width: 1440, height: 56 }, CARTAO, JANELA);
    expect(p.lado).toBe("acima");
    expect(p.top).toBe(844 - 16 - 180);
  });

  it("centraliza quando não cabe em lado nenhum", () => {
    const p = posicaoDoCartao({ top: 0, left: 0, width: 1440, height: 900 }, CARTAO, JANELA);
    expect(p.lado).toBe("centro");
  });

  it("nunca deixa o cartão sair da tela ao alinhar com um alvo no canto", () => {
    // Alvo colado no topo: centralizar pela altura jogaria o cartão para cima
    // de -74px, e metade do texto ficaria fora da janela.
    const p = posicaoDoCartao({ top: 0, left: 0, width: 288, height: 32 }, CARTAO, JANELA);
    expect(p.top).toBeGreaterThanOrEqual(0);
    expect(p.left + CARTAO.width).toBeLessThanOrEqual(JANELA.width);
  });

  it("mantém o cartão dentro da tela com alvo no canto inferior", () => {
    const p = posicaoDoCartao({ top: 880, left: 1400, width: 40, height: 20 }, CARTAO, JANELA);
    expect(p.top + CARTAO.height).toBeLessThanOrEqual(JANELA.height);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });
});

describe("faixasDoVeu", () => {
  const soma = (rs: { width: number; height: number }[]) =>
    rs.reduce((t, r) => t + r.width * r.height, 0);

  it("cobre a janela inteira menos o alvo", () => {
    const alvo = { top: 56, left: 1120, width: 320, height: 844 };
    const faixas = faixasDoVeu(alvo, JANELA);
    const areaJanela = JANELA.width * JANELA.height;
    const areaAlvo = alvo.width * alvo.height;
    expect(soma(faixas)).toBe(areaJanela - areaAlvo);
  });

  it("não sobrepõe o alvo em faixa nenhuma", () => {
    const alvo = { top: 200, left: 300, width: 400, height: 200 };
    for (const f of faixasDoVeu(alvo, JANELA)) {
      const cruza =
        f.left < alvo.left + alvo.width &&
        f.left + f.width > alvo.left &&
        f.top < alvo.top + alvo.height &&
        f.top + f.height > alvo.top;
      expect(cruza).toBe(false);
    }
  });

  it("descarta faixa vazia quando o alvo encosta na borda", () => {
    const faixas = faixasDoVeu({ top: 0, left: 0, width: 300, height: 900 }, JANELA);
    expect(faixas).toHaveLength(1);
    expect(faixas[0].left).toBe(300);
  });

  it("recorta alvo que passa da borda em vez de gerar faixa negativa", () => {
    const faixas = faixasDoVeu({ top: 52, left: 1116, width: 328, height: 852 }, JANELA);
    for (const f of faixas) {
      expect(f.width).toBeGreaterThan(0);
      expect(f.height).toBeGreaterThan(0);
      expect(f.left + f.width).toBeLessThanOrEqual(JANELA.width);
      expect(f.top + f.height).toBeLessThanOrEqual(JANELA.height);
    }
  });
});

describe("recorteVisivel", () => {
  it("devolve o alvo inteiro quando ele cabe na tela", () => {
    const alvo = { top: 100, left: 50, width: 200, height: 300 };
    expect(recorteVisivel(alvo, JANELA)).toEqual(alvo);
  });

  it("recorta o que passa da borda de baixo", () => {
    const r = recorteVisivel({ top: 800, left: 0, width: 200, height: 600 }, JANELA);
    expect(r).toEqual({ top: 800, left: 0, width: 200, height: 100 });
  });

  it("devolve null quando o alvo está inteiramente abaixo da dobra", () => {
    // O caso de produção: âncora em top 2546 numa janela de 841.
    expect(
      recorteVisivel(
        { top: 2546, left: 0, width: 272, height: 1625 },
        { width: 1728, height: 841 },
      ),
    ).toBeNull();
  });

  it("devolve null quando sobra só uma lasca", () => {
    expect(recorteVisivel({ top: 896, left: 0, width: 200, height: 300 }, JANELA)).toBeNull();
  });
});
