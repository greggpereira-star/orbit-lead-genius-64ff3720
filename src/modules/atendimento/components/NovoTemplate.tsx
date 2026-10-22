import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, Circle, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  criarTemplateWhatsApp,
  salvarRascunhoTemplateWhatsApp,
} from "@/lib/whatsapp-cloud.functions";
import { envolverSelecao, inserirVariavel, previaDoTemplate } from "@/lib/whatsapp/cloud/previa";
import {
  LIMITES,
  normalizarNomeDoTemplate,
  passosDoTemplate,
  temErro,
  validarTemplate,
  variaveisDe,
  type BotaoDeTemplate,
  type DefinicaoDeTemplate,
  type Problema,
} from "@/lib/whatsapp/cloud/templates";
import { PreviaDoTemplate } from "./PreviaDoTemplate";

export const DEFINICAO_VAZIA: DefinicaoDeTemplate = {
  nome: "",
  idioma: "pt_BR",
  categoria: "UTILITY",
  cabecalho: "",
  corpo: "",
  rodape: "",
  botoes: [],
  exemplosDoCorpo: [],
};

const CATEGORIAS: Array<{
  valor: DefinicaoDeTemplate["categoria"];
  titulo: string;
  texto: string;
}> = [
  {
    valor: "UTILITY",
    titulo: "Utilidade",
    texto:
      "Aviso ligado a algo que o cliente fez ou pediu: pedido, entrega, agendamento, cobrança. Sem oferta nem promoção.",
  },
  {
    valor: "MARKETING",
    titulo: "Marketing",
    texto:
      "Oferta, promoção, cupom, lançamento ou convite para comprar. Mensagem que mistura aviso e oferta também conta como Marketing.",
  },
];

const IDIOMAS: Record<string, string> = { pt_BR: "Português (Brasil)" };

const TIPOS_DE_BOTAO: Array<{ valor: BotaoDeTemplate["tipo"]; rotulo: string; ajuda: string }> = [
  {
    valor: "QUICK_REPLY",
    rotulo: "Resposta rápida",
    ajuda: "O cliente toca e a resposta chega na conversa.",
  },
  {
    valor: "URL",
    rotulo: "Abrir link",
    ajuda: "Abre um site. A URL precisa começar com https://.",
  },
  {
    valor: "PHONE_NUMBER",
    rotulo: "Ligar",
    ajuda: "Liga para um número, no formato +5527999990000.",
  },
];

type Opcional = "cabecalho" | "rodape" | "botoes";

/** Mensagens de um campo, logo abaixo dele (e não numa lista lá no fim do formulário). */
function Mensagens({ itens }: { itens: Problema[] }) {
  if (itens.length === 0) return null;
  return (
    <ul className="space-y-1" aria-live="polite">
      {itens.map((p, i) => (
        <li
          key={i}
          className={cn(
            "flex gap-1.5 text-sm leading-snug",
            p.gravidade === "erro" ? "text-destructive" : "text-[var(--aviso)]",
          )}
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {p.texto}
        </li>
      ))}
    </ul>
  );
}

function Secao(props: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t pt-6 first:border-t-0 first:pt-0">
      <div className="space-y-0.5">
        <h3 className="text-sm font-semibold">{props.titulo}</h3>
        {props.descricao && <p className="text-sm text-muted-foreground">{props.descricao}</p>}
      </div>
      {props.children}
    </section>
  );
}

export function NovoTemplate({
  aberto,
  inicial,
  accountId,
  contaRotulo,
  onFechar,
  onCriado,
}: {
  aberto: boolean;
  inicial: { id: string; def: DefinicaoDeTemplate } | null;
  /** Conta (WABA) que vai receber o template. */
  accountId: string | undefined;
  /** Números da conta, para dizer onde o template será criado quando há mais de uma. */
  contaRotulo?: string;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const criar = useServerFn(criarTemplateWhatsApp);
  const salvarRascunho = useServerFn(salvarRascunhoTemplateWhatsApp);
  const [def, setDef] = useState<DefinicaoDeTemplate>(inicial?.def ?? DEFINICAO_VAZIA);
  // Id do rascunho em edição: o primeiro "Salvar rascunho" o cria, os seguintes atualizam.
  const [rascunhoId, setRascunhoId] = useState<string | null>(inicial?.id ?? null);
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // Só depois da primeira tentativa de enviar os erros de campo vazio aparecem: ninguém é
  // repreendido por não ter escrito ainda.
  const [tentou, setTentou] = useState(false);
  const [abertos, setAbertos] = useState<Record<Opcional, boolean>>({
    cabecalho: (inicial?.def.cabecalho ?? "").trim() !== "",
    rodape: (inicial?.def.rodape ?? "").trim() !== "",
    botoes: (inicial?.def.botoes ?? []).length > 0,
  });
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  async function guardarRascunho() {
    setSalvando(true);
    try {
      const r = await salvarRascunho({
        data: { ...(rascunhoId ? { id: rascunhoId } : {}), definicao: def },
      });
      setRascunhoId(r.id);
      toast.success("Rascunho salvo.");
      onCriado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar o rascunho.");
    } finally {
      setSalvando(false);
    }
  }

  /** Aplica a barra de ferramentas ao corpo, mantendo seleção e cursor. */
  function aplicarNoCorpo(
    f: (texto: string, ini: number, fim: number) => { texto: string; cursor: [number, number] },
  ) {
    const el = corpoRef.current;
    const ini = el?.selectionStart ?? def.corpo.length;
    const fim = el?.selectionEnd ?? def.corpo.length;
    const r = f(def.corpo, ini, fim);
    setDef((x) => ({ ...x, corpo: r.texto }));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(r.cursor[0], r.cursor[1]);
    });
  }

  // A MESMA validação do servidor, em tempo real: o autor erra na tela, e não
  // depois de esperar a revisão da Meta.
  const problemas = validarTemplate(def);
  const nVars = new Set(variaveisDe(def.corpo)).size;
  const passos = passosDoTemplate(def, problemas);
  const faltam = passos.filter((p) => !p.feito);

  const temConteudo = (campo: Problema["campo"]) => {
    switch (campo) {
      case "nome":
        return def.nome !== "";
      case "corpo":
        return def.corpo !== "";
      case "cabecalho":
        return (def.cabecalho ?? "") !== "";
      case "rodape":
        return (def.rodape ?? "") !== "";
      case "botoes":
        return (def.botoes ?? []).length > 0;
      case "exemplos":
        return (def.exemplosDoCorpo ?? []).some((e) => e.trim() !== "");
      default:
        return false;
    }
  };
  const doCampo = (campo: Problema["campo"]) =>
    problemas.filter((p) => p.campo === campo && (tentou || temConteudo(campo)));
  const comErro = (campo: Problema["campo"]) => doCampo(campo).some((p) => p.gravidade === "erro");

  async function enviar() {
    setEnviando(true);
    try {
      const r = await criar({
        data: {
          ...def,
          ...(rascunhoId ? { rascunhoId } : {}),
          ...(accountId ? { accountId } : {}),
        },
      });
      if (!r.ok) {
        toast.error(r.texto);
        return;
      }
      toast.success(
        r.status === "APPROVED" ? "Template aprovado." : "Template enviado para análise da Meta.",
      );
      setDef(DEFINICAO_VAZIA);
      setRascunhoId(null);
      setTentou(false);
      onCriado();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o template.");
    } finally {
      setEnviando(false);
    }
  }

  /** O botão nunca fica apagado sem dizer por quê: se falta algo, mostra e leva ao campo. */
  function tentarEnviar() {
    if (!temErro(problemas) && def.nome !== "") {
      void enviar();
      return;
    }
    setTentou(true);
    const primeiro = faltam[0]?.chave;
    const alvo =
      primeiro === "nome"
        ? "t-nome"
        : primeiro === "corpo"
          ? "t-corpo"
          : primeiro === "exemplos"
            ? `t-ex-${Math.max(1, (def.exemplosDoCorpo ?? []).findIndex((e) => !e?.trim()) + 1 || 1)}`
            : null;
    if (alvo) requestAnimationFrame(() => document.getElementById(alvo)?.focus());
  }

  const setBotao = (i: number, b: Partial<BotaoDeTemplate>) =>
    setDef((x) => ({
      ...x,
      botoes: (x.botoes ?? []).map((o, j) => (j === i ? { ...o, ...b } : o)),
    }));

  const abrir = (k: Opcional) => {
    setAbertos((a) => ({ ...a, [k]: true }));
    if (k === "botoes" && (def.botoes ?? []).length === 0)
      setDef((x) => ({ ...x, botoes: [{ tipo: "QUICK_REPLY", texto: "" }] }));
  };
  const remover = (k: Opcional) => {
    setAbertos((a) => ({ ...a, [k]: false }));
    setDef((x) =>
      k === "cabecalho"
        ? { ...x, cabecalho: "" }
        : k === "rodape"
          ? { ...x, rodape: "" }
          : { ...x, botoes: [] },
    );
  };

  const fechadas = (
    [
      ["cabecalho", "Cabeçalho"],
      ["rodape", "Rodapé"],
      ["botoes", "Botões"],
    ] as const
  ).filter(([k]) => !abertos[k]);

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rascunhoId ? "Continuar template" : "Novo template"}</DialogTitle>
          <DialogDescription>
            Escreva a mensagem e envie para a Meta analisar. Costuma levar minutos.
            {contaRotulo && (
              <>
                {" "}
                Será criado na conta{" "}
                <span className="font-medium text-foreground">{contaRotulo}</span>.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <Secao titulo="Identificação">
              <div className="space-y-1.5">
                <Label htmlFor="t-nome">Nome do template</Label>
                <Input
                  id="t-nome"
                  value={def.nome}
                  placeholder="boas_vindas_v1"
                  autoComplete="off"
                  aria-invalid={comErro("nome")}
                  onChange={(e) =>
                    setDef({ ...def, nome: normalizarNomeDoTemplate(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  É o nome que fica na Meta: só minúsculas, números e sublinhado. Espaços viram _.
                </p>
                <Mensagens itens={doCampo("nome")} />
              </div>

              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium leading-none">Categoria</legend>
                <div className="grid gap-2 pt-1.5 sm:grid-cols-2">
                  {CATEGORIAS.map((c) => (
                    <label key={c.valor} className="cursor-pointer">
                      <input
                        type="radio"
                        name="t-categoria"
                        value={c.valor}
                        checked={def.categoria === c.valor}
                        onChange={() => setDef({ ...def, categoria: c.valor })}
                        className="peer sr-only"
                      />
                      <span className="flex h-full flex-col gap-1 rounded-xl border p-3.5 transition-colors hover:bg-muted/40 peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                        <span className="flex items-center justify-between text-sm font-medium">
                          {c.titulo}
                          {def.categoria === c.valor && <Check className="h-4 w-4 text-primary" />}
                        </span>
                        <span className="text-xs leading-relaxed text-muted-foreground">
                          {c.texto}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Marketing costuma custar bem mais por mensagem que Utilidade (veja a tabela de
                  preços da Meta). Idioma da mensagem: {IDIOMAS[def.idioma] ?? def.idioma}.
                </p>
              </fieldset>
            </Secao>

            <Secao titulo="Mensagem">
              <div className="space-y-1.5">
                <Label htmlFor="t-corpo">Texto que o cliente vai receber</Label>
                <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Formatação">
                  {[
                    { rotulo: "Negrito", marca: "*", ico: "B", cls: "font-bold" },
                    { rotulo: "Itálico", marca: "_", ico: "I", cls: "italic" },
                    { rotulo: "Tachado", marca: "~", ico: "S", cls: "line-through" },
                    { rotulo: "Monoespaçado", marca: "```", ico: "</>", cls: "font-mono" },
                  ].map((f) => (
                    <Button
                      key={f.marca}
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`h-8 w-9 px-0 ${f.cls}`}
                      aria-label={f.rotulo}
                      title={f.rotulo}
                      onClick={() => aplicarNoCorpo((t, a, b) => envolverSelecao(t, a, b, f.marca))}
                    >
                      {f.ico}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-3 text-xs"
                    onClick={() =>
                      aplicarNoCorpo((t, a, b) => {
                        const r = inserirVariavel(t, a, b);
                        return { texto: r.texto, cursor: [r.cursor, r.cursor] };
                      })
                    }
                  >
                    <Plus className="h-3.5 w-3.5" /> Variável
                  </Button>
                </div>
                <Textarea
                  id="t-corpo"
                  ref={corpoRef}
                  rows={6}
                  value={def.corpo}
                  placeholder="Olá {{1}}, recebemos seu pedido {{2}}."
                  aria-invalid={comErro("corpo")}
                  onChange={(e) => setDef({ ...def, corpo: e.target.value })}
                />
                <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Use {"{{1}}"}, {"{{2}}"}… onde o valor muda (nome do cliente, número do pedido).
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      def.corpo.length > LIMITES.corpo && "text-destructive",
                    )}
                  >
                    {def.corpo.length}/{LIMITES.corpo}
                  </span>
                </div>
                <Mensagens itens={doCampo("corpo")} />
              </div>

              {nVars > 0 && (
                <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Exemplo de cada variável</p>
                    <p className="text-xs text-muted-foreground">
                      A Meta pede um valor de exemplo para aprovar. Ele só aparece na
                      pré-visualização, não vai para o cliente.
                    </p>
                  </div>
                  {Array.from({ length: nVars }, (_, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-3"
                    >
                      <Label htmlFor={`t-ex-${i + 1}`} className="font-mono text-xs">
                        {`{{${i + 1}}}`}
                      </Label>
                      <Input
                        id={`t-ex-${i + 1}`}
                        placeholder={i === 0 ? "Ex.: Ana" : "Ex.: 12345"}
                        value={def.exemplosDoCorpo?.[i] ?? ""}
                        onChange={(e) => {
                          const ex = [...(def.exemplosDoCorpo ?? [])];
                          ex[i] = e.target.value;
                          setDef({ ...def, exemplosDoCorpo: ex });
                        }}
                      />
                    </div>
                  ))}
                  <Mensagens itens={doCampo("exemplos")} />
                </div>
              )}
            </Secao>

            <Secao
              titulo="Opcionais"
              descricao="Só o que ajuda o cliente. Cada parte aparece quando você a adiciona."
            >
              {fechadas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {fechadas.map(([k, rotulo]) => (
                    <Button
                      key={k}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 gap-1.5 rounded-full px-3.5"
                      onClick={() => abrir(k)}
                    >
                      <Plus className="h-3.5 w-3.5" /> {rotulo}
                    </Button>
                  ))}
                </div>
              )}

              {abertos.cabecalho && (
                <div className="space-y-1.5 rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="t-cab">Cabeçalho</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Remover cabeçalho"
                      onClick={() => remover("cabecalho")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    id="t-cab"
                    maxLength={LIMITES.cabecalho}
                    value={def.cabecalho ?? ""}
                    placeholder="Ex.: Seu pedido"
                    aria-invalid={comErro("cabecalho")}
                    onChange={(e) => setDef({ ...def, cabecalho: e.target.value })}
                  />
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>Título em destaque no topo, só texto, sem emoji.</span>
                    <span className="tabular-nums">
                      {(def.cabecalho ?? "").length}/{LIMITES.cabecalho}
                    </span>
                  </div>
                  <Mensagens itens={doCampo("cabecalho")} />
                </div>
              )}

              {abertos.rodape && (
                <div className="space-y-1.5 rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="t-rod">Rodapé</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Remover rodapé"
                      onClick={() => remover("rodape")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    id="t-rod"
                    maxLength={LIMITES.rodape}
                    value={def.rodape ?? ""}
                    placeholder="Ex.: Alt Flow"
                    aria-invalid={comErro("rodape")}
                    onChange={(e) => setDef({ ...def, rodape: e.target.value })}
                  />
                  <div className="flex justify-between gap-3 text-xs text-muted-foreground">
                    <span>Linha pequena no fim da mensagem. Não aceita variáveis.</span>
                    <span className="tabular-nums">
                      {(def.rodape ?? "").length}/{LIMITES.rodape}
                    </span>
                  </div>
                  <Mensagens itens={doCampo("rodape")} />
                </div>
              )}

              {abertos.botoes && (
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <Label>Botões</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label="Remover todos os botões"
                      onClick={() => remover("botoes")}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {(def.botoes ?? []).map((b, i) => {
                    const tipo = TIPOS_DE_BOTAO.find((t) => t.valor === b.tipo);
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="grid items-center gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                          <Select
                            value={b.tipo}
                            onValueChange={(v) =>
                              setBotao(i, { tipo: v as BotaoDeTemplate["tipo"] })
                            }
                          >
                            <SelectTrigger aria-label={`Tipo do botão ${i + 1}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TIPOS_DE_BOTAO.map((t) => (
                                <SelectItem key={t.valor} value={t.valor}>
                                  {t.rotulo}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            aria-label={`Texto do botão ${i + 1}`}
                            placeholder="Texto do botão"
                            maxLength={LIMITES.textoDoBotao}
                            value={b.texto}
                            onChange={(e) => setBotao(i, { texto: e.target.value })}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover botão ${i + 1}`}
                            onClick={() => {
                              const resto = (def.botoes ?? []).filter((_, j) => j !== i);
                              setDef({ ...def, botoes: resto });
                              if (resto.length === 0) setAbertos((a) => ({ ...a, botoes: false }));
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        {b.tipo !== "QUICK_REPLY" && (
                          <Input
                            aria-label={`Valor do botão ${i + 1}`}
                            placeholder={
                              b.tipo === "URL" ? "https://seusite.com.br/pedido" : "+5527999990000"
                            }
                            value={b.valor ?? ""}
                            onChange={(e) => setBotao(i, { valor: e.target.value })}
                          />
                        )}
                        {tipo && <p className="text-xs text-muted-foreground">{tipo.ajuda}</p>}
                      </div>
                    );
                  })}
                  {(def.botoes ?? []).length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      onClick={() =>
                        setDef({
                          ...def,
                          botoes: [...(def.botoes ?? []), { tipo: "QUICK_REPLY", texto: "" }],
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5" /> Outro botão
                    </Button>
                  )}
                  <Mensagens itens={doCampo("botoes")} />
                </div>
              )}
            </Secao>
          </div>

          <aside className="space-y-5 self-start md:sticky md:top-0">
            <div className="space-y-2">
              <p className="text-sm font-medium">Como o cliente vê</p>
              <PreviaDoTemplate previa={previaDoTemplate(def)} />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Aproximação da mensagem. Os exemplos das variáveis entram no lugar de {"{{n}}"}.
              </p>
            </div>

            <div className="space-y-2.5 rounded-xl border p-4" aria-live="polite">
              <p className="text-sm font-medium">Antes de enviar</p>
              <ul className="space-y-2">
                {passos.map((p) => (
                  <li key={p.chave} className="flex items-center gap-2 text-sm">
                    {p.feito ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--sucesso)]/15 text-[var(--sucesso)]">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground/60" />
                    )}
                    <span className={cn(!p.feito && "text-muted-foreground")}>{p.rotulo}</span>
                  </li>
                ))}
              </ul>
              {faltam.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Tudo pronto. A Meta analisa e avisa o resultado aqui.
                </p>
              )}
            </div>
          </aside>
        </div>

        <DialogFooter className="gap-3 border-t pt-4 sm:items-center sm:justify-between sm:space-x-0">
          <p aria-live="polite" className="min-h-5 text-sm text-destructive">
            {tentou && faltam.length > 0
              ? `Falta: ${faltam.map((p) => p.rotulo.toLowerCase()).join(", ")}.`
              : ""}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button variant="outline" disabled={salvando || enviando} onClick={guardarRascunho}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar rascunho
            </Button>
            <Button disabled={enviando} onClick={tentarEnviar}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar para análise
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
