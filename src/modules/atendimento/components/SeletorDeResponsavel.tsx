import { useState } from "react";
import { Check, ChevronDown, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { iniciais } from "../lib/conversas";

/**
 * Quem é o responsável pela conversa. Lista própria (busca, rolagem, fundo opaco) no
 * lugar do seletor nativo: o menu nativo do navegador ignora o desenho do sistema e
 * não mostra quem é quem.
 */
export function SeletorDeResponsavel(props: {
  /** `assigned_to` da conversa; `null` = sem responsável. */
  valor: string | null;
  atendentes: Array<{ id: string; nome: string }>;
  /** Para marcar "(eu)". */
  userId: string | null;
  desabilitado?: boolean;
  onEscolher: (userId: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const atual = props.atendentes.find((a) => a.id === props.valor) ?? null;
  const rotulo = (a: { id: string; nome: string }) =>
    a.id === props.userId ? `${a.nome} (eu)` : a.nome;
  const escolher = (id: string | null) => {
    setAberto(false);
    if (id !== props.valor) props.onEscolher(id);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 max-w-[220px] gap-2 px-2.5 font-normal"
          disabled={props.desabilitado}
          aria-label={`Responsável: ${atual ? rotulo(atual) : "sem responsável"}`}
        >
          <span
            aria-hidden
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
              atual ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            {atual ? iniciais(atual.nome) : <UserRound className="h-3 w-3" />}
          </span>
          <span className={cn("truncate text-sm", !atual && "text-muted-foreground")}>
            {atual ? rotulo(atual) : "Sem responsável"}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-72 overflow-hidden rounded-xl bg-popover p-0 shadow-xl ring-1 ring-border"
      >
        <Command>
          {props.atendentes.length > 5 && <CommandInput placeholder="Buscar colega…" />}
          <CommandList className="max-h-72 p-1.5">
            <CommandEmpty>Nenhum colega com esse nome.</CommandEmpty>
            <CommandItem
              value="sem responsável"
              className="min-h-10 gap-2.5 text-sm"
              onSelect={() => escolher(null)}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1">Sem responsável</span>
              {props.valor === null && <Check className="h-4 w-4 text-primary" />}
            </CommandItem>
            {props.atendentes.map((a) => (
              <CommandItem
                key={a.id}
                value={a.nome}
                className="min-h-10 gap-2.5 text-sm"
                onSelect={() => escolher(a.id)}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {iniciais(a.nome)}
                </span>
                <span className="min-w-0 flex-1 truncate">{rotulo(a)}</span>
                {props.valor === a.id && <Check className="h-4 w-4 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
