import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Loader2,
  Search,
  Trash2,
  ImageIcon,
  Video,
  Music,
  File as FileIcon,
  AlertTriangle,
} from "lucide-react";
import { quizService } from "@/modules/quiz/services/quizService";
import {
  formatarTamanho,
  seguroApagar,
  type ArquivoClassificado,
} from "@/modules/quiz/lib/biblioteca";
import { useAuth } from "@/core/auth/hooks/useAuth";

export const Route = createFileRoute("/_app/midia")({
  component: BibliotecaDeMidia,
});

type Filtro = "todos" | "orfaos" | "visitantes";

const ICONE = {
  imagem: ImageIcon,
  video: Video,
  audio: Music,
  outro: FileIcon,
} as const;

function BibliotecaDeMidia() {
  const { company } = useAuth();
  const [arquivos, setArquivos] = useState<ArquivoClassificado[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [apagando, setApagando] = useState(false);

  const carregar = useCallback(async () => {
    if (!company?.id) return;
    setCarregando(true);
    try {
      const lista = await quizService.listarBiblioteca(company.id);
      setArquivos(lista);
      /* Só assina o que dá para pré-visualizar: pedir url para tudo gasta uma
         chamada por arquivo sem nada aparecer na tela em troca. */
      const previsiveis = lista.filter((a) => a.tipo !== "outro").map((a) => a.caminho);
      setUrls(await quizService.assinarMidia(previsiveis));
    } catch {
      toast.error("Não foi possível carregar a biblioteca.");
    } finally {
      setCarregando(false);
    }
  }, [company?.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return arquivos.filter((a) => {
      if (filtro === "orfaos" && !a.orfao) return false;
      if (filtro === "visitantes" && !a.deVisitante) return false;
      /* O nome do quiz entra na busca porque é o único termo que alguém
         realmente digita: o nome do arquivo e o id do quiz são UUIDs. */
      return (
        !t ||
        a.nome.toLowerCase().includes(t) ||
        (a.quizNome ?? "").toLowerCase().includes(t) ||
        (a.quizId ?? "").includes(t)
      );
    });
  }, [arquivos, busca, filtro]);

  const livres = useMemo(() => seguroApagar(arquivos), [arquivos]);
  const totalBytes = useMemo(() => arquivos.reduce((s, a) => s + a.bytes, 0), [arquivos]);

  const apagar = async (alvos: ArquivoClassificado[], rotulo: string) => {
    if (!alvos.length) return;
    if (!confirm(`Apagar ${rotulo}? Não dá para desfazer.`)) return;
    setApagando(true);
    try {
      await quizService.apagarMidia(alvos.map((a) => a.caminho));
      toast.success(`${alvos.length} arquivo(s) apagado(s)`);
      await carregar();
    } catch (e) {
      toast.error("Erro ao apagar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setApagando(false);
    }
  };

  if (carregando) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="px-2">
          <Link to="/quizzes" aria-label="Voltar para os quizzes">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">Biblioteca de mídia</h1>
          <p className="text-sm text-muted-foreground">
            {arquivos.length} arquivo(s) · {formatarTamanho(totalBytes)} · tudo que os seus quizzes
            enviaram
          </p>
        </div>
        {livres.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-2"
            disabled={apagando}
            onClick={() => void apagar(livres, `${livres.length} arquivo(s) órfão(s)`)}
          >
            <Trash2 className="h-4 w-4" />
            Limpar {livres.length} órfão(s)
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou quiz"
            className="pl-8"
          />
        </div>
        {(
          [
            ["todos", "Todos"],
            ["orfaos", "Órfãos"],
            ["visitantes", "De visitantes"],
          ] as [Filtro, string][]
        ).map(([v, r]) => (
          <Button
            key={v}
            size="sm"
            variant={filtro === v ? "secondary" : "outline"}
            onClick={() => setFiltro(v)}
          >
            {r}
          </Button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          {arquivos.length === 0
            ? "Nenhum arquivo enviado ainda."
            : "Nada encontrado com esse filtro."}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visiveis.map((a) => {
            const Icone = ICONE[a.tipo];
            const url = urls[a.caminho];
            return (
              <div key={a.caminho} className="overflow-hidden rounded-xl border bg-card">
                <div className="flex aspect-video items-center justify-center bg-muted/50">
                  {a.tipo === "imagem" && url ? (
                    <img src={url} alt="" className="h-full w-full object-cover" />
                  ) : a.tipo === "video" && url ? (
                    // `preload="metadata"`: a biblioteca pode ter dezenas de
                    // vídeos, e baixar todos de uma vez trava a tela inteira.
                    <video src={url} controls preload="metadata" className="h-full w-full" />
                  ) : (
                    <Icone className="h-7 w-7 text-muted-foreground" />
                  )}
                </div>

                <div className="space-y-1.5 p-2.5">
                  <p className="truncate text-[13px] font-semibold" title={a.nome}>
                    {a.nome}
                  </p>
                  {a.tipo === "audio" && url && <audio src={url} controls className="w-full" />}
                  <p className="text-[11px] text-muted-foreground">
                    {formatarTamanho(a.bytes)}
                    {a.criadoEm && ` · ${new Date(a.criadoEm).toLocaleDateString("pt-BR")}`}
                  </p>
                  {/* De onde o arquivo veio. Sem esta linha o cartão só tem um
                      UUID, e não há como saber qual quiz some se apagar. */}
                  {a.quizNome && (
                    <p className="truncate text-[11px] text-muted-foreground" title={a.quizNome}>
                      em <span className="font-medium text-foreground">{a.quizNome}</span>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1">
                    {a.deVisitante && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        resposta de visitante
                      </span>
                    )}
                    {a.emUso ? (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        em uso
                      </span>
                    ) : a.orfao ? (
                      <span className="rounded-full bg-[var(--aviso-suave)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--aviso)]">
                        órfão
                      </span>
                    ) : null}
                  </div>

                  {/* Apagar arquivo EM USO fica disponível, mas avisado: pode
                      ser exatamente o que se quer num pedido de remoção de
                      dados. O que não pode é apagar sem saber. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-full gap-1.5 text-[11px]"
                    disabled={apagando}
                    onClick={() =>
                      void apagar(
                        [a],
                        a.emUso
                          ? `"${a.nome}"? Ele está EM USO ${a.quizNome ? `em "${a.quizNome}"` : "num quiz"} e vai sumir da tela do visitante`
                          : `"${a.nome}"`,
                      )
                    }
                  >
                    {a.emUso ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Apagar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
