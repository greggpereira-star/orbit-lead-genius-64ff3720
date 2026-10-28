import { Link } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { NumeroHeroi } from "@/components/ui/numero-heroi";
import { ErroDeConsulta } from "@/modules/analytics/components/ErroDeConsulta";
import {
  formatarDuracao,
  percentual,
  type AnaliseDeResposta,
} from "@/modules/analytics/lib/resposta";

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Quanto a equipe leva para responder o lead que chega.
 *
 * Ordem de leitura: primeiro a COBERTURA (para quantos leads o número vale), depois a
 * mediana e os prazos, depois o que está esperando agora. Resposta de automação não
 * conta como resposta, e a nota no fim diz que noite e fim de semana não são descontados.
 */
export function TempoDeRespostaCard({
  analise,
  carregando,
  erro,
  aoTentar,
  tentando,
}: {
  analise: AnaliseDeResposta | null;
  carregando: boolean;
  erro: boolean;
  aoTentar: () => void;
  tentando: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-bold leading-none tracking-tight">Tempo de resposta</h2>
        <CardDescription>
          Do momento em que o lead chega até a primeira mensagem de alguém da equipe no WhatsApp.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && (
          <ErroDeConsulta
            titulo="Não foi possível carregar o tempo de resposta."
            aoTentar={aoTentar}
            tentando={tentando}
          />
        )}

        {carregando && !erro && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}

        {!erro && analise && (
          <>
            <p className="text-sm">
              <span className="font-medium">
                {analise.comConversa} de {analise.leadsTotal}{" "}
                {plural(analise.leadsTotal, "lead", "leads")} (
                {percentual(analise.comConversa, analise.leadsTotal)}) têm conversa no WhatsApp
                ligada
              </span>
              <span className="text-muted-foreground">
                {" "}
                — só esses podem ser medidos.
                {analise.coberturaBaixa &&
                  " Com tão pouca cobertura, o tempo abaixo não descreve o atendimento como um todo."}
              </span>
            </p>

            {analise.respondidos === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum lead do período foi respondido por alguém da equipe no WhatsApp.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <NumeroHeroi
                    rotulo="Mediana"
                    valor={formatarDuracao(analise.medianaSegundos)}
                    nota={`${analise.respondidos} ${plural(analise.respondidos, "lead respondido", "leads respondidos")}`}
                  />
                  <NumeroHeroi
                    rotulo="9 em cada 10 até"
                    valor={formatarDuracao(analise.p90Segundos)}
                    nota="dos leads respondidos"
                  />
                  {analise.prazos.slice(0, 2).map((p) => (
                    <NumeroHeroi
                      key={p.rotulo}
                      rotulo={`Respondidos ${p.rotulo}`}
                      valor={percentual(p.quantidade, analise.respondidos)}
                      nota={`${p.quantidade} de ${analise.respondidos}`}
                    />
                  ))}
                </div>
                {analise.amostraPequena && (
                  <Badge
                    variant="outline"
                    title="Regra prática, não uma garantia: com poucos leads respondidos, a mediana balança."
                  >
                    Amostra pequena
                  </Badge>
                )}
              </>
            )}

            {analise.semResposta > 0 && (
              <p className="text-sm text-muted-foreground">
                {analise.semResposta}{" "}
                {plural(analise.semResposta, "lead com conversa", "leads com conversa")} sem nenhuma
                resposta da equipe
                {analise.soAutomacao > 0 &&
                  ` (${analise.soAutomacao} ${plural(analise.soAutomacao, "só recebeu", "só receberam")} mensagem automática)`}
                .
              </p>
            )}

            {analise.esperandoAgora > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[var(--aviso-borda)] bg-[var(--aviso-suave)] p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aviso)]" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">
                    {analise.esperandoAgora}{" "}
                    {plural(analise.esperandoAgora, "conversa espera", "conversas esperam")}{" "}
                    resposta agora
                    {analise.esperaMaisAntigaSegundos !== null &&
                      `; a mais antiga há ${formatarDuracao(analise.esperaMaisAntigaSegundos)}`}
                    .
                  </p>
                  <p className="text-muted-foreground">
                    O cliente falou por último e ninguém da equipe respondeu depois. Vale para a
                    empresa toda, não só para o período.
                  </p>
                  <Link
                    to="/whatsapp"
                    className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 md:min-h-0"
                  >
                    Abrir as conversas
                  </Link>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Mensagem automática não conta como resposta. O tempo corre direto: noite e fim de
              semana não são descontados.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
