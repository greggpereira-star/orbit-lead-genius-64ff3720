import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, ChevronsUpDown, FileText, Loader2, Send, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { enviarTemplateWhatsApp } from "@/lib/whatsapp-atendimento.functions";
import { chaves, useTemplatesAprovados, type TemplateAprovado } from "../hooks/useAtendimento";
import {
  exemplosDoCorpo,
  previaDeAprovado,
  resumoDoCorpo,
  rotuloDaCategoria,
  totalDeVariaveis,
  variaveisSemValor,
} from "../lib/templatesAprovados";
import { PreviaDoTemplate } from "./PreviaDoTemplate";

const chave = (t: Pick<TemplateAprovado, "name" | "language">) => `${t.name}|${t.language}`;

function Categoria({ valor }: { valor: string }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium",
        valor.toUpperCase() === "MARKETING"
          ? "bg-[var(--aviso)]/15 text-[var(--aviso)]"
          : "bg-primary/10 text-primary",
      )}
    >
      {rotuloDaCategoria(valor)}
    </span>
  );
}

/**
 * Retomar uma conversa com a janela de 24 h fechada: só template aprovado.
 *
 * O que mudou: o `<select>` nativo (painel do sistema, translúcido e sem prévia, esticado
 * na largura toda) virou um seletor próprio, com lista opaca e pesquisável, e a escolha
 * mostra a mensagem COMO O CLIENTE VAI VER, com os valores já preenchidos. Enviar o
 * template errado custa dinheiro e qualidade do número: a prévia existe para isso.
 */
export function EnviarTemplate(props: {
  conversa: { id: string };
  companyId: string;
  avisoDaJanela: string | null;
  /** Nome de verdade do contato (nunca o telefone), para sugerir na primeira variável. */
  nomeProprio: string | null;
  onEnviar: ReturnType<typeof useServerFn<typeof enviarTemplateWhatsApp>>;
  /** Para a recusa do envio reabrir a lista (opt-out alinhado pelo servidor). */
  aoRecusar: (r: { texto: string; motivo?: string }) => void;
}) {
  const qc = useQueryClient();
  const templates = useTemplatesAprovados(props.companyId);
  const [escolhido, setEscolhido] = useState<string>("");
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState<Record<number, string>>({});
  const [enviando, setEnviando] = useState(false);

  const lista = templates.data ?? [];
  const t = lista.find((x) => chave(x) === escolhido) ?? null;
  const n = t ? totalDeVariaveis(t) : 0;
  const exemplos = useMemo(() => (t ? exemplosDoCorpo(t) : []), [t]);
  const faltam = variaveisSemValor(n, valores);
  const previa = useMemo(() => (t ? previaDeAprovado(t, valores) : null), [t, valores]);
  const pronto = Boolean(t) && faltam.length === 0 && !enviando;

  // Sugere o nome do contato na primeira variável: é o uso mais comum e poupa digitação.
  useEffect(() => {
    setValores(n >= 1 && props.nomeProprio ? { 1: props.nomeProprio } : {});
  }, [escolhido, n, props.nomeProprio]);

  async function enviar() {
    if (!t || !pronto) return;
    setEnviando(true);
    try {
      const mapa: Record<string, string> = {};
      for (const [k, v] of Object.entries(valores)) mapa[k] = v;
      const r = await props.onEnviar({
        data: { conversaId: props.conversa.id, nome: t.name, idioma: t.language, valores: mapa },
      });
      if (!r.ok) {
        props.aoRecusar(r);
        return;
      }
      toast.success("Template enviado.");
      setEscolhido("");
      qc.invalidateQueries({ queryKey: chaves.mensagens(props.conversa.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  // Teto de 60% da altura: no celular o cartão ocupava quase a tela toda e escondia a conversa.
  return (
    <div className="max-h-[60dvh] overflow-y-auto border-t bg-[var(--superficie-tonal)] px-4 py-4">
      <div
        className="mx-auto w-full max-w-2xl space-y-4 rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_28px_-16px_rgb(15_23_42/0.18)]"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void enviar();
        }}
      >
        <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Timer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {props.avisoDaJanela}
        </p>

        {templates.isLoading && (
          <p className="text-sm text-muted-foreground">Carregando templates…</p>
        )}
        {!templates.isLoading && lista.length === 0 && (
          <p className="text-sm text-destructive">
            Nenhum template aprovado. Crie e aguarde a aprovação em Configurações › WhatsApp
            oficial.
          </p>
        )}

        {lista.length > 0 && (
          <>
            <Popover open={aberto} onOpenChange={setAberto}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Template"
                  aria-haspopup="listbox"
                  aria-expanded={aberto}
                  className={cn(
                    "flex h-11 w-full items-center gap-2.5 rounded-xl border bg-background px-3 text-left text-sm transition-colors",
                    "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    aberto && "border-primary/50 ring-2 ring-ring/30",
                  )}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {t ? (
                    <>
                      <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                      <Categoria valor={t.category} />
                    </>
                  ) : (
                    <span className="flex-1 text-muted-foreground">Escolher um template…</span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="top"
                sideOffset={8}
                className="w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-xl bg-popover p-0 shadow-xl ring-1 ring-border"
              >
                <Command>
                  {lista.length > 5 && <CommandInput placeholder="Buscar template…" />}
                  <CommandList className="max-h-72 p-1.5">
                    <CommandEmpty>Nenhum template com esse nome.</CommandEmpty>
                    {lista.map((x) => {
                      const ativo = chave(x) === escolhido;
                      return (
                        <CommandItem
                          key={x.id}
                          value={`${x.name} ${x.language} ${resumoDoCorpo(x)}`}
                          onSelect={() => {
                            setEscolhido(chave(x));
                            setAberto(false);
                          }}
                          className="items-start gap-3 rounded-lg px-2.5 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-medium">{x.name}</span>
                              <Categoria valor={x.category} />
                              <span className="shrink-0 text-[11px] text-muted-foreground">
                                {x.language}
                              </span>
                            </div>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {resumoDoCorpo(x)}
                            </p>
                          </div>
                          {ativo && <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
                        </CommandItem>
                      );
                    })}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {t && previa && (
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,19rem)]">
                <div className="space-y-3">
                  {n > 0 ? (
                    Array.from({ length: n }, (_, i) => i + 1).map((i) => (
                      <label key={i} className="block space-y-1">
                        <span className="text-xs font-medium text-foreground">
                          {i === 1 ? `Nome ou valor ${"{{1}}"}` : `Valor ${`{{${i}}}`}`}
                        </span>
                        <input
                          aria-label={`Variável ${i}`}
                          placeholder={
                            exemplos[i - 1] ? `ex.: ${exemplos[i - 1]}` : `Valor de {{${i}}}`
                          }
                          className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
                          value={valores[i] ?? ""}
                          onChange={(e) => setValores((v) => ({ ...v, [i]: e.target.value }))}
                        />
                      </label>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Este template não tem variáveis: está pronto para enviar.
                    </p>
                  )}
                </div>
                <PreviaDoTemplate previa={previa} />
              </div>
            )}

            {/* Fixo no rodapé do cartão: o botão não some quando a prévia é longa. */}
            <div className="sticky bottom-0 -mx-4 -mb-4 flex items-center justify-between gap-3 rounded-b-2xl border-t bg-card px-4 py-3">
              <p className="min-w-0 text-xs text-muted-foreground" aria-live="polite">
                {!t
                  ? "Escolha um template para ver a mensagem."
                  : faltam.length > 0
                    ? `Falta preencher ${faltam.map((i) => `{{${i}}}`).join(", ")}.`
                    : "Pronto para enviar. Ctrl+Enter também envia."}
              </p>
              <Button
                onClick={() => void enviar()}
                disabled={!pronto}
                className="h-10 shrink-0 rounded-xl px-5"
              >
                {enviando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Enviar template
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
