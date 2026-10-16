import { Link } from "@tanstack/react-router";
import { MessageCircle, ShieldCheck, Smartphone, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * `/whatsapp` sem número da API oficial. Antes mostrava a configuração da
 * Evolution (QR code); agora a primeira coisa é conectar o número pela Meta —
 * é o que destrava o atendimento e as automações.
 */
export function ConectarPrimeiro({ onVerLegado }: { onVerLegado: () => void }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
      <div className="space-y-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircle className="h-6 w-6" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Conecte seu WhatsApp</h1>
        <p className="text-muted-foreground">
          Responda cada lead num inbox compartilhado pela equipe, sem tirar o número do aplicativo
          do celular.
        </p>
      </div>

      <ul className="space-y-4 text-sm">
        <li className="flex gap-3">
          <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <strong className="font-medium">Continua no celular.</strong> Com o número no WhatsApp
            Business, as conversas aparecem aqui e no aplicativo.
          </span>
        </li>
        <li className="flex gap-3">
          <Workflow className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <strong className="font-medium">Automações e templates.</strong> Mensagens por etapa do
            funil, com template aprovado fora da janela de 24 h.
          </span>
        </li>
        <li className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <span>
            <strong className="font-medium">API oficial da Meta.</strong> Sem QR code e sem risco de
            bloqueio do número por uso de ferramenta não oficial.
          </span>
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link to="/settings/whatsapp">Conectar número do WhatsApp Business</Link>
        </Button>
        <button
          type="button"
          onClick={onVerLegado}
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          Usar a conexão antiga (QR code)
        </button>
      </div>
    </div>
  );
}
