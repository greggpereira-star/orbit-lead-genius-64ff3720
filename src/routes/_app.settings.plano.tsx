import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Lock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { meuPlano } from "@/lib/planos.functions";
import { RECURSOS, estaIncluido, textoDoValor } from "@/lib/planos/recursos";

export const Route = createFileRoute("/_app/settings/plano")({
  head: () => ({ meta: [{ title: "Plano e recursos — Configurações" }] }),
  component: PlanoERecursos,
});

function PlanoERecursos() {
  const buscar = useServerFn(meuPlano);
  const plano = useQuery({ queryKey: ["meu-plano"], queryFn: () => buscar() });

  if (plano.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }
  const p = plano.data;
  if (!p) {
    return <p className="py-8 text-sm text-muted-foreground">Não foi possível carregar o plano agora.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Plano {p.nome}
            {p.status === "teste" && <Badge variant="secondary">Em teste</Badge>}
            {p.status === "suspenso" && <Badge variant="destructive">Suspenso</Badge>}
          </CardTitle>
          <CardDescription>
            {p.status === "teste" && p.testeAte
              ? `O período de teste termina em ${new Date(p.testeAte).toLocaleDateString("pt-BR")}.`
              : p.status === "suspenso"
                ? "O plano está suspenso: os recursos abaixo voltam ao plano básico até a regularização."
                : "Estes são os recursos incluídos no plano da sua empresa."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {RECURSOS.map((r) => {
              const valor = p.recursos[r.chave];
              const dependeDeOutro = r.depende ? !estaIncluido(p.recursos[r.depende]) : false;
              const incluido = estaIncluido(valor) && !dependeDeOutro;
              return (
                <li key={r.chave} className="flex items-start gap-3 py-3">
                  {incluido ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : (
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/60" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{r.rotulo}</div>
                    <div className="text-xs text-muted-foreground">{r.descricao}</div>
                  </div>
                  <span className={`shrink-0 text-xs tabular-nums ${incluido ? "text-foreground" : "text-muted-foreground"}`}>
                    {dependeDeOutro ? "—" : textoDoValor(r, valor)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">
            Para mudar de plano ou liberar um recurso, fale com a ALT.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
