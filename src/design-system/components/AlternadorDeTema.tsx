import { Moon, Sun, Monitor, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTema } from "@/core/theme/useTema";
import type { PreferenciaDeTema } from "@/core/theme/tema";

const OPCOES: { valor: PreferenciaDeTema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: "claro", rotulo: "Claro", Icone: Sun },
  { valor: "escuro", rotulo: "Escuro", Icone: Moon },
  { valor: "sistema", rotulo: "Do sistema", Icone: Monitor },
];

/**
 * Escolha de tema, em menu e não em botão que alterna.
 *
 * Um botão de três estados obriga a pessoa a clicar para descobrir o que vem
 * depois, e não mostra em qual ela está — com "do sistema" no meio, que não é
 * nem claro nem escuro, isso fica pior. O menu diz as três opções e marca a
 * atual.
 */
export function AlternadorDeTema() {
  const { preferencia, efetivo, escolher } = useTema();
  const IconeAtual = efetivo === "escuro" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Tema: ${OPCOES.find((o) => o.valor === preferencia)?.rotulo}`}
        >
          <IconeAtual className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPCOES.map(({ valor, rotulo, Icone }) => (
          <DropdownMenuItem key={valor} onClick={() => escolher(valor)} className="gap-2">
            <Icone className="h-4 w-4" />
            <span className="flex-1">{rotulo}</span>
            {preferencia === valor && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
