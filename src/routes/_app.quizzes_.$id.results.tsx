import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { variaveisDisponiveis } from "@/modules/quiz/lib/variaveisDaMensagem";
import { ArrowLeft, Loader2, Plus, Trash2, Trophy, AlertCircle } from "lucide-react";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { quizService } from "@/modules/quiz/services/quizService";
import { maxPossibleScore, minPossibleScore, scorePercent } from "@/modules/quiz/engine";
import { DEFAULT_DESIGN } from "@/modules/quiz/design-presets";
import type { QuizFunnel, QuizSchema, ScoreTier } from "@/modules/quiz/types";

export const Route = createFileRoute("/_app/quizzes_/$id/results")({
  component: QuizResultsPage,
});

function QuizResultsPage() {
  const { id } = useParams({ from: "/_app/quizzes_/$id/results" });
  const { company } = useAuth();
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [schema, setSchema] = useState<QuizSchema>({
    blocks: [],
    design: DEFAULT_DESIGN,
    results: [],
  });
  const [tiers, setTiers] = useState<ScoreTier[]>([]);
  const [respostas, setRespostas] = useState<Array<{ score: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      quizService.getById(id),
      quizService.getLatestSchema(id),
      quizService.listSubmissions(id, 500),
    ])
      .then(([q, s, subs]) => {
        if (!vivo) return;
        setQuiz(q);
        setSchema(s);
        setTiers(((q?.settings?.score_tiers as ScoreTier[] | undefined) ?? []).slice());
        setRespostas(subs);
      })
      .catch(() => toast.error("Não foi possível carregar os resultados."))
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  /* O teto e o piso vêm do esquema, não de um número digitado: é a mesma conta
     que classifica o lead de verdade, então o que a tela mostra é o que vai
     acontecer. */
  const max = useMemo(() => maxPossibleScore(schema), [schema]);
  const min = useMemo(() => minPossibleScore(schema), [schema]);

  const ordenadas = useMemo(() => [...tiers].sort((a, b) => b.minPercent - a.minPercent), [tiers]);

  /** Quantos leads reais caíram em cada faixa — medido, não estimado. */
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of respostas) {
      if (r.score === null) continue;
      const pct = scorePercent(r.score, max, min);
      const faixa = ordenadas.find((t) => pct >= t.minPercent);
      if (faixa) m.set(faixa.id, (m.get(faixa.id) ?? 0) + 1);
    }
    return m;
  }, [respostas, ordenadas, max, min]);

  const salvar = async () => {
    if (!company?.id || !quiz) return;
    setSalvando(true);
    try {
      await quizService.updateSettings({
        quizId: id,
        companyId: company.id,
        name: quiz.name,
        slug: quiz.slug,
        scoreTiers: tiers,
      });
      toast.success("Faixas salvas");
    } catch (e) {
      console.error("Erro ao salvar faixas", e);
      toast.error("Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  };

  const atualizar = (i: number, patch: Partial<ScoreTier>) =>
    setTiers((t) => t.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  const adicionar = () =>
    setTiers((t) => [
      ...t,
      { id: crypto.randomUUID(), label: `Faixa ${t.length + 1}`, minPercent: 0 },
    ]);

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Duas faixas com o mesmo mínimo: a de baixo nunca recebe ninguém, porque a
     busca para na primeira que bate. É silencioso e caro — a mensagem daquela
     faixa simplesmente nunca sai. */
  const empatadas = ordenadas.filter(
    (t, i) => i > 0 && t.minPercent === ordenadas[i - 1].minPercent,
  );
  const semZero = ordenadas.length > 0 && !ordenadas.some((t) => t.minPercent <= 0);

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
          <p className="mt-0.5 text-xs text-muted-foreground">Resultados</p>
        </div>
        <Button size="sm" className="ml-auto" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar faixas"}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 p-5">
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-bold">Faixas de pontuação</h2>
              <p className="text-xs text-muted-foreground">
                A faixa decide a classificação do lead e qual mensagem de WhatsApp sai ao concluir.
              </p>
              {/* Faixa e mensagem NÃO são versionadas: ficam em
                  `quiz_funnels.settings` e o servidor as lê direto dali, sem
                  passar pela versão publicada. Enquanto isso o construtor diz
                  "fora do ar" e oferece "Publicar", ensinando o contrário. Quem
                  corrige uma mensagem aqui precisa saber que ela já vale — e
                  quem espera publicar para valer precisa saber que não é o
                  caso. */}
              <p className="mt-0.5 text-xs font-medium text-[var(--aviso)]">
                O que você salvar aqui vale na hora, sem publicar.
              </p>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm tabular-nums">
                {min} a {max}
              </div>
              <div className="text-[11px] text-muted-foreground">pontos alcançáveis</div>
            </div>
          </Card>

          {max - min <= 0 && (
            <Card className="flex items-start gap-2 border-l-[3px] border-l-amber-500 p-4 text-xs">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Nenhuma pergunta deste quiz vale pontos, então toda faixa é inalcançável. Dê
                pontuação às opções no construtor.
              </span>
            </Card>
          )}

          {!!empatadas.length && (
            <Card className="flex items-start gap-2 border-l-[3px] border-l-[#F24822] p-4 text-xs">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#F24822]" />
              <span>
                {empatadas.length} faixa(s) com o mesmo mínimo de outra — a de baixo nunca recebe
                ninguém, porque a classificação para na primeira que bate.
              </span>
            </Card>
          )}

          {semZero && (
            <Card className="flex items-start gap-2 border-l-[3px] border-l-amber-500 p-4 text-xs">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <span>
                Nenhuma faixa começa em 0%: quem pontuar abaixo de {ordenadas.at(-1)?.minPercent}%
                fica sem classificação e não recebe mensagem nenhuma.
              </span>
            </Card>
          )}

          {tiers.length === 0 && (
            <Card className="p-6 text-center text-sm text-muted-foreground">
              Sem faixas. Todos os leads chegam sem classificação.
            </Card>
          )}

          {tiers.map((t, i) => {
            const quantos = contagem.get(t.id) ?? 0;
            const pontosMin = Math.round(min + ((max - min) * t.minPercent) / 100);
            return (
              <Card key={t.id} className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={t.label}
                    onChange={(e) => atualizar(i, { label: e.target.value })}
                    className="h-9 flex-1 font-semibold"
                    placeholder="Nome da faixa"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={t.minPercent}
                      onChange={(e) => atualizar(i, { minPercent: Number(e.target.value) })}
                      className="h-9 w-20 text-right tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">% ou mais</span>
                  </div>
                  <button
                    onClick={() => setTiers((x) => x.filter((_, k) => k !== i))}
                    className="text-muted-foreground transition-colors hover:text-destructive"
                    aria-label={`Remover ${t.label}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span>
                    a partir de{" "}
                    <span className="font-mono tabular-nums text-foreground">{pontosMin}</span>{" "}
                    pontos
                  </span>
                  <span>
                    <span className="font-semibold tabular-nums text-foreground">{quantos}</span>{" "}
                    lead(s) nesta faixa
                  </span>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Mensagem de WhatsApp ao concluir</Label>
                  {/* As variáveis, à mão.
                      O editor de texto do construtor tem o botão `fx` com esta
                      mesma lista; aqui o autor precisava saber os nomes de cor e
                      digitá-los. Errar um não dá erro: o servidor troca chave
                      sem valor por string vazia, e a mensagem sai com um buraco
                      no meio da frase. Clicar insere no fim do texto. */}
                  <div className="flex flex-wrap items-center gap-1">
                    {variaveisDisponiveis(schema.blocks ?? []).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          atualizar(i, { whatsappTemplate: `${t.whatsappTemplate ?? ""}{{${v}}}` })
                        }
                        title={`Inserir {{${v}}} no fim da mensagem`}
                        className="rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                      >
                        {`{{${v}}}`}
                      </button>
                    ))}
                  </div>
                  {/* A caixa cresce com o texto, até um teto.
                      Medido na tela em 07/10: a faixa com mensagem tinha 246
                      caracteres e 76px de conteúdo numa caixa de 58px — editava-se
                      por uma janela de 3 linhas com rolagem interna, enquanto as
                      duas faixas VAZIAS ocupavam as mesmas 3 linhas sem nada
                      dentro. O espaço estava distribuído ao contrário. */}
                  <Textarea
                    value={t.whatsappTemplate ?? ""}
                    onChange={(e) => atualizar(i, { whatsappTemplate: e.target.value })}
                    rows={2}
                    placeholder="Vazio = não envia nada. Use {{nome}} e {{faixa}}."
                    className="field-sizing-content max-h-56 min-h-[58px] text-xs"
                  />
                  {/* Faixa sem mensagem é VAZAMENTO, não estado neutro: quem cair
                      nela conclui o quiz e não recebe nada, em silêncio. A
                      Análise já denunciava isso ("2 faixa(s) sem mensagem"), e a
                      tela que resolve o problema tratava a lacuna com o mesmo tom
                      de um texto de ajuda. */}
                  {!(t.whatsappTemplate ?? "").trim() && (
                    <p className="flex items-start gap-1.5 text-[11px] text-[var(--aviso)]">
                      <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
                      <span>
                        Quem terminar nesta faixa não recebe mensagem nenhuma
                        {quantos > 0 && ` — já são ${quantos} lead(s)`}.
                      </span>
                    </p>
                  )}
                </div>
              </Card>
            );
          })}

          <Button variant="outline" className="w-full gap-1.5" onClick={adicionar}>
            <Plus className="h-4 w-4" />
            Adicionar faixa
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
