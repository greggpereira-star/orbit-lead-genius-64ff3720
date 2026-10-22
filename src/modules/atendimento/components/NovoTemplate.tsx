import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  FileText,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandItem, CommandList } from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { MODELOS_DE_TEMPLATE, type ModeloDeTemplate } from "@/lib/whatsapp/cloud/modelosDeTemplate";
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
  type PassoDoTemplate,
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

/** Os três passos. `itens` liga cada passo ao que o painel "Antes de enviar" cobra dele. */
const PASSOS: Array<{
  rotulo: string;
  titulo: string;
  texto: string;
  itens: PassoDoTemplate["chave"][];
}> = [
  {
    rotulo: "Identificação",
    titulo: "Como vai se chamar e para que serve",
    texto:
      "O nome identifica o template na Meta. A categoria define como ele é analisado e cobrado.",
    itens: ["nome"],
  },
  {
    rotulo: "Mensagem",
    titulo: "Escreva a mensagem",
    texto:
      "Use variáveis onde o valor muda e dê um exemplo de cada uma. A prévia mostra como fica.",
    itens: ["corpo", "exemplos"],
  },
  {
    rotulo: "Extras e revisão",
    titulo: "Adicione o que ajuda e confira",
    texto: "Cabeçalho, rodapé e botões são opcionais. Depois é só enviar para a Meta analisar.",
    itens: ["opcionais"],
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
  // Rascunho já tem nome: abre direto na mensagem.
  const [passo, setPasso] = useState(inicial ? 1 : 0);
  const [visitados, setVisitados] = useState<Set<number>>(new Set([inicial ? 1 : 0]));
  // Só depois da primeira tentativa de enviar os erros de campo vazio aparecem: ninguém é
  // repreendido por não ter escrito ainda.
  const [tentou, setTentou] = useState(false);
  const [abertos, setAbertos] = useState<Record<Opcional, boolean>>({
    cabecalho: (inicial?.def.cabecalho ?? "").trim() !== "",
    rodape: (inicial?.def.rodape ?? "").trim() !== "",
    botoes: (inicial?.def.botoes ?? []).length > 0,
  });
  const [modelosAberto, setModelosAberto] = useState(false);
  const corpoRef = useRef<HTMLTextAreaElement>(null);

  /** Navegação livre: qualquer passo, a qualquer hora. Nada bloqueia; o envio é que valida. */
  const irPara = (i: number) => {
    setPasso(i);
    setVisitados((v) => new Set(v).add(i));
  };

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

  function aplicarModelo(m: ModeloDeTemplate) {
    if (
      def.corpo.trim() !== "" &&
      !window.confirm("Trocar o texto atual pelo modelo? O que você escreveu será substituído.")
    )
      return;
    setDef((x) => ({
      ...x,
      nome: x.nome || m.def.nome,
      categoria: m.def.categoria,
      cabecalho: m.def.cabecalho ?? "",
      corpo: m.def.corpo,
      rodape: m.def.rodape ?? "",
      botoes: (m.def.botoes ?? []).map((b) => ({ ...b })),
      exemplosDoCorpo: [...(m.def.exemplosDoCorpo ?? [])],
    }));
    setAbertos({
      cabecalho: Boolean(m.def.cabecalho),
      rodape: Boolean(m.def.rodape),
      botoes: (m.def.botoes ?? []).length > 0,
    });
    setModelosAberto(false);
  }

  // A MESMA validação do servidor, em tempo real: o autor erra na tela, e não
  // depois de esperar a revisão da Meta.
  const problemas = validarTemplate(def);
  const variaveis = [...new Set(variaveisDe(def.corpo))].sort((a, b) => a - b);
  const nVars = variaveis.length;
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

  /** Estado de cada passo no indicador: ✓ pronto e já visto, ! pendente depois de tentar enviar. */
  const estadoDoPasso = (i: number): "ok" | "pendente" | "neutro" => {
    const pendente = passos.some((p) => !p.feito && PASSOS[i].itens.includes(p.chave));
    if (pendente) return tentou ? "pendente" : "neutro";
    return visitados.has(i) ? "ok" : "neutro";
  };

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
      setAbertos({ cabecalho: false, rodape: false, botoes: false });
      irPara(0);
      onCriado();
      onFechar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível criar o template.");
    } finally {
      setEnviando(false);
    }
  }

  /** O botão nunca fica apagado sem dizer por quê: se falta algo, leva ao passo e ao campo. */
  function tentarEnviar() {
    if (!temErro(problemas) && def.nome !== "") {
      void enviar();
      return;
    }
    setTentou(true);
    const primeiro = faltam[0]?.chave;
    const destino =
      primeiro === "nome" ? 0 : primeiro === "corpo" || primeiro === "exemplos" ? 1 : 2;
    irPara(destino);
    const alvo =
      primeiro === "nome"
        ? "t-nome"
        : primeiro === "corpo"
          ? "t-corpo"
          : primeiro === "exemplos"
            ? `t-ex-${Math.max(1, (def.exemplosDoCorpo ?? []).findIndex((e) => !e?.trim()) + 1 || 1)}`
            : null;
    if (alvo)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.getElementById(alvo)?.focus()),
      );
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

  const atual = PASSOS[passo];

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="flex h-[min(780px,92dvh)] max-w-[min(1120px,96vw)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="space-y-3 border-b px-6 pb-4 pt-5 [@media(max-height:720px)]:space-y-2 [@media(max-height:720px)]:pb-3 [@media(max-height:720px)]:pt-4">
          <div className="space-y-1 pr-8">
            <DialogTitle>{rascunhoId ? "Continuar template" : "Novo template"}</DialogTitle>
            <DialogDescription className="[@media(max-height:720px)]:hidden">
              Escreva a mensagem e envie para a Meta analisar. Costuma levar minutos.
              {contaRotulo && (
                <>
                  {" "}
                  Será criado na conta{" "}
                  <span className="font-medium text-foreground">{contaRotulo}</span>.
                </>
              )}
            </DialogDescription>
          </div>
          <nav aria-label="Passos do cadastro" className="flex flex-wrap gap-2">
            {PASSOS.map((p, i) => {
              const estado = estadoDoPasso(i);
              return (
                <button
                  key={p.rotulo}
                  type="button"
                  aria-current={i === passo ? "step" : undefined}
                  onClick={() => irPara(i)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
                    i === passo
                      ? "border-primary bg-primary/5 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                      estado === "ok" && "bg-[var(--sucesso)]/15 text-[var(--sucesso)]",
                      estado === "pendente" && "bg-destructive/10 text-destructive",
                      estado === "neutro" &&
                        (i === passo ? "bg-primary text-primary-foreground" : "bg-muted"),
                    )}
                  >
                    {estado === "ok" ? (
                      <Check className="h-3 w-3" />
                    ) : estado === "pendente" ? (
                      "!"
                    ) : (
                      i + 1
                    )}
                  </span>
                  {p.rotulo}
                </button>
              );
            })}
          </nav>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 max-md:overflow-y-auto md:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-h-0 flex-col gap-5 p-6 md:overflow-y-auto [@media(max-height:720px)]:gap-3 [@media(max-height:720px)]:p-4">
            <div className="space-y-0.5">
              <h3 className="text-base font-semibold">{atual.titulo}</h3>
              <p className="text-sm text-muted-foreground [@media(max-height:720px)]:hidden">
                {atual.texto}
              </p>
            </div>

            {passo === 0 && (
              <div className="space-y-6">
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        irPara(1);
                      }
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    É o nome que fica na Meta: só minúsculas, números e sublinhado. Espaços viram _.
                  </p>
                  <Mensagens itens={doCampo("nome")} />
                </div>

                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium leading-none">Categoria</legend>
                  <div className="grid gap-3 pt-1.5 sm:grid-cols-2">
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
                        <span className="flex h-full flex-col gap-1 rounded-xl border p-4 transition-colors hover:bg-muted/40 peer-checked:border-primary peer-checked:bg-primary/5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                          <span className="flex items-center justify-between text-sm font-medium">
                            {c.titulo}
                            {def.categoria === c.valor && (
                              <Check className="h-4 w-4 text-primary" />
                            )}
                          </span>
                          <span className="text-xs leading-relaxed text-muted-foreground">
                            {c.texto}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground [@media(max-height:720px)]:hidden">
                    Marketing costuma custar bem mais por mensagem que Utilidade (veja a tabela de
                    preços da Meta). Idioma da mensagem: {IDIOMAS[def.idioma] ?? def.idioma}.
                  </p>
                </fieldset>
              </div>
            )}

            {passo === 1 && (
              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="toolbar"
                  aria-label="Formatação"
                >
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
                  <Popover open={modelosAberto} onOpenChange={setModelosAberto}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="ml-auto h-8 gap-1.5 px-3 text-xs"
                      >
                        <FileText className="h-3.5 w-3.5" /> Modelos
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      align="end"
                      className="w-80 overflow-hidden rounded-xl bg-popover p-0 shadow-xl ring-1 ring-border"
                    >
                      <Command>
                        <CommandList className="max-h-80 p-1.5">
                          <CommandEmpty>Nenhum modelo.</CommandEmpty>
                          {MODELOS_DE_TEMPLATE.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={`${m.titulo} ${m.descricao}`}
                              className="flex-col items-start gap-0.5 py-2.5"
                              onSelect={() => aplicarModelo(m)}
                            >
                              <span className="text-sm font-medium">{m.titulo}</span>
                              <span className="text-xs text-muted-foreground">{m.descricao}</span>
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex min-h-[170px] flex-1 flex-col gap-1.5">
                  <Label htmlFor="t-corpo" className="sr-only">
                    Texto que o cliente vai receber
                  </Label>
                  <Textarea
                    id="t-corpo"
                    ref={corpoRef}
                    value={def.corpo}
                    placeholder="Olá {{1}}, recebemos seu pedido {{2}}."
                    aria-invalid={comErro("corpo")}
                    className="min-h-[110px] flex-1 resize-none text-[15px] leading-relaxed"
                    onChange={(e) => setDef({ ...def, corpo: e.target.value })}
                  />
                  <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
                    <span>
                      Use {"{{1}}"}, {"{{2}}"}… onde o valor muda (nome do cliente, número do
                      pedido).
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
                  {def.corpo.trim() === "" && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">Começar de um modelo:</span>
                      {MODELOS_DE_TEMPLATE.map((m) => (
                        <Button
                          key={m.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full px-3 text-xs"
                          onClick={() => aplicarModelo(m)}
                        >
                          {m.titulo}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                {nVars > 0 && (
                  <div className="space-y-2.5 rounded-xl border bg-muted/30 p-4">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Variáveis e exemplos</p>
                      <p className="text-xs text-muted-foreground [@media(max-height:720px)]:hidden">
                        A Meta pede um exemplo de cada variável para aprovar. Ele só aparece na
                        prévia, não vai para o cliente. Toque na variável para inseri-la no texto.
                      </p>
                    </div>
                    <div className="max-h-[min(132px,18dvh)] space-y-2 overflow-y-auto pr-1">
                      {variaveis.map((n, i) => (
                        <div
                          key={n}
                          className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3"
                        >
                          <button
                            type="button"
                            className="rounded-md bg-primary/10 px-2 py-1.5 text-center font-mono text-xs font-medium text-primary hover:bg-primary/15"
                            aria-label={`Inserir variável ${n} no texto`}
                            onClick={() =>
                              aplicarNoCorpo((t, a, b) => {
                                const txt = `{{${n}}}`;
                                return {
                                  texto: t.slice(0, a) + txt + t.slice(b),
                                  cursor: [a + txt.length, a + txt.length],
                                };
                              })
                            }
                          >
                            {`{{${n}}}`}
                          </button>
                          <Input
                            id={`t-ex-${i + 1}`}
                            aria-label={`Exemplo da variável ${n}`}
                            placeholder={i === 0 ? "Ex.: Ana" : "Ex.: 12345"}
                            className="h-9"
                            value={def.exemplosDoCorpo?.[i] ?? ""}
                            onChange={(e) => {
                              const ex = [...(def.exemplosDoCorpo ?? [])];
                              ex[i] = e.target.value;
                              setDef({ ...def, exemplosDoCorpo: ex });
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <Mensagens itens={doCampo("exemplos")} />
                  </div>
                )}
              </div>
            )}

            {passo === 2 && (
              <div className="space-y-5">
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
                                if (resto.length === 0)
                                  setAbertos((a) => ({ ...a, botoes: false }));
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          {b.tipo !== "QUICK_REPLY" && (
                            <Input
                              aria-label={`Valor do botão ${i + 1}`}
                              placeholder={
                                b.tipo === "URL"
                                  ? "https://seusite.com.br/pedido"
                                  : "+5527999990000"
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
              </div>
            )}
          </div>

          <aside className="flex min-h-0 flex-col gap-3 border-t bg-muted/30 p-6 md:overflow-y-auto md:border-l md:border-t-0 [@media(max-height:720px)]:p-4">
            <p className="text-sm font-medium">Como o cliente vê</p>
            <PreviaDoTemplate previa={previaDoTemplate(def)} />
            {/* No último passo o espaço é da lista "Antes de enviar": a nota sai para ela caber sem rolar. */}
            {passo !== 2 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Aproximação da mensagem. Os exemplos das variáveis entram no lugar de {"{{n}}"}.
              </p>
            )}
            {passo === 2 && (
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
            )}
          </aside>
        </div>

        <DialogFooter className="gap-3 border-t px-6 py-4 [@media(max-height:720px)]:py-3 sm:items-center sm:justify-between sm:space-x-0">
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
            {passo > 0 && (
              <Button variant="outline" className="gap-1.5" onClick={() => irPara(passo - 1)}>
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
            )}
            {passo < PASSOS.length - 1 ? (
              <Button className="gap-1.5" onClick={() => irPara(passo + 1)}>
                Próximo: {PASSOS[passo + 1].rotulo.toLowerCase()} <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={enviando} onClick={tentarEnviar}>
                {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar para análise
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
