import { Copy, ExternalLink, EyeOff, Hourglass, Info, MoreHorizontal, Search } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ConversaDaLista } from "../lib/conversas";

/**
 * Menu "…" do cabeçalho da conversa.
 *
 * Cada item chama o que já existe no sistema — status e leitura passam pelas
 * funções de servidor (papel e empresa conferidos lá), o vínculo com o CRM vem
 * do lead da conversa — e nada aqui contorna a política de envio.
 */
export function MenuDaConversa(props: {
  conversa: ConversaDaLista;
  ocupado?: boolean;
  onNaoLida: () => void;
  onPendente: () => void;
  onPesquisar: () => void;
  onInformacoes: () => void;
  onCopiarNumero: () => void;
}) {
  const { conversa } = props;
  const pendente = conversa.status === "pending";
  const resolvida = conversa.status === "resolved";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Mais ações da conversa">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem disabled={props.ocupado} onSelect={props.onNaoLida}>
          <EyeOff className="mr-2 h-4 w-4" /> Marcar como não lida
        </DropdownMenuItem>
        {!resolvida && (
          <DropdownMenuItem disabled={props.ocupado} onSelect={props.onPendente}>
            <Hourglass className="mr-2 h-4 w-4" />
            {pendente ? "Desmarcar como pendente" : "Marcar como pendente"}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={props.onPesquisar}>
          <Search className="mr-2 h-4 w-4" /> Pesquisar na conversa
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onInformacoes} className="xl:hidden">
          <Info className="mr-2 h-4 w-4" /> Ver informações
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={props.onCopiarNumero}>
          <Copy className="mr-2 h-4 w-4" /> Copiar número
        </DropdownMenuItem>
        {conversa.lead && (
          <DropdownMenuItem asChild>
            <Link to="/leads/$id" params={{ id: conversa.lead.id }}>
              <ExternalLink className="mr-2 h-4 w-4" /> Abrir lead no CRM
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
