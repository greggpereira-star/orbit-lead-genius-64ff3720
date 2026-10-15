import { Link } from "@tanstack/react-router";
import { ExternalLink, Megaphone, UserRound, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatarTelefone, nomeDaConversa, type ConversaDaLista } from "../lib/conversas";

/** O que veio no `referral` do primeiro contato (anúncio Click-to-WhatsApp). */
function textoDe(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function PainelDoLead({ conversa }: { conversa: ConversaDaLista }) {
  const o = conversa.origin ?? {};
  const titulo = textoDe(o.headline);
  const anuncio = textoDe(o.source_id);
  const tipo = textoDe(o.source_type);

  return (
    <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l p-4 xl:flex">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="h-4 w-4" /> {nomeDaConversa(conversa)}
        </div>
        <div className="mt-1 text-xs tabular-nums text-muted-foreground">
          {formatarTelefone(conversa.contact?.wa_id ?? "")}
        </div>
        {conversa.lead?.email && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{conversa.lead.email}</div>
        )}
      </div>

      {conversa.lead ? (
        <Button variant="outline" size="sm" asChild>
          <Link to="/leads/$id" params={{ id: conversa.lead.id }}>
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir lead no CRM
          </Link>
        </Button>
      ) : (
        <p className="rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
          Este contato ainda não está ligado a um lead. Quando o telefone coincidir com um lead, o
          vínculo é feito automaticamente na próxima mensagem.
        </p>
      )}

      {(titulo || anuncio || tipo) && (
        <div className="space-y-1 rounded-md border p-3 text-xs">
          <div className="flex items-center gap-1.5 font-medium">
            <Megaphone className="h-3.5 w-3.5" /> Veio de anúncio
          </div>
          {titulo && <div className="text-muted-foreground">{titulo}</div>}
          {anuncio && <div className="tabular-nums text-muted-foreground">Anúncio {anuncio}</div>}
          {tipo && <div className="text-muted-foreground">{tipo}</div>}
        </div>
      )}

      {conversa.contact?.opted_out_at && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pediu para não receber mensagens em{" "}
          {new Date(conversa.contact.opted_out_at).toLocaleDateString("pt-BR")}. Nenhum envio é
          possível.
        </div>
      )}
    </aside>
  );
}
