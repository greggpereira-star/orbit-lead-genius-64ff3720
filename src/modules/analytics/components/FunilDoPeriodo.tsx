import { Link } from "@tanstack/react-router";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { ErroDeConsulta } from "@/modules/analytics/components/ErroDeConsulta";
import type { AnaliseDoFunil } from "@/modules/analytics/lib/funil";

/** O selo só entra quando o nome da etapa não diz o mesmo ('Ganho [Ganho]' é ruído). */
const repete = (nome: string, rotulo: string) => nome.trim().toLowerCase().startsWith(rotulo);

const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

/** "374 h" até 2 dias, "16 dias" depois: ninguém lê "441 h" como duas semanas. */
function tempo(horas: number | null): string | null {
  if (horas === null) return null;
  return horas >= 48 ? `${Math.round(horas / 24)} dias` : `${Math.round(horas)} h`;
}

/**
 * Onde os leads do período estão — e onde estão travados.
 *
 * A barra é a FATIA do total, com piso para etapa pequena não sumir (com 178 leads na
 * primeira etapa e 3 na terceira, a barra proporcional à maior deixava a terceira em
 * 1 px). O que a decisão pede vem em texto, antes do gráfico: onde está a maioria e
 * quantos leads ninguém mexe há mais de 24 h.
 */
export function FunilDoPeriodo({
  analise,
  carregando,
  erro,
  aoTentar,
  tentando,
}: {
  analise: AnaliseDoFunil | null;
  carregando: boolean;
  erro: boolean;
  aoTentar: () => void;
  tentando: boolean;
}) {
  const media = analise?.parados ? tempo(analise.parados.horasMedias) : null;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-bold leading-none tracking-tight">Funil</h2>
        <CardDescription>Onde os leads do período estão agora.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && (
          <ErroDeConsulta
            titulo="Não foi possível carregar o funil."
            aoTentar={aoTentar}
            tentando={tentando}
          />
        )}

        {carregando && !erro && (
          <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}

        {!erro && !carregando && analise && analise.total === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum lead no período.</p>
        )}

        {!erro && analise && analise.total > 0 && (
          <>
            {(analise.gargalo || analise.parados) && (
              <div className="flex items-start gap-2.5 rounded-lg border border-[var(--aviso-borda)] bg-[var(--aviso-suave)] p-3 text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aviso)]" aria-hidden />
                <div className="min-w-0 flex-1 space-y-1">
                  {analise.gargalo && (
                    <p>
                      <span className="font-medium">
                        {pct(analise.gargalo.percentual)} dos leads ({analise.gargalo.leads}) ainda
                        estão em “{analise.gargalo.nome}”.
                      </span>
                    </p>
                  )}
                  {analise.parados && (
                    <p className="text-muted-foreground">
                      {analise.parados.total}{" "}
                      {analise.parados.total === 1 ? "lead está parado" : "leads estão parados"} há
                      mais de 24 h em etapa aberta
                      {analise.parados.naEtapa !== analise.parados.total && (
                        <>
                          {" "}
                          ({analise.parados.naEtapa} em “{analise.parados.etapa}”)
                        </>
                      )}
                      .
                      {media && (
                        <>
                          {" "}
                          Em “{analise.parados.etapa}”, os leads estão há {media} em média.
                        </>
                      )}
                    </p>
                  )}
                  <Link
                    to="/pipeline"
                    className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4 md:min-h-0"
                  >
                    Abrir o Pipeline
                  </Link>
                </div>
              </div>
            )}

            <ol className="space-y-2.5" aria-label="Leads por etapa do funil">
              {analise.linhas.map((l) => (
                <li key={l.stage_id} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{l.nome}</span>
                      {l.kind === "won" && !repete(l.nome, "ganho") && (
                        <Badge variant="secondary">Ganho</Badge>
                      )}
                      {l.kind === "lost" && !repete(l.nome, "perdido") && (
                        <Badge variant="outline">Perdido</Badge>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      <span className="font-medium">{l.leads}</span>
                      <span className="text-muted-foreground"> ({pct(l.percentual)})</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className={`h-full rounded-full ${
                        l.kind === "won"
                          ? "bg-[var(--sucesso)]"
                          : l.kind === "lost"
                            ? "bg-muted-foreground/50"
                            : "bg-primary"
                      }`}
                      style={{ width: `${l.barra}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              A barra mostra a fatia dos leads do período em cada etapa; etapa com lead nunca some.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
