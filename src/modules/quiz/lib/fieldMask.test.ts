import { describe, it, expect } from 'vitest';
import { aplicarMascara, tamanhoDaMascara, formatarPreco } from './fieldMask';

describe('máscaras de campo', () => {
  it('telefone: celular e fixo têm o traço em lugares diferentes', () => {
    expect(aplicarMascara('27999887766', 'telefone')).toBe('(27) 99988-7766');
    expect(aplicarMascara('2733334444', 'telefone')).toBe('(27) 3333-4444');
  });

  it('telefone: formata enquanto digita, sem travar', () => {
    expect(aplicarMascara('2', 'telefone')).toBe('(2');
    expect(aplicarMascara('27', 'telefone')).toBe('(27');
    expect(aplicarMascara('279', 'telefone')).toBe('(27) 9');
  });

  it('apagar funciona', () => {
    // Regressão: formatar por cima do texto já formatado reinsere o separador
    // e a tecla de apagar não faz nada.
    expect(aplicarMascara('(27) 9998', 'telefone')).toBe('(27) 9998');
    expect(aplicarMascara('(27) 999', 'telefone')).toBe('(27) 999');
    expect(aplicarMascara('(27', 'telefone')).toBe('(27');
  });

  it('documentos', () => {
    expect(aplicarMascara('12345678901', 'cpf')).toBe('123.456.789-01');
    expect(aplicarMascara('12345678000199', 'cnpj')).toBe('12.345.678/0001-99');
    expect(aplicarMascara('29900000', 'cep')).toBe('29900-000');
    expect(aplicarMascara('31122026', 'data')).toBe('31/12/2026');
  });

  it('moeda enche da direita para a esquerda, como caixa registradora', () => {
    expect(aplicarMascara('5', 'moeda')).toBe('R$ 0,05');
    expect(aplicarMascara('123456', 'moeda')).toBe('R$ 1.234,56');
  });

  it('descarta o que não é dígito', () => {
    expect(aplicarMascara('a1b2c3', 'numero')).toBe('123');
    expect(aplicarMascara('abc', 'cpf')).toBe('');
  });

  it('`livre` e ausente não mexem no texto', () => {
    expect(aplicarMascara('João da Silva', 'livre')).toBe('João da Silva');
    expect(aplicarMascara('João da Silva', undefined)).toBe('João da Silva');
  });

  it('nunca passa do tamanho da máscara', () => {
    for (const m of ['telefone', 'cpf', 'cnpj', 'cep', 'data'] as const) {
      const cheio = aplicarMascara('9'.repeat(30), m);
      expect(cheio.length).toBe(tamanhoDaMascara(m));
    }
  });
});

describe('preço com moeda', () => {
  it('prefixo e sufixo voltam SEPARADOS do valor', () => {
    // Juntos, saíam no mesmo corpo 4xl do preço e roubavam a atenção do número.
    const r = formatarPreco({ pricingCurrency: 'BRL', pricingAmount: 97, pricingPrefix: 'por apenas', pricingSuffix: 'à vista' });
    expect(r.valor).toMatch(/97/);
    expect(r.prefixo).toBe('por apenas');
    expect(r.sufixo).toBe('à vista');
  });

  it('inteiro sai sem centavos, quebrado sai com', () => {
    expect(formatarPreco({ pricingCurrency: 'BRL', pricingAmount: 97 }).valor).not.toMatch(/,/);
    expect(formatarPreco({ pricingCurrency: 'BRL', pricingAmount: 8.9 }).valor).toMatch(/8,90/);
  });

  it('sem moeda, o texto livre de sempre continua mandando', () => {
    // É o que impede um quiz publicado que escreveu "R$ 67" na mão de mudar.
    expect(formatarPreco({ pricingPrice: 'R$ 67 à vista' })).toEqual({ valor: 'R$ 67 à vista' });
  });

  it('moeda sem valor numérico cai no texto livre', () => {
    expect(formatarPreco({ pricingCurrency: 'BRL', pricingPrice: 'sob consulta' }).valor).toBe('sob consulta');
  });
});
