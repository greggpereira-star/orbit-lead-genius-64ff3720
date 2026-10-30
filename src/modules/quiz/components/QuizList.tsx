import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { cliqueAbreOCartao } from "../lib/cliqueDeCartao";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Plus,
  Trash2,
  ExternalLink,
  Loader2,
  Copy,
  Archive,
  ArchiveRestore,
  Image as ImageIcon,
  Link2,
  MoreHorizontal,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CORES_DE_FAIXA, MINIMO_PARA_NOTA } from "../lib/stepConversion";
import type { ResumoDoCartao } from "../lib/resumoDoCartao";
import { quizService } from "../services/quizService";
import { useAuth } from "@/core/auth/hooks/useAuth";
import type { QuizFunnel } from "../types";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/utils";

interface Props {
  onCreate: () => void;
  onUseTemplate: () => void;
}

export function QuizList({ onCreate, onUseTemplate }: Props) {
  const { company, user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<QuizFunnel[]>([]);
  const [resumos, setResumos] = useState<Record<string, ResumoDoCartao>>({});
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  /* Arquivado fica fora da lista por padrão — é para isso que serve arquivar.
     O número ao lado do botão evita que alguém esqueça um quiz lá dentro. */
  const [verArquivados, setVerArquivados] = useState(false);

  const refresh = async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const list = await quizService.list(company.id);
      setItems(list);
      /* Os números são acessório da lista: se falharem, os cartões continuam
         abrindo e o aviso diz o que faltou, em vez de a página inteira cair. */
      try {
        setResumos(await quizService.getResumosDosCartoes(company.id, list));
      } catch (e: unknown) {
        console.error("QuizList: resumos falharam", e);
        setResumos({});
      }
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      toast.error("Erro ao carregar quizzes: " + msg);
      console.error("QuizList: refresh failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [company?.id]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este quiz? Esta ação não pode ser desfeita.")) return;
    try {
      const r = await quizService.remove(id, company?.id);
      /* Dizer o que aconteceu com a mídia, em vez de deixar o autor supondo.
         "Preservada" é o caso em que outro quiz — normalmente uma cópia —
         ainda aponta para os mesmos arquivos. */
      toast.success(
        r.midiaPreservada
          ? "Quiz excluído — a mídia foi mantida porque outro quiz usa os mesmos arquivos"
          : r.arquivosApagados > 0
            ? `Quiz excluído, com ${r.arquivosApagados} arquivo(s) de mídia`
            : "Quiz excluído",
      );
      void refresh();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      toast.error("Erro ao excluir: " + msg);
    }
  };

  const handleDuplicate = async (id: string) => {
    if (!company?.id || !user?.id) return;
    setDuplicatingId(id);
    try {
      await quizService.duplicate({ quizId: id, companyId: company.id, userId: user.id });
      toast.success("Quiz duplicado");
      void refresh();
    } catch (e: unknown) {
      const msg = getErrorMessage(e);
      toast.error("Erro ao duplicar: " + msg);
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleArchive = async (id: string, arquivado: boolean) => {
    try {
      await quizService.setArchived(id, arquivado);
      toast.success(
        arquivado
          ? "Quiz arquivado — o link público saiu do ar."
          : "Quiz desarquivado como rascunho.",
      );
      void refresh();
    } catch (e: unknown) {
      toast.error("Erro ao arquivar: " + getErrorMessage(e));
    }
  };

  const handleCopyLink = async (slug: string) => {
    const url = `${window.location.origin}/q/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não consegui copiar. O link é " + url);
    }
  };

  const arquivados = items.filter((q) => q.status === "archived");
  const visiveis = verArquivados ? items : items.filter((q) => q.status !== "archived");

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold tracking-tight mb-2">Crie seu primeiro quiz interativo</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          Capte, qualifique e converta leads com uma experiência premium — mídia rica, lógica
          condicional e resultados personalizados.
        </p>
        <div className="flex flex-col min-[420px]:flex-row gap-3 justify-center">
          <Button onClick={onCreate} className="gap-2 shadow-lg shadow-primary/20">
            <Plus className="h-4 w-4" /> Criar Quiz
          </Button>
          <Button variant="outline" onClick={onUseTemplate} className="gap-2">
            <Sparkles className="h-4 w-4" /> Usar Template
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {arquivados.length > 0 && (
        <div className="flex justify-end">
          <Button asChild variant="ghost" size="sm" className="gap-1.5 text-xs">
            <Link to="/midia">
              <ImageIcon className="h-3 w-3" /> Biblioteca de mídia
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setVerArquivados((v) => !v)}
          >
            <Archive className="h-3.5 w-3.5" />
            {verArquivados ? "Ocultar arquivados" : `Mostrar arquivados (${arquivados.length})`}
          </Button>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visiveis.map((q) => (
          <Card
            key={q.id}
            /* O cartão inteiro abre o editor. Antes só o botão "Abrir" fazia
             isso, e a área grande no meio não respondia a nada — num cartão
             que parece clicável, o clique que não faz nada passa por defeito.
             A regra de quando abrir está em `cliqueAbreOCartao`, com teste:
             botão de dentro, texto selecionado e clique de atalho continuam
             sendo de quem são. */
            onClick={(e) => {
              if (
                !cliqueAbreOCartao({
                  alvo: e.target as HTMLElement,
                  selecao: window.getSelection()?.toString(),
                  botao: e.button,
                  ctrl: e.ctrlKey,
                  meta: e.metaKey,
                  shift: e.shiftKey,
                })
              ) {
                return;
              }
              void navigate({ to: "/quizzes/$id/builder", params: { id: q.id } });
            }}
            className="p-4 sm:p-5 flex flex-col cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all"
          >
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="min-w-0">
                {/* O título é um link DE VERDADE: é por ele que o teclado chega
                  ao editor, e é ele que permite abrir em nova aba. O `onClick`
                  do cartão sozinho não daria nenhum dos dois. */}
                <h3 className="font-bold truncate">
                  <Link
                    to="/quizzes/$id/builder"
                    params={{ id: q.id }}
                    className="outline-none hover:underline focus-visible:underline"
                  >
                    {q.name}
                  </Link>
                </h3>
                <p className="text-xs text-muted-foreground truncate">/{q.slug}</p>
              </div>
              <Badge
                variant={q.status === "published" ? "default" : "secondary"}
                className="shrink-0"
              >
                {q.status === "published"
                  ? "Publicado"
                  : q.status === "draft"
                    ? "Rascunho"
                    : "Arquivado"}
              </Badge>
            </div>
            <ResumoDoQuiz status={q.status} resumo={resumos[q.id]} />
            {/* O `stopPropagation` da linha cobre também o menu: o conteúdo dele é
              portal, mas o React faz o clique subir pela árvore dele, não pela do DOM. */}
            <div className="flex gap-2 mt-auto pt-1" onClick={(e) => e.stopPropagation()}>
              <Button asChild size="sm" className="flex-1">
                <Link to="/quizzes/$id/builder" params={{ id: q.id }}>
                  Abrir
                </Link>
              </Button>
              {q.status === "published" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1.5"
                  onClick={() => void handleCopyLink(q.slug)}
                >
                  <Link2 className="h-3.5 w-3.5" /> Copiar link
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 px-2"
                    aria-label={`Mais ações de ${q.name}`}
                  >
                    {duplicatingId === q.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/quizzes/$id/preview" params={{ id: q.id }}>
                      <ExternalLink className="mr-2 h-4 w-4" /> Visualizar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={duplicatingId === q.id}
                    onSelect={() => void handleDuplicate(q.id)}
                  >
                    <Copy className="mr-2 h-4 w-4" /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => void handleArchive(q.id, q.status !== "archived")}
                  >
                    {q.status === "archived" ? (
                      <ArchiveRestore className="mr-2 h-4 w-4" />
                    ) : (
                      <Archive className="mr-2 h-4 w-4" />
                    )}
                    {q.status === "archived" ? "Desarquivar" : "Arquivar"}
                  </DropdownMenuItem>
                  {/* O irreversível fica separado e vermelho: arquivar se desfaz,
                      excluir não. A confirmação continua sendo a trava. */}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onSelect={() => void handleDelete(q.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" /> Excluir — não dá para desfazer
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * O miolo do cartão: três números, o mapa de calor e UMA frase.
 *
 * O desenho anterior tinha três colunas e duas delas diziam o mesmo número
 * ("Concluíram 5%" e "Viraram lead 5%", 3 de 60 nas duas). Aqui cada coluna
 * responde uma pergunta diferente — quanta gente chegou, quantos viraram lead,
 * que fatia isso é — e o que sobra de espaço vai para a leitura: onde o funil
 * perde gente. Sem amostra, o cartão diz isso em vez de dar nota.
 */
export function ResumoDoQuiz({
  status,
  resumo,
}: {
  status: QuizFunnel["status"];
  resumo: ResumoDoCartao | undefined;
}) {
  if (status === "draft") {
    return (
      <p className="mb-4 rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
        Rascunho. Publique para começar a medir visitas e leads.
      </p>
    );
  }
  if (!resumo || (resumo.visitantes === 0 && resumo.leads === 0)) {
    return (
      <p className="mb-4 rounded-lg bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
        {status === "archived"
          ? "Arquivado. Sem visitas nos últimos 30 dias."
          : "Ainda sem visitas nos últimos 30 dias. Copie o link e divulgue."}
      </p>
    );
  }

  const { visitantes, leads, taxaDeLead, variacao, amostraPequena, mapa, maiorPerda } = resumo;

  return (
    <div className="mb-4 space-y-3 rounded-lg bg-muted/40 p-3 text-xs">
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>Últimos 30 dias</span>
        {variacao !== null && (
          <span
            className="inline-flex items-center gap-1 tabular-nums"
            title={`${resumo.visitantesAnteriores} visitantes nos 30 dias anteriores`}
          >
            {variacao >= 0 ? (
              <TrendingUp className="h-3 w-3" aria-hidden />
            ) : (
              <TrendingDown className="h-3 w-3" aria-hidden />
            )}
            {variacao >= 0 ? "+" : ""}
            {variacao}% visitas
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Numero
          valor={visitantes}
          rotulo="Visitantes"
          dica="Pessoas distintas que abriram o quiz"
        />
        <Numero valor={leads} rotulo="Leads" dica="Deixaram e-mail ou telefone" />
        <Numero
          valor={taxaDeLead === null ? "—" : `${Math.round(taxaDeLead)}%`}
          rotulo="Viram lead"
          dica={`${leads} de ${visitantes} visitantes deixaram contato`}
        />
      </div>

      {mapa.length > 0 && (
        <div>
          {/* Mapa de calor do funil: uma célula por etapa, na cor de quanta gente
              passou dela. Cor nunca é o único sinal — cada célula tem texto. */}
          <ul className="flex gap-0.5" aria-label="Mapa de calor do funil por etapa">
            {mapa.map((c) => (
              <li
                key={c.numero}
                className="h-2 flex-1 rounded-[2px]"
                style={{ backgroundColor: CORES_DE_FAIXA[c.faixa].cor }}
                title={
                  c.percentualQueAvancou === null
                    ? `Etapa ${c.numero} · ${c.nome}: sem dados suficientes`
                    : `Etapa ${c.numero} · ${c.nome}: ${c.percentualQueAvancou}% avançaram (de ${c.visitantes})`
                }
              />
            ))}
          </ul>
        </div>
      )}

      <p className="leading-snug text-muted-foreground">
        {maiorPerda ? (
          <>
            Maior perda na etapa {maiorPerda.numero}
            {maiorPerda.nome !== `Etapa ${maiorPerda.numero}` ? ` (${maiorPerda.nome})` : ""}:{" "}
            <strong className="font-semibold text-foreground tabular-nums">
              {maiorPerda.percentualQueSai}%
            </strong>{" "}
            saem aqui.
          </>
        ) : amostraPequena ? (
          <>
            Só {visitantes} visita(s): pouco para tirar conclusão (a leitura começa em{" "}
            {MINIMO_PARA_NOTA}).
          </>
        ) : (
          <>Sem perda relevante entre as etapas.</>
        )}
      </p>
    </div>
  );
}

function Numero({ valor, rotulo, dica }: { valor: number | string; rotulo: string; dica: string }) {
  return (
    <div title={dica} className="text-center">
      <div className="text-lg font-bold tabular-nums leading-tight">{valor}</div>
      <div className="text-muted-foreground">{rotulo}</div>
    </div>
  );
}
