import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  aguardandoResposta,
  iniciais,
  nomeDaConversa,
  type ConversaDaLista,
  type Filtro,
} from "../lib/conversas";

const ROTULO: Record<Filtro, string> = {
  minhas: "Minhas",
  fila: "Fila",
  todas: "Todas",
  resolvidas: "Resolvidas",
};

function hora(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function ListaDeConversas(props: {
  conversas: ConversaDaLista[];
  carregando: boolean;
  ativaId: string | null;
  filtro: Filtro;
  contagens: Record<Filtro, number>;
  busca: string;
  onFiltro: (f: Filtro) => void;
  onBusca: (v: string) => void;
  onAbrir: (id: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col border-r">
      <div className="space-y-3 border-b p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={props.busca}
            onChange={(e) => props.onBusca(e.target.value)}
            placeholder="Buscar nome, número ou mensagem"
            className="pl-8"
            aria-label="Buscar conversas"
          />
        </div>
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar conversas">
          {(Object.keys(ROTULO) as Filtro[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={props.filtro === f}
              onClick={() => props.onFiltro(f)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                props.filtro === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {ROTULO[f]} <span className="tabular-nums opacity-80">{props.contagens[f]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.carregando && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
        {!props.carregando && props.conversas.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">
            {props.busca ? "Nada encontrado para essa busca." : "Nenhuma conversa nesta lista."}
          </p>
        )}
        {props.conversas.map((c) => {
          const nome = nomeDaConversa(c);
          const espera = aguardandoResposta(c);
          return (
            <button
              key={c.id}
              onClick={() => props.onAbrir(c.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition-colors hover:bg-muted/50",
                props.ativaId === c.id && "bg-muted",
              )}
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
              >
                {iniciais(nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "truncate text-sm",
                      c.unread_agent > 0 ? "font-semibold" : "font-medium",
                    )}
                  >
                    {nome}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {hora(c.last_message_at)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {c.last_message_preview ?? "—"}
                  </span>
                  {c.unread_agent > 0 && (
                    <Badge
                      className="h-5 min-w-5 shrink-0 rounded-full px-1.5"
                      aria-label={`${c.unread_agent} não lidas`}
                    >
                      {c.unread_agent}
                    </Badge>
                  )}
                </span>
                {(espera || c.contact?.opted_out_at || c.assigned_to === null) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {espera && (
                      <span className="rounded bg-[var(--aviso)]/15 px-1.5 text-[10px] font-medium text-[var(--aviso)]">
                        aguardando resposta
                      </span>
                    )}
                    {c.assigned_to === null && c.status !== "resolved" && (
                      <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                        sem responsável
                      </span>
                    )}
                    {c.contact?.opted_out_at && (
                      <span className="rounded bg-destructive/10 px-1.5 text-[10px] text-destructive">
                        pediu para parar
                      </span>
                    )}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
