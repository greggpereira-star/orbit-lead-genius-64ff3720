import { Clock, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WhatsAppIcon } from "@/design-system/components/WhatsAppIcon";
import { cn } from "@/lib/utils";
import {
  esperaDe,
  iniciais,
  nomeDaConversa,
  type ConversaDaLista,
  type Filtro,
  type NivelDeEspera,
  type OrdemDaLista,
} from "../lib/conversas";
import { AvatarDoContato } from "./AvatarDoContato";

const ROTULO: Record<Filtro, string> = {
  entrada: "Entrada",
  minhas: "Minhas",
  seguindo: "Seguindo",
  mencoes: "Menções",
  fila: "Fila",
  todas: "Todas",
  resolvidas: "Resolvidas",
};

/** Visões do dia a dia em cima (largura igual, nada cortado); as demais numa linha menor. */
const FILTROS_PRINCIPAIS: Filtro[] = ["entrada", "minhas", "seguindo", "mencoes"];
const FILTROS_SECUNDARIOS: Filtro[] = ["fila", "todas", "resolvidas"];

const COR_DA_ESPERA: Record<NivelDeEspera, string> = {
  ok: "bg-muted text-muted-foreground",
  atencao: "bg-[var(--aviso)]/15 text-[var(--aviso)]",
  critico: "bg-destructive/10 text-destructive",
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
  /** id do atendente → nome, para o avatar do responsável. */
  atendentes?: Record<string, string>;
  ordem?: OrdemDaLista;
  /** Barra do topo da coluna (título, não lidas, tela cheia…). */
  topo?: ReactNode;
  agora?: Date;
  onFiltro: (f: Filtro) => void;
  onBusca: (v: string) => void;
  onOrdem?: (o: OrdemDaLista) => void;
  onAbrir: (id: string) => void;
}) {
  const ordem = props.ordem ?? "recentes";
  return (
    <aside className="flex min-h-0 min-w-0 flex-col border-r">
      {props.topo}
      <div className="space-y-3 border-b px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={props.busca}
            onChange={(e) => props.onBusca(e.target.value)}
            placeholder="Buscar nome, número ou mensagem"
            className="h-10 pl-9"
            aria-label="Buscar conversas"
          />
        </div>
        {/* Nada rola escondido: as quatro visões do dia a dia dividem a largura, e as outras
            três ficam logo abaixo. Antes era uma fila rolável sem barra e "Menções" saía cortada. */}
        <div className="space-y-1.5" role="tablist" aria-label="Filtrar conversas">
          <div className="grid grid-cols-4 gap-1">
            {FILTROS_PRINCIPAIS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={props.filtro === f}
                onClick={() => props.onFiltro(f)}
                className={cn(
                  "flex h-9 min-w-0 items-center justify-center gap-1 rounded-lg px-1 text-xs font-medium transition-colors",
                  props.filtro === f
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <span className="truncate">{ROTULO[f]}</span>
                <span className="tabular-nums opacity-80">{props.contagens[f]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTROS_SECUNDARIOS.map((f) => (
              <button
                key={f}
                role="tab"
                aria-selected={props.filtro === f}
                onClick={() => props.onFiltro(f)}
                className={cn(
                  "inline-flex h-8 items-center gap-1 rounded-lg px-3 text-xs font-medium transition-colors",
                  props.filtro === f
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {ROTULO[f]} <span className="tabular-nums opacity-80">{props.contagens[f]}</span>
              </button>
            ))}
          </div>
        </div>
        {props.onOrdem && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Ordenar</span>
            <div
              className="inline-flex rounded-md bg-muted p-0.5"
              role="group"
              aria-label="Ordenar conversas"
            >
              {(
                [
                  ["recentes", "Recentes"],
                  ["espera", "Maior espera"],
                ] as const
              ).map(([valor, rotulo]) => (
                <button
                  key={valor}
                  aria-pressed={ordem === valor}
                  onClick={() => props.onOrdem?.(valor)}
                  className={cn(
                    "rounded px-2.5 py-1 transition-colors",
                    ordem === valor
                      ? "bg-background font-medium text-foreground shadow-sm"
                      : "hover:text-foreground",
                  )}
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>
        )}
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
          const espera = esperaDe(c, props.agora);
          const responsavel = c.assigned_to ? props.atendentes?.[c.assigned_to] : undefined;
          return (
            <button
              key={c.id}
              onClick={() => props.onAbrir(c.id)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/50",
                props.ativaId === c.id && "bg-muted",
              )}
            >
              <span className="relative mt-0.5 shrink-0">
                <AvatarDoContato conversa={c} className="h-9 w-9 text-sm" />
                <span
                  aria-label="WhatsApp"
                  className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-background bg-emerald-500 text-white"
                >
                  <WhatsAppIcon className="h-2.5 w-2.5" />
                </span>
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
                  {espera ? (
                    <span
                      aria-label={`Aguardando resposta há ${espera.texto}`}
                      title="Tempo desde a última mensagem do cliente"
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                        COR_DA_ESPERA[espera.nivel],
                      )}
                    >
                      <Clock className="h-2.5 w-2.5" />
                      {espera.texto}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {hora(c.last_message_at)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-muted-foreground">
                    {c.last_message_preview ?? "—"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {responsavel && (
                      <span
                        title={`Responsável: ${responsavel}`}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground"
                      >
                        {iniciais(responsavel)}
                      </span>
                    )}
                    {c.unread_agent > 0 && (
                      <Badge
                        className="h-5 min-w-5 rounded-full px-1.5"
                        aria-label={`${c.unread_agent} não lidas`}
                      >
                        {c.unread_agent}
                      </Badge>
                    )}
                  </span>
                </span>
                {c.contact?.opted_out_at && (
                  <span className="mt-1 flex">
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] text-destructive">
                      pediu para parar
                    </span>
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
