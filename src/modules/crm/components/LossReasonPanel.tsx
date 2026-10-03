import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertCircle, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  listarMotivosDePerda, criarMotivoDePerda, definirMotivoDaPerda,
} from '@/modules/crm/services/lossReasonService';

/** Opção que revela o campo de escrever, em vez de um motivo salvo. */
const NOVO = '__novo__';

interface Props {
  leadId: string;
  companyId: string;
  motivoAtualId: string | null;
  observacaoAtual: string | null;
  /** Dentro de um cartão que já tem borda e título. */
  semMoldura?: boolean;
}

/**
 * O motivo da perda, em uma linha depois de decidido.
 *
 * A versão anterior mantinha a lista inteira aberta para sempre: cinco blocos
 * empilhados ocupando meia coluna mesmo depois de a pessoa já ter escolhido —
 * e o que estava escolhido disputava atenção com quatro opções que não
 * interessavam mais. Decisão tomada vira afirmação, não formulário.
 *
 * Fechado é uma frase com o motivo. Aberto é um seletor, um campo de
 * observação e Salvar. Sem motivo nenhum, é um convite curto a registrar.
 */
export function LossReasonPanel({
  leadId, companyId, motivoAtualId, observacaoAtual, semMoldura,
}: Props) {
  const qc = useQueryClient();
  // Abre sozinho só quando não há nada registrado: aí a tela precisa pedir.
  const [editando, setEditando] = useState(!motivoAtualId);
  const [escolhido, setEscolhido] = useState<string | null>(motivoAtualId);
  const [observacao, setObservacao] = useState(observacaoAtual ?? '');
  const [novo, setNovo] = useState('');

  // A ficha é reaproveitada entre leads: sem isto, o segundo lead abriria com
  // o motivo do primeiro já selecionado.
  useEffect(() => {
    setEscolhido(motivoAtualId);
    setObservacao(observacaoAtual ?? '');
    setEditando(!motivoAtualId);
    setNovo('');
  }, [leadId, motivoAtualId, observacaoAtual]);

  const motivos = useQuery({
    queryKey: ['motivos-de-perda', companyId],
    queryFn: () => listarMotivosDePerda(companyId),
    enabled: Boolean(companyId),
  });

  const salvar = useMutation({
    mutationFn: async () => {
      let id = escolhido;
      // Motivo novo nasce e já é usado: separar em dois passos faria a pessoa
      // escrever, salvar, e então procurá-lo numa lista para escolher.
      if (id === NOVO || (!id && novo.trim())) {
        await criarMotivoDePerda(companyId, novo);
        const lista = await qc.fetchQuery({
          queryKey: ['motivos-de-perda', companyId],
          queryFn: () => listarMotivosDePerda(companyId),
        });
        id = lista.find((m) => m.label === novo.trim())?.id ?? null;
      }
      if (!id) throw new Error('Escolha ou escreva um motivo.');
      await definirMotivoDaPerda(leadId, id, observacao.trim() || null);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      setEditando(false);
      setNovo('');
      toast.success('Motivo registrado');
    },
    onError: (e: Error) => toast.error('Não deu para salvar', { description: e.message }),
  });

  const lista = motivos.data ?? [];
  const atual = lista.find((m) => m.id === motivoAtualId) ?? null;

  const moldura = semMoldura
    ? ''
    : 'rounded-lg border border-destructive/20 bg-destructive/[0.04] p-3';

  if (!editando) {
    return (
      <div className={`flex items-start gap-2.5 ${moldura}`}>
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">Motivo da perda</p>
          <p className="text-sm font-medium">{atual?.label ?? 'Registrado'}</p>
          {observacaoAtual && (
            <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{observacaoAtual}</p>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={() => setEditando(true)}>
          Alterar
        </Button>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${moldura}`}>
      {!semMoldura && (
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm font-medium">Por que perdeu</p>
        </div>
      )}

      {motivos.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <Select
            value={escolhido ?? ''}
            onValueChange={(v) => setEscolhido(v)}
          >
            <SelectTrigger className="h-9 w-full bg-background" aria-label="Motivo da perda">
              <SelectValue placeholder={lista.length ? 'Selecione o motivo' : 'Escreva o primeiro motivo'} />
            </SelectTrigger>
            <SelectContent>
              {lista.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
              ))}
              <SelectItem value={NOVO}>Outro motivo…</SelectItem>
            </SelectContent>
          </Select>

          {(escolhido === NOVO || lista.length === 0) && (
            <div className="flex gap-2">
              <Input
                autoFocus
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                placeholder="Ex.: Achou mais barato"
                className="h-9 bg-background"
                aria-label="Novo motivo de perda"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && novo.trim()) { e.preventDefault(); salvar.mutate(); }
                }}
              />
              <Button
                type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0"
                disabled={!novo.trim() || salvar.isPending}
                onClick={() => salvar.mutate()}
                aria-label="Criar motivo e registrar"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          )}

          <Textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="O que aconteceu (opcional)"
            rows={2}
            className="bg-background text-xs"
            aria-label="Observação sobre a perda"
          />

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8"
              disabled={salvar.isPending || (!escolhido && !novo.trim()) || (escolhido === NOVO && !novo.trim())}
              onClick={() => salvar.mutate()}
            >
              {salvar.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Salvar
            </Button>
            {motivoAtualId && (
              <Button
                variant="ghost" size="sm" className="h-8"
                onClick={() => {
                  setEscolhido(motivoAtualId);
                  setObservacao(observacaoAtual ?? '');
                  setNovo('');
                  setEditando(false);
                }}
              >
                Cancelar
              </Button>
            )}
          </div>

          {!motivoAtualId && (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Sem motivo, este lead só conta como perdido — não entra em público de
              reengajamento nem de exclusão.
            </p>
          )}
        </>
      )}
    </div>
  );
}
