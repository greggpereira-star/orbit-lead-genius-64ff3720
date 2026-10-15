import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText, ImageOff, Loader2 } from "lucide-react";
import { obterMidiaWhatsApp } from "@/lib/whatsapp-atendimento.functions";
import { temMidia, type MensagemDaConversa } from "../lib/mensagens";

/**
 * Mídia dentro da bolha. A URL assinada vem do servidor (que confere a empresa)
 * e expira em minutos; por isso a consulta é refeita de tempos em tempos e o
 * cache é curto.
 */
export function MidiaDaMensagem({ mensagem }: { mensagem: MensagemDaConversa }) {
  const buscar = useServerFn(obterMidiaWhatsApp);
  const q = useQuery({
    queryKey: ["wa-midia", mensagem.id],
    queryFn: () => buscar({ data: { mensagemId: mensagem.id } }),
    staleTime: 4 * 60_000,
    retry: false,
  });

  if (q.isLoading) {
    return (
      <div className="flex h-24 w-48 items-center justify-center rounded-lg bg-black/10 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if (!q.data || !q.data.ok) {
    const texto = q.data && !q.data.ok ? q.data.texto : "Não foi possível carregar a mídia.";
    return (
      <div className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs">
        <ImageOff className="h-4 w-4 shrink-0" /> {texto}
      </div>
    );
  }

  const { url, nome } = q.data;
  switch (mensagem.type) {
    case "image":
    case "sticker":
      return (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={mensagem.body ?? "Imagem recebida"}
            className="max-h-72 max-w-full rounded-lg object-contain"
            loading="lazy"
          />
        </a>
      );
    case "video":
      return (
        <video src={url} controls preload="metadata" className="max-h-72 max-w-full rounded-lg" />
      );
    case "audio":
      return <audio src={url} controls preload="none" className="w-60 max-w-full" />;
    default:
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-lg bg-black/10 px-3 py-2 text-xs underline-offset-2 hover:underline"
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="truncate">{nome ?? "Documento"}</span>
        </a>
      );
  }
}
