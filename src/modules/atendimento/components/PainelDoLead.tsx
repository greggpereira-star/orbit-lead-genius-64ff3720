import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  AtSign,
  Ban,
  ChevronDown,
  ExternalLink,
  Handshake,
  Lock,
  Megaphone,
  MessageCircle,
  Phone,
  StickyNote,
  Tag,
  UserPlus,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  criarLeadDaConversaWhatsApp,
  criarNotaWhatsApp,
  listarAtendentesWhatsApp,
  reativarContatoWhatsApp,
  vincularConversaAoLeadWhatsApp,
} from "@/lib/whatsapp-atendimento.functions";
import { origemDaConversa } from "@/lib/whatsapp/cloud/leadDaConversa";
import { cn } from "@/lib/utils";
import { chaves, useLeadDoPainel, useNotas } from "../hooks/useAtendimento";
import { useQuery } from "@tanstack/react-query";
import { formatarTelefone, nomeDaConversa, type ConversaDaLista } from "../lib/conversas";
import { AvatarDoContato } from "./AvatarDoContato";
import { EtiquetasDoLead } from "@/modules/crm/components/EtiquetasDoLead";

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
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left text-sm font-semibold hover:bg-muted/40"
      >
        <span className="text-muted-foreground">{props.icone}</span>
        <span className="flex-1">{props.titulo}</span>
        {!aberta && props.resumo && (
          <span className="max-w-[120px] truncate text-xs font-normal text-muted-foreground">
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
      {aberta && <div className="space-y-3 px-5 pb-5 text-sm">{props.children}</div>}
    </section>
  );
}

/** Aviso de "pediu para parar", com a volta para quem pode: administrador, com confirmação. */
function AvisoDeOptOut(props: { conversaId: string; desde: string; somenteLeitura: boolean }) {
  const qc = useQueryClient();
  const reativar = useServerFn(reativarContatoWhatsApp);
  const mut = useMutation({
    mutationFn: () => reativar({ data: { conversaId: props.conversaId } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.texto);
        return;
      }
      toast.success("Contato reativado. Já é possível enviar mensagens.");
      void qc.invalidateQueries({ queryKey: ["wa-conversas"] });
      void qc.invalidateQueries({ queryKey: ["wa-notas", props.conversaId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mx-5 mb-4 space-y-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
      <div className="flex items-start gap-2">
        <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Pediu para não receber mensagens em {new Date(props.desde).toLocaleDateString("pt-BR")}.
          Nenhum envio é possível.
        </span>
      </div>
      {!props.somenteLeitura && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-destructive/40 bg-background text-foreground"
          disabled={mut.isPending}
          onClick={() => {
            if (
              window.confirm(
                "Reative só se o contato disse que quer voltar a receber mensagens. Fica registrado em nota interna. Reativar?",
              )
            )
              mut.mutate();
          }}
        >
          Reativar contato
        </Button>
      )}
      <p className="text-xs opacity-80">
        O contato também volta sozinho se escrever "voltar" ou "START".
      </p>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 break-words text-right font-medium">{valor}</span>
    </div>
  );
}

export function PainelDoLead({
  conversa,
  emSheet = false,
  somenteLeitura = false,
}: {
  conversa: ConversaDaLista;
  /** Visualizador lê as notas, mas não escreve. */
  somenteLeitura?: boolean;
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
  const qc = useQueryClient();
  const lead = useLeadDoPainel(conversa.lead_id);
  const l = lead.data ?? null;
  const email = l?.email ?? conversa.lead?.email ?? null;

  return (
    <aside
      className={cn(
        "min-h-0 min-w-0 flex-col overflow-y-auto overflow-x-hidden",
        emSheet ? "flex" : "hidden rounded-2xl border bg-background shadow-sm xl:flex",
      )}
    >
      <div className="flex flex-col items-center gap-2 p-5 text-center">
        <AvatarDoContato conversa={conversa} className="h-16 w-16 text-xl" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{nome}</div>
          <div className="mt-0.5 text-sm tabular-nums text-muted-foreground">{fone}</div>
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
        <AvisoDeOptOut
          conversaId={conversa.id}
          desde={conversa.contact.opted_out_at}
          somenteLeitura={somenteLeitura}
        />
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
            <CriarLeadDaConversa conversa={conversa} somenteLeitura={somenteLeitura} />
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

        {conversa.lead && (
          <Secao
            titulo="Etiquetas"
            icone={<Tag className="h-4 w-4" />}
            aberta
            resumo={l ? `${l.tags.length}` : null}
          >
            <EtiquetasDoLead
              leadId={conversa.lead.id}
              companyId={l?.company_id ?? null}
              somenteLeitura={somenteLeitura}
              compacto
              aoAlterar={() => {
                // A etiqueta pode mover a etapa: o painel e a lista relêem.
                void qc.invalidateQueries({ queryKey: ["wa-lead-painel"] });
                void qc.invalidateQueries({ queryKey: ["wa-conversas"] });
              }}
            />
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
          <Notas conversaId={conversa.id} somenteLeitura={somenteLeitura} />
        </Secao>
      </div>
    </aside>
  );
}

/** Notas internas: ficam só com a equipe e NUNCA vão ao cliente. */
function Notas({
  conversaId,
  somenteLeitura = false,
}: {
  conversaId: string;
  somenteLeitura?: boolean;
}) {
  const qc = useQueryClient();
  const notas = useNotas(conversaId);
  const criar = useServerFn(criarNotaWhatsApp);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [mencionar, setMencionar] = useState<string[]>([]);
  const buscarAtendentes = useServerFn(listarAtendentesWhatsApp);
  const atendentes = useQuery({
    queryKey: chaves.atendentes,
    queryFn: () => buscarAtendentes(),
    staleTime: 5 * 60_000,
  });
  const nomeDe = (id: string) => atendentes.data?.find((a) => a.id === id)?.nome ?? "colega";

  async function salvar() {
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    try {
      await criar({
        data: { conversaId, texto: t, ...(mencionar.length ? { mencionar } : {}) },
      });
      setTexto("");
      setMencionar([]);
      qc.invalidateQueries({ queryKey: ["wa-notas", conversaId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar a nota.");
    } finally {
      setSalvando(false);
    }
  }

  const opcoes = (atendentes.data ?? []).filter((a) => !mencionar.includes(a.id));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm font-medium">
        Notas internas
        <span className="text-xs font-normal text-muted-foreground">· não vão ao cliente</span>
      </div>
      {(notas.data ?? []).length > 0 && (
        <ul className="space-y-2">
          {(notas.data ?? []).map((n) => (
            <li
              key={n.id}
              className="whitespace-pre-wrap rounded-lg bg-[var(--aviso)]/10 p-3 text-sm"
            >
              {n.body}
              <div className="mt-1.5 text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Textarea
        rows={3}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva uma nota para a equipe…"
        aria-label="Nova nota interna"
        className="min-h-[84px] resize-y text-sm"
        disabled={somenteLeitura}
      />
      {mencionar.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mencionar.map((id) => (
            <button
              key={id}
              type="button"
              title="Tirar menção"
              onClick={() => setMencionar((m) => m.filter((x) => x !== id))}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/15"
            >
              @{nomeDe(id)} <span aria-hidden>×</span>
              <span className="sr-only">tirar menção</span>
            </button>
          ))}
        </div>
      )}
      {/* Menção e salvar na MESMA linha: o botão principal nunca fica escondido atrás de uma lista. */}
      <div className="flex items-center justify-between gap-2">
        <MencionarColega
          opcoes={opcoes}
          desabilitado={somenteLeitura || mencionar.length >= 10}
          onEscolher={(id) => setMencionar((m) => (m.includes(id) ? m : [...m, id]))}
        />
        <Button
          size="sm"
          className="h-9 px-4"
          disabled={somenteLeitura || salvando || !texto.trim()}
          onClick={() => void salvar()}
        >
          {salvando ? "Salvando…" : "Salvar nota"}
        </Button>
      </div>
    </div>
  );
}

/** Lista de colegas para marcar na nota: busca, rolagem e fundo opaco (o seletor nativo cortava). */
function MencionarColega(props: {
  opcoes: Array<{ id: string; nome: string }>;
  desabilitado?: boolean;
  onEscolher: (id: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 px-3"
          disabled={props.desabilitado}
          aria-label="Mencionar colega"
        >
          <AtSign className="h-4 w-4" /> Mencionar
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        sideOffset={8}
        className="w-64 overflow-hidden rounded-xl bg-popover p-0 shadow-xl ring-1 ring-border"
      >
        <Command>
          {props.opcoes.length > 5 && <CommandInput placeholder="Buscar colega…" />}
          <CommandList className="max-h-64 p-1.5">
            <CommandEmpty>Nenhum colega para marcar.</CommandEmpty>
            {props.opcoes.map((a) => (
              <CommandItem
                key={a.id}
                value={a.nome}
                className="min-h-9 text-sm"
                onSelect={() => {
                  props.onEscolher(a.id);
                  setAberto(false);
                }}
              >
                {a.nome}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

type Duplicado = {
  id: string;
  name: string | null;
  stage: string | null;
  createdAt: string | null;
};

/**
 * Contato sem lead: criar (e ligar) ou, se o telefone já é de um lead, ligar a ele.
 * Fica no próprio painel, sem janela por cima, para a conversa continuar à vista.
 */
function CriarLeadDaConversa({
  conversa,
  somenteLeitura,
}: {
  conversa: ConversaDaLista;
  somenteLeitura: boolean;
}) {
  const qc = useQueryClient();
  const criar = useServerFn(criarLeadDaConversaWhatsApp);
  const vincular = useServerFn(vincularConversaAoLeadWhatsApp);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(conversa.contact?.profile_name ?? "");
  const [email, setEmail] = useState("");
  const [duplicado, setDuplicado] = useState<Duplicado | null>(null);
  const origem = origemDaConversa(conversa.origin).source;
  const fone = formatarTelefone(conversa.contact?.wa_id ?? "");

  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ["wa-conversas"] });
    void qc.invalidateQueries({ queryKey: ["wa-lead-painel"] });
  };

  const criarMut = useMutation({
    mutationFn: () => criar({ data: { conversaId: conversa.id, nome, email } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          r.jaLigado
            ? "Esta conversa já estava ligada a um lead."
            : "Lead criado e ligado à conversa.",
        );
        atualizar();
      } else if ("duplicado" in r) {
        setDuplicado(r.duplicado);
      } else {
        toast.error(r.texto);
      }
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível criar o lead."),
  });

  const vincularMut = useMutation({
    mutationFn: (leadId: string) => vincular({ data: { conversaId: conversa.id, leadId } }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success("Conversa ligada ao lead.");
        atualizar();
      } else {
        toast.error(r.texto);
      }
    },
    onError: (e: Error) => toast.error(e.message || "Não foi possível ligar ao lead."),
  });

  if (somenteLeitura) {
    return (
      <>
        <p className="rounded-lg bg-muted/60 p-3.5 leading-relaxed text-muted-foreground">
          Este contato ainda não é um lead. Peça a um atendente ou administrador para criar.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 self-start gap-1.5"
          disabled
        >
          <Lock className="h-4 w-4" /> Criar lead
        </Button>
      </>
    );
  }

  if (duplicado) {
    return (
      <>
        <div className="flex gap-2 rounded-lg bg-[var(--aviso)]/10 p-3 text-sm leading-relaxed">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--aviso)]" />
          <span>
            Já existe um lead com este telefone. Ligue a conversa a ele em vez de criar outro.
          </span>
        </div>
        <div className="rounded-lg border p-3">
          <div className="font-medium">{duplicado.name?.trim() || "Sem nome"}</div>
          <div className="text-xs text-muted-foreground">
            {[
              duplicado.stage ? `Etapa ${duplicado.stage}` : null,
              duplicado.createdAt
                ? `entrou em ${new Date(duplicado.createdAt).toLocaleDateString("pt-BR")}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-9"
            disabled={vincularMut.isPending}
            onClick={() => vincularMut.mutate(duplicado.id)}
          >
            {vincularMut.isPending ? "Ligando…" : "Ligar a este lead"}
          </Button>
          <Button size="sm" variant="ghost" className="h-9" asChild>
            <Link to="/leads/$id" params={{ id: duplicado.id }}>
              Abrir lead
            </Link>
          </Button>
        </div>
      </>
    );
  }

  if (!aberto) {
    return (
      <>
        <p className="rounded-lg bg-muted/60 p-3.5 leading-relaxed text-muted-foreground">
          Este contato ainda não é um lead. Crie agora para acompanhar etapa, origem e pontuação.
        </p>
        <Button size="sm" className="h-9 self-start gap-1.5" onClick={() => setAberto(true)}>
          <UserPlus className="h-4 w-4" /> Criar lead
        </Button>
      </>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!criarMut.isPending) criarMut.mutate();
      }}
    >
      <label className="block space-y-1 text-xs text-muted-foreground">
        Nome
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do contato"
          className="h-9 text-sm text-foreground"
          maxLength={200}
        />
      </label>
      <label className="block space-y-1 text-xs text-muted-foreground">
        Telefone
        <span className="relative block">
          <Input
            value={fone}
            readOnly
            className="h-9 bg-muted/50 pr-9 text-sm text-muted-foreground"
          />
          <Lock className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </span>
      </label>
      <label className="block space-y-1 text-xs text-muted-foreground">
        E-mail (opcional)
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nome@empresa.com"
          className="h-9 text-sm text-foreground"
          maxLength={254}
        />
      </label>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>Origem</span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground">
          {origem}
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" size="sm" className="h-9" disabled={criarMut.isPending}>
          {criarMut.isPending ? "Criando…" : "Criar e ligar"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-9"
          disabled={criarMut.isPending}
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
