import { ExternalLink, MapPin, UserRound } from "lucide-react";
import type { AnexoDaMensagem } from "../lib/anexosDaMensagem";

/** Localização e contato recebidos, em vez do texto "[Localização]" / "[Contato]". */
export function AnexoDaMensagemView({ anexo }: { anexo: AnexoDaMensagem }) {
  if (anexo.kind === "localizacao") {
    return (
      <div className="min-w-[200px] space-y-1.5">
        <div className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{anexo.nome ?? "Localização"}</p>
            {anexo.endereco && <p className="break-words text-xs opacity-80">{anexo.endereco}</p>}
            <p className="text-xs tabular-nums opacity-70">
              {anexo.latitude.toFixed(5)}, {anexo.longitude.toFixed(5)}
            </p>
          </div>
        </div>
        <a
          href={anexo.mapa}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2"
        >
          Abrir no mapa <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    );
  }
  return (
    <div className="min-w-[200px] space-y-2">
      {anexo.itens.map((c, i) => (
        <div key={i} className="flex items-start gap-2">
          <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p className="font-medium">{c.nome}</p>
            {c.empresa && <p className="text-xs opacity-80">{c.empresa}</p>}
            {c.telefones.map((t) => (
              <p key={t.numero} className="text-xs tabular-nums opacity-90">
                {t.numero}
                {t.rotulo && <span className="opacity-70"> · {t.rotulo}</span>}
              </p>
            ))}
            {c.email && <p className="break-all text-xs opacity-80">{c.email}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
