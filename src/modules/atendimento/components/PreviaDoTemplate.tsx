import { ExternalLink, MessageSquareReply, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatarWhatsApp, type Estilo, type Previa } from "@/lib/whatsapp/cloud/previa";

function Texto({ texto }: { texto: string }) {
  return (
    <>
      {formatarWhatsApp(texto).map((t, i) => {
        const e = t.estilos as Estilo[];
        return (
          <span
            key={i}
            className={cn(
              e.includes("negrito") && "font-bold",
              e.includes("italico") && "italic",
              e.includes("tachado") && "line-through",
              e.includes("mono") && "rounded bg-black/5 px-0.5 font-mono text-[0.92em]",
            )}
          >
            {t.texto}
          </span>
        );
      })}
    </>
  );
}

const ICONE = { URL: ExternalLink, PHONE_NUMBER: Phone, QUICK_REPLY: MessageSquareReply } as const;

/** O template como o cliente o verá numa conversa (aproximação visual). */
export function PreviaDoTemplate({ previa }: { previa: Previa }) {
  const vazio = !previa.corpo.trim() && !previa.cabecalho;
  return (
    <div
      className="rounded-xl bg-[#ece5dd] p-4 dark:bg-muted"
      role="img"
      aria-label="Pré-visualização do template"
    >
      <div className="ml-auto max-w-[85%] space-y-1">
        <div className="rounded-lg rounded-tr-none bg-white p-2.5 text-sm shadow-sm dark:bg-background">
          {vazio ? (
            <p className="text-muted-foreground">A mensagem aparece aqui enquanto você escreve.</p>
          ) : (
            <>
              {previa.cabecalho && (
                <p className="mb-1 font-semibold">
                  <Texto texto={previa.cabecalho} />
                </p>
              )}
              <p className="whitespace-pre-wrap break-words">
                <Texto texto={previa.corpo} />
              </p>
              {previa.rodape && (
                <p className="mt-1.5 text-xs text-muted-foreground">{previa.rodape}</p>
              )}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">12:00</p>
            </>
          )}
        </div>
        {previa.botoes.map((b, i) => {
          const Icone = ICONE[b.tipo as keyof typeof ICONE] ?? MessageSquareReply;
          return (
            <div
              key={i}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-sky-600 shadow-sm dark:bg-background"
            >
              <Icone className="h-3.5 w-3.5" /> {b.texto}
            </div>
          );
        })}
      </div>
    </div>
  );
}
