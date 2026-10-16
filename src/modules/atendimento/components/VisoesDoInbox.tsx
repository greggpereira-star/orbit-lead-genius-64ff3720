import { Archive, Inbox, UserCheck, UserX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Filtro } from "../lib/conversas";

/**
 * Barra de visões do inbox (telas largas). São os mesmos filtros da lista, em
 * outro lugar: quem usa a tela o dia todo precisa deles à vista, não escondidos
 * em abas pequenas acima das conversas.
 */
const VISOES: Array<{ filtro: Filtro; rotulo: string; Icone: typeof Inbox }> = [
  { filtro: "entrada", rotulo: "Entrada", Icone: Inbox },
  { filtro: "minhas", rotulo: "Minhas", Icone: UserCheck },
  { filtro: "fila", rotulo: "Não atribuídas", Icone: UserX },
  { filtro: "resolvidas", rotulo: "Resolvidas", Icone: Archive },
];

export function VisoesDoInbox(props: {
  filtro: Filtro;
  contagens: Record<Filtro, number>;
  onFiltro: (f: Filtro) => void;
}) {
  return (
    <nav aria-label="Visões do inbox" className="hidden flex-col gap-1 border-r p-3 xl:flex">
      <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Visões
      </p>
      {VISOES.map(({ filtro, rotulo, Icone }) => (
        <button
          key={filtro}
          onClick={() => props.onFiltro(filtro)}
          aria-current={props.filtro === filtro ? "true" : undefined}
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
            props.filtro === filtro
              ? "bg-primary/10 font-medium text-primary"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Icone className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{rotulo}</span>
          <span className="text-xs tabular-nums">{props.contagens[filtro]}</span>
        </button>
      ))}
    </nav>
  );
}
