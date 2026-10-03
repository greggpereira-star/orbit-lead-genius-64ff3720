import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  listarMotivosDePerda, criarMotivoDePerda, definirMotivoDaPerda,
} from '@/modules/crm/services/lossReasonService';

interface Props {
  leadId: string;
  companyId: string;
  motivoAtualId: string | null;
  observacaoAtual: string | null;
  /** Dentro de um cartão que já tem borda e título. */
  semMoldura?: boolean;
}

/**
 * O motivo da perda, editável depois do fato.
 *
 * O diálogo de perda só dispara na mudança de etapa, então quem não preencheu
 * na hora não tinha como voltar. Aconteceu no primeiro uso em produção: o lead
 * foi para Perdido sem motivo e a única saída seria tirá-lo da etapa e
 * recolocá-lo, sujando o histórico com um movimento que não existiu.
 */
export function LossReasonPanel({ leadId, companyId, motivoAtualId, observacaoAtual, semMoldura }: Props) {
  const qc = useQueryClient();
  const [escolhido, setEscolhido] = useState<string | null>(motivoAtualId);
  const [observacao, setObservacao] = useState(observacaoAtual ?? '');
  const [novo, setNovo] = useState('');

  // A ficha é reaproveitada entre leads: sem isto, abrir o segundo lead
  // mostraria o motivo do primeiro.
  useEffect(() => {
    setEscolhido(motivoAtualId);
    setObservacao(observacaoAtual ?? '');
    setNovo('');
  }, [leadId, motivoAtualId, observacaoAtual]);

  const motivos = useQuery({
    queryKey: ['motivos-de-perda', companyId],
    queryFn: () => listarMotivosDePerda(companyId),
    enabled: Boolean(companyId),
  });

  const salvar = useMutation({
    mutationFn: (v: { reasonId: string; notes: string | null }) =>
      definirMotivoDaPerda(leadId, v.reasonId, v.notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Motivo registrado');
    },
    onError: (e: Error) => toast.error('Não deu para salvar', { description: e.message }),
  });

  const criar = useMutation({
    mutationFn: (nome: string) => criarMotivoDePerda(companyId, nome),
    onSuccess: async () => {
      const lista = await qc.fetchQuery({
        queryKey: ['motivos-de-perda', companyId],
        queryFn: () => listarMotivosDePerda(companyId),
      });
      const criado = lista.find((m) => m.label === novo.trim());
      setNovo('');
      // Criar e já registrar: quem escreveu o motivo nesta tela quer usá-lo.
      if (criado) { setEscolhido(criado.id); salvar.mutate({ reasonId: criado.id, notes: observacao.trim() || null }); }
    },
    onError: (e: Error) => toast.error('Não deu para criar', { description: e.message }),
  });

  const lista = motivos.data ?? [];
  const pendente = salvar.isPending || criar.isPending;

  return (
    <div className={semMoldura ? 'space-y-3' : 'space-y-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3'}>
      {!semMoldura && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Por que perdeu</p>
          {pendente && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      )}

      {motivos.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          {/* Lista empilhada, não pastilhas.
              "Encontrou oportunidade melhor" e "Financiamento não aprovado"
              quebravam em duas linhas dentro de um `rounded-full` de 200px — o
              arredondado de pílula só funciona com texto de uma linha, e motivo
              de perda é frase, não palavra. Em bloco cada item ocupa a largura
              toda, lê numa linha e vira alvo de clique maior. */}
          {lista.length > 0 && (
            <div className="space-y-1">
              {lista.map((m) => {
                const ativo = escolhido === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={ativo}
                    disabled={pendente}
                    onClick={() => {
                      setEscolhido(m.id);
                      salvar.mutate({ reasonId: m.id, notes: observacao.trim() || null });
                    }}
                    className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      ativo
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-transparent bg-background hover:border-border hover:bg-muted'
                    }`}
                  >
                    <span className="min-w-0 flex-1">{m.label}</span>
                    {ativo && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={novo}
              onChange={(e) => setNovo(e.target.value)}
              placeholder={lista.length ? 'Outro motivo' : 'Primeiro motivo da lista'}
              className="h-8 bg-background text-xs"
              aria-label="Novo motivo de perda"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && novo.trim()) { e.preventDefault(); criar.mutate(novo); }
              }}
            />
            <Button
              type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0"
              disabled={!novo.trim() || pendente}
              onClick={() => criar.mutate(novo)}
              aria-label="Adicionar motivo e registrar"
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="O que aconteceu (opcional)"
            rows={2}
            className="bg-background text-xs"
            aria-label="Observação sobre a perda"
            onBlur={() => {
              if (escolhido && (observacao.trim() || '') !== (observacaoAtual ?? '')) {
                salvar.mutate({ reasonId: escolhido, notes: observacao.trim() || null });
              }
            }}
          />

          {!escolhido && (
            // Uma linha, não cinco. A versão anterior gastava um terço do
            // painel explicando a consequência antes de a pessoa sequer ter
            // escolhido — e empurrava os dados de contato para fora da vista.
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
