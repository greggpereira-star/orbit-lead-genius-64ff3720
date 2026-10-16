import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Ban,
  ChevronDown,
  ExternalLink,
  Handshake,
  Megaphone,
  MessageCircle,
  Phone,
  StickyNote,
  Tag,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { criarNotaWhatsApp } from "@/lib/whatsapp-atendimento.functions";
import { cn } from "@/lib/utils";
import { useLeadDoPainel, useNotas } from "../hooks/useAtendimento";
import { formatarTelefone, iniciais, nomeDaConversa, type ConversaDaLista } from "../lib/conversas";

/** O que veio no `referral` do primeiro contato (anúncio Click-to-WhatsApp). */
function textoDe(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

const TEMPERATURA: Record<string, string> = { hot: "Quente", warm: "Morno", cold: "Frio" };

/** Seção recolhível do painel. Fechada por padrão só quando o conteúdo é secundário. */
function Secao(props: {
  titulo: string;
  icone: ReactNode;
  aberta?: boolean;
  resumo?: string | null;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(props.aberta ?? false);
  return (
    <section className="border-t first:border-t-0">
      <button
        type="button"
        aria-expanded={aberta}
        onClick={() => setAberta((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium hover:bg-muted/40"
      >
        <span className="text-muted-foreground">{props.icone}</span>
        <span className="flex-1">{props.titulo}</span>
        {!aberta && props.resumo && (
          <span className="max-w-[110px] truncate text-xs font-normal text-muted-foreground">
            {props.resumo}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            aberta && "rotate-180",
          )}
        />
      </button>
      {aberta && <div className="space-y-2 px-4 pb-4 text-xs">{props.children}</div>}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 break-words text-right font-medium">{valor}</span>
    </div>
  );
}

export function PainelDoLead({
  conversa,
  emSheet = false,
}: {
  conversa: ConversaDaLista;
  /** Dentro do sheet (telas sem a coluna lateral): sem borda e sempre visível. */
  emSheet?: boolean;
}) {
  const o = conversa.origin ?? {};
  const titulo = textoDe(o.headline);
  const anuncio = textoDe(o.source_id);
  const tipo = textoDe(o.source_type);
  const nome = nomeDaConversa(conversa);
  const waId = conversa.contact?.wa_id ?? "";
  const fone = formatarTelefone(waId);
  const lead = useLeadDoPainel(conversa.lead_id);
  const l = lead.data ?? null;
  const email = l?.email ?? conversa.lead?.email ?? null;

  return (
    <aside
      className={cn(
        "min-h-0 flex-col overflow-y-auto",
        emSheet ? "flex" : "hidden border-l xl:flex",
      )}
    >
      <div className="flex flex-col items-center gap-2 p-5 text-center">
        <span
          aria-hidden
          className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary"
        >
          {iniciais(nome)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{nome}</div>
          <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">{fone}</div>
        </div>
        {waId && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="icon" asChild aria-label="Ligar">
              <a href={`tel:+${waId.replace(/\D/g, "")}`}>
                <Phone className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="outline" size="icon" asChild aria-label="Abrir no WhatsApp">
              <a href={`https://wa.me/${waId.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
                <MessageCircle className="h-4 w-4" />
              </a>
            </Button>
            {conversa.lead && (
              <Button variant="outline" size="icon" asChild aria-label="Abrir lead no CRM">
                <Link to="/leads/$id" params={{ id: conversa.lead.id }}>
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {conversa.contact?.opted_out_at && (
        <div className="mx-4 mb-3 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive">
          <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Pediu para não receber mensagens em{" "}
          {new Date(conversa.contact.opted_out_at).toLocaleDateString("pt-BR")}. Nenhum envio é
          possível.
        </div>
      )}

      <div className="border-y">
        <Secao titulo="Contato" icone={<UserRound className="h-4 w-4" />} aberta resumo={fone}>
          <Linha rotulo="Telefone" valor={fone || "—"} />
          <Linha rotulo="E-mail" valor={email ?? "—"} />
          {conversa.contact?.profile_name && (
            <Linha rotulo="Nome no WhatsApp" valor={conversa.contact.profile_name} />
          )}
        </Secao>

        <Secao
          titulo="Negociação"
          icone={<Handshake className="h-4 w-4" />}
          aberta
          resumo={l?.stage?.name ?? null}
        >
          {!conversa.lead ? (
            <p className="rounded-md bg-muted/60 p-3 text-muted-foreground">
              Este contato ainda não está ligado a um lead. Quando o telefone coincidir com um lead,
              o vínculo é feito automaticamente na próxima mensagem.
            </p>
          ) : lead.isLoading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : (
            <>
              <Linha rotulo="Etapa" valor={l?.stage?.name ?? "—"} />
              <Linha
                rotulo="Temperatura"
                valor={l?.temperature ? (TEMPERATURA[l.temperature] ?? l.temperature) : "—"}
              />
              <Linha rotulo="Pontuação" valor={l?.score ?? "—"} />
              <Linha rotulo="Origem" valor={l?.source ?? l?.utm_campaign ?? "—"} />
              {l?.created_at && (
                <Linha
                  rotulo="Entrou em"
                  valor={new Date(l.created_at).toLocaleDateString("pt-BR")}
                />
              )}
            </>
          )}
        </Secao>

        {(l?.tags?.length ?? 0) > 0 && (
          <Secao
            titulo="Etiquetas"
            icone={<Tag className="h-4 w-4" />}
            resumo={`${l!.tags.length}`}
          >
            <div className="flex flex-wrap gap-1">
              {l!.tags.map((t) => (
                <span key={t.tag_name} className="rounded-full bg-muted px-2 py-0.5">
                  {t.tag_name}
                </span>
              ))}
            </div>
          </Secao>
        )}

        {(titulo || anuncio || tipo) && (
          <Secao titulo="Veio de anúncio" icone={<Megaphone className="h-4 w-4" />}>
            {titulo && <Linha rotulo="Título" valor={titulo} />}
            {anuncio && <Linha rotulo="Anúncio" valor={anuncio} />}
            {tipo && <Linha rotulo="Tipo" valor={tipo} />}
          </Secao>
        )}

        <Secao titulo="Notas" icone={<StickyNote className="h-4 w-4" />} aberta>
          <Notas conversaId={conversa.id} />
        </Secao>
      </div>
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
