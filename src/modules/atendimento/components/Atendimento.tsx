import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, MessageCircle, RotateCcw, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  alterarStatusConversaWhatsApp,
  atribuirConversaWhatsApp,
  listarAtendentesWhatsApp,
} from "@/lib/whatsapp-atendimento.functions";
import { chaves, useConversas } from "../hooks/useAtendimento";
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

export function Atendimento({ companyId, userId }: { companyId: string; userId: string | null }) {
  const qc = useQueryClient();
  const conversas = useConversas(companyId);
  const lista = useMemo(() => conversas.data ?? [], [conversas.data]);

  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [busca, setBusca] = useState("");
  const [ativaId, setAtivaId] = useState<string | null>(null);

  const contagens = useMemo(() => contarPorFiltro(lista, userId), [lista, userId]);

  // Primeira exibição: "Minhas" se houver; senão "Todas". Depois é escolha da pessoa.
  useEffect(() => {
    if (filtro === null && !conversas.isLoading)
      setFiltro(contagens.minhas > 0 ? "minhas" : "entrada");
  }, [filtro, conversas.isLoading, contagens.minhas]);

  const filtroAtual: Filtro = filtro ?? "entrada";
  const visiveis = useMemo(
    () => filtrarConversas(lista, { filtro: filtroAtual, userId, busca }),
    [lista, filtroAtual, userId, busca],
  );
  const ativa = lista.find((c) => c.id === ativaId) ?? null;

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
  const aoMudarStatus = useMutation({
    mutationFn: (v: { conversaId: string; status: "open" | "resolved" }) =>
      mudarStatus({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.status === "resolved" ? "Conversa resolvida." : "Conversa reaberta.");
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
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <MessageCircle className="h-5 w-5" /> Atendimento WhatsApp
            {naoLidas > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium tabular-nums text-primary-foreground">
                {naoLidas} não lida{naoLidas === 1 ? "" : "s"}
              </span>
            )}
          </h1>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings/whatsapp">
            <Settings className="mr-1.5 h-4 w-4" /> Número e templates
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
            onAbrir={setAtivaId}
          />
        </div>

        {ativa ? (
          <>
            <div className="flex min-h-0 flex-col">
              <Conversa
                key={ativa.id}
                conversa={ativa}
                companyId={companyId}
                onReabrir={() => aoMudarStatus.mutate({ conversaId: ativa.id, status: "open" })}
                cabecalho={
                  <div className="flex items-center gap-2 border-b px-3 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="lg:hidden"
                      aria-label="Voltar à lista"
                      onClick={() => setAtivaId(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{nomeDaConversa(ativa)}</div>
                    </div>
                    <select
                      aria-label="Responsável"
                      className="max-w-[170px] rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={ativa.assigned_to ?? ""}
                      disabled={aoAtribuir.isPending}
                      onChange={(e) =>
                        aoAtribuir.mutate({ conversaId: ativa.id, userId: e.target.value || null })
                      }
                    >
                      <option value="">Sem responsável</option>
                      {(atendentes.data ?? []).map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id === userId ? `${a.nome} (eu)` : a.nome}
                        </option>
                      ))}
                    </select>
                    {ativa.status === "resolved" ? (
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
                  </div>
                }
              />
            </div>
            <PainelDoLead conversa={ativa} />
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
