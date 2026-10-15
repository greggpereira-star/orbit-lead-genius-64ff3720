import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Megaphone, UserRound, Ban, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { criarNotaWhatsApp } from "@/lib/whatsapp-atendimento.functions";
import { useNotas } from "../hooks/useAtendimento";
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

      <Notas conversaId={conversa.id} />

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

/** Notas internas: ficam só com a equipe e NUNCA vão ao cliente. */
function Notas({ conversaId }: { conversaId: string }) {
  const qc = useQueryClient();
  const notas = useNotas(conversaId);
  const criar = useServerFn(criarNotaWhatsApp);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      await criar({ data: { conversaId, texto: t } });
      setTexto("");
      qc.invalidateQueries({ queryKey: ["wa-notas", conversaId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a nota.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <StickyNote className="h-3.5 w-3.5" /> Notas internas
        <span className="font-normal text-muted-foreground">· não vão ao cliente</span>
      </div>
      <ul className="space-y-1.5">
        {(notas.data ?? []).map((n) => (
          <li
            key={n.id}
            className="whitespace-pre-wrap rounded-md bg-[var(--aviso)]/10 p-2 text-xs"
          >
            {n.body}
            <div className="mt-1 text-[10px] text-muted-foreground">
              {new Date(n.created_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </div>
          </li>
        ))}
      </ul>
      <Textarea
        rows={2}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva uma nota para a equipe…"
        aria-label="Nova nota interna"
        className="text-xs"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={salvando || !texto.trim()}
        onClick={() => void salvar()}
      >
        Salvar nota
      </Button>
    </div>
  );
}
