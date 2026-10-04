import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, CircleDashed, DoorOpen, Percent, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { formMetrics } from '../../services/formService';

/**
 * Atividade real do formulário.
 *
 * O que havia era inventado: "1.284 eventos", "842 inícios", "156 submissões",
 * "18.5%" e cinco linhas de atividade (`field_focused`, `form_viewed`,
 * `sdk_loaded`) escritas no componente.
 *
 * O produto não registra foco de campo nem visualização — montar esses números
 * exigiria um coletor que não existe. O que existe de verdade é o funil entre
 * rascunho e envio, e é isso que a tela mostra agora. Preferi quatro números
 * verdadeiros a oito inventados.
 */
export function FormEventsPanel({ formId }: { formId: string }) {
  const { company } = useAuth();

  const { data: metricas, isLoading } = useQuery({
    queryKey: ['form-metrics', company?.id],
    queryFn: () => formMetrics.porEmpresa(company!.id),
    enabled: !!company?.id,
  });

  const { data: atividade } = useQuery({
    queryKey: ['form-activity', formId],
    queryFn: () => formMetrics.atividade(formId, 25),
    enabled: !!formId,
  });

  const m = metricas?.[formId];

  const cartoes = [
    { rotulo: 'Enviados', valor: m?.enviados ?? 0, icone: CheckCircle2, cor: 'text-[var(--sucesso)]' },
    { rotulo: 'Em preenchimento', valor: (m?.iniciados ?? 0) - (m?.abandonados ?? 0), icone: CircleDashed, cor: 'text-muted-foreground' },
    { rotulo: 'Abandonados', valor: m?.abandonados ?? 0, icone: DoorOpen, cor: 'text-[var(--aviso)]' },
    { rotulo: 'Conclusão', valor: `${m?.taxa_de_conclusao ?? 0}%`, icone: Percent, cor: 'text-primary' },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cartoes.map((c) => (
          <Card key={c.rotulo}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  {c.rotulo}
                </p>
                <p className="mt-1 text-[22px] font-semibold tracking-[-0.025em] tabular-nums">
                  {isLoading ? '—' : c.valor}
                </p>
              </div>
              <c.icone className={`h-5 w-5 ${c.cor}`} />
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Conclusão é a proporção de quem enviou entre todos que começaram a preencher.
        O produto não registra visualizações do formulário, então não há taxa sobre visitas.
      </p>

      <div className="cartao">
        <div className="cartao-topo">
          <span className="disco"><CheckCircle2 className="h-4 w-4" /></span>
          <div>
            <h3 className="text-[13px] font-semibold leading-tight">Atividade recente</h3>
            <p className="text-[11px] text-muted-foreground">Envios, abandonos e quem está preenchendo agora.</p>
          </div>
        </div>
        <div className="cartao-corpo">
          {!atividade ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" /> Carregando...
            </p>
          ) : atividade.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma atividade ainda.
            </p>
          ) : (
            <div className="divide-y divide-[var(--linha-sutil)]">
              {atividade.map((a, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${
                    a.tipo === 'enviado' ? 'text-[var(--sucesso)]'
                      : a.tipo === 'abandonado' ? 'text-[var(--aviso)]'
                      : 'text-muted-foreground'
                  }`}>
                    {a.tipo}
                  </span>
                  <span className="text-[13px] font-medium">{a.identificacao}</span>
                  {a.passo != null && (
                    <span className="text-[12px] text-muted-foreground">passo {a.passo}</span>
                  )}
                  {a.score != null && a.score > 0 && (
                    <span className="text-[12px] text-muted-foreground tabular-nums">
                      score {a.score}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                    {new Date(a.quando).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
