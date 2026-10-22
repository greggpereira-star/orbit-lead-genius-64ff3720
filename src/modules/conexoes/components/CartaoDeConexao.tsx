import { AlertTriangle, Phone, ShieldCheck } from "lucide-react";
import { WhatsAppIcon } from "@/design-system/components/WhatsAppIcon";
import { cn } from "@/lib/utils";
import {
  estadoEfetivo,
  pedeAtencao,
  type Conexao,
  type EstadoDaConexao,
} from "@/lib/whatsapp/cloud/conexoes";
import type { SaudeDaConexao } from "@/lib/whatsapp/cloud/saudeDoNumero";

export const ROTULO_DO_ESTADO: Record<EstadoDaConexao, string> = {
  conectado: "Conectado",
  desconectado: "Desconectado",
  pendente: "Pendente na Meta",
};

const COR_DO_ESTADO: Record<EstadoDaConexao, string> = {
  conectado: "bg-[var(--sucesso)]",
  desconectado: "bg-destructive",
  pendente: "bg-[var(--aviso)]",
};

/** Selo de estado: ponto colorido + texto (a cor nunca é a única pista). */
export function SeloDeEstado({
  estado,
  className,
}: {
  estado: EstadoDaConexao;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      <span aria-hidden className={cn("h-2 w-2 rounded-full", COR_DO_ESTADO[estado])} />
      {ROTULO_DO_ESTADO[estado]}
    </span>
  );
}

/** Frase curta do que a Meta disse, para o alerta do cartão. */
export function motivoDoAlerta(saude: SaudeDaConexao): string {
  if (saude.status.nivel === "aviso" || saude.status.nivel === "erro")
    return saude.status.dica ?? saude.status.rotulo;
  return `${saude.envio.rotulo}: veja a aba Saúde da conta.`;
}

/** Cartão de uma conexão. Presentacional: quem abre e quem busca a saúde é a página. */
export function CartaoDeConexao(props: {
  conexao: Conexao;
  saude?: SaudeDaConexao | null;
  onAbrir: () => void;
}) {
  const { conexao: c, saude } = props;
  const estado = estadoEfetivo(c, saude);
  const alerta = pedeAtencao(saude);
  return (
    <button
      type="button"
      onClick={props.onAbrir}
      className="group flex w-full flex-col rounded-xl border bg-background text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-start gap-3 border-b px-4 py-3.5">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
        >
          {c.tipo === "oficial" ? (
            <ShieldCheck className="h-5 w-5" />
          ) : (
            <WhatsAppIcon className="h-5 w-5" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{c.nome}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {c.tipoRotulo} · {c.provedor}
          </span>
        </span>
        {alerta && saude && (
          <span
            role="img"
            aria-label={`Precisa de atenção: ${motivoDoAlerta(saude)}`}
            title={motivoDoAlerta(saude)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--aviso)]/15 text-[var(--aviso)]"
          >
            <AlertTriangle className="h-4 w-4" />
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col gap-2.5 px-4 py-3.5 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Phone className="h-4 w-4 shrink-0" />
          <span className="tabular-nums text-foreground">
            {c.telefone ?? "Número não informado"}
          </span>
        </span>
        {c.oficial?.apenasReceptivo && (
          <span className="text-xs text-muted-foreground">
            Apenas receptivo: só responde a quem escreveu.
          </span>
        )}
        <span className="mt-auto pt-1">
          <SeloDeEstado estado={estado} />
        </span>
      </span>
    </button>
  );
}
