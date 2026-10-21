import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { corDoAvatar, iniciaisDaConversa, type ConversaDaLista } from "../lib/conversas";

/** Avatar do contato: iniciais do nome (ou ícone, se só há o número) com cor fixa por pessoa. */
export function AvatarDoContato({
  conversa,
  className,
  iconeClassName,
}: {
  conversa: Pick<ConversaDaLista, "id" | "lead" | "contact">;
  /** Tamanho e tipografia, ex.: "h-9 w-9 text-sm". */
  className?: string;
  iconeClassName?: string;
}) {
  const letras = iniciaisDaConversa(conversa);
  const chave = conversa.contact?.wa_id ?? conversa.id;
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full font-semibold",
        corDoAvatar(chave),
        className,
      )}
    >
      {letras ?? <UserRound className={cn("h-1/2 w-1/2", iconeClassName)} />}
    </span>
  );
}
