import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  alterarStatusConversaWhatsApp,
  atribuirConversaWhatsApp,
  listarAtendentesWhatsApp,
  marcarConversaComoNaoLidaWhatsApp,
  exportarConversaWhatsApp,
  marcarMencoesComoLidasWhatsApp,
  seguirConversaWhatsApp,
} from "@/lib/whatsapp-atendimento.functions";
import {
  chaves,
  useConversas,
  useMencoesNaoLidas,
  useMensagens,
  useSeguindo,
} from "../hooks/useAtendimento";
import { buscarNasMensagens } from "../lib/mensagens";
import { nomeDoArquivoDeExportacao } from "@/lib/whatsapp/exportarConversa";
import { podeAtender } from "@/lib/whatsapp/papeis";
import { AgendarMensagem } from "./AgendarMensagem";
import { MenuDaConversa } from "./MenuDaConversa";
import {
  contarPorFiltro,
  filtrarConversas,
  nomeDaConversa,
  totalNaoLidas,
  type Filtro,
} from "../lib/conversas";
import { Conversa } from "./Conversa";
import { ListaDeConversas } from "./ListaDeConversas";
import { VisoesDoInbox } from "./VisoesDoInbox";
import { PainelDoLead } from "./PainelDoLead";

export function Atendimento({
  companyId,
  userId,
  papel,
}: {
  companyId: string;
  userId: string | null;
  /** Papel na empresa. Desconhecido não restringe a tela: o servidor é quem decide. */
  papel?: string | null;
}) {
  const somenteLeitura = papel ? !podeAtender(papel) : false;
  const qc = useQueryClient();
  const conversas = useConversas(companyId);
  const lista = useMemo(() => conversas.data ?? [], [conversas.data]);

  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [busca, setBusca] = useState("");
  const [ativaId, setAtivaId] = useState<string | null>(null);
  const [pesquisando, setPesquisando] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState(0);
  const [infoAberta, setInfoAberta] = useState(false);
  const [agendando, setAgendando] = useState(false);

  // Conjuntos pessoais: falham em silêncio (vazio) se as tabelas ainda não existem.
  const seguindoQ = useSeguindo(companyId, userId);
  const mencoesQ = useMencoesNaoLidas(companyId, userId);
  const pessoais = useMemo(
    () => ({
      seguindo: new Set(seguindoQ.data ?? []),
      mencoes: new Set(mencoesQ.data ?? []),
    }),
    [seguindoQ.data, mencoesQ.data],
  );

  const contagens = useMemo(
    () => contarPorFiltro(lista, userId, pessoais),
    [lista, userId, pessoais],
  );

  // Primeira exibição: "Minhas" se houver; senão "Todas". Depois é escolha da pessoa.
  useEffect(() => {
    if (filtro === null && !conversas.isLoading)
      setFiltro(contagens.minhas > 0 ? "minhas" : "entrada");
  }, [filtro, conversas.isLoading, contagens.minhas]);

  const filtroAtual: Filtro = filtro ?? "entrada";
  const visiveis = useMemo(
    () => filtrarConversas(lista, { filtro: filtroAtual, userId, busca, ...pessoais }),
    [lista, filtroAtual, userId, busca, pessoais],
  );
  const ativa = lista.find((c) => c.id === ativaId) ?? null;

  // As mensagens vêm da mesma consulta da conversa (cache compartilhado).
  const mensagensDaAtiva = useMensagens(ativa?.id ?? null);
  const idsEncontrados = useMemo(
    () => (pesquisando ? buscarNasMensagens(mensagensDaAtiva.data ?? [], termo) : []),
    [pesquisando, mensagensDaAtiva.data, termo],
  );
  const lerMencoes = useServerFn(marcarMencoesComoLidasWhatsApp);
  const abrirConversa = (id: string | null) => {
    // Abrir a conversa lê as menções que a pessoa tinha nela.
    if (id && pessoais.mencoes.has(id)) {
      void lerMencoes({ data: { conversaId: id } })
        .then(() => qc.invalidateQueries({ queryKey: ["wa-mencoes"] }))
        .catch(() => {});
    }
    setAtivaId(id);
    setPesquisando(false);
    setTermo("");
    setResultado(0);
  };

  const buscarAtendentes = useServerFn(listarAtendentesWhatsApp);
  const atendentes = useQuery({
    queryKey: chaves.atendentes,
    queryFn: () => buscarAtendentes(),
    staleTime: 5 * 60_000,
  });

  const atribuir = useServerFn(atribuirConversaWhatsApp);
  const mudarStatus = useServerFn(alterarStatusConversaWhatsApp);
  const recarregar = () => qc.invalidateQueries({ queryKey: chaves.conversas(companyId) });

  const aoAtribuir = useMutation({
    mutationFn: (v: { conversaId: string; userId: string | null }) => atribuir({ data: v }),
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message),
  });
  const seguirFn = useServerFn(seguirConversaWhatsApp);
  const aoSeguir = useMutation({
    mutationFn: (v: { conversaId: string; seguir: boolean }) => seguirFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.seguir ? "Você está seguindo esta conversa." : "Deixou de seguir.");
      qc.invalidateQueries({ queryKey: ["wa-seguindo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const exportarFn = useServerFn(exportarConversaWhatsApp);
  const aoExportar = useMutation({
    mutationFn: (conversaId: string) => exportarFn({ data: { conversaId } }),
    onSuccess: (r, conversaId) => {
      const c = lista.find((x) => x.id === conversaId);
      const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nomeDoArquivoDeExportacao(c ? nomeDaConversa(c) : "conversa");
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        r.truncado
          ? `Exportadas as ${r.total} primeiras mensagens (limite).`
          : `${r.total} mensagens exportadas.`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const marcarNaoLida = useServerFn(marcarConversaComoNaoLidaWhatsApp);
  const aoMarcarNaoLida = useMutation({
    mutationFn: (conversaId: string) => marcarNaoLida({ data: { conversaId } }),
    onSuccess: () => {
      // Volta para a lista: com a conversa aberta, a leitura automática a zeraria.
      abrirConversa(null);
      toast.success("Marcada como não lida.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const aoMudarStatus = useMutation({
    mutationFn: (v: { conversaId: string; status: "open" | "pending" | "resolved" }) =>
      mudarStatus({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(
        v.status === "resolved"
          ? "Conversa resolvida."
          : v.status === "pending"
            ? "Marcada como pendente."
            : "Conversa reaberta.",
      );
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nomesDosAtendentes = useMemo(
    () => Object.fromEntries((atendentes.data ?? []).map((a) => [a.id, a.nome])),
    [atendentes.data],
  );

  const naoLidas = totalNaoLidas(lista);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:gap-4 sm:px-6">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold sm:text-xl">
            <span className="inline-flex items-center gap-2">
              <MessageCircle className="h-5 w-5" /> Atendimento WhatsApp
            </span>
            {naoLidas > 0 && (
              <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium tabular-nums text-primary-foreground">
                {naoLidas} não lida{naoLidas === 1 ? "" : "s"}
              </span>
            )}
          </h1>
        </div>
        <Button variant="outline" size="sm" asChild className="shrink-0">
          <Link to="/settings/whatsapp" aria-label="Número e templates">
            <Settings className="h-4 w-4 sm:mr-1.5" />
            <span className="hidden sm:inline">Número e templates</span>
          </Link>
        </Button>
      </header>

      {conversas.error && (
        <p className="px-6 py-3 text-sm text-destructive">
          Não foi possível carregar as conversas.
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_1fr] xl:grid-cols-[200px_340px_1fr_300px]">
        <VisoesDoInbox filtro={filtroAtual} contagens={contagens} onFiltro={setFiltro} />
        <div className={ativa ? "hidden min-h-0 lg:flex lg:flex-col" : "flex min-h-0 flex-col"}>
          <ListaDeConversas
            conversas={visiveis}
            carregando={conversas.isLoading}
            ativaId={ativaId}
            filtro={filtroAtual}
            contagens={contagens}
            busca={busca}
            atendentes={nomesDosAtendentes}
            onFiltro={setFiltro}
            onBusca={setBusca}
            onAbrir={abrirConversa}
          />
        </div>

        {ativa ? (
          <>
            <div className="flex min-h-0 flex-col">
              <Conversa
                key={ativa.id}
                conversa={ativa}
                companyId={companyId}
                somenteLeitura={somenteLeitura}
                onReabrir={() => aoMudarStatus.mutate({ conversaId: ativa.id, status: "open" })}
                cabecalho={
                  <>
                    <div className="flex items-center gap-2 border-b px-3 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        aria-label="Voltar à lista"
                        onClick={() => abrirConversa(null)}
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{nomeDaConversa(ativa)}</span>
                          {ativa.status === "pending" && (
                            <span className="shrink-0 rounded bg-[var(--aviso)]/15 px-1.5 text-[10px] font-medium text-[var(--aviso)]">
                              pendente
                            </span>
                          )}
                        </div>
                      </div>
                      <select
                        aria-label="Responsável"
                        className="max-w-[170px] rounded-md border bg-background px-2 py-1.5 text-sm"
                        value={ativa.assigned_to ?? ""}
                        disabled={aoAtribuir.isPending || somenteLeitura}
                        onChange={(e) =>
                          aoAtribuir.mutate({
                            conversaId: ativa.id,
                            userId: e.target.value || null,
                          })
                        }
                      >
                        <option value="">Sem responsável</option>
                        {(atendentes.data ?? []).map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.id === userId ? `${a.nome} (eu)` : a.nome}
                          </option>
                        ))}
                      </select>
                      {somenteLeitura ? null : ativa.status === "resolved" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={aoMudarStatus.isPending}
                          onClick={() =>
                            aoMudarStatus.mutate({ conversaId: ativa.id, status: "open" })
                          }
                        >
                          <RotateCcw className="mr-1.5 h-4 w-4" /> Reabrir
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={aoMudarStatus.isPending}
                          onClick={() =>
                            aoMudarStatus.mutate({ conversaId: ativa.id, status: "resolved" })
                          }
                        >
                          <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolver
                        </Button>
                      )}
                      <MenuDaConversa
                        somenteLeitura={somenteLeitura}
                        conversa={ativa}
                        ocupado={
                          aoMudarStatus.isPending || aoMarcarNaoLida.isPending || aoSeguir.isPending
                        }
                        seguindo={pessoais.seguindo.has(ativa.id)}
                        onSeguir={() =>
                          aoSeguir.mutate({
                            conversaId: ativa.id,
                            seguir: !pessoais.seguindo.has(ativa.id),
                          })
                        }
                        onNaoLida={() => aoMarcarNaoLida.mutate(ativa.id)}
                        onPendente={() =>
                          aoMudarStatus.mutate({
                            conversaId: ativa.id,
                            status: ativa.status === "pending" ? "open" : "pending",
                          })
                        }
                        onExportar={() => aoExportar.mutate(ativa.id)}
                        onAgendar={() => setAgendando(true)}
                        onPesquisar={() => setPesquisando(true)}
                        onInformacoes={() => setInfoAberta(true)}
                        onCopiarNumero={() => {
                          const n = ativa.contact?.wa_id ?? "";
                          void navigator.clipboard
                            ?.writeText(n ? `+${n}` : "")
                            .then(() => toast.success("Número copiado."))
                            .catch(() => toast.error("Não consegui copiar."));
                        }}
                      />
                    </div>
                    {pesquisando && (
                      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5">
                        <Input
                          autoFocus
                          value={termo}
                          onChange={(e) => {
                            setTermo(e.target.value);
                            setResultado(0);
                          }}
                          placeholder="Pesquisar nesta conversa…"
                          aria-label="Pesquisar nesta conversa"
                          className="h-8"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") abrirConversa(ativa.id);
                            if (e.key === "Enter" && idsEncontrados.length > 0)
                              setResultado((r) =>
                                e.shiftKey
                                  ? (r - 1 + idsEncontrados.length) % idsEncontrados.length
                                  : (r + 1) % idsEncontrados.length,
                              );
                          }}
                        />
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {termo.trim().length < 2
                            ? "mín. 2 letras"
                            : idsEncontrados.length === 0
                              ? "nada encontrado"
                              : `${resultado + 1} de ${idsEncontrados.length}`}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Resultado anterior"
                          disabled={idsEncontrados.length === 0}
                          onClick={() =>
                            setResultado(
                              (r) => (r - 1 + idsEncontrados.length) % idsEncontrados.length,
                            )
                          }
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Próximo resultado"
                          disabled={idsEncontrados.length === 0}
                          onClick={() => setResultado((r) => (r + 1) % idsEncontrados.length)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          aria-label="Fechar pesquisa"
                          onClick={() => abrirConversa(ativa.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                }
                pesquisa={pesquisando ? { ids: idsEncontrados, atual: resultado } : null}
              />
            </div>
            <PainelDoLead conversa={ativa} somenteLeitura={somenteLeitura} />
            <AgendarMensagem
              conversa={ativa}
              aberto={agendando}
              onFechar={() => setAgendando(false)}
            />
            <Sheet open={infoAberta} onOpenChange={setInfoAberta}>
              <SheetContent side="right" className="w-[340px] p-0 sm:max-w-[340px]">
                <SheetHeader className="border-b px-4 py-3">
                  <SheetTitle>Informações do contato</SheetTitle>
                </SheetHeader>
                <PainelDoLead conversa={ativa} emSheet somenteLeitura={somenteLeitura} />
              </SheetContent>
            </Sheet>
          </>
        ) : (
          <div className="hidden flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground lg:flex xl:col-span-2">
            <MessageCircle className="h-12 w-12 opacity-30" />
            <p className="text-sm">Escolha uma conversa para atender.</p>
          </div>
        )}
      </div>
    </div>
  );
}
