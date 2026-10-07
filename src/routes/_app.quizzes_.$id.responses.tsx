import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Loader2, Download, Search, ChevronRight, ChevronDown } from "lucide-react";
import { quizService } from "@/modules/quiz/services/quizService";
import type { QuizFunnel, QuizSchema } from "@/modules/quiz/types";
import {
  montarCsvDeRespostas,
  perguntasDoSchema,
  valorLegivel,
  tituloDaColuna,
} from "@/modules/quiz/lib/csvDeRespostas";
import { midiaDaResposta } from "@/modules/crm/lib/midiaDaResposta";

export const Route = createFileRoute("/_app/quizzes_/$id/responses")({
  component: QuizResponsesPage,
});

type Resposta = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  score: number | null;
  temperature: string | null;
  completed: boolean;
  created_at: string;
  answers: Record<string, unknown> | null;
};

const COR_DA_TEMPERATURA: Record<string, string> = {
  hot: "#F24822",
  warm: "#FFCD29",
  cold: "#64748b",
};

function QuizResponsesPage() {
  const { id } = useParams({ from: "/_app/quizzes_/$id/responses" });
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [linhas, setLinhas] = useState<Resposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [so, setSo] = useState<"todas" | "completas" | "abandonadas">("todas");
  const [exportando, setExportando] = useState(false);
  const [schema, setSchema] = useState<QuizSchema | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    /* O schema entra no carregamento, e não só na exportação: é dele que saem
       os ENUNCIADOS das perguntas, e sem ele a resposta aberta seria uma lista
       de ids de bloco. */
    Promise.all([
      quizService.getById(id),
      quizService.listSubmissions(id, 500),
      quizService.getLatestSchema(id).catch(() => null),
    ])
      .then(([q, s, sc]) => {
        if (!vivo) return;
        setQuiz(q);
        setLinhas(s);
        setSchema(sc);
      })
      .catch(() => toast.error("Não foi possível carregar as respostas."))
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (so === "completas" && !l.completed) return false;
      if (so === "abandonadas" && l.completed) return false;
      if (!t) return true;
      return [l.name, l.email, l.phone].some((v) => v?.toLowerCase().includes(t));
    });
  }, [linhas, busca, so]);

  const exportar = async () => {
    setExportando(true);
    try {
      /* O schema entra junto porque é dele que saem as COLUNAS de pergunta.
         Antes o CSV levava só contato, pontuação e UTM — nenhuma resposta —,
         e quem exportava para analisar o funil recebia a lista de contatos e
         nada do que as pessoas disseram. */
      const todas = await quizService.getSubmissionsParaExport(id, 90);
      /* O MESMO schema da tela. Tela e CSV lendo fontes diferentes é como a
         exportação passou a divergir do que se via. */
      const csv = montarCsvDeRespostas(schema, todas);
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quiz-${id}-respostas.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${todas.length} resposta(s) exportada(s)`);
    } catch {
      toast.error("Não foi possível exportar agora.");
    } finally {
      setExportando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes/$id/builder" params={{ id }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao Builder
          </Link>
        </Button>
        <div className="border-l pl-3">
          <h1 className="text-sm font-bold leading-none">{quiz?.name ?? "Quiz"}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Respostas</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-2"
          onClick={() => void exportar()}
          disabled={exportando}
        >
          <Download className="h-4 w-4" />
          {exportando ? "Exportando…" : "CSV"}
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone"
            className="h-8 pl-8 text-xs"
          />
        </div>
        {(["todas", "completas", "abandonadas"] as const).map((f) => (
          <Button
            key={f}
            size="sm"
            variant={so === f ? "default" : "outline"}
            className="h-8 text-xs capitalize"
            onClick={() => setSo(f)}
          >
            {f}
          </Button>
        ))}
        <span className="text-xs text-muted-foreground">
          {filtradas.length} de {linhas.length}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {filtradas.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {linhas.length === 0 ? "Nenhuma resposta ainda." : "Nada encontrado com esse filtro."}
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="w-8 px-2 py-2" aria-label="Abrir respostas" />
                  {["Quando", "Nome", "E-mail", "Telefone", "Pontos", "Temperatura", "Status"].map(
                    (h) => (
                      <th key={h} className="px-3 py-2 font-semibold">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => {
                  const estaAberta = aberta === l.id;
                  return (
                    <Fragment key={l.id}>
                      <tr
                        className="cursor-pointer border-t hover:bg-muted/30"
                        onClick={() => setAberta(estaAberta ? null : l.id)}
                      >
                        <td className="px-2 py-2 align-middle">
                          <button
                            type="button"
                            aria-expanded={estaAberta}
                            aria-label={`${estaAberta ? "Fechar" : "Ver"} as respostas de ${l.name || "visitante sem nome"}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setAberta(estaAberta ? null : l.id);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            {estaAberta ? (
                              <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                          {new Date(l.created_at).toLocaleString("pt-BR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </td>
                        {/* Resposta sem contato é abandono antes da captura — dizer
                            "—" é mais honesto que deixar a célula vazia. */}
                        <td className="px-3 py-2">{l.name || "—"}</td>
                        <td className="px-3 py-2">{l.email || "—"}</td>
                        <td className="whitespace-nowrap px-3 py-2">{l.phone || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{l.score ?? "—"}</td>
                        <td className="px-3 py-2">
                          {l.temperature ? (
                            <span
                              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                              style={{
                                background: `${COR_DA_TEMPERATURA[l.temperature] ?? "#64748b"}22`,
                                color: COR_DA_TEMPERATURA[l.temperature] ?? "#64748b",
                              }}
                            >
                              {l.temperature}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">{l.completed ? "completa" : "abandonada"}</td>
                      </tr>
                      {estaAberta && (
                        <tr className="border-t bg-muted/20">
                          <td colSpan={8} className="px-4 py-3">
                            <RespostasDaPessoa schema={schema} answers={l.answers} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * O que UMA pessoa respondeu.
 *
 * A tela se chama "Respostas" e mostrava contato, pontos e temperatura — e
 * nenhuma resposta. O dado nunca faltou: `listSubmissions` já trazia `answers`
 * do banco e descartava no mapeamento. Para ler o que alguém disse era preciso
 * exportar o CSV e abrir numa planilha.
 *
 * Os enunciados saem do SCHEMA e passam pelas MESMAS funções do CSV
 * (`perguntasDoSchema`, `tituloDaColuna`, `valorLegivel`). Tela e exportação
 * lendo fontes diferentes é como uma passa a mostrar perguntas que a outra não
 * tem, e ninguém percebe até alguém comparar os dois na mão.
 */
function RespostasDaPessoa({
  schema,
  answers,
}: {
  schema: QuizSchema | null;
  answers: Record<string, unknown> | null;
}) {
  const perguntas = useMemo(() => perguntasDoSchema(schema), [schema]);

  if (!schema) {
    return <p className="text-xs text-muted-foreground">Não foi possível carregar as perguntas.</p>;
  }

  /* Só o que a pessoa respondeu. Listar as 24 perguntas com 20 vazias
     transforma a resposta de quem abandonou na etapa 3 num muro de traços. */
  const respondidas = perguntas
    .map((bloco, i) => ({ bloco, i, valor: valorLegivel(bloco, answers?.[bloco.id]) }))
    .filter((x) => x.valor !== "");

  if (respondidas.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">Saiu antes de responder qualquer pergunta.</p>
    );
  }

  return (
    <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
      {respondidas.map(({ bloco, i, valor }) => {
        const midia = midiaDaResposta(valor);
        return (
          <div key={bloco.id} className="min-w-0">
            <dt className="text-[11px] font-medium leading-snug text-muted-foreground">
              {tituloDaColuna(bloco, i)}
            </dt>
            <dd className="mt-0.5 text-xs font-medium">
              {/* Resposta em vídeo/áudio guardada como URL: sem player, a
                  pessoa gravou e ninguém assiste. */}
              {midia?.tipo === "video" ? (
                <video
                  src={midia.url}
                  controls
                  preload="metadata"
                  className="mt-1 w-full max-w-xs rounded-lg"
                />
              ) : midia?.tipo === "audio" ? (
                <audio src={midia.url} controls className="mt-1 w-full max-w-xs" />
              ) : midia?.tipo === "imagem" ? (
                <img src={midia.url} alt="" className="mt-1 w-full max-w-xs rounded-lg" />
              ) : (
                <span className="break-words">{valor}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
