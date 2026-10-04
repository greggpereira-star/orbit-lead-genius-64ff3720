import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Search, Loader2, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import {
  formMetrics, submissoesParaCsv, baixarCsv,
  type SubmissaoDeFormulario,
} from '../../services/formService';

const POR_PAGINA = 50;

/**
 * Submissões reais.
 *
 * O que havia aqui era uma lista de três pessoas inventadas — "João Silva",
 * "Maria Oliveira", "Pedro Santos" — com telefones e datas escritos no
 * componente. E os botões CSV e PDF emitiam `toast.info` e, dois segundos
 * depois, `toast.success('Exportação concluída')` sem gerar arquivo nenhum.
 */
export function FormSubmissionsPanel({ formId, formName }: { formId: string; formName?: string }) {
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [pagina, setPagina] = useState(0);
  const [exportando, setExportando] = useState(false);

  /* Espera a digitação parar antes de consultar: uma chamada por tecla
     bateria no banco a cada letra. Sem dependência nova para isso. */
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca); setPagina(0); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const { data: linhas, isLoading } = useQuery({
    queryKey: ['form-submissions', formId, buscaAplicada, pagina],
    queryFn: () => formMetrics.submissoes({
      formId, busca: buscaAplicada, limite: POR_PAGINA, offset: pagina * POR_PAGINA,
    }),
    enabled: !!formId,
  });

  const total = linhas?.[0]?.total ?? 0;

  const exportar = async () => {
    setExportando(true);
    try {
      /* Exporta TUDO o que o filtro alcança, não só a página na tela — quem
         pede o CSV quer a base, não 50 linhas. */
      const todas: SubmissaoDeFormulario[] = [];
      let off = 0;
      for (;;) {
        const lote = await formMetrics.submissoes({
          formId, busca: buscaAplicada, limite: 500, offset: off,
        });
        todas.push(...lote);
        if (lote.length < 500) break;
        off += 500;
      }
      if (!todas.length) {
        toast.info('Não há submissões para exportar.');
        return;
      }
      const base = (formName || 'formulario').toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      baixarCsv(submissoesParaCsv(todas), `submissoes-${base}.csv`);
      toast.success(`${todas.length} submissões exportadas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-[-0.01em]">Submissões</h3>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'resposta recebida' : 'respostas recebidas'}`
              : 'Nenhuma resposta ainda'}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2"
          onClick={exportar} disabled={exportando || total === 0}>
          {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Exportar CSV
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nome, e-mail ou telefone..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando...
        </div>
      ) : !linhas?.length ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {buscaAplicada ? 'Nada encontrado para essa busca.' : 'Nenhuma submissão ainda.'}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Lead</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Contato</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Score</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Origem</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Quando</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhas.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.nome || 'Sem nome'}</p>
                      {(s.etiquetas ?? []).length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(s.etiquetas ?? []).map((t) => (
                            <Badge key={t} variant="secondary" className="font-normal">{t}</Badge>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      <p>{s.email || '—'}</p>
                      <p className="tabular-nums">{s.telefone || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-semibold tabular-nums">{s.score ?? 0}</span>
                      {s.temperatura && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{s.temperatura}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.utm_source || '—'}
                      {s.utm_campaign && <p className="truncate max-w-[180px]">{s.utm_campaign}</p>}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-muted-foreground">
                      {new Date(s.criado_em).toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {total > POR_PAGINA && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground tabular-nums">
                {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, total)} de {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={pagina === 0}
                  onClick={() => setPagina((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm"
                  disabled={(pagina + 1) * POR_PAGINA >= total}
                  onClick={() => setPagina((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
