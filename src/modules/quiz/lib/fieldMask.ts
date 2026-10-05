import type { QuizBlock } from '../types';

export type Mascara = NonNullable<QuizBlock['fieldMask']>;

export const MASCARAS: { valor: Mascara; rotulo: string; exemplo: string }[] = [
  { valor: 'livre', rotulo: 'Livre', exemplo: '' },
  { valor: 'telefone', rotulo: 'Telefone', exemplo: '(27) 99999-9999' },
  { valor: 'cpf', rotulo: 'CPF', exemplo: '000.000.000-00' },
  { valor: 'cnpj', rotulo: 'CNPJ', exemplo: '00.000.000/0000-00' },
  { valor: 'cep', rotulo: 'CEP', exemplo: '00000-000' },
  { valor: 'data', rotulo: 'Data', exemplo: '31/12/2026' },
  { valor: 'moeda', rotulo: 'Moeda', exemplo: 'R$ 1.234,56' },
  { valor: 'numero', rotulo: 'Só números', exemplo: '12345' },
];

const digitos = (v: string) => v.replace(/\D/g, '');

/**
 * Aplica a máscara ao que já foi digitado.
 *
 * Trabalha sempre sobre os DÍGITOS e remonta o formato do zero. Formatar por
 * cima do texto já formatado quebraria no apagar: o cursor volta sobre um
 * separador, o separador é reinserido, e a tecla não faz nada.
 */
export function aplicarMascara(valor: string, mascara: Mascara | undefined): string {
  if (!mascara || mascara === 'livre') return valor;
  const d = digitos(valor);

  switch (mascara) {
    case 'numero':
      return d;

    case 'telefone': {
      // Celular tem 11 dígitos, fixo tem 10: o traço muda de lugar.
      const n = d.slice(0, 11);
      if (n.length <= 2) return n.length ? `(${n}` : '';
      if (n.length <= 6) return `(${n.slice(0, 2)}) ${n.slice(2)}`;
      if (n.length <= 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
      return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`;
    }

    case 'cpf': {
      const n = d.slice(0, 11);
      return n
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
    }

    case 'cnpj': {
      const n = d.slice(0, 14);
      return n
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }

    case 'cep': {
      const n = d.slice(0, 8);
      return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n;
    }

    case 'data': {
      const n = d.slice(0, 8);
      if (n.length <= 2) return n;
      if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
      return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4)}`;
    }

    case 'moeda': {
      // Os dois últimos dígitos são sempre os centavos — é o que faz digitar
      // da direita para a esquerda, como em caixa registradora.
      const n = d.slice(0, 13);
      if (!n) return '';
      const centavos = n.padStart(3, '0');
      const inteiro = centavos.slice(0, -2).replace(/^0+(?=\d)/, '');
      return `R$ ${Number(inteiro).toLocaleString('pt-BR')},${centavos.slice(-2)}`;
    }

    default:
      return valor;
  }
}

/** Quantos caracteres a máscara completa ocupa — serve de `maxLength` natural. */
export function tamanhoDaMascara(mascara: Mascara | undefined): number | undefined {
  switch (mascara) {
    case 'telefone': return 15;
    case 'cpf': return 14;
    case 'cnpj': return 18;
    case 'cep': return 9;
    case 'data': return 10;
    default: return undefined;
  }
}

const SIMBOLO: Record<'BRL' | 'USD' | 'EUR', { locale: string; moeda: string }> = {
  BRL: { locale: 'pt-BR', moeda: 'BRL' },
  USD: { locale: 'en-US', moeda: 'USD' },
  EUR: { locale: 'de-DE', moeda: 'EUR' },
};

/**
 * Preço formatado pela moeda escolhida.
 *
 * Só entra em ação quando há moeda E valor numérico. Sem os dois, o campo de
 * texto livre de sempre continua mandando — assim nenhum quiz publicado, que
 * escreveu "R$ 97" na mão, muda de aparência.
 */
export function formatarPreco(
  block: Pick<QuizBlock, 'pricingCurrency' | 'pricingAmount' | 'pricingPrice' | 'pricingPrefix' | 'pricingSuffix'>,
): { valor: string; prefixo?: string; sufixo?: string } {
  const { pricingCurrency, pricingAmount } = block;
  /* Prefixo e sufixo voltam SEPARADOS do valor, e não concatenados numa
     string só: na tela o valor é o número grande e eles são a letra miúda em
     volta. Juntos, "por apenas" sairia do mesmo tamanho do preço e roubaria
     dele a atenção — foi o que aconteceu no primeiro teste. */
  if (!pricingCurrency || typeof pricingAmount !== 'number' || Number.isNaN(pricingAmount)) {
    return { valor: block.pricingPrice ?? '' };
  }
  const { locale, moeda } = SIMBOLO[pricingCurrency];
  const valor = pricingAmount.toLocaleString(locale, {
    style: 'currency',
    currency: moeda,
    minimumFractionDigits: Number.isInteger(pricingAmount) ? 0 : 2,
  });
  return {
    valor,
    prefixo: block.pricingPrefix?.trim() || undefined,
    sufixo: block.pricingSuffix?.trim() || undefined,
  };
}
