import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Check, Layers, Target, Users } from "lucide-react";
import type { QuizTemplate, QuizSchema, QuizStep } from "../types";
import { getSteps } from "../lib/steps";
import { maxPossibleScore, minPossibleScore } from "../engine";

/**
 * Galeria de modelos.
 *
 * A lista anterior mostrava só nome e descrição — nada dizia o que havia dentro,
 * e os modelos estavam vazios justamente por isso: ninguém conseguia notar. Aqui
 * cada cartão declara o que o modelo contém, lido do schema, e a prévia lista as
 * etapas pelo nome. Um modelo vazio fica óbvio na própria tela.
 */

interface Resumo {
  etapas: QuizStep[];
  perguntas: number;
  faixa: number;
  captura: boolean;
}

function resumir(schema: Record<string, unknown>): Resumo {
  const s = schema as unknown as QuizSchema;
  const blocos = s?.blocks ?? [];
  const etapas = blocos.length ? getSteps(s, { keepEmpty: true }) : [];
  return {
    etapas,
    perguntas: blocos.filter((b) => (b.options ?? []).length > 0).length,
    faixa: blocos.length ? maxPossibleScore(s) - minPossibleScore(s) : 0,
    captura: blocos.some((b) => ["form", "email", "phone"].includes(b.type)),
  };
}

const ROTULO_DE_NICHO: Record<string, string> = {
  imobiliario: "Imobiliário",
  estetica: "Estética",
  mentoria: "Mentoria",
  marketing: "Marketing",
  saude: "Saúde",
  ecommerce: "E-commerce",
};
const rotulo = (n: string) => ROTULO_DE_NICHO[n] ?? n;

export function QuizTemplateGallery({
  templates,
  selected,
  onSelect,
}: {
  templates: QuizTemplate[];
  selected: QuizTemplate | null;
  onSelect: (t: QuizTemplate) => void;
}) {
  const [nicho, setNicho] = useState<string | null>(null);

  const nichos = useMemo(
    () => Array.from(new Set(templates.map((t) => t.niche).filter((n): n is string => !!n))),
    [templates],
  );
  const visiveis = useMemo(
    () => (nicho ? templates.filter((t) => t.niche === nicho) : templates),
    [templates, nicho],
  );
  const resumos = useMemo(
    () => new Map(templates.map((t) => [t.id, resumir(t.schema)])),
    [templates],
  );

  if (templates.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">Nenhum modelo disponível.</p>
    );
  }

  const resumoSelecionado = selected ? resumos.get(selected.id) : undefined;

  return (
    <div className="space-y-3">
      {nichos.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setNicho(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              nicho === null
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            Todos
          </button>
          {nichos.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNicho(n)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                nicho === n
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {rotulo(n)}
            </button>
          ))}
        </div>
      )}

      <div className="grid max-h-[320px] grid-cols-1 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
        {visiveis.map((t) => {
          const r = resumos.get(t.id)!;
          const ativo = selected?.id === t.id;
          const vazio = r.etapas.length === 0;
          return (
            <Card
              key={t.id}
              role="button"
              tabIndex={0}
              aria-pressed={ativo}
              onClick={() => onSelect(t)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(t);
                }
              }}
              className={`cursor-pointer p-3 transition-all ${
                ativo ? "ring-2 ring-primary" : "hover:border-primary/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg">
                  {t.emoji ?? "📋"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h4 className="truncate text-sm font-semibold">{t.name}</h4>
                    {ativo && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {vazio ? (
                      <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                        sem etapas
                      </Badge>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          {r.etapas.length} etapas
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Target className="h-3 w-3" />
                          {r.perguntas} perguntas
                        </span>
                        {r.captura && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            captura
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selected && resumoSelecionado && resumoSelecionado.etapas.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">
            O que vem pronto neste modelo
          </p>
          <ol className="flex flex-wrap gap-1.5">
            {resumoSelecionado.etapas.map((s, i) => (
              <li
                key={s.id}
                className="rounded border bg-background px-2 py-0.5 text-[11px] text-foreground"
              >
                <span className="text-muted-foreground">{i + 1}.</span> {s.name ?? `Etapa ${i + 1}`}
              </li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Pontuação de 0 a {resumoSelecionado.faixa} pontos — dá para separar lead quente de frio.
            Tudo é editável depois.
          </p>
        </div>
      )}
    </div>
  );
}
