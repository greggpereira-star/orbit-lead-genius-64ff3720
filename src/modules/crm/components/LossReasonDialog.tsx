import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  listarMotivosDePerda, criarMotivoDePerda,
} from '@/modules/crm/services/lossReasonService';

interface Props {
  companyId: string;
  leadName: string;
  open: boolean;
  /** Confirmar fecha e devolve o que foi escolhido. */
  onConfirm: (motivoId: string, observacao: string | null) => void;
  /** Cancelar precisa desfazer o movimento otimista de quem chamou. */
  onCancel: () => void;
}

/**
 * Pergunta por que o lead foi perdido, no instante em que ele é perdido.
 *
 * Esse instante é o único em que a resposta existe. Perguntar depois — num
 * relatório, numa revisão de carteira — devolve "não lembro", e foi assim que
 * a base chegou a zero motivo registrado.
 *
 * O motivo é obrigatório porque sem ele o registro não serve para nada: a
 * diferença entre "sem orçamento agora" e "não era o perfil" é a diferença
 * entre um público de reengajamento e um público de exclusão.
 */
export function LossReasonDialog({ companyId, leadName, open, onConfirm, onCancel }: Props) {
  const qc = useQueryClient();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [observacao, setObservacao] = useState('');
  const [novo, setNovo] = useState('');

  const motivos = useQuery({
    queryKey: ['motivos-de-perda', companyId],
    queryFn: () => listarMotivosDePerda(companyId),
    enabled: Boolean(companyId) && open,
  });

  // Cada abertura é sobre um lead diferente: manter a escolha anterior faria o
  // segundo lead herdar o motivo do primeiro sem ninguém perceber.
  useEffect(() => {
    if (open) { setEscolhido(null); setObservacao(''); setNovo(''); }
  }, [open]);

  const criar = useMutation({
    mutationFn: (nome: string) => criarMotivoDePerda(companyId, nome),
    onSuccess: async () => {
      const lista = await qc.fetchQuery({
        queryKey: ['motivos-de-perda', companyId],
        queryFn: () => listarMotivosDePerda(companyId),
      });
      // Já deixa escolhido: quem acabou de escrever o motivo quer usá-lo.
      setEscolhido(lista.find((m) => m.label === novo.trim())?.id ?? null);
      setNovo('');
    },
    onError: (e: Error) => toast.error('Não deu para criar', { description: e.message }),
  });

  const lista = motivos.data ?? [];
  const vazia = !motivos.isLoading && lista.length === 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Por que perdeu {leadName}?</DialogTitle>
          <DialogDescription>
            {vazia
              ? 'Nenhum motivo cadastrado ainda. Escreva o primeiro — a lista é sua e você edita depois.'
              : 'Fica registrado junto com até onde o lead chegou no funil.'}
          </DialogDescription>
        </DialogHeader>

        {motivos.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {lista.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {lista.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setEscolhido(m.id)}
                    aria-pressed={escolhido === m.id}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                      escolhido === m.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="novo-motivo" className="text-xs text-muted-foreground">
                {vazia ? 'Primeiro motivo' : 'Faltou um? Escreva e ele entra na lista'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="novo-motivo"
                  value={novo}
                  onChange={(e) => setNovo(e.target.value)}
                  placeholder="Ex.: Achou mais barato"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && novo.trim()) { e.preventDefault(); criar.mutate(novo); }
                  }}
                />
                <Button
                  type="button" variant="outline" size="icon"
                  disabled={!novo.trim() || criar.isPending}
                  onClick={() => criar.mutate(novo)}
                  aria-label="Adicionar motivo à lista"
                >
                  {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs-perda" className="text-xs text-muted-foreground">
                O que aconteceu (opcional)
              </Label>
              <Textarea
                id="obs-perda"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Fechou com o concorrente por R$ 300 a menos."
                rows={2}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!escolhido}
            onClick={() => escolhido && onConfirm(escolhido, observacao.trim() || null)}
          >
            Marcar como perdido
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
