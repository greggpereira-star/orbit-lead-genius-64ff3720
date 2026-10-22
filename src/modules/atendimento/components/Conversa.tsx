import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  CheckCheck,
  Clock,
  Loader2,
  Paperclip,
  Send,
  Timer,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { quickReplyService, type ChatQuickReply } from "@/modules/chat/services/quickReplyService";
import { aplicarVariaveisDeFrase } from "@/modules/chat/lib/variaveisDeFrase";
import {
  marcarConversaComoLidaWhatsApp,
  enviarMensagemWhatsApp,
  enviarMidiaWhatsApp,
  prepararUploadDeMidiaWhatsApp,
  enviarTemplateWhatsApp,
} from "@/lib/whatsapp-atendimento.functions";
import { rotuloDaJanela } from "@/lib/whatsapp/cloud/janela";
import { variaveisDe } from "@/lib/whatsapp/cloud/templates";
import { renderizarTexto } from "@/lib/whatsapp/cloud/render";
import { AVISO_DO_MODO, modoDoCompositor } from "../lib/compositor";
import { MidiaDaMensagem } from "./MidiaDaMensagem";
import { EnviarTemplate } from "./EnviarTemplate";
import { supabase } from "@/lib/supabase";
import { classificarArquivoParaEnvio, normalizarMime } from "@/lib/whatsapp/cloud/midia";
import {
  janelaDaConversa,
  nomeDaConversa,
  nomeProprioDoContato,
  formatarTelefone,
  type ConversaDaLista,
} from "../lib/conversas";
import {
  agruparPorDia,
  autoriaDaSaida,
  citacaoDe,
  marcaDeEntrega,
  temMidia,
  textoParaExibir,
} from "../lib/mensagens";
import {
  chaves,
  useMensagens,
  useTemplatesAprovados,
  type TemplateAprovado,
} from "../hooks/useAtendimento";

/**
 * Recusa do servidor ao enviar. Se foi opt-out, recarrega a lista de conversas: o
 * servidor pode ter alinhado o contato com a lista legada, e a tela precisa trocar
 * o composer pelo aviso.
 */
function recusaDoEnvio(
  qc: ReturnType<typeof useQueryClient>,
  r: { texto: string; motivo?: string },
) {
  toast.error(r.texto);
  if (r.motivo === "contato_pediu_para_parar") {
    qc.invalidateQueries({ queryKey: [chaves.conversas("")[0]] });
  }
}

/** Relógio que reavalia a janela de 24h sem depender de evento nenhum. */
function useAgora(intervaloMs = 30_000): Date {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}

function Marca({ tipo }: { tipo: ReturnType<typeof marcaDeEntrega>["tipo"] }) {
  const c = "h-3.5 w-3.5";
  if (tipo === "relogio") return <Clock className={c} />;
  if (tipo === "enviada") return <Check className={c} />;
  if (tipo === "entregue") return <CheckCheck className={c} />;
  if (tipo === "lida") return <CheckCheck className={cn(c, "text-sky-300")} />;
  if (tipo === "falha") return <AlertTriangle className={cn(c, "text-destructive")} />;
  return null;
}

export function Conversa(props: {
  conversa: ConversaDaLista;
  companyId: string;
  onReabrir: () => void;
  cabecalho: React.ReactNode;
  /** Pesquisa na conversa: ids que casam e o índice do atual. */
  pesquisa?: { ids: string[]; atual: number } | null;
  /** Papel que só lê (visualizador): sem composer. */
  somenteLeitura?: boolean;
}) {
  const { conversa } = props;
  const qc = useQueryClient();
  const agora = useAgora();
  const marcarComoLida = useServerFn(marcarConversaComoLidaWhatsApp);
  const mensagens = useMensagens(conversa.id);
  const janela = janelaDaConversa(conversa, agora);
  const optedOut = Boolean(conversa.contact?.opted_out_at);
  const modo = modoDoCompositor({
    janela,
    optedOut,
    status: conversa.status,
    apenasReceptivo: Boolean(conversa.numero?.receive_only),
    somenteLeitura: props.somenteLeitura,
  });

  const grupos = useMemo(() => agruparPorDia(mensagens.data ?? [], agora), [mensagens.data, agora]);
  const fimRef = useRef<HTMLDivElement>(null);
  const total = mensagens.data?.length ?? 0;

  const pesquisando = Boolean(props.pesquisa?.ids.length);
  const idAtual = props.pesquisa?.ids[props.pesquisa.atual] ?? null;

  useEffect(() => {
    // Com pesquisa ativa a rolagem segue o resultado, não o fim da conversa.
    if (pesquisando) return;
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [total, conversa.id, pesquisando]);

  useEffect(() => {
    if (!idAtual) return;
    document
      .querySelector(`[data-msg-id="${idAtual}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [idAtual]);

  // Lida só com a aba à vista: abrir a caixa em segundo plano não pode "ler" tudo.
  useEffect(() => {
    if (conversa.unread_agent > 0 && document.visibilityState === "visible") {
      marcarComoLida({ data: { conversaId: conversa.id } })
        .then(() => qc.invalidateQueries({ queryKey: chaves.conversas(props.companyId) }))
        .catch(() => {});
    }
  }, [conversa.id, conversa.unread_agent, props.companyId, qc]);

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      {props.cabecalho}

      <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-5 py-2 text-xs">
        <span className="truncate text-muted-foreground">
          {formatarTelefone(conversa.contact?.wa_id ?? "")}
          {conversa.origin && " · veio de anúncio"}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-medium",
            janela.aberta
              ? "bg-[var(--sucesso)]/15 text-[var(--sucesso)]"
              : "bg-muted text-muted-foreground",
          )}
          title="Janela de atendimento de 24 horas"
        >
          <Timer className="h-3 w-3" />
          {janela.aberta
            ? `Janela aberta · ${rotuloDaJanela(janela.restanteMs)}`
            : "Janela fechada"}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-5 py-5">
        {mensagens.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando mensagens…</p>
        )}
        {mensagens.error && (
          <p className="text-sm text-destructive">Não foi possível carregar as mensagens.</p>
        )}
        {!mensagens.isLoading && total === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        )}
        {grupos.map((g) => (
          <div key={g.chave} className="space-y-2.5">
            <div className="sticky top-0 z-[1] flex justify-center py-1">
              <span className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                {g.rotulo}
              </span>
            </div>
            {g.mensagens.map((m) => {
              const saida = m.direction === "outbound";
              const marca = marcaDeEntrega(m);
              const autoria = saida ? autoriaDaSaida(m.origin) : "";
              return (
                <div
                  key={m.id}
                  data-msg-id={m.id}
                  className={cn("flex", saida ? "justify-end" : "justify-start")}
                >
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm",
                      props.pesquisa?.ids.includes(m.id) && "ring-2 ring-amber-400/70",
                      m.id === idAtual && "ring-2 ring-amber-500",
                      saida
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-background",
                    )}
                  >
                    {autoria && <div className="mb-0.5 text-[11px] opacity-75">{autoria}</div>}
                    {(() => {
                      const c = citacaoDe(m, mensagens.data ?? []);
                      return c ? (
                        <button
                          type="button"
                          title="Ver a mensagem citada"
                          onClick={() =>
                            document
                              .querySelector(`[data-msg-id="${c.id}"]`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" })
                          }
                          className={cn(
                            "mb-1 block w-full rounded-md border-l-2 px-2 py-1 text-left text-xs",
                            saida
                              ? "border-primary-foreground/60 bg-primary-foreground/10"
                              : "border-primary/60 bg-muted/60",
                          )}
                        >
                          <span className="block text-[11px] font-medium opacity-75">
                            {c.doCliente ? "Cliente" : "Equipe"}
                          </span>
                          <span className="line-clamp-2 opacity-90">{c.texto}</span>
                        </button>
                      ) : null;
                    })()}
                    {temMidia(m) && (
                      <div className="mb-1">
                        <MidiaDaMensagem mensagem={m} />
                      </div>
                    )}
                    {/* Com mídia visível, só a legenda: "[Imagem]" seria ruído. */}
                    {(!temMidia(m) || m.body?.trim()) && (
                      <div className="whitespace-pre-wrap break-words">
                        {temMidia(m) ? m.body : textoParaExibir(m)}
                      </div>
                    )}
                    <div
                      className={cn(
                        "mt-1 flex items-center justify-end gap-1 text-[11px]",
                        saida ? "opacity-80" : "text-muted-foreground",
                      )}
                    >
                      {new Date(m.provider_ts ?? m.created_at).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {saida && (
                        <span title={marca.rotulo}>
                          <Marca tipo={marca.tipo} />
                        </span>
                      )}
                    </div>
                    {m.status === "failed" && m.error_title && (
                      <div className="mt-1 text-xs text-destructive-foreground/90">
                        Não enviada: {m.error_title}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <Compositor
        {...props}
        modo={modo}
        aviso={AVISO_DO_MODO[modo]}
        nome={nomeDaConversa(conversa)}
        nomeProprio={nomeProprioDoContato(conversa)}
      />
    </section>
  );
}

function Compositor(props: {
  conversa: ConversaDaLista;
  companyId: string;
  modo: ReturnType<typeof modoDoCompositor>;
  aviso: string | null;
  nome: string;
  nomeProprio: string | null;
  onReabrir: () => void;
}) {
  const { conversa, modo } = props;
  const qc = useQueryClient();
  const enviarTexto = useServerFn(enviarMensagemWhatsApp);
  const enviarTemplate = useServerFn(enviarTemplateWhatsApp);
  const prepararUpload = useServerFn(prepararUploadDeMidiaWhatsApp);
  const enviarMidia = useServerFn(enviarMidiaWhatsApp);
  const arquivoRef = useRef<HTMLInputElement>(null);

  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const campo = useRef<HTMLTextAreaElement>(null);

  // Respostas rápidas (as mesmas do chat do site): "/" abre a lista.
  const respostas = useQuery({
    queryKey: ["chat", "quick-replies", props.companyId],
    queryFn: () => quickReplyService.list(props.companyId),
    enabled: modo === "texto",
  });
  const sugestoes = useMemo<ChatQuickReply[]>(() => {
    if (!texto.startsWith("/")) return [];
    const q = texto.slice(1).toLowerCase();
    return (respostas.data ?? [])
      .filter((r) => r.shortcut.toLowerCase().includes(q) || r.content.toLowerCase().includes(q))
      .slice(0, 6);
  }, [texto, respostas.data]);

  // Rascunho NÃO atravessa conversas: trocar de conversa limpa o campo.
  useEffect(() => {
    setTexto("");
  }, [conversa.id]);

  async function enviar() {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      const r = await enviarTexto({ data: { conversaId: conversa.id, texto: t } });
      if (!r.ok) {
        // Mantém o texto: a recusa (janela, opt-out) não pode custar a digitação.
        recusaDoEnvio(qc, r);
        return;
      }
      setTexto("");
      qc.invalidateQueries({ queryKey: chaves.mensagens(conversa.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
      setTimeout(() => campo.current?.focus(), 0);
    }
  }

  /**
   * Anexo: valida no navegador (mesma regra do servidor), pede um endereço de
   * upload assinado, sobe o arquivo direto ao bucket e só então manda enviar.
   * O texto digitado vira a legenda.
   */
  async function anexar(arquivo: File) {
    const mime = normalizarMime(arquivo.type, arquivo.name) || "application/octet-stream";
    const c = classificarArquivoParaEnvio({ mime, bytes: arquivo.size, nome: arquivo.name });
    // Formato fora da lista de mídia: oferece enviar como documento em vez de recusar calado.
    let forcarDocumento = false;
    if (!c.ok) {
      if (!window.confirm(`${c.texto}\n\nEnviar como documento?`)) return;
      forcarDocumento = true;
    }
    setEnviando(true);
    try {
      const prep = await prepararUpload({
        data: {
          conversaId: conversa.id,
          nome: arquivo.name,
          mime,
          bytes: arquivo.size,
          forcarDocumento,
        },
      });
      if (!prep.ok) {
        toast.error(prep.texto);
        return;
      }
      const up = await (
        supabase as unknown as {
          storage: {
            from: (b: string) => {
              uploadToSignedUrl: (
                p: string,
                t: string,
                f: File,
              ) => Promise<{ error: { message: string } | null }>;
            };
          };
        }
      ).storage
        .from("wa-media")
        .uploadToSignedUrl(prep.caminho, prep.token, arquivo);
      if (up.error) {
        toast.error(`Não consegui subir o arquivo: ${up.error.message}`);
        return;
      }
      const r = await enviarMidia({
        data: {
          conversaId: conversa.id,
          caminho: prep.caminho,
          tipo: prep.tipo,
          mime,
          nome: arquivo.name,
          legenda: texto.trim() || null,
        },
      });
      if (!r.ok) {
        recusaDoEnvio(qc, r);
        return;
      }
      setTexto("");
      qc.invalidateQueries({ queryKey: chaves.mensagens(conversa.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar o arquivo.");
    } finally {
      setEnviando(false);
    }
  }

  if (
    modo === "bloqueado" ||
    modo === "resolvida" ||
    modo === "somente_receptivo" ||
    modo === "somente_leitura"
  ) {
    return (
      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <span>{props.aviso}</span>
        {modo === "resolvida" && (
          <Button size="sm" variant="outline" onClick={props.onReabrir}>
            Reabrir
          </Button>
        )}
      </div>
    );
  }

  if (modo === "template") {
    return (
      <EnviarTemplate
        conversa={props.conversa}
        companyId={props.companyId}
        nomeProprio={props.nomeProprio}
        avisoDaJanela={props.aviso}
        onEnviar={enviarTemplate}
        aoRecusar={(r) => recusaDoEnvio(qc, r)}
      />
    );
  }

  return (
    <div className="relative border-t p-3">
      {sugestoes.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 z-10 mb-1 max-h-56 overflow-y-auto rounded-md border bg-popover shadow-lg">
          <div className="flex items-center gap-1 border-b px-3 py-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <Zap className="h-3 w-3" /> Respostas rápidas
          </div>
          {sugestoes.map((r) => (
            <button
              key={r.id}
              type="button"
              className="w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/60"
              onClick={() => {
                setTexto(
                  aplicarVariaveisDeFrase(r.content, {
                    nome: props.nomeProprio,
                    telefone: conversa.contact?.wa_id,
                  }),
                );
                setTimeout(() => campo.current?.focus(), 0);
              }}
            >
              <code className="rounded bg-muted px-1 text-xs">/{r.shortcut}</code>
              <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{r.content}</div>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={arquivoRef}
          type="file"
          className="hidden"
          aria-label="Anexar arquivo"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = ""; // permite escolher o mesmo arquivo de novo
            if (f) void anexar(f);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Anexar arquivo"
          disabled={enviando}
          onClick={() => arquivoRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Textarea
          ref={campo}
          rows={1}
          value={texto}
          disabled={enviando}
          placeholder="Responder… ( / respostas rápidas)"
          aria-label="Mensagem"
          className="max-h-40 min-h-[40px] resize-none"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            // Enter envia; Shift+Enter quebra linha; IME não envia no meio da composição.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void enviar();
            }
          }}
        />
        <Button
          onClick={() => void enviar()}
          disabled={enviando || !texto.trim()}
          aria-label="Enviar mensagem"
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
