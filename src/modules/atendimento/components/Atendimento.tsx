import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useSidebar } from "@/components/ui/sidebar";
import { WhatsAppIcon } from "@/design-system/components/WhatsAppIcon";
import { alternarTelaCheiaDoNavegador, definirTelaCheia, useTelaCheia } from "@/lib/modoFoco";
import { cn } from "@/lib/utils";
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
import { useMediaQuery } from "../hooks/useMediaQuery";
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
  type OrdemDaLista,
} from "../lib/conversas";
import { Conversa } from "./Conversa";
import { ListaDeConversas } from "./ListaDeConversas";
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

  // MODO FOCO: o atendimento precisa da largura. Ao entrar, o menu lateral recolhe
  // para ícones; ao sair, volta ao estado em que estava (inclusive a tela cheia).
  const menu = useSidebar();
  const menuAntes = useRef<boolean | null>(null);
  useEffect(() => {
    menuAntes.current = menu.open;
    menu.setOpen(false);
    return () => {
      if (menuAntes.current !== null) menu.setOpen(menuAntes.current);
      definirTelaCheia(false);
      void alternarTelaCheiaDoNavegador(false);
    };
    // Só na entrada e na saída da tela: não reage a `menu`, para não brigar com quem reabre o menu na mão.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const telaCheia = useTelaCheia();
  const alternarTelaCheia = () => {
    const ligar = !telaCheia;
    definirTelaCheia(ligar);
    void alternarTelaCheiaDoNavegador(ligar);
  };
  // Esc sai da tela cheia do navegador: a da aplicação acompanha.
  useEffect(() => {
    const aoMudar = () => {
      if (!document.fullscreenElement) definirTelaCheia(false);
    };
    document.addEventListener("fullscreenchange", aoMudar);
    return () => document.removeEventListener("fullscreenchange", aoMudar);
  }, []);

  // Painel do contato: aberto de partida só em tela larga; a escolha fica guardada.
  const largaDemais = useMediaQuery("(min-width: 1280px)");
  const [painelPref, setPainelPref] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem("wa-painel-contato");
      setPainelPref(v === null ? window.innerWidth >= 1600 : v === "1");
    } catch {
      setPainelPref(window.innerWidth >= 1600);
    }
  }, []);
  const painelInline = largaDemais && Boolean(painelPref);
  const alternarPainel = () => {
    if (!largaDemais) {
      setInfoAberta(true);
      return;
    }
    const novo = !painelPref;
    setPainelPref(novo);
    try {
      localStorage.setItem("wa-painel-contato", novo ? "1" : "0");
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  };

  // Ordem da lista: por quem espera há mais tempo ajuda a vender; a escolha fica guardada.
  const [ordem, setOrdemEstado] = useState<OrdemDaLista>("recentes");
  useEffect(() => {
    try {
      if (localStorage.getItem("wa-ordem") === "espera") setOrdemEstado("espera");
    } catch {
      /* ignora */
    }
  }, []);
  const setOrdem = (o: OrdemDaLista) => {
    setOrdemEstado(o);
    try {
      localStorage.setItem("wa-ordem", o);
    } catch {
      /* ignora */
    }
  };
  // O tempo de espera avança sozinho, sem esperar evento nenhum.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
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
    () => filtrarConversas(lista, { filtro: filtroAtual, userId, busca, ordem, agora, ...pessoais }),
    [lista, filtroAtual, userId, busca, ordem, agora, pessoais],
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

  const topoDaLista = (
    <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
      <h1 className="flex min-w-0 items-center gap-2 text-base font-semibold">
        <WhatsAppIcon className="h-4 w-4 shrink-0 text-emerald-600" />
        <span className="truncate">WhatsApp</span>
        {naoLidas > 0 && (
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-medium tabular-nums text-primary-foreground">
            {naoLidas} não lida{naoLidas === 1 ? "" : "s"}
          </span>
        )}
      </h1>
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={alternarTelaCheia}
          aria-label={telaCheia ? "Sair da tela cheia" : "Tela cheia"}
          title={telaCheia ? "Sair da tela cheia" : "Tela cheia (esconde o menu e a barra superior)"}
        >
          {telaCheia ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link to="/settings/whatsapp" aria-label="Número e templates" title="Número e templates">
            <Settings className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );

  return (
    <div
      data-largura-total
      className={cn(
        // Sangra até a borda do conteúdo: o atendimento aproveita o padding da página.
        "-m-4 flex min-h-0 flex-col md:-m-6",
        telaCheia ? "h-dvh" : "h-[calc(100dvh-4rem)]",
      )}
    >
      {conversas.error && (
        <p className="px-6 py-3 text-sm text-destructive">
          Não foi possível carregar as conversas.
        </p>
      )}

      <div
        className={cn(
          // `minmax(0, 1fr)`: a conversa encolhe em vez de empurrar o painel para fora da tela.
          "grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]",
          painelInline && "xl:grid-cols-[320px_minmax(0,1fr)_300px]",
        )}
      >
        <div className={ativa ? "hidden min-h-0 lg:flex lg:flex-col" : "flex min-h-0 flex-col"}>
          <ListaDeConversas
            conversas={visiveis}
            carregando={conversas.isLoading}
            ativaId={ativaId}
            filtro={filtroAtual}
            contagens={contagens}
            busca={busca}
            atendentes={nomesDosAtendentes}
            ordem={ordem}
            agora={agora}
            topo={topoDaLista}
            onFiltro={setFiltro}
            onBusca={setBusca}
            onOrdem={setOrdem}
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hidden xl:inline-flex"
                        onClick={alternarPainel}
                        aria-label={painelInline ? "Ocultar painel do contato" : "Mostrar painel do contato"}
                        title={painelInline ? "Ocultar painel do contato" : "Mostrar painel do contato"}
                      >
                        {painelInline ? (
                          <PanelRightClose className="h-4 w-4" />
                        ) : (
                          <PanelRightOpen className="h-4 w-4" />
                        )}
                      </Button>
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
                        onInformacoes={alternarPainel}
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
            {painelInline && <PainelDoLead conversa={ativa} somenteLeitura={somenteLeitura} />}
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
          <div className="hidden flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground lg:flex">
            <WhatsAppIcon className="h-12 w-12 opacity-30" />
            <p className="text-sm">Escolha uma conversa para atender.</p>
          </div>
        )}
      </div>
    </div>
  );
}
