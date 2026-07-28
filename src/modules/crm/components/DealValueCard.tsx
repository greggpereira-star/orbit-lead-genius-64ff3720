import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, CircleDollarSign } from 'lucide-react';
import { toast } from 'sonner';
import { salvarValorDaVenda } from '@/lib/google-ads.functions';

/**
 * Valor do negócio fechado com este lead.
 *
 * Existe por causa da conversão de venda no Google Ads: sem valor, o Google
 * otimiza por volume de lead, que é o oposto do que interessa. Com valor, ele
 * aprende quais anúncios trazem gente que compra caro.
 *
 * Salvar já dispara a conversão quando o lead está em etapa de ganho — a ordem
 * entre fechar e digitar o valor varia na vida real, e sem isso quem fecha
 * primeiro e digita depois teria a conversão enviada sem valor, em silêncio.
 */
export function DealValueCard({
  leadId,
  valorAtual,
  moeda = 'BRL',
}: {
  leadId: string;
  valorAtual: number | string | null | undefined;
  moeda?: string;
}) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setTexto(valorAtual == null || valorAtual === '' ? '' : formatarBR(Number(valorAtual)));
  }, [valorAtual]);

  const salvar = async () => {
    const valor = parsearBR(texto);
    if (valor === undefined) {
      toast.error('Valor inválido', { description: 'Use apenas números, por exemplo 12.500,00' });
      return;
    }
    setSalvando(true);
    try {
      const r = await salvarValorDaVenda({ data: { leadId, valor } });
      if (r.conversao === 'enviada') {
        toast.success('Valor salvo e conversão enviada ao Google Ads');
      } else if (r.conversao) {
        // O lead está ganho mas a conversão não saiu. Dizer isso é melhor que
        // um "salvo" que esconde metade do resultado.
        toast.warning('Valor salvo, mas a conversão não foi enviada', { description: r.conversao });
      } else {
        toast.success('Valor da venda salvo');
      }
    } catch (e) {
      toast.error('Não deu para salvar', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold uppercase text-muted-foreground">
          <CircleDollarSign className="h-4 w-4" />
          Valor da venda
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              {moeda === 'BRL' ? 'R$' : moeda}
            </span>
            <Input
              inputMode="decimal"
              className="pl-10"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void salvar(); }}
              placeholder="0,00"
              aria-label="Valor da venda"
            />
          </div>
          <Button onClick={salvar} disabled={salvando} className="shrink-0">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Quando o lead entra em uma etapa de ganho, este valor vai junto com a conversão para o
          Google Ads. Sem ele, a campanha é otimizada por quantidade de lead em vez de receita.
        </p>
      </CardContent>
    </Card>
  );
}

const formatarBR = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Lê o número no formato que o brasileiro digita: ponto de milhar, vírgula de
 * decimal. `parseFloat` sozinho leria "12.500,00" como 12.5 — e um erro de
 * mil vezes no valor viraria receita errada declarada ao Google.
 */
function parsearBR(texto: string): number | null | undefined {
  const limpo = texto.trim();
  if (!limpo) return null;
  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(normalizado)) return undefined;
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
