import { useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { estadoEfetivo, pedeAtencao, type Conexao } from "@/lib/whatsapp/cloud/conexoes";
import type { ValidadeDoToken } from "@/lib/whatsapp/cloud/validadeDoToken";
import type { NivelDeEnvio, SaudeDaConexao } from "@/lib/whatsapp/cloud/saudeDoNumero";
import { SeloDeEstado } from "./CartaoDeConexao";

const data = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const dataEHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b py-3 last:border-b-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{rotulo}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{children}</dd>
    </div>
  );
}

const COR_DO_ENVIO: Record<NivelDeEnvio, string> = {
  ok: "bg-[var(--sucesso)]/15 text-[var(--sucesso)]",
  limitado: "bg-[var(--aviso)]/15 text-[var(--aviso)]",
  bloqueado: "bg-destructive/10 text-destructive",
  desconhecido: "bg-muted text-muted-foreground",
};

function CartaoDeSaude(props: {
  titulo: string;
  selo: string;
  classeDoSelo: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-xl border bg-background p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{props.titulo}</h3>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", props.classeDoSelo)}>
          {props.selo}
        </span>
      </div>
      {props.children}
    </section>
  );
}

const COR_DA_VALIDADE: Record<ValidadeDoToken["nivel"], string> = {
  ok: COR_DO_ENVIO.ok,
  vence_logo: COR_DO_ENVIO.limitado,
  expirado: COR_DO_ENVIO.bloqueado,
  desconhecido: COR_DO_ENVIO.desconhecido,
};

function AbaSaude(props: {
  validade: ValidadeDoToken | null;
  validadeErro: string | null;
  saude: SaudeDaConexao | null;
  carregando: boolean;
  erro: string | null;
  onAtualizar: () => void;
}) {
  const { saude } = props;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Lida da Meta agora. O que a Meta diz sobre o número aparece em inglês, como ela mandou.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          onClick={props.onAtualizar}
          disabled={props.carregando}
        >
          {props.carregando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Atualizar
        </Button>
      </div>

      {props.validade && (
        <CartaoDeSaude
          titulo="Acesso (token)"
          selo={props.validade.rotulo}
          classeDoSelo={COR_DA_VALIDADE[props.validade.nivel]}
        >
          <p className="text-sm text-muted-foreground">{props.validade.descricao}</p>
          {props.validade.escoposFaltando.length > 0 && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              Faltam permissões neste token: {props.validade.escoposFaltando.join(", ")}. Sem elas a
              Meta recusa o envio (erro #131005, "Access denied"). Gere o token de novo marcando
              essas permissões.
            </p>
          )}
          {props.validade.escopos.length > 0 && (
            <p className="break-words text-xs text-muted-foreground">
              Permissões do token: {props.validade.escopos.join(", ")}
            </p>
          )}
        </CartaoDeSaude>
      )}
      {!props.validade && props.validadeErro && (
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Não consegui medir a validade do token: {props.validadeErro}
        </p>
      )}

      {props.erro && (
        <p className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
          Não consegui ler a saúde na Meta: {props.erro}
        </p>
      )}

      {!saude && !props.erro && (
        <p className="text-sm text-muted-foreground">
          {props.carregando ? "Consultando a Meta…" : "Sem dados."}
        </p>
      )}

      {saude && (
        <>
          <CartaoDeSaude
            titulo="Status do número"
            selo={saude.status.rotulo}
            classeDoSelo={
              saude.status.nivel === "ok"
                ? COR_DO_ENVIO.ok
                : saude.status.nivel === "aviso"
                  ? COR_DO_ENVIO.limitado
                  : saude.status.nivel === "erro"
                    ? COR_DO_ENVIO.bloqueado
                    : COR_DO_ENVIO.desconhecido
            }
          >
            <p className="text-sm text-muted-foreground">
              {saude.status.dica ??
                (saude.status.nivel === "ok"
                  ? "O número está conectado na Meta."
                  : "A Meta não informou o status do número.")}
            </p>
          </CartaoDeSaude>

          <CartaoDeSaude
            titulo="Qualidade"
            selo={saude.qualidade.rotulo}
            classeDoSelo={
              saude.qualidade.nivel === "alta"
                ? COR_DO_ENVIO.ok
                : saude.qualidade.nivel === "media"
                  ? COR_DO_ENVIO.limitado
                  : saude.qualidade.nivel === "baixa"
                    ? COR_DO_ENVIO.bloqueado
                    : COR_DO_ENVIO.desconhecido
            }
          >
            <p className="text-sm text-muted-foreground">{saude.qualidade.descricao}</p>
            {saude.limite && (
              <p className="pt-1 text-sm">
                <span className="text-muted-foreground">Limite de envio: </span>
                <span className="font-medium">{saude.limite}</span>
              </p>
            )}
          </CartaoDeSaude>

          <CartaoDeSaude
            titulo="Envio de mensagens"
            selo={saude.envio.rotulo}
            classeDoSelo={COR_DO_ENVIO[saude.envio.nivel]}
          >
            <p className="text-sm text-muted-foreground">{saude.envio.descricao}</p>
            {saude.envio.pontos.length > 0 && (
              <ul className="space-y-2 pt-2">
                {saude.envio.pontos.map((p, i) => (
                  <li key={i} className="rounded-lg bg-muted/50 p-3 text-sm">
                    <span className="text-xs font-medium text-muted-foreground">{p.origem}</span>
                    <p className="mt-0.5">{p.texto}</p>
                    {p.solucao && (
                      <p className="mt-1 text-muted-foreground">
                        <span className="font-medium text-foreground">O que fazer: </span>
                        {p.solucao}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CartaoDeSaude>

          <p className="rounded-xl border bg-muted/30 p-4 text-sm leading-relaxed text-muted-foreground">
            A Meta pode limitar ou bloquear o envio de contas com qualidade baixa ou com pendências
            no cadastro. Manter a qualidade alta e o cadastro em dia evita as duas coisas.
          </p>
        </>
      )}
    </div>
  );
}

/** Detalhe de uma conexão. Presentacional: a página busca os dados e passa tudo pronto. */
export function DetalheDaConexao(props: {
  conexao: Conexao;
  saude: SaudeDaConexao | null;
  saudeCarregando: boolean;
  saudeErro: string | null;
  validade: ValidadeDoToken | null;
  validadeErro: string | null;
  onVoltar: () => void;
  onAtualizarSaude: () => void;
}) {
  const { conexao: c, saude } = props;
  const [aba, setAba] = useState("sobre");
  const [copiado, setCopiado] = useState(false);
  const estado = estadoEfetivo(c, saude);
  const atencao = pedeAtencao(saude);

  function copiar() {
    if (!c.telefone) return;
    void navigator.clipboard
      ?.writeText(c.telefone)
      .then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1500);
      })
      .catch(() => toast.error("Não consegui copiar o número."));
  }

  const textoDaFaixa = !saude
    ? ""
    : saude.envio.nivel === "bloqueado"
      ? "A Meta bloqueou o envio desta conexão. Veja o motivo e o que fazer na aba Saúde da conta."
      : saude.status.nivel === "aviso" || saude.status.nivel === "erro"
        ? (saude.status.dica ?? saude.status.rotulo)
        : "Esta conexão tem restrições de uso, o que pode afetar o envio e o recebimento de mensagens.";

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-8 gap-1.5 text-muted-foreground"
          onClick={props.onVoltar}
        >
          <ArrowLeft className="h-4 w-4" /> Conexões
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{c.nome}</h2>
          <SeloDeEstado estado={estado} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {c.tipoRotulo} · {c.provedor}
          </span>
          {c.telefone && (
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums text-foreground">{c.telefone}</span>
              <button
                type="button"
                onClick={copiar}
                aria-label="Copiar número"
                className="rounded p-1 hover:bg-muted"
              >
                {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
          )}
        </div>
      </div>

      {atencao && saude && (
        <div className="flex gap-3 rounded-xl border border-[var(--aviso)]/40 bg-[var(--aviso)]/10 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--aviso)]" />
          <div className="space-y-2">
            <p className="text-sm font-semibold">Esta conexão precisa de atenção</p>
            <p className="text-sm leading-relaxed">{textoDaFaixa}</p>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAba("saude")}>
              Ver detalhes da saúde
            </Button>
          </div>
        </div>
      )}

      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="sobre">Sobre</TabsTrigger>
          {c.tipo === "oficial" && <TabsTrigger value="saude">Saúde da conta</TabsTrigger>}
        </TabsList>

        <TabsContent value="sobre" className="pt-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
            <section className="rounded-xl border bg-background px-5 py-2">
              <h3 className="py-3 text-sm font-semibold">Dados principais</h3>
              <dl>
                <Linha rotulo="Nome">{c.nome}</Linha>
                <Linha rotulo="Tipo de conexão">
                  {c.tipo === "oficial" ? "WhatsApp Business API (oficial)" : "WhatsApp (QR code)"}
                </Linha>
                <Linha rotulo="Provedor">{c.provedor}</Linha>
                <Linha rotulo="Telefone">{c.telefone ?? "—"}</Linha>
                {c.oficial && (
                  <>
                    <Linha rotulo="Modo">
                      {c.oficial.modo === "coexistence"
                        ? "Coexistência (continua no aplicativo do celular)"
                        : "Somente API"}
                    </Linha>
                    <Linha rotulo="Apenas receptivo">
                      {c.oficial.apenasReceptivo ? "Sim" : "Não"}
                    </Linha>
                    <Linha rotulo="ID do número">
                      <span className="font-mono text-xs">{c.oficial.phoneNumberId}</span>
                    </Linha>
                    <Linha rotulo="ID da conta (WABA)">
                      <span className="font-mono text-xs">{c.oficial.wabaId ?? "—"}</span>
                    </Linha>
                    <Linha rotulo="Recebimento de mensagens">
                      {c.oficial.webhookInscritoEm
                        ? `Ativo desde ${dataEHora(c.oficial.webhookInscritoEm)}`
                        : "Não ativado"}
                    </Linha>
                    {c.oficial.motivoDaDesconexao && (
                      <Linha rotulo="Motivo da desconexão">{c.oficial.motivoDaDesconexao}</Linha>
                    )}
                  </>
                )}
                {c.qr && (
                  <>
                    <Linha rotulo="Última conexão">{dataEHora(c.qr.ultimaConexaoEm)}</Linha>
                    {c.qr.ultimoErro && <Linha rotulo="Último erro">{c.qr.ultimoErro}</Linha>}
                  </>
                )}
              </dl>
            </section>
            <aside className="space-y-4">
              {c.oficial?.contaNome && (
                <section className="rounded-xl border bg-background p-5">
                  <h3 className="text-sm font-semibold">Conta conectada</h3>
                  <p className="mt-2 text-sm font-medium">{c.oficial.contaNome}</p>
                  {c.telefone && <p className="text-sm text-muted-foreground">{c.telefone}</p>}
                </section>
              )}
              <section className="rounded-xl border bg-background p-5">
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Conectada em</dt>
                    <dd className="text-sm font-medium">{data(c.criadaEm)}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        </TabsContent>

        {c.tipo === "oficial" && (
          <TabsContent value="saude" className="pt-4">
            <AbaSaude
              validade={props.validade}
              validadeErro={props.validadeErro}
              saude={saude}
              carregando={props.saudeCarregando}
              erro={props.saudeErro}
              onAtualizar={props.onAtualizarSaude}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
