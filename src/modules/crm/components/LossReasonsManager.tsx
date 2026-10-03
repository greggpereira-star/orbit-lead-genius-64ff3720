import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  listarMotivosDePerda, criarMotivoDePerda, desativarMotivoDePerda, renomearMotivoDePerda,
} from '@/modules/crm/services/lossReasonService';

/**
 * A lista de motivos de perda da empresa.
 *
 * Fica junto das etapas porque é a mesma decisão: como este negócio descreve o
 * próprio funil. Uma imobiliária perde por "não aprovou crédito", uma clínica
 * por "foi para o convênio" — e nenhuma lista pronta cobriria as duas.
 */
export function LossReasonsManager({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState('');

  const motivos = useQuery({
    queryKey: ['motivos-de-perda', companyId],
    queryFn: () => listarMotivosDePerda(companyId),
    enabled: Boolean(companyId),
  });

  const recarregar = () => qc.invalidateQueries({ queryKey: ['motivos-de-perda', companyId] });
  const aoFalhar = (e: Error) => toast.error('Não deu certo', { description: e.message });

  const criar = useMutation({
    mutationFn: (nome: string) => criarMotivoDePerda(companyId, nome),
    onSuccess: () => { setNovo(''); recarregar(); },
    onError: aoFalhar,
  });
  const renomear = useMutation({
    mutationFn: (v: { id: string; label: string }) => renomearMotivoDePerda(v.id, v.label),
    onSuccess: recarregar,
    onError: aoFalhar,
  });
  const desativar = useMutation({
    mutationFn: (id: string) => desativarMotivoDePerda(id),
    onSuccess: recarregar,
    onError: aoFalhar,
  });

  const lista = motivos.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Perguntado no momento em que o cartão entra numa etapa de perda — o único instante
        em que alguém ainda lembra o motivo. Junto com até onde o lead chegou no funil, é
        o que separa quem vale reengajar de quem vale excluir dos anúncios.
      </p>

      <div className="flex gap-2">
        <Input
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Ex.: Não aprovou crédito"
          aria-label="Novo motivo de perda"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && novo.trim()) { e.preventDefault(); criar.mutate(novo); }
          }}
        />
        <Button
          type="button" variant="outline"
          disabled={!novo.trim() || criar.isPending}
          onClick={() => criar.mutate(novo)}
        >
          {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-1.5">Adicionar</span>
        </Button>
      </div>

      {motivos.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum motivo ainda. Escreva o primeiro acima — você também pode criar na hora de
          marcar um lead como perdido.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {lista.map((m) => (
            <li key={m.id} className="flex items-center gap-2 p-2">
              <Input
                defaultValue={m.label}
                className="h-9 border-transparent bg-transparent shadow-none focus-visible:border-input focus-visible:bg-background"
                aria-label={`Nome do motivo ${m.label}`}
                onBlur={(e) => {
                  const nome = e.target.value.trim();
                  if (nome && nome !== m.label) renomear.mutate({ id: m.id, label: nome });
                  else e.target.value = m.label;
                }}
              />
              <Button
                type="button" variant="ghost" size="icon"
                aria-label={`Tirar "${m.label}" da lista`}
                onClick={() => desativar.mutate(m.id)}
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {lista.length > 0 && (
        // Tirar da lista não apaga: leads perdidos continuam apontando para o
        // motivo, e excluir reescreveria o passado deles.
        <p className="text-xs text-muted-foreground">
          Tirar da lista só esconde o motivo daqui para frente. Os leads já perdidos por ele
          continuam com o registro intacto.
        </p>
      )}
    </div>
  );
}
