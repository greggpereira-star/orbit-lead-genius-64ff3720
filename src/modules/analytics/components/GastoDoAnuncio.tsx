import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  estadoDoGasto,
  escolherContaDeAnuncio,
  listarContasDeAnuncioDaEmpresa,
  sincronizarGastoAgora,
} from '@/lib/gasto.functions';

/**
 * Estado do gasto: o que falta para o custo por lead aparecer, e como resolver.
 *
 * Sem isto a tabela mostraria colunas de custo vazias sem explicar nada, e o
 * dono acharia que o recurso não funciona. Cada situação aponta o próximo passo.
 */
export function GastoDoAnuncio({ onAtualizou }: { onAtualizou: () => void }) {
  const qc = useQueryClient();
  const buscarEstado = useServerFn(estadoDoGasto);
  const buscarContas = useServerFn(listarContasDeAnuncioDaEmpresa);
  const escolher = useServerFn(escolherContaDeAnuncio);
  const sincronizar = useServerFn(sincronizarGastoAgora);
  const [contaEscolhida, setContaEscolhida] = useState('');

  const estado = useQuery({ queryKey: ['gasto-estado'], queryFn: () => buscarEstado() });

  const contas = useQuery({
    queryKey: ['gasto-contas'],
    queryFn: () => buscarContas(),
    enabled: Boolean(estado.data?.podeConfigurar && estado.data.conexao === 'ok' && !estado.data.conta),
  });

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['gasto-estado'] });
    onAtualizou();
  };

  const escolhendo = useMutation({
    mutationFn: (contaId: string) => escolher({ data: { contaId } }),
    onSuccess: (r) => {
      if (r.sincronizacao.ok) toast.success(`Conta conectada. ${r.sincronizacao.linhas} registros de gasto importados.`);
      else toast.error(r.sincronizacao.detalhe);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sincronizando = useMutation({
    mutationFn: () => sincronizar({ data: { dias: 30 } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Gasto atualizado: ${r.linhas} registros dos últimos ${r.dias} dias.`);
      else toast.error(r.detalhe);
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const e = estado.data;
  if (!e) return null;

  const aviso = (texto: string, acao?: React.ReactNode) => (
    <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-[var(--aviso-borda)] bg-[var(--aviso-suave)] p-3 text-sm">
      <AlertCircle className="h-4 w-4 shrink-0 text-[var(--aviso)]" />
      <p className="min-w-0 flex-1 text-muted-foreground">{texto}</p>
      {acao}
    </div>
  );

  const reconectar = e.podeConfigurar ? (
    <Button asChild size="sm" variant="outline">
      <Link to="/integrations/meta">Reconectar Facebook</Link>
    </Button>
  ) : null;

  if (e.conexao === 'ausente') {
    return aviso('Conecte o Facebook para importar o gasto dos anúncios e ver o custo por lead.', reconectar);
  }
  if (e.conexao === 'revogada' || e.conexao === 'vencida') {
    return aviso(
      e.conexao === 'vencida'
        ? 'O acesso ao Facebook venceu, então o gasto parou de atualizar. Reconecte para voltar a ver o custo por lead.'
        : 'O Facebook invalidou o acesso. Reconecte para voltar a ver o custo por lead.',
      reconectar,
    );
  }
  if (e.conexao === 'sem_ads_read') {
    return aviso('A conexão com o Facebook não tem a permissão de anúncios. Reconecte e aceite todas as permissões.', reconectar);
  }

  if (!e.conta) {
    if (!e.podeConfigurar) {
      return aviso('O gasto ainda não foi configurado. Peça a um administrador para escolher a conta de anúncios.');
    }
    const lista = contas.data && contas.data.ok ? contas.data.contas : [];
    return aviso(
      'Escolha a conta de anúncios para importar o gasto e calcular o custo por lead.',
      <div className="flex items-center gap-2">
        {contas.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : contas.data && !contas.data.ok ? (
          <span className="text-xs text-destructive">{contas.data.erro}</span>
        ) : (
          <>
            <Select value={contaEscolhida} onValueChange={setContaEscolhida}>
              <SelectTrigger className="h-9 w-56" aria-label="Conta de anúncios">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
              <SelectContent>
                {lista.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                    {c.account_status !== 1 ? ' (inativa)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!contaEscolhida || escolhendo.isPending} onClick={() => escolhendo.mutate(contaEscolhida)}>
              {escolhendo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conectar'}
            </Button>
          </>
        )}
      </div>,
    );
  }

  // Conta escolhida. Se a última importação falhou, diz por quê; se deu certo, só informa.
  const falhou = e.ultimoResultado && e.ultimoResultado !== 'ok';
  const quando = e.ultimaSincronizacao
    ? new Date(e.ultimaSincronizacao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    : null;
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>
        Conta <span className="font-medium text-foreground">{e.conta.nome}</span>
        {e.ultimoDiaImportado && <> · gasto até {new Date(`${e.ultimoDiaImportado}T12:00:00`).toLocaleDateString('pt-BR')}</>}
        {quando && <> · atualizado em {quando}</>}
        {falhou && <span className="text-destructive"> · última importação falhou: {e.ultimoDetalhe}</span>}
      </span>
      {e.podeConfigurar && (
        <Button size="sm" variant="ghost" disabled={sincronizando.isPending} onClick={() => sincronizando.mutate()}>
          {sincronizando.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          Atualizar gasto
        </Button>
      )}
    </div>
  );
}
